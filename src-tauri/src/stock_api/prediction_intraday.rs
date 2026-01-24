use crate::stock_api::types::{StockData, PredictionResult};
use crate::stock_api::utils::{parse_datetime, add_minutes, calculate_variance, determine_signal};

/// Helper to detect interval
fn detect_interval_minutes(data: &[StockData]) -> i64 {
    if data.len() < 2 {
        return 5; // Default fallback
    }
    
    // Check the last few intervals to be robust
    let n = data.len();
    let last_time = parse_datetime(&data[n-1].date);
    let prev_time = parse_datetime(&data[n-2].date);
    
    if let (Ok(t1), Ok(t2)) = (last_time, prev_time) {
        let diff = t1.signed_duration_since(t2).num_minutes();
        if diff > 0 && diff <= 240 { // Accept up to 4 hours (e.g. half day bars)
            return diff;
        }
    }
    
    // Try one more step back if available
    if n >= 3 {
        let t2 = parse_datetime(&data[n-2].date);
        let t3 = parse_datetime(&data[n-3].date);
        if let (Ok(t2), Ok(t3)) = (t2, t3) {
            let diff = t2.signed_duration_since(t3).num_minutes();
            if diff > 0 && diff <= 240 {
                return diff;
            }
        }
    }
    
    5 // Default fallback
}

/// Intraday Moving Average Prediction
/// Uses short-term SMA/EMA to predict next N minutes/bars.
/// Suitable for high-frequency data (1min, 5min).
pub fn predict_intraday_ma(
    data: &[StockData],
    _start_date: &str, // Ignored, we use the last data point's time
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 20 {
        return Err("Intraday MA requires at least 20 data points".to_string());
    }

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = closes[closes.len() - 1];
    let last_date_str = &data[data.len() - 1].date;
    
    // Calculate short-term EMAs
    let ema_5 = calculate_ema(&closes, 5);
    let ema_10 = calculate_ema(&closes, 10);
    
    let last_ema5 = ema_5.last().copied().unwrap_or(last_price);
    let last_ema10 = ema_10.last().copied().unwrap_or(last_price);
    
    // Determine trend from EMA crossover
    let trend_strength = last_ema5 - last_ema10;
    
    // Volatility for confidence
    let variance = calculate_variance(&closes[closes.len().saturating_sub(20)..]);
    let std_dev = variance.sqrt();
    
    let mut results = Vec::new();
    let interval_minutes = detect_interval_minutes(data);
    
    for i in 1..=period {
        // Project trend with decay
        let decay = (-0.1 * i as f64).exp();
        let predicted = last_ema5 + trend_strength * decay + (last_price - last_ema5) * decay * 0.5;
        
        let confidence = (60.0 + (trend_strength.abs() / last_price) * 1000.0).min(90.0);
        
        // Add time
        let future_time = add_minutes(last_date_str, interval_minutes * i as i64)
            .unwrap_or_else(|_| format!("+{}m", i as i64 * interval_minutes));
            
        let signal = determine_signal(predicted, last_price, trend_strength);
        
        results.push(PredictionResult {
            date: future_time,
            predicted_price: predicted,
            confidence,
            signal,
            upper_bound: predicted + std_dev * 0.5,
            lower_bound: predicted - std_dev * 0.5,
            method: "Intraday MA".to_string(),
        });
    }
    
    Ok(results)
}

/// Intraday Volatility Breakout Prediction (Bollinger Logic)
pub fn predict_intraday_volatility(
    data: &[StockData],
    _start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 20 {
        return Err("Intraday Volatility requires at least 20 data points".to_string());
    }

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = closes[closes.len() - 1];
    let last_date_str = &data[data.len() - 1].date;
    
    // Calculate Bollinger Bands (20, 2)
    let window = 20;
    let recent_data = &closes[closes.len() - window..];
    let sma: f64 = recent_data.iter().sum::<f64>() / window as f64;
    let variance = calculate_variance(recent_data);
    let std_dev = variance.sqrt();
    
    let upper = sma + 2.0 * std_dev;
    let lower = sma - 2.0 * std_dev;
    
    // Detect Breakout
    let predicted_change;
    let mut signal_type = "hold";
    
    if last_price > upper {
        predicted_change = std_dev * 0.5; // Momentum continuation
        signal_type = "buy";
    } else if last_price < lower {
        predicted_change = -std_dev * 0.5;
        signal_type = "sell";
    } else {
        // Mean Reversion towards SMA
        predicted_change = (sma - last_price) * 0.1;
    }
    
    let mut results = Vec::new();
    let interval_minutes = detect_interval_minutes(data);
    
    for i in 1..=period {
        let predicted = last_price + predicted_change * (i as f64).sqrt(); // Diffusive expansion
        let confidence = 55.0;
        
        let future_time = add_minutes(last_date_str, interval_minutes * i as i64)
            .unwrap_or_else(|_| format!("+{}m", i as i64 * interval_minutes));
            
        results.push(PredictionResult {
            date: future_time,
            predicted_price: predicted,
            confidence,
            signal: signal_type.to_string(),
            upper_bound: predicted + std_dev,
            lower_bound: predicted - std_dev,
            method: "Intraday Volatility".to_string(),
        });
    }
    
    Ok(results)
}

/// Simplified Regime Switching (HMM-like)
/// Classifies state into: Low Vol (Sideways), High Vol Up (Bull), High Vol Down (Bear)
pub fn predict_intraday_regime(
    data: &[StockData],
    _start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 30 {
        return Err("Regime detection requires at least 30 data points".to_string());
    }

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = closes[closes.len() - 1];
    let last_date_str = &data[data.len() - 1].date;
    
    // Calculate short-term volatility (5 bars) vs long-term (20 bars)
    let vol_short = calculate_variance(&closes[closes.len()-5..]).sqrt();
    let vol_long = calculate_variance(&closes[closes.len()-20..]).sqrt();
    
    // Calculate Trend
    let trend = closes[closes.len()-1] - closes[closes.len()-10];
    
    // Determine Regime
    let regime = if vol_short < vol_long * 0.8 {
        0 // Low Vol / Consolidation
    } else if trend > 0.0 {
        1 // Bull Trend
    } else {
        -1 // Bear Trend
    };
    
    let mut results = Vec::new();
    let interval_minutes = detect_interval_minutes(data);
    
    for i in 1..=period {
        let drift = match regime {
            1 => vol_short * 0.5,
            -1 => -vol_short * 0.5,
            _ => 0.0,
        };
        
        let predicted = last_price + drift * i as f64;
        let confidence = if regime == 0 { 70.0 } else { 60.0 };
        
        let future_time = add_minutes(last_date_str, interval_minutes * i as i64)
            .unwrap_or_else(|_| format!("+{}m", i as i64 * interval_minutes));
            
        let signal = match regime {
            1 => "buy",
            -1 => "sell",
            _ => "hold",
        };
        
        results.push(PredictionResult {
            date: future_time,
            predicted_price: predicted,
            confidence,
            signal: signal.to_string(),
            upper_bound: predicted + vol_short * (1.0 + 0.1 * i as f64),
            lower_bound: predicted - vol_short * (1.0 + 0.1 * i as f64),
            method: "Intraday Regime".to_string(),
        });
    }
    
    Ok(results)
}

// Helper
fn calculate_ema(data: &[f64], period: usize) -> Vec<f64> {
    if data.is_empty() { return Vec::new(); }
    let k = 2.0 / (period as f64 + 1.0);
    let mut ema = vec![0.0; data.len()];
    ema[0] = data[0];
    for i in 1..data.len() {
        ema[i] = data[i] * k + ema[i-1] * (1.0 - k);
    }
    ema
}
