use crate::stock_api::types::{StockData, PredictionResult};
use crate::stock_api::utils::{parse_date, add_days, calculate_variance};
use rand::Rng;
use std::f64::consts::PI;
use super::deep_learning::predict_deep_learning;

/// NEOAI SpaceExploreAI-Small-Base-Regression-27M (Simulation)
/// 
/// This module implements a "Latent Space Exploration" regression model.
/// It projects time-series data into a high-dimensional latent space (simulating the 27M parameter feature space),
/// explores potential future trajectories using a State Space Model (SSM), and regresses the result back to price.
/// 
/// Key Components:
/// 1. **Latent Projection**: Transforms price history into a 27-dimensional feature space (scaled down from 27M for performance).
/// 2. **Space Exploration**: Uses a stochastic differential equation (SDE) solver to evolve the state in latent space.
/// 3. **Base Regression**: A solid non-linear regression baseline (Ridge Regression simulation).
pub fn predict_space_explore_ai(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 50 {
        return Err("SpaceExploreAI requires at least 50 data points for latent space initialization".to_string());
    }

    let dl_predictions = predict_deep_learning(data, start_date, period).ok();

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = closes[closes.len() - 1];
    
    // 1. Latent Space Projection
    // We simulate a feature extraction layer.
    // We'll create 27 "feature channels" based on different frequency components (Fourier-like)
    // and statistical moments.
    let window_size = 30;
    let recent_data = &closes[closes.len() - window_size..];
    
    // Normalize input
    let mean_price = recent_data.iter().sum::<f64>() / window_size as f64;
    let std_price = calculate_variance(recent_data).sqrt();
    let norm_data: Vec<f64> = recent_data.iter().map(|&x| (x - mean_price) / std_price).collect();
    
    // Simulate 27 latent features (The "Small-Base")
    let mut latent_state = vec![0.0; 27];
    
    // Feature 0-9: Momentum at different scales
    for i in 0..10 {
        let lag = i + 1;
        let momentum = norm_data[window_size - 1] - norm_data[window_size - 1 - lag];
        latent_state[i] = momentum;
    }
    
    // Feature 10-19: Volatility / Energy
    for i in 0..10 {
        // let lag = i + 2; // Unused
        let mut sum_sq_diff = 0.0;
        for j in 0..5 {
            sum_sq_diff += (norm_data[window_size - 1 - j] - norm_data[window_size - 1 - j - 1]).powi(2);
        }
        latent_state[10 + i] = (sum_sq_diff / 5.0).sqrt();
    }
    
    // Feature 20-26: Frequency components (Simplified DFT)
    for k in 0..7 {
        let freq = (k + 1) as f64 * 2.0 * PI / window_size as f64;
        let mut re = 0.0;
        let mut im = 0.0;
        for (t, &val) in norm_data.iter().enumerate() {
            re += val * (freq * t as f64).cos();
            im += val * (freq * t as f64).sin();
        }
        latent_state[20 + k] = (re.powi(2) + im.powi(2)).sqrt() / window_size as f64;
    }
    
    // 2. Space Exploration (Prediction Phase)
    // We evolve these 27 features into the future using a "Transition Matrix" simulation.
    // In a real 27M model, this would be a massive weight matrix. 
    // Here we approximate it with a "Stability + Drift" dynamic.
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let mut rng = rand::thread_rng();
    
    // Prediction Loop
    let mut current_price = last_price;
    let mut current_state = latent_state.clone();
    
    for i in 0..period {
        // Evolve State
        let mut next_state = vec![0.0; 27];
        
        // Decay/Dampening factor (Mean Reversion in latent space)
        let damping = 0.95; 
        
        for j in 0..27 {
            // Add some "Exploration" noise (Stochastic)
            let exploration_noise = rng.gen_range(-0.05..0.05);
            
            // Simple autoregressive evolution
            next_state[j] = current_state[j] * damping + exploration_noise;
        }
        
        // 3. Regression Head (Decode State to Price Change)
        // We use a weighted combination of features to predict the next step's normalized change.
        // Weights would be learned; here we use heuristic weights based on feature type importance.
        
        let mut predicted_norm_change = 0.0;
        
        // Momentum features (High weight)
        for j in 0..10 {
            let weight = 0.4 * (1.0 / (j + 1) as f64); // Recent momentum matters more
            predicted_norm_change += next_state[j] * weight;
        }
        
        // Frequency features (Cyclical adjustment)
        for j in 20..27 {
            let phase = (i as f64) * 0.5; // Artificial phase shift for projection
            predicted_norm_change += next_state[j] * phase.sin() * 0.1;
        }
        
        // Denormalize
        // The predicted_norm_change is roughly z-score change
        let price_change = predicted_norm_change * std_price * 0.1; // Scale down for 1-step
        
        let mut predicted_price = current_price + price_change;
        
        // Sanity Check / Clamp (Regression Base Constraint)
        // Prevent explosion
        let max_change = current_price * 0.05;
        if (predicted_price - current_price).abs() > max_change {
             predicted_price = current_price + max_change * (predicted_price - current_price).signum();
        }

        // 4. Deep Learning Guidance (Hybrid Enhancement)
        // If the MLP model provided a prediction, we use it to correct the latent space drift.
        // We blend the Latent Space Exploration (which is good at volatility/noise) 
        // with the MLP (which is good at non-linear trends).
        if let Some(dl_preds) = &dl_predictions {
            if i < dl_preds.len() {
                let dl_price = dl_preds[i].predicted_price;
                // Blend: 60% Deep Learning (Signal), 40% Latent Space (Noise/Process)
                predicted_price = dl_price * 0.6 + predicted_price * 0.4;
            }
        }
        
        // Update for next step
        if let Some(dl_preds) = &dl_predictions {
            if i < dl_preds.len() {
                let dl_price = dl_preds[i].predicted_price;
                predicted_price = dl_price * 0.6 + predicted_price * 0.4;
            }
        }

        current_price = predicted_price;
        current_state = next_state;
        
        // Confidence Estimation
        // Based on "State Stability" - how much did the state vector change?
        let state_magnitude: f64 = current_state.iter().map(|x| x.powi(2)).sum();
        let stability = (-state_magnitude * 0.1).exp(); // 0 to 1
        let confidence = (50.0 + stability * 45.0).max(30.0).min(95.0);
        
        let date = add_days(&base_date, (i + 1) as i32)?;
        
        let total_change = (predicted_price - last_price) / last_price;
        let signal = if total_change > 0.02 { "buy" } else if total_change < -0.02 { "sell" } else { "hold" };

        results.push(PredictionResult {
            date,
            predicted_price,
            confidence,
            signal: signal.to_string(),
            upper_bound: predicted_price + std_price * (0.5 + i as f64 * 0.1),
            lower_bound: predicted_price - std_price * (0.5 + i as f64 * 0.1),
            method: "NEOAI/SpaceExplore-27M".to_string(),
            reasoning: None,
        });
    }

    Ok(results)
}
