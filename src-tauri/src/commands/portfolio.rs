use crate::database::{Database, run_blocking_db};
use chrono::Local;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn add_portfolio_position(
    symbol: String,
    name: String,
    quantity: i64,
    avg_cost: f64,
    current_price: Option<f64>,
    db: State<'_, Arc<Database>>,
) -> Result<i64, String> {
    let position_id = db.add_portfolio_position(&symbol, &name, quantity, avg_cost, current_price)
        .map_err(|e| format!("Failed to add position: {}", e))?;
    
    // Update stock-index relations in background
    let db_clone = db.inner().clone();
    let symbol_clone = symbol.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::commands::indices::update_stock_index_relations_internal(&db_clone, &symbol_clone).await {
            eprintln!("Failed to update index relations for {}: {}", symbol_clone, e);
        }
    });
    
    Ok(position_id)
}

#[tauri::command]
pub fn get_portfolio_positions(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<(i64, String, String, i64, f64, Option<f64>)>, String> {
    db.get_portfolio_positions()
        .map_err(|e| format!("Failed to get positions: {}", e))
}

#[tauri::command]
pub fn update_portfolio_position_price(
    symbol: String,
    current_price: f64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.update_portfolio_position_price(&symbol, current_price)
        .map_err(|e| format!("Failed to update position price: {}", e))
}

#[tauri::command]
pub fn update_portfolio_position(
    id: i64,
    quantity: i64,
    avg_cost: f64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.update_portfolio_position(id, quantity, avg_cost)
        .map_err(|e| format!("Failed to update position: {}", e))
}

#[tauri::command]
pub fn delete_portfolio_position(
    id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.delete_portfolio_position(id)
        .map_err(|e| format!("Failed to delete position: {}", e))
}

#[tauri::command]
pub async fn add_portfolio_transaction(
    symbol: String,
    transaction_type: String,
    quantity: i64,
    price: f64,
    commission: f64,
    transaction_date: String,
    notes: Option<String>,
    stock_name: Option<String>,
    db: State<'_, Arc<Database>>,
) -> Result<i64, String> {
    let transaction_id = db.add_portfolio_transaction(
        &symbol,
        &transaction_type,
        quantity,
        price,
        commission,
        &transaction_date,
        notes.as_deref(),
        stock_name.as_deref(),
    )
    .map_err(|e| format!("Failed to add transaction: {}", e))?;
    
    // Update stock-index relations in background if this is a new position
    let db_clone = db.inner().clone();
    let symbol_clone = symbol.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::commands::indices::update_stock_index_relations_internal(&db_clone, &symbol_clone).await {
            eprintln!("Failed to update index relations for {}: {}", symbol_clone, e);
        }
    });

    let db_for_alerts = db.inner().clone();
    let symbol_for_alerts = symbol.clone();
    tauri::async_runtime::spawn(async move {
        let today = Local::now().format("%Y-%m-%d").to_string();
        let symbol_for_query = symbol_for_alerts.clone();
        let result = run_blocking_db(move || {
            let positions = match db_for_alerts.get_portfolio_positions() {
                Ok(data) => data,
                Err(e) => return Err(e),
            };
            let mut target: Option<(i64, f64)> = None;
            for (_id, sym, _name, quantity, avg_cost, _current) in positions {
                if sym == symbol_for_query {
                    target = Some((quantity, avg_cost));
                    break;
                }
            }

            match target {
                Some((quantity_value, avg_cost_value)) => {
                    if quantity_value <= 0 || avg_cost_value <= 0.0 {
                        return Ok(());
                    }
                    let _ = db_for_alerts.delete_price_alerts_by_symbol_source_and_date(
                        &symbol_for_query,
                        "auto_trade",
                        &today,
                    );
                    let upper = avg_cost_value * 1.02;
                    let lower = avg_cost_value * 0.98;
                    db_for_alerts.create_price_alert_with_meta(
                        &symbol_for_query,
                        upper,
                        "above",
                        &today,
                        "auto_trade",
                    )?;
                    db_for_alerts.create_price_alert_with_meta(
                        &symbol_for_query,
                        lower,
                        "below",
                        &today,
                        "auto_trade",
                    )?;
                }
                None => {}
            }
            Ok(())
        });

        if let Err(e) = result {
            eprintln!("Failed to create auto trade alerts for {}: {}", symbol_for_alerts, e);
        }
    });
    
    Ok(transaction_id)
}

#[tauri::command]
pub fn get_portfolio_transactions(
    symbol: Option<String>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<(i64, String, String, i64, f64, f64, f64, String, Option<String>)>, String> {
    db.get_portfolio_transactions(symbol.as_deref())
        .map_err(|e| format!("Failed to get transactions: {}", e))
}

#[tauri::command]
pub fn update_portfolio_transaction(
    id: i64,
    quantity: i64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.update_portfolio_transaction(id, quantity)
        .map_err(|e| format!("Failed to update transaction: {}", e))
}

#[tauri::command]
pub fn delete_portfolio_transaction(
    id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.delete_portfolio_transaction(id)
        .map_err(|e| format!("Failed to delete transaction: {}", e))
}

#[tauri::command]
pub fn recalculate_all_positions_from_transactions(
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.recalculate_all_positions_from_transactions()
        .map_err(|e| format!("Failed to recalculate positions: {}", e))
}

#[tauri::command]
pub fn add_capital_transfer(
    transfer_type: String,
    amount: f64,
    transfer_date: String,
    notes: Option<String>,
    db: State<'_, Arc<Database>>,
) -> Result<i64, String> {
    if transfer_type != "deposit" && transfer_type != "withdraw" {
        return Err("Transfer type must be 'deposit' or 'withdraw'".to_string());
    }
    db.add_capital_transfer(&transfer_type, amount, &transfer_date, notes.as_deref())
        .map_err(|e| format!("Failed to add capital transfer: {}", e))
}

#[tauri::command]
pub fn get_capital_transfers(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<(i64, String, f64, String, Option<String>)>, String> {
    db.get_capital_transfers()
        .map_err(|e| format!("Failed to get capital transfers: {}", e))
}

#[tauri::command]
pub fn update_capital_transfer(
    id: i64,
    transfer_type: Option<String>,
    amount: Option<f64>,
    transfer_date: Option<String>,
    notes: Option<String>,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    if let Some(ref tt) = transfer_type {
        if tt != "deposit" && tt != "withdraw" {
            return Err("Transfer type must be 'deposit' or 'withdraw'".to_string());
        }
    }
    db.update_capital_transfer(id, transfer_type.as_deref(), amount, transfer_date.as_deref(), notes.as_deref())
        .map_err(|e| format!("Failed to update capital transfer: {}", e))
}

#[tauri::command]
pub fn delete_capital_transfer(
    id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.delete_capital_transfer(id)
        .map_err(|e| format!("Failed to delete capital transfer: {}", e))
}

#[tauri::command]
pub fn get_total_capital(
    db: State<'_, Arc<Database>>,
) -> Result<f64, String> {
    db.get_total_capital()
        .map_err(|e| format!("Failed to get total capital: {}", e))
}

#[tauri::command]
pub fn get_initial_balance(
    db: State<'_, Arc<Database>>,
) -> Result<Option<f64>, String> {
    db.get_initial_balance()
        .map_err(|e| format!("Failed to get initial balance: {}", e))
}

#[tauri::command]
pub fn set_initial_balance(
    balance: f64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.set_initial_balance(balance)
        .map_err(|e| format!("Failed to set initial balance: {}", e))
}
