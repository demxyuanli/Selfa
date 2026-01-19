use rusqlite::{Connection, Result, params};
use chrono::Utc;
use std::sync::Mutex;
use super::utils::ensure_stock_exists_internal;

pub fn add_portfolio_position(
    conn: &Mutex<Connection>,
    symbol: &str,
    name: &str,
    quantity: i64,
    avg_cost: f64,
    current_price: Option<f64>,
) -> Result<i64> {
    let conn = conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();

    ensure_stock_exists_internal(&conn, symbol)?;

    let mut stmt = conn.prepare("SELECT id, quantity, avg_cost FROM portfolio_positions WHERE symbol = ?1")?;
    let mut existing = stmt.query_map(params![symbol], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, f64>(2)?))
    })?;

    if let Some(row) = existing.next() {
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
        conn.execute(
            "INSERT INTO portfolio_positions (symbol, name, quantity, avg_cost, current_price, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![symbol, name, quantity, avg_cost, current_price, now],
        )?;
        Ok(conn.last_insert_rowid())
    }
}

pub fn update_portfolio_position_price(conn: &Mutex<Connection>, symbol: &str, current_price: f64) -> Result<()> {
    let conn = conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE portfolio_positions SET current_price = ?1, updated_at = ?2 WHERE symbol = ?3",
        params![current_price, now, symbol],
    )?;

    Ok(())
}

pub fn update_portfolio_position(conn: &Mutex<Connection>, id: i64, quantity: i64, avg_cost: f64) -> Result<()> {
    let conn = conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE portfolio_positions SET quantity = ?1, avg_cost = ?2, updated_at = ?3 WHERE id = ?4",
        params![quantity, avg_cost, now, id],
    )?;

    Ok(())
}

pub fn get_portfolio_positions(conn: &Mutex<Connection>) -> Result<Vec<(i64, String, String, i64, f64, Option<f64>)>> {
    let conn = conn.lock().unwrap();
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

pub fn delete_portfolio_position(conn: &Mutex<Connection>, id: i64) -> Result<()> {
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM portfolio_positions WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn add_portfolio_transaction(
    conn: &Mutex<Connection>,
    symbol: &str,
    transaction_type: &str,
    quantity: i64,
    price: f64,
    commission: f64,
    transaction_date: &str,
    notes: Option<&str>,
) -> Result<i64> {
    let conn = conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();

    ensure_stock_exists_internal(&conn, symbol)?;

    let amount = quantity as f64 * price + commission;

    conn.execute(
        "INSERT INTO portfolio_transactions 
         (symbol, transaction_type, quantity, price, amount, commission, transaction_date, notes, created_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![symbol, transaction_type, quantity, price, amount, commission, transaction_date, notes, now],
    )?;

    let current_price = Some(price);
    if transaction_type == "buy" {
        let mut name_stmt = conn.prepare("SELECT name FROM stocks WHERE symbol = ?1")?;
        let name: String = name_stmt.query_row(params![symbol], |row| row.get(0))?;
        
        let mut pos_stmt = conn.prepare("SELECT id, quantity, avg_cost FROM portfolio_positions WHERE symbol = ?1")?;
        let mut existing = pos_stmt.query_map(params![symbol], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, f64>(2)?))
        })?;
        
        if let Some(row) = existing.next() {
            let (id, old_quantity, old_avg_cost) = row?;
            let total_old_value = old_quantity as f64 * old_avg_cost;
            let total_new_value = quantity as f64 * price + commission;
            let total_quantity = old_quantity + quantity;
            let new_avg_cost = if total_quantity > 0 {
                (total_old_value + total_new_value) / total_quantity as f64
            } else {
                (quantity as f64 * price + commission) / quantity as f64
            };
            
            conn.execute(
                "UPDATE portfolio_positions SET quantity = ?1, avg_cost = ?2, current_price = ?3, updated_at = ?4 WHERE id = ?5",
                params![total_quantity, new_avg_cost, current_price, now, id],
            )?;
        } else {
            let avg_cost_with_commission = (quantity as f64 * price + commission) / quantity as f64;
            conn.execute(
                "INSERT INTO portfolio_positions (symbol, name, quantity, avg_cost, current_price, created_at, updated_at) 
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![symbol, name, quantity, avg_cost_with_commission, current_price, now],
            )?;
        }
    } else if transaction_type == "sell" {
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

pub fn get_portfolio_transactions(conn: &Mutex<Connection>, symbol: Option<&str>) -> Result<Vec<(i64, String, String, i64, f64, f64, f64, String, Option<String>)>> {
    let conn = conn.lock().unwrap();
    
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

pub fn update_portfolio_transaction(
    conn: &Mutex<Connection>,
    id: i64,
    quantity: i64,
) -> Result<()> {
    let conn = conn.lock().unwrap();
    
    let mut stmt = conn.prepare("SELECT symbol, transaction_type, price, commission FROM portfolio_transactions WHERE id = ?1")?;
    let (symbol, _transaction_type, price, commission): (String, String, f64, f64) = stmt.query_row(params![id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, f64>(3)?,
        ))
    })?;
    
    let amount = quantity as f64 * price + commission;
    
    conn.execute(
        "UPDATE portfolio_transactions SET quantity = ?1, amount = ?2 WHERE id = ?3",
        params![quantity, amount, id],
    )?;
    
    recalculate_position_from_transactions(&conn, &symbol)?;
    
    Ok(())
}

pub fn delete_portfolio_transaction(conn: &Mutex<Connection>, id: i64) -> Result<()> {
    let conn = conn.lock().unwrap();
    
    let mut stmt = conn.prepare("SELECT symbol, transaction_type, quantity FROM portfolio_transactions WHERE id = ?1")?;
    let transaction_info: Option<(String, String, i64)> = stmt.query_row(params![id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))
    }).ok();
    
    conn.execute("DELETE FROM portfolio_transactions WHERE id = ?1", params![id])?;
    
    if let Some((symbol, _transaction_type, _quantity)) = transaction_info {
        recalculate_position_from_transactions(&conn, &symbol)?;
    }
    
    Ok(())
}

fn recalculate_position_from_transactions(conn: &Connection, symbol: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    
    let mut stmt = conn.prepare(
        "SELECT transaction_type, quantity, price, commission FROM portfolio_transactions 
         WHERE symbol = ?1 ORDER BY transaction_date ASC, created_at ASC"
    )?;
    let rows = stmt.query_map(params![symbol], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, f64>(3)?,
        ))
    })?;
    
    let mut total_quantity: i64 = 0;
    let mut total_cost: f64 = 0.0;
    let mut avg_cost: f64 = 0.0;
    let mut last_price: f64 = 0.0;
    
    for row in rows {
        let (transaction_type, quantity, price, commission) = row?;
        if transaction_type == "buy" {
            let cost_with_commission = quantity as f64 * price + commission;
            if total_quantity == 0 {
                total_cost = cost_with_commission;
                total_quantity = quantity;
                avg_cost = cost_with_commission / quantity as f64;
            } else {
                total_cost += cost_with_commission;
                total_quantity += quantity;
                avg_cost = total_cost / total_quantity as f64;
            }
            last_price = price;
        } else if transaction_type == "sell" {
            if total_quantity > 0 {
                let cost_per_share = avg_cost;
                total_cost -= cost_per_share * quantity as f64;
                total_quantity = (total_quantity - quantity).max(0);
                if total_quantity > 0 {
                    avg_cost = total_cost / total_quantity as f64;
                }
            }
            last_price = price;
        }
    }
    
    let name: String = conn.query_row(
        "SELECT name FROM stocks WHERE symbol = ?1",
        params![symbol],
        |row| row.get(0)
    )?;
    
    if total_quantity > 0 {
        let current_price = if last_price > 0.0 { Some(last_price) } else { None };
        
        let mut pos_stmt = conn.prepare("SELECT id FROM portfolio_positions WHERE symbol = ?1")?;
        let position_exists = pos_stmt.exists(params![symbol])?;
        
        if position_exists {
            conn.execute(
                "UPDATE portfolio_positions SET quantity = ?1, avg_cost = ?2, current_price = ?3, updated_at = ?4 WHERE symbol = ?5",
                params![total_quantity, avg_cost, current_price, now, symbol],
            )?;
        } else {
            conn.execute(
                "INSERT INTO portfolio_positions (symbol, name, quantity, avg_cost, current_price, created_at, updated_at) 
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![symbol, name, total_quantity, avg_cost, current_price, now],
            )?;
        }
    } else {
        conn.execute("DELETE FROM portfolio_positions WHERE symbol = ?1", params![symbol])?;
    }
    
    Ok(())
}

pub fn recalculate_all_positions_from_transactions(conn: &Mutex<Connection>) -> Result<()> {
    let conn = conn.lock().unwrap();
    
    let mut stmt = conn.prepare("SELECT DISTINCT symbol FROM portfolio_transactions")?;
    let symbols: Vec<String> = stmt.query_map([], |row| {
        Ok(row.get::<_, String>(0)?)
    })?.collect::<Result<Vec<_>, _>>()?;
    
    for symbol in symbols {
        recalculate_position_from_transactions(&conn, &symbol)?;
    }
    
    conn.execute(
        "DELETE FROM portfolio_positions WHERE symbol NOT IN (SELECT DISTINCT symbol FROM portfolio_transactions)",
        [],
    )?;
    
    Ok(())
}
