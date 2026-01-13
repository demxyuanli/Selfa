// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod stock_api;

use stock_api::*;

#[tauri::command]
async fn get_stock_quote(symbol: String) -> Result<StockQuote, String> {
    fetch_stock_quote(&symbol).await
}

#[tauri::command]
async fn get_stock_history(symbol: String, period: String) -> Result<Vec<StockData>, String> {
    fetch_stock_history(&symbol, &period).await
}

#[tauri::command]
async fn get_time_series(symbol: String) -> Result<Vec<StockData>, String> {
    fetch_time_series(&symbol).await
}

#[tauri::command]
async fn search_stocks(query: String) -> Result<Vec<StockInfo>, String> {
    search_stocks_by_query(&query).await
}

#[tauri::command]
fn calculate_technical_indicators(data: Vec<StockData>) -> Result<TechnicalIndicators, String> {
    Ok(calculate_indicators(data))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_stock_quote,
            get_stock_history,
            get_time_series,
            search_stocks,
            calculate_technical_indicators
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

