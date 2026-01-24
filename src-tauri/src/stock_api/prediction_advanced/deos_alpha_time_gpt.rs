use crate::stock_api::types::{StockData, PredictionResult};
use crate::stock_api::utils::{parse_date, add_days, calculate_variance};
use crate::stock_api::technical_indicators::{calculate_rsi, calculate_macd};
use std::cmp::Ordering;

pub fn predict_deos_alpha_time_gpt(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    // Increased data requirement for multi-scale analysis (needs 60d window + history)
    if data.len() < 120 {
        return Err("DeOSAlphaTimeGPT requires at least 120 data points for multi-scale analysis".to_string());
    }

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let volumes: Vec<f64> = data.iter().map(|d| d.volume as f64).collect();
    let last_price = closes[closes.len() - 1];
    
    // 1. Alpha Component: Technical Trend Analysis
    let rsi_vec = calculate_rsi(&closes, 14);
    let rsi = rsi_vec.last().unwrap_or(&50.0);
    
    let macd_res = calculate_macd(&closes, 12, 26, 9);
    let last_macd = macd_res.macd.last().unwrap_or(&0.0);
    let last_signal = macd_res.signal.last().unwrap_or(&0.0);
    
    let alpha_trend = if *last_macd > *last_signal { 1.0 } else { -1.0 };
    
    // 2. TimeGPT Simulation: Multi-Scale Pattern Matching with Attention
    // We use multiple context windows to capture different temporal dynamics
    let context_windows = vec![15, 30, 60];
    let prediction_horizon = period;
    
    // Structure to hold aggregated projections: (sum_weighted_price, sum_weight) for each future day
    let mut aggregated_projections: Vec<(f64, f64)> = vec![(0.0, 0.0); period];
    let mut total_scale_quality = 0.0;
    
    for &context_window in &context_windows {
        if data.len() < context_window + prediction_horizon {
            continue;
        }

        let current_pattern_close = &closes[closes.len() - context_window..];
        let current_pattern_vol = &volumes[volumes.len() - context_window..];
        
        // Normalize current pattern
        let current_mean_close = current_pattern_close.iter().sum::<f64>() / context_window as f64;
        let current_norm_close: Vec<f64> = current_pattern_close.iter().map(|x| x / current_mean_close).collect();
        
        let current_mean_vol = current_pattern_vol.iter().sum::<f64>() / context_window as f64;
        let vol_divisor = if current_mean_vol == 0.0 { 1.0 } else { current_mean_vol };
        let current_norm_vol: Vec<f64> = current_pattern_vol.iter().map(|x| x / vol_divisor).collect();
        
        let mut attention_scores: Vec<(usize, f64)> = Vec::new();
        
        // Scan history
        let end_idx = closes.len().saturating_sub(context_window + prediction_horizon);
        
        for i in 0..end_idx {
            let candidate_close = &closes[i..i+context_window];
            let candidate_vol = &volumes[i..i+context_window];
            
            let cand_mean_close = candidate_close.iter().sum::<f64>() / context_window as f64;
            let cand_norm_close: Vec<f64> = candidate_close.iter().map(|x| x / cand_mean_close).collect();
            
            let cand_mean_vol = candidate_vol.iter().sum::<f64>() / context_window as f64;
            let cand_vol_divisor = if cand_mean_vol == 0.0 { 1.0 } else { cand_mean_vol };
            let cand_norm_vol: Vec<f64> = candidate_vol.iter().map(|x| x / cand_vol_divisor).collect();
            
            // Calculate similarity (Weighted Euclidean distance: Price 70%, Volume 30%)
            let mut dist_sq = 0.0;
            for j in 0..context_window {
                let d_price = current_norm_close[j] - cand_norm_close[j];
                let d_vol = current_norm_vol[j] - cand_norm_vol[j];
                dist_sq += 0.7 * d_price.powi(2) + 0.3 * d_vol.powi(2);
            }
            let dist = dist_sq.sqrt();
            
            attention_scores.push((i, dist));
        }
        
        if attention_scores.is_empty() {
            continue;
        }

        attention_scores.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(Ordering::Equal));
        let top_k = 5.min(attention_scores.len());
        let best_matches: Vec<(usize, f64)> = attention_scores.into_iter().take(top_k).collect();
        
        // Calculate average distance for this scale to estimate quality
        let avg_dist = best_matches.iter().map(|x| x.1).sum::<f64>() / top_k as f64;
        let scale_quality = (1.0 - avg_dist).max(0.1); // Higher quality = better match
        total_scale_quality += scale_quality;

        // Generate projections for this scale
        for (idx, dist) in best_matches {
            let future_segment = &closes[idx+context_window..idx+context_window+prediction_horizon];
            let segment_start_price = closes[idx+context_window-1];
            
            let projection: Vec<f64> = future_segment.iter().map(|p| {
                let change_pct = (p - segment_start_price) / segment_start_price;
                last_price * (1.0 + change_pct)
            }).collect();
            
            // Weight: combination of match quality (dist) and scale reliability (sqrt(window))
            // Sharper attention with exp(-dist * 3.0)
            let weight = (-dist * 3.0).exp() * (context_window as f64).sqrt();
            
            for k in 0..period {
                aggregated_projections[k].0 += projection[k] * weight;
                aggregated_projections[k].1 += weight;
            }
        }
    }
    
    // 3. Aggregate & Refine
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let variance = calculate_variance(&closes);
    let std_dev = variance.sqrt();
    
    for i in 0..period {
        let (weighted_sum, weights_used) = aggregated_projections[i];
        
        let mut predicted = if weights_used > 0.0 {
            weighted_sum / weights_used
        } else {
            last_price
        };
        
        // Apply Alpha correction (Momentum)
        let momentum_decay = (-0.15 * i as f64).exp(); // Slightly faster decay
        let alpha_influence = alpha_trend * std_dev * 0.15 * momentum_decay;
        
        // RSI correction
        let rsi_correction = if *rsi > 75.0 {
            -std_dev * 0.08 
        } else if *rsi < 25.0 {
            std_dev * 0.08
        } else {
            0.0
        };
        
        predicted += alpha_influence + rsi_correction * momentum_decay;
        
        // Dynamic confidence based on multi-scale quality
        // Normalize quality roughly to 0-1 range
        let quality_norm = (total_scale_quality / context_windows.len() as f64).min(1.0);
        let base_confidence = 65.0 + quality_norm * 30.0;
        
        let confidence = (base_confidence - (i as f64 * 0.8)).max(40.0).min(98.0);
        
        let date = add_days(&base_date, (i + 1) as i32)?;
        
        let price_change = (predicted - last_price) / last_price;
        let signal = if price_change > 0.025 { "buy" } else if price_change < -0.025 { "sell" } else { "hold" };

        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: signal.to_string(),
            upper_bound: predicted + std_dev * (0.6 + i as f64 * 0.06),
            lower_bound: predicted - std_dev * (0.6 + i as f64 * 0.06),
            method: "DeOSAlphaTimeGPT-SSPT-v2".to_string(),
        });
    }

    Ok(results)
}
