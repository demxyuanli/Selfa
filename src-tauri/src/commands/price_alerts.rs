use crate::cache::StockCache;
use crate::database::Database;
use crate::stock_api::fetch_stock_quote;
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Serialize, Deserialize)]
pub struct PriceAlertInfo {
    pub id: i64,
    pub symbol: String,
    pub threshold_price: f64,
    pub direction: String,
    pub enabled: bool,
    pub triggered: bool,
}

#[tauri::command]
pub fn create_price_alert(
    symbol: String,
    threshold_price: f64,
    direction: String,
    db: State<'_, Arc<Database>>,
) -> Result<i64, String> {
    if direction != "above" && direction != "below" {
        return Err("Direction must be 'above' or 'below'".to_string());
    }
    db.create_price_alert(&symbol, threshold_price, &direction)
        .map_err(|e| format!("Failed to create price alert: {}", e))
}

#[tauri::command]
pub fn get_price_alerts(
    symbol: Option<String>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<PriceAlertInfo>, String> {
    db.get_price_alerts(symbol.as_deref())
        .map(|alerts: Vec<(i64, String, f64, String, bool, bool)>| {
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
pub fn update_price_alert(
    alert_id: i64,
    threshold_price: Option<f64>,
    direction: Option<String>,
    enabled: Option<bool>,
    db: State<'_, Arc<Database>>,
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
pub fn delete_price_alert(
    alert_id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.delete_price_alert(alert_id)
        .map_err(|e| format!("Failed to delete price alert: {}", e))
}

#[tauri::command]
pub async fn check_price_alerts(
    cache: State<'_, Arc<StockCache>>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<PriceAlertInfo>, String> {
    let today = Local::now().format("%Y-%m-%d").to_string();
    let active_alerts: Vec<(i64, String, f64, String)> = db.get_active_price_alerts(&today)
        .map_err(|e| format!("Failed to get active alerts: {}", e))?;
    
    let mut triggered_alerts = Vec::new();
    
    for (alert_id, symbol, threshold_price, direction) in active_alerts {
        let quote = if let Some(cached_quote) = cache.get_quote(&symbol).await {
            cached_quote
        } else {
            let mut retry_count = 0;
            let max_retries = 2;

            let quote_result = loop {
                match fetch_stock_quote(&symbol).await {
                    Ok(quote) => {
                        cache.set_quote(symbol.clone(), quote.clone()).await;
                        break Some(quote);
                    }
                    Err(e) => {
                        retry_count += 1;
                        if retry_count >= max_retries {
                            eprintln!("Failed to fetch quote for {} after {} retries: {}", symbol, max_retries, e);
                            break None;
                        }
                        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    }
                }
            };
            
            match quote_result {
                Some(q) => q,
                None => continue,
            }
        };

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
    
    Ok(triggered_alerts)
}

#[tauri::command]
pub fn reset_price_alert(
    alert_id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.reset_alert_triggered(alert_id)
        .map_err(|e| format!("Failed to reset price alert: {}", e))
}
