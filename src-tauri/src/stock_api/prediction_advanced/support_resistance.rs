#![allow(dead_code)]

use crate::stock_api::types::{StockData, PredictionResult};
use crate::stock_api::utils::{parse_date, add_days, calculate_variance, determine_signal};
use std::f64::consts::PI;

#[derive(Debug, Clone)]
pub struct SupportResistanceLevel {
    pub price: f64,
    pub strength: f64,
    pub is_support: bool,
}

fn gaussian_kernel(x: f64, h: f64) -> f64 {
    (1.0 / (h * (2.0 * PI).sqrt())) * (-0.5 * (x / h).powi(2)).exp()
}

pub fn calculate_support_resistance_levels(
    data: &[StockData],
    lookback: usize,
) -> Vec<SupportResistanceLevel> {
    if data.len() < 20 {
        return Vec::new();
    }

    let start_idx = data.len().saturating_sub(lookback);
    let recent_data = &data[start_idx..];
    let current_price = data.last().unwrap().close;

    let mut points = Vec::new();
    for d in recent_data {
        points.push(d.high);
        points.push(d.low);
        points.push(d.close);
        points.push(d.close);
    }

    let min_price = points.iter().fold(f64::INFINITY, |a, &b| a.min(b));
    let max_price = points.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));

    // Adaptive bandwidth using Silverman's rule of thumb
    // h = 0.9 * min(std_dev, IQR/1.34) * n^(-1/5)
    let n = points.len() as f64;
    let mean = points.iter().sum::<f64>() / n;
    let variance = points.iter().map(|&p| (p - mean).powi(2)).sum::<f64>() / n;
    let std_dev = variance.sqrt();
    
    // Calculate IQR (Interquartile Range) for robust bandwidth estimation
    let mut sorted_points = points.clone();
    sorted_points.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let q1_idx = (n * 0.25) as usize;
    let q3_idx = (n * 0.75) as usize;
    let iqr = if q3_idx < sorted_points.len() && q1_idx < sorted_points.len() {
        sorted_points[q3_idx] - sorted_points[q1_idx]
    } else {
        std_dev * 1.34
    };
    
    let robust_std = std_dev.min(iqr / 1.34);
    let h_silverman = 0.9 * robust_std * n.powf(-0.2);
    
    // Fallback to fixed bandwidth if adaptive is too small or invalid
    let h = if h_silverman > 0.0 && h_silverman < (max_price - min_price) {
        h_silverman.max((max_price - min_price) * 0.01)
    } else {
        (max_price - min_price) * 0.015
    };

    let steps = 500;
    let step_size = (max_price - min_price) / steps as f64;
    let mut densities = vec![0.0; steps];

    for i in 0..steps {
        let x = min_price + i as f64 * step_size;
        let mut sum = 0.0;
        for &p in &points {
            sum += gaussian_kernel(x - p, h);
        }
        densities[i] = sum;
    }

    let mut levels = Vec::new();
    for i in 1..steps - 1 {
        if densities[i] > densities[i - 1] && densities[i] > densities[i + 1] {
            let price = min_price + i as f64 * step_size;
            let strength = densities[i];

            levels.push(SupportResistanceLevel {
                price,
                strength,
                is_support: price < current_price,
            });
        }
    }

    levels.sort_by(|a, b| b.strength.partial_cmp(&a.strength).unwrap());
    levels.into_iter().take(5).collect()
}

pub fn predict_support_resistance(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 30 {
        return Err("Need at least 30 data points for support/resistance prediction".to_string());
    }

    let levels = calculate_support_resistance_levels(data, 60);
    if levels.is_empty() {
        return Err("No significant support/resistance levels found".to_string());
    }

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = *closes.last().unwrap();

    let nearest_support = levels
        .iter()
        .filter(|l| l.is_support && l.price < last_price)
        .max_by(|a, b| a.price.partial_cmp(&b.price).unwrap());

    let nearest_resistance = levels
        .iter()
        .filter(|l| !l.is_support && l.price > last_price)
        .min_by(|a, b| a.price.partial_cmp(&b.price).unwrap());

    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let variance = calculate_variance(&closes);
    let std_dev = variance.sqrt();

    for i in 1..=period {
        let progress_ratio = i as f64 / period as f64;

        let predicted = if let (Some(support), Some(resistance)) = (nearest_support, nearest_resistance) {
            let range = resistance.price - support.price;
            let position = (last_price - support.price) / range;

            if position < 0.3 {
                last_price + (range * 0.2 * (1.0 - progress_ratio))
            } else if position > 0.7 {
                last_price - (range * 0.2 * (1.0 - progress_ratio))
            } else {
                last_price + (resistance.price - last_price) * 0.1 * progress_ratio
            }
        } else if let Some(support) = nearest_support {
            last_price + (last_price - support.price) * 0.5 * progress_ratio
        } else if let Some(resistance) = nearest_resistance {
            last_price - (resistance.price - last_price) * 0.5 * progress_ratio
        } else {
            last_price
        };

        let max_strength = levels.iter().map(|l| l.strength).fold(0.0, f64::max);
        let confidence = (60.0 + max_strength * 5.0).min(85.0);

        let signal = determine_signal(predicted, last_price, 0.0);

        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal,
            upper_bound: predicted + std_dev * 0.8,
            lower_bound: predicted - std_dev * 0.8,
            method: "support_resistance".to_string(),
            reasoning: None,
        });
    }

    Ok(results)
}
