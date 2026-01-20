use rusqlite::Connection;
use rusqlite::Result;
use rusqlite::params;
use chrono::Utc;

pub fn ensure_stock_exists_internal(conn: &Connection, symbol: &str) -> Result<()> {
    ensure_stock_exists_with_name(conn, symbol, None)
}

pub fn ensure_stock_exists_with_name_from_quote(conn: &Connection, symbol: &str) -> Result<()> {
    let mut stmt = conn.prepare("SELECT name FROM stock_quotes WHERE symbol = ?1")?;
    let quote_name: Option<String> = stmt.query_row(params![symbol], |row| row.get(0)).ok();
    
    let name = if let Some(ref quote_name) = quote_name {
        if quote_name != symbol {
            Some(quote_name.as_str())
        } else {
            None
        }
    } else {
        None
    };
    
    ensure_stock_exists_with_name(conn, symbol, name)
}

pub fn ensure_stock_exists_with_name(conn: &Connection, symbol: &str, name: Option<&str>) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    
    let exchange = if symbol == "000001" || symbol.starts_with("6") {
        "SH"
    } else if symbol.starts_with("0") || symbol.starts_with("3") {
        "SZ"
    } else {
        "SH"
    };
    
    let default_name = match symbol {
        "000001" => "上证指数",
        "399001" => "深证成指",
        "399006" => "创业板指",
        _ => symbol,
    };
    
    let mut stock_name = name.map(|s| s.to_string()).unwrap_or_else(|| default_name.to_string());
    
    if stock_name == symbol && name.is_none() {
        let mut stmt = conn.prepare("SELECT name FROM stock_quotes WHERE symbol = ?1")?;
        if let Ok(quote_name) = stmt.query_row(params![symbol], |row| row.get::<_, String>(0)) {
            if quote_name != symbol {
                stock_name = quote_name;
            }
        }
    }
    
    let mut stmt = conn.prepare("SELECT name FROM stocks WHERE symbol = ?1")?;
    let existing_name: Option<String> = stmt.query_row(params![symbol], |row| row.get(0)).ok();
    
    if existing_name.is_none() {
        conn.execute(
            "INSERT INTO stocks (symbol, name, exchange, visible, created_at, updated_at) 
             VALUES (?1, ?2, ?3, 1, ?4, ?4)",
            params![symbol, stock_name.as_str(), exchange, now],
        )?;
    } else if let Some(existing) = existing_name {
        if existing == symbol && stock_name != symbol {
            conn.execute(
                "UPDATE stocks SET name = ?1, updated_at = ?2 WHERE symbol = ?3",
                params![stock_name.as_str(), now, symbol],
            )?;
        }
    }
    
    Ok(())
}
