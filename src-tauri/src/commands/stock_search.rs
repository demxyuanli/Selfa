use crate::database::Database;
use crate::stock_api::{fetch_all_a_stocks, filter_stocks_by_market_and_sector, search_stocks_by_query};
use std::sync::Arc;
use tauri::State;

pub async fn refresh_stock_cache_internal(db: &Database) -> Result<usize, String> {
    let stocks = fetch_all_a_stocks().await?;
    let count = stocks.len();
    db.update_stock_cache(&stocks)
        .map_err(|e| format!("Failed to update stock cache: {}", e))?;
    Ok(count)
}

#[tauri::command]
pub async fn search_stocks(
    query: String,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<crate::stock_api::StockInfo>, String> {
    match search_stocks_by_query(&query).await {
        Ok(api_results) => {
            Ok(api_results)
        }
        Err(_) => {
            let cache_results = db.search_stocks_from_cache(&query, 50)
                .map_err(|e| format!("Cache search error: {}", e))?;
            Ok(cache_results)
        }
    }
}

#[tauri::command]
pub async fn filter_stocks(
    market_filter: Option<String>,
    sector_filter: Option<String>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<Vec<crate::stock_api::StockInfo>, String> {
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(100);
    
    filter_stocks_by_market_and_sector(
        market_filter.as_deref(),
        sector_filter.as_deref(),
        page,
        page_size,
    ).await
}

#[tauri::command]
pub async fn refresh_stock_cache(
    db: State<'_, Arc<Database>>,
) -> Result<usize, String> {
    let stocks = fetch_all_a_stocks().await?;
    let count = stocks.len();
    db.update_stock_cache(&stocks)
        .map_err(|e| format!("Failed to update stock cache: {}", e))?;
    Ok(count)
}

#[tauri::command]
pub fn get_stock_cache_count(
    db: State<'_, Arc<Database>>,
) -> Result<i64, String> {
    db.get_stock_cache_count()
        .map_err(|e| format!("Failed to get cache count: {}", e))
}
