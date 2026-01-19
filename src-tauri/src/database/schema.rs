use rusqlite::Connection;

pub fn init_tables(conn: &Connection) -> rusqlite::Result<()> {
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

    let _ = conn.execute(
        "ALTER TABLE stock_quotes ADD COLUMN pe_ratio REAL",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE stock_quotes ADD COLUMN turnover INTEGER",
        [],
    );

    let mut stmt = conn.prepare("PRAGMA table_info(stocks)")?;
    let columns: Vec<String> = stmt.query_map([], |row| {
        Ok(row.get::<_, String>(1)?)
    })?
    .collect::<rusqlite::Result<Vec<_>, _>>()?;
    
    if !columns.contains(&"sort_order".to_string()) {
        conn.execute(
            "ALTER TABLE stocks ADD COLUMN sort_order INTEGER DEFAULT 0",
            [],
        )?;
    }

    if !columns.contains(&"visible".to_string()) {
        conn.execute(
            "ALTER TABLE stocks ADD COLUMN visible INTEGER NOT NULL DEFAULT 1",
            [],
        )?;
    }

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
