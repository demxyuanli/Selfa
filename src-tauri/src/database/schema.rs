use rusqlite::Connection;

fn migrate_remove_foreign_keys(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute("PRAGMA foreign_keys = OFF", [])?;
    
    let tables_to_migrate = vec![
        ("stocks", "CREATE TABLE stocks_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            exchange TEXT NOT NULL,
            group_id INTEGER,
            sort_order INTEGER DEFAULT 0,
            visible INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"),
        ("stock_time_series", "CREATE TABLE stock_time_series_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            date TEXT NOT NULL,
            open REAL NOT NULL,
            high REAL NOT NULL,
            low REAL NOT NULL,
            close REAL NOT NULL,
            volume INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(symbol, date)
        )"),
        ("stock_kline", "CREATE TABLE stock_kline_new (
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
            UNIQUE(symbol, period, date)
        )"),
        ("stock_quotes", "CREATE TABLE stock_quotes_new (
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
            UNIQUE(symbol)
        )"),
        ("stock_tag_relations", "CREATE TABLE stock_tag_relations_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            tag_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(symbol, tag_id)
        )"),
        ("price_alerts", "CREATE TABLE price_alerts_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            threshold_price REAL NOT NULL,
            direction TEXT NOT NULL CHECK(direction IN ('above', 'below')),
            enabled INTEGER NOT NULL DEFAULT 1,
            triggered INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"),
        ("portfolio_positions", "CREATE TABLE portfolio_positions_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            name TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            avg_cost REAL NOT NULL,
            current_price REAL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"),
        ("portfolio_transactions", "CREATE TABLE portfolio_transactions_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            transaction_type TEXT NOT NULL CHECK(transaction_type IN ('buy', 'sell')),
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            amount REAL NOT NULL,
            commission REAL DEFAULT 0,
            transaction_date TEXT NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL
        )"),
    ];

    let result = (|| -> rusqlite::Result<()> {
        let tx = conn.unchecked_transaction()?;
        
        for (table_name, create_sql) in tables_to_migrate {
            let table_exists: bool = conn.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                [table_name],
                |row| Ok(row.get::<_, i32>(0)? > 0),
            )?;

            if table_exists {
                let temp_table_name = format!("{}_new", table_name);
                let temp_exists: bool = conn.query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [&temp_table_name],
                    |row| Ok(row.get::<_, i32>(0)? > 0),
                ).unwrap_or(false);
                
                if !temp_exists {
                    conn.execute(create_sql, [])?;
                    
                    let copy_sql = format!("INSERT INTO {}_new SELECT * FROM {}", table_name, table_name);
                    if let Err(e) = conn.execute(&copy_sql, []) {
                        eprintln!("Warning: Failed to copy data from {}: {}", table_name, e);
                    }
                    
                    let drop_sql = format!("DROP TABLE {}", table_name);
                    conn.execute(&drop_sql, [])?;
                    
                    let rename_sql = format!("ALTER TABLE {}_new RENAME TO {}", table_name, table_name);
                    conn.execute(&rename_sql, [])?;
                }
            }
        }
        
        tx.commit()?;
        Ok(())
    })();
    
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    result
}

pub fn init_tables(conn: &Connection) -> rusqlite::Result<()> {
    migrate_remove_foreign_keys(conn)?;
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
            updated_at TEXT NOT NULL
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
            UNIQUE(symbol, date)
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
            UNIQUE(symbol, period, date)
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
            UNIQUE(symbol)
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
            UNIQUE(symbol, tag_id)
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
            updated_at TEXT NOT NULL
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
            updated_at TEXT NOT NULL
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
            created_at TEXT NOT NULL
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

    conn.execute(
        "CREATE TABLE IF NOT EXISTS capital_transfers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transfer_type TEXT NOT NULL CHECK(transfer_type IN ('deposit', 'withdraw')),
            amount REAL NOT NULL,
            transfer_date TEXT NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_capital_transfers_date ON capital_transfers(transfer_date)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS portfolio_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    Ok(())
}
