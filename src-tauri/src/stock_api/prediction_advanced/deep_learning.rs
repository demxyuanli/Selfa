use crate::stock_api::types::{StockData, PredictionResult};
use crate::stock_api::utils::{parse_date, add_days};
use ndarray::{Array1, Array2, Axis};
use ndarray_rand::RandomExt;
use ndarray_rand::rand_distr::Uniform;
use rand::seq::SliceRandom;
use rand::thread_rng;

// Use FFT from boris_gan to enhance features (Hybrid Approach)
use super::boris_gan::calculate_fft_trend;

/// Configuration for the Deep Learning Model
struct DLConfig {
    input_size: usize,
    hidden_layers: Vec<usize>,
    learning_rate: f64,
    epochs: usize,
    batch_size: usize,
    l2_reg: f64,
    early_stop_patience: usize,
}

impl Default for DLConfig {
    fn default() -> Self {
        Self {
            input_size: 63, // 30 (Price) + 30 (FFT) + 3 (Algo Features)
            hidden_layers: vec![128, 64],
            learning_rate: 0.005,
            epochs: 300,
            batch_size: 16,
            l2_reg: 0.0001, // L2 regularization coefficient
            early_stop_patience: 20, // Stop if no improvement for 20 epochs
        }
    }
}

/// Calculate Momentum (Avg change over window)
fn calculate_momentum(data: &[f64]) -> f64 {
    if data.len() < 2 { return 0.0; }
    let changes: Vec<f64> = data.windows(2).map(|w| w[1] - w[0]).collect();
    changes.iter().sum::<f64>() / changes.len() as f64
}

/// Calculate Trend (Slope between start and end of window)
fn calculate_trend(data: &[f64]) -> f64 {
    if data.len() < 2 { return 0.0; }
    (data[data.len() - 1] - data[0]) / data.len() as f64
}

/// Calculate Volatility (Mean Absolute Deviation)
fn calculate_volatility(data: &[f64]) -> f64 {
    if data.len() < 2 { return 0.0; }
    let mean = data.iter().sum::<f64>() / data.len() as f64;
    data.iter().map(|x| (x - mean).abs()).sum::<f64>() / data.len() as f64
}

/// Simple Dense Layer with ReLU activation
struct DenseLayer {
    weights: Array2<f64>,
    biases: Array1<f64>,
    inputs: Option<Array2<f64>>,
    z: Option<Array2<f64>>, // Pre-activation
}

impl DenseLayer {
    fn new(input_size: usize, output_size: usize) -> Self {
        // Xavier/Glorot Initialization
        let limit = (6.0 / (input_size + output_size) as f64).sqrt();
        let weights = Array2::random((input_size, output_size), Uniform::new(-limit, limit));
        let biases = Array1::zeros(output_size);
        
        Self { weights, biases, inputs: None, z: None }
    }

    fn forward(&mut self, input: &Array2<f64>) -> Array2<f64> {
        self.inputs = Some(input.clone());
        let z = input.dot(&self.weights) + &self.biases;
        self.z = Some(z.clone());
        // ReLU Activation
        z.mapv(|x| if x > 0.0 { x } else { 0.0 })
    }
    
    // For output layer (Linear activation)
    fn forward_linear(&mut self, input: &Array2<f64>) -> Array2<f64> {
        self.inputs = Some(input.clone());
        let z = input.dot(&self.weights) + &self.biases;
        self.z = Some(z.clone());
        z
    }
}

/// Multi-Layer Perceptron for Time Series
struct MLP {
    layers: Vec<DenseLayer>,
    output_layer: DenseLayer,
}

impl MLP {
    fn new(config: &DLConfig) -> Self {
        let mut layers = Vec::new();
        let mut input_dim = config.input_size;
        
        for &hidden_dim in &config.hidden_layers {
            layers.push(DenseLayer::new(input_dim, hidden_dim));
            input_dim = hidden_dim;
        }
        
        let output_layer = DenseLayer::new(input_dim, 1);
        
        Self { layers, output_layer }
    }
    
    fn forward(&mut self, input: &Array2<f64>) -> Array2<f64> {
        let mut current_input = input.clone();
        
        for layer in &mut self.layers {
            current_input = layer.forward(&current_input);
        }
        
        self.output_layer.forward_linear(&current_input)
    }
    
    // Backward pass (Backpropagation) with L2 regularization
    fn backward(&mut self, target: &Array2<f64>, learning_rate: f64, l2_reg: f64) {
        // 1. Output Layer Gradient
        // MSE Loss derivative: 2 * (Output - Target) / N
        let output = self.output_layer.z.as_ref().unwrap();
        let batch_size = target.nrows() as f64;
        
        let d_output = (output - target) * (2.0 / batch_size);
        
        // Update Output Layer with L2 regularization
        let input_t = self.output_layer.inputs.as_ref().unwrap().t();
        let d_weights = input_t.dot(&d_output);
        let d_biases = d_output.sum_axis(Axis(0));
        
        // Add L2 regularization gradient: lambda * weights
        let l2_grad = &self.output_layer.weights * l2_reg;
        self.output_layer.weights = &self.output_layer.weights - &((d_weights + l2_grad) * learning_rate);
        self.output_layer.biases = &self.output_layer.biases - &(d_biases * learning_rate);
        
        // Backpropagate to hidden layers
        let mut d_next = d_output.dot(&self.output_layer.weights.t());
        
        for layer in self.layers.iter_mut().rev() {
            // ReLU Derivative: 1 if z > 0 else 0
            let z = layer.z.as_ref().unwrap();
            let d_relu = z.mapv(|x| if x > 0.0 { 1.0 } else { 0.0 });
            let d_z = &d_next * &d_relu;
            
            let input_t = layer.inputs.as_ref().unwrap().t();
            let d_weights = input_t.dot(&d_z);
            let d_biases = d_z.sum_axis(Axis(0));
            
            // Calculate error for next layer (previous in forward pass)
            d_next = d_z.dot(&layer.weights.t());
            
            // Add L2 regularization gradient
            let l2_grad = &layer.weights * l2_reg;
            // Update weights
            layer.weights = &layer.weights - &((d_weights + l2_grad) * learning_rate);
            layer.biases = &layer.biases - &(d_biases * learning_rate);
        }
    }
    
    // Calculate loss for early stopping
    fn calculate_loss(&mut self, input: &Array2<f64>, target: &Array2<f64>) -> f64 {
        let output = self.forward(input);
        let batch_size = target.nrows() as f64;
        let mse = (&output - target).mapv(|x| x.powi(2)).sum() / batch_size;
        mse
    }
}

// -----------------------------------------------------------------------------
// Data Preprocessing
// -----------------------------------------------------------------------------

struct Scaler {
    min: f64,
    max: f64,
}

impl Scaler {
    fn fit(data: &[f64]) -> Self {
        let min = data.iter().fold(f64::INFINITY, |a, &b| a.min(b));
        let max = data.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));
        Self { min, max }
    }
    
    fn transform(&self, data: &[f64]) -> Vec<f64> {
        let range = self.max - self.min;
        if range == 0.0 { return vec![0.5; data.len()]; }
        data.iter().map(|&x| (x - self.min) / range).collect()
    }
    
    fn inverse_transform_scalar(&self, val: f64) -> f64 {
        val * (self.max - self.min) + self.min
    }
}

// -----------------------------------------------------------------------------
// Main Prediction Function
// -----------------------------------------------------------------------------

pub fn predict_deep_learning(
    data: &[StockData],
    last_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 100 {
        return Err("Deep Learning requires at least 100 data points".to_string());
    }
    
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    
    // 1. Preprocessing
    let scaler = Scaler::fit(&closes);
    let normalized_data = scaler.transform(&closes);
    
    // 2. Prepare Training Data (Sliding Window + FFT Features + Algo Features)
    let config = DLConfig::default();
    let lookback = 30; // Raw price lookback
    let fft_top_k = 5; // FFT components
    let fft_window = 30; // Window size for FFT calculation (Matched to lookback for alignment)
    
    let mut x_train = Vec::new();
    let mut y_train = Vec::new();
    
    // We need enough history
    let start_idx = fft_window.max(lookback).max(20); // Ensure enough data for momentum/trend
    
    for i in start_idx..normalized_data.len().saturating_sub(1) {
        // 1. Price Window Features
        let price_window = &normalized_data[i.saturating_sub(lookback)..i];
        if price_window.len() != lookback { continue; }

        // 2. FFT Features (Algorithm Combination)
        let fft_input_slice = &normalized_data[i.saturating_sub(fft_window)..i];
        let fft_features = calculate_fft_trend(fft_input_slice, fft_window, fft_top_k);
        
        // Normalize FFT features
        let max_val = fft_input_slice.iter().fold(0.0f64, |a, &b| a.max(b)).max(1.0);
        let fft_normalized: Vec<f64> = fft_features.iter().map(|&x| x / max_val).collect();

        // 3. Algorithmic Features (From Local Simulation)
        // Momentum (last 20)
        let momentum_slice = &normalized_data[i.saturating_sub(20)..i];
        let momentum = calculate_momentum(momentum_slice);
        
        // Trend (last 20)
        let trend = calculate_trend(momentum_slice);
        
        // Volatility (last 10)
        let vol_slice = &normalized_data[i.saturating_sub(10)..i];
        let volatility = calculate_volatility(vol_slice);

        // Combine Features
        let mut features = price_window.to_vec();
        features.extend(fft_normalized);
        features.push(momentum);
        features.push(trend);
        features.push(volatility);

        // Target
        let target = normalized_data[i];
        
        if features.len() == config.input_size {
            x_train.push(features);
            y_train.push(target);
        }
    }
    
    let num_samples = x_train.len();
    if num_samples < 10 {
        return Err("Insufficient training samples".to_string());
    }
    
    // Convert to Array2
    let x_train_array = Array2::from_shape_vec((num_samples, config.input_size), x_train.into_iter().flatten().collect()).unwrap();
    let y_train_array = Array2::from_shape_vec((num_samples, 1), y_train).unwrap();
    
    // 3. Train Model with Early Stopping
    let mut model = MLP::new(&config);
    let mut rng = thread_rng();
    
    // Simple Batch Training with early stopping
    let indices: Vec<usize> = (0..num_samples).collect();
    
    // Split data for validation (last 20% for validation)
    let val_split = (num_samples as f64 * 0.8) as usize;
    let train_indices: Vec<usize> = indices[..val_split].to_vec();
    let val_indices: Vec<usize> = indices[val_split..].to_vec();
    
    // Prepare validation set
    let mut x_val_vec = Vec::new();
    let mut y_val_vec = Vec::new();
    for &idx in &val_indices {
        x_val_vec.extend_from_slice(x_train_array.row(idx).as_slice().unwrap());
        y_val_vec.push(y_train_array[[idx, 0]]);
    }
    let x_val = Array2::from_shape_vec((val_indices.len(), config.input_size), x_val_vec).unwrap();
    let y_val = Array2::from_shape_vec((val_indices.len(), 1), y_val_vec).unwrap();
    
    let mut best_val_loss = f64::INFINITY;
    let mut patience_counter = 0;
    
    for _epoch in 0..config.epochs {
        let mut shuffled_indices = train_indices.clone();
        shuffled_indices.shuffle(&mut rng);
        
        for chunk in shuffled_indices.chunks(config.batch_size) {
            let batch_size = chunk.len();
            let mut x_batch_vec = Vec::with_capacity(batch_size * config.input_size);
            let mut y_batch_vec = Vec::with_capacity(batch_size);
            
            for &idx in chunk {
                x_batch_vec.extend_from_slice(x_train_array.row(idx).as_slice().unwrap());
                y_batch_vec.push(y_train_array[[idx, 0]]);
            }
            
            let x_batch = Array2::from_shape_vec((batch_size, config.input_size), x_batch_vec).unwrap();
            let y_batch = Array2::from_shape_vec((batch_size, 1), y_batch_vec).unwrap();
            
            // Forward
            model.forward(&x_batch);
            
            // Backward with L2 regularization
            model.backward(&y_batch, config.learning_rate, config.l2_reg);
        }
        
        // Early stopping check
        let val_loss = model.calculate_loss(&x_val, &y_val);
        if val_loss < best_val_loss {
            best_val_loss = val_loss;
            patience_counter = 0;
        } else {
            patience_counter += 1;
            if patience_counter >= config.early_stop_patience {
                // Early stop: no improvement for patience epochs
                break;
            }
        }
    }
    
    // 4. Predict Future
    // We maintain a rolling buffer of history for feature calculation
    // Max requirement is lookback=30, fft=30, momentum=20
    let mut history_buffer = normalized_data.clone();
    
    let mut results = Vec::new();
    let base_date = parse_date(last_date)?;
    
    for i in 1..=period {
        let len = history_buffer.len();
        
        // Extract Windows
        let price_window = &history_buffer[len.saturating_sub(lookback)..];
        let fft_window_slice = &history_buffer[len.saturating_sub(fft_window)..];
        let momentum_slice = &history_buffer[len.saturating_sub(20)..];
        let vol_slice = &history_buffer[len.saturating_sub(10)..];

        // 1. FFT Features
        let fft_features = calculate_fft_trend(fft_window_slice, fft_window, fft_top_k);
        let max_val = fft_window_slice.iter().fold(0.0f64, |a, &b| a.max(b)).max(1.0);
        let fft_normalized: Vec<f64> = fft_features.iter().map(|&x| x / max_val).collect();

        // 2. Algo Features
        let momentum = calculate_momentum(momentum_slice);
        let trend = calculate_trend(momentum_slice);
        let volatility = calculate_volatility(vol_slice);
        
        let last_known_price = price_window.last().copied().unwrap_or(0.0);

        // 3. Combine
        let mut features = price_window.to_vec();
        features.extend(fft_normalized);
        features.push(momentum);
        features.push(trend);
        features.push(volatility);
        
        let input_arr = Array2::from_shape_vec((1, config.input_size), features)
            .map_err(|e| e.to_string())?;
            
        let output = model.forward(&input_arr);
        let predicted_normalized = output[[0, 0]];
        let predicted_price = scaler.inverse_transform_scalar(predicted_normalized);
        
        // Update History
        history_buffer.push(predicted_normalized);

        let next_date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date: next_date,
            predicted_price: predicted_price,
            // Simple confidence based on inverse volatility
            confidence: (1.0 - volatility).max(0.1).min(0.99),
            signal: if predicted_price > scaler.inverse_transform_scalar(last_known_price) { "buy".to_string() } else { "sell".to_string() },
            reasoning: Some(format!("DL-Hybrid: Mom={:.3}, Trend={:.3}, Vol={:.3}", momentum, trend, volatility)),
            upper_bound: predicted_price * (1.0 + volatility),
            lower_bound: predicted_price * (1.0 - volatility),
            method: "deep_learning".to_string(),
        });
    }
    
    Ok(results)
}