use super::types::{StockData, TechnicalIndicators};

pub struct MacdResult {
    pub macd: Vec<f64>,
    pub signal: Vec<f64>,
    pub histogram: Vec<f64>,
}

pub fn calculate_indicators(data: Vec<StockData>) -> TechnicalIndicators {
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    
    let sma_20 = calculate_sma(&closes, 20);
    let sma_50 = calculate_sma(&closes, 50);
    let ema_12 = calculate_ema(&closes, 12);
    let ema_26 = calculate_ema(&closes, 26);
    let rsi = calculate_rsi(&closes, 14);
    
    let macd_result = calculate_macd(&closes, 12, 26, 9);
    
    TechnicalIndicators {
        sma_20,
        sma_50,
        ema_12,
        ema_26,
        rsi,
        macd: macd_result.macd,
        macd_signal: macd_result.signal,
        macd_histogram: macd_result.histogram,
    }
}

pub fn calculate_sma(data: &[f64], period: usize) -> Vec<f64> {
    let mut result = Vec::new();
    
    for i in 0..data.len() {
        if i < period - 1 {
            result.push(0.0);
        } else {
            let window = &data[i.saturating_sub(period - 1)..=i];
            let valid_values: Vec<f64> = window.iter()
                .filter(|&&x| x.is_finite() && x > 0.0)
                .copied()
                .collect();
            
            if valid_values.is_empty() {
                result.push(0.0);
            } else {
                let sum: f64 = valid_values.iter().sum();
                result.push(sum / valid_values.len() as f64);
            }
        }
    }
    
    result
}

pub fn calculate_ema(data: &[f64], period: usize) -> Vec<f64> {
    if data.is_empty() {
        return Vec::new();
    }
    
    let multiplier = 2.0 / (period as f64 + 1.0);
    let mut result = Vec::new();
    
    let first_valid = data.iter().find(|&&x| x.is_finite() && x > 0.0).copied();
    if first_valid.is_none() {
        return vec![0.0; data.len()];
    }
    
    let mut ema = first_valid.unwrap();
    result.push(ema);
    
    for i in 1..data.len() {
        if data[i].is_finite() && data[i] > 0.0 {
            ema = (data[i] * multiplier) + (ema * (1.0 - multiplier));
            result.push(ema);
        } else {
            result.push(ema);
        }
    }
    
    result
}

pub fn calculate_rsi(data: &[f64], period: usize) -> Vec<f64> {
    if data.len() < period + 1 {
        return vec![0.0; data.len()];
    }
    
    let mut gains = Vec::new();
    let mut losses = Vec::new();
    
    for i in 1..data.len() {
        let change = data[i] - data[i - 1];
        gains.push(if change > 0.0 { change } else { 0.0 });
        losses.push(if change < 0.0 { -change } else { 0.0 });
    }
    
    let mut result = vec![0.0; period];
    
    for i in period..gains.len() {
        let avg_gain: f64 = gains[i.saturating_sub(period)..=i].iter().sum::<f64>() / period as f64;
        let avg_loss: f64 = losses[i.saturating_sub(period)..=i].iter().sum::<f64>() / period as f64;
        
        if avg_loss == 0.0 {
            result.push(100.0);
        } else {
            let rs = avg_gain / avg_loss;
            result.push(100.0 - (100.0 / (1.0 + rs)));
        }
    }
    
    result
}

pub fn calculate_macd(data: &[f64], fast: usize, slow: usize, signal: usize) -> MacdResult {
    let ema_fast = calculate_ema(data, fast);
    let ema_slow = calculate_ema(data, slow);
    
    let macd_line: Vec<f64> = ema_fast
        .iter()
        .zip(ema_slow.iter())
        .map(|(f, s)| {
            let diff = f - s;
            if diff.is_finite() { diff } else { 0.0 }
        })
        .collect();
    
    let signal_line = calculate_ema(&macd_line, signal);
    
    let histogram: Vec<f64> = macd_line
        .iter()
        .zip(signal_line.iter())
        .map(|(m, s)| {
            let hist = m - s;
            if hist.is_finite() { hist } else { 0.0 }
        })
        .collect();
    
    MacdResult {
        macd: macd_line,
        signal: signal_line,
        histogram,
    }
}

#[allow(dead_code)]
pub fn calculate_stochastic_oscillator(data: &[StockData], period: usize) -> Vec<f64> {
    if data.len() < period {
        return vec![0.0; data.len()];
    }
    
    let mut k_values = vec![0.0; period - 1];
    
    // Calculate %K (fast stochastic)
    for i in (period - 1)..data.len() {
        let window = &data[(i + 1 - period)..=i];
        let high = window.iter().map(|d| d.high).fold(0.0_f64, f64::max);
        let low = window.iter().map(|d| d.low).fold(f64::INFINITY, f64::min);
        let close = data[i].close;
        
        if high != low && high.is_finite() && low.is_finite() && close.is_finite() {
            let stoch_k = ((close - low) / (high - low)) * 100.0;
            k_values.push(stoch_k);
        } else {
            k_values.push(50.0);
        }
    }
    
    k_values
}

#[allow(dead_code)]
pub struct StochasticResult {
    pub k: Vec<f64>,
    pub d: Vec<f64>,
}

#[allow(dead_code)]
pub fn calculate_stochastic_with_d(data: &[StockData], k_period: usize, d_period: usize) -> StochasticResult {
    let k_values = calculate_stochastic_oscillator(data, k_period);
    
    // Calculate %D (SMA of %K, typically 3-period)
    let mut d_values = vec![0.0; k_period - 1];
    
    if k_values.len() >= k_period - 1 + d_period {
        for idx in (k_period - 1)..k_values.len() {
            if idx >= d_period - 1 {
                let d_window_start = idx.saturating_sub(d_period - 1);
                let d_sum: f64 = k_values[d_window_start..=idx].iter().sum();
                d_values.push(d_sum / d_period as f64);
            } else {
                d_values.push(50.0);
            }
        }
    } else {
        // Pad with neutral values if insufficient data
        for _idx in (k_period - 1)..k_values.len() {
            d_values.push(50.0);
        }
    }
    
    StochasticResult {
        k: k_values,
        d: d_values,
    }
}

#[allow(dead_code)]
pub fn calculate_adx(data: &[StockData], period: usize) -> Vec<f64> {
    if data.len() < period + 1 {
        return vec![0.0; data.len()];
    }
    
    let mut tr_values = Vec::new();
    let mut plus_dm = Vec::new();
    let mut minus_dm = Vec::new();
    
    for i in 1..data.len() {
        let high_diff = data[i].high - data[i - 1].high;
        let low_diff = data[i - 1].low - data[i].low;
        
        let tr = ((data[i].high - data[i].low).abs())
            .max((data[i].high - data[i - 1].close).abs())
            .max((data[i].low - data[i - 1].close).abs());
        tr_values.push(tr);
        
        let plus = if high_diff > low_diff && high_diff > 0.0 { high_diff } else { 0.0 };
        let minus = if low_diff > high_diff && low_diff > 0.0 { low_diff } else { 0.0 };
        plus_dm.push(plus);
        minus_dm.push(minus);
    }
    
    let mut result = vec![0.0; period];
    
    // Initial ATR/DM sums (simple average for first period)
    let mut atr = if !tr_values.is_empty() {
        tr_values[0..period.min(tr_values.len())].iter().sum::<f64>() / period.min(tr_values.len()) as f64
    } else {
        0.0
    };
    let mut plus_di_smoothed = if !plus_dm.is_empty() {
        plus_dm[0..period.min(plus_dm.len())].iter().sum::<f64>() / period.min(plus_dm.len()) as f64
    } else {
        0.0
    };
    let mut minus_di_smoothed = if !minus_dm.is_empty() {
        minus_dm[0..period.min(minus_dm.len())].iter().sum::<f64>() / period.min(minus_dm.len()) as f64
    } else {
        0.0
    };
    
    // Wilder smoothing: smoothed = prev * (period-1)/period + current
    let wilder_factor = (period as f64 - 1.0) / period as f64;
    
    for i in period..tr_values.len() {
        // Apply Wilder smoothing to ATR
        atr = atr * wilder_factor + tr_values[i];
        plus_di_smoothed = plus_di_smoothed * wilder_factor + plus_dm[i];
        minus_di_smoothed = minus_di_smoothed * wilder_factor + minus_dm[i];
        
        // Calculate DI (Directional Indicator)
        let plus_di = if atr > 0.0 { (plus_di_smoothed / atr) * 100.0 } else { 0.0 };
        let minus_di = if atr > 0.0 { (minus_di_smoothed / atr) * 100.0 } else { 0.0 };
        
        // Calculate DX (Directional Index)
        let dx = if (plus_di + minus_di) > 0.0 {
            ((plus_di - minus_di).abs() / (plus_di + minus_di)) * 100.0
        } else {
            0.0
        };
        
        result.push(dx);
    }
    
    result
}
