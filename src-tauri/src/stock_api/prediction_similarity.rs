use super::types::StockData;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetPattern {
    pub dates: Vec<String>,
    pub closes: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarityResult {
    pub match_date: String,
    pub similarity_score: f64, // 0.0 to 1.0
    pub pattern_dates: Vec<String>,
    pub pattern_closes: Vec<f64>,
    pub future_data: Vec<StockData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarityPredictionResponse {
    pub target_pattern: TargetPattern,
    pub matches: Vec<SimilarityResult>,
}

pub fn find_similar_patterns(
    data: &[StockData],
    lookback_window: usize,
    forecast_horizon: usize,
    top_n: usize,
) -> Option<SimilarityPredictionResponse> {
    if data.len() < lookback_window * 2 + forecast_horizon {
        return None;
    }

    let target_slice = &data[data.len() - lookback_window..];
    let target_dates: Vec<String> = target_slice.iter().map(|d| d.date.clone()).collect();
    let target_closes: Vec<f64> = target_slice.iter().map(|d| d.close).collect();
    let target_volumes: Vec<f64> = target_slice.iter().map(|d| d.volume as f64).collect();
    
    // Normalization for Pearson (Relative Change)
    let target_close_norm = normalize(&target_closes);
    let target_vol_norm = normalize(&target_volumes);
    
    // Normalization for DTW (Z-Score)
    let target_close_z = z_score_normalize(&target_closes);
    let target_vol_z = z_score_normalize(&target_volumes);

    let mut matches = Vec::new();

    // Slide window through history
    // Stop before the target window to avoid matching itself (perfectly)
    let end_search_idx = data.len() - lookback_window - forecast_horizon;
    
    // Parallel processing could be added here using rayon if dependency allowed, 
    // but keeping it simple single-threaded for now as per "Basic Optimization"
    for i in 0..end_search_idx {
        let window_slice = &data[i..i + lookback_window];
        let window_closes: Vec<f64> = window_slice.iter().map(|d| d.close).collect();
        let window_volumes: Vec<f64> = window_slice.iter().map(|d| d.volume as f64).collect();

        // 1. Price Similarity
        let window_close_norm = normalize(&window_closes);
        let pearson_price = calculate_correlation(&target_close_norm, &window_close_norm);
        
        let window_close_z = z_score_normalize(&window_closes);
        let dtw_price = calculate_dtw(&target_close_z, &window_close_z);
        
        // Composite Price Score (0.6 Pearson + 0.4 DTW)
        // Pearson is [-1, 1], map to [0, 1] for combination? 
        // Usually we only care about positive correlation. 
        // Let's clamp Pearson to [0, 1] or just take max(0, p).
        let price_score = 0.6 * pearson_price.max(0.0) + 0.4 * dtw_price;

        // 2. Volume Similarity
        let window_vol_norm = normalize(&window_volumes);
        let pearson_vol = calculate_correlation(&target_vol_norm, &window_vol_norm);
        
        let window_vol_z = z_score_normalize(&window_volumes);
        let dtw_vol = calculate_dtw(&target_vol_z, &window_vol_z);
        
        let vol_score = 0.6 * pearson_vol.max(0.0) + 0.4 * dtw_vol;

        // 3. Final Weighted Score (0.7 Price + 0.3 Volume)
        let final_score = 0.7 * price_score + 0.3 * vol_score;

        if final_score > 0.6 { // Filter weak matches
            let future_slice = &data[i + lookback_window..i + lookback_window + forecast_horizon];
            let pattern_dates: Vec<String> = window_slice.iter().map(|d| d.date.clone()).collect();
            let pattern_closes: Vec<f64> = window_closes.clone();

            matches.push(SimilarityResult {
                match_date: window_slice.last().unwrap().date.clone(),
                similarity_score: final_score,
                pattern_dates,
                pattern_closes,
                future_data: future_slice.to_vec(),
            });
        }
    }

    matches.sort_by(|a, b| b.similarity_score.partial_cmp(&a.similarity_score).unwrap());
    let matches: Vec<SimilarityResult> = matches.into_iter().take(top_n).collect();

    Some(SimilarityPredictionResponse {
        target_pattern: TargetPattern {
            dates: target_dates,
            closes: target_closes,
        },
        matches,
    })
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

fn calculate_mean_std(data: &[f64]) -> (f64, f64) {
    let n = data.len() as f64;
    if n == 0.0 { return (0.0, 1.0); }
    let mean = data.iter().sum::<f64>() / n;
    let variance = data.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n;
    (mean, variance.sqrt())
}

fn z_score_normalize(data: &[f64]) -> Vec<f64> {
    let (mean, std) = calculate_mean_std(data);
    if std == 0.0 { return vec![0.0; data.len()]; }
    data.iter().map(|x| (x - mean) / std).collect()
}

fn calculate_dtw(x: &[f64], y: &[f64]) -> f64 {
    let n = x.len();
    let m = y.len();
    if n == 0 || m == 0 { return 0.0; }
    
    // Use a window constraint for DTW (Sakoe-Chiba band) to improve performance and locality
    // Default to 10% of window size
    let window = (n.max(m) / 10).max(2);
    
    let mut dtw = vec![vec![f64::INFINITY; m + 1]; n + 1];
    dtw[0][0] = 0.0;

    for i in 1..=n {
        let start = if i > window { i - window } else { 1 };
        let end = (i + window).min(m);
        
        for j in start..=end {
            let cost = (x[i-1] - y[j-1]).abs();
            dtw[i][j] = cost + dtw[i-1][j].min(dtw[i][j-1]).min(dtw[i-1][j-1]);
        }
    }
    
    let dist = dtw[n][m];
    
    // Normalize distance to 0-1 similarity
    // Max distance depends on data scale (Z-score -> mostly within [-3, 3])
    // Length n path. Avg dist per step approx 0-2.
    // Let's assume a reasonable decay.
    if dist.is_infinite() { return 0.0; }
    
    // Normalize by path length
    let avg_dist = dist / (n + m) as f64;
    
    // Convert to similarity: exp(-dist) or 1/(1+dist)
    (-avg_dist).exp()
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
