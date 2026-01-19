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

use rusqlite::Connection;
use rusqlite::Result;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::stock_api::{StockData, StockInfo, StockQuote};

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data directory");
        
        std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
        
        let db_path = app_data_dir.join("stock_analyzer.db");
        let conn = Connection::open(db_path)?;
        
        let db = Database {
            conn: Mutex::new(conn),
        };
        
        let conn_guard = db.conn.lock().unwrap();
        schema::init_tables(&conn_guard)?;
        drop(conn_guard);
        
        Ok(db)
    }

    // Groups
    pub fn create_group(&self, name: &str) -> Result<i64> {
        groups::create_group(&self.conn, name)
    }

    pub fn get_groups(&self) -> Result<Vec<String>> {
        groups::get_groups(&self.conn)
    }

    #[allow(dead_code)]
    pub fn get_group_id_by_name(&self, name: &str) -> Result<Option<i64>> {
        groups::get_group_id_by_name(&self.conn, name)
    }

    pub fn update_group(&self, old_name: &str, new_name: &str) -> Result<()> {
        groups::update_group(&self.conn, old_name, new_name)
    }

    pub fn delete_group(&self, name: &str) -> Result<()> {
        groups::delete_group(&self.conn, name)
    }

    pub fn move_stock_to_group(&self, symbol: &str, group_name: Option<&str>) -> Result<()> {
        groups::move_stock_to_group(&self.conn, symbol, group_name)
    }

    // Stocks
    pub fn add_stock(&self, stock: &StockInfo, group_id: Option<i64>) -> Result<()> {
        stocks::add_stock(&self.conn, stock, group_id)
    }

    pub fn remove_stock(&self, symbol: &str) -> Result<()> {
        stocks::remove_stock(&self.conn, symbol)
    }

    pub fn restore_stock(&self, symbol: &str) -> Result<()> {
        stocks::restore_stock(&self.conn, symbol)
    }

    pub fn update_stocks_order(&self, symbols: &[String]) -> Result<()> {
        stocks::update_stocks_order(&self.conn, symbols)
    }

    pub fn get_stocks_by_group(&self, group_name: Option<&str>) -> Result<Vec<StockInfo>> {
        stocks::get_stocks_by_group(&self.conn, group_name)
    }

    // Tags
    pub fn create_tag(&self, name: &str, color: &str) -> Result<i64> {
        tags::create_tag(&self.conn, name, color)
    }

    pub fn get_all_tags(&self) -> Result<Vec<(i64, String, String)>> {
        tags::get_all_tags(&self.conn)
    }

    pub fn update_tag(&self, tag_id: i64, name: &str, color: &str) -> Result<()> {
        tags::update_tag(&self.conn, tag_id, name, color)
    }

    pub fn delete_tag(&self, tag_id: i64) -> Result<()> {
        tags::delete_tag(&self.conn, tag_id)
    }

    pub fn add_tag_to_stock(&self, symbol: &str, tag_id: i64) -> Result<()> {
        tags::add_tag_to_stock(&self.conn, symbol, tag_id)
    }

    pub fn remove_tag_from_stock(&self, symbol: &str, tag_id: i64) -> Result<()> {
        tags::remove_tag_from_stock(&self.conn, symbol, tag_id)
    }

    pub fn get_stock_tags(&self, symbol: &str) -> Result<Vec<(i64, String, String)>> {
        tags::get_stock_tags(&self.conn, symbol)
    }

    pub fn get_stocks_by_tag(&self, tag_id: i64) -> Result<Vec<StockInfo>> {
        tags::get_stocks_by_tag(&self.conn, tag_id)
    }

    #[allow(dead_code)]
    pub fn get_stocks_with_tags(&self) -> Result<Vec<(StockInfo, Vec<(i64, String, String)>)>> {
        tags::get_stocks_with_tags(&self.conn)
    }

    // Time Series
    pub fn save_time_series(&self, symbol: &str, data: &[StockData]) -> Result<usize> {
        time_series::save_time_series(&self.conn, symbol, data)
    }

    pub fn get_time_series(&self, symbol: &str, limit: Option<i32>) -> Result<Vec<StockData>> {
        time_series::get_time_series(&self.conn, symbol, limit)
    }

    #[allow(dead_code)]
    pub fn get_latest_time_series_date(&self, symbol: &str) -> Result<Option<String>> {
        time_series::get_latest_time_series_date(&self.conn, symbol)
    }

    // Kline
    pub fn save_kline(&self, symbol: &str, period: &str, data: &[StockData]) -> Result<usize> {
        kline::save_kline(&self.conn, symbol, period, data)
    }

    pub fn get_kline(&self, symbol: &str, period: &str, limit: Option<i32>) -> Result<Vec<StockData>> {
        kline::get_kline(&self.conn, symbol, period, limit)
    }

    pub fn get_latest_kline_date(&self, symbol: &str, period: &str) -> Result<Option<String>> {
        kline::get_latest_kline_date(&self.conn, symbol, period)
    }

    // Quotes
    pub fn save_quote(&self, quote: &StockQuote) -> Result<()> {
        quotes::save_quote(&self.conn, quote)
    }

    #[allow(dead_code)]
    pub fn get_quote(&self, symbol: &str) -> Result<Option<StockQuote>> {
        quotes::get_quote(&self.conn, symbol)
    }

    // Alerts
    pub fn create_price_alert(
        &self,
        symbol: &str,
        threshold_price: f64,
        direction: &str,
    ) -> Result<i64> {
        alerts::create_price_alert(&self.conn, symbol, threshold_price, direction)
    }

    pub fn get_price_alerts(&self, symbol: Option<&str>) -> Result<Vec<(i64, String, f64, String, bool, bool)>> {
        alerts::get_price_alerts(&self.conn, symbol)
    }

    pub fn update_price_alert(
        &self,
        alert_id: i64,
        threshold_price: Option<f64>,
        direction: Option<&str>,
        enabled: Option<bool>,
    ) -> Result<()> {
        alerts::update_price_alert(&self.conn, alert_id, threshold_price, direction, enabled)
    }

    pub fn delete_price_alert(&self, alert_id: i64) -> Result<()> {
        alerts::delete_price_alert(&self.conn, alert_id)
    }

    pub fn get_active_price_alerts(&self) -> Result<Vec<(i64, String, f64, String)>> {
        alerts::get_active_price_alerts(&self.conn)
    }

    pub fn mark_alert_triggered(&self, alert_id: i64) -> Result<()> {
        alerts::mark_alert_triggered(&self.conn, alert_id)
    }

    pub fn reset_alert_triggered(&self, alert_id: i64) -> Result<()> {
        alerts::reset_alert_triggered(&self.conn, alert_id)
    }

    // Cache
    pub fn update_stock_cache(&self, stocks: &[StockInfo]) -> Result<()> {
        cache::update_stock_cache(&self.conn, stocks)
    }

    pub fn search_stocks_from_cache(&self, query: &str, limit: usize) -> Result<Vec<StockInfo>> {
        cache::search_stocks_from_cache(&self.conn, query, limit)
    }

    pub fn get_stock_cache_count(&self) -> Result<i64> {
        cache::get_stock_cache_count(&self.conn)
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
        portfolio::add_portfolio_position(&self.conn, symbol, name, quantity, avg_cost, current_price)
    }

    pub fn update_portfolio_position_price(&self, symbol: &str, current_price: f64) -> Result<()> {
        portfolio::update_portfolio_position_price(&self.conn, symbol, current_price)
    }

    pub fn update_portfolio_position(&self, id: i64, quantity: i64, avg_cost: f64) -> Result<()> {
        portfolio::update_portfolio_position(&self.conn, id, quantity, avg_cost)
    }

    pub fn get_portfolio_positions(&self) -> Result<Vec<(i64, String, String, i64, f64, Option<f64>)>> {
        portfolio::get_portfolio_positions(&self.conn)
    }

    pub fn delete_portfolio_position(&self, id: i64) -> Result<()> {
        portfolio::delete_portfolio_position(&self.conn, id)
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
    ) -> Result<i64> {
        portfolio::add_portfolio_transaction(&self.conn, symbol, transaction_type, quantity, price, commission, transaction_date, notes)
    }

    pub fn get_portfolio_transactions(&self, symbol: Option<&str>) -> Result<Vec<(i64, String, String, i64, f64, f64, f64, String, Option<String>)>> {
        portfolio::get_portfolio_transactions(&self.conn, symbol)
    }

    pub fn update_portfolio_transaction(
        &self,
        id: i64,
        quantity: i64,
    ) -> Result<()> {
        portfolio::update_portfolio_transaction(&self.conn, id, quantity)
    }

    pub fn delete_portfolio_transaction(&self, id: i64) -> Result<()> {
        portfolio::delete_portfolio_transaction(&self.conn, id)
    }

    pub fn recalculate_all_positions_from_transactions(&self) -> Result<()> {
        portfolio::recalculate_all_positions_from_transactions(&self.conn)
    }
}
