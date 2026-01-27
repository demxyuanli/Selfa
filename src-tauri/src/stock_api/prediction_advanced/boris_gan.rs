use crate::stock_api::types::{StockData, PredictionResult};
use crate::stock_api::utils::calculate_volatility;
use crate::stock_api::technical_indicators::{calculate_rsi, calculate_macd};
use std::f64::consts::PI;

/// Implementation of a prediction strategy inspired by Boris Banushev's "Stock Prediction AI"
/// Ref: https://github.com/borisbanushev/stockpredictionai
/// Key components simulated:
/// 1. Fourier Transform for long-term trend extraction (denoising).
/// 2. Technical Indicators (RSI, MACD) for feature engineering.
/// 3. Generative process (Simulated GAN) constrained by Volatility (Discriminator).

#[derive(Clone, Debug)]
struct Complex {
    re: f64,
    im: f64,
}

impl Complex {
    fn new(re: f64, im: f64) -> Self {
        Self { re, im }
    }
    
    fn add(&self, other: &Complex) -> Complex {
        Complex::new(self.re + other.re, self.im + other.im)
    }
    
    fn mul(&self, other: &Complex) -> Complex {
        Complex::new(
            self.re * other.re - self.im * other.im,
            self.re * other.im + self.im * other.re
        )
    }
    
    fn magnitude(&self) -> f64 {
        (self.re * self.re + self.im * self.im).sqrt()
    }
    
    #[allow(dead_code)]
    fn phase(&self) -> f64 {
        self.im.atan2(self.re)
    }
    
    fn from_polar(r: f64, theta: f64) -> Complex {
        Complex::new(r * theta.cos(), r * theta.sin())
    }
}

// Simple Discrete Fourier Transform
fn dft(signal: &[f64]) -> Vec<Complex> {
    let n = signal.len();
    let mut output = Vec::with_capacity(n);
    for k in 0..n {
        let mut sum = Complex::new(0.0, 0.0);
        for t in 0..n {
            let angle = -2.0 * PI * (t as f64) * (k as f64) / (n as f64);
            let c = Complex::from_polar(1.0, angle);
            let val = Complex::new(signal[t], 0.0);
            sum = sum.add(&val.mul(&c));
        }
        output.push(sum);
    }
    output
}

// Inverse DFT (Simulated for extrapolation)
// We only use the top `k` components to reconstruct the trend
fn idft_extrapolate(spectrum: &[Complex], n_original: usize, n_future: usize, top_k: usize) -> Vec<f64> {
    let mut output = Vec::with_capacity(n_future);
    
    // Filter: Sort indices by magnitude
    let mut indices: Vec<usize> = (0..spectrum.len()).collect();
    indices.sort_by(|&a, &b| spectrum[b].magnitude().partial_cmp(&spectrum[a].magnitude()).unwrap());
    
    // Keep top K + DC component (index 0 usually)
    // Ensure index 0 is always included if not in top K (though usually it is the largest)
    let mut keep_indices = Vec::new();
    keep_indices.push(0); 
    for &idx in indices.iter().take(top_k) {
        if idx != 0 {
            keep_indices.push(idx);
        }
    }

    for t in n_original..(n_original + n_future) {
        let mut sum = Complex::new(0.0, 0.0);
        
        // Reconstruct using only top K components (Low-pass filter / Trend)
        for &k in &keep_indices {
            let angle = 2.0 * PI * (t as f64) * (k as f64) / (n_original as f64);
            let c = Complex::from_polar(1.0, angle);
            let val = spectrum[k].mul(&c);
            sum = sum.add(&val);
        }
        
        // Normalize by N
        output.push(sum.re / (n_original as f64));
    }
    output
}

pub fn predict_boris_gan(
    data: &[StockData],
    last_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 50 {
        return Err("Insufficient data for Boris GAN prediction (need 50+)".to_string());
    }

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let n = closes.len();

    // 1. Fourier Transform for Trend Extraction
    // Use top components to capture the main wave
    let spectrum = dft(&closes);
    // Use top 10% of components or at least 5, max 20
    let top_k = (n / 10).max(5).min(20);
    let fourier_trend = idft_extrapolate(&spectrum, n, period, top_k);

    // 2. Technical Indicators (Feature Engineering)
    // We use recent indicators to bias the trend
    let rsi_vec = calculate_rsi(&closes, 14);
    let rsi = rsi_vec.last().copied().unwrap_or(50.0);
    
    let macd_res = calculate_macd(&closes, 12, 26, 9);
    let macd_hist = macd_res.histogram.last().copied().unwrap_or(0.0);
    
    // Recent volatility for confidence intervals
    let volatility = calculate_volatility(&closes, 20);

    // 3. Generative Process (Simulated)
    // Combine Fourier trend with Technical bias and Random Walk
    
    let last_close = *closes.last().unwrap();
    let mut predictions: Vec<PredictionResult> = Vec::new();
    let mut current_date = parse_date(last_date);

    for i in 0..period {
        current_date = current_date + chrono::Duration::days(1);
        let date_str = current_date.format("%Y-%m-%d").to_string();

        // Base: Fourier Trend
        let fourier_val = fourier_trend[i];
        
        // Bias: Technicals
        // If RSI is high (>70), bias down. If low (<30), bias up.
        let rsi_bias = if rsi > 70.0 { -0.002 } else if rsi < 30.0 { 0.002 } else { 0.0 };
        // If MACD Hist is positive, bias up.
        let macd_bias = if macd_hist > 0.0 { 0.001 } else { -0.001 };
        
        // Combine
        // We blend the last close projected forward with the Fourier trend
        // As time goes on, Fourier trend weight increases? 
        // Actually Fourier is the "Long Term Memory"
        
        let _trend_diff = fourier_val - last_close; // Difference from start
        // Scale trend diff by time to smooth transition? 
        // For simplicity, we just use the Fourier delta step
        let fourier_step = if i > 0 { fourier_trend[i] - fourier_trend[i-1] } else { fourier_trend[i] - last_close };
        
        // Generative Step:
        // Prediction = Previous + FourierStep + TechnicalBias + Noise
        let prev_val = if i == 0 { last_close } else { predictions[i-1].predicted_price };
        
        // Damping factor for bias over time (technicals fade)
        let decay = (-0.1 * (i as f64)).exp();
        
        let predicted_change = fourier_step + (rsi_bias + macd_bias) * last_close * decay;
        
        // "Discriminator" / Volatility constraint
        // We assume the move shouldn't exceed 2 * volatility in one step normally
        let max_move = last_close * volatility * 2.0;
        let clamped_change = predicted_change.max(-max_move).min(max_move);
        
        let mut predicted_price = prev_val + clamped_change;
        
        // Ensure non-negative
        if predicted_price < 0.0 { predicted_price = 0.01; }

        // Confidence & Bounds
        // Width expands with time (sqrt of time)
        let uncertainty = volatility * last_close * ((i + 1) as f64).sqrt();
        let upper = predicted_price + uncertainty * 1.96;
        let lower = predicted_price - uncertainty * 1.96;
        
        // Signal
        let signal = if predicted_price > prev_val * 1.005 { "buy" } 
                    else if predicted_price < prev_val * 0.995 { "sell" } 
                    else { "hold" };

        predictions.push(PredictionResult {
            date: date_str,
            predicted_price,
            confidence: (1.0 - volatility * 10.0).max(0.1).min(0.95) * 100.0, // Rough confidence
            signal: signal.to_string(),
            upper_bound: upper,
            lower_bound: lower,
            method: "boris_gan_hybrid".to_string(),
        });
    }

    Ok(predictions)
}

fn parse_date(date_str: &str) -> chrono::NaiveDate {
    // Handle "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD"
    let clean_str = date_str.split(' ').next().unwrap_or(date_str);
    chrono::NaiveDate::parse_from_str(clean_str, "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Local::now().date_naive())
}
