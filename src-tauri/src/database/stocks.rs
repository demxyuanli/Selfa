use rusqlite::{Connection, Result, params};
use chrono::Utc;
use std::sync::Mutex;
use crate::stock_api::StockInfo;

pub fn add_stock(conn: &Mutex<Connection>, stock: &StockInfo, group_id: Option<i64>) -> Result<()> {
    let conn = conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();
    
    let mut stmt = conn.prepare("SELECT visible FROM stocks WHERE symbol = ?1")?;
    let mut existing = stmt.query_map(params![stock.symbol], |row| {
        Ok(row.get::<_, i64>(0)?)
    })?;
    
    let stock_exists = existing.next().is_some();
    
    if stock_exists {
        conn.execute(
            "UPDATE stocks SET name = ?1, exchange = ?2, group_id = ?3, visible = 1, updated_at = ?4 WHERE symbol = ?5",
            params![stock.name, stock.exchange, group_id, now, stock.symbol],
        )?;
    } else {
        conn.execute(
            "INSERT INTO stocks (symbol, name, exchange, group_id, visible, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
            params![stock.symbol, stock.name, stock.exchange, group_id, now],
        )?;
    }
    
    Ok(())
}

pub fn remove_stock(conn: &Mutex<Connection>, symbol: &str) -> Result<()> {
    let conn = conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "UPDATE stocks SET visible = 0, updated_at = ?1 WHERE symbol = ?2",
        params![now, symbol],
    )?;
    
    Ok(())
}

pub fn restore_stock(conn: &Mutex<Connection>, symbol: &str) -> Result<()> {
    let conn = conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "UPDATE stocks SET visible = 1, updated_at = ?1 WHERE symbol = ?2",
        params![now, symbol],
    )?;
    
    Ok(())
}

pub fn update_stocks_order(conn: &Mutex<Connection>, symbols: &[String]) -> Result<()> {
    let conn = conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();
    
    let mut stmt = conn.prepare(
        "UPDATE stocks SET sort_order = ?1, updated_at = ?2 WHERE symbol = ?3"
    )?;
    
    for (index, symbol) in symbols.iter().enumerate() {
        stmt.execute(params![index as i32, now, symbol])?;
    }
    
    Ok(())
}

pub fn get_stocks_by_group(conn: &Mutex<Connection>, group_name: Option<&str>) -> Result<Vec<StockInfo>> {
    let conn = conn.lock().unwrap();
    let mut stocks = Vec::new();
    
    if let Some(group_name) = group_name {
        if group_name == "未分组" {
            let mut stmt = conn.prepare(
                "SELECT symbol, name, exchange FROM stocks WHERE group_id IS NULL AND visible = 1 ORDER BY sort_order, symbol"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(StockInfo {
                    symbol: row.get(0)?,
                    name: row.get(1)?,
                    exchange: row.get(2)?,
                })
            })?;
            for row in rows {
                stocks.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT s.symbol, s.name, s.exchange 
                 FROM stocks s 
                 JOIN stock_groups g ON s.group_id = g.id 
                 WHERE g.name = ?1 AND s.visible = 1
                 ORDER BY s.sort_order, s.symbol"
            )?;
            let rows = stmt.query_map(params![group_name], |row| {
                Ok(StockInfo {
                    symbol: row.get(0)?,
                    name: row.get(1)?,
                    exchange: row.get(2)?,
                })
            })?;
            for row in rows {
                stocks.push(row?);
            }
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT symbol, name, exchange FROM stocks WHERE visible = 1 ORDER BY sort_order, symbol"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(StockInfo {
                symbol: row.get(0)?,
                name: row.get(1)?,
                exchange: row.get(2)?,
            })
        })?;
        for row in rows {
            stocks.push(row?);
        }
    }
    
    Ok(stocks)
}
