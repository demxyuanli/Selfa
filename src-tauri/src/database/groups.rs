use rusqlite::{Connection, Result, params};
use chrono::Utc;

pub fn create_group(conn: &Connection, name: &str) -> Result<i64> {
    let mut stmt = conn.prepare("SELECT id FROM stock_groups WHERE name = ?1")?;
    let mut rows = stmt.query_map(params![name], |row| {
        Ok(row.get::<_, i64>(0)?)
    })?;
    
    if let Some(row) = rows.next() {
        return Ok(row?);
    }
    
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO stock_groups (name, created_at, updated_at) VALUES (?1, ?2, ?2)",
        params![name, now],
    )?;
    
    let id = conn.last_insert_rowid();
    Ok(id)
}

pub fn get_groups(conn: &Connection) -> Result<Vec<String>> {
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
pub fn get_group_id_by_name(conn: &Connection, name: &str) -> Result<Option<i64>> {
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

pub fn update_group(conn: &Connection, old_name: &str, new_name: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "UPDATE stock_groups SET name = ?1, updated_at = ?2 WHERE name = ?3",
        params![new_name, now, old_name],
    )?;
    
    Ok(())
}

pub fn delete_group(conn: &Connection, name: &str) -> Result<()> {
    conn.execute(
        "UPDATE stocks SET group_id = NULL WHERE group_id = (SELECT id FROM stock_groups WHERE name = ?1)",
        params![name],
    )?;
    
    conn.execute("DELETE FROM stock_groups WHERE name = ?1", params![name])?;
    
    Ok(())
}

pub fn move_stock_to_group(conn: &Connection, symbol: &str, group_name: Option<&str>) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    
    let group_id: Option<i64> = if let Some(group_name) = group_name {
        let mut stmt = conn.prepare("SELECT id FROM stock_groups WHERE name = ?1")?;
        let mut rows = stmt.query_map(params![group_name], |row| {
            Ok(row.get::<_, i64>(0)?)
        })?;
        
        if let Some(row) = rows.next() {
            Some(row?)
        } else {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
    } else {
        None
    };
    
    conn.execute(
        "UPDATE stocks SET group_id = ?1, updated_at = ?2 WHERE symbol = ?3",
        params![group_id, now, symbol],
    )?;
    
    Ok(())
}
