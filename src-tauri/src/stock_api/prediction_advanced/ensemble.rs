#![allow(dead_code)]

use crate::stock_api::types::{StockData, PredictionResult};
use crate::stock_api::utils::{parse_date, add_days, calculate_variance};
use crate::stock_api::prediction::{predict_linear_regression, predict_moving_average, predict_technical_indicator};
use super::hurst_exponent::predict_with_hurst_exponent;
use super::support_resistance::predict_support_resistance;
use std::collections::HashMap;

/// Inverse-variance weight: lower error variance => higher weight.
/// errors: historical prediction errors; decay: recent errors weighted more (e.g. 0.9).
fn calculate_adaptive_weight(errors: &[f64], decay: f64) -> f64 {
    if errors.is_empty() {
        return 1.0;
    }

    let mut weighted_sq_error_sum = 0.0;
    let mut weight_sum = 0.0;
    let mut current_decay = 1.0;

    for &err in errors.iter().rev() {
        weighted_sq_error_sum += (err * err) * current_decay;
        weight_sum += current_decay;
        current_decay *= decay;
    }

    let mse = weighted_sq_error_sum / weight_sum;
    1.0 / (mse + 1e-6)
}

pub fn predict_ensemble_advanced(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();

    if closes.len() < 50 {
        return Err("Need at least 50 data points for advanced ensemble prediction".to_string());
    }

    let mut predictions: HashMap<&str, Vec<PredictionResult>> = HashMap::new();

    if let Ok(preds) = predict_linear_regression(&closes, start_date, period) {
        predictions.insert("linear", preds);
    }
    if let Ok(preds) = predict_moving_average(&closes, start_date, period) {
        predictions.insert("ma", preds);
    }
    if let Ok(preds) = predict_technical_indicator(&closes, start_date, period) {
        predictions.insert("technical", preds);
    }
    if let Ok(preds) = predict_with_hurst_exponent(&closes, start_date, period) {
        predictions.insert("hurst", preds);
    }
    if let Ok(preds) = predict_support_resistance(data, start_date, period) {
        predictions.insert("support_resistance", preds);
    }

    if predictions.is_empty() {
        return Err("No prediction methods succeeded".to_string());
    }

    let lookback_for_error = 30;
    let mut model_weights: HashMap<String, f64> = HashMap::new();

    if closes.len() > lookback_for_error {
        for (name, _) in &predictions {
            let mut errors = Vec::new();
            for i in 0..(lookback_for_error - 1) {
                let train_end = data.len() - lookback_for_error + i;
                if train_end + 1 >= data.len() {
                    break;
                }
                let actual = closes[train_end + 1];
                let as_of = &data[train_end].date;

                let pred_result = match *name {
                    "linear" => predict_linear_regression(&closes[..=train_end], as_of, 1),
                    "ma" => predict_moving_average(&closes[..=train_end], as_of, 1),
                    "technical" => predict_technical_indicator(&closes[..=train_end], as_of, 1),
                    "hurst" => predict_with_hurst_exponent(&closes[..=train_end], as_of, 1),
                    "support_resistance" => predict_support_resistance(&data[..=train_end], as_of, 1),
                    _ => continue,
                };

                if let Ok(ref p) = pred_result {
                    if let Some(pr) = p.first() {
                        errors.push(pr.predicted_price - actual);
                    }
                }
            }
            let w = calculate_adaptive_weight(&errors, 0.9);
            model_weights.insert((*name).to_string(), w);
        }

        for name in predictions.keys() {
            if !model_weights.contains_key(*name) {
                model_weights.insert((*name).to_string(), 1.0);
            }
        }
        let total: f64 = model_weights.values().sum();
        if total > 0.0 {
            for v in model_weights.values_mut() {
                *v /= total;
            }
        }
    } else {
        let n = predictions.len() as f64;
        for name in predictions.keys() {
            model_weights.insert((*name).to_string(), 1.0 / n);
        }
    }

    generate_weighted_ensemble(&predictions, &model_weights, start_date, period)
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
                let w = weights
                    .get(*method_name)
                    .copied()
                    .unwrap_or_else(|| 1.0 / predictions.len() as f64);

                weighted_sum += pred.predicted_price * w;
                total_weight += w;
                confidence_sum += pred.confidence * w;
                signals.push(pred.signal.clone());
                prices.push(pred.predicted_price);
            }
        }

        if total_weight > 0.0 {
            let predicted_price = weighted_sum / total_weight;
            let avg_confidence = confidence_sum / total_weight;

            let signal_counts = signals
                .iter()
                .fold(HashMap::new(), |mut acc, s| {
                    *acc.entry(s).or_insert(0) += 1;
                    acc
                });
            let dominant_signal = signal_counts
                .iter()
                .max_by_key(|(_, c)| *c)
                .map(|(s, _)| (*s).clone())
                .unwrap_or_else(|| "hold".to_string());

            let variance = calculate_variance(&prices);
            let std_dev = variance.sqrt();
            let confidence_factor = (avg_confidence / 100.0).max(0.5);

            let date = add_days(&base_date, (day + 1) as i32)?;
            results.push(PredictionResult {
                date,
                predicted_price,
                confidence: avg_confidence,
                signal: dominant_signal,
                upper_bound: predicted_price + std_dev * confidence_factor,
                lower_bound: predicted_price - std_dev * confidence_factor,
                method: "ensemble_advanced".to_string(),
            });
        }
    }

    Ok(results)
}

#[derive(Debug)]
pub struct PredictionMetrics {
    pub mae: f64,
    pub mse: f64,
    pub rmse: f64,
    pub mape: f64,
    pub direction_accuracy: f64,
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

        if i > 0 {
            let actual_direction = (actual[i] - actual[i - 1]).signum();
            let predicted_direction = (predicted[i] - predicted[i - 1]).signum();
            if actual_direction == predicted_direction {
                direction_correct += 1;
            }
        }
    }

    let mae = abs_errors.iter().sum::<f64>() / n;
    let mse = squared_errors.iter().sum::<f64>() / n;
    let rmse = mse.sqrt();
    let mape = if percentage_errors.is_empty() {
        0.0
    } else {
        percentage_errors.iter().sum::<f64>() / percentage_errors.len() as f64 * 100.0
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
