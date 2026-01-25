use crate::stock_api::{
    calculate_indicators, 
    predict_stock_price as api_predict_stock_price,
    predict_stock_price_with_config as api_predict_stock_price_with_config,
    ai_analyze_stock as api_ai_analyze_stock, 
    backtest::{run_backtest as api_run_backtest, BacktestConfig, BacktestResult},
    analysis_intraday::{analyze_intraday_data, IntradayAnalysisResult},
    StockData, StockQuote, TechnicalIndicators, PredictionConfig
};

#[tauri::command]
pub fn run_backtest_command(data: Vec<StockData>, config: BacktestConfig) -> Result<BacktestResult, String> {
    api_run_backtest(&data, config)
}

#[tauri::command]
pub fn calculate_technical_indicators(data: Vec<StockData>) -> Result<TechnicalIndicators, String> {
    Ok(calculate_indicators(data))
}

#[tauri::command]
pub fn predict_stock_price(
    data: Vec<StockData>,
    method: String,
    period: usize,
) -> Result<Vec<crate::stock_api::PredictionResult>, String> {
    api_predict_stock_price(&data, &method, period)
}

#[tauri::command]
pub fn predict_stock_price_with_config(
    data: Vec<StockData>,
    config: PredictionConfig,
) -> Result<Vec<crate::stock_api::PredictionResult>, String> {
    api_predict_stock_price_with_config(&data, &config)
}

#[tauri::command]
pub async fn ai_analyze_stock(
    symbol: String,
    data: Vec<StockData>,
    quote: Option<StockQuote>,
    api_key: Option<String>,
    model: String,
    use_local_fallback: bool,
) -> Result<crate::stock_api::AIAnalysisResult, String> {
    api_ai_analyze_stock(
        &symbol,
        &data,
        quote.as_ref(),
        api_key.as_deref(),
        &model,
        use_local_fallback,
    )
    .await
}

#[tauri::command]
pub fn get_intraday_analysis(data: Vec<StockData>) -> Result<IntradayAnalysisResult, String> {
    Ok(analyze_intraday_data(&data))
}
