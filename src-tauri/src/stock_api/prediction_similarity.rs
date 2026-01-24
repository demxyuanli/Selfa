use super::types::StockData;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarityResult {
    pub match_date: String,
    pub similarity_score: f64, // 0.0 to 1.0
    pub future_data: Vec<StockData>,
}

pub fn find_similar_patterns(
    data: &[StockData],
    lookback_window: usize,
    forecast_horizon: usize,
    top_n: usize,
) -> Vec<SimilarityResult> {
    if data.len() < lookback_window * 2 + forecast_horizon {
        return Vec::new();
    }

    let target_slice = &data[data.len() - lookback_window..];
    let target_closes: Vec<f64> = target_slice.iter().map(|d| d.close).collect();
    // Normalize target (e.g., percent change from start) to match shape not price level
    let target_normalized = normalize(&target_closes);

    let mut matches = Vec::new();

    // Slide window through history
    // Stop before the target window to avoid matching itself (perfectly)
    let end_search_idx = data.len() - lookback_window - forecast_horizon;
    
    for i in 0..end_search_idx {
        let window_slice = &data[i..i + lookback_window];
        let window_closes: Vec<f64> = window_slice.iter().map(|d| d.close).collect();
        let window_normalized = normalize(&window_closes);

        let score = calculate_correlation(&target_normalized, &window_normalized);

        if score > 0.5 { // Filter weak matches
            // Get future data
            let future_slice = &data[i + lookback_window..i + lookback_window + forecast_horizon];
            
            matches.push(SimilarityResult {
                match_date: window_slice.last().unwrap().date.clone(),
                similarity_score: score,
                future_data: future_slice.to_vec(),
            });
        }
    }

    // Sort by score descending
    matches.sort_by(|a, b| b.similarity_score.partial_cmp(&a.similarity_score).unwrap());

    matches.into_iter().take(top_n).collect()
}

fn normalize(data: &[f64]) -> Vec<f64> {
    if data.is_empty() {
        return Vec::new();
    }
    let first = data[0];
    if first == 0.0 {
        return data.to_vec();
    }
    data.iter().map(|&x| (x - first) / first).collect()
}

fn calculate_correlation(x: &[f64], y: &[f64]) -> f64 {
    let n = x.len();
    if n != y.len() || n == 0 {
        return 0.0;
    }

    let sum_x: f64 = x.iter().sum();
    let sum_y: f64 = y.iter().sum();
    let sum_xy: f64 = x.iter().zip(y.iter()).map(|(a, b)| a * b).sum();
    let sum_sq_x: f64 = x.iter().map(|a| a * a).sum();
    let sum_sq_y: f64 = y.iter().map(|b| b * b).sum();

    let numerator = (n as f64 * sum_xy) - (sum_x * sum_y);
    let denominator = ((n as f64 * sum_sq_x - sum_x * sum_x) * (n as f64 * sum_sq_y - sum_y * sum_y)).sqrt();

    if denominator == 0.0 {
        0.0
    } else {
        numerator / denominator
    }
}
