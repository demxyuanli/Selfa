use crate::cache::StockCache;
use crate::database::{Database, run_blocking_db};
use crate::stock_api::{fetch_stock_history, fetch_stock_quote, fetch_time_series, get_related_sectors, StockData, StockDataBundle, StockQuote, utils::{is_trading_hours, parse_date, parse_datetime}};
use tokio::sync::Semaphore;
use crate::stock_api::prediction_similarity::{find_similar_patterns, SimilarityPredictionResponse, TargetPattern};
use crate::stock_api::chip_analysis::{calculate_chip_distribution, ChipAnalysisResult};
use chrono::{Local, Timelike};
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

fn is_day_period(period: &str) -> bool {
    matches!(period, "1d" | "1w" | "1mo" | "1y" | "2y" | "5y")
}

fn kline_limit_for_period(period: &str) -> i32 {
    match period {
        "1m" => 240,
        "5m" => 240,
        "30m" => 240,
        "60m" => 240,
        "120m" => 240,
        "5d" => 1200,
        "1d" => 240,
        "1w" => 240,
        "1mo" => 240,
        "1y" => 365,
        "2y" => 24,
        "5y" => 60,
        _ => 240,
    }
}

#[tauri::command]
pub async fn get_stock_sectors(
    symbol: String,
) -> Result<Vec<crate::stock_api::SectorInfo>, String> {
    get_related_sectors(&symbol).await
}

#[tauri::command]
pub async fn get_stock_quote(
    symbol: String,
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<StockQuote, String> {
    if let Some(cached_quote) = cache.get_quote(&symbol).await {
        return Ok(cached_quote);
    }

    let in_trading = is_trading_hours();
    let min_interval_seconds = if in_trading { 60 } else { 24 * 60 * 60 };
    let should_fetch = cache
        .should_fetch_from_network_with_policy(&symbol, "quote", min_interval_seconds, in_trading)
        .await;
    if !should_fetch {
        let db_clone = db.inner().clone();
        let sym = symbol.clone();
        if let Ok(Some(q)) = run_blocking_db(move || db_clone.get_quote(&sym)) {
            cache.set_quote(symbol, q.clone()).await;
            return Ok(q);
        }
    }
    let fetch_result = if in_trading {
        match tokio::time::timeout(
            std::time::Duration::from_secs(4),
            fetch_stock_quote(&symbol),
        )
        .await
        {
            Ok(r) => r,
            Err(_) => Err("Network timeout".to_string()),
        }
    } else {
        fetch_stock_quote(&symbol).await
    };

    match fetch_result {
        Ok(quote) => {
            cache.record_fetch_time(&symbol, "quote").await;
            cache.set_quote(symbol, quote.clone()).await;
            Ok(quote)
        }
        Err(err) => {
            let db_clone = db.inner().clone();
            let sym = symbol.clone();
            if let Ok(Some(q)) = run_blocking_db(move || db_clone.get_quote(&sym)) {
                cache.set_quote(symbol, q.clone()).await;
                Ok(q)
            } else {
                Err(err)
            }
        }
    }
}

const MAX_CONCURRENT_FETCHES: usize = 8;

#[tauri::command]
pub async fn get_all_favorites_quotes(
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<(crate::stock_api::StockInfo, Option<StockQuote>)>, String> {
    let db_clone = db.inner().clone();
    let stocks = run_blocking_db(move || db_clone.get_stocks_by_group(None))
        .map_err(|e| format!("Failed to get stocks: {}", e))?;
    let excluded_symbols = ["000001", "399001", "399006"];
    let filtered_stocks: Vec<_> = stocks
        .into_iter()
        .filter(|stock| !excluded_symbols.contains(&stock.symbol.as_str()))
        .collect();
    let mut quotes_map = std::collections::HashMap::new();
    let mut symbols_to_fetch = Vec::new();
    let mut symbols_to_read_db = Vec::new();
    let in_trading = is_trading_hours();
    for stock in &filtered_stocks {
        if let Some(cached_quote) = cache.get_quote(&stock.symbol).await {
            quotes_map.insert(stock.symbol.clone(), Some(cached_quote));
        } else {
            let should_fetch = cache
                .should_fetch_from_network_with_policy(
                    &stock.symbol,
                    "quote",
                    if in_trading { 60 } else { 24 * 60 * 60 },
                    in_trading,
                )
                .await;
            if should_fetch {
                symbols_to_fetch.push(stock.symbol.clone());
            } else {
                symbols_to_read_db.push(stock.symbol.clone());
            }
        }
    }
    if !symbols_to_read_db.is_empty() {
        let db_clone = db.inner().clone();
        let symbols = symbols_to_read_db.clone();
        let db_quotes = run_blocking_db(move || {
            let mut m = std::collections::HashMap::new();
            for s in symbols {
                if let Ok(Some(q)) = db_clone.get_quote(&s) {
                    m.insert(s, q);
                }
            }
            m
        });
        for (symbol, quote) in db_quotes {
            cache.set_quote(symbol.clone(), quote.clone()).await;
            quotes_map.insert(symbol, Some(quote));
        }
    }
    let sem = Arc::new(Semaphore::new(MAX_CONCURRENT_FETCHES));
    let mut tasks = Vec::new();
    for symbol in symbols_to_fetch {
        let symbol_clone = symbol.clone();
        let cache_clone = cache.inner().clone();
        let sem_clone = sem.clone();
        let in_trading_clone = in_trading;
        let task = tokio::spawn(async move {
            let _permit = sem_clone.acquire().await;
            let fetch_result = if in_trading_clone {
                match tokio::time::timeout(
                    std::time::Duration::from_secs(4),
                    fetch_stock_quote(&symbol_clone),
                )
                .await
                {
                    Ok(r) => r,
                    Err(_) => Err("Network timeout".to_string()),
                }
            } else {
                fetch_stock_quote(&symbol_clone).await
            };

            match fetch_result {
                Ok(quote) => {
                    cache_clone.record_fetch_time(&symbol_clone, "quote").await;
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
            Ok((symbol, quote)) => { quotes_map.insert(symbol, quote); }
            Err(e) => eprintln!("Quote fetch task error: {}", e),
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
pub async fn get_chip_analysis(
    symbol: String,
    decay_method: Option<String>, // "fixed" or "dynamic"
    decay_factor: Option<f64>,    // For fixed: 0.8-0.99, For dynamic: 0.5-2.0 (decay coefficient A)
    distribution_type: Option<String>, // "uniform" or "triangular"
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<ChipAnalysisResult>, String> {
    use crate::stock_api::chip_analysis::{DecayMethod, DistributionType};
    
    let period = "1d".to_string();
    
    // Parse parameters with defaults
    let method = match decay_method.as_deref() {
        Some("dynamic") => DecayMethod::Dynamic,
        _ => DecayMethod::Fixed,
    };
    
    let factor = match method {
        DecayMethod::Fixed => decay_factor.unwrap_or(0.97), // Default fixed decay
        DecayMethod::Dynamic => decay_factor.unwrap_or(1.0), // Default decay coefficient A=1.0
    };
    
    let dist_type = match distribution_type.as_deref() {
        Some("triangular") => DistributionType::Triangular,
        _ => DistributionType::Uniform,
    };
    
    let history = if let Some(cached) = cache.get_history(&symbol, &period).await {
        cached
    } else {
        let symbol_ref = symbol.clone();
        let period_ref = period.clone();
        let db_clone = db.inner().clone();
        let (db_data, latest_date) = run_blocking_db(move || {
            let d = db_clone.get_kline(&symbol_ref, &period_ref, None).unwrap_or_default();
            let l = db_clone.get_latest_kline_date(&symbol_ref, &period_ref).unwrap_or(None);
            (d, l)
        });
        let should_fetch = if db_data.is_empty() {
            true
        } else {
            cache
                .should_fetch_from_network_with_policy(
                    &symbol,
                    &period,
                    if is_trading_hours() { 600 } else { 24 * 60 * 60 },
                    false,
                )
                .await
        };
        
        if should_fetch {
            match fetch_stock_history(&symbol, &period).await {
                Ok(fetched) => {
                    cache.record_fetch_time(&symbol, &period).await;
                    
                    if let Some(ref latest) = latest_date {
                        let new_data: Vec<StockData> = fetched
                            .into_iter()
                            .filter(|d| d.date >= *latest)
                            .collect();
                        
                        if !new_data.is_empty() {
                            let mut data: Vec<StockData> = db_data
                                .into_iter()
                                .filter(|d| d.date < *latest)
                                .collect();
                            data.extend(new_data);
                            data.sort_by(|a, b| a.date.cmp(&b.date));
                            cache.set_history(symbol.clone(), period.clone(), data.clone()).await;
                            data
                        } else {
                            if !db_data.is_empty() {
                                cache.set_history(symbol.clone(), period.clone(), db_data.clone()).await;
                            }
                            db_data
                        }
                    } else {
                        cache.set_history(symbol.clone(), period.clone(), fetched.clone()).await;
                        fetched
                    }
                }
                Err(_) => {
                    // Fallback to DB if fetch fails
                    if !db_data.is_empty() {
                        cache.set_history(symbol.clone(), period.clone(), db_data.clone()).await;
                        db_data
                    } else {
                        return Err("Failed to fetch data and no cached data".to_string());
                    }
                }
            }
        } else {
            cache.set_history(symbol.clone(), period.clone(), db_data.clone()).await;
            db_data
        }
    };
    
    if history.is_empty() {
        return Err("No data available for chip analysis".to_string());
    }
    
    // Calculate Chip Distribution with selected method
    let result = calculate_chip_distribution(
        &history, 
        method, 
        factor, 
        dist_type,
        true, // include_distribution: include detailed price_levels and chip_amounts
        100,  // price_bins: number of bins for distribution
    );
    Ok(result)
}

#[tauri::command]
pub async fn get_similarity_prediction(
    symbol: String,
    period: String, // "daily", "weekly", etc.
    lookback_window: usize,
    forecast_horizon: usize,
    top_n: Option<usize>,
    cache: State<'_, Arc<StockCache>>,
) -> Result<SimilarityPredictionResponse, String> {
    let klt = match period.as_str() {
        "daily" => "101",
        "weekly" => "102",
        "monthly" => "103",
        _ => "101",
    };

    let data = if let Some(cached) = cache.get_history(&symbol, klt).await {
        cached
    } else {
        fetch_stock_history(&symbol, klt).await.map_err(|e| e.to_string())?
    };

    let n = top_n.unwrap_or(5).clamp(1, 20);
    match find_similar_patterns(&data, lookback_window, forecast_horizon, n) {
        Some(resp) => Ok(resp),
        None => Ok(SimilarityPredictionResponse {
            target_pattern: TargetPattern {
                dates: vec![],
                closes: vec![],
            },
            matches: vec![],
        }),
    }
}

#[tauri::command]
pub async fn get_stock_history(
    symbol: String,
    period: String,
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<StockData>, String> {
    let cached_data = cache.get_history(&symbol, &period).await;
    let db_clone = db.inner().clone();
    let sym = symbol.clone();
    let per = period.clone();
    let db_limit = kline_limit_for_period(&period);
    let (latest_date_db, db_cached) = run_blocking_db(move || {
        let latest = db_clone.get_latest_kline_date(&sym, &per).map_err(|e| e.to_string())?;
        let c = db_clone.get_kline(&sym, &per, Some(db_limit)).map_err(|e| e.to_string())?;
        Ok::<_, String>((latest, c))
    }).map_err(|e| format!("Database error: {}", e))?;
    let cached = cached_data.unwrap_or(db_cached.clone());
    let latest_date = latest_date_db.or_else(|| cached.iter().map(|d| d.date.clone()).max());

    let in_trading = is_trading_hours();
    let latest_day = latest_date
        .as_ref()
        .and_then(|d| parse_date(d).ok());
    let today = Local::now().date_naive();
    let day_period = is_day_period(&period);
    let force_fetch = day_period && latest_day.map(|d| d < today).unwrap_or(false);
    let latest_is_today = day_period && latest_day.map(|d| d == today).unwrap_or(false);
    let min_interval_seconds = if latest_is_today { 60 } else if in_trading { 60 } else { 24 * 60 * 60 };
    let should_fetch = if force_fetch {
        true
    } else {
        cache
            .should_fetch_from_network_with_policy(
                &symbol,
                &period,
                min_interval_seconds,
                false,
            )
            .await
    };
    let skip_network = !cached.is_empty() && !should_fetch;

    if skip_network {
        cache
            .set_history(symbol.clone(), period.clone(), cached.clone())
            .await;
        return Ok(cached);
    }

    // Try to fetch from network, fallback to DB on error
    match fetch_stock_history(&symbol, &period).await {
        Ok(fetched) => {
            cache.record_fetch_time(&symbol, &period).await;

            let result = if let Some(ref latest) = latest_date {
                let new_data: Vec<StockData> = fetched
                    .into_iter()
                    .filter(|d| d.date >= *latest)
                    .collect();

                if !new_data.is_empty() {
                    let mut data: Vec<StockData> = cached
                        .into_iter()
                        .filter(|d| d.date < *latest)
                        .collect();
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
        Err(e) => {
            // Fallback to database data on network error
            if !cached.is_empty() {
                cache
                    .set_history(symbol.clone(), period.clone(), cached.clone())
                    .await;
                Ok(cached)
            } else {
                Err(format!("Network error: {}; No cached data available", e))
            }
        }
    }
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

    let db_clone = db.inner().clone();
    let sym = symbol.clone();
    let db_data = run_blocking_db(move || db_clone.get_time_series(&sym, None))
        .map_err(|e| format!("Database error: {}", e))?;

    let in_trading = is_trading_hours();
    let min_interval_seconds = if in_trading { 60 } else { 24 * 60 * 60 };
    let should_fetch = if db_data.is_empty() {
        true
    } else {
        cache
            .should_fetch_from_network_with_policy(&symbol, "time_series", min_interval_seconds, in_trading)
            .await
    };

    if should_fetch {
        let fetch_result = if in_trading {
            match tokio::time::timeout(
                std::time::Duration::from_secs(6),
                fetch_time_series(&symbol),
            )
            .await
            {
                Ok(r) => r,
                Err(_) => Err("Network timeout".to_string()),
            }
        } else {
            fetch_time_series(&symbol).await
        };

        match fetch_result {
            Ok(fetched_data) if !fetched_data.is_empty() => {
                cache.record_fetch_time(&symbol, "time_series").await;
                cache.set_time_series(symbol, fetched_data.clone()).await;
                return Ok(fetched_data);
            }
            Err(e) => {
                if db_data.is_empty() {
                    return Err(format!("API error: {}; No cached data available", e));
                }
            }
            _ => {}
        }
    }

    if !db_data.is_empty() {
        cache.set_time_series(symbol, db_data.clone()).await;
        Ok(db_data)
    } else {
        Ok(vec![])
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
    let db_clone = db.inner().clone();
    let to_fetch = symbols_to_fetch.clone();
    let db_data = run_blocking_db(move || db_clone.get_batch_time_series(&to_fetch, None))
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
fn is_trading_time(datetime_str: &str) -> bool {
    if let Ok(dt) = parse_datetime(datetime_str) {
        let hour = dt.hour();
        let minute = dt.minute();
        let total_minutes = hour * 60 + minute;
        
        (total_minutes >= 570 && total_minutes <= 690) || (total_minutes >= 780 && total_minutes <= 900)
    } else {
        false
    }
}

fn filter_trading_hours_data(data: Vec<StockData>) -> Vec<StockData> {
    data.into_iter()
        .filter(|d| is_trading_time(&d.date))
        .collect()
}

#[tauri::command]
pub async fn get_intraday_time_series(
    symbol: String,
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<StockData>, String> {
    let today = Local::now().format("%Y-%m-%d").to_string();
    
    let db_clone = db.inner().clone();
    let sym = symbol.clone();
    let (cached, latest_date) = run_blocking_db(move || {
        let c = db_clone.get_kline(&sym, "1m", None).map_err(|e| e.to_string())?;
        let l = db_clone.get_latest_kline_date(&sym, "1m").map_err(|e| e.to_string())?;
        Ok::<_, String>((c, l))
    }).map_err(|e| format!("Database error: {}", e))?;
    let in_trading = is_trading_hours();
    let min_interval_seconds = if in_trading { 60 } else { 24 * 60 * 60 };
    let should_fetch = if cached.is_empty() {
        true
    } else {
        cache
            .should_fetch_from_network_with_policy(&symbol, "1m", min_interval_seconds, in_trading)
            .await
    };
    
    // If we have cached data with today's data and don't need to fetch, return early
    if !should_fetch {
        if let Some(cached_data) = cache.get_history(&symbol, "1m").await {
            let has_today_data = cached_data.iter().any(|d| d.date.starts_with(&today));
            if has_today_data {
                let today_data: Vec<StockData> = cached_data.iter()
                    .filter(|d| d.date.starts_with(&today))
                    .cloned()
                    .collect();
                return Ok(filter_trading_hours_data(today_data));
            }
        }
        // Fallback to DB cached data if cache doesn't have today's data
        let today_data: Vec<StockData> = cached.iter()
            .filter(|d| d.date.starts_with(&today))
            .cloned()
            .collect();
        if !today_data.is_empty() {
            return Ok(filter_trading_hours_data(today_data));
        }
    }
    
    let result = if should_fetch {
        let fetched = fetch_stock_history(&symbol, "1m").await?;
        
        cache.record_fetch_time(&symbol, "1m").await;
        
        if let Some(ref latest) = latest_date {
            let new_data: Vec<StockData> = fetched
                .into_iter()
                .filter(|d| d.date >= *latest)
                .collect();
            
            if !new_data.is_empty() {
                let mut data: Vec<StockData> = cached
                    .into_iter()
                    .filter(|d| d.date < *latest)
                    .collect();
                data.extend(new_data);
                data.sort_by(|a, b| a.date.cmp(&b.date));
                let final_data = data.clone();
                cache.set_history(symbol.clone(), "1m".to_string(), final_data).await;
                data
            } else {
                if !cached.is_empty() {
                    cache.set_history(symbol.clone(), "1m".to_string(), cached.clone()).await;
                }
                cached
            }
        } else {
            cache.set_history(symbol.clone(), "1m".to_string(), fetched.clone()).await;
            fetched
        }
    } else {
        if !cached.is_empty() {
            cache.set_history(symbol.clone(), "1m".to_string(), cached.clone()).await;
        }
        cached
    };
    
    let today_data: Vec<StockData> = result.into_iter()
        .filter(|d| d.date.starts_with(&today))
        .collect();
    
    let filtered_data = filter_trading_hours_data(today_data);
    
    if filtered_data.is_empty() {
        let cached_all = cache.get_history(&symbol, "1m").await.unwrap_or_else(|| {
            let db_clone = db.inner().clone();
            let sym = symbol.clone();
            run_blocking_db(move || db_clone.get_kline(&sym, "1m", None).unwrap_or_default())
        });
        
        if !cached_all.is_empty() {
            let final_data = get_latest_day_data(&cached_all);
            if !final_data.is_empty() {
                return Ok(filter_trading_hours_data(final_data));
            }
        }
    }
    
    Ok(filtered_data)
}

#[tauri::command]
pub async fn get_stock_data_bundle(
    symbol: String,
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<StockDataBundle, String> {
    let in_trading = is_trading_hours();

    let quote = match cache.get_quote(&symbol).await {
        Some(q) => Some(q),
        None => {
            let min_interval_seconds = if in_trading { 60 } else { 24 * 60 * 60 };
            let should_fetch = cache
                .should_fetch_from_network_with_policy(&symbol, "quote", min_interval_seconds, in_trading)
                .await;
            if !should_fetch {
                let db_clone = db.inner().clone();
                let sym = symbol.clone();
                if let Ok(Some(q)) = run_blocking_db(move || db_clone.get_quote(&sym)) {
                    cache.set_quote(symbol.clone(), q.clone()).await;
                    Some(q)
                } else {
                    None
                }
            } else {
                None
            }
        }
    }
    .or_else(|| None);

    let quote = match quote {
        Some(q) => Some(q),
        None => {
            let fetch_result = if in_trading {
                match tokio::time::timeout(
                    std::time::Duration::from_secs(4),
                    fetch_stock_quote(&symbol),
                )
                .await
                {
                    Ok(r) => r,
                    Err(_) => Err("Network timeout".to_string()),
                }
            } else {
                fetch_stock_quote(&symbol).await
            };

            match fetch_result {
                Ok(q) => {
                    cache.record_fetch_time(&symbol, "quote").await;
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
            let db_clone = db.inner().clone();
            let sym = symbol.clone();
            let db_data = run_blocking_db(move || db_clone.get_time_series(&sym, None)).unwrap_or_default();
            let min_interval_seconds = if in_trading { 60 } else { 24 * 60 * 60 };
            let should_fetch = if db_data.is_empty() {
                true
            } else {
                cache
                    .should_fetch_from_network_with_policy(&symbol, "time_series", min_interval_seconds, in_trading)
                    .await
            };

            if should_fetch {
                let fetch_result = if in_trading {
                    match tokio::time::timeout(
                        std::time::Duration::from_secs(6),
                        fetch_time_series(&symbol),
                    )
                    .await
                    {
                        Ok(r) => r,
                        Err(_) => Err("Network timeout".to_string()),
                    }
                } else {
                    fetch_time_series(&symbol).await
                };

                match fetch_result {
                    Ok(data) if !data.is_empty() => {
                        cache.record_fetch_time(&symbol, "time_series").await;
                        cache.set_time_series(symbol.clone(), data.clone()).await;
                        data
                    }
                    _ => {
                        if !db_data.is_empty() {
                            cache.set_time_series(symbol.clone(), db_data.clone()).await;
                        }
                        db_data
                    }
                }
            } else {
                if !db_data.is_empty() {
                    cache.set_time_series(symbol.clone(), db_data.clone()).await;
                }
                db_data
            }
        }
    };

    let today = Local::now().format("%Y-%m-%d").to_string();
    let intraday = {
        let today_data: Vec<StockData> = time_series.iter()
            .filter(|d| d.date.starts_with(&today))
            .cloned()
            .collect();
        if !today_data.is_empty() { today_data } else { get_latest_day_data(&time_series) }
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
    force_refresh: Option<bool>,
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<std::collections::HashMap<String, StockDataBundle>, String> {
    if symbols.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    
    let force = force_refresh.unwrap_or(false);
    // Concurrency limit
    let sem = Arc::new(Semaphore::new(MAX_CONCURRENT_FETCHES));
    let mut tasks = Vec::new();
    let today = Local::now().format("%Y-%m-%d").to_string();

    for symbol in symbols {
        let cache_clone = cache.inner().clone();
        let db_clone = db.inner().clone();
        let today_clone = today.clone();
        let sem_clone = sem.clone();
        let force_clone = force;
        
        let task = tokio::spawn(async move {
            let _permit = sem_clone.acquire().await;

            let in_trading = is_trading_hours();
            let quote = if force_clone {
                // Force fetch quote
                let fetch_result = if in_trading {
                    match tokio::time::timeout(
                        std::time::Duration::from_secs(4),
                        fetch_stock_quote(&symbol),
                    )
                    .await
                    {
                        Ok(r) => r,
                        Err(_) => Err("Network timeout".to_string()),
                    }
                } else {
                    fetch_stock_quote(&symbol).await
                };
                match fetch_result {
                    Ok(q) => {
                        cache_clone.record_fetch_time(&symbol, "quote").await;
                        cache_clone.set_quote(symbol.clone(), q.clone()).await;
                        Some(q)
                    }
                    Err(_) => cache_clone.get_quote(&symbol).await,
                }
            } else {
                match cache_clone.get_quote(&symbol).await {
                    Some(q) => Some(q),
                    None => {
                        let min_interval_seconds = if in_trading { 60 } else { 24 * 60 * 60 };
                        let should_fetch = cache_clone
                            .should_fetch_from_network_with_policy(&symbol, "quote", min_interval_seconds, in_trading)
                            .await;
                    if !should_fetch {
                        let sym = symbol.clone();
                        let db_for_quote = db_clone.clone();
                        if let Ok(Some(q)) = run_blocking_db(move || db_for_quote.get_quote(&sym)) {
                            cache_clone.set_quote(symbol.clone(), q.clone()).await;
                            Some(q)
                        } else {
                            let fetch_result = if in_trading {
                                match tokio::time::timeout(
                                    std::time::Duration::from_secs(4),
                                    fetch_stock_quote(&symbol),
                                )
                                .await
                                {
                                    Ok(r) => r,
                                    Err(_) => Err("Network timeout".to_string()),
                                }
                            } else {
                                fetch_stock_quote(&symbol).await
                            };

                            match fetch_result {
                                Ok(q) => {
                                    cache_clone.record_fetch_time(&symbol, "quote").await;
                                    cache_clone.set_quote(symbol.clone(), q.clone()).await;
                                    Some(q)
                                }
                                Err(_) => None,
                            }
                        }
                    } else {
                        let fetch_result = if in_trading {
                            match tokio::time::timeout(
                                std::time::Duration::from_secs(4),
                                fetch_stock_quote(&symbol),
                            )
                            .await
                            {
                                Ok(r) => r,
                                Err(_) => Err("Network timeout".to_string()),
                            }
                        } else {
                            fetch_stock_quote(&symbol).await
                        };

                        match fetch_result {
                            Ok(q) => {
                                cache_clone.record_fetch_time(&symbol, "quote").await;
                                cache_clone.set_quote(symbol.clone(), q.clone()).await;
                                Some(q)
                            }
                            Err(_) => None,
                        }
                    }
                    }
                }
            };
            
            let time_series = if force_clone {
                // Force fetch time series
                let fetch_result = if in_trading {
                    match tokio::time::timeout(
                        std::time::Duration::from_secs(6),
                        fetch_time_series(&symbol),
                    )
                    .await
                    {
                        Ok(r) => r,
                        Err(_) => Err("Network timeout".to_string()),
                    }
                } else {
                    fetch_time_series(&symbol).await
                };
                match fetch_result {
                    Ok(data) if !data.is_empty() => {
                        cache_clone.record_fetch_time(&symbol, "time_series").await;
                        cache_clone.set_time_series(symbol.clone(), data.clone()).await;
                        data
                    }
                    _ => {
                        let sym = symbol.clone();
                        let db_for_ts = db_clone.clone();
                        let db_data = run_blocking_db(move || db_for_ts.get_time_series(&sym, None)).unwrap_or_default();
                        if !db_data.is_empty() {
                            cache_clone.set_time_series(symbol.clone(), db_data.clone()).await;
                        }
                        db_data
                    }
                }
            } else {
                match cache_clone.get_time_series(&symbol).await {
                    Some(data) => data,
                    None => {
                        let sym = symbol.clone();
                        let db_for_ts = db_clone.clone();
                        let db_data = run_blocking_db(move || db_for_ts.get_time_series(&sym, None)).unwrap_or_default();
                        let min_interval_seconds = if in_trading { 60 } else { 24 * 60 * 60 };
                        let should_fetch = if db_data.is_empty() {
                            true
                        } else {
                            cache_clone
                                .should_fetch_from_network_with_policy(&symbol, "time_series", min_interval_seconds, in_trading)
                                .await
                        };

                        if should_fetch {
                        let fetch_result = if in_trading {
                            match tokio::time::timeout(
                                std::time::Duration::from_secs(6),
                                fetch_time_series(&symbol),
                            )
                            .await
                            {
                                Ok(r) => r,
                                Err(_) => Err("Network timeout".to_string()),
                            }
                        } else {
                            fetch_time_series(&symbol).await
                        };

                        match fetch_result {
                            Ok(data) if !data.is_empty() => {
                                cache_clone.record_fetch_time(&symbol, "time_series").await;
                                cache_clone.set_time_series(symbol.clone(), data.clone()).await;
                                data
                            }
                            _ => {
                                if !db_data.is_empty() {
                                    cache_clone.set_time_series(symbol.clone(), db_data.clone()).await;
                                }
                                db_data
                            }
                        }
                    } else {
                        if !db_data.is_empty() {
                            cache_clone.set_time_series(symbol.clone(), db_data.clone()).await;
                        }
                        db_data
                    }
                }
                }
            };
            
            let intraday = {
                let today_data: Vec<StockData> = time_series.iter()
                    .filter(|d| d.date.starts_with(&today_clone))
                    .cloned()
                    .collect();
                
                if !today_data.is_empty() {
                    today_data
                } else {
                    get_latest_day_data(&time_series)
                }
            };
            
            (symbol.clone(), StockDataBundle {
                symbol,
                quote,
                time_series,
                intraday,
            })
        });
        tasks.push(task);
    }

    let mut result = std::collections::HashMap::new();
    for task in tasks {
        match task.await {
            Ok((symbol, bundle)) => {
                result.insert(symbol, bundle);
            }
            Err(e) => eprintln!("Batch fetch task error: {}", e),
        }
    }
    
    Ok(result)
}

#[tauri::command]
pub async fn get_batch_intraday_time_series(
    symbols: Vec<String>,
    force_refresh: Option<bool>,
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<std::collections::HashMap<String, Vec<StockData>>, String> {
    if symbols.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    
    let force = force_refresh.unwrap_or(false);
    let today = Local::now().format("%Y-%m-%d").to_string();
    let mut result = std::collections::HashMap::new();
    
    let mut need_fetch = Vec::new();
    if !force {
        for symbol in &symbols {
            if let Some(cached_data) = cache.get_history(symbol, "1m").await {
                let has_today_data = cached_data.iter().any(|d| d.date.starts_with(&today));
                if has_today_data {
                    let today_data: Vec<StockData> = cached_data.iter()
                        .filter(|d| d.date.starts_with(&today))
                        .cloned()
                        .collect();
                    if !today_data.is_empty() {
                        result.insert(symbol.clone(), today_data);
                        continue;
                    }
                }
            }
            need_fetch.push(symbol.clone());
        }
    } else {
        need_fetch = symbols.clone();
    }
    
    if need_fetch.is_empty() {
        return Ok(result);
    }
    
    for symbol in need_fetch {
        let db_clone = db.inner().clone();
        let sym = symbol.clone();
        let (latest_date, cached) = run_blocking_db(move || {
            let l = db_clone.get_latest_kline_date(&sym, "1m").map_err(|e| e.to_string())?;
            let c = db_clone.get_kline(&sym, "1m", None).map_err(|e| e.to_string())?;
            Ok::<_, String>((l, c))
        }).map_err(|e| format!("Database error: {}", e))?;
        let in_trading = is_trading_hours();
        let min_interval_seconds = if in_trading { 60 } else { 24 * 60 * 60 };
        let should_fetch = if force || cached.is_empty() {
            true
        } else {
            cache
                .should_fetch_from_network_with_policy(&symbol, "1m", min_interval_seconds, in_trading)
                .await
        };
        
        let merged_data = if should_fetch {
            match fetch_stock_history(&symbol, "1m").await {
                Ok(fetched) => {
                    cache.record_fetch_time(&symbol, "1m").await;
                    
                    if force {
                        // Force refresh: replace all data with fetched data
                        cache.set_history(symbol.clone(), "1m".to_string(), fetched.clone()).await;
                        fetched
                    } else if let Some(ref latest) = latest_date {
                        // Normal refresh: merge with existing data
                        let new_data: Vec<StockData> = fetched
                            .into_iter()
                            .filter(|d| d.date >= *latest)
                            .collect();
                        
                        if !new_data.is_empty() {
                            let mut data: Vec<StockData> = cached
                                .into_iter()
                                .filter(|d| d.date < *latest)
                                .collect();
                            data.extend(new_data);
                            data.sort_by(|a, b| a.date.cmp(&b.date));
                            let final_data = data.clone();
                            cache.set_history(symbol.clone(), "1m".to_string(), final_data).await;
                            data
                        } else {
                            if !cached.is_empty() {
                                cache.set_history(symbol.clone(), "1m".to_string(), cached.clone()).await;
                            }
                            cached
                        }
                    } else {
                        cache.set_history(symbol.clone(), "1m".to_string(), fetched.clone()).await;
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
                cache.set_history(symbol.clone(), "1m".to_string(), cached.clone()).await;
            }
            cached
        };
        
        let today_data_raw: Vec<StockData> = merged_data.iter()
            .filter(|d| d.date.starts_with(&today))
            .cloned()
            .collect();
        
        let today_data = filter_trading_hours_data(today_data_raw);
        
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
