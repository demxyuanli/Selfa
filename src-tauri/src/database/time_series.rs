use rusqlite::{Connection, Result, params};
use chrono::Utc;
use crate::stock_api::StockData;
use super::utils::ensure_stock_exists_with_name_from_quote;

pub fn save_time_series(conn: &Connection, symbol: &str, data: &[StockData]) -> Result<usize> {
    ensure_stock_exists_with_name_from_quote(conn, symbol)?;
    
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

pub fn get_time_series(conn: &Connection, symbol: &str, limit: Option<i32>) -> Result<Vec<StockData>> {
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
            amount: None,
            turnover_rate: None,
        })
    })?;
    
    let mut data = Vec::new();
    for row in rows {
        data.push(row?);
    }
    data.reverse();
    Ok(data)
}

pub fn get_batch_time_series(conn: &Connection, symbols: &[String], limit: Option<i32>) -> Result<std::collections::HashMap<String, Vec<StockData>>> {
    let limit = limit.unwrap_or(240);
    
    if symbols.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    
    // Build IN clause with placeholders
    let placeholders: Vec<String> = (1..=symbols.len()).map(|i| format!("?{}", i)).collect();
    let query = format!(
        "SELECT symbol, date, open, high, low, close, volume 
         FROM stock_time_series 
         WHERE symbol IN ({}) 
         ORDER BY symbol, date DESC",
        placeholders.join(", ")
    );
    
    let mut stmt = conn.prepare(&query)?;
    
    // Build params array from symbols
    let params: Vec<&dyn rusqlite::ToSql> = symbols.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    
    let rows = stmt.query_map(&params[..], |row| {
        Ok((
            row.get::<_, String>(0)?,
            StockData {
                date: row.get(1)?,
                open: row.get(2)?,
                high: row.get(3)?,
                low: row.get(4)?,
                close: row.get(5)?,
                volume: row.get(6)?,
                amount: None,
                turnover_rate: None,
            }
        ))
    })?;
    
    let mut result: std::collections::HashMap<String, Vec<StockData>> = std::collections::HashMap::new();
    
    // Initialize empty vectors for all symbols
    for symbol in symbols {
        result.insert(symbol.clone(), Vec::new());
    }
    
    // Group data by symbol
    for row in rows {
        let (symbol, data) = row?;
        if let Some(vec) = result.get_mut(&symbol) {
            vec.push(data);
        }
    }
    
    // Reverse each vector and limit
    for vec in result.values_mut() {
        vec.reverse();
        if vec.len() > limit as usize {
            vec.truncate(limit as usize);
        }
    }
    
    Ok(result)
}

#[allow(dead_code)]
pub fn get_latest_time_series_date(conn: &Connection, symbol: &str) -> Result<Option<String>> {
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
