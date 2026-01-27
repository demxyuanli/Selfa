use serde::{Deserialize, Serialize};
use crate::stock_api::types::StockData;

#[derive(Debug, Serialize, Deserialize)]
pub struct VolumeProfileBin {
    pub price_range_start: f64,
    pub price_range_end: f64,
    pub volume: f64,
    pub buy_volume: f64, // Estimated
    pub sell_volume: f64, // Estimated
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LargeOrder {
    pub date: String,
    pub price: f64,
    pub volume: f64,
    pub amount: f64,
    pub type_: String, // "buy" or "sell" (estimated)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BuyingPressure {
    pub total_buy_volume: f64,
    pub total_sell_volume: f64,
    pub buy_sell_ratio: f64,
    pub net_inflow: f64,
    pub cumulative_delta: Vec<f64>, // Added: Cumulative Delta
    pub delta_result: Option<Vec<f64>>, // Added: Individual Delta per bar
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IntradayAnalysisResult {
    pub volume_profile: Vec<VolumeProfileBin>,
    pub large_orders: Vec<LargeOrder>,
    pub buying_pressure: BuyingPressure,
    pub vwap: Vec<f64>,
    pub vwap_deviation: Vec<f64>,
    pub relative_volume: Vec<f64>,
    pub momentum: Vec<f64>,
    pub volatility: Vec<f64>,
    pub opening_range_high: f64,
    pub opening_range_low: f64,
    pub opening_range_breakout: String,
    pub trend_slope: f64,
    pub trend_r2: f64,
}

pub fn analyze_intraday_data(data: &[StockData]) -> IntradayAnalysisResult {
    let volume_profile = calculate_volume_profile(data, 20);
    let large_orders = detect_large_orders(data, 3.0);
    let buying_pressure = calculate_buying_pressure(data);
    let vwap = calculate_vwap_series(data);
    let vwap_deviation = calculate_vwap_deviation(data, &vwap);
    let relative_volume = calculate_relative_volume(data, 20);
    let momentum = calculate_momentum(data, 5);
    let volatility = calculate_volatility(data, 20);
    let (opening_range_high, opening_range_low) = calculate_opening_range(data, 30);
    let opening_range_breakout = calculate_opening_range_breakout(data, opening_range_high, opening_range_low);
    let (trend_slope, trend_r2) = calculate_trend_strength(data, 60);

    IntradayAnalysisResult {
        volume_profile,
        large_orders,
        buying_pressure,
        vwap,
        vwap_deviation,
        relative_volume,
        momentum,
        volatility,
        opening_range_high,
        opening_range_low,
        opening_range_breakout,
        trend_slope,
        trend_r2,
    }
}

fn calculate_volume_profile(data: &[StockData], bins: usize) -> Vec<VolumeProfileBin> {
    if data.is_empty() {
        return Vec::new();
    }

    let min_price = data.iter().map(|d| d.low).fold(f64::INFINITY, f64::min);
    let max_price = data.iter().map(|d| d.high).fold(f64::NEG_INFINITY, f64::max);
    
    if min_price == max_price {
        return Vec::new();
    }

    let range = max_price - min_price;
    let step = range / bins as f64;
    
    let mut profile = Vec::with_capacity(bins);
    for i in 0..bins {
        profile.push(VolumeProfileBin {
            price_range_start: min_price + i as f64 * step,
            price_range_end: min_price + (i + 1) as f64 * step,
            volume: 0.0,
            buy_volume: 0.0,
            sell_volume: 0.0,
        });
    }

    for d in data {
        // Distribute volume across the candle's range
        // Simplified: Assign to the bin of the typical price
        let typical_price = (d.close + d.high + d.low) / 3.0;
        let bin_idx = ((typical_price - min_price) / step).floor() as usize;
        let bin_idx = bin_idx.min(bins - 1); // Clamp to max bin

        let is_up = d.close >= d.open;
        
        profile[bin_idx].volume += d.volume as f64;
        if is_up {
            profile[bin_idx].buy_volume += d.volume as f64;
        } else {
            profile[bin_idx].sell_volume += d.volume as f64;
        }
    }

    profile
}

fn detect_large_orders(data: &[StockData], threshold_multiplier: f64) -> Vec<LargeOrder> {
    if data.is_empty() {
        return Vec::new();
    }

    let avg_volume: f64 = data.iter().map(|d| d.volume as f64).sum::<f64>() / data.len() as f64;
    let threshold = avg_volume * threshold_multiplier;

    let mut large_orders = Vec::new();

    for d in data {
        if d.volume as f64 > threshold {
            let is_buy = d.close >= d.open;
            large_orders.push(LargeOrder {
                date: d.date.clone(),
                price: d.close,
                volume: d.volume as f64,
                amount: d.close * d.volume as f64,
                type_: if is_buy { "buy".to_string() } else { "sell".to_string() },
            });
        }
    }

    large_orders
}

fn calculate_buying_pressure(data: &[StockData]) -> BuyingPressure {
    let mut total_buy = 0.0;
    let mut total_sell = 0.0;
    let mut cumulative_delta = Vec::with_capacity(data.len());
    let mut delta_result = Vec::with_capacity(data.len());
    let mut current_cum_delta = 0.0;

    for d in data {
        let vol = d.volume as f64;
        let range = d.high - d.low;
        let buy_ratio;

        if range > 0.0 {
            // Enhanced Position Ratio Method (增强型位置比例法)
            // Combine position within range and entity direction
            let position = (d.close - d.low) / range;
            let entity_ratio = (d.close - d.open) / range; // Entity strength (-1.0 to 1.0)
            
            // Non-linear weighting: position * (1 + clamped_entity_strength)
            // This gives more weight to the direction of the candle body
            let adjusted_buy_ratio = position * (1.0 + entity_ratio.clamp(-0.5, 0.5));
            
            // Layered Threshold Allocation (分层阈值分配) - Optional refinement
            // If close is very high, assume aggressive buying
            // If close is very low, assume aggressive selling
            let refined_ratio = if adjusted_buy_ratio > 0.8 {
                0.85 // Aggressive buy
            } else if adjusted_buy_ratio < 0.2 {
                0.15 // Aggressive sell
            } else {
                adjusted_buy_ratio
            };

            buy_ratio = refined_ratio.clamp(0.0, 1.0);
        } else {
            // Flat range (Doji or limit up/down)
            if d.close > d.open {
                buy_ratio = 1.0;
            } else if d.close < d.open {
                buy_ratio = 0.0;
            } else {
                // Check against previous close if available? 
                // For now, 0.5 split
                buy_ratio = 0.5;
            }
        }
        
        let buy_vol = vol * buy_ratio;
        let sell_vol = vol * (1.0 - buy_ratio);
        
        total_buy += buy_vol;
        total_sell += sell_vol;
        
        // Calculate Delta
        let delta = buy_vol - sell_vol;
        current_cum_delta += delta;
        
        delta_result.push(delta);
        cumulative_delta.push(current_cum_delta);
    }

    let buy_sell_ratio = if total_sell > 0.0 { total_buy / total_sell } else { 0.0 };

    BuyingPressure {
        total_buy_volume: total_buy,
        total_sell_volume: total_sell,
        buy_sell_ratio,
        net_inflow: total_buy - total_sell,
        cumulative_delta,
        delta_result: Some(delta_result),
    }
}

fn calculate_vwap_series(data: &[StockData]) -> Vec<f64> {
    let mut vwap = Vec::with_capacity(data.len());
    let mut cumulative_volume = 0.0;
    let mut cumulative_value = 0.0;

    for d in data {
        let volume = d.volume as f64;
        if volume <= 0.0 {
            vwap.push(if cumulative_volume > 0.0 { cumulative_value / cumulative_volume } else { d.close });
            continue;
        }
        let typical_price = (d.high + d.low + d.close) / 3.0;
        cumulative_volume += volume;
        cumulative_value += typical_price * volume;
        vwap.push(cumulative_value / cumulative_volume);
    }

    vwap
}

fn calculate_vwap_deviation(data: &[StockData], vwap: &[f64]) -> Vec<f64> {
    data.iter()
        .zip(vwap.iter())
        .map(|(d, v)| d.close - v)
        .collect()
}

fn calculate_relative_volume(data: &[StockData], window: usize) -> Vec<f64> {
    if data.is_empty() {
        return Vec::new();
    }
    let mut result = Vec::with_capacity(data.len());
    for i in 0..data.len() {
        let start = i.saturating_sub(window);
        let slice = &data[start..i];
        let avg = if slice.is_empty() {
            data[i].volume as f64
        } else {
            slice.iter().map(|d| d.volume as f64).sum::<f64>() / slice.len() as f64
        };
        let ratio = if avg > 0.0 { data[i].volume as f64 / avg } else { 0.0 };
        result.push(ratio);
    }
    result
}

fn calculate_momentum(data: &[StockData], window: usize) -> Vec<f64> {
    if data.is_empty() {
        return Vec::new();
    }
    let mut result = Vec::with_capacity(data.len());
    for i in 0..data.len() {
        if i < window {
            result.push(0.0);
            continue;
        }
        let prev = data[i - window].close;
        let momentum = if prev != 0.0 { (data[i].close - prev) / prev } else { 0.0 };
        result.push(momentum);
    }
    result
}

fn calculate_volatility(data: &[StockData], window: usize) -> Vec<f64> {
    if data.is_empty() {
        return Vec::new();
    }
    let mut result = Vec::with_capacity(data.len());
    let mut returns: Vec<f64> = Vec::with_capacity(data.len());
    for i in 0..data.len() {
        if i == 0 {
            returns.push(0.0);
        } else {
            let prev = data[i - 1].close;
            let ret = if prev != 0.0 { (data[i].close - prev) / prev } else { 0.0 };
            returns.push(ret);
        }
    }
    for i in 0..returns.len() {
        let start = i.saturating_sub(window);
        let slice = &returns[start..=i];
        let mean = slice.iter().sum::<f64>() / slice.len() as f64;
        let variance = slice.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / slice.len() as f64;
        result.push(variance.sqrt());
    }
    result
}

fn calculate_opening_range(data: &[StockData], window: usize) -> (f64, f64) {
    if data.is_empty() {
        return (0.0, 0.0);
    }
    let end = window.min(data.len());
    let slice = &data[..end];
    let high = slice.iter().map(|d| d.high).fold(f64::NEG_INFINITY, f64::max);
    let low = slice.iter().map(|d| d.low).fold(f64::INFINITY, f64::min);
    (high, low)
}

fn calculate_opening_range_breakout(data: &[StockData], high: f64, low: f64) -> String {
    if data.is_empty() {
        return "unknown".to_string();
    }
    let last_close = data.last().map(|d| d.close).unwrap_or(0.0);
    if last_close > high {
        "up".to_string()
    } else if last_close < low {
        "down".to_string()
    } else {
        "inside".to_string()
    }
}

fn calculate_trend_strength(data: &[StockData], window: usize) -> (f64, f64) {
    if data.len() < 2 {
        return (0.0, 0.0);
    }
    let start = data.len().saturating_sub(window);
    let slice = &data[start..];
    let n = slice.len() as f64;
    if n < 2.0 {
        return (0.0, 0.0);
    }
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    let mut sum_xy = 0.0;
    let mut sum_x2 = 0.0;
    for (idx, d) in slice.iter().enumerate() {
        let x = idx as f64;
        let y = d.close;
        sum_x += x;
        sum_y += y;
        sum_xy += x * y;
        sum_x2 += x * x;
    }
    let denom = n * sum_x2 - sum_x * sum_x;
    if denom == 0.0 {
        return (0.0, 0.0);
    }
    let slope = (n * sum_xy - sum_x * sum_y) / denom;
    let intercept = (sum_y - slope * sum_x) / n;
    let mut ss_tot = 0.0;
    let mut ss_res = 0.0;
    let mean_y = sum_y / n;
    for (idx, d) in slice.iter().enumerate() {
        let x = idx as f64;
        let y = d.close;
        let y_pred = slope * x + intercept;
        ss_tot += (y - mean_y).powi(2);
        ss_res += (y - y_pred).powi(2);
    }
    let r2 = if ss_tot > 0.0 { 1.0 - ss_res / ss_tot } else { 0.0 };
    (slope, r2)
}
