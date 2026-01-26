use rusqlite::{Connection, Result, params};
use chrono::Utc;
use crate::stock_api::StockInfo;

pub fn update_stock_cache(conn: &Connection, stocks: &[StockInfo]) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    
    conn.execute("DELETE FROM stock_cache", [])?;
    
    let mut stmt = conn.prepare(
        "INSERT OR REPLACE INTO stock_cache (symbol, name, exchange, updated_at) VALUES (?1, ?2, ?3, ?4)"
    )?;
    
    for stock in stocks {
        stmt.execute(params![stock.symbol, stock.name, stock.exchange, now])?;
    }
    
    Ok(())
}

pub fn search_stocks_from_cache(conn: &Connection, query: &str, limit: usize) -> Result<Vec<StockInfo>> {
    let search_pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT symbol, name, exchange FROM stock_cache 
         WHERE symbol LIKE ?1 OR name LIKE ?1 
         ORDER BY 
             CASE 
                 WHEN symbol = ?2 THEN 1
                 WHEN symbol LIKE ?3 THEN 2
                 WHEN name LIKE ?1 THEN 3
                 ELSE 4
             END,
             symbol
         LIMIT ?4"
    )?;
    
    let symbol_pattern = format!("{}%", query);
    let rows = stmt.query_map(params![search_pattern, query, symbol_pattern, limit as i32], |row| {
        Ok(StockInfo {
            symbol: row.get(0)?,
            name: row.get(1)?,
            exchange: row.get(2)?,
        })
    })?;
    
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    
    Ok(results)
}

pub fn get_stock_cache_count(conn: &Connection) -> Result<i64> {
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM stock_cache")?;
    let count: i64 = stmt.query_row([], |row| row.get(0))?;
    Ok(count)
}
