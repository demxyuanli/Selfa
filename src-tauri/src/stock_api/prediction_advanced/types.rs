// 共享类型和接口定义

use crate::stock_api::types::{StockData, PredictionResult};

#[derive(Debug, Clone)]
pub struct PredictionMethod {
    pub name: String,
    pub description: String,
    pub weight: f64,
    pub min_data_points: usize,
}

impl PredictionMethod {
    pub fn new(name: &str, description: &str, weight: f64, min_data_points: usize) -> Self {
        PredictionMethod {
            name: name.to_string(),
            description: description.to_string(),
            weight,
            min_data_points,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PredictionContext {
    pub data: Vec<StockData>,
    pub start_date: String,
    pub period: usize,
    pub available_methods: Vec<PredictionMethod>,
}

impl PredictionContext {
    pub fn new(data: Vec<StockData>, start_date: String, period: usize) -> Self {
        let available_methods = vec![
            PredictionMethod::new("linear", "Linear Regression", 0.15, 10),
            PredictionMethod::new("ma", "Moving Average", 0.15, 10),
            PredictionMethod::new("technical", "Technical Indicators", 0.20, 20),
            PredictionMethod::new("hurst", "Hurst Exponent", 0.25, 30),
            PredictionMethod::new("support_resistance", "Support & Resistance", 0.25, 30),
            PredictionMethod::new("monte_carlo", "Monte Carlo", 0.20, 20),
            PredictionMethod::new("ensemble", "Ensemble", 0.30, 30),
        ];

        PredictionContext {
            data,
            start_date,
            period,
            available_methods,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.data.is_empty() {
            return Err("No data provided".to_string());
        }

        if self.period == 0 {
            return Err("Period must be greater than 0".to_string());
        }

        Ok(())
    }
}

// 预测评估指标
#[derive(Debug, Clone)]
pub struct PredictionAccuracy {
    pub method_name: String,
    pub mae: f64,
    pub rmse: f64,
    pub direction_accuracy: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone)]
pub struct EnsembleConfig {
    pub methods: Vec<String>,
    pub weights: Vec<f64>,
    pub use_dynamic_weights: bool,
    pub outlier_threshold: f64,
}

impl Default for EnsembleConfig {
    fn default() -> Self {
        EnsembleConfig {
            methods: vec![
                "linear".to_string(),
                "ma".to_string(),
                "technical".to_string(),
                "hurst".to_string(),
                "support_resistance".to_string(),
            ],
            weights: vec![0.15, 0.15, 0.20, 0.25, 0.25],
            use_dynamic_weights: true,
            outlier_threshold: 2.5,
        }
    }
}

// 高级配置选项
#[derive(Debug, Clone)]
pub struct AdvancedPredictionConfig {
    pub ensemble_config: EnsembleConfig,
    pub monte_carlo_simulations: usize,
    pub use_garch_volatility: bool,
    pub fibonacci_retracement_levels: Vec<f64>,
    pub support_resistance_lookback: usize,
    pub hurst_exponent_min_period: usize,
}

impl Default for AdvancedPredictionConfig {
    fn default() -> Self {
        AdvancedPredictionConfig {
            ensemble_config: EnsembleConfig::default(),
            monte_carlo_simulations: 1000,
            use_garch_volatility: false,
            fibonacci_retracement_levels: vec![0.236, 0.382, 0.5, 0.618, 0.786],
            support_resistance_lookback: 60,
            hurst_exponent_min_period: 30,
        }
    }
}