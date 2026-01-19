use rusqlite::Connection;
use rusqlite::Result;
use rusqlite::params;
use chrono::Utc;

pub fn ensure_stock_exists_internal(conn: &Connection, symbol: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    
    let exchange = if symbol == "000001" || symbol.starts_with("6") {
        "SH"
    } else if symbol.starts_with("0") || symbol.starts_with("3") {
        "SZ"
    } else {
        "SH"
    };
    
    let name = match symbol {
        "000001" => "上证指数",
        "399001" => "深证成指",
        "399006" => "创业板指",
        _ => symbol,
    };
    
    conn.execute(
        "INSERT OR IGNORE INTO stocks (symbol, name, exchange, visible, created_at, updated_at) 
         VALUES (?1, ?2, ?3, 1, ?4, ?4)",
        params![symbol, name, exchange, now],
    )?;
    
    Ok(())
}
