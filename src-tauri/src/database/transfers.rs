use rusqlite::{Connection, Result, params};
use chrono::Utc;

pub fn add_capital_transfer(
    conn: &Connection,
    transfer_type: &str,
    amount: f64,
    transfer_date: &str,
    notes: Option<&str>,
) -> Result<i64> {
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO capital_transfers (transfer_type, amount, transfer_date, notes, created_at) 
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![transfer_type, amount, transfer_date, notes, now],
    )?;

    Ok(conn.last_insert_rowid())
}

pub fn get_capital_transfers(conn: &Connection) -> Result<Vec<(i64, String, f64, String, Option<String>)>> {
    let mut transfers = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT id, transfer_type, amount, transfer_date, notes 
         FROM capital_transfers 
         ORDER BY transfer_date DESC, created_at DESC"
    )?;
    
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
        ))
    })?;
    
    for row in rows {
        transfers.push(row?);
    }
    
    Ok(transfers)
}

pub fn update_capital_transfer(
    conn: &Connection,
    id: i64,
    transfer_type: Option<&str>,
    amount: Option<f64>,
    transfer_date: Option<&str>,
    notes: Option<&str>,
) -> Result<()> {
    let mut updates = Vec::new();
    
    if transfer_type.is_some() {
        updates.push("transfer_type = ?");
    }
    if amount.is_some() {
        updates.push("amount = ?");
    }
    if transfer_date.is_some() {
        updates.push("transfer_date = ?");
    }
    if notes.is_some() {
        updates.push("notes = ?");
    }
    
    if updates.is_empty() {
        return Ok(());
    }
    
    let sql = format!("UPDATE capital_transfers SET {} WHERE id = ?", updates.join(", "));
    
    match (transfer_type, amount, transfer_date, notes) {
        (Some(tt), Some(amt), Some(td), Some(nt)) => {
            conn.execute(&sql, params![tt, amt, td, nt, id])?;
        }
        (Some(tt), Some(amt), Some(td), None) => {
            conn.execute(&sql, params![tt, amt, td, id])?;
        }
        (Some(tt), Some(amt), None, Some(nt)) => {
            conn.execute(&sql, params![tt, amt, nt, id])?;
        }
        (Some(tt), Some(amt), None, None) => {
            conn.execute(&sql, params![tt, amt, id])?;
        }
        (Some(tt), None, Some(td), Some(nt)) => {
            conn.execute(&sql, params![tt, td, nt, id])?;
        }
        (Some(tt), None, Some(td), None) => {
            conn.execute(&sql, params![tt, td, id])?;
        }
        (Some(tt), None, None, Some(nt)) => {
            conn.execute(&sql, params![tt, nt, id])?;
        }
        (Some(tt), None, None, None) => {
            conn.execute(&sql, params![tt, id])?;
        }
        (None, Some(amt), Some(td), Some(nt)) => {
            conn.execute(&sql, params![amt, td, nt, id])?;
        }
        (None, Some(amt), Some(td), None) => {
            conn.execute(&sql, params![amt, td, id])?;
        }
        (None, Some(amt), None, Some(nt)) => {
            conn.execute(&sql, params![amt, nt, id])?;
        }
        (None, Some(amt), None, None) => {
            conn.execute(&sql, params![amt, id])?;
        }
        (None, None, Some(td), Some(nt)) => {
            conn.execute(&sql, params![td, nt, id])?;
        }
        (None, None, Some(td), None) => {
            conn.execute(&sql, params![td, id])?;
        }
        (None, None, None, Some(nt)) => {
            conn.execute(&sql, params![nt, id])?;
        }
        (None, None, None, None) => {
            return Ok(());
        }
    }
    
    Ok(())
}

pub fn delete_capital_transfer(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM capital_transfers WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_total_capital(conn: &Connection) -> Result<f64> {
    let mut stmt = conn.prepare(
        "SELECT 
            COALESCE(SUM(CASE WHEN transfer_type = 'deposit' THEN amount ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN transfer_type = 'withdraw' THEN amount ELSE 0 END), 0) as total
         FROM capital_transfers"
    )?;
    
    let total: f64 = stmt.query_row([], |row| row.get(0))?;
    Ok(total)
}
