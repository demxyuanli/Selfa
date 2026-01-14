// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod stock_api;
mod database;

use stock_api::*;
use database::Database;
use std::sync::Arc;
use tauri::Manager;

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
async fn search_stocks(query: String) -> Result<Vec<StockInfo>, String> {
    search_stocks_by_query(&query).await
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

// ============= Tag Commands =============

#[derive(serde::Serialize)]
struct TagInfo {
    id: i64,
    name: String,
    color: String,
}

#[derive(serde::Serialize)]
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

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let db = Database::new(app.handle())
                .map_err(|e| format!("Failed to initialize database: {}", e))?;
            app.manage(Arc::new(db));
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
            create_tag,
            get_all_tags,
            update_tag,
            delete_tag,
            add_tag_to_stock,
            remove_tag_from_stock,
            get_stock_tags,
            get_stocks_by_tag,
            predict_stock_price
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

