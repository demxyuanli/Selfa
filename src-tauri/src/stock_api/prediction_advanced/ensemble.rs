use crate::stock_api::types::{StockData, PredictionResult};
use crate::stock_api::utils::{parse_date, add_days, calculate_variance, determine_signal};
use crate::stock_api::prediction::{predict_linear_regression, predict_moving_average, predict_technical_indicator};
use super::hurst_exponent::predict_with_hurst_exponent;
use super::support_resistance::{calculate_support_resistance_levels, predict_support_resistance};
use std::collections::HashMap;

pub fn predict_ensemble_advanced(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();

    if closes.len() < 50 {
        return Err("Need at least 50 data points for advanced ensemble prediction".to_string());
    }

    // 定义多个预测方法及其权重配置
    let mut predictions = HashMap::new();
    let mut weights = HashMap::new();

    // 1. 线性回归预测
    if let Ok(preds) = predict_linear_regression(&closes, start_date, period) {
        predictions.insert("linear", preds);
        weights.insert("linear", 0.15);
    }

    // 2. 移动平均预测
    if let Ok(preds) = predict_moving_average(&closes, start_date, period) {
        predictions.insert("ma", preds);
        weights.insert("ma", 0.15);
    }

    // 3. 技术指标预测
    if let Ok(preds) = predict_technical_indicator(&closes, start_date, period) {
        predictions.insert("technical", preds);
        weights.insert("technical", 0.20);
    }

    // 4. Hurst指数预测
    if let Ok(preds) = predict_with_hurst_exponent(&closes, start_date, period) {
        predictions.insert("hurst", preds);
        weights.insert("hurst", 0.25);
    }

    // 5. 支撑阻力预测
    if let Ok(preds) = predict_support_resistance(data, start_date, period) {
        predictions.insert("support_resistance", preds);
        weights.insert("support_resistance", 0.25);
    }

    if predictions.is_empty() {
        return Err("No prediction methods succeeded".to_string());
    }

    // 动态权重调整：基于最近性能
    let adjusted_weights = adjust_weights_based_on_performance(&predictions, &closes);

    // 生成集成预测
    generate_weighted_ensemble(&predictions, &adjusted_weights, start_date, period)
}

fn adjust_weights_based_on_performance(
    predictions: &HashMap<&str, Vec<PredictionResult>>,
    actual_prices: &[f64],
) -> HashMap<String, f64> {
    let mut method_errors = HashMap::new();

    // 计算每个方法的最近预测误差
    for (method_name, preds) in predictions {
        if preds.len() >= 3 && actual_prices.len() >= preds.len() {
            let mut errors = Vec::new();

            for (i, pred) in preds.iter().enumerate().take(3) {
                let actual_idx = actual_prices.len() - preds.len() + i;
                if actual_idx < actual_prices.len() {
                    let actual = actual_prices[actual_idx];
                    let error = (pred.predicted_price - actual).abs() / actual;
                    errors.push(error);
                }
            }

            if !errors.is_empty() {
                let avg_error = errors.iter().sum::<f64>() / errors.len() as f64;
                method_errors.insert(method_name.to_string(), avg_error);
            }
        }
    }

    // 基于误差调整权重
    let mut adjusted_weights = HashMap::new();
    let total_weight: f64 = method_errors.values().sum();

    for (method, error) in &method_errors {
        // 误差越小权重越大
        let weight = if total_weight > 0.0 {
            (1.0 / (1.0 + error)) / method_errors.values().map(|e| 1.0 / (1.0 + e)).sum::<f64>()
        } else {
            1.0 / method_errors.len() as f64
        };
        adjusted_weights.insert(method.clone(), weight);
    }

    // 如果没有历史误差，使用默认权重
    if adjusted_weights.is_empty() {
        for method in predictions.keys() {
            adjusted_weights.insert(method.to_string(), 1.0 / predictions.len() as f64);
        }
    }

    adjusted_weights
}

fn generate_weighted_ensemble(
    predictions: &HashMap<&str, Vec<PredictionResult>>,
    weights: &HashMap<String, f64>,
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;

    for day in 0..period {
        let mut weighted_sum = 0.0;
        let mut total_weight = 0.0;
        let mut confidence_sum = 0.0;
        let mut signals = Vec::new();
        let mut prices = Vec::new();

        for (method_name, preds) in predictions {
            if day < preds.len() {
                let pred = &preds[day];
                let weight = weights.get(&method_name.to_string()).unwrap_or(&0.1);

                weighted_sum += pred.predicted_price * weight;
                total_weight += weight;
                confidence_sum += pred.confidence * weight;
                signals.push(pred.signal.clone());
                prices.push(pred.predicted_price);
            }
        }

        if total_weight > 0.0 {
            let predicted_price = weighted_sum / total_weight;
            let avg_confidence = confidence_sum / total_weight;

            // 确定主要信号
            let signal_counts = signals.iter()
                .fold(HashMap::new(), |mut acc, signal| {
                    *acc.entry(signal).or_insert(0) += 1;
                    acc
                });

            let dominant_signal = signal_counts.iter()
                .max_by_key(|&(_, count)| count)
                .map(|(signal, _)| (*signal).clone())
                .unwrap_or_else(|| "hold".to_string());

            // 计算置信区间
            let variance = calculate_variance(&prices);
            let std_dev = variance.sqrt();
            let confidence_factor = (avg_confidence / 100.0).max(0.5);

            let date = add_days(&base_date, (day + 1) as i32)?;
            results.push(PredictionResult {
                date,
                predicted_price,
                confidence: avg_confidence,
                signal: dominant_signal.clone(),
                upper_bound: predicted_price + std_dev * confidence_factor,
                lower_bound: predicted_price - std_dev * confidence_factor,
                method: "ensemble_advanced".to_string(),
            });
        }
    }

    Ok(results)
}

// 计算预测准确性指标
#[derive(Debug)]
pub struct PredictionMetrics {
    pub mae: f64,           // 平均绝对误差
    pub mse: f64,           // 均方误差
    pub rmse: f64,          // 均方根误差
    pub mape: f64,          // 平均绝对百分比误差
    pub direction_accuracy: f64, // 方向准确率
}

pub fn calculate_prediction_metrics(
    actual: &[f64],
    predicted: &[f64],
) -> Option<PredictionMetrics> {
    if actual.len() != predicted.len() || actual.is_empty() {
        return None;
    }

    let n = actual.len() as f64;

    let mut abs_errors = Vec::new();
    let mut squared_errors = Vec::new();
    let mut percentage_errors = Vec::new();
    let mut direction_correct = 0;

    for i in 0..actual.len() {
        let error = predicted[i] - actual[i];
        let abs_error = error.abs();
        let squared_error = error.powi(2);

        abs_errors.push(abs_error);
        squared_errors.push(squared_error);

        if actual[i] != 0.0 {
            percentage_errors.push(abs_error / actual[i].abs());
        }

        // 计算方向准确率（比较相邻点的变化方向）
        if i > 0 {
            let actual_direction = (actual[i] - actual[i-1]).signum();
            let predicted_direction = (predicted[i] - predicted[i-1]).signum();
            if actual_direction == predicted_direction {
                direction_correct += 1;
            }
        }
    }

    let mae = abs_errors.iter().sum::<f64>() / n;
    let mse = squared_errors.iter().sum::<f64>() / n;
    let rmse = mse.sqrt();
    let mape = if !percentage_errors.is_empty() {
        percentage_errors.iter().sum::<f64>() / percentage_errors.len() as f64 * 100.0
    } else {
        0.0
    };
    let direction_accuracy = if actual.len() > 1 {
        direction_correct as f64 / (actual.len() - 1) as f64 * 100.0
    } else {
        0.0
    };

    Some(PredictionMetrics {
        mae,
        mse,
        rmse,
        mape,
        direction_accuracy,
    })
}