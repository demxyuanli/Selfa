use crate::database::Database;
use crate::stock_api::StockInfo;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn create_stock_group(
    name: String,
    db: State<'_, Arc<Database>>,
) -> Result<i64, String> {
    db.create_group(&name)
        .map_err(|e| format!("Failed to create group: {}", e))
}

#[tauri::command]
pub fn get_stock_groups(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<String>, String> {
    db.get_groups()
        .map_err(|e| format!("Failed to get groups: {}", e))
}

#[tauri::command]
pub fn add_stock_to_group(
    stock: StockInfo,
    group_name: Option<String>,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    let group_id = if let Some(name) = group_name {
        Some(db.create_group(&name)
            .map_err(|e| format!("Failed to create/get group: {}", e))?)
    } else {
        None
    };
    
    db.add_stock(&stock, group_id)
        .map_err(|e| format!("Failed to add stock: {}", e))
}

#[tauri::command]
pub fn get_stocks_by_group(
    group_name: Option<String>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<StockInfo>, String> {
    db.get_stocks_by_group(group_name.as_deref())
        .map_err(|e| format!("Failed to get stocks: {}", e))
}

#[tauri::command]
pub fn delete_stock_group(
    name: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.delete_group(&name)
        .map_err(|e| format!("Failed to delete group: {}", e))
}

#[tauri::command]
pub fn update_stock_group(
    old_name: String,
    new_name: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.update_group(&old_name, &new_name)
        .map_err(|e| format!("Failed to update group: {}", e))
}

#[tauri::command]
pub fn move_stock_to_group(
    symbol: String,
    group_name: Option<String>,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.move_stock_to_group(&symbol, group_name.as_deref())
        .map_err(|e| format!("Failed to move stock: {}", e))
}

#[tauri::command]
pub fn update_stocks_order(
    symbols: Vec<String>,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.update_stocks_order(&symbols)
        .map_err(|e| format!("Failed to update stocks order: {}", e))
}

#[tauri::command]
pub fn remove_stock(
    symbol: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.remove_stock(&symbol)
        .map_err(|e| format!("Failed to remove stock: {}", e))
}

#[tauri::command]
pub fn restore_stock(
    symbol: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.restore_stock(&symbol)
        .map_err(|e| format!("Failed to restore stock: {}", e))
}
