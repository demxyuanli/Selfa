use crate::stock_api::types::{StockData, PredictionResult};
// use crate::stock_api::utils::calculate_volatility; // Unused
use crate::stock_api::technical_indicators::{
    calculate_rsi, calculate_macd, calculate_bollinger_bands, 
    calculate_obv, calculate_cci, calculate_atr
};
use super::deep_learning::predict_deep_learning;
use std::f64::consts::PI;
use rand::Rng;
use rustfft::{FftPlanner, num_complex::Complex};

/// Enhanced Boris GAN v3.0
/// Features:
/// 1. FFT (Fast Fourier Transform) using `rustfft` for speed.
/// 2. AR(p) (AutoRegressive) model for auxiliary trend.
/// 3. Rolling Window Backtest for Empirical Confidence Intervals.
/// 4. Comprehensive Technical Bias (RSI, MACD, OBV, CCI, BB, ATR).
/// 5. Adaptive Market Regime (Hurst).

// -----------------------------------------------------------------------------
// AR(p) Model Implementation (Yule-Walker Equations)
// -----------------------------------------------------------------------------

struct ArModel {
    coeffs: Vec<f64>,
    mean: f64,
}

impl ArModel {
    fn fit(data: &[f64], p: usize) -> Option<Self> {
        let n = data.len();
        if n <= p { return None; }
        
        let mean = calculate_mean(data);
        let centered: Vec<f64> = data.iter().map(|&x| x - mean).collect();
        
        // Calculate Autocorrelation R(0)..R(p)
        let mut r = vec![0.0; p + 1];
        for lag in 0..=p {
            let mut sum = 0.0;
            for i in 0..(n - lag) {
                sum += centered[i] * centered[i + lag];
            }
            r[lag] = sum / n as f64;
        }
        
        // Levinson-Durbin Recursion
        if r[0].abs() < 1e-9 { return None; }
        
        let mut phi = vec![vec![0.0; p + 1]; p + 1];
        let mut error = vec![0.0; p + 1];
        
        error[0] = r[0];
        
        for k in 1..=p {
            let mut sum = 0.0;
            for j in 1..k {
                sum += phi[k-1][j] * r[k-j];
            }
            let lambda = (r[k] - sum) / error[k-1];
            
            phi[k][k] = lambda;
            for j in 1..k {
                phi[k][j] = phi[k-1][j] - lambda * phi[k-1][k-j];
            }
            
            error[k] = error[k-1] * (1.0 - lambda * lambda);
        }
        
        let final_coeffs = phi[p][1..=p].to_vec();
        Some(ArModel { coeffs: final_coeffs, mean })
    }
    
    fn predict(&self, history: &[f64]) -> f64 {
        let p = self.coeffs.len();
        let n = history.len();
        let mut sum = 0.0;
        for i in 0..p {
            if n > i {
                sum += self.coeffs[i] * (history[n - 1 - i] - self.mean);
            }
        }
        sum + self.mean
    }
}

// -----------------------------------------------------------------------------
// FFT Helper
// -----------------------------------------------------------------------------

pub fn calculate_fft_trend(data: &[f64], period: usize, top_k: usize) -> Vec<f64> {
    let n = data.len();
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(n);
    
    // Prepare input
    let mut buffer: Vec<Complex<f64>> = data.iter().map(|&x| Complex::new(x, 0.0)).collect();
    
    // Forward FFT
    fft.process(&mut buffer);
    
    // Filter: Keep top K components by magnitude
    let mut indices: Vec<usize> = (0..n).collect();
    // Use magnitude squared to avoid sqrt
    indices.sort_by(|&a, &b| buffer[b].norm_sqr().partial_cmp(&buffer[a].norm_sqr()).unwrap_or(std::cmp::Ordering::Equal));
    
    let mut keep_mask = vec![false; n];
    keep_mask[0] = true; // Always keep DC
    for &idx in indices.iter().take(top_k + 1) { // +1 for DC
        keep_mask[idx] = true;
    }
    
    // Reconstruct manually for extrapolation (sum of cosines)
    // x[t] = (1/N) * sum(X[k] * exp(i*2*pi*k*t/N))
    // Note: rustfft produces unnormalized output, so we divide by N.
    
    let kept_indices: Vec<usize> = indices.into_iter().take(top_k + 1).collect();
    let mut output = Vec::with_capacity(period);
    
    for t in 0..period {
        let t_idx = n + t;
        let mut sum = Complex::new(0.0, 0.0);
        
        for &k in &kept_indices {
            let angle = 2.0 * PI * (k as f64) * (t_idx as f64) / (n as f64);
            let val = buffer[k] * Complex::from_polar(1.0, angle);
            sum = sum + val;
        }
        
        output.push(sum.re / (n as f64));
    }
    
    output
}

// -----------------------------------------------------------------------------
// Main Prediction Function
// -----------------------------------------------------------------------------

pub fn predict_boris_gan(
    data: &[StockData],
    last_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 100 {
        return Err("Insufficient data (need 100+)".to_string());
    }

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let n = closes.len();

    // 1. Calculate Indicators
    let hurst = calculate_hurst_exponent(&closes);
    let rsi = calculate_rsi(&closes, 14).last().copied().unwrap_or(50.0);
    let macd = calculate_macd(&closes, 12, 26, 9).histogram.last().copied().unwrap_or(0.0);
    let obv = calculate_obv(data);
    let cci = calculate_cci(data, 20).last().copied().unwrap_or(0.0);
    let _atr = calculate_atr(data, 14).last().copied().unwrap_or(0.0);
    
    // Bollinger Width
    let bb = calculate_bollinger_bands(&closes, 20, 2.0);
    let bb_w = if let (Some(u), Some(l), Some(m)) = (bb.upper.last(), bb.lower.last(), bb.middle.last()) {
        if *m != 0.0 { (u - l) / m } else { 0.0 }
    } else { 0.0 };

    // 2. Rolling Window Backtest for Residuals (Empirical Distribution)
    // We use the last 60 days to estimate the error of our trend model
    let backtest_window = 60;
    let mut residuals = Vec::with_capacity(backtest_window);
    
    // Limit backtest to available data
    let start_idx = n.saturating_sub(backtest_window + 30); // Need some history for training
    
    for i in start_idx..n {
        let train_slice = &closes[0..i];
        let actual = closes[i];
        
        // Simple AR prediction for speed in backtest
        // Note: Full FFT in backtest might be too slow if loop is large, 
        // but for 60 points it's fine. We'll use AR(5) as a proxy for trend error.
        if let Some(ar) = ArModel::fit(train_slice, 5) {
            let pred = ar.predict(train_slice);
            let res = actual - pred;
            residuals.push(res);
        }
    }
    
    if residuals.is_empty() { residuals.push(0.0); }
    let std_resid = calculate_std_dev(&residuals);

    // 3. Generate Future Trends
    
    // A. FFT Trend
    let top_k = if hurst > 0.6 { 20 } else { 10 }; // More components for trending
    let fft_trend = calculate_fft_trend(&closes, period, top_k);
    
    // B. ARIMA Trend
    let ar_model = ArModel::fit(&closes, 5).ok_or("Failed to fit AR model")?;
    let mut ar_trend = Vec::new();
    let mut ar_history = closes.clone();
    for _ in 0..period {
        let pred = ar_model.predict(&ar_history);
        ar_trend.push(pred);
        ar_history.push(pred);
    }

    // C. Deep Learning Trend (Enhanced)
    let dl_predictions = predict_deep_learning(data, last_date, period).ok();
    let dl_trend: Option<Vec<f64>> = dl_predictions.map(|res| res.iter().map(|r| r.predicted_price).collect());

    // 4. Combine & Simulate (Monte Carlo)
    // Dynamic num_paths based on volatility: higher volatility needs more simulations
    let base_paths = 100;
    let volatility_factor = (bb_w * 10.0).min(3.0).max(0.5); // Scale volatility to 0.5-3.0
    let num_paths = (base_paths as f64 * volatility_factor) as usize;
    let num_paths = num_paths.max(50).min(500); // Clamp between 50 and 500
    let mut final_paths = vec![vec![0.0; period]; num_paths];
    let last_close = *closes.last().unwrap();

    for p in 0..num_paths {
        let mut current_val = last_close;
        
        for t in 0..period {
            // Trend Component (Weighted Average)
            // Weight FFT more in long term, AR in short term?
            // Actually, let's just average them.
            
            let calculate_trend_val = |idx: usize| -> f64 {
                let base = (fft_trend[idx] + ar_trend[idx]) / 2.0;
                if let Some(ref dl) = dl_trend {
                     // Give Deep Learning 50% weight if available, as it is smarter
                    (base + dl[idx]) / 2.0
                } else {
                    base
                }
            };

            let trend_current = calculate_trend_val(t);
            let trend_prev = if t == 0 { last_close } else { calculate_trend_val(t - 1) };
            
            let trend_step = trend_current - trend_prev;
            
            // Bias Component
            let mut bias = 0.0;
            // RSI Mean Reversion
            if rsi > 70.0 { bias -= 0.001 * last_close; }
            if rsi < 30.0 { bias += 0.001 * last_close; }
            // MACD Momentum
            if macd > 0.0 { bias += 0.001 * last_close; }
            // CCI Reversion
            if cci > 100.0 { bias -= 0.001 * last_close; }
            if cci < -100.0 { bias += 0.001 * last_close; }
            // OBV Trend Confirmation (Slope of last 5 days)
            let obv_slope = if obv.len() > 5 {
                obv[obv.len()-1] - obv[obv.len()-5]
            } else { 0.0 };
            if obv_slope > 0.0 { bias += 0.0005 * last_close; }
            
            // Decay bias
            bias *= (-0.1 * t as f64).exp();
            
            // Noise from Empirical Residuals
            let mut rng = rand::thread_rng();
            let random_idx = rng.gen_range(0..residuals.len());
            let empirical_noise = residuals[random_idx];
            
            // Scale noise by sqrt(t) and volatility regime
            let noise_scale = (1.0 + t as f64).sqrt() * (if bb_w < 0.1 { 1.5 } else { 1.0 }); // Breakout potential
            let noise = empirical_noise * noise_scale * 0.5; // Damping slightly
            
            let change = trend_step + bias + noise;
            current_val += change;
            
            if current_val < 0.01 { current_val = 0.01; }
            final_paths[p][t] = current_val;
        }
    }

    // 5. Aggregate Results
    let mut predictions: Vec<PredictionResult> = Vec::new();
    let mut current_date = parse_date(last_date);

    // Generate Reasoning String
    let regime_desc = if hurst > 0.6 { "Trending" } else if hurst < 0.4 { "Mean Reversion" } else { "Random Walk" };
    let vol_desc = if bb_w < 0.1 { "Low (Squeeze)" } else if bb_w > 0.3 { "High" } else { "Normal" };
    
    let mut tech_signals = Vec::new();
    if rsi > 70.0 { tech_signals.push("RSI Overbought"); }
    else if rsi < 30.0 { tech_signals.push("RSI Oversold"); }
    
    if macd > 0.0 { tech_signals.push("MACD Bullish"); }
    else { tech_signals.push("MACD Bearish"); }
    
    if cci > 100.0 { tech_signals.push("CCI High"); }
    else if cci < -100.0 { tech_signals.push("CCI Low"); }

    let tech_desc = if tech_signals.is_empty() { "Neutral".to_string() } else { tech_signals.join(", ") };

    let reasoning = format!(
        "Market Regime: {} (Hurst: {:.2}). Volatility: {}. Tech: {}. Model: Hybrid Ensemble (DL + FFT + AR) with Monte Carlo.",
        regime_desc, hurst, vol_desc, tech_desc
    );

    for t in 0..period {
        current_date = current_date + chrono::Duration::days(1);
        
        let mut prices: Vec<f64> = final_paths.iter().map(|path| path[t]).collect();
        prices.sort_by(|a, b| a.partial_cmp(b).unwrap());
        
        // Median as prediction
        let predicted_price = prices[num_paths / 2];
        
        // Confidence Interval from Quantiles (e.g., 5th and 95th percentile)
        let lower = prices[(num_paths as f64 * 0.05) as usize];
        let upper = prices[(num_paths as f64 * 0.95) as usize];
        
        let prev_val = if t == 0 { last_close } else { predictions[t-1].predicted_price };
        let signal = if predicted_price > prev_val * 1.002 { "buy" }
                    else if predicted_price < prev_val * 0.998 { "sell" }
                    else { "hold" };

        predictions.push(PredictionResult {
            date: current_date.format("%Y-%m-%d").to_string(),
            predicted_price,
            confidence: (1.0 - std_resid / last_close * 10.0).max(0.1).min(0.99) * 100.0,
            signal: signal.to_string(),
            upper_bound: upper,
            lower_bound: lower,
            method: format!("GAN-Hybrid (H:{:.2}, DL+FFT+AR)", hurst),
            reasoning: Some(reasoning.clone()),
        });
    }

    Ok(predictions)
}

fn parse_date(date_str: &str) -> chrono::NaiveDate {
    let clean_str = date_str.split(' ').next().unwrap_or(date_str);
    chrono::NaiveDate::parse_from_str(clean_str, "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Local::now().date_naive())
}

// Helpers
fn calculate_mean(data: &[f64]) -> f64 {
    if data.is_empty() { return 0.0; }
    data.iter().sum::<f64>() / data.len() as f64
}

fn calculate_std_dev(data: &[f64]) -> f64 {
    if data.len() < 2 { return 0.0; }
    let mean = calculate_mean(data);
    let variance = data.iter().map(|value| (mean - value).powi(2)).sum::<f64>() / (data.len() - 1) as f64;
    variance.sqrt()
}

fn calculate_hurst_exponent(data: &[f64]) -> f64 {
    let n = data.len();
    if n < 20 { return 0.5; }
    let mut returns = Vec::with_capacity(n-1);
    for i in 1..n { returns.push((data[i] / data[i-1]).ln()); }
    let mean_ret = calculate_mean(&returns);
    let std_dev = calculate_std_dev(&returns);
    if std_dev == 0.0 { return 0.5; }
    let y: Vec<f64> = returns.iter().map(|&r| r - mean_ret).collect();
    let mut z = Vec::with_capacity(y.len());
    let mut current_sum = 0.0;
    for val in &y { current_sum += val; z.push(current_sum); }
    let max_z = z.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));
    let min_z = z.iter().fold(f64::INFINITY, |a, &b| a.min(b));
    let rs = (max_z - min_z) / std_dev;
    (rs.ln() / (n as f64).ln()).max(0.0).min(1.0)
}
