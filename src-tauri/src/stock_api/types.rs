use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StockQuote {
    pub symbol: String,
    pub name: String,
    pub price: f64,
    pub change: f64,
    pub change_percent: f64,
    pub volume: i64,
    pub market_cap: Option<i64>,
    pub pe_ratio: Option<f64>,
    pub turnover: Option<i64>,
    pub high: f64,
    pub low: f64,
    pub open: f64,
    pub previous_close: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StockData {
    pub date: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StockInfo {
    pub symbol: String,
    pub name: String,
    pub exchange: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TechnicalIndicators {
    pub sma_20: Vec<f64>,
    pub sma_50: Vec<f64>,
    pub ema_12: Vec<f64>,
    pub ema_26: Vec<f64>,
    pub rsi: Vec<f64>,
    pub macd: Vec<f64>,
    pub macd_signal: Vec<f64>,
    pub macd_histogram: Vec<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PredictionResult {
    pub date: String,
    pub predicted_price: f64,
    pub confidence: f64,
    pub signal: String,
    pub upper_bound: f64,
    pub lower_bound: f64,
    pub method: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIAnalysisResult {
    pub analysis: String,
    pub prediction: AIPrediction,
    pub risk_assessment: AIRiskAssessment,
    pub recommendations: Vec<String>,
    pub technical_summary: AITechnicalSummary,
    pub price_targets: Vec<AIPriceTarget>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIPrediction {
    pub price: f64,
    pub confidence: f64,
    pub trend: String,
    pub reasoning: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIRiskAssessment {
    pub level: String,
    pub factors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AITechnicalSummary {
    pub indicators: Vec<AIIndicator>,
    pub overall_signal: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIIndicator {
    pub name: String,
    pub value: f64,
    pub signal: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIPriceTarget {
    pub period: String,
    pub target: f64,
    pub probability: f64,
}
