mod schema;
mod utils;
mod groups;
mod stocks;
mod tags;
mod time_series;
mod kline;
mod quotes;
mod alerts;
mod cache;
mod portfolio;
mod transfers;
mod settings;
pub mod indices;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use r2d2_sqlite::rusqlite::{Result, ffi};
use tauri::{AppHandle, Manager};

use crate::stock_api::{StockData, StockInfo, StockQuote};

/// Run blocking DB work off the async worker pool to avoid stalling the runtime.
/// Use for all DB access from async contexts (commands, background tasks).
pub fn run_blocking_db<F, R>(f: F) -> R
where
    F: FnOnce() -> R + Send,
    R: Send,
{
    tokio::task::block_in_place(f)
}

pub struct Database {
    pool: Pool<SqliteConnectionManager>,
}

impl Database {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data directory");
        
        std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
        
        let db_path = app_data_dir.join("stock_analyzer.db");
        
        let manager = SqliteConnectionManager::file(db_path)
            .with_init(|c| {
                c.execute_batch(
                    "PRAGMA journal_mode = WAL;
                     PRAGMA synchronous = NORMAL;
                     PRAGMA foreign_keys = ON;"
                )?;
                c.busy_timeout(std::time::Duration::from_secs(5))?;
                Ok(())
            });
            
        let pool = Pool::builder()
            .max_size(10)
            .build(manager)
            .map_err(|e| r2d2_sqlite::rusqlite::Error::SqliteFailure(
                ffi::Error::new(ffi::SQLITE_ERROR),
                Some(e.to_string())
            ))?;
        
        let db = Database {
            pool,
        };
        
        let conn = db.pool.get().unwrap();
        schema::init_tables(&conn)?;
        
        Ok(db)
    }

    fn get_conn(&self) -> Result<r2d2::PooledConnection<SqliteConnectionManager>> {
        self.pool.get().map_err(|e| r2d2_sqlite::rusqlite::Error::SqliteFailure(
            ffi::Error::new(ffi::SQLITE_ERROR),
            Some(e.to_string())
        ))
    }

    // Groups
    pub fn create_group(&self, name: &str) -> Result<i64> {
        let conn = self.get_conn()?;
        groups::create_group(&conn, name)
    }

    pub fn get_groups(&self) -> Result<Vec<String>> {
        let conn = self.get_conn()?;
        groups::get_groups(&conn)
    }

    #[allow(dead_code)]
    pub fn get_group_id_by_name(&self, name: &str) -> Result<Option<i64>> {
        let conn = self.get_conn()?;
        groups::get_group_id_by_name(&conn, name)
    }

    pub fn update_group(&self, old_name: &str, new_name: &str) -> Result<()> {
        let conn = self.get_conn()?;
        groups::update_group(&conn, old_name, new_name)
    }

    pub fn delete_group(&self, name: &str) -> Result<()> {
        let conn = self.get_conn()?;
        groups::delete_group(&conn, name)
    }

    pub fn move_stock_to_group(&self, symbol: &str, group_name: Option<&str>) -> Result<()> {
        let conn = self.get_conn()?;
        groups::move_stock_to_group(&conn, symbol, group_name)
    }

    // Stocks
    pub fn add_stock(&self, stock: &StockInfo, group_id: Option<i64>) -> Result<()> {
        let conn = self.get_conn()?;
        stocks::add_stock(&conn, stock, group_id)
    }

    pub fn remove_stock(&self, symbol: &str) -> Result<()> {
        let conn = self.get_conn()?;
        stocks::remove_stock(&conn, symbol)
    }

    pub fn restore_stock(&self, symbol: &str) -> Result<()> {
        let conn = self.get_conn()?;
        stocks::restore_stock(&conn, symbol)
    }

    pub fn update_stocks_order(&self, symbols: &[String]) -> Result<()> {
        let conn = self.get_conn()?;
        stocks::update_stocks_order(&conn, symbols)
    }

    pub fn get_stocks_by_group(&self, group_name: Option<&str>) -> Result<Vec<StockInfo>> {
        let conn = self.get_conn()?;
        stocks::get_stocks_by_group(&conn, group_name)
    }

    // Tags
    pub fn create_tag(&self, name: &str, color: &str) -> Result<i64> {
        let conn = self.get_conn()?;
        tags::create_tag(&conn, name, color)
    }

    pub fn get_all_tags(&self) -> Result<Vec<(i64, String, String)>> {
        let conn = self.get_conn()?;
        tags::get_all_tags(&conn)
    }

    pub fn update_tag(&self, tag_id: i64, name: &str, color: &str) -> Result<()> {
        let conn = self.get_conn()?;
        tags::update_tag(&conn, tag_id, name, color)
    }

    pub fn delete_tag(&self, tag_id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        tags::delete_tag(&conn, tag_id)
    }

    pub fn add_tag_to_stock(&self, symbol: &str, tag_id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        tags::add_tag_to_stock(&conn, symbol, tag_id)
    }

    pub fn remove_tag_from_stock(&self, symbol: &str, tag_id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        tags::remove_tag_from_stock(&conn, symbol, tag_id)
    }

    pub fn get_stock_tags(&self, symbol: &str) -> Result<Vec<String>> {
        let conn = self.get_conn()?;
        tags::get_stock_tags(&conn, symbol)
    }

    pub fn get_all_stock_tags_map(&self) -> Result<std::collections::HashMap<String, Vec<String>>> {
        let conn = self.get_conn()?;
        tags::get_all_stock_tags_map(&conn)
    }


    pub fn get_stocks_by_tag(&self, tag_id: i64) -> Result<Vec<StockInfo>> {
        let conn = self.get_conn()?;
        tags::get_stocks_by_tag(&conn, tag_id)
    }

    #[allow(dead_code)]
    pub fn get_stocks_with_tags(&self) -> Result<Vec<(StockInfo, Vec<(i64, String, String)>)>> {
        let conn = self.get_conn()?;
        tags::get_stocks_with_tags(&conn)
    }

    // Time Series
    pub fn save_time_series(&self, symbol: &str, data: &[StockData]) -> Result<usize> {
        let conn = self.get_conn()?;
        time_series::save_time_series(&conn, symbol, data)
    }

    pub fn get_time_series(&self, symbol: &str, limit: Option<i32>) -> Result<Vec<StockData>> {
        let conn = self.get_conn()?;
        time_series::get_time_series(&conn, symbol, limit)
    }

    pub fn get_batch_time_series(&self, symbols: &[String], limit: Option<i32>) -> Result<std::collections::HashMap<String, Vec<StockData>>> {
        let conn = self.get_conn()?;
        time_series::get_batch_time_series(&conn, symbols, limit)
    }

    #[allow(dead_code)]
    pub fn get_latest_time_series_date(&self, symbol: &str) -> Result<Option<String>> {
        let conn = self.get_conn()?;
        time_series::get_latest_time_series_date(&conn, symbol)
    }

    // Kline
    pub fn save_kline(&self, symbol: &str, period: &str, data: &[StockData]) -> Result<usize> {
        let conn = self.get_conn()?;
        kline::save_kline(&conn, symbol, period, data)
    }

    pub fn get_kline(&self, symbol: &str, period: &str, limit: Option<i32>) -> Result<Vec<StockData>> {
        let conn = self.get_conn()?;
        kline::get_kline(&conn, symbol, period, limit)
    }

    pub fn get_latest_kline_date(&self, symbol: &str, period: &str) -> Result<Option<String>> {
        let conn = self.get_conn()?;
        kline::get_latest_kline_date(&conn, symbol, period)
    }

    // Quotes
    pub fn save_quote(&self, quote: &StockQuote) -> Result<()> {
        let conn = self.get_conn()?;
        quotes::save_quote(&conn, quote)
    }

    #[allow(dead_code)]
    pub fn get_quote(&self, symbol: &str) -> Result<Option<StockQuote>> {
        let conn = self.get_conn()?;
        quotes::get_quote(&conn, symbol)
    }

    // Alerts
    pub fn create_price_alert(
        &self,
        symbol: &str,
        threshold_price: f64,
        direction: &str,
    ) -> Result<i64> {
        let conn = self.get_conn()?;
        alerts::create_price_alert(&conn, symbol, threshold_price, direction)
    }

    pub fn get_price_alerts(&self, symbol: Option<&str>) -> Result<Vec<(i64, String, f64, String, bool, bool)>> {
        let conn = self.get_conn()?;
        alerts::get_price_alerts(&conn, symbol)
    }

    pub fn update_price_alert(
        &self,
        alert_id: i64,
        threshold_price: Option<f64>,
        direction: Option<&str>,
        enabled: Option<bool>,
    ) -> Result<()> {
        let conn = self.get_conn()?;
        alerts::update_price_alert(&conn, alert_id, threshold_price, direction, enabled)
    }

    pub fn delete_price_alert(&self, alert_id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        alerts::delete_price_alert(&conn, alert_id)
    }

    pub fn get_active_price_alerts(&self, valid_date: &str) -> Result<Vec<(i64, String, f64, String)>> {
        let conn = self.get_conn()?;
        alerts::get_active_price_alerts(&conn, valid_date)
    }

    pub fn mark_alert_triggered(&self, alert_id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        alerts::mark_alert_triggered(&conn, alert_id)
    }

    pub fn reset_alert_triggered(&self, alert_id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        alerts::reset_alert_triggered(&conn, alert_id)
    }

    pub fn reset_all_triggered_alerts(&self) -> Result<usize> {
        let conn = self.get_conn()?;
        alerts::reset_all_triggered_alerts(&conn)
    }

    pub fn create_price_alert_with_meta(
        &self,
        symbol: &str,
        threshold_price: f64,
        direction: &str,
        valid_date: &str,
        source: &str,
    ) -> Result<i64> {
        let conn = self.get_conn()?;
        alerts::create_price_alert_with_meta(&conn, symbol, threshold_price, direction, valid_date, source)
    }

    pub fn delete_price_alerts_by_source_and_date(&self, source: &str, valid_date: &str) -> Result<usize> {
        let conn = self.get_conn()?;
        alerts::delete_price_alerts_by_source_and_date(&conn, source, valid_date)
    }

    pub fn delete_price_alerts_by_symbol_source_and_date(
        &self,
        symbol: &str,
        source: &str,
        valid_date: &str,
    ) -> Result<usize> {
        let conn = self.get_conn()?;
        alerts::delete_price_alerts_by_symbol_source_and_date(&conn, symbol, source, valid_date)
    }

    pub fn delete_price_alerts_before_date(&self, date: &str) -> Result<usize> {
        let conn = self.get_conn()?;
        alerts::delete_price_alerts_before_date(&conn, date)
    }

    // Cache
    pub fn update_stock_cache(&self, stocks: &[StockInfo]) -> Result<()> {
        let conn = self.get_conn()?;
        cache::update_stock_cache(&conn, stocks)
    }

    pub fn search_stocks_from_cache(&self, query: &str, limit: usize) -> Result<Vec<StockInfo>> {
        let conn = self.get_conn()?;
        cache::search_stocks_from_cache(&conn, query, limit)
    }

    pub fn get_stock_cache_count(&self) -> Result<i64> {
        let conn = self.get_conn()?;
        cache::get_stock_cache_count(&conn)
    }

    pub fn upsert_fetch_state(&self, key: &str, last_fetch_ts: u64) -> Result<()> {
        let conn = self.get_conn()?;
        conn.execute(
            "INSERT OR REPLACE INTO api_fetch_state (key, last_fetch_ts) VALUES (?1, ?2)",
            r2d2_sqlite::rusqlite::params![key, last_fetch_ts as i64],
        )?;
        Ok(())
    }

    pub fn get_all_fetch_states(&self) -> Result<std::collections::HashMap<String, u64>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare("SELECT key, last_fetch_ts FROM api_fetch_state")?;
        let mut map = std::collections::HashMap::new();
        let rows = stmt.query_map([], |row| {
            let key: String = row.get(0)?;
            let ts: i64 = row.get(1)?;
            Ok((key, ts))
        })?;
        for row in rows {
            let (key, ts) = row?;
            if ts >= 0 {
                map.insert(key, ts as u64);
            }
        }
        Ok(map)
    }

    // Portfolio
    pub fn add_portfolio_position(
        &self,
        symbol: &str,
        name: &str,
        quantity: i64,
        avg_cost: f64,
        current_price: Option<f64>,
    ) -> Result<i64> {
        let conn = self.get_conn()?;
        portfolio::add_portfolio_position(&conn, symbol, name, quantity, avg_cost, current_price)
    }

    pub fn update_portfolio_position_price(&self, symbol: &str, current_price: f64) -> Result<()> {
        let conn = self.get_conn()?;
        portfolio::update_portfolio_position_price(&conn, symbol, current_price)
    }

    pub fn update_portfolio_position(&self, id: i64, quantity: i64, avg_cost: f64) -> Result<()> {
        let conn = self.get_conn()?;
        portfolio::update_portfolio_position(&conn, id, quantity, avg_cost)
    }

    pub fn get_portfolio_positions(&self) -> Result<Vec<(i64, String, String, i64, f64, Option<f64>)>> {
        // Removed automatic recalculation - positions are already updated when transactions are added/updated/deleted
        // Only call recalculate_all_positions_from_transactions manually when needed (e.g., data migration or repair)
        let conn = self.get_conn()?;
        portfolio::get_portfolio_positions(&conn)
    }

    pub fn delete_portfolio_position(&self, id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        portfolio::delete_portfolio_position(&conn, id)
    }

    pub fn add_portfolio_transaction(
        &self,
        symbol: &str,
        transaction_type: &str,
        quantity: i64,
        price: f64,
        commission: f64,
        transaction_date: &str,
        notes: Option<&str>,
        stock_name: Option<&str>,
    ) -> Result<i64> {
        let conn = self.get_conn()?;
        portfolio::add_portfolio_transaction(&conn, symbol, transaction_type, quantity, price, commission, transaction_date, notes, stock_name)
    }

    pub fn get_portfolio_transactions(&self, symbol: Option<&str>) -> Result<Vec<(i64, String, String, i64, f64, f64, f64, String, Option<String>)>> {
        let conn = self.get_conn()?;
        portfolio::get_portfolio_transactions(&conn, symbol)
    }

    pub fn update_portfolio_transaction(
        &self,
        id: i64,
        quantity: i64,
    ) -> Result<()> {
        let conn = self.get_conn()?;
        portfolio::update_portfolio_transaction(&conn, id, quantity)
    }

    pub fn delete_portfolio_transaction(&self, id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        portfolio::delete_portfolio_transaction(&conn, id)
    }

    pub fn recalculate_all_positions_from_transactions(&self) -> Result<()> {
        let conn = self.get_conn()?;
        portfolio::recalculate_all_positions_from_transactions(&conn)
    }

    // Capital Transfers
    pub fn add_capital_transfer(
        &self,
        transfer_type: &str,
        amount: f64,
        transfer_date: &str,
        notes: Option<&str>,
    ) -> Result<i64> {
        let conn = self.get_conn()?;
        transfers::add_capital_transfer(&conn, transfer_type, amount, transfer_date, notes)
    }

    pub fn get_capital_transfers(&self) -> Result<Vec<(i64, String, f64, String, Option<String>)>> {
        let conn = self.get_conn()?;
        transfers::get_capital_transfers(&conn)
    }

    pub fn update_capital_transfer(
        &self,
        id: i64,
        transfer_type: Option<&str>,
        amount: Option<f64>,
        transfer_date: Option<&str>,
        notes: Option<&str>,
    ) -> Result<()> {
        let conn = self.get_conn()?;
        transfers::update_capital_transfer(&conn, id, transfer_type, amount, transfer_date, notes)
    }

    pub fn delete_capital_transfer(&self, id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        transfers::delete_capital_transfer(&conn, id)
    }

    pub fn get_total_capital(&self) -> Result<f64> {
        let conn = self.get_conn()?;
        transfers::get_total_capital(&conn)
    }

    // Portfolio Settings
    pub fn get_initial_balance(&self) -> Result<Option<f64>> {
        let conn = self.get_conn()?;
        settings::get_initial_balance(&conn)
    }

    pub fn set_initial_balance(&self, balance: f64) -> Result<()> {
        let conn = self.get_conn()?;
        settings::set_initial_balance(&conn, balance)
    }

    // Indices
    pub fn add_index(&self, index: &indices::IndexInfo) -> Result<()> {
        let conn = self.get_conn()?;
        indices::add_index(&conn, index)
    }

    #[allow(dead_code)]
    pub fn get_all_indices(&self) -> Result<Vec<indices::IndexInfo>> {
        let conn = self.get_conn()?;
        indices::get_all_indices(&conn)
    }

    pub fn get_index_by_symbol(&self, symbol: &str) -> Result<Option<indices::IndexInfo>> {
        let conn = self.get_conn()?;
        indices::get_index_by_symbol(&conn, symbol)
    }

    pub fn add_stock_index_relation(&self, stock_symbol: &str, index_symbol: &str) -> Result<()> {
        let conn = self.get_conn()?;
        indices::add_stock_index_relation(&conn, stock_symbol, index_symbol)
    }

    #[allow(dead_code)]
    pub fn get_indices_for_stock(&self, stock_symbol: &str) -> Result<Vec<indices::IndexInfo>> {
        let conn = self.get_conn()?;
        indices::get_indices_for_stock(&conn, stock_symbol)
    }

    pub fn get_indices_for_stocks(&self, stock_symbols: &[String]) -> Result<Vec<indices::IndexInfo>> {
        let conn = self.get_conn()?;
        indices::get_indices_for_stocks(&conn, stock_symbols)
    }

    pub fn clear_stock_index_relations(&self, stock_symbol: &str) -> Result<()> {
        let conn = self.get_conn()?;
        indices::clear_stock_index_relations(&conn, stock_symbol)
    }

    pub fn get_index_count(&self) -> Result<i64> {
        let conn = self.get_conn()?;
        indices::get_index_count(&conn)
    }
}
