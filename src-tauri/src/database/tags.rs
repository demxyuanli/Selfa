use rusqlite::{Connection, Result, params};
use chrono::Utc;
use std::sync::Mutex;
use crate::stock_api::StockInfo;

pub fn create_tag(conn: &Mutex<Connection>, name: &str, color: &str) -> Result<i64> {
    let conn = conn.lock().unwrap();
    
    let mut stmt = conn.prepare("SELECT id FROM stock_tags WHERE name = ?1")?;
    let mut rows = stmt.query_map(params![name], |row| {
        Ok(row.get::<_, i64>(0)?)
    })?;
    
    if let Some(row) = rows.next() {
        return Ok(row?);
    }
    
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO stock_tags (name, color, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![name, color, now],
    )?;
    
    Ok(conn.last_insert_rowid())
}

pub fn get_all_tags(conn: &Mutex<Connection>) -> Result<Vec<(i64, String, String)>> {
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, name, color FROM stock_tags ORDER BY name")?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    
    let mut tags = Vec::new();
    for row in rows {
        tags.push(row?);
    }
    Ok(tags)
}

pub fn update_tag(conn: &Mutex<Connection>, tag_id: i64, name: &str, color: &str) -> Result<()> {
    let conn = conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "UPDATE stock_tags SET name = ?1, color = ?2, updated_at = ?3 WHERE id = ?4",
        params![name, color, now, tag_id],
    )?;
    
    Ok(())
}

pub fn delete_tag(conn: &Mutex<Connection>, tag_id: i64) -> Result<()> {
    let conn = conn.lock().unwrap();
    
    conn.execute(
        "DELETE FROM stock_tag_relations WHERE tag_id = ?1",
        params![tag_id],
    )?;
    
    conn.execute(
        "DELETE FROM stock_tags WHERE id = ?1",
        params![tag_id],
    )?;
    
    Ok(())
}

pub fn add_tag_to_stock(conn: &Mutex<Connection>, symbol: &str, tag_id: i64) -> Result<()> {
    let conn = conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT OR IGNORE INTO stock_tag_relations (symbol, tag_id, created_at) VALUES (?1, ?2, ?3)",
        params![symbol, tag_id, now],
    )?;
    
    Ok(())
}

pub fn remove_tag_from_stock(conn: &Mutex<Connection>, symbol: &str, tag_id: i64) -> Result<()> {
    let conn = conn.lock().unwrap();
    
    conn.execute(
        "DELETE FROM stock_tag_relations WHERE symbol = ?1 AND tag_id = ?2",
        params![symbol, tag_id],
    )?;
    
    Ok(())
}

pub fn get_stock_tags(conn: &Mutex<Connection>, symbol: &str) -> Result<Vec<(i64, String, String)>> {
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color 
         FROM stock_tags t 
         JOIN stock_tag_relations r ON t.id = r.tag_id 
         WHERE r.symbol = ?1 
         ORDER BY t.name"
    )?;
    
    let rows = stmt.query_map(params![symbol], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    
    let mut tags = Vec::new();
    for row in rows {
        tags.push(row?);
    }
    Ok(tags)
}

pub fn get_stocks_by_tag(conn: &Mutex<Connection>, tag_id: i64) -> Result<Vec<StockInfo>> {
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT s.symbol, s.name, s.exchange 
         FROM stocks s 
         JOIN stock_tag_relations r ON s.symbol = r.symbol 
         WHERE r.tag_id = ?1 AND s.visible = 1
         ORDER BY s.sort_order, s.symbol"
    )?;
    
    let rows = stmt.query_map(params![tag_id], |row| {
        Ok(StockInfo {
            symbol: row.get(0)?,
            name: row.get(1)?,
            exchange: row.get(2)?,
        })
    })?;
    
    let mut stocks = Vec::new();
    for row in rows {
        stocks.push(row?);
    }
    Ok(stocks)
}

#[allow(dead_code)]
pub fn get_stocks_with_tags(conn: &Mutex<Connection>) -> Result<Vec<(StockInfo, Vec<(i64, String, String)>)>> {
    let conn = conn.lock().unwrap();
    
    let mut stmt = conn.prepare("SELECT symbol, name, exchange FROM stocks WHERE visible = 1 ORDER BY sort_order, symbol")?;
    let stock_rows = stmt.query_map([], |row| {
        Ok(StockInfo {
            symbol: row.get(0)?,
            name: row.get(1)?,
            exchange: row.get(2)?,
        })
    })?;
    
    let mut stocks: Vec<StockInfo> = Vec::new();
    for row in stock_rows {
        stocks.push(row?);
    }
    
    let mut result = Vec::new();
    let mut tag_stmt = conn.prepare(
        "SELECT t.id, t.name, t.color 
         FROM stock_tags t 
         JOIN stock_tag_relations r ON t.id = r.tag_id 
         WHERE r.symbol = ?1 
         ORDER BY t.name"
    )?;
    
    for stock in stocks {
        let tag_rows = tag_stmt.query_map(params![&stock.symbol], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        
        let mut tags = Vec::new();
        for tag_row in tag_rows {
            tags.push(tag_row?);
        }
        
        result.push((stock, tags));
    }
    
    Ok(result)
}
