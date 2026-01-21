use crate::stock_api::{calculate_indicators, predict_stock_price as api_predict_stock_price, ai_analyze_stock as api_ai_analyze_stock, StockData, StockQuote, TechnicalIndicators};

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
