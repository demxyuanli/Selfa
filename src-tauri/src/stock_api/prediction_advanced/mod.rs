use super::types::{StockData, PredictionResult};
use super::utils::{parse_date, add_days, calculate_variance, determine_signal, calculate_trend_slope, detect_swing_high, detect_swing_low, detect_swing_high_with_volume, detect_swing_low_with_volume, validate_data};

use super::prediction::{predict_linear_regression, predict_moving_average, predict_technical_indicator};

pub mod support_resistance;
pub mod hurst_exponent;
pub mod monte_carlo;
pub mod ensemble;
pub mod deos_alpha_time_gpt;
pub mod sspt_fine_tune;
pub mod space_explore_ai;

#[allow(unused_imports)]
pub use support_resistance::*;
#[allow(unused_imports)]
pub use hurst_exponent::*;
#[allow(unused_imports)]
pub use monte_carlo::*;
#[allow(unused_imports)]
pub use ensemble::*;
#[allow(unused_imports)]
pub use deos_alpha_time_gpt::*;
#[allow(unused_imports)]
pub use sspt_fine_tune::*;
#[allow(unused_imports)]
pub use space_explore_ai::*;

pub fn predict_mean_reversion(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 20 {
        return Err("Need at least 20 data points".to_string());
    }
    
    let recent_data = &closes[closes.len().saturating_sub(30)..];
    let mean = recent_data.iter().sum::<f64>() / recent_data.len() as f64;
    let last_price = recent_data[recent_data.len() - 1];
    let deviation = last_price - mean;
    
    let half_life = 5.0;
    let reversion_speed = 1.0 - (0.5_f64).powf(1.0 / half_life);
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    
    for i in 1..=period {
        let remaining_deviation = deviation * (1.0 - reversion_speed).powi(i as i32);
        let predicted = mean + remaining_deviation;
        
        let variance = calculate_variance(recent_data);
        let std_dev = variance.sqrt();
        let confidence = if deviation.abs() / mean > 0.05 {
            60.0
        } else {
            45.0
        };
        
        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: if deviation > 0.0 { "sell" } else { "buy" }.to_string(),
            upper_bound: predicted + std_dev * 0.7,
            lower_bound: predicted - std_dev * 0.7,
            method: "mean_reversion".to_string(),
        });
    }
    
    Ok(results)
}

pub fn predict_weighted_ma(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 10 {
        return Err("Need at least 10 data points".to_string());
    }
    
    let recent_data = &closes[closes.len().saturating_sub(20)..];
    let n = recent_data.len();
    
    let mut wma = 0.0;
    let mut weight_sum = 0.0;
    for i in 0..n {
        let weight = (i + 1) as f64;
        wma += recent_data[i] * weight;
        weight_sum += weight;
    }
    wma /= weight_sum;
    
    let wma_prev = {
        let mut prev_wma = 0.0;
        let mut prev_weight_sum = 0.0;
        for i in 0..n.saturating_sub(1) {
            let weight = (i + 1) as f64;
            prev_wma += recent_data[i] * weight;
            prev_weight_sum += weight;
        }
        if prev_weight_sum > 0.0 { prev_wma / prev_weight_sum } else { wma }
    };
    
    let trend = wma - wma_prev;
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    
    for i in 1..=period {
        let predicted = wma + trend * i as f64;
        let variance = calculate_variance(recent_data);
        let std_dev = variance.sqrt();
        let confidence = (100.0 - (std_dev / predicted * 100.0).min(40.0)).max(50.0);
        
        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, closes[closes.len() - 1], trend),
            upper_bound: predicted + std_dev * 0.6,
            lower_bound: predicted - std_dev * 0.6,
            method: "wma".to_string(),
        });
    }
    
    Ok(results)
}

pub fn predict_pattern_recognition(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 10 {
        return Err("Need at least 10 data points".to_string());
    }
    
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let volumes: Vec<f64> = data.iter().map(|d| d.volume as f64).collect();
    let recent_closes = &closes[closes.len().saturating_sub(10)..];
    let recent_volumes = &volumes[volumes.len().saturating_sub(10)..];
    
    let resistance = recent_closes.iter().fold(0.0_f64, |a, &b| a.max(b));
    let support = recent_closes.iter().fold(f64::INFINITY, |a, &b| a.min(b));
    let last_price = recent_closes[recent_closes.len() - 1];
    let avg_volume = recent_volumes.iter().sum::<f64>() / recent_volumes.len() as f64;
    let last_volume = recent_volumes[recent_volumes.len() - 1];
    
    let is_breakthrough = last_price > resistance * 0.98 && last_volume > avg_volume * 1.2;
    let is_support_bounce = last_price < support * 1.02 && last_price > support * 0.98;
    
    let trend = if is_breakthrough {
        1.0
    } else if is_support_bounce {
        0.5
    } else if last_price < (resistance + support) / 2.0 {
        -0.5
    } else {
        0.0
    };
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let price_range = resistance - support;
    
    for i in 1..=period {
        let change_factor = trend * (1.0 - i as f64 * 0.05);
        let predicted = last_price + price_range * change_factor * 0.1;
        
        let confidence = if is_breakthrough || is_support_bounce {
            65.0
        } else {
            50.0
        };
        
        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: if trend > 0.3 { "buy" } else if trend < -0.3 { "sell" } else { "hold" }.to_string(),
            upper_bound: predicted + price_range * 0.1,
            lower_bound: predicted - price_range * 0.1,
            method: "pattern".to_string(),
        });
    }
    
    Ok(results)
}

pub fn predict_similarity_match(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 20 {
        return Err("Need at least 20 data points".to_string());
    }
    
    let window_size = 10.min(closes.len() / 2);
    let recent_pattern = &closes[closes.len() - window_size..];
    
    let mut best_match_idx = 0;
    let mut best_similarity = f64::INFINITY;
    
    for i in 0..(closes.len() - window_size * 2) {
        let historical_pattern = &closes[i..i + window_size];
        
        let distance: f64 = recent_pattern.iter()
            .zip(historical_pattern.iter())
            .map(|(a, b)| (a - b).powi(2))
            .sum();
        
        if distance < best_similarity {
            best_similarity = distance;
            best_match_idx = i;
        }
    }
    
    let match_start = best_match_idx + window_size;
    let match_end = (match_start + period).min(closes.len());
    let matched_pattern = &closes[match_start..match_end];
    
    let recent_mean = recent_pattern.iter().sum::<f64>() / recent_pattern.len() as f64;
    let matched_mean = matched_pattern.iter().sum::<f64>() / matched_pattern.len() as f64;
    let scale_factor = recent_mean / matched_mean.max(0.01);
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    
    for (i, &matched_price) in matched_pattern.iter().enumerate().take(period) {
        let predicted = matched_price * scale_factor;
        let variance = calculate_variance(recent_pattern);
        let std_dev = variance.sqrt();
        let confidence = (100.0 - (best_similarity.sqrt() / recent_mean * 100.0).min(50.0)).max(45.0);
        
        let date = add_days(&base_date, (i + 1) as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, closes[closes.len() - 1], 0.0),
            upper_bound: predicted + std_dev,
            lower_bound: predicted - std_dev,
            method: "similarity".to_string(),
        });
    }
    
    if results.len() < period {
        let last_pred = results.last().map(|r| r.predicted_price).unwrap_or(closes[closes.len() - 1]);
        for i in results.len()..period {
            let date = add_days(&base_date, (i + 1) as i32)?;
            results.push(PredictionResult {
                date,
                predicted_price: last_pred,
                confidence: 40.0,
                signal: "hold".to_string(),
                upper_bound: last_pred * 1.02,
                lower_bound: last_pred * 0.98,
                method: "similarity".to_string(),
            });
        }
    }
    
    Ok(results)
}

pub fn calculate_method_mse(closes: &[f64], method: &str, lookback: usize) -> f64 {
    if closes.len() < lookback + 5 {
        return 1.0;
    }
    
    let test_end = closes.len() - 5;
    let test_start = test_end.saturating_sub(lookback);
    let test_data = &closes[test_start..test_end];
    
    if test_data.len() < 10 {
        return 1.0;
    }
    
    let mut predictions = Vec::new();
    let mut actuals = Vec::new();
    
    for i in 5..test_data.len() {
        let historical = &closes[test_start..test_start + i];
        let test_date = &format!("2000-01-01");
        
        let pred_result = match method {
            "linear" => predict_linear_regression(historical, test_date, 5),
            "ma" => predict_moving_average(historical, test_date, 5),
            "technical" => predict_technical_indicator(historical, test_date, 5),
            "wma" => predict_weighted_ma(historical, test_date, 5),
            _ => continue,
        };
        
        if let Ok(preds) = pred_result {
            if let Some(first_pred) = preds.first() {
                predictions.push(first_pred.predicted_price);
                if test_start + i < closes.len() {
                    actuals.push(closes[test_start + i]);
                }
            }
        }
    }
    
    if predictions.is_empty() || actuals.len() != predictions.len() {
        return 1.0;
    }
    
    let mse: f64 = predictions.iter()
        .zip(actuals.iter())
        .map(|(p, a)| (p - a).powi(2))
        .sum::<f64>() / predictions.len() as f64;
    
    mse.max(0.001)
}

pub fn predict_ensemble(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let validated_closes = validate_data(&closes);
    
    if validated_closes.len() < 30 {
        return Err("Need at least 30 data points for ensemble prediction".to_string());
    }
    
    let methods = vec!["linear", "ma", "technical", "wma"];
    let mut all_predictions: Vec<Vec<PredictionResult>> = Vec::new();
    let mut method_weights: Vec<f64> = Vec::new();
    
    for method in &methods {
        if let Ok(preds) = match *method {
            "linear" => predict_linear_regression(&validated_closes, start_date, period),
            "ma" => predict_moving_average(&validated_closes, start_date, period),
            "technical" => predict_technical_indicator(&validated_closes, start_date, period),
            "wma" => predict_weighted_ma(&validated_closes, start_date, period),
            _ => continue,
        } {
            if !preds.is_empty() {
                let mse = calculate_method_mse(&validated_closes, method, 20);
                let weight = 1.0 / mse;
                all_predictions.push(preds);
                method_weights.push(weight);
            }
        }
    }
    
    if all_predictions.is_empty() {
        return Err("Failed to generate ensemble predictions".to_string());
    }
    
    let total_weight: f64 = method_weights.iter().sum();
    if total_weight < 1e-10 {
        return Err("All methods have zero weight".to_string());
    }
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let last_price = validated_closes[validated_closes.len() - 1];
    
    for i in 0..period {
        let mut weighted_sum = 0.0;
        let mut weight_sum = 0.0;
        let mut max_deviation = 0.0;
        let mut prices = Vec::new();
        let mut valid_predictions = Vec::new();
        let mut valid_weights = Vec::new();
        
        for (pred_idx, preds) in all_predictions.iter().enumerate() {
            if i < preds.len() {
                let weight = method_weights[pred_idx];
                let price = preds[i].predicted_price;
                prices.push(price);
                valid_predictions.push(price);
                valid_weights.push(weight);
            }
        }
        
        if valid_predictions.len() > 2 {
            let mean_price = valid_predictions.iter().sum::<f64>() / valid_predictions.len() as f64;
            let variance: f64 = valid_predictions.iter()
                .map(|p| (p - mean_price).powi(2))
                .sum::<f64>() / valid_predictions.len() as f64;
            let std_dev_price = variance.sqrt();
            
            let threshold = std_dev_price * 2.5;
            for (pred_idx, price) in valid_predictions.iter().enumerate() {
                let deviation = (price - mean_price).abs();
                if deviation <= threshold {
                    let weight = valid_weights[pred_idx];
                    weighted_sum += price * weight;
                    weight_sum += weight;
                }
            }
            
            max_deviation = prices.iter()
                .map(|p| (p - mean_price).abs())
                .fold(0.0, f64::max);
        } else {
            for (pred_idx, price) in valid_predictions.iter().enumerate() {
                let weight = valid_weights[pred_idx];
                weighted_sum += price * weight;
                weight_sum += weight;
            }
            if !prices.is_empty() {
                let mean_price = prices.iter().sum::<f64>() / prices.len() as f64;
                max_deviation = prices.iter()
                    .map(|p| (p - mean_price).abs())
                    .fold(0.0, f64::max);
            }
        }
        
        if weight_sum > 0.0 {
            let predicted = weighted_sum / weight_sum;
            
            let variance = calculate_variance(&validated_closes);
            let std_dev = variance.sqrt();
            
            let consistency_factor = if max_deviation < std_dev * 0.5 {
                0.1
            } else if max_deviation < std_dev {
                0.0
            } else {
                -0.1
            };
            
            let base_confidence = 70.0;
            let confidence = ((base_confidence + consistency_factor * 10.0) as f64).max(50.0).min(80.0);
            
            let date = add_days(&base_date, (i + 1) as i32)?;
            results.push(PredictionResult {
                date,
                predicted_price: predicted,
                confidence,
                signal: determine_signal(predicted, last_price, 0.0),
                upper_bound: predicted + std_dev * 0.7,
                lower_bound: predicted - std_dev * 0.7,
                method: "ensemble".to_string(),
            });
        }
    }
    
    Ok(results)
}

fn find_significant_highs_lows(data: &[StockData], lookback: usize) -> (f64, f64, usize, usize) {
    let n = data.len();
    let highs: Vec<f64> = data.iter().map(|d| d.high).collect();
    let lows: Vec<f64> = data.iter().map(|d| d.low).collect();
    let volumes: Vec<i64> = data.iter().map(|d| d.volume).collect();
    
    let window = (lookback / 3).max(3).min(10);
    
    if let (Some((high_idx, high_val)), Some((low_idx, low_val))) = 
        (detect_swing_high_with_volume(&highs, &volumes, window), 
         detect_swing_low_with_volume(&lows, &volumes, window)) {
        return (high_val, low_val, high_idx, low_idx);
    }
    
    if let (Some((high_idx, high_val)), Some((low_idx, low_val))) = 
        (detect_swing_high(&highs, window), detect_swing_low(&lows, window)) {
        return (high_val, low_val, high_idx, low_idx);
    }
    
    if n < lookback * 2 {
        let high_idx = data.iter().enumerate().max_by(|a, b| a.1.high.partial_cmp(&b.1.high).unwrap()).map(|(i, _)| i).unwrap_or(0);
        let low_idx = data.iter().enumerate().min_by(|a, b| a.1.low.partial_cmp(&b.1.low).unwrap()).map(|(i, _)| i).unwrap_or(0);
        return (data[high_idx].high, data[low_idx].low, high_idx, low_idx);
    }
    
    let recent_data = &data[n.saturating_sub(lookback * 2)..];
    let recent_high_idx = recent_data.iter().enumerate().max_by(|a, b| a.1.high.partial_cmp(&b.1.high).unwrap()).map(|(i, _)| i).unwrap_or(0);
    let recent_low_idx = recent_data.iter().enumerate().min_by(|a, b| a.1.low.partial_cmp(&b.1.low).unwrap()).map(|(i, _)| i).unwrap_or(0);
    
    let high_idx = n - lookback * 2 + recent_high_idx;
    let low_idx = n - lookback * 2 + recent_low_idx;
    
    (data[high_idx].high, data[low_idx].low, high_idx, low_idx)
}

pub fn predict_fibonacci_retracement(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 30 {
        return Err("Need at least 30 data points for Fibonacci retracement".to_string());
    }
    
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = closes[closes.len() - 1];
    
    let lookback = 30.min(data.len() / 2);
    let (high_price, low_price, high_idx, low_idx) = find_significant_highs_lows(data, lookback);
    
    let is_uptrend = high_idx > low_idx;
    let range = if is_uptrend {
        high_price - low_price
    } else {
        low_price - high_price
    };
    
    let avg_price = (high_price + low_price) / 2.0;
    let range_ratio = if avg_price > 0.0 { range / avg_price } else { 0.0 };
    
    if range_ratio < 0.001 {
        let variance = calculate_variance(&closes);
        let std_dev = variance.sqrt();
        let trend_slope = calculate_trend_slope(&closes);
        let mut results = Vec::new();
        let base_date = parse_date(start_date)?;
        
        for i in 1..=period {
            let predicted = last_price + trend_slope * i as f64;
            let date = add_days(&base_date, i as i32)?;
            results.push(PredictionResult {
                date,
                predicted_price: predicted,
                confidence: 45.0,
                signal: determine_signal(predicted, last_price, trend_slope),
                upper_bound: predicted + std_dev * 0.5,
                lower_bound: predicted - std_dev * 0.5,
                method: "fibonacci".to_string(),
            });
        }
        return Ok(results);
    }
    
    let fibonacci_ratios = vec![0.236, 0.382, 0.5, 0.618, 0.786];
    let base_price = if is_uptrend { low_price } else { high_price };
    let target_direction = if is_uptrend { -1.0 } else { 1.0 };
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let variance = calculate_variance(&closes);
    let std_dev = variance.sqrt();
    
    for i in 1..=period {
        let days_ratio = i as f64 / period as f64;
        let closest_ratio_idx = fibonacci_ratios.iter()
            .enumerate()
            .min_by(|a, b| {
                let dist_a = (days_ratio - *a.1).abs();
                let dist_b = (days_ratio - *b.1).abs();
                dist_a.partial_cmp(&dist_b).unwrap()
            })
            .map(|(idx, _)| idx)
            .unwrap_or(2);
        
        let target_ratio = fibonacci_ratios[closest_ratio_idx];
        let predicted = base_price + target_direction * range * target_ratio;
        
        let confidence = match target_ratio {
            0.618 => 75.0,
            0.5 => 70.0,
            0.382 => 65.0,
            0.236 => 60.0,
            0.786 => 65.0,
            _ => 60.0,
        };
        
        let trend_signal = if is_uptrend {
            if predicted < last_price * 0.98 { "buy" } else { "hold" }
        } else {
            if predicted > last_price * 1.02 { "sell" } else { "hold" }
        };
        
        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: trend_signal.to_string(),
            upper_bound: predicted + std_dev * 0.5,
            lower_bound: predicted - std_dev * 0.5,
            method: "fibonacci".to_string(),
        });
    }
    
    Ok(results)
}

pub fn predict_fibonacci_extension(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 50 {
        return Err("Need at least 50 data points for Fibonacci extension".to_string());
    }
    
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = closes[closes.len() - 1];
    
    let lookback = 40.min(data.len() / 2);
    let (high_price, low_price, high_idx, low_idx) = find_significant_highs_lows(data, lookback);
    
    let is_uptrend = high_idx > low_idx;
    let a_price = if is_uptrend { low_price } else { high_price };
    let b_price = if is_uptrend { high_price } else { low_price };
    let c_price = last_price;
    
    let ab_range = (b_price - a_price).abs();
    let avg_price = (a_price + b_price) / 2.0;
    let range_ratio = if avg_price > 0.0 { ab_range / avg_price } else { 0.0 };
    
    if range_ratio < 0.001 {
        let variance = calculate_variance(&closes);
        let std_dev = variance.sqrt();
        let trend_slope = calculate_trend_slope(&closes);
        let mut results = Vec::new();
        let base_date = parse_date(start_date)?;
        
        for i in 1..=period {
            let predicted = last_price + trend_slope * i as f64;
            let date = add_days(&base_date, i as i32)?;
            results.push(PredictionResult {
                date,
                predicted_price: predicted,
                confidence: 45.0,
                signal: determine_signal(predicted, last_price, trend_slope),
                upper_bound: predicted + std_dev * 0.8,
                lower_bound: predicted - std_dev * 0.8,
                method: "fibonacci_extension".to_string(),
            });
        }
        return Ok(results);
    }
    
    let fibonacci_extensions = vec![1.0, 1.618, 2.618, 4.236];
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let variance = calculate_variance(&closes);
    let std_dev = variance.sqrt();
    
    for i in 1..=period {
        let days_progress = i as f64 / period as f64;
        let extension_idx = (days_progress * (fibonacci_extensions.len() - 1) as f64).floor() as usize;
        let extension_idx = extension_idx.min(fibonacci_extensions.len() - 1);
        let extension_ratio = fibonacci_extensions[extension_idx];
        
        let predicted = if is_uptrend {
            c_price + ab_range * extension_ratio
        } else {
            c_price - ab_range * extension_ratio
        };
        
        let confidence = match extension_ratio {
            1.0 => 70.0,
            1.618 => 75.0,
            2.618 => 65.0,
            4.236 => 55.0,
            _ => 60.0,
        };
        
        let trend_signal = if is_uptrend {
            if predicted > last_price * 1.05 { "buy" } else { "hold" }
        } else {
            if predicted < last_price * 0.95 { "sell" } else { "hold" }
        };
        
        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: trend_signal.to_string(),
            upper_bound: predicted + std_dev * 0.8,
            lower_bound: predicted - std_dev * 0.8,
            method: "fibonacci_extension".to_string(),
        });
    }
    
    Ok(results)
}