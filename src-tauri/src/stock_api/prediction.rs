use super::types::{StockData, PredictionResult};
use super::utils::{parse_date, add_days, calculate_variance, determine_signal, polynomial_predict, calculate_trend_slope, calculate_autocorrelation, validate_data, calculate_r_squared, calculate_volatility, detect_swing_high, detect_swing_low, detect_swing_high_with_volume, detect_swing_low_with_volume};
use super::technical_indicators::{calculate_ema, calculate_rsi};

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
        "arima" => predict_arima(&closes, &last_date, period)?,
        "exponential" => predict_exponential_smoothing(&closes, &last_date, period)?,
        "mean_reversion" => predict_mean_reversion(&closes, &last_date, period)?,
        "wma" => predict_weighted_ma(&closes, &last_date, period)?,
        "pattern" => predict_pattern_recognition(data, &last_date, period)?,
        "similarity" => predict_similarity_match(&closes, &last_date, period)?,
        "ensemble" => predict_ensemble(data, &last_date, period)?,
        "fibonacci" => predict_fibonacci_retracement(data, &last_date, period)?,
        "fibonacci_extension" => predict_fibonacci_extension(data, &last_date, period)?,
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

// ARIMA (AutoRegressive Integrated Moving Average)
fn predict_arima(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 30 {
        return Err("Need at least 30 data points for ARIMA".to_string());
    }

    let recent_data = &closes[closes.len().saturating_sub(50)..];
    let n = recent_data.len();

    // Step 1: Determine differencing order (d) - check stationarity
    let (d, stationary_data) = determine_differencing_order(recent_data)?;

    if stationary_data.len() < 20 {
        return Err("Insufficient stationary data for ARIMA modeling".to_string());
    }

    // Step 2: Fit ARIMA model and select optimal p,q using AIC
    let (p, q, ar_coeffs, ma_coeffs, residual_variance) =
        fit_arima_model(&stationary_data)?;

    // Step 3: Generate predictions
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let last_original_price = recent_data[n - 1];

    // For predictions, we need to work with the differenced series
    let mut prediction_history = stationary_data.clone();

    for i in 1..=period {
        // Generate next prediction using fitted ARMA(p,q) model
        let next_diff = predict_next_value(&prediction_history, &ar_coeffs, &ma_coeffs, residual_variance);
        prediction_history.push(next_diff);

        // Convert back to original scale by reverse differencing
        let mut predicted_price = last_original_price;
        for j in 0..i {
            predicted_price += prediction_history[stationary_data.len() + j];
        }

        // Calculate confidence interval
        let std_dev = (residual_variance * (i as f64)).sqrt();
        let confidence = (85.0 - (std_dev / predicted_price.abs().max(0.01) * 100.0).min(35.0)).max(50.0);

        let upper_bound = predicted_price + 1.96 * std_dev;
        let lower_bound = predicted_price - 1.96 * std_dev;

        // Determine signal based on trend and prediction
        let trend_slope = calculate_trend_slope(&stationary_data);
        let signal = determine_signal(predicted_price, last_original_price, trend_slope);

        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price,
            confidence,
            signal,
            upper_bound,
            lower_bound,
            method: format!("ARIMA({},{},{})", p, d, q),
        });
    }

    Ok(results)
}

// Determine optimal differencing order using Augmented Dickey-Fuller test approximation
fn determine_differencing_order(data: &[f64]) -> Result<(usize, Vec<f64>), String> {
    if data.len() < 10 {
        return Ok((0, data.to_vec()));
    }

    // Test for stationarity (simplified ADF test)
    let is_stationary = test_stationarity(data);

    if is_stationary {
        return Ok((0, data.to_vec()));
    }

    // Apply first differencing
    let mut diff_data = Vec::new();
    for i in 1..data.len() {
        diff_data.push(data[i] - data[i - 1]);
    }

    // Test again
    let is_stationary_after_diff = test_stationarity(&diff_data);

    if is_stationary_after_diff {
        Ok((1, diff_data))
    } else {
        // Apply second differencing if needed
        let mut diff2_data = Vec::new();
        for i in 1..diff_data.len() {
            diff2_data.push(diff_data[i] - diff_data[i - 1]);
        }
        Ok((2, diff2_data))
    }
}

// Simplified stationarity test (approximation of ADF test)
fn test_stationarity(data: &[f64]) -> bool {
    if data.len() < 5 {
        return false;
    }

    // Calculate autocorrelation at lag 1
    let mean = data.iter().sum::<f64>() / data.len() as f64;
    let mut numerator = 0.0;
    let mut denominator = 0.0;

    for i in 1..data.len() {
        let diff = data[i] - mean;
        let lag_diff = data[i - 1] - mean;
        numerator += diff * lag_diff;
        denominator += lag_diff * lag_diff;
    }

    if denominator == 0.0 {
        return false;
    }

    let rho = numerator / denominator;

    // If autocorrelation is high (> 0.8), likely non-stationary
    rho.abs() < 0.8
}

// Fit ARIMA model and select optimal p,q using AIC
fn fit_arima_model(data: &[f64]) -> Result<(usize, usize, Vec<f64>, Vec<f64>, f64), String> {
    if data.len() < 10 {
        return Err("Insufficient data for model fitting".to_string());
    }

    let mut best_aic = f64::INFINITY;
    let mut best_p = 1;
    let mut best_q = 1;
    let mut best_ar_coeffs = Vec::new();
    let mut best_ma_coeffs = Vec::new();
    let mut best_residual_variance = 0.0;

    // Try different combinations of p and q (keep it simple: p,q <= 3)
    for p in 0..=3 {
        for q in 0..=3 {
            if p == 0 && q == 0 {
                continue; // Skip ARMA(0,0)
            }

            match fit_arma_model(data, p, q) {
                Ok((ar_coeffs, ma_coeffs, residual_variance)) => {
                    // Calculate AIC
                    let k = (p + q) as f64; // number of parameters
                    let n = data.len() as f64;
                    let aic = n * residual_variance.ln() + 2.0 * k;

                    if aic < best_aic {
                        best_aic = aic;
                        best_p = p;
                        best_q = q;
                        best_ar_coeffs = ar_coeffs;
                        best_ma_coeffs = ma_coeffs;
                        best_residual_variance = residual_variance;
                    }
                }
                Err(_) => continue,
            }
        }
    }

    Ok((best_p, best_q, best_ar_coeffs, best_ma_coeffs, best_residual_variance))
}

// Fit ARMA(p,q) model using simplified method
fn fit_arma_model(data: &[f64], p: usize, q: usize) -> Result<(Vec<f64>, Vec<f64>, f64), String> {
    if data.len() < p.max(q) + 5 {
        return Err("Insufficient data for ARMA fitting".to_string());
    }

    // Use Yule-Walker equations for AR coefficients
    let ar_coeffs = if p > 0 {
        estimate_ar_coefficients(data, p)?
    } else {
        Vec::new()
    };

    // Estimate MA coefficients (simplified approach)
    let ma_coeffs = if q > 0 {
        estimate_ma_coefficients(data, q)?
    } else {
        Vec::new()
    };

    // Calculate residual variance
    let residual_variance = calculate_residual_variance(data, &ar_coeffs, &ma_coeffs);

    Ok((ar_coeffs, ma_coeffs, residual_variance))
}

// Estimate AR coefficients using Yule-Walker method
fn estimate_ar_coefficients(data: &[f64], p: usize) -> Result<Vec<f64>, String> {
    if data.len() < p + 1 {
        return Err("Insufficient data for AR coefficient estimation".to_string());
    }

    // Calculate autocorrelations
    let mut autocorr = vec![0.0; p + 1];
    let mean = data.iter().sum::<f64>() / data.len() as f64;

    for lag in 0..=p {
        let mut sum = 0.0;
        let mut count = 0;

        for i in lag..data.len() {
            sum += (data[i] - mean) * (data[i - lag] - mean);
            count += 1;
        }

        autocorr[lag] = if count > 0 { sum / count as f64 } else { 0.0 };
    }

    // Variance of the series
    let variance = autocorr[0];

    if variance <= 0.0 {
        return Ok(vec![0.0; p]);
    }

    // Solve Yule-Walker equations (simplified for p <= 3)
    let mut coeffs = vec![0.0; p];

    match p {
        1 => {
            coeffs[0] = autocorr[1] / variance;
        }
        2 => {
            let det = variance * variance - autocorr[1] * autocorr[1];
            if det != 0.0 {
                coeffs[0] = (variance * autocorr[1] - autocorr[1] * autocorr[2]) / det;
                coeffs[1] = (autocorr[1] * autocorr[1] - variance * autocorr[2]) / det;
            }
        }
        3 => {
            // Simplified solution for AR(3)
            coeffs[0] = autocorr[1] / variance;
            coeffs[1] = (autocorr[2] - coeffs[0] * autocorr[1]) / variance;
            coeffs[2] = (autocorr[3] - coeffs[0] * autocorr[2] - coeffs[1] * autocorr[1]) / variance;
        }
        _ => return Err("AR order too high for current implementation".to_string()),
    }

    Ok(coeffs)
}

// Estimate MA coefficients (simplified)
fn estimate_ma_coefficients(_data: &[f64], q: usize) -> Result<Vec<f64>, String> {
    // Simplified MA estimation - use small positive values
    let mut coeffs = Vec::new();
    for i in 0..q {
        coeffs.push(0.1 + (i as f64) * 0.1); // 0.1, 0.2, 0.3, ...
    }
    Ok(coeffs)
}

// Calculate residual variance
fn calculate_residual_variance(data: &[f64], ar_coeffs: &[f64], ma_coeffs: &[f64]) -> f64 {
    if data.len() < ar_coeffs.len().max(ma_coeffs.len()) + 1 {
        return calculate_variance(data);
    }

    let mut residuals = Vec::new();
    let p = ar_coeffs.len();
    let q = ma_coeffs.len();

    for i in (p.max(q))..data.len() {
        let mut predicted = 0.0;

        // AR part
        for j in 0..p {
            if i > j {
                predicted += ar_coeffs[j] * data[i - 1 - j];
            }
        }

        // MA part (simplified - would need error terms in full implementation)
        for j in 0..q {
            if i > j {
                predicted += ma_coeffs[j] * (data[i - 1 - j] - predicted) * 0.1;
            }
        }

        residuals.push(data[i] - predicted);
    }

    if residuals.is_empty() {
        calculate_variance(data)
    } else {
        calculate_variance(&residuals)
    }
}

// Predict next value using fitted ARMA model
fn predict_next_value(history: &[f64], ar_coeffs: &[f64], ma_coeffs: &[f64], residual_variance: f64) -> f64 {
    let n = history.len();
    let p = ar_coeffs.len();
    let q = ma_coeffs.len();

    let mut prediction = 0.0;

    // AR part
    for i in 0..p {
        if n > i {
            prediction += ar_coeffs[i] * history[n - 1 - i];
        }
    }

    // MA part (simplified)
    for i in 0..q {
        if n > i {
            prediction += ma_coeffs[i] * 0.1; // Simplified MA contribution
        }
    }

    // Add small random component based on residual variance
    prediction += (residual_variance.sqrt() * 0.1).max(0.01);

    prediction
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

// Calculate trend slope for signal determination
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

// Mean Reversion
fn predict_mean_reversion(
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
    
    // Mean reversion speed (half-life)
    let half_life = 5.0;
    let reversion_speed = 1.0 - (0.5_f64).powf(1.0 / half_life);
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    
    for i in 1..=period {
        // Revert towards mean
        let remaining_deviation = deviation * (1.0 - reversion_speed).powi(i as i32);
        let predicted = mean + remaining_deviation;
        
        let variance = calculate_variance(recent_data);
        let std_dev = variance.sqrt();
        let confidence = if deviation.abs() / mean > 0.05 {
            60.0 // Higher confidence when far from mean
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

// Weighted Moving Average
fn predict_weighted_ma(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 10 {
        return Err("Need at least 10 data points".to_string());
    }
    
    let recent_data = &closes[closes.len().saturating_sub(20)..];
    let n = recent_data.len();
    
    // Calculate WMA with linear weights (more recent = higher weight)
    let mut wma = 0.0;
    let mut weight_sum = 0.0;
    for i in 0..n {
        let weight = (i + 1) as f64;
        wma += recent_data[i] * weight;
        weight_sum += weight;
    }
    wma /= weight_sum;
    
    // Calculate trend from WMA
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

// Pattern Recognition (rule-based)
fn predict_pattern_recognition(
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
    
    // Pattern: Breakthrough (price breaks resistance with volume)
    let resistance = recent_closes.iter().fold(0.0_f64, |a, &b| a.max(b));
    let support = recent_closes.iter().fold(f64::INFINITY, |a, &b| a.min(b));
    let last_price = recent_closes[recent_closes.len() - 1];
    let avg_volume = recent_volumes.iter().sum::<f64>() / recent_volumes.len() as f64;
    let last_volume = recent_volumes[recent_volumes.len() - 1];
    
    // Detect patterns
    let is_breakthrough = last_price > resistance * 0.98 && last_volume > avg_volume * 1.2;
    let is_support_bounce = last_price < support * 1.02 && last_price > support * 0.98;
    
    let trend = if is_breakthrough {
        1.0 // Bullish
    } else if is_support_bounce {
        0.5 // Neutral-bullish
    } else if last_price < (resistance + support) / 2.0 {
        -0.5 // Bearish
    } else {
        0.0 // Neutral
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

// Similarity Matching
fn predict_similarity_match(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 20 {
        return Err("Need at least 20 data points".to_string());
    }
    
    let window_size = 10.min(closes.len() / 2);
    let recent_pattern = &closes[closes.len() - window_size..];
    
    // Find similar historical patterns
    let mut best_match_idx = 0;
    let mut best_similarity = f64::INFINITY;
    
    for i in 0..(closes.len() - window_size * 2) {
        let historical_pattern = &closes[i..i + window_size];
        
        // Calculate Euclidean distance (similarity)
        let distance: f64 = recent_pattern.iter()
            .zip(historical_pattern.iter())
            .map(|(a, b)| (a - b).powi(2))
            .sum();
        
        if distance < best_similarity {
            best_similarity = distance;
            best_match_idx = i;
        }
    }
    
    // Use the pattern after the best match
    let match_start = best_match_idx + window_size;
    let match_end = (match_start + period).min(closes.len());
    let matched_pattern = &closes[match_start..match_end];
    
    // Normalize and project
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
    
    // Fill remaining if needed
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

fn calculate_method_mse(closes: &[f64], method: &str, lookback: usize) -> f64 {
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

// Ensemble Method (combine multiple methods)
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
        
        // Collect all predictions for this period
        for (pred_idx, preds) in all_predictions.iter().enumerate() {
            if i < preds.len() {
                let weight = method_weights[pred_idx];
                let price = preds[i].predicted_price;
                prices.push(price);
                valid_predictions.push(price);
                valid_weights.push(weight);
            }
        }
        
        // Outlier detection: remove predictions > 2.5 std_dev from mean
        if valid_predictions.len() > 2 {
            let mean_price = valid_predictions.iter().sum::<f64>() / valid_predictions.len() as f64;
            let variance: f64 = valid_predictions.iter()
                .map(|p| (p - mean_price).powi(2))
                .sum::<f64>() / valid_predictions.len() as f64;
            let std_dev_price = variance.sqrt();
            
            // Filter outliers (> 2.5 std_dev)
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
            // Fallback: use all predictions if too few
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
    
    // Try volume-confirmed swing detection first
    if let (Some((high_idx, high_val)), Some((low_idx, low_val))) = 
        (detect_swing_high_with_volume(&highs, &volumes, window), 
         detect_swing_low_with_volume(&lows, &volumes, window)) {
        return (high_val, low_val, high_idx, low_idx);
    }
    
    // Fallback to price-only detection
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

fn predict_fibonacci_retracement(
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

fn predict_fibonacci_extension(
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