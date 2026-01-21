use rusqlite::{Connection, Result, params};
use chrono::Utc;
use std::sync::Mutex;

pub fn get_initial_balance(conn: &Mutex<Connection>) -> Result<Option<f64>> {
    let conn = conn.lock().unwrap();
    
    let mut stmt = conn.prepare(
        "SELECT value FROM portfolio_settings WHERE key = 'initial_balance'"
    )?;
    
    match stmt.query_row([], |row| {
        let value_str: String = row.get(0)?;
        Ok(value_str.parse::<f64>().unwrap_or(0.0))
    }) {
        Ok(balance) => Ok(Some(balance)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn set_initial_balance(conn: &Mutex<Connection>, balance: f64) -> Result<()> {
    let conn = conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT INTO portfolio_settings (key, value, updated_at) 
         VALUES ('initial_balance', ?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
        params![balance.to_string(), now],
    )?;
    
    Ok(())
}
