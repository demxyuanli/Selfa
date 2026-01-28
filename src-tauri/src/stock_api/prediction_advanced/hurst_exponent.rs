#![allow(dead_code)]

use crate::stock_api::types::PredictionResult;
use crate::stock_api::utils::{parse_date, add_days, calculate_variance, determine_signal};

pub fn calculate_hurst_exponent(data: &[f64]) -> f64 {
    if data.len() < 20 {
        return 0.5; // 随机游走
    }

    let n = data.len();
    let mut hurst_values = Vec::new();

    // 使用不同的时间窗口计算Hurst指数
    let window_sizes = vec![4, 8, 16, 32, 64].into_iter()
        .filter(|&size| size < n / 2)
        .collect::<Vec<usize>>();

    for window_size in window_sizes {
        let mut variances = Vec::new();

        for i in (0..n - window_size).step_by(window_size / 2) {
            let segment = &data[i..i + window_size];
            if segment.len() >= window_size {
                let mean = segment.iter().sum::<f64>() / segment.len() as f64;
                let variance = segment.iter()
                    .map(|&x| (x - mean).powi(2))
                    .sum::<f64>() / segment.len() as f64;
                variances.push(variance);
            }
        }

        if !variances.is_empty() {
            let avg_variance = variances.iter().sum::<f64>() / variances.len() as f64;
            if avg_variance > 0.0 {
                let log_var = avg_variance.ln();
                let log_window = (window_size as f64).ln();
                hurst_values.push((log_window, log_var));
            }
        }
    }

    if hurst_values.len() < 2 {
        return 0.5;
    }

    // 使用最小二乘法拟合直线
    let n_points = hurst_values.len() as f64;
    let sum_x: f64 = hurst_values.iter().map(|(x, _)| x).sum();
    let sum_y: f64 = hurst_values.iter().map(|(_, y)| y).sum();
    let sum_xy: f64 = hurst_values.iter().map(|(x, y)| x * y).sum();
    let sum_xx: f64 = hurst_values.iter().map(|(x, _)| x * x).sum();

    let slope = (n_points * sum_xy - sum_x * sum_y) / (n_points * sum_xx - sum_x * sum_x);

    // Hurst指数是斜率的一半
    let hurst = slope / 2.0;
    hurst.max(0.0).min(1.0) // 限制在合理范围内
}

/// Calculate statistical significance (p-value approximation) for Hurst exponent
/// Returns a confidence score between 0.0 and 1.0 based on how far H is from 0.5
/// and the quality of the linear fit
pub fn calculate_hurst_significance(data: &[f64], hurst: f64) -> f64 {
    if data.len() < 20 {
        return 0.5;
    }

    let n = data.len();
    let window_sizes = vec![4, 8, 16, 32, 64].into_iter()
        .filter(|&size| size < n / 2)
        .collect::<Vec<usize>>();

    let mut log_windows = Vec::new();
    let mut log_vars = Vec::new();

    for window_size in window_sizes {
        let mut variances = Vec::new();
        for i in (0..n - window_size).step_by(window_size / 2) {
            let segment = &data[i..i + window_size];
            if segment.len() >= window_size {
                let mean = segment.iter().sum::<f64>() / segment.len() as f64;
                let variance = segment.iter()
                    .map(|&x| (x - mean).powi(2))
                    .sum::<f64>() / segment.len() as f64;
                variances.push(variance);
            }
        }
        if !variances.is_empty() {
            let avg_variance = variances.iter().sum::<f64>() / variances.len() as f64;
            if avg_variance > 0.0 {
                log_windows.push((window_size as f64).ln());
                log_vars.push(avg_variance.ln());
            }
        }
    }

    if log_windows.len() < 2 {
        return 0.5;
    }

    // Calculate R-squared for fit quality
    let n_points = log_windows.len() as f64;
    let mean_y = log_vars.iter().sum::<f64>() / n_points;
    let mean_x = log_windows.iter().sum::<f64>() / n_points;

    let sum_xy: f64 = log_windows.iter().zip(log_vars.iter()).map(|(x, y)| (x - mean_x) * (y - mean_y)).sum();
    let sum_xx: f64 = log_windows.iter().map(|x| (x - mean_x).powi(2)).sum();
    let sum_yy: f64 = log_vars.iter().map(|y| (y - mean_y).powi(2)).sum();

    let r_squared = if sum_xx > 0.0 && sum_yy > 0.0 {
        (sum_xy.powi(2)) / (sum_xx * sum_yy)
    } else {
        0.0
    };

    // Distance from 0.5 (random walk)
    let distance_from_random = (hurst - 0.5).abs() * 2.0; // Scale to 0-1

    // Combine fit quality and distance: higher is better
    // R-squared indicates fit quality, distance indicates signal strength
    let significance = (r_squared * 0.6 + distance_from_random * 0.4).min(1.0).max(0.0);
    
    significance
}

pub fn predict_with_hurst_exponent(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 30 {
        return Err("Need at least 30 data points for Hurst exponent prediction".to_string());
    }

    let hurst = calculate_hurst_exponent(closes);
    let hurst_significance = calculate_hurst_significance(closes, hurst);
    let last_price = closes[closes.len() - 1];

    // Hurst指数分析：
    // H < 0.5: 均值回归（反转）
    // H = 0.5: 随机游走
    // H > 0.5: 趋势持续
    // Only use strong signals if significance is high (p-value equivalent)
    let significance_threshold = 0.6; // Require at least 60% confidence in the signal
    
    let trend_strength = if hurst_significance < significance_threshold {
        // Low significance: reduce signal strength
        if hurst < 0.5 {
            -0.2
        } else if hurst > 0.5 {
            0.2
        } else {
            0.0
        }
    } else if hurst < 0.45 {
        -0.7 // 强均值回归
    } else if hurst < 0.5 {
        -0.3 // 弱均值回归
    } else if hurst > 0.55 {
        0.7 // 强趋势
    } else if hurst > 0.5 {
        0.3 // 弱趋势
    } else {
        0.0 // 随机
    };

    // 计算最近趋势
    let recent_data = &closes[closes.len().saturating_sub(20)..];
    let mean = recent_data.iter().sum::<f64>() / recent_data.len() as f64;
    let deviation = last_price - mean;

    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let variance = calculate_variance(closes);
    let std_dev = variance.sqrt();

    // 基于Hurst指数的预测逻辑
    for i in 1..=period {
        // Hurst指数影响预测的持久性
        let persistence = hurst * 2.0 - 1.0; // 转换为-1到1的范围
        let decay_factor = (1.0 - persistence.abs()) * (1.0 - i as f64 / period as f64);

        // 均值回归和趋势的组合
        let mean_reversion = -deviation * (1.0 - hurst) * decay_factor;
        let trend_continuation = trend_strength * (last_price - mean) * persistence * (i as f64 / period as f64);

        let predicted = last_price + mean_reversion + trend_continuation;

        // 基于Hurst指数和统计显著性的置信度
        let base_confidence = if hurst_significance >= significance_threshold {
            if hurst < 0.4 || hurst > 0.6 {
                70.0 // 强信号且显著
            } else {
                60.0 // 中等信号但显著
            }
        } else {
            50.0 // 低显著性，降低置信度
        };

        // Adjust confidence based on significance
        let adjusted_confidence = base_confidence * hurst_significance + 45.0 * (1.0 - hurst_significance);
        let confidence = (adjusted_confidence - (std_dev / last_price * 100.0).min(20.0)).max(45.0);

        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, last_price, trend_strength),
            upper_bound: predicted + std_dev * (1.0 + hurst),
            lower_bound: predicted - std_dev * (1.0 + hurst),
            method: "hurst".to_string(),
            reasoning: None,
        });
    }

    Ok(results)
}