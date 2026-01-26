use crate::database::{Database, run_blocking_db};
use crate::stock_api::data::fetch_all_indices;
use crate::stock_api::data::get_related_sectors;
use tauri::State;
use std::sync::Arc;

pub async fn initialize_all_indices_internal(db: Arc<Database>) -> Result<usize, String> {
    println!("[initialize_all_indices] Starting initialization...");
    let db_count = db.clone();
    let count = run_blocking_db(move || db_count.get_index_count())
        .map_err(|e| format!("Failed to check index count: {}", e))?;
    if count > 0 {
        println!("[initialize_all_indices] Indices already exist ({} indices), skipping initialization", count);
        return Ok(count as usize);
    }
    let indices = fetch_all_indices().await
        .map_err(|e| format!("Failed to fetch indices: {}", e))?;
    println!("[initialize_all_indices] Fetched {} indices from API", indices.len());
    let db_save = db.clone();
    let saved_count = run_blocking_db(move || {
        let mut n = 0usize;
        for index in &indices {
            let index_info = crate::database::indices::IndexInfo {
                symbol: index.code.clone(),
                name: index.name.clone(),
                exchange: "BK".to_string(),
                sector_type: Some(index.sector_type.clone()),
                secid: index.secid.clone(),
            };
            if db_save.add_index(&index_info).is_ok() {
                n += 1;
            } else {
                eprintln!("[initialize_all_indices] Failed to save index {}", index.code);
            }
        }
        n
    });
    println!("[initialize_all_indices] Saved {} indices to database", saved_count);
    Ok(saved_count)
}

#[tauri::command]
pub async fn initialize_all_indices(
    db: State<'_, Arc<Database>>,
) -> Result<usize, String> {
    initialize_all_indices_internal(db.inner().clone()).await
}

pub async fn update_stock_index_relations_internal(db: &Arc<Database>, symbol: &str) -> Result<usize, String> {
    println!("[update_stock_index_relations] Updating relations for stock: {}", symbol);
    
    // Clear existing relations
    db.clear_stock_index_relations(symbol)
        .map_err(|e| format!("Failed to clear relations: {}", e))?;
    
    // Get related sectors/indices for this stock
    let sectors = get_related_sectors(symbol).await
        .map_err(|e| format!("Failed to get related sectors: {}", e))?;
    
    println!("[update_stock_index_relations] Found {} related indices for {}", sectors.len(), symbol);
    
    // Add relations to database
    let mut added_count = 0;
    for sector in &sectors {
        // Ensure the index exists in database
        if let Ok(None) = db.get_index_by_symbol(&sector.code) {
            let index_info = crate::database::indices::IndexInfo {
                symbol: sector.code.clone(),
                name: sector.name.clone(),
                exchange: "BK".to_string(),
                sector_type: Some(sector.sector_type.clone()),
                secid: sector.secid.clone(),
            };
            
            if let Err(e) = db.add_index(&index_info) {
                eprintln!("[update_stock_index_relations] Failed to add index {}: {}", sector.code, e);
                continue;
            }
        }
        
        // Add relation
        if let Err(e) = db.add_stock_index_relation(symbol, &sector.code) {
            eprintln!("[update_stock_index_relations] Failed to add relation {} -> {}: {}", symbol, sector.code, e);
        } else {
            added_count += 1;
        }
    }
    
    println!("[update_stock_index_relations] Added {} relations for {}", added_count, symbol);
    Ok(added_count)
}

#[tauri::command]
pub async fn update_stock_index_relations(
    db: State<'_, Arc<Database>>,
    symbol: String,
) -> Result<usize, String> {
    update_stock_index_relations_internal(&db, &symbol).await
}

#[tauri::command]
pub async fn get_indices_for_portfolio_stocks(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<crate::database::indices::IndexInfo>, String> {
    // Get all portfolio positions
    let positions = db.get_portfolio_positions()
        .map_err(|e| format!("Failed to get portfolio positions: {}", e))?;
    
    let stock_symbols: Vec<String> = positions.iter()
        .map(|(_, symbol, _, _, _, _)| symbol.clone())
        .collect();
    
    if stock_symbols.is_empty() {
        return Ok(Vec::new());
    }
    
    // Get indices for all portfolio stocks
    let indices = db.get_indices_for_stocks(&stock_symbols)
        .map_err(|e| format!("Failed to get indices: {}", e))?;
    
    Ok(indices)
}

#[tauri::command]
pub async fn refresh_indices_data_for_portfolio(
    db: State<'_, Arc<Database>>,
    cache: State<'_, Arc<crate::cache::StockCache>>,
) -> Result<usize, String> {
    let db_clone = db.inner().clone();
    let (positions,) = run_blocking_db(move || {
        let p = db_clone.get_portfolio_positions().map_err(|e| e.to_string())?;
        Ok::<_, String>((p,))
    }).map_err(|e| format!("Failed to get portfolio positions: {}", e))?;

    let stock_symbols: Vec<String> = positions.iter()
        .map(|(_, symbol, _, _, _, _)| symbol.clone())
        .collect();

    if stock_symbols.is_empty() {
        return Ok(0);
    }

    let db_clone2 = db.inner().clone();
    let syms = stock_symbols.clone();
    let indices = run_blocking_db(move || db_clone2.get_indices_for_stocks(&syms))
        .map_err(|e| format!("Failed to get indices: {}", e))?;

    if indices.is_empty() {
        return Ok(0);
    }

    println!("[refresh_indices_data_for_portfolio] Refreshing data for {} indices", indices.len());

    let mut refreshed_count = 0usize;
    for index in &indices {
        let symbol = index.secid.as_ref().unwrap_or(&index.symbol).to_string();

        let quote = match crate::stock_api::data::fetch_stock_quote(&symbol).await {
            Ok(q) => {
                cache.set_quote(symbol.clone(), q.clone()).await;
                Some(q)
            }
            Err(e) => {
                eprintln!("Failed to fetch quote for {}: {}", symbol, e);
                None
            }
        };

        let data_1m = match crate::stock_api::data::fetch_stock_history(&symbol, "1m").await {
            Ok(d) => Some(d),
            Err(e) => {
                eprintln!("Failed to fetch intraday data for {}: {}", symbol, e);
                None
            }
        };

        let data_1d = match crate::stock_api::data::fetch_stock_history(&symbol, "1d").await {
            Ok(d) => Some(d),
            Err(e) => {
                eprintln!("Failed to fetch daily data for {}: {}", symbol, e);
                None
            }
        };

        let db_save = db.inner().clone();
        run_blocking_db(move || {
            if let Some(ref q) = quote {
                if let Err(e) = db_save.save_quote(q) {
                    eprintln!("Failed to save quote for {}: {}", symbol, e);
                }
            }
            if let Some(ref d) = data_1m {
                if let Err(e) = db_save.save_kline(&symbol, "1m", d) {
                    eprintln!("Failed to save intraday data for {}: {}", symbol, e);
                }
            }
            if let Some(ref d) = data_1d {
                if let Err(e) = db_save.save_kline(&symbol, "1d", d) {
                    eprintln!("Failed to save daily data for {}: {}", symbol, e);
                }
            }
        });

        refreshed_count += 1;
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }

    println!("[refresh_indices_data_for_portfolio] Refreshed data for {} indices", refreshed_count);
    Ok(refreshed_count)
}
