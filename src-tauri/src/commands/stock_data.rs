use crate::cache::StockCache;
use crate::database::Database;
use crate::stock_api::{fetch_stock_history, fetch_stock_quote, fetch_time_series, StockData, StockDataBundle, StockQuote, utils::is_trading_hours};
use crate::stock_api::prediction_similarity::{find_similar_patterns, SimilarityResult};
use chrono::Local;
use std::sync::Arc;
use tauri::State;

fn get_latest_day_data(data: &[StockData]) -> Vec<StockData> {
    if data.is_empty() {
        return vec![];
    }
    
    let mut sorted = data.to_vec();
    sorted.sort_by(|a, b| b.date.cmp(&a.date));
    
    if let Some(first_item) = sorted.first() {
        let last_date = if first_item.date.contains(" ") {
            first_item.date.split(" ").next().unwrap_or("").to_string()
        } else {
            first_item.date.chars().take(10).collect()
        };
        
        // Reverse back to chronological order for the chart
        let mut daily_data: Vec<StockData> = sorted.into_iter()
            .filter(|d| {
                let d_date = if d.date.contains(" ") {
                    d.date.split(" ").next().unwrap_or("")
                } else {
                    &d.date[..d.date.len().min(10)]
                };
                d_date == last_date
            })
            .collect();
            
        daily_data.sort_by(|a, b| a.date.cmp(&b.date));
        daily_data
    } else {
        vec![]
    }
}

#[tauri::command]
pub async fn get_stock_quote(
    symbol: String,
    cache: State<'_, Arc<StockCache>>,
    _db: State<'_, Arc<Database>>,
) -> Result<StockQuote, String> {
    if let Some(cached_quote) = cache.get_quote(&symbol).await {
        return Ok(cached_quote);
    }
    
    let quote = fetch_stock_quote(&symbol).await?;
    cache.set_quote(symbol, quote.clone()).await;
    
    Ok(quote)
}

#[tauri::command]
pub async fn get_all_favorites_quotes(
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<(crate::stock_api::StockInfo, Option<StockQuote>)>, String> {
    let stocks = db.get_stocks_by_group(None)
        .map_err(|e| format!("Failed to get stocks: {}", e))?;
    
    let excluded_symbols = ["000001", "399001", "399006"];
    
    let filtered_stocks: Vec<_> = stocks
        .into_iter()
        .filter(|stock| !excluded_symbols.contains(&stock.symbol.as_str()))
        .collect();
    
    let mut quotes_map = std::collections::HashMap::new();
    let mut symbols_to_fetch = Vec::new();
    
    for stock in &filtered_stocks {
        if let Some(cached_quote) = cache.get_quote(&stock.symbol).await {
            quotes_map.insert(stock.symbol.clone(), Some(cached_quote));
        } else {
            symbols_to_fetch.push(stock.symbol.clone());
        }
    }
    
    let mut tasks = Vec::new();
    for symbol in symbols_to_fetch {
        let symbol_clone: String = symbol.clone();
        let cache_clone = cache.inner().clone();
        let task = tokio::spawn(async move {
            match fetch_stock_quote(&symbol_clone).await {
                Ok(quote) => {
                    cache_clone.set_quote(symbol_clone.clone(), quote.clone()).await;
                    (symbol_clone, Some(quote))
                }
                Err(err) => {
                    eprintln!("Failed to fetch quote for {}: {}", symbol_clone, err);
                    (symbol_clone, None)
                }
            }
        });
        tasks.push(task);
    }
    
    for task in tasks {
        match task.await {
            Ok((symbol, quote)) => {
                quotes_map.insert(symbol, quote);
            }
            Err(err) => {
                eprintln!("Task error: {}", err);
            }
        }
    }
    
    let mut result = Vec::new();
    for stock in filtered_stocks {
        let quote = quotes_map.remove(&stock.symbol);
        result.push((stock, quote.flatten()));
    }

    Ok(result)
}

#[tauri::command]
pub async fn get_similarity_prediction(
    symbol: String,
    period: String, // "daily", "weekly", etc.
    lookback_window: usize,
    forecast_horizon: usize,
    cache: State<'_, Arc<StockCache>>,
) -> Result<Vec<SimilarityResult>, String> {
    let klt = match period.as_str() {
        "daily" => "101",
        "weekly" => "102",
        "monthly" => "103",
        _ => "101",
    };

    let data = if let Some(cached) = cache.get_history(&symbol, klt).await {
        cached
    } else {
        // Fetch if not in cache (though usually it should be)
        fetch_stock_history(&symbol, klt).await.map_err(|e| e.to_string())?
    };

    let results = find_similar_patterns(&data, lookback_window, forecast_horizon, 5);
    Ok(results)
}

#[tauri::command]
pub async fn get_stock_history(
    symbol: String,
    period: String,
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<StockData>, String> {
    if let Some(cached_data) = cache.get_history(&symbol, &period).await {
        return Ok(cached_data);
    }

    let latest_date = db
        .get_latest_kline_date(&symbol, &period)
        .map_err(|e| format!("Database error: {}", e))?;

    let cached = db
        .get_kline(&symbol, &period, None)
        .map_err(|e| format!("Database error: {}", e))?;

    let skip_network = !cached.is_empty()
        && !cache
            .should_fetch_from_network(&symbol, &period, 600)
            .await;

    if skip_network {
        cache
            .set_history(symbol.clone(), period.clone(), cached.clone())
            .await;
        return Ok(cached);
    }

    let fetched = fetch_stock_history(&symbol, &period).await?;
    cache.record_fetch_time(&symbol, &period).await;

    let result = if let Some(ref latest) = latest_date {
        let new_data: Vec<StockData> = fetched
            .into_iter()
            .filter(|d| d.date > *latest)
            .collect();

        if !new_data.is_empty() {
            let mut data = cached;
            data.extend(new_data);
            data.sort_by(|a, b| a.date.cmp(&b.date));
            let final_data = data.clone();
            cache
                .set_history(symbol.clone(), period.clone(), final_data)
                .await;
            data
        } else {
            if !cached.is_empty() {
                cache
                    .set_history(symbol.clone(), period.clone(), cached.clone())
                    .await;
            }
            cached
        }
    } else {
        cache
            .set_history(symbol.clone(), period.clone(), fetched.clone())
            .await;
        fetched
    };

    Ok(result)
}

#[tauri::command]
pub async fn get_time_series(
    symbol: String,
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<StockData>, String> {
    if let Some(cached_data) = cache.get_time_series(&symbol).await {
        return Ok(cached_data);
    }
    
    let fetched = fetch_time_series(&symbol).await;
    
    match fetched {
        Ok(fetched_data) if !fetched_data.is_empty() => {
            cache.set_time_series(symbol, fetched_data.clone()).await;
            Ok(fetched_data)
        }
        Err(e) => {
            let cached = db.get_time_series(&symbol, None)
                .map_err(|_| format!("API error: {}; Database error", e))?;
            if !cached.is_empty() {
                cache.set_time_series(symbol, cached.clone()).await;
                Ok(cached)
            } else {
                Err(format!("API error: {}; No cached data available", e))
            }
        }
        _ => {
            let cached = db.get_time_series(&symbol, None)
                .map_err(|e| format!("Database error: {}", e))?;
            if !cached.is_empty() {
                cache.set_time_series(symbol, cached.clone()).await;
                Ok(cached)
            } else {
                Ok(vec![])
            }
        }
    }
}

#[tauri::command]
pub async fn get_batch_time_series(
    symbols: Vec<String>,
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<std::collections::HashMap<String, Vec<StockData>>, String> {
    if symbols.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    
    let cached_data = cache.get_batch_time_series(&symbols).await;
    let mut result = cached_data.clone();
    
    let symbols_to_fetch: Vec<String> = symbols.iter()
        .filter(|s| !result.contains_key(*s))
        .cloned()
        .collect();
    
    if symbols_to_fetch.is_empty() {
        return Ok(result);
    }
    
    let db_data = db.get_batch_time_series(&symbols_to_fetch, None)
        .map_err(|e| format!("Database error: {}", e))?;
    
    for (symbol, data) in db_data {
        if !data.is_empty() {
            cache.set_time_series(symbol.clone(), data.clone()).await;
            result.insert(symbol, data);
        }
    }
    
    Ok(result)
}

#[tauri::command]
pub async fn get_intraday_time_series(
    symbol: String,
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<StockData>, String> {
    let today = Local::now().format("%Y-%m-%d").to_string();
    
    if let Some(cached_data) = cache.get_history(&symbol, "5m").await {
        let has_today_data = cached_data.iter().any(|d| d.date.starts_with(&today));
        if has_today_data {
            let today_data: Vec<StockData> = cached_data.into_iter()
                .filter(|d| d.date.starts_with(&today))
                .collect();
            return Ok(today_data);
        }
    }
    
    let cached = db.get_kline(&symbol, "5m", None)
        .map_err(|e| format!("Database error: {}", e))?;
    
    let latest_date = db.get_latest_kline_date(&symbol, "5m")
        .map_err(|e| format!("Database error: {}", e))?;
    
    let should_fetch = if is_trading_hours() {
        true
    } else {
        cache.should_fetch_from_network(&symbol, "5m", 600).await
    };
    
    let result = if should_fetch {
        let fetched = fetch_stock_history(&symbol, "5m").await?;
        
        cache.record_fetch_time(&symbol, "5m").await;
        
        if let Some(ref latest) = latest_date {
            let new_data: Vec<StockData> = fetched
                .into_iter()
                .filter(|d| d.date > *latest)
                .collect();
            
            if !new_data.is_empty() {
                let mut data = cached;
                data.extend(new_data);
                data.sort_by(|a, b| a.date.cmp(&b.date));
                let final_data = data.clone();
                cache.set_history(symbol.clone(), "5m".to_string(), final_data).await;
                data
            } else {
                if !cached.is_empty() {
                    cache.set_history(symbol.clone(), "5m".to_string(), cached.clone()).await;
                }
                cached
            }
        } else {
            cache.set_history(symbol.clone(), "5m".to_string(), fetched.clone()).await;
            fetched
        }
    } else {
        if !cached.is_empty() {
            cache.set_history(symbol.clone(), "5m".to_string(), cached.clone()).await;
        }
        cached
    };
    
    let today_data: Vec<StockData> = result.into_iter()
        .filter(|d| d.date.starts_with(&today))
        .collect();
    
    if today_data.is_empty() {
        let cached_all = cache.get_history(&symbol, "5m").await
            .unwrap_or_else(|| db.get_kline(&symbol, "5m", None).unwrap_or_default());
        
        if !cached_all.is_empty() {
            let final_data = get_latest_day_data(&cached_all);
            if !final_data.is_empty() {
                return Ok(final_data);
            }
        }
    }
    
    Ok(today_data)
}

#[tauri::command]
pub async fn get_stock_data_bundle(
    symbol: String,
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<StockDataBundle, String> {
    let quote = match cache.get_quote(&symbol).await {
        Some(q) => Some(q),
        None => {
            match fetch_stock_quote(&symbol).await {
                Ok(q) => {
                    cache.set_quote(symbol.clone(), q.clone()).await;
                    Some(q)
                }
                Err(_) => None,
            }
        }
    };

    let time_series = match cache.get_time_series(&symbol).await {
        Some(data) => data,
        None => {
            match fetch_time_series(&symbol).await {
                Ok(data) if !data.is_empty() => {
                    cache.set_time_series(symbol.clone(), data.clone()).await;
                    data
                }
                _ => {
                    db.get_time_series(&symbol, None)
                        .unwrap_or_default()
                }
            }
        }
    };

    let today = Local::now().format("%Y-%m-%d").to_string();
    let intraday = {
        let today_data: Vec<StockData> = time_series.iter()
            .filter(|d| d.date.starts_with(&today))
            .cloned()
            .collect();
        
        if !today_data.is_empty() {
            today_data
        } else {
            get_latest_day_data(&time_series)
        }
    };

    Ok(StockDataBundle {
        symbol,
        quote,
        time_series,
        intraday,
    })
}

#[tauri::command]
pub async fn get_batch_stock_data_bundle(
    symbols: Vec<String>,
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<std::collections::HashMap<String, StockDataBundle>, String> {
    if symbols.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    
    let mut result = std::collections::HashMap::new();
    let today = Local::now().format("%Y-%m-%d").to_string();
    
    for symbol in symbols {
        let quote = match cache.get_quote(&symbol).await {
            Some(q) => Some(q),
            None => {
                match fetch_stock_quote(&symbol).await {
                    Ok(q) => {
                        cache.set_quote(symbol.clone(), q.clone()).await;
                        Some(q)
                    }
                    Err(_) => None,
                }
            }
        };
        
        let time_series = match cache.get_time_series(&symbol).await {
            Some(data) => data,
            None => {
                match fetch_time_series(&symbol).await {
                    Ok(data) if !data.is_empty() => {
                        cache.set_time_series(symbol.clone(), data.clone()).await;
                        data
                    }
                    _ => {
                        db.get_time_series(&symbol, None).unwrap_or_default()
                    }
                }
            }
        };
        
        let intraday = {
            let today_data: Vec<StockData> = time_series.iter()
                .filter(|d| d.date.starts_with(&today))
                .cloned()
                .collect();
            
            if !today_data.is_empty() {
                today_data
            } else {
                get_latest_day_data(&time_series)
            }
        };
        
        result.insert(symbol.clone(), StockDataBundle {
            symbol: symbol.clone(),
            quote,
            time_series,
            intraday,
        });
        
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }
    
    Ok(result)
}

#[tauri::command]
pub async fn get_batch_intraday_time_series(
    symbols: Vec<String>,
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<std::collections::HashMap<String, Vec<StockData>>, String> {
    if symbols.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    
    let today = Local::now().format("%Y-%m-%d").to_string();
    let mut result = std::collections::HashMap::new();
    
    let mut need_fetch = Vec::new();
    for symbol in &symbols {
        if let Some(cached_data) = cache.get_history(symbol, "5m").await {
            let has_today_data = cached_data.iter().any(|d| d.date.starts_with(&today));
            if has_today_data {
                let today_data: Vec<StockData> = cached_data.into_iter()
                    .filter(|d| d.date.starts_with(&today))
                    .collect();
                if !today_data.is_empty() {
                    result.insert(symbol.clone(), today_data);
                    continue;
                }
            }
        }
        need_fetch.push(symbol.clone());
    }
    
    if need_fetch.is_empty() {
        return Ok(result);
    }
    
    for symbol in need_fetch {
        let latest_date = db.get_latest_kline_date(&symbol, "5m")
            .map_err(|e| format!("Database error: {}", e))?;
        
        let cached = db.get_kline(&symbol, "5m", None)
            .map_err(|e| format!("Database error: {}", e))?;
        
        let should_fetch = if is_trading_hours() {
            true
        } else {
            cache.should_fetch_from_network(&symbol, "5m", 600).await
        };
        
        let merged_data = if should_fetch {
            match fetch_stock_history(&symbol, "5m").await {
                Ok(fetched) => {
                    cache.record_fetch_time(&symbol, "5m").await;
                    
                    if let Some(ref latest) = latest_date {
                        let new_data: Vec<StockData> = fetched
                            .into_iter()
                            .filter(|d| d.date > *latest)
                            .collect();
                        
                        if !new_data.is_empty() {
                            let mut data = cached;
                            data.extend(new_data);
                            data.sort_by(|a, b| a.date.cmp(&b.date));
                            let final_data = data.clone();
                            cache.set_history(symbol.clone(), "5m".to_string(), final_data).await;
                            data
                        } else {
                            if !cached.is_empty() {
                                cache.set_history(symbol.clone(), "5m".to_string(), cached.clone()).await;
                            }
                            cached
                        }
                    } else {
                        cache.set_history(symbol.clone(), "5m".to_string(), fetched.clone()).await;
                        fetched
                    }
                }
                Err(e) => {
                    eprintln!("Failed to fetch intraday data for {}: {}", symbol, e);
                    cached
                }
            }
        } else {
            if !cached.is_empty() {
                cache.set_history(symbol.clone(), "5m".to_string(), cached.clone()).await;
            }
            cached
        };
        
        let today_data: Vec<StockData> = merged_data.iter()
            .filter(|d| d.date.starts_with(&today))
            .cloned()
            .collect();
        
        let final_data = if today_data.is_empty() {
            let mut sorted = merged_data;
            sorted.sort_by(|a, b| b.date.cmp(&a.date));
            
            if let Some(first_item) = sorted.first() {
                let last_date = if first_item.date.contains(" ") {
                    first_item.date.split(" ").next().unwrap_or("").to_string()
                } else {
                    first_item.date.chars().take(10).collect()
                };
                
                sorted.into_iter()
                    .filter(|d| {
                        let d_date = if d.date.contains(" ") {
                            d.date.split(" ").next().unwrap_or("")
                        } else {
                            &d.date[..d.date.len().min(10)]
                        };
                        d_date == last_date
                    })
                    .collect()
            } else {
                Vec::new()
            }
        } else {
            today_data
        };
        
        if !final_data.is_empty() {
            result.insert(symbol, final_data);
        }
        
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }
    
    Ok(result)
}
