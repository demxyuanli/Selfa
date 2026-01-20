use rusqlite::{Connection, Result, params};
use chrono::Utc;
use std::sync::Mutex;
use crate::stock_api::StockData;
use super::utils::ensure_stock_exists_with_name_from_quote;

pub fn save_time_series(conn: &Mutex<Connection>, symbol: &str, data: &[StockData]) -> Result<usize> {
    let conn = conn.lock().unwrap();
    ensure_stock_exists_with_name_from_quote(&conn, symbol)?;
    
    let now = Utc::now().to_rfc3339();
    let mut count = 0;
    
    let mut stmt = conn.prepare(
        "INSERT OR REPLACE INTO stock_time_series 
         (symbol, date, open, high, low, close, volume, created_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
    )?;
    
    for item in data {
        stmt.execute(params![
            symbol,
            item.date,
            item.open,
            item.high,
            item.low,
            item.close,
            item.volume,
            now
        ])?;
        count += 1;
    }
    
    Ok(count)
}

pub fn get_time_series(conn: &Mutex<Connection>, symbol: &str, limit: Option<i32>) -> Result<Vec<StockData>> {
    let conn = conn.lock().unwrap();
    let limit = limit.unwrap_or(240);
    
    let mut stmt = conn.prepare(
        "SELECT date, open, high, low, close, volume 
         FROM stock_time_series 
         WHERE symbol = ?1 
         ORDER BY date DESC 
         LIMIT ?2"
    )?;
    
    let rows = stmt.query_map(params![symbol, limit], |row| {
        Ok(StockData {
            date: row.get(0)?,
            open: row.get(1)?,
            high: row.get(2)?,
            low: row.get(3)?,
            close: row.get(4)?,
            volume: row.get(5)?,
        })
    })?;
    
    let mut data = Vec::new();
    for row in rows {
        data.push(row?);
    }
    data.reverse();
    Ok(data)
}

#[allow(dead_code)]
pub fn get_latest_time_series_date(conn: &Mutex<Connection>, symbol: &str) -> Result<Option<String>> {
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT date FROM stock_time_series 
         WHERE symbol = ?1 
         ORDER BY date DESC 
         LIMIT 1"
    )?;
    
    let mut rows = stmt.query_map(params![symbol], |row| {
        Ok(row.get::<_, String>(0)?)
    })?;
    
    if let Some(row) = rows.next() {
        Ok(Some(row?))
    } else {
        Ok(None)
    }
}
