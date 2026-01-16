use rusqlite::{Connection, Result, params};
use chrono::Utc;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::stock_api::{StockData, StockInfo, StockQuote};

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data directory");
        
        std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
        
        let db_path = app_data_dir.join("stock_analyzer.db");
        let conn = Connection::open(db_path)?;
        
        let db = Database {
            conn: Mutex::new(conn),
        };
        
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS stock_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS stocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                exchange TEXT NOT NULL,
                group_id INTEGER,
                sort_order INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (group_id) REFERENCES stock_groups(id)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS stock_time_series (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                date TEXT NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(symbol, date),
                FOREIGN KEY (symbol) REFERENCES stocks(symbol)
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_time_series_symbol_date ON stock_time_series(symbol, date)",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS stock_kline (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                period TEXT NOT NULL,
                date TEXT NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(symbol, period, date),
                FOREIGN KEY (symbol) REFERENCES stocks(symbol)
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_kline_symbol_period_date ON stock_kline(symbol, period, date)",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS stock_quotes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                change REAL NOT NULL,
                change_percent REAL NOT NULL,
                volume INTEGER NOT NULL,
                market_cap INTEGER,
                pe_ratio REAL,
                turnover INTEGER,
                high REAL NOT NULL,
                low REAL NOT NULL,
                open REAL NOT NULL,
                previous_close REAL NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(symbol),
                FOREIGN KEY (symbol) REFERENCES stocks(symbol)
            )",
            [],
        )?;

        // Migration: Add new columns to stock_quotes if they don't exist
        let _ = conn.execute(
            "ALTER TABLE stock_quotes ADD COLUMN pe_ratio REAL",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE stock_quotes ADD COLUMN turnover INTEGER",
            [],
        );

        // Migration: Add sort_order column to stocks table if it doesn't exist
        // Check if sort_order column exists
        let mut stmt = conn.prepare("PRAGMA table_info(stocks)")?;
        let columns: Vec<String> = stmt.query_map([], |row| {
            Ok(row.get::<_, String>(1)?) // Column name is at index 1
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        if !columns.contains(&"sort_order".to_string()) {
            // Add sort_order column
            conn.execute(
                "ALTER TABLE stocks ADD COLUMN sort_order INTEGER DEFAULT 0",
                [],
            )?;
        }

        // Tags table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS stock_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT '#007acc',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        // Stock-Tag relations (many-to-many)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS stock_tag_relations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                tag_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(symbol, tag_id),
                FOREIGN KEY (symbol) REFERENCES stocks(symbol) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES stock_tags(id) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_stock_tag_relations_symbol ON stock_tag_relations(symbol)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_stock_tag_relations_tag_id ON stock_tag_relations(tag_id)",
            [],
        )?;

        Ok(())
    }

    pub fn create_group(&self, name: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        
        // First check if group already exists (within the same lock)
        let mut stmt = conn.prepare("SELECT id FROM stock_groups WHERE name = ?1")?;
        let mut rows = stmt.query_map(params![name], |row| {
            Ok(row.get::<_, i64>(0)?)
        })?;
        
        if let Some(row) = rows.next() {
            return Ok(row?);
        }
        
        // Group doesn't exist, create it
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO stock_groups (name, created_at, updated_at) VALUES (?1, ?2, ?2)",
            params![name, now],
        )?;
        
        let id = conn.last_insert_rowid();
        Ok(id)
    }

    pub fn get_groups(&self) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT name FROM stock_groups ORDER BY name")?;
        let rows = stmt.query_map([], |row| {
            Ok(row.get::<_, String>(0)?)
        })?;
        
        let mut groups = Vec::new();
        for row in rows {
            groups.push(row?);
        }
        Ok(groups)
    }

    #[allow(dead_code)]
    pub fn get_group_id_by_name(&self, name: &str) -> Result<Option<i64>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id FROM stock_groups WHERE name = ?1")?;
        let mut rows = stmt.query_map(params![name], |row| {
            Ok(row.get::<_, i64>(0)?)
        })?;
        
        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    pub fn update_group(&self, old_name: &str, new_name: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        
        conn.execute(
            "UPDATE stock_groups SET name = ?1, updated_at = ?2 WHERE name = ?3",
            params![new_name, now, old_name],
        )?;
        
        Ok(())
    }

    pub fn delete_group(&self, name: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        // First, move all stocks in this group to ungrouped (set group_id to NULL)
        conn.execute(
            "UPDATE stocks SET group_id = NULL WHERE group_id = (SELECT id FROM stock_groups WHERE name = ?1)",
            params![name],
        )?;
        
        // Then delete the group
        conn.execute(
            "DELETE FROM stock_groups WHERE name = ?1",
            params![name],
        )?;
        
        Ok(())
    }

    pub fn move_stock_to_group(&self, symbol: &str, group_name: Option<&str>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        
        let group_id = if let Some(name) = group_name {
            // Query within the same lock to avoid deadlock
            let mut stmt = conn.prepare("SELECT id FROM stock_groups WHERE name = ?1")?;
            let mut rows = stmt.query_map(params![name], |row| {
                Ok(row.get::<_, i64>(0)?)
            })?;
            rows.next().transpose()?
        } else {
            None
        };
        
        conn.execute(
            "UPDATE stocks SET group_id = ?1, updated_at = ?2 WHERE symbol = ?3",
            params![group_id, now, symbol],
        )?;
        
        Ok(())
    }

    pub fn update_stocks_order(&self, symbols: &[String]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        
        let mut stmt = conn.prepare(
            "UPDATE stocks SET sort_order = ?1, updated_at = ?2 WHERE symbol = ?3"
        )?;
        
        for (index, symbol) in symbols.iter().enumerate() {
            stmt.execute(params![index as i32, now, symbol])?;
        }
        
        Ok(())
    }

    pub fn add_stock(&self, stock: &StockInfo, group_id: Option<i64>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        
        conn.execute(
            "INSERT OR REPLACE INTO stocks (symbol, name, exchange, group_id, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, 
                     COALESCE((SELECT created_at FROM stocks WHERE symbol = ?1), ?5),
                     ?5)",
            params![stock.symbol, stock.name, stock.exchange, group_id, now],
        )?;
        
        Ok(())
    }

    pub fn remove_stock(&self, symbol: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        // Delete from stocks table (related data in time_series and kline will remain)
        conn.execute(
            "DELETE FROM stocks WHERE symbol = ?1",
            params![symbol],
        )?;
        
        Ok(())
    }

    // ============= Tag Methods =============

    pub fn create_tag(&self, name: &str, color: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        
        // Check if tag already exists
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

    pub fn get_all_tags(&self) -> Result<Vec<(i64, String, String)>> {
        let conn = self.conn.lock().unwrap();
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

    pub fn update_tag(&self, tag_id: i64, name: &str, color: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        
        conn.execute(
            "UPDATE stock_tags SET name = ?1, color = ?2, updated_at = ?3 WHERE id = ?4",
            params![name, color, now, tag_id],
        )?;
        
        Ok(())
    }

    pub fn delete_tag(&self, tag_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        // Delete relations first
        conn.execute(
            "DELETE FROM stock_tag_relations WHERE tag_id = ?1",
            params![tag_id],
        )?;
        
        // Delete tag
        conn.execute(
            "DELETE FROM stock_tags WHERE id = ?1",
            params![tag_id],
        )?;
        
        Ok(())
    }

    pub fn add_tag_to_stock(&self, symbol: &str, tag_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        
        conn.execute(
            "INSERT OR IGNORE INTO stock_tag_relations (symbol, tag_id, created_at) VALUES (?1, ?2, ?3)",
            params![symbol, tag_id, now],
        )?;
        
        Ok(())
    }

    pub fn remove_tag_from_stock(&self, symbol: &str, tag_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        conn.execute(
            "DELETE FROM stock_tag_relations WHERE symbol = ?1 AND tag_id = ?2",
            params![symbol, tag_id],
        )?;
        
        Ok(())
    }

    pub fn get_stock_tags(&self, symbol: &str) -> Result<Vec<(i64, String, String)>> {
        let conn = self.conn.lock().unwrap();
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

    pub fn get_stocks_by_tag(&self, tag_id: i64) -> Result<Vec<StockInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.symbol, s.name, s.exchange 
             FROM stocks s 
             JOIN stock_tag_relations r ON s.symbol = r.symbol 
             WHERE r.tag_id = ?1 
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
    pub fn get_stocks_with_tags(&self) -> Result<Vec<(StockInfo, Vec<(i64, String, String)>)>> {
        let conn = self.conn.lock().unwrap();
        
        // Get all stocks
        let mut stmt = conn.prepare("SELECT symbol, name, exchange FROM stocks ORDER BY sort_order, symbol")?;
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
        
        // Get tags for each stock
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

    pub fn get_stocks_by_group(&self, group_name: Option<&str>) -> Result<Vec<StockInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stocks = Vec::new();
        
        if let Some(group_name) = group_name {
            // Special case: "未分组" means ungrouped (group_id IS NULL)
            if group_name == "未分组" {
                let mut stmt = conn.prepare(
                    "SELECT symbol, name, exchange FROM stocks WHERE group_id IS NULL ORDER BY sort_order, symbol"
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
                     WHERE g.name = ?1 
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
                "SELECT symbol, name, exchange FROM stocks ORDER BY sort_order, symbol"
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

    fn ensure_stock_exists(&self, symbol: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
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
            "INSERT OR IGNORE INTO stocks (symbol, name, exchange, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?4)",
            params![symbol, name, exchange, now],
        )?;
        
        Ok(())
    }

    pub fn save_time_series(&self, symbol: &str, data: &[StockData]) -> Result<usize> {
        self.ensure_stock_exists(symbol)?;
        
        let conn = self.conn.lock().unwrap();
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

    pub fn get_time_series(&self, symbol: &str, limit: Option<i32>) -> Result<Vec<StockData>> {
        let conn = self.conn.lock().unwrap();
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
    pub fn get_latest_time_series_date(&self, symbol: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
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

    pub fn save_kline(&self, symbol: &str, period: &str, data: &[StockData]) -> Result<usize> {
        self.ensure_stock_exists(symbol)?;
        
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let mut count = 0;
        
        let mut stmt = conn.prepare(
            "INSERT OR REPLACE INTO stock_kline 
             (symbol, period, date, open, high, low, close, volume, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 
                     COALESCE((SELECT created_at FROM stock_kline WHERE symbol = ?1 AND period = ?2 AND date = ?3), ?9),
                     ?9)"
        )?;
        
        for item in data {
            stmt.execute(params![
                symbol,
                period,
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

    pub fn get_kline(&self, symbol: &str, period: &str, limit: Option<i32>) -> Result<Vec<StockData>> {
        let conn = self.conn.lock().unwrap();
        let limit = limit.unwrap_or(240);
        
        let mut stmt = conn.prepare(
            "SELECT date, open, high, low, close, volume 
             FROM stock_kline 
             WHERE symbol = ?1 AND period = ?2 
             ORDER BY date DESC 
             LIMIT ?3"
        )?;
        
        let rows = stmt.query_map(params![symbol, period, limit], |row| {
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

    pub fn get_latest_kline_date(&self, symbol: &str, period: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT date FROM stock_kline 
             WHERE symbol = ?1 AND period = ?2 
             ORDER BY date DESC 
             LIMIT 1"
        )?;
        
        let mut rows = stmt.query_map(params![symbol, period], |row| {
            Ok(row.get::<_, String>(0)?)
        })?;
        
        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    pub fn save_quote(&self, quote: &StockQuote) -> Result<()> {
        let conn = self.conn.lock().unwrap();
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

    #[allow(dead_code)]
    pub fn get_quote(&self, symbol: &str) -> Result<Option<StockQuote>> {
        let conn = self.conn.lock().unwrap();
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
}
