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
                visible INTEGER NOT NULL DEFAULT 1,
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

        // Migration: Add visible column to stocks table if it doesn't exist
        if !columns.contains(&"visible".to_string()) {
            conn.execute(
                "ALTER TABLE stocks ADD COLUMN visible INTEGER NOT NULL DEFAULT 1",
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

        // Price alerts table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS price_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                threshold_price REAL NOT NULL,
                direction TEXT NOT NULL CHECK(direction IN ('above', 'below')),
                enabled INTEGER NOT NULL DEFAULT 1,
                triggered INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (symbol) REFERENCES stocks(symbol) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol ON price_alerts(symbol)",
            [],
        )?;

        // Portfolio positions table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS portfolio_positions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                avg_cost REAL NOT NULL,
                current_price REAL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (symbol) REFERENCES stocks(symbol) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_portfolio_positions_symbol ON portfolio_positions(symbol)",
            [],
        )?;

        // Portfolio transactions table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS portfolio_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                transaction_type TEXT NOT NULL CHECK(transaction_type IN ('buy', 'sell')),
                quantity INTEGER NOT NULL,
                price REAL NOT NULL,
                amount REAL NOT NULL,
                commission REAL DEFAULT 0,
                transaction_date TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (symbol) REFERENCES stocks(symbol) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_symbol ON portfolio_transactions(symbol)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_date ON portfolio_transactions(transaction_date)",
            [],
        )?;

        // Stock cache table for fast searching
        conn.execute(
            "CREATE TABLE IF NOT EXISTS stock_cache (
                symbol TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                exchange TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_stock_cache_name ON stock_cache(name)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_price_alerts_enabled ON price_alerts(enabled)",
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
        
        // Check if stock already exists
        let mut stmt = conn.prepare("SELECT visible FROM stocks WHERE symbol = ?1")?;
        let mut existing = stmt.query_map(params![stock.symbol], |row| {
            Ok(row.get::<_, i64>(0)?)
        })?;
        
        let stock_exists = existing.next().is_some();
        
        if stock_exists {
            // Stock exists: update it and make it visible
            conn.execute(
                "UPDATE stocks SET name = ?1, exchange = ?2, group_id = ?3, visible = 1, updated_at = ?4 WHERE symbol = ?5",
                params![stock.name, stock.exchange, group_id, now, stock.symbol],
            )?;
        } else {
            // New stock: insert with visible = 1
            conn.execute(
                "INSERT INTO stocks (symbol, name, exchange, group_id, visible, created_at, updated_at) 
                 VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
                params![stock.symbol, stock.name, stock.exchange, group_id, now],
            )?;
        }
        
        Ok(())
    }

    pub fn remove_stock(&self, symbol: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        
        // Soft delete: set visible = 0 instead of actually deleting
        conn.execute(
            "UPDATE stocks SET visible = 0, updated_at = ?1 WHERE symbol = ?2",
            params![now, symbol],
        )?;
        
        Ok(())
    }

    pub fn restore_stock(&self, symbol: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        
        // Restore stock: set visible = 1
        conn.execute(
            "UPDATE stocks SET visible = 1, updated_at = ?1 WHERE symbol = ?2",
            params![now, symbol],
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
    pub fn get_stocks_with_tags(&self) -> Result<Vec<(StockInfo, Vec<(i64, String, String)>)>> {
        let conn = self.conn.lock().unwrap();
        
        // Get all visible stocks
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

    fn ensure_stock_exists(&self, symbol: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        Self::ensure_stock_exists_internal(&conn, symbol)?;
        Ok(())
    }

    fn ensure_stock_exists_internal(conn: &rusqlite::Connection, symbol: &str) -> Result<()> {
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

    // ============= Price Alert Methods =============

    pub fn create_price_alert(
        &self,
        symbol: &str,
        threshold_price: f64,
        direction: &str,
    ) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        
        conn.execute(
            "INSERT INTO price_alerts (symbol, threshold_price, direction, enabled, triggered, created_at, updated_at) 
             VALUES (?1, ?2, ?3, 1, 0, ?4, ?4)",
            params![symbol, threshold_price, direction, now],
        )?;
        
        Ok(conn.last_insert_rowid())
    }

    pub fn get_price_alerts(&self, symbol: Option<&str>) -> Result<Vec<(i64, String, f64, String, bool, bool)>> {
        let conn = self.conn.lock().unwrap();
        
        let mut alerts = Vec::new();
        
        if let Some(sym) = symbol {
            let mut stmt = conn.prepare(
                "SELECT id, symbol, threshold_price, direction, enabled, triggered 
                 FROM price_alerts 
                 WHERE symbol = ?1 
                 ORDER BY created_at DESC"
            )?;
            
            let rows = stmt.query_map(params![sym], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)? != 0,
                    row.get::<_, i64>(5)? != 0,
                ))
            })?;
            
            for row in rows {
                alerts.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, symbol, threshold_price, direction, enabled, triggered 
                 FROM price_alerts 
                 ORDER BY created_at DESC"
            )?;
            
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)? != 0,
                    row.get::<_, i64>(5)? != 0,
                ))
            })?;
            
            for row in rows {
                alerts.push(row?);
            }
        }
        
        Ok(alerts)
    }

    pub fn update_price_alert(
        &self,
        alert_id: i64,
        threshold_price: Option<f64>,
        direction: Option<&str>,
        enabled: Option<bool>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        
        if let Some(price) = threshold_price {
            conn.execute(
                "UPDATE price_alerts SET threshold_price = ?1, updated_at = ?2 WHERE id = ?3",
                params![price, now, alert_id],
            )?;
        }
        
        if let Some(dir) = direction {
            conn.execute(
                "UPDATE price_alerts SET direction = ?1, updated_at = ?2 WHERE id = ?3",
                params![dir, now, alert_id],
            )?;
        }
        
        if let Some(en) = enabled {
            conn.execute(
                "UPDATE price_alerts SET enabled = ?1, updated_at = ?2 WHERE id = ?3",
                params![if en { 1 } else { 0 }, now, alert_id],
            )?;
        }
        
        Ok(())
    }

    pub fn delete_price_alert(&self, alert_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        conn.execute(
            "DELETE FROM price_alerts WHERE id = ?1",
            params![alert_id],
        )?;
        
        Ok(())
    }

    pub fn get_active_price_alerts(&self) -> Result<Vec<(i64, String, f64, String)>> {
        let conn = self.conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT id, symbol, threshold_price, direction 
             FROM price_alerts 
             WHERE enabled = 1 AND triggered = 0 
             ORDER BY symbol, threshold_price"
        )?;
        
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        
        let mut alerts = Vec::new();
        for row in rows {
            alerts.push(row?);
        }
        Ok(alerts)
    }

    pub fn mark_alert_triggered(&self, alert_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        conn.execute(
            "UPDATE price_alerts SET triggered = 1 WHERE id = ?1",
            params![alert_id],
        )?;
        
        Ok(())
    }

    pub fn reset_alert_triggered(&self, alert_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        conn.execute(
            "UPDATE price_alerts SET triggered = 0 WHERE id = ?1",
            params![alert_id],
        )?;
        
        Ok(())
    }

    // Stock cache methods
    pub fn update_stock_cache(&self, stocks: &[StockInfo]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
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

    pub fn search_stocks_from_cache(&self, query: &str, limit: usize) -> Result<Vec<StockInfo>> {
        let conn = self.conn.lock().unwrap();
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
        let rows = stmt.query_map(
            params![search_pattern, query, symbol_pattern, limit as i64],
            |row| {
                Ok(StockInfo {
                    symbol: row.get(0)?,
                    name: row.get(1)?,
                    exchange: row.get(2)?,
                })
            },
        )?;
        
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        
        Ok(results)
    }

    pub fn get_stock_cache_count(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM stock_cache")?;
        let count: i64 = stmt.query_row([], |row| row.get(0))?;
        Ok(count)
    }

    // ============= Portfolio Position Methods =============

    pub fn add_portfolio_position(
        &self,
        symbol: &str,
        name: &str,
        quantity: i64,
        avg_cost: f64,
        current_price: Option<f64>,
    ) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        // Ensure stock exists (use internal version to avoid double locking)
        Self::ensure_stock_exists_internal(&conn, symbol)?;

        // Check if position already exists
        let mut stmt = conn.prepare("SELECT id, quantity, avg_cost FROM portfolio_positions WHERE symbol = ?1")?;
        let mut existing = stmt.query_map(params![symbol], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, f64>(2)?))
        })?;

        if let Some(row) = existing.next() {
            // Update existing position
            let (id, old_quantity, old_avg_cost) = row?;
            let total_old_value = old_quantity as f64 * old_avg_cost;
            let total_new_value = quantity as f64 * avg_cost;
            let total_quantity = old_quantity + quantity;
            let new_avg_cost = if total_quantity > 0 {
                (total_old_value + total_new_value) / total_quantity as f64
            } else {
                avg_cost
            };

            conn.execute(
                "UPDATE portfolio_positions SET quantity = ?1, avg_cost = ?2, current_price = ?3, updated_at = ?4 WHERE id = ?5",
                params![total_quantity, new_avg_cost, current_price, now, id],
            )?;
            Ok(id)
        } else {
            // Insert new position
            conn.execute(
                "INSERT INTO portfolio_positions (symbol, name, quantity, avg_cost, current_price, created_at, updated_at) 
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![symbol, name, quantity, avg_cost, current_price, now],
            )?;
            Ok(conn.last_insert_rowid())
        }
    }

    pub fn update_portfolio_position_price(&self, symbol: &str, current_price: f64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE portfolio_positions SET current_price = ?1, updated_at = ?2 WHERE symbol = ?3",
            params![current_price, now, symbol],
        )?;

        Ok(())
    }

    pub fn get_portfolio_positions(&self) -> Result<Vec<(i64, String, String, i64, f64, Option<f64>)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, symbol, name, quantity, avg_cost, current_price FROM portfolio_positions ORDER BY updated_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, f64>(4)?,
                row.get::<_, Option<f64>>(5)?,
            ))
        })?;

        let mut positions = Vec::new();
        for row in rows {
            positions.push(row?);
        }
        Ok(positions)
    }

    pub fn delete_portfolio_position(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM portfolio_positions WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ============= Portfolio Transaction Methods =============

    pub fn add_portfolio_transaction(
        &self,
        symbol: &str,
        transaction_type: &str,
        quantity: i64,
        price: f64,
        commission: f64,
        transaction_date: &str,
        notes: Option<&str>,
    ) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        // Ensure stock exists (use internal version to avoid double locking)
        Self::ensure_stock_exists_internal(&conn, symbol)?;

        let amount = quantity as f64 * price + commission;

        conn.execute(
            "INSERT INTO portfolio_transactions 
             (symbol, transaction_type, quantity, price, amount, commission, transaction_date, notes, created_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![symbol, transaction_type, quantity, price, amount, commission, transaction_date, notes, now],
        )?;

        // Update or create position based on transaction
        let current_price = Some(price);
        if transaction_type == "buy" {
            // Get stock name
            let mut name_stmt = conn.prepare("SELECT name FROM stocks WHERE symbol = ?1")?;
            let name: String = name_stmt.query_row(params![symbol], |row| row.get(0))?;
            let _ = self.add_portfolio_position(symbol, &name, quantity, price, current_price);
        } else if transaction_type == "sell" {
            // Update position quantity (reduce)
            let mut pos_stmt = conn.prepare("SELECT id, quantity FROM portfolio_positions WHERE symbol = ?1")?;
            let mut pos_rows = pos_stmt.query_map(params![symbol], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            })?;
            
            if let Some(row) = pos_rows.next() {
                let (id, old_quantity) = row?;
                let new_quantity = (old_quantity - quantity).max(0);
                if new_quantity > 0 {
                    conn.execute(
                        "UPDATE portfolio_positions SET quantity = ?1, current_price = ?2, updated_at = ?3 WHERE id = ?4",
                        params![new_quantity, price, now, id],
                    )?;
                } else {
                    conn.execute("DELETE FROM portfolio_positions WHERE id = ?1", params![id])?;
                }
            }
        }

        Ok(conn.last_insert_rowid())
    }

    pub fn get_portfolio_transactions(&self, symbol: Option<&str>) -> Result<Vec<(i64, String, String, i64, f64, f64, f64, String, Option<String>)>> {
        let conn = self.conn.lock().unwrap();
        
        let mut positions = Vec::new();
        if let Some(sym) = symbol {
            let mut stmt = conn.prepare(
                "SELECT id, symbol, transaction_type, quantity, price, amount, commission, transaction_date, notes 
                 FROM portfolio_transactions 
                 WHERE symbol = ?1 
                 ORDER BY transaction_date DESC, created_at DESC"
            )?;
            let rows = stmt.query_map(params![sym], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, f64>(5)?,
                    row.get::<_, f64>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, Option<String>>(8)?,
                ))
            })?;
            for row in rows {
                positions.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, symbol, transaction_type, quantity, price, amount, commission, transaction_date, notes 
                 FROM portfolio_transactions 
                 ORDER BY transaction_date DESC, created_at DESC"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, f64>(5)?,
                    row.get::<_, f64>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, Option<String>>(8)?,
                ))
            })?;
            for row in rows {
                positions.push(row?);
            }
        }
        Ok(positions)
    }

    pub fn delete_portfolio_transaction(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM portfolio_transactions WHERE id = ?1", params![id])?;
        Ok(())
    }
}
