use crate::database::{Database, run_blocking_db};
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

#[derive(Serialize)]
pub struct TagInfo {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[derive(Serialize)]
#[allow(dead_code)]
pub struct StockWithTags {
    pub symbol: String,
    pub name: String,
    pub exchange: String,
    pub tags: Vec<TagInfo>,
}

#[tauri::command]
pub fn create_tag(
    name: String,
    color: String,
    db: State<'_, Arc<Database>>,
) -> Result<i64, String> {
    db.create_tag(&name, &color)
        .map_err(|e| format!("Failed to create tag: {}", e))
}

#[tauri::command]
pub fn get_all_tags(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<TagInfo>, String> {
    db.get_all_tags()
        .map(|tags: Vec<(i64, String, String)>| {
            tags.into_iter()
                .map(|(id, name, color)| TagInfo { id, name, color })
                .collect()
        })
        .map_err(|e| format!("Failed to get tags: {}", e))
}

#[tauri::command]
pub fn update_tag(
    tag_id: i64,
    name: String,
    color: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.update_tag(tag_id, &name, &color)
        .map_err(|e| format!("Failed to update tag: {}", e))
}

#[tauri::command]
pub fn delete_tag(
    tag_id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.delete_tag(tag_id)
        .map_err(|e| format!("Failed to delete tag: {}", e))
}

#[tauri::command]
pub fn add_tag_to_stock(
    symbol: String,
    tag_id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.add_tag_to_stock(&symbol, tag_id)
        .map_err(|e| format!("Failed to add tag to stock: {}", e))
}

#[tauri::command]
pub fn remove_tag_from_stock(
    symbol: String,
    tag_id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.remove_tag_from_stock(&symbol, tag_id)
        .map_err(|e| format!("Failed to remove tag from stock: {}", e))
}

#[tauri::command]
pub async fn get_stock_tags(
    symbol: String,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<String>, String> {
    let db_clone = db.inner().clone();
    run_blocking_db(move || db_clone.get_stock_tags(&symbol))
        .map_err(|e| format!("Failed to get stock tags: {}", e))
}

#[tauri::command]
pub async fn get_all_stock_tags_map(
    db: State<'_, Arc<Database>>,
) -> Result<std::collections::HashMap<String, Vec<String>>, String> {
    let db_clone = db.inner().clone();
    run_blocking_db(move || db_clone.get_all_stock_tags_map())
        .map_err(|e| format!("Failed to get all stock tags map: {}", e))
}

#[tauri::command]
pub fn get_stocks_by_tag(
    tag_id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<crate::stock_api::StockInfo>, String> {
    db.get_stocks_by_tag(tag_id)
        .map_err(|e| format!("Failed to get stocks by tag: {}", e))
}
