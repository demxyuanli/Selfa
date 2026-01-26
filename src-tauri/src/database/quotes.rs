use rusqlite::{Connection, Result, params};
use chrono::Utc;
use crate::stock_api::StockQuote;

pub fn save_quote(conn: &Connection, quote: &StockQuote) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT OR REPLACE INTO stock_quotes 
         (symbol, name, price, change, change_percent, volume, market_cap, pe_ratio, turnover, 
          high, low, open, previous_close, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            quote.symbol,
            quote.name,
            quote.price,
            quote.change,
            quote.change_percent,
            quote.volume,
            quote.market_cap,
            quote.pe_ratio,
            quote.turnover,
            quote.high,
            quote.low,
            quote.open,
            quote.previous_close,
            now
        ],
    )?;
    
    Ok(())
}

pub fn get_quote(conn: &Connection, symbol: &str) -> Result<Option<StockQuote>> {
    let mut stmt = conn.prepare(
        "SELECT symbol, name, price, change, change_percent, volume, market_cap, pe_ratio, turnover, 
                high, low, open, previous_close 
         FROM stock_quotes 
         WHERE symbol = ?1"
    )?;
    
    let mut rows = stmt.query_map(params![symbol], |row| {
        Ok(StockQuote {
            symbol: row.get(0)?,
            name: row.get(1)?,
            price: row.get(2)?,
            change: row.get(3)?,
            change_percent: row.get(4)?,
            volume: row.get(5)?,
            market_cap: row.get(6)?,
            pe_ratio: row.get(7)?,
            turnover: row.get(8)?,
            high: row.get(9)?,
            low: row.get(10)?,
            open: row.get(11)?,
            previous_close: row.get(12)?,
        })
    })?;
    
    if let Some(row) = rows.next() {
        Ok(Some(row?))
    } else {
        Ok(None)
    }
}
