// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod stock_api;
mod database;

use stock_api::*;
use database::Database;
use std::sync::Arc;
use tauri::Manager;

// Internal function for background cache refresh
async fn refresh_stock_cache_internal(db: &Database) -> Result<usize, String> {
    let stocks = fetch_all_a_stocks().await?;
    let count = stocks.len();
    db.update_stock_cache(&stocks)
        .map_err(|e| format!("Failed to update stock cache: {}", e))?;
    Ok(count)
}

#[tauri::command]
async fn get_stock_quote(
    symbol: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<StockQuote, String> {
    let quote = fetch_stock_quote(&symbol).await?;
    
    db.save_quote(&quote)
        .map_err(|e| format!("Failed to save quote: {}", e))?;
    
    Ok(quote)
}

#[tauri::command]
async fn get_all_favorites_quotes(
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<(StockInfo, Option<StockQuote>)>, String> {
    let stocks = db.get_stocks_by_group(None)
        .map_err(|e| format!("Failed to get stocks: {}", e))?;
    
    // Exclude default indices: 000001 (Shanghai), 399001 (Shenzhen), 399006 (ChiNext)
    let excluded_symbols = ["000001", "399001", "399006"];
    
    // Filter out excluded indices
    let filtered_stocks: Vec<_> = stocks
        .into_iter()
        .filter(|stock| !excluded_symbols.contains(&stock.symbol.as_str()))
        .collect();
    
    // Fetch quotes concurrently using tokio tasks
    let mut tasks = Vec::new();
    for stock in &filtered_stocks {
        let symbol = stock.symbol.clone();
        let db_clone = db.inner().clone();
        let task = tokio::spawn(async move {
            let symbol_clone = symbol.clone();
            match fetch_stock_quote(&symbol_clone).await {
                Ok(quote) => {
                    // Save to database for caching (but don't fail if save fails)
                    let _ = db_clone.save_quote(&quote);
                    (symbol, Some(quote))
                }
                Err(err) => {
                    eprintln!("Failed to fetch quote for {}: {}", symbol_clone, err);
                    (symbol, None)
                }
            }
        });
        tasks.push(task);
    }
    
    // Collect results from all tasks
    let mut quotes_map = std::collections::HashMap::new();
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
    
    // Combine stocks with their quotes in the original order
    let mut result = Vec::new();
    for stock in filtered_stocks {
        let quote = quotes_map.remove(&stock.symbol);
        result.push((stock, quote.flatten()));
    }

    Ok(result)
}

#[tauri::command]
async fn get_stock_history(
    symbol: String,
    period: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<StockData>, String> {
    let latest_date = db.get_latest_kline_date(&symbol, &period)
        .map_err(|e| format!("Database error: {}", e))?;
    
    let cached = db.get_kline(&symbol, &period, None)
        .map_err(|e| format!("Database error: {}", e))?;
    
    let fetched = fetch_stock_history(&symbol, &period).await?;
    
    if let Some(ref latest) = latest_date {
        let new_data: Vec<StockData> = fetched
            .into_iter()
            .filter(|d| d.date > *latest)
            .collect();
        
        if !new_data.is_empty() {
            db.save_kline(&symbol, &period, &new_data)
                .map_err(|e| format!("Failed to save kline: {}", e))?;
            let mut data = cached;
            data.extend(new_data);
            data.sort_by(|a, b| a.date.cmp(&b.date));
            Ok(data)
        } else {
            Ok(cached)
        }
    } else {
        db.save_kline(&symbol, &period, &fetched)
            .map_err(|e| format!("Failed to save kline: {}", e))?;
        Ok(fetched)
    }
}

#[tauri::command]
async fn get_time_series(
    symbol: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<StockData>, String> {
    let fetched = fetch_time_series(&symbol).await;
    
    match fetched {
        Ok(fetched_data) if !fetched_data.is_empty() => {
            // For time series (real-time data), always use the latest data from API
            // and replace all existing data to ensure we have the most recent data
            db.save_time_series(&symbol, &fetched_data)
                .map_err(|e| format!("Failed to save time series: {}", e))?;
            Ok(fetched_data)
        }
        Err(e) => {
            // If API fails, fall back to cached data
            let cached = db.get_time_series(&symbol, None)
                .map_err(|_| format!("API error: {}; Database error", e))?;
            if !cached.is_empty() {
                Ok(cached)
            } else {
                Err(format!("API error: {}; No cached data available", e))
            }
        }
        _ => {
            // Empty data from API, fall back to cached
            let cached = db.get_time_series(&symbol, None)
                .map_err(|e| format!("Database error: {}", e))?;
            if !cached.is_empty() {
                Ok(cached)
            } else {
                Ok(vec![])
            }
        }
    }
}

#[tauri::command]
async fn search_stocks(
    query: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<StockInfo>, String> {
    // First try to search from cache
    let cache_results = db.search_stocks_from_cache(&query, 50)
        .map_err(|e| format!("Cache search error: {}", e))?;
    
    if !cache_results.is_empty() {
        return Ok(cache_results);
    }
    
    // Fallback to API search if cache is empty
    search_stocks_by_query(&query).await
}

#[tauri::command]
async fn refresh_stock_cache(
    db: tauri::State<'_, Arc<Database>>,
) -> Result<usize, String> {
    let stocks = fetch_all_a_stocks().await?;
    let count = stocks.len();
    db.update_stock_cache(&stocks)
        .map_err(|e| format!("Failed to update stock cache: {}", e))?;
    Ok(count)
}

#[tauri::command]
fn get_stock_cache_count(
    db: tauri::State<'_, Arc<Database>>,
) -> Result<i64, String> {
    db.get_stock_cache_count()
        .map_err(|e| format!("Failed to get cache count: {}", e))
}

// ============= Portfolio Commands =============

#[tauri::command]
fn add_portfolio_position(
    symbol: String,
    name: String,
    quantity: i64,
    avgCost: f64,
    currentPrice: Option<f64>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<i64, String> {
    db.add_portfolio_position(&symbol, &name, quantity, avgCost, currentPrice)
        .map_err(|e| format!("Failed to add position: {}", e))
}

#[tauri::command]
fn get_portfolio_positions(
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<(i64, String, String, i64, f64, Option<f64>)>, String> {
    db.get_portfolio_positions()
        .map_err(|e| format!("Failed to get positions: {}", e))
}

#[tauri::command]
fn update_portfolio_position_price(
    symbol: String,
    currentPrice: f64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.update_portfolio_position_price(&symbol, currentPrice)
        .map_err(|e| format!("Failed to update position price: {}", e))
}

#[tauri::command]
fn delete_portfolio_position(
    id: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.delete_portfolio_position(id)
        .map_err(|e| format!("Failed to delete position: {}", e))
}

#[tauri::command]
fn add_portfolio_transaction(
    symbol: String,
    transaction_type: String,
    quantity: i64,
    price: f64,
    commission: f64,
    transaction_date: String,
    notes: Option<String>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<i64, String> {
    db.add_portfolio_transaction(
        &symbol,
        &transaction_type,
        quantity,
        price,
        commission,
        &transaction_date,
        notes.as_deref(),
    )
    .map_err(|e| format!("Failed to add transaction: {}", e))
}

#[tauri::command]
fn get_portfolio_transactions(
    symbol: Option<String>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<(i64, String, String, i64, f64, f64, f64, String, Option<String>)>, String> {
    db.get_portfolio_transactions(symbol.as_deref())
        .map_err(|e| format!("Failed to get transactions: {}", e))
}

#[tauri::command]
fn delete_portfolio_transaction(
    id: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.delete_portfolio_transaction(id)
        .map_err(|e| format!("Failed to delete transaction: {}", e))
}

#[tauri::command]
fn calculate_technical_indicators(data: Vec<StockData>) -> Result<TechnicalIndicators, String> {
    Ok(calculate_indicators(data))
}

#[tauri::command]
fn create_stock_group(
    name: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<i64, String> {
    db.create_group(&name)
        .map_err(|e| format!("Failed to create group: {}", e))
}

#[tauri::command]
fn get_stock_groups(
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<String>, String> {
    db.get_groups()
        .map_err(|e| format!("Failed to get groups: {}", e))
}

#[tauri::command]
fn add_stock_to_group(
    stock: StockInfo,
    group_name: Option<String>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    let group_id = if let Some(name) = group_name {
        // Get or create group - create_group will return existing ID if group exists
        Some(db.create_group(&name)
            .map_err(|e| format!("Failed to create/get group: {}", e))?)
    } else {
        None
    };
    
    db.add_stock(&stock, group_id)
        .map_err(|e| format!("Failed to add stock: {}", e))
}

#[tauri::command]
fn get_stocks_by_group(
    group_name: Option<String>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<StockInfo>, String> {
    db.get_stocks_by_group(group_name.as_deref())
        .map_err(|e| format!("Failed to get stocks: {}", e))
}

#[tauri::command]
fn delete_stock_group(
    name: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.delete_group(&name)
        .map_err(|e| format!("Failed to delete group: {}", e))
}

#[tauri::command]
fn update_stock_group(
    old_name: String,
    new_name: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.update_group(&old_name, &new_name)
        .map_err(|e| format!("Failed to update group: {}", e))
}

#[tauri::command]
fn move_stock_to_group(
    symbol: String,
    group_name: Option<String>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.move_stock_to_group(&symbol, group_name.as_deref())
        .map_err(|e| format!("Failed to move stock: {}", e))
}

#[tauri::command]
fn update_stocks_order(
    symbols: Vec<String>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.update_stocks_order(&symbols)
        .map_err(|e| format!("Failed to update stocks order: {}", e))
}

#[tauri::command]
fn remove_stock(
    symbol: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.remove_stock(&symbol)
        .map_err(|e| format!("Failed to remove stock: {}", e))
}

#[tauri::command]
fn restore_stock(
    symbol: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.restore_stock(&symbol)
        .map_err(|e| format!("Failed to restore stock: {}", e))
}

// ============= Tag Commands =============

#[derive(serde::Serialize)]
struct TagInfo {
    id: i64,
    name: String,
    color: String,
}

#[derive(serde::Serialize)]
#[allow(dead_code)]
struct StockWithTags {
    symbol: String,
    name: String,
    exchange: String,
    tags: Vec<TagInfo>,
}

#[tauri::command]
fn create_tag(
    name: String,
    color: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<i64, String> {
    db.create_tag(&name, &color)
        .map_err(|e| format!("Failed to create tag: {}", e))
}

#[tauri::command]
fn get_all_tags(
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<TagInfo>, String> {
    db.get_all_tags()
        .map(|tags| {
            tags.into_iter()
                .map(|(id, name, color)| TagInfo { id, name, color })
                .collect()
        })
        .map_err(|e| format!("Failed to get tags: {}", e))
}

#[tauri::command]
fn update_tag(
    tag_id: i64,
    name: String,
    color: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.update_tag(tag_id, &name, &color)
        .map_err(|e| format!("Failed to update tag: {}", e))
}

#[tauri::command]
fn delete_tag(
    tag_id: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.delete_tag(tag_id)
        .map_err(|e| format!("Failed to delete tag: {}", e))
}

#[tauri::command]
fn add_tag_to_stock(
    symbol: String,
    tag_id: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.add_tag_to_stock(&symbol, tag_id)
        .map_err(|e| format!("Failed to add tag to stock: {}", e))
}

#[tauri::command]
fn remove_tag_from_stock(
    symbol: String,
    tag_id: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.remove_tag_from_stock(&symbol, tag_id)
        .map_err(|e| format!("Failed to remove tag from stock: {}", e))
}

#[tauri::command]
fn get_stock_tags(
    symbol: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<TagInfo>, String> {
    db.get_stock_tags(&symbol)
        .map(|tags| {
            tags.into_iter()
                .map(|(id, name, color)| TagInfo { id, name, color })
                .collect()
        })
        .map_err(|e| format!("Failed to get stock tags: {}", e))
}

#[tauri::command]
fn get_stocks_by_tag(
    tag_id: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<StockInfo>, String> {
    db.get_stocks_by_tag(tag_id)
        .map_err(|e| format!("Failed to get stocks by tag: {}", e))
}

#[tauri::command]
fn predict_stock_price(
    data: Vec<StockData>,
    method: String,
    period: usize,
) -> Result<Vec<stock_api::PredictionResult>, String> {
    stock_api::predict_stock_price(&data, &method, period)
}

#[tauri::command]
async fn ai_analyze_stock(
    symbol: String,
    data: Vec<StockData>,
    quote: Option<StockQuote>,
    api_key: Option<String>,
    model: String,
    use_local_fallback: bool,
) -> Result<stock_api::AIAnalysisResult, String> {
    stock_api::ai_analyze_stock(
        &symbol,
        &data,
        quote.as_ref(),
        api_key.as_deref(),
        &model,
        use_local_fallback,
    )
    .await
}

// ============= Price Alert Commands =============

#[derive(serde::Serialize, serde::Deserialize)]
struct PriceAlertInfo {
    id: i64,
    symbol: String,
    threshold_price: f64,
    direction: String,
    enabled: bool,
    triggered: bool,
}

#[tauri::command]
fn create_price_alert(
    symbol: String,
    threshold_price: f64,
    direction: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<i64, String> {
    if direction != "above" && direction != "below" {
        return Err("Direction must be 'above' or 'below'".to_string());
    }
    db.create_price_alert(&symbol, threshold_price, &direction)
        .map_err(|e| format!("Failed to create price alert: {}", e))
}

#[tauri::command]
fn get_price_alerts(
    symbol: Option<String>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<PriceAlertInfo>, String> {
    db.get_price_alerts(symbol.as_deref())
        .map(|alerts| {
            alerts
                .into_iter()
                .map(|(id, symbol, threshold_price, direction, enabled, triggered)| {
                    PriceAlertInfo {
                        id,
                        symbol,
                        threshold_price,
                        direction,
                        enabled,
                        triggered,
                    }
                })
                .collect()
        })
        .map_err(|e| format!("Failed to get price alerts: {}", e))
}

#[tauri::command]
fn update_price_alert(
    alert_id: i64,
    threshold_price: Option<f64>,
    direction: Option<String>,
    enabled: Option<bool>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    if let Some(ref dir) = direction {
        if dir != "above" && dir != "below" {
            return Err("Direction must be 'above' or 'below'".to_string());
        }
    }
    db.update_price_alert(alert_id, threshold_price, direction.as_deref(), enabled)
        .map_err(|e| format!("Failed to update price alert: {}", e))
}

#[tauri::command]
fn delete_price_alert(
    alert_id: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.delete_price_alert(alert_id)
        .map_err(|e| format!("Failed to delete price alert: {}", e))
}

#[tauri::command]
async fn check_price_alerts(
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<PriceAlertInfo>, String> {
    let active_alerts = db.get_active_price_alerts()
        .map_err(|e| format!("Failed to get active alerts: {}", e))?;
    
    let mut triggered_alerts = Vec::new();
    
    for (alert_id, symbol, threshold_price, direction) in active_alerts {
        // Add retry logic for network requests
        let mut retry_count = 0;
        let max_retries = 2;

        let quote_result = loop {
            match fetch_stock_quote(&symbol).await {
                Ok(quote) => break Some(quote),
                Err(e) => {
                    retry_count += 1;
                    if retry_count >= max_retries {
                        eprintln!("Failed to fetch quote for {} after {} retries: {}", symbol, max_retries, e);
                        break None;
                    }
                    // Wait before retry
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                }
            }
        };

        if let Some(quote) = quote_result {
            let should_trigger = match direction.as_str() {
                "above" => quote.price >= threshold_price,
                "below" => quote.price <= threshold_price,
                _ => false,
            };

            if should_trigger {
                if let Err(e) = db.mark_alert_triggered(alert_id) {
                    eprintln!("Failed to mark alert as triggered: {}", e);
                    continue;
                }

                triggered_alerts.push(PriceAlertInfo {
                    id: alert_id,
                    symbol,
                    threshold_price,
                    direction,
                    enabled: true,
                    triggered: true,
                });
            }
        }
    }
    
    Ok(triggered_alerts)
}

#[tauri::command]
fn reset_price_alert(
    alert_id: i64,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.reset_alert_triggered(alert_id)
        .map_err(|e| format!("Failed to reset price alert: {}", e))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let db = Database::new(app.handle())
                .map_err(|e| format!("Failed to initialize database: {}", e))?;

            // Add some test stocks for heatmap demo
            let test_stocks = vec![
                StockInfo { symbol: "000002".to_string(), name: "万科A".to_string(), exchange: "SZ".to_string() },
                StockInfo { symbol: "600036".to_string(), name: "招商银行".to_string(), exchange: "SH".to_string() },
                StockInfo { symbol: "000001".to_string(), name: "平安银行".to_string(), exchange: "SZ".to_string() },
                StockInfo { symbol: "600519".to_string(), name: "贵州茅台".to_string(), exchange: "SH".to_string() },
                StockInfo { symbol: "000858".to_string(), name: "五粮液".to_string(), exchange: "SZ".to_string() },
            ];

            for stock in test_stocks {
                let _ = db.add_stock(&stock, None); // Ignore errors if stock already exists
            }

            let db_arc = Arc::new(db);
            
            // Start background task to initialize and periodically update stock cache
            let db_for_cache = db_arc.clone();
            tauri::async_runtime::spawn(async move {
                // Wait a bit for app to fully initialize
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                
                // Check if cache already exists
                let cache_count = match db_for_cache.get_stock_cache_count() {
                    Ok(count) => count,
                    Err(e) => {
                        eprintln!("Failed to check stock cache: {}", e);
                        return;
                    }
                };
                
                // If cache is empty, initialize it once
                if cache_count == 0 {
                    println!("Initializing stock cache for the first time...");
                    match refresh_stock_cache_internal(&db_for_cache).await {
                        Ok(count) => {
                            println!("Stock cache initialized with {} stocks", count);
                        }
                        Err(e) => {
                            eprintln!("Failed to initialize stock cache: {}", e);
                        }
                    }
                } else {
                    println!("Stock cache already exists with {} stocks", cache_count);
                }
                
                // Set up periodic cache update (every 24 hours)
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(24 * 60 * 60));
                // Skip the first tick since we just initialized
                interval.tick().await;
                
                // Periodically update cache
                loop {
                    interval.tick().await;
                    println!("Updating stock cache...");
                    match refresh_stock_cache_internal(&db_for_cache).await {
                        Ok(count) => {
                            println!("Stock cache updated with {} stocks", count);
                        }
                        Err(e) => {
                            eprintln!("Failed to update stock cache: {}", e);
                        }
                    }
                }
            });
            
            app.manage(db_arc);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_stock_quote,
            get_stock_history,
            get_time_series,
            search_stocks,
            calculate_technical_indicators,
            create_stock_group,
            get_stock_groups,
            add_stock_to_group,
            get_stocks_by_group,
            delete_stock_group,
            update_stock_group,
            move_stock_to_group,
            update_stocks_order,
            remove_stock,
            restore_stock,
            create_tag,
            get_all_tags,
            update_tag,
            delete_tag,
            add_tag_to_stock,
            remove_tag_from_stock,
            get_stock_tags,
            get_stocks_by_tag,
            predict_stock_price,
            ai_analyze_stock,
            get_all_favorites_quotes,
            create_price_alert,
            get_price_alerts,
            update_price_alert,
            delete_price_alert,
            check_price_alerts,
            reset_price_alert,
            refresh_stock_cache,
            get_stock_cache_count,
            add_portfolio_position,
            get_portfolio_positions,
            update_portfolio_position_price,
            delete_portfolio_position,
            add_portfolio_transaction,
            get_portfolio_transactions,
            delete_portfolio_transaction
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

