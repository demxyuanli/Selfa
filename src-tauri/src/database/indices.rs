use rusqlite::{Connection, Result, params};
use chrono::Utc;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexInfo {
    pub symbol: String,
    pub name: String,
    pub exchange: String,
    pub sector_type: Option<String>,
    pub secid: Option<String>,
}

pub fn add_index(conn: &Connection, index: &IndexInfo) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT OR REPLACE INTO indices (symbol, name, exchange, sector_type, secid, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 
                 COALESCE((SELECT created_at FROM indices WHERE symbol = ?1), ?6),
                 ?6)",
        params![index.symbol, index.name, index.exchange, index.sector_type, index.secid, now],
    )?;
    
    Ok(())
}

#[allow(dead_code)]
pub fn get_all_indices(conn: &Connection) -> Result<Vec<IndexInfo>> {
    let mut stmt = conn.prepare("SELECT symbol, name, exchange, sector_type, secid FROM indices ORDER BY name")?;
    
    let indices = stmt.query_map([], |row| {
        Ok(IndexInfo {
            symbol: row.get(0)?,
            name: row.get(1)?,
            exchange: row.get(2)?,
            sector_type: row.get(3)?,
            secid: row.get(4)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;
    
    Ok(indices)
}

pub fn get_index_by_symbol(conn: &Connection, symbol: &str) -> Result<Option<IndexInfo>> {
    let mut stmt = conn.prepare("SELECT symbol, name, exchange, sector_type, secid FROM indices WHERE symbol = ?1")?;
    
    let mut rows = stmt.query_map(params![symbol], |row| {
        Ok(IndexInfo {
            symbol: row.get(0)?,
            name: row.get(1)?,
            exchange: row.get(2)?,
            sector_type: row.get(3)?,
            secid: row.get(4)?,
        })
    })?;
    
    if let Some(row) = rows.next() {
        Ok(Some(row?))
    } else {
        Ok(None)
    }
}

pub fn add_stock_index_relation(conn: &Connection, stock_symbol: &str, index_symbol: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT OR IGNORE INTO stock_index_relations (stock_symbol, index_symbol, created_at)
         VALUES (?1, ?2, ?3)",
        params![stock_symbol, index_symbol, now],
    )?;
    
    Ok(())
}

#[allow(dead_code)]
pub fn get_indices_for_stock(conn: &Connection, stock_symbol: &str) -> Result<Vec<IndexInfo>> {
    let mut stmt = conn.prepare(
        "SELECT i.symbol, i.name, i.exchange, i.sector_type, i.secid
         FROM indices i
         INNER JOIN stock_index_relations r ON i.symbol = r.index_symbol
         WHERE r.stock_symbol = ?1
         ORDER BY i.name"
    )?;
    
    let indices = stmt.query_map(params![stock_symbol], |row| {
        Ok(IndexInfo {
            symbol: row.get(0)?,
            name: row.get(1)?,
            exchange: row.get(2)?,
            sector_type: row.get(3)?,
            secid: row.get(4)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;
    
    Ok(indices)
}

pub fn get_indices_for_stocks(conn: &Connection, stock_symbols: &[String]) -> Result<Vec<IndexInfo>> {
    if stock_symbols.is_empty() {
        return Ok(Vec::new());
    }
    
    // Build query with placeholders
    let placeholders = stock_symbols.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!(
        "SELECT DISTINCT i.symbol, i.name, i.exchange, i.sector_type, i.secid
         FROM indices i
         INNER JOIN stock_index_relations r ON i.symbol = r.index_symbol
         WHERE r.stock_symbol IN ({})
         ORDER BY i.name",
        placeholders
    );
    
    let mut stmt = conn.prepare(&query)?;
    
    // Convert String slice to params
    let params: Vec<&str> = stock_symbols.iter().map(|s| s.as_str()).collect();
    
    let indices = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(IndexInfo {
            symbol: row.get(0)?,
            name: row.get(1)?,
            exchange: row.get(2)?,
            sector_type: row.get(3)?,
            secid: row.get(4)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;
    
    Ok(indices)
}

pub fn clear_stock_index_relations(conn: &Connection, stock_symbol: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM stock_index_relations WHERE stock_symbol = ?1",
        params![stock_symbol],
    )?;
    Ok(())
}

pub fn get_index_count(conn: &Connection) -> Result<i64> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM indices",
        [],
        |row| row.get(0),
    )?;
    Ok(count)
}
