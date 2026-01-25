// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod stock_api;
mod database;
mod cache;
mod commands;

use database::Database;
use cache::StockCache;
use commands::*;
use stock_api::utils::should_reset_triggered_alerts;
use commands::stock_search::refresh_stock_cache_internal;
use std::sync::Arc;
use tauri::Manager;
use chrono::{Local, Timelike};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let db = Database::new(app.handle())
                .map_err(|e| format!("Failed to initialize database: {}", e))?;

            let db_arc = Arc::new(db);
            let cache = Arc::new(StockCache::new());
            
            // Start background task to batch write cached data to database
            let cache_for_write = cache.clone();
            let db_for_write = db_arc.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
                
                loop {
                    interval.tick().await;
                    
                    let quotes = cache_for_write.get_pending_quotes().await;
                    if !quotes.is_empty() {
                        for (_, quote) in quotes {
                            if let Err(e) = db_for_write.save_quote(&quote) {
                                eprintln!("Failed to batch save quote for {}: {}", quote.symbol, e);
                            }
                        }
                    }
                    
                    let time_series = cache_for_write.get_pending_time_series().await;
                    if !time_series.is_empty() {
                        for (symbol, data) in time_series {
                            if let Err(e) = db_for_write.save_time_series(&symbol, &data) {
                                eprintln!("Failed to batch save time series for {}: {}", symbol, e);
                            }
                        }
                    }
                    
                    let history = cache_for_write.get_pending_history().await;
                    if !history.is_empty() {
                        for (key, (period, data)) in history {
                            if let Some((symbol, _)) = key.split_once(':') {
                                if let Err(e) = db_for_write.save_kline(symbol, &period, &data) {
                                    eprintln!("Failed to batch save history for {} {}: {}", symbol, period, e);
                                }
                            }
                        }
                    }
                }
            });
            
            // Start background task to cleanup expired cache entries
            let cache_for_cleanup = cache.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(300));
                
                loop {
                    interval.tick().await;
                    cache_for_cleanup.cleanup_expired().await;
                }
            });
            
            // Start background task to auto-reset triggered alerts after 15:00 each trading day
            let db_for_alerts = db_arc.clone();
            tauri::async_runtime::spawn(async move {
                let mut last_reset_date: Option<chrono::NaiveDate> = None;
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
                
                loop {
                    interval.tick().await;
                    
                    if should_reset_triggered_alerts() {
                        let today = Local::now().date_naive();
                        
                        if last_reset_date != Some(today) {
                            match db_for_alerts.reset_all_triggered_alerts() {
                                Ok(count) => {
                                    if count > 0 {
                                        println!("Auto-reset {} triggered alerts after 15:00", count);
                                    }
                                    last_reset_date = Some(today);
                                }
                                Err(e) => {
                                    eprintln!("Failed to auto-reset triggered alerts: {}", e);
                                }
                            }
                        }
                    } else {
                        let now = Local::now();
                        let hour = now.hour();
                        if hour < 15 {
                            last_reset_date = None;
                        }
                    }
                }
            });
            
            // Start background task to initialize and periodically update stock cache
            let db_for_cache = db_arc.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                
                let cache_count = match db_for_cache.get_stock_cache_count() {
                    Ok(count) => count,
                    Err(e) => {
                        eprintln!("Failed to check stock cache: {}", e);
                        return;
                    }
                };
                
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
                
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(24 * 60 * 60));
                interval.tick().await;
                
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
            
            // Start background task to initialize all indices
            let db_for_indices = db_arc.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                
                let index_count = match db_for_indices.get_index_count() {
                    Ok(count) => count,
                    Err(e) => {
                        eprintln!("Failed to check index count: {}", e);
                        return;
                    }
                };
                
                if index_count == 0 {
                    println!("Initializing indices database for the first time...");
                    match crate::commands::indices::initialize_all_indices_internal(&db_for_indices).await {
                        Ok(count) => {
                            println!("Indices database initialized with {} indices", count);
                        }
                        Err(e) => {
                            eprintln!("Failed to initialize indices: {}", e);
                        }
                    }
                } else {
                    println!("Indices database already exists with {} indices", index_count);
                }
            });
            
            app.manage(db_arc);
            app.manage(cache);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_stock_quote,
            get_stock_history,
            get_time_series,
            get_batch_time_series,
            get_intraday_time_series,
            get_batch_intraday_time_series,
            get_stock_data_bundle,
            get_batch_stock_data_bundle,
            get_stock_sectors,
            get_chip_analysis,
            get_similarity_prediction,
            search_stocks,
            filter_stocks,
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
            predict_stock_price_with_config,
            ai_analyze_stock,
            get_intraday_analysis,
            run_backtest_command,
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
            update_portfolio_position,
            delete_portfolio_position,
            add_portfolio_transaction,
            get_portfolio_transactions,
            update_portfolio_transaction,
            delete_portfolio_transaction,
            recalculate_all_positions_from_transactions,
            add_capital_transfer,
            get_capital_transfers,
            update_capital_transfer,
            delete_capital_transfer,
            get_total_capital,
            get_initial_balance,
            set_initial_balance,
            initialize_all_indices,
            update_stock_index_relations,
            get_indices_for_portfolio_stocks,
            refresh_indices_data_for_portfolio
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
