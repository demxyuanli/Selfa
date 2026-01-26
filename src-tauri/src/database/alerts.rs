use rusqlite::{Connection, Result, params};
use chrono::Utc;

pub fn create_price_alert(
    conn: &Connection,
    symbol: &str,
    threshold_price: f64,
    direction: &str,
) -> Result<i64> {
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT INTO price_alerts (symbol, threshold_price, direction, enabled, triggered, created_at, updated_at) 
         VALUES (?1, ?2, ?3, 1, 0, ?4, ?4)",
        params![symbol, threshold_price, direction, now],
    )?;
    
    Ok(conn.last_insert_rowid())
}

pub fn get_price_alerts(conn: &Connection, symbol: Option<&str>) -> Result<Vec<(i64, String, f64, String, bool, bool)>> {
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
    conn: &Connection,
    alert_id: i64,
    threshold_price: Option<f64>,
    direction: Option<&str>,
    enabled: Option<bool>,
) -> Result<()> {
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

pub fn delete_price_alert(conn: &Connection, alert_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM price_alerts WHERE id = ?1",
        params![alert_id],
    )?;
    
    Ok(())
}

pub fn get_active_price_alerts(conn: &Connection) -> Result<Vec<(i64, String, f64, String)>> {
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

pub fn mark_alert_triggered(conn: &Connection, alert_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE price_alerts SET triggered = 1 WHERE id = ?1",
        params![alert_id],
    )?;
    
    Ok(())
}

pub fn reset_alert_triggered(conn: &Connection, alert_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE price_alerts SET triggered = 0 WHERE id = ?1",
        params![alert_id],
    )?;
    
    Ok(())
}

pub fn reset_all_triggered_alerts(conn: &Connection) -> Result<usize> {
    let updated = conn.execute(
        "UPDATE price_alerts SET triggered = 0 WHERE triggered = 1",
        [],
    )?;
    
    Ok(updated)
}
