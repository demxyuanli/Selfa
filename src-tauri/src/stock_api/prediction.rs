use super::types::{StockData, PredictionResult};
use super::utils::{parse_date, add_days, calculate_variance, determine_signal, polynomial_predict, calculate_autocorrelation, validate_data, calculate_r_squared, calculate_volatility};
use super::technical_indicators::{calculate_ema, calculate_rsi};

use super::prediction_arima;
use super::prediction_advanced;

pub fn predict_stock_price(
    data: &[StockData],
    method: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 20 {
        return Err("Insufficient data for prediction".to_string());
    }

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let dates: Vec<String> = data.iter().map(|d| d.date.clone()).collect();
    let last_date = dates.last().unwrap().clone();

    let predictions = match method {
        "linear" => predict_linear_regression(&closes, &last_date, period)?,
        "ma" => predict_moving_average(&closes, &last_date, period)?,
        "technical" => predict_technical_indicator(&closes, &last_date, period)?,
        "polynomial" => predict_polynomial(&closes, &last_date, period)?,
        "arima" => prediction_arima::predict_arima(&closes, &last_date, period)?,
        "exponential" => predict_exponential_smoothing(&closes, &last_date, period)?,
            "mean_reversion" => prediction_advanced::predict_mean_reversion(&closes, &last_date, period)?,
            "wma" => prediction_advanced::predict_weighted_ma(&closes, &last_date, period)?,
            "pattern" => prediction_advanced::predict_pattern_recognition(data, &last_date, period)?,
            "similarity" => prediction_advanced::predict_similarity_match(&closes, &last_date, period)?,
            "ensemble" => prediction_advanced::predict_ensemble_advanced(data, &last_date, period)?,
            "fibonacci" => prediction_advanced::predict_fibonacci_retracement(data, &last_date, period)?,
            "fibonacci_extension" => prediction_advanced::predict_fibonacci_extension(data, &last_date, period)?,
            "monte_carlo" => prediction_advanced::predict_monte_carlo(data, &last_date, period)?,
            "monte_carlo_advanced" => prediction_advanced::predict_monte_carlo_advanced(data, &last_date, period)?,
            "deos_gpt" => prediction_advanced::predict_deos_alpha_time_gpt(data, &last_date, period)?,
            "sspt" => prediction_advanced::predict_sspt_fine_tuned(data, &last_date, period)?,
            "space_explore" => prediction_advanced::predict_space_explore_ai(data, &last_date, period)?,
            "intraday_ma" => super::prediction_intraday::predict_intraday_ma(data, &last_date, period)?,
            "intraday_volatility" => super::prediction_intraday::predict_intraday_volatility(data, &last_date, period)?,
            "intraday_regime" => super::prediction_intraday::predict_intraday_regime(data, &last_date, period)?,
        _ => return Err(format!("Unknown prediction method: {}", method)),
    };

    Ok(predictions)
}

pub fn predict_linear_regression(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let n = closes.len();
    if n < 2 {
        return Err("Need at least 2 data points".to_string());
    }

    let validated_data = validate_data(closes);
    if validated_data.len() < 2 {
        return Err("Insufficient valid data points".to_string());
    }

    let recent_data = &validated_data[validated_data.len().saturating_sub(30)..];
    let n_recent = recent_data.len();

    if n_recent < 2 {
        return Err("Insufficient recent data points".to_string());
    }

    // Weighted Least Squares (WLS): give more weight to recent data
    // Weight: exp(-lambda * (n - i)), where lambda controls decay rate
    let lambda = 0.05;
    let weights: Vec<f64> = (0..n_recent)
        .map(|i| (-lambda * (n_recent - i) as f64).exp())
        .collect();
    let weight_sum: f64 = weights.iter().sum();

    // Calculate weighted sums for WLS
    let wx_sum: f64 = (0..n_recent).map(|i| i as f64 * weights[i]).sum();
    let wy_sum: f64 = (0..n_recent).map(|i| recent_data[i] * weights[i]).sum();
    let wxy_sum: f64 = (0..n_recent).map(|i| i as f64 * recent_data[i] * weights[i]).sum();
    let wx2_sum: f64 = (0..n_recent).map(|i| (i as f64).powi(2) * weights[i]).sum();

    let denominator = weight_sum * wx2_sum - wx_sum * wx_sum;
    if denominator.abs() < 1e-10 {
        return Err("Degenerate linear regression".to_string());
    }

    // WLS coefficients
    let slope = (weight_sum * wxy_sum - wx_sum * wy_sum) / denominator;
    let intercept = (wy_sum - slope * wx_sum) / weight_sum;

    // Calculate mean (weighted or unweighted for AR component)
    let mean = recent_data.iter().sum::<f64>() / n_recent as f64;
    let phi = calculate_autocorrelation(recent_data, 1);
    let last_price = recent_data[n_recent - 1];

    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;

    for i in 1..=period {
        let x = n_recent as f64 + i as f64;
        let linear_predicted = slope * x + intercept;
        let ar_component = phi * (last_price - mean);
        let predicted = linear_predicted + ar_component;
        
        let variance = calculate_variance(recent_data);
        let std_dev = variance.sqrt();
        
        let r_squared = if n_recent >= 3 {
            let fitted: Vec<f64> = (0..n_recent).map(|j| slope * (j as f64) + intercept).collect();
            calculate_r_squared(recent_data, &fitted)
        } else {
            0.5
        };
        
        let base_confidence = (r_squared * 100.0).min(90.0).max(30.0);
        let volatility_penalty = (std_dev / predicted * 100.0).min(40.0);
        let confidence = (base_confidence - volatility_penalty).max(30.0);

        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, last_price, slope),
            upper_bound: predicted + std_dev,
            lower_bound: predicted - std_dev,
            method: "linear".to_string(),
        });
    }

    Ok(results)
}

fn calculate_adaptive_ma(closes: &[f64], base_period: usize) -> Vec<f64> {
    if closes.len() < base_period {
        return vec![0.0; closes.len()];
    }
    
    let mut ama_values = Vec::new();
    let volatility_window = 10.min(base_period);
    
    for i in 0..closes.len() {
        if i < base_period - 1 {
            ama_values.push(0.0);
            continue;
        }
        
        let window_data = &closes[(i + 1).saturating_sub(base_period)..=i];
        let volatility = calculate_volatility(window_data, volatility_window);
        let avg_price = window_data.iter().sum::<f64>() / window_data.len() as f64;
        
        let volatility_factor = (volatility / avg_price.max(0.01)).min(0.5);
        let adaptive_period = (base_period as f64 * (1.0 - volatility_factor * 0.5)) as usize;
        let adaptive_period = adaptive_period.max(2).min(base_period * 2);
        
        let sma = window_data[window_data.len().saturating_sub(adaptive_period)..]
            .iter()
            .sum::<f64>() / adaptive_period.min(window_data.len()) as f64;
        
        ama_values.push(sma);
    }
    
    ama_values
}

pub fn predict_moving_average(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let validated_data = validate_data(closes);
    if validated_data.len() < 20 {
        return Err("Need at least 20 valid data points".to_string());
    }

    let ama5 = calculate_adaptive_ma(&validated_data, 5);
    let ama10 = calculate_adaptive_ma(&validated_data, 10);
    let ama20 = calculate_adaptive_ma(&validated_data, 20);

    let last_ama5 = ama5.iter().rev().find(|&&x| x > 0.0).copied().unwrap_or(validated_data[validated_data.len() - 1]);
    let last_ama10 = ama10.iter().rev().find(|&&x| x > 0.0).copied().unwrap_or(validated_data[validated_data.len() - 1]);
    let last_ama20 = ama20.iter().rev().find(|&&x| x > 0.0).copied().unwrap_or(validated_data[validated_data.len() - 1]);

        let ama5_slope = if ama5.len() >= 2 {
        let valid_ama5: Vec<f64> = ama5.iter().filter(|&&x| x > 0.0).copied().collect();
        if valid_ama5.len() >= 2 {
            valid_ama5[valid_ama5.len() - 1] - valid_ama5[valid_ama5.len() - 2]
        } else {
            0.0
        }
    } else {
        0.0
    };

    let variance = calculate_variance(&validated_data);
    let std_dev = variance.sqrt();
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let last_price = validated_data[validated_data.len() - 1];

    for i in 1..=period {
        let predicted = last_ama5 + ama5_slope * i as f64;
        
        let ma_alignment = if last_ama5 > last_ama10 && last_ama10 > last_ama20 {
            0.3
        } else if last_ama5 < last_ama10 && last_ama10 < last_ama20 {
            0.3
        } else {
            -0.2
        };
        
        let volatility_factor = (std_dev / last_price).min(0.3);
        let base_confidence = 65.0;
        let confidence = (base_confidence + ma_alignment * 15.0 - volatility_factor * 100.0).max(40.0).min(75.0);

        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, last_price, ama5_slope),
            upper_bound: predicted + std_dev * 0.5,
            lower_bound: predicted - std_dev * 0.5,
            method: "ma".to_string(),
        });
    }

    Ok(results)
}

pub fn predict_technical_indicator(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let validated_data = validate_data(closes);
    if validated_data.len() < 26 {
        return Err("Need at least 26 valid data points for technical indicators".to_string());
    }

    let rsi = calculate_rsi(&validated_data, 14);
    let ema12 = calculate_ema(&validated_data, 12);
    let ema26 = calculate_ema(&validated_data, 26);

    let last_rsi = rsi.last().copied().unwrap_or(50.0);
    let last_ema12 = ema12.last().copied().unwrap_or(validated_data[validated_data.len() - 1]);
    let last_ema26 = ema26.last().copied().unwrap_or(validated_data[validated_data.len() - 1]);

    let trend = if last_ema12 > last_ema26 { 1.0 } else { -1.0 };
    let rsi_factor = (last_rsi - 50.0) / 50.0;

    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let last_price = validated_data[validated_data.len() - 1];

    for i in 1..=period {
        let change_factor = trend * (1.0 + rsi_factor * 0.1) * (1.0 - i as f64 * 0.02);
        let predicted = last_price * (1.0 + change_factor * 0.01);

        let rsi_strength = if last_rsi < 30.0 || last_rsi > 70.0 {
            0.15
        } else if last_rsi < 40.0 || last_rsi > 60.0 {
            0.10
        } else {
            0.05
        };

        let trend_consistency = if (last_rsi < 30.0 && trend > 0.0) || (last_rsi > 70.0 && trend < 0.0) {
            0.15
        } else if (last_rsi < 40.0 && trend > 0.0) || (last_rsi > 60.0 && trend < 0.0) {
            0.10
        } else {
            0.0
        };

        let base_confidence = 55.0;
        let confidence = ((base_confidence + (rsi_strength + trend_consistency) * 100.0) as f64).max(45.0).min(80.0);

        let variance = calculate_variance(&validated_data);
        let std_dev = variance.sqrt();

        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, last_price, trend),
            upper_bound: predicted + std_dev * 0.6,
            lower_bound: predicted - std_dev * 0.6,
            method: "technical".to_string(),
        });
    }

    Ok(results)
}

fn select_polynomial_degree(data: &[f64], max_degree: usize) -> usize {
    if data.len() < 10 || max_degree < 1 {
        return 1;
    }
    
    let max_test_degree = max_degree.min(3).min((data.len() - 5) / 2);
    let mut best_degree = 1;
    let mut best_aic = f64::INFINITY;
    
    for degree in 1..=max_test_degree {
        let mut predictions = Vec::new();
        let actual = Vec::from(&data[data.len() - 5..]);
        
        for i in 0..5 {
            let x = (data.len() - 5 + i) as f64;
            let pred = polynomial_predict(&data[..data.len() - 5], x, degree);
            predictions.push(pred);
        }
        
        let mse = actual.iter()
            .zip(predictions.iter())
            .map(|(a, p)| (a - p).powi(2))
            .sum::<f64>() / actual.len() as f64;
        
        if mse > 0.0 {
            let k = (degree + 1) as f64;
            let n = actual.len() as f64;
            let aic = n * mse.ln() + 2.0 * k;
            
            if aic < best_aic {
                best_aic = aic;
                best_degree = degree;
            }
        }
    }
    
    best_degree
}

pub fn predict_polynomial(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let validated_data = validate_data(closes);
    let recent_data = &validated_data[validated_data.len().saturating_sub(30)..];
    let n = recent_data.len();
    if n < 3 {
        return Err("Need at least 3 data points for polynomial regression".to_string());
    }

    let degree = select_polynomial_degree(recent_data, 3);
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let last_price = recent_data[n - 1];

    for i in 1..=period {
        let x = n as f64 + i as f64;
        let predicted = polynomial_predict(recent_data, x, degree);
        let variance = calculate_variance(recent_data);
        let std_dev = variance.sqrt();
        
        let base_confidence = if degree <= 2 { 45.0 } else { 40.0 };
        let volatility_penalty = (std_dev / predicted.abs().max(0.01) * 100.0).min(30.0);
        let confidence = (base_confidence - volatility_penalty).max(35.0);

        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, last_price, 0.0),
            upper_bound: predicted + std_dev,
            lower_bound: predicted - std_dev,
            method: format!("polynomial({})", degree),
        });
    }

    Ok(results)
}

fn is_stationary(data: &[f64]) -> bool {
    if data.len() < 5 {
        return false;
    }
    
    let phi = calculate_autocorrelation(data, 1);
    phi.abs() < 0.8
}

fn make_stationary(data: &[f64]) -> Vec<f64> {
    let mut diff_data = Vec::new();
    for i in 1..data.len() {
        diff_data.push(data[i] - data[i - 1]);
    }
    diff_data
}

// Exponential Smoothing (Holt-Winters simplified)
pub fn predict_exponential_smoothing(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let validated_data = validate_data(closes);
    if validated_data.len() < 10 {
        return Err("Need at least 10 data points".to_string());
    }
    
    let recent_data = &validated_data[validated_data.len().saturating_sub(30)..];
    let is_stationary_data = is_stationary(recent_data);
    let working_data = if is_stationary_data {
        recent_data.to_vec()
    } else {
        make_stationary(recent_data)
    };
    
    if working_data.len() < 2 {
        return Err("Insufficient data after differencing".to_string());
    }
    
    let alpha = 0.3;
    let beta = 0.1;
    
    let mut level = working_data[0];
    let mut trend = if working_data.len() > 1 {
        working_data[1] - working_data[0]
    } else {
        0.0
    };
    
    for i in 1..working_data.len() {
        let prev_level = level;
        level = alpha * working_data[i] + (1.0 - alpha) * (level + trend);
        trend = beta * (level - prev_level) + (1.0 - beta) * trend;
    }
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let last_original_price = recent_data[recent_data.len() - 1];
    
    for i in 1..=period {
        let diff_predicted = level + trend * i as f64;
        let predicted = if is_stationary_data {
            diff_predicted
        } else {
            last_original_price + diff_predicted
        };
        
        let variance = calculate_variance(recent_data);
        let std_dev = variance.sqrt();
        
        let stationarity_boost = if is_stationary_data { 5.0 } else { 0.0 };
        let base_confidence = 45.0 + stationarity_boost;
        let volatility_penalty = (std_dev / predicted.abs().max(0.01) * 100.0).min(35.0);
        let confidence = (base_confidence - volatility_penalty).max(40.0);
        
        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, last_original_price, trend),
            upper_bound: predicted + std_dev * 0.8,
            lower_bound: predicted - std_dev * 0.8,
            method: "exponential".to_string(),
        });
    }
    
    Ok(results)
}
