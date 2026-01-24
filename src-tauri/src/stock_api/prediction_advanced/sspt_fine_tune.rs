use crate::stock_api::types::{StockData, PredictionResult};
use crate::stock_api::utils::{parse_date, add_days, calculate_variance};
use crate::stock_api::technical_indicators::calculate_rsi;

/// SSPT (Stock Semantic Pattern Transformer) Fine-Tuned Simulation
/// 
/// This module implements a simulation of a fine-tuned Transformer model for stock prediction.
/// It uses "Semantic Tokens" to represent price movements (e.g., "Sharp Rise", "Steady", "Plummet")
/// and builds a transition probability matrix based on the specific stock's history.
/// 
/// "Fine-tuning" here refers to the process of aggressively updating the transition probabilities
/// using the most recent data (few-shot learning) to adapt to the stock's current "personality".
/// 
/// # Arguments
/// * `data` - Historical stock data
/// * `start_date` - Start date for prediction
/// * `period` - Prediction horizon (days)
/// * `epochs` - (Implicit) The intensity of the "fine-tuning" (weight given to recent patterns)
pub fn predict_sspt_fine_tuned(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 60 {
        return Err("SSPT requires at least 60 data points for pattern tokenization".to_string());
    }

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = closes[closes.len() - 1];
    
    // 1. Semantic Tokenization
    // We convert continuous price changes into discrete tokens to capture "semantic" meaning.
    // Tokens:
    // -2: Crash (<-3%)
    // -1: Drop (-3% to -0.5%)
    //  0: Flat (-0.5% to +0.5%)
    //  1: Rise (+0.5% to +3%)
    //  2: Rally (>+3%)
    let mut tokens: Vec<i8> = Vec::new();
    for i in 1..closes.len() {
        let pct_change = (closes[i] - closes[i-1]) / closes[i-1];
        let token = if pct_change < -0.03 { -2 }
            else if pct_change < -0.005 { -1 }
            else if pct_change < 0.005 { 0 }
            else if pct_change > 0.03 { 2 }
            else { 1 };
        tokens.push(token);
    }

    // 2. Pre-training (Base Model)
    // Build a base transition matrix from the entire history
    // Map: (prev_token, current_token) -> next_token probability distribution
    // Key: (prev, curr), Value: Map<next, count>
    // We use a simple 2-gram context (Markov chain of order 2)
    let mut transition_counts: std::collections::HashMap<(i8, i8), std::collections::HashMap<i8, f64>> = std::collections::HashMap::new();
    
    // "Training" loop
    for i in 2..tokens.len() {
        let context = (tokens[i-2], tokens[i-1]);
        let next = tokens[i];
        
        let entry = transition_counts.entry(context).or_insert_with(std::collections::HashMap::new);
        *entry.entry(next).or_insert(0.0) += 1.0;
    }

    // 3. Fine-Tuning (Few-Shot Adaptation)
    // We emphasize the most recent patterns (last 30 days) by effectively "training" on them again
    // with higher weights (simulating epochs).
    // Let's assume 'epochs' = 5 (hardcoded simulation for now, or derived).
    let epochs = 5; 
    let fine_tune_window = 30.min(tokens.len() - 2);
    let start_idx = tokens.len() - fine_tune_window;
    
    for _ in 0..epochs {
        for i in start_idx..tokens.len() {
            let context = (tokens[i-2], tokens[i-1]);
            let next = tokens[i];
            
            // Boost the counts for recent patterns significantly
            let entry = transition_counts.entry(context).or_insert_with(std::collections::HashMap::new);
            *entry.entry(next).or_insert(0.0) += 2.0; // High learning rate for fine-tuning
        }
    }

    // 4. Generation (Prediction)
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let variance = calculate_variance(&closes);
    let std_dev = variance.sqrt();
    
    // Initial context for generation
    let mut current_context = (tokens[tokens.len()-2], tokens[tokens.len()-1]);
    let mut current_price = last_price;
    
    for i in 0..period {
        // Sample next token based on transition probabilities
        let next_token_dist = transition_counts.get(&current_context);
        
        // Calculate expected value (weighted average of possible next tokens)
        let expected_token_val = if let Some(dist) = next_token_dist {
            let total_count: f64 = dist.values().sum();
            let weighted_sum: f64 = dist.iter().map(|(&token, &count)| token as f64 * count).sum();
            weighted_sum / total_count
        } else {
            // Fallback if context unseen: slightly mean reverting to 0
            0.1 
        };
        
        // Map expected token value back to price change
        // We use a continuous mapping now for smoother predictions
        // -2 -> -4%, -1 -> -1.5%, 0 -> 0%, 1 -> 1.5%, 2 -> 4%
        let predicted_change = match expected_token_val {
            v if v < -1.5 => -0.04,
            v if v < -0.5 => -0.015 * (v.abs()),
            v if v > 1.5 => 0.04,
            v if v > 0.5 => 0.015 * v,
            v => v * 0.005, // Small noise around 0
        };
        
        let predicted = current_price * (1.0 + predicted_change);
        
        // Update state for next step
        // We need to discretize the *predicted* move to update the context
        let next_token_discrete = if predicted_change < -0.03 { -2 }
            else if predicted_change < -0.005 { -1 }
            else if predicted_change < 0.005 { 0 }
            else if predicted_change > 0.03 { 2 }
            else { 1 };
            
        current_context = (current_context.1, next_token_discrete);
        // current_price = predicted; // Removed unused assignment
        
        // Technical Indicator Overlay (Hybrid Check)
        // Ensure we don't drift too far from reality using RSI
        let rsi_vec = calculate_rsi(&closes, 14);
        let rsi = rsi_vec.last().unwrap_or(&50.0);
        let rsi_correction = if *rsi > 80.0 { -0.01 } else if *rsi < 20.0 { 0.01 } else { 0.0 };
        
        let final_predicted = predicted * (1.0 + rsi_correction);
        current_price = final_predicted; // Update for next loop

        let date = add_days(&base_date, (i + 1) as i32)?;
        
        // Confidence depends on how "strong" the transition probability was
        let confidence_score = if let Some(dist) = next_token_dist {
            let total: f64 = dist.values().sum();
            let max_count: f64 = dist.values().fold(0.0, |a, &b| a.max(b));
            (max_count / total) * 100.0
        } else {
            40.0 // Low confidence for unseen patterns
        };
        
        // Decay confidence over time
        let confidence = (confidence_score - (i as f64 * 2.0)).max(30.0).min(90.0);
        
        let price_change = (final_predicted - last_price) / last_price;
        let signal = if price_change > 0.02 { "buy" } else if price_change < -0.02 { "sell" } else { "hold" };

        results.push(PredictionResult {
            date,
            predicted_price: final_predicted,
            confidence,
            signal: signal.to_string(),
            upper_bound: final_predicted + std_dev * (0.5 + i as f64 * 0.1),
            lower_bound: final_predicted - std_dev * (0.5 + i as f64 * 0.1),
            method: "SSPT-FineTuned".to_string(),
        });
    }

    Ok(results)
}
