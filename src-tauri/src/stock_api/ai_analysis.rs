use super::types::{StockData, StockQuote, PredictionResult, AIAnalysisResult};
use super::technical_indicators::{calculate_sma, calculate_ema, calculate_rsi, calculate_macd};
use super::prediction::{predict_linear_regression, predict_moving_average, predict_technical_indicator, predict_polynomial, predict_exponential_smoothing};
use super::prediction_advanced::predict_ensemble;
use super::ai_analysis_json::{extract_json_from_text, find_json_in_text, extract_analysis_text, patch_incomplete_ai_result, fix_json_common_issues, truncate_string_safe};
use super::ai_analysis_local::{generate_local_ai_analysis, create_fallback_analysis, format_recent_data};
use super::ai_api_config::{detect_api_provider, get_api_provider_config};
use std::collections::HashMap;

pub async fn ai_analyze_stock(
    symbol: &str,
    data: &[StockData],
    intraday_data: Option<&[StockData]>,
    quote: Option<&StockQuote>,
    api_key: Option<&str>,
    model: &str,
    use_local_fallback: bool,
) -> Result<AIAnalysisResult, String> {
    ai_analyze_stock_with_keys(
        symbol,
        data,
        intraday_data,
        quote,
        api_key,
        None,
        model,
        use_local_fallback,
    ).await
}

pub async fn ai_analyze_stock_with_keys(
    symbol: &str,
    data: &[StockData],
    intraday_data: Option<&[StockData]>,
    quote: Option<&StockQuote>,
    api_key: Option<&str>,
    api_keys: Option<&HashMap<String, String>>,
    model: &str,
    use_local_fallback: bool,
) -> Result<AIAnalysisResult, String> {
    if data.len() < 20 {
        return Err("Insufficient data for AI analysis".to_string());
    }

    let provider = detect_api_provider(model);
    if provider == "unknown" {
        return Err("Unsupported model".to_string());
    }

    let is_free_model = model.starts_with("groq:") || 
                       model.starts_with("llama") || 
                       model.starts_with("mixtral") ||
                       model.starts_with("gemini");
    
    let api_key_to_use = if let Some(keys_map) = api_keys {
        keys_map.get(provider).cloned()
    } else if let Some(key) = api_key {
        Some(key.to_string())
    } else {
        None
    };

    if api_key_to_use.is_none() && !is_free_model {
        if use_local_fallback {
            return generate_local_ai_analysis(symbol, data, quote);
        } else {
            return Err(format!("API key required for {} provider", provider));
        }
    }

    if api_key_to_use.is_none() && is_free_model {
        let error_msg = if model.starts_with("gemini") {
            "Gemini API requires a free API key. Please get one from https://makersuite.google.com/app/apikey".to_string()
        } else {
            "Free API models require a free API key. Please get one from the provider's website".to_string()
        };
        if use_local_fallback {
            return generate_local_ai_analysis(symbol, data, quote);
        } else {
            return Err(error_msg);
        }
    }

    let key = api_key_to_use.unwrap_or_default();
    if key.is_empty() && is_free_model {
        let error_msg = if model.starts_with("gemini") {
            "Gemini API requires a free API key. Please get one from https://makersuite.google.com/app/apikey".to_string()
        } else {
            "Free API models require a free API key. Please get one from the provider's website".to_string()
        };
        if use_local_fallback {
            return generate_local_ai_analysis(symbol, data, quote);
        } else {
            return Err(error_msg);
        }
    }

    match call_ai_api(symbol, data, intraday_data, quote, &key, model).await {
        Ok(result) => Ok(result),
        Err(e) => {
            eprintln!("AI API call failed: {}", e);
            if use_local_fallback {
                generate_local_ai_analysis(symbol, data, quote)
            } else {
                Err(format!("AI API error: {}", e))
            }
        }
    }
}

async fn call_ai_api(
    symbol: &str,
    data: &[StockData],
    intraday_data: Option<&[StockData]>,
    _quote: Option<&StockQuote>,
    api_key: &str,
    model: &str,
) -> Result<AIAnalysisResult, String> {
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = closes[closes.len() - 1];
    let last_date = data.last().map(|d| d.date.as_str()).unwrap_or("");
    let price_change = if closes.len() >= 2 {
        ((last_price - closes[closes.len() - 2]) / closes[closes.len() - 2]) * 100.0
    } else {
        0.0
    };

    // Calculate technical indicators
    let rsi = calculate_rsi(&closes, 14);
    let macd_result = calculate_macd(&closes, 12, 26, 9);
    let ma20 = calculate_sma(&closes, 20);
    let ma50 = calculate_sma(&closes, 50);
    let ema12 = calculate_ema(&closes, 12);
    let ema26 = calculate_ema(&closes, 26);

    let last_rsi = rsi.last().copied().unwrap_or(50.0);
    let last_macd = macd_result.macd.last().copied().unwrap_or(0.0);
    let last_signal = macd_result.signal.last().copied().unwrap_or(0.0);
    let last_ma20 = ma20.iter().rev().find(|&&x| x > 0.0).copied().unwrap_or(last_price);
    let last_ma50 = ma50.iter().rev().find(|&&x| x > 0.0).copied().unwrap_or(last_price);
    let last_ema12 = ema12.last().copied().unwrap_or(last_price);
    let last_ema26 = ema26.last().copied().unwrap_or(last_price);

    // Run multiple prediction methods to get comprehensive forecasts
    let prediction_periods = vec![5, 10, 20]; // 1 week, 2 weeks, 1 month
    let prediction_methods = vec!["linear", "ma", "technical", "polynomial", "ensemble", "exponential"];
    
    let mut prediction_summary = String::new();
    let mut all_predictions: Vec<f64> = Vec::new();
    
    for method in &prediction_methods {
        for &period in &prediction_periods {
            let predictions_result: Result<Vec<PredictionResult>, String> = match *method {
                "linear" => predict_linear_regression(&closes, last_date, period),
                "ma" => predict_moving_average(&closes, last_date, period),
                "technical" => predict_technical_indicator(&closes, last_date, period),
                "polynomial" => predict_polynomial(&closes, last_date, period),
                "exponential" => predict_exponential_smoothing(&closes, last_date, period),
                "ensemble" => predict_ensemble(data, last_date, period),
                _ => continue,
            };
            if let Ok(predictions) = predictions_result {
                let predictions: Vec<PredictionResult> = predictions;
                if let Some(last_pred) = predictions.last() {
                    all_predictions.push(last_pred.predicted_price);
                    let method_label = match *method {
                        "linear" => "?????",
                        "ma" => "????",
                        "technical" => "?????",
                        "polynomial" => "????",
                        "exponential" => "????",
                        "ensemble" => "????",
                        _ => method,
                    };
                    prediction_summary.push_str(&format!("- {} (", method_label));
                    prediction_summary.push_str(&format!("{}??: ", period));
                    prediction_summary.push_str(&format!("{:.2}, ", last_pred.predicted_price));
                    prediction_summary.push_str(&format!("???? {:.1}%", last_pred.confidence));
                    prediction_summary.push('\n');
                }
            }
        }
    }
    
    // Calculate prediction statistics
    let avg_prediction = if !all_predictions.is_empty() {
        all_predictions.iter().sum::<f64>() / all_predictions.len() as f64
    } else {
        last_price
    };
    let min_prediction = all_predictions.iter().copied().fold(last_price, f64::min);
    let max_prediction = all_predictions.iter().copied().fold(last_price, f64::max);
    let prediction_range = max_prediction - min_prediction;

    // Calculate additional technical indicators
    let _highs: Vec<f64> = data.iter().map(|d| d.high).collect();
    let _lows: Vec<f64> = data.iter().map(|d| d.low).collect();
    
    // Bollinger Bands
    let bb_period = 20;
    let bb_multiplier = 2.0;
    let mut bb_upper = Vec::new();
    let mut bb_middle = Vec::new();
    let mut bb_lower = Vec::new();
    
    // Ensure we have enough data for Bollinger Bands calculation
    if closes.len() >= bb_period {
        for i in bb_period - 1..closes.len() {
            let start = i.saturating_sub(bb_period - 1);
            let slice = &closes[start..=i];
            let mean = slice.iter().sum::<f64>() / slice.len() as f64;
            let variance = slice.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / slice.len() as f64;
            let std_dev = variance.sqrt();
            bb_middle.push(mean);
            bb_upper.push(mean + bb_multiplier * std_dev);
            bb_lower.push(mean - bb_multiplier * std_dev);
        }
    }
    let last_bb_upper = bb_upper.last().copied().unwrap_or(last_price * 1.05);
    let last_bb_lower = bb_lower.last().copied().unwrap_or(last_price * 0.95);
    
    // Volume analysis
    let volumes: Vec<f64> = data.iter().map(|d| d.volume as f64).collect();
    let avg_volume = volumes.iter().sum::<f64>() / volumes.len() as f64;
    let recent_volume = volumes.iter().rev().take(5).sum::<f64>() / 5.0;
    let volume_ratio = if avg_volume > 0.0 { recent_volume / avg_volume } else { 1.0 };

    let (intraday_summary, intraday_metrics) = if let Some(intraday) = intraday_data {
        if intraday.len() >= 5 {
            let intraday_closes: Vec<f64> = intraday.iter().map(|d| d.close).collect();
            let intraday_last_price = *intraday_closes.last().unwrap_or(&last_price);
            let intraday_change = if intraday_closes.len() >= 2 {
                ((intraday_last_price - intraday_closes[intraday_closes.len() - 2]) / intraday_closes[intraday_closes.len() - 2]) * 100.0
            } else {
                0.0
            };
            let intraday_last_date = intraday.last().map(|d| d.date.as_str()).unwrap_or("");
            let intraday_volumes: Vec<f64> = intraday.iter().map(|d| d.volume as f64).collect();
            let intraday_avg_volume = intraday_volumes.iter().sum::<f64>() / intraday_volumes.len() as f64;
            let intraday_recent_count = intraday_volumes.len().min(10) as f64;
            let intraday_recent_volume = if intraday_recent_count > 0.0 {
                intraday_volumes.iter().rev().take(intraday_recent_count as usize).sum::<f64>() / intraday_recent_count
            } else {
                0.0
            };
            let intraday_volume_ratio = if intraday_avg_volume > 0.0 { intraday_recent_volume / intraday_avg_volume } else { 1.0 };
            let intraday_recent = {
                let start = intraday.len().saturating_sub(20);
                format_recent_data(&intraday[start..])
            };
            let intraday_slope = if intraday_closes.len() >= 20 {
                let recent = &intraday_closes[intraday_closes.len() - 20..];
                let first = recent[0];
                let last = recent[recent.len() - 1];
                if first.abs() > 0.0 { ((last - first) / first) * 100.0 } else { 0.0 }
            } else {
                0.0
            };
            let metrics = format!(
                "Intraday Last Time: {}\nIntraday Last Price: {:.2}\nIntraday Change: {:.2}%\nIntraday Volume Ratio (recent/avg): {:.2}x\nIntraday Trend (last 20 pts): {:.2}%",
                intraday_last_date,
                intraday_last_price,
                intraday_change,
                intraday_volume_ratio,
                intraday_slope
            );
            (intraday_recent, metrics)
        } else {
            ("N/A".to_string(), "Intraday data insufficient".to_string())
        }
    } else {
        ("N/A".to_string(), "No intraday data provided".to_string())
    };

    let prompt = format!(
        r#"Analyze the following stock data and return a STRICT JSON object. IMPORTANT: All text content in the JSON values must be in Simplified Chinese.

Stock Symbol: {}
Current Price: {:.2}
Price Change: {:.2}%

Recent Price Data (last 10 days):
{}

Intraday Data (last 20 points):
{}

Intraday Metrics:
{}

Technical Indicators:
- RSI (14): {:.2} (>70 overbought, <30 oversold)
- MACD: {:.2}, Signal: {:.2}
- MA20: {:.2}, MA50: {:.2}
- EMA12: {:.2}, EMA26: {:.2}
- Current Price vs MA20: {:.2}%
- Current Price vs MA50: {:.2}%
- Bollinger Bands: Upper={:.2}, Lower={:.2}, Position={:.1}%
- Volume Ratio (recent/avg): {:.2}x

Multiple Prediction Methods Results:
{}
Average Prediction: {:.2}
Prediction Range: {:.2} - {:.2} (range: {:.2})

RESPONSE TEMPLATE (ALL FIELDS REQUIRED, DO NOT OMIT):
{{
  "analysis": "<string, 3-6 sentences>",
  "prediction": {{
    "price": <number>,
    "confidence": <0-100>,
    "trend": "bullish|bearish|neutral",
    "reasoning": "<string>"
  }},
  "risk_assessment": {{
    "level": "low|medium|high",
    "factors": ["<string>", "<string>"]
  }},
  "recommendations": ["<string>", "<string>", "<string>"],
  "technical_summary": {{
    "indicators": [
      {{"name": "RSI", "value": <number>, "signal": "buy|sell|hold"}},
      {{"name": "MACD", "value": <number>, "signal": "buy|sell|hold"}},
      {{"name": "MA20", "value": <number>, "signal": "buy|sell|hold"}},
      {{"name": "MA50", "value": <number>, "signal": "buy|sell|hold"}}
    ],
    "overall_signal": "buy|sell|hold"
  }},
  "price_targets": [
    {{"period": "1w", "target": <number>, "probability": <0-100>}},
    {{"period": "1m", "target": <number>, "probability": <0-100>}},
    {{"period": "3m", "target": <number>, "probability": <0-100>}}
  ]
}}

STRICT RULES:
1) Output must be valid JSON only, no markdown or extra text.
2) All fields above are mandatory, arrays must meet minimum lengths.
3) Use numeric values for price/confidence/probability.
4) Keep all text values in Simplified Chinese.
5) If unsure, provide conservative, neutral output but keep the schema intact."#,
        symbol,
        last_price,
        price_change,
        format_recent_data(data),
        intraday_summary,
        intraday_metrics,
        last_rsi,
        last_macd,
        last_signal,
        last_ma20,
        last_ma50,
        last_ema12,
        last_ema26,
        ((last_price - last_ma20) / last_ma20) * 100.0,
        ((last_price - last_ma50) / last_ma50) * 100.0,
        last_bb_upper,
        last_bb_lower,
        ((last_price - last_bb_lower) / (last_bb_upper - last_bb_lower)) * 100.0,
        volume_ratio,
        prediction_summary,
        avg_prediction,
        min_prediction,
        max_prediction,
        prediction_range,
    );

    let provider = detect_api_provider(model);
    if provider == "unknown" {
        return Err("Unsupported model".to_string());
    }

    let api_config = get_api_provider_config(provider);
    let api_url = &api_config.endpoint;
    let api_provider = provider;

    let client = reqwest::Client::builder()
        .user_agent("StockAnalyzer/1.0")
        .build()
        .map_err(|e| format!("Client error: {}", e))?;

    let response = if api_provider == "openai" || api_provider == "groq" || api_provider == "xai" {
        let mapped_model = if let Some(mapper) = api_config.model_mapping {
            mapper(model)
        } else {
            model.to_string()
        };
        
        eprintln!("=== Network Request Debug ===");
        eprintln!("API Provider: {}", api_provider);
        eprintln!("Endpoint: {}", api_url);
        eprintln!("Model: {} (mapped from: {})", mapped_model, model);
        eprintln!("Request Body Size: {} bytes", serde_json::to_string(&serde_json::json!({
            "model": mapped_model,
            "messages": [{"role": "system", "content": "..."}, {"role": "user", "content": format!("{}...", &prompt[..prompt.len().min(100)])}],
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        })).unwrap_or_default().len());
        
        let body = serde_json::json!({
            "model": mapped_model,
            "messages": [
                {"role": "system", "content": "You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. CRITICAL: You MUST return ALL required fields including 'analysis', 'prediction', 'risk_assessment', 'recommendations', 'technical_summary', and 'price_targets'. Do NOT omit any field. All text content must be in Simplified Chinese (??)."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        });

        let mut request = client.post(api_url);
        if api_config.auth_header == "Authorization" {
            let auth_header = format!("{} {}", api_config.auth_header_value, api_key);
            eprintln!("Auth Header: {} {}", api_config.auth_header_value, if api_key.len() > 10 { format!("{}...", &api_key[..10]) } else { "***".to_string() });
            request = request.header("Authorization", auth_header);
        }
        eprintln!("Sending request...");
        let start_time = std::time::Instant::now();
        let response_result = request
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await;
        let elapsed = start_time.elapsed();
        eprintln!("Request completed in {:?}", elapsed);
        
        match &response_result {
            Ok(resp) => {
                eprintln!("Response Status: {}", resp.status());
                eprintln!("Response Headers: {:?}", resp.headers().iter().map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string())).collect::<Vec<_>>());
            }
            Err(e) => {
                eprintln!("Request failed: {}", e);
            }
        }
        
        response_result.map_err(|e| format!("Network error: {}", e))?
    } else if api_provider == "anthropic" {
        // Claude API
        eprintln!("=== Network Request Debug ===");
        eprintln!("API Provider: {}", api_provider);
        eprintln!("Endpoint: {}", api_url);
        eprintln!("Model: {}", model);
        
        let claude_prompt = format!(
            "You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. CRITICAL: You MUST return ALL required fields including 'analysis', 'prediction', 'risk_assessment', 'recommendations', 'technical_summary', and 'price_targets'. Do NOT omit any field. All text content must be in Simplified Chinese (??).\n\n{}",
            prompt
        );
        let body = serde_json::json!({
            "model": model,
            "max_tokens": 4000,
            "messages": [
                {"role": "user", "content": claude_prompt}
            ]
        });
        eprintln!("Request Body Size: {} bytes", serde_json::to_string(&body).unwrap_or_default().len());

        let mut request = client.post(api_url);
        if api_config.auth_header == "x-api-key" {
            eprintln!("Auth Header: x-api-key: {}...", if api_key.len() > 10 { &api_key[..10] } else { "***" });
            request = request.header("x-api-key", api_key);
        }
        eprintln!("Sending request...");
        let start_time = std::time::Instant::now();
        let response_result = request
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await;
        let elapsed = start_time.elapsed();
        eprintln!("Request completed in {:?}", elapsed);
        
        match &response_result {
            Ok(resp) => {
                eprintln!("Response Status: {}", resp.status());
            }
            Err(e) => {
                eprintln!("Request failed: {}", e);
            }
        }
        
        response_result.map_err(|e| format!("Network error: {}", e))?
    } else if api_provider == "gemini" {
        // Google Gemini API
        let gemini_model = if let Some(mapper) = api_config.model_mapping {
            mapper(model)
        } else {
            "gemini-2.5-flash".to_string()
        };
        
        // Build the prompt with system instruction (Chinese output required)
        let full_prompt = format!(
            "You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. CRITICAL: You MUST return ALL required fields including 'analysis', 'prediction', 'risk_assessment', 'recommendations', 'technical_summary', and 'price_targets'. Do NOT omit any field. All text content must be in Simplified Chinese (??).\n\n{}",
            prompt
        );
        
        // Body for v1 API (without responseMimeType - v1 doesn't support it)
        let body_v1 = serde_json::json!({
            "contents": [{
                "parts": [{
                    "text": full_prompt
                }]
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 8192
            }
        });
        
        // Body for v1beta API (with responseMimeType - v1beta supports it)
        let body_v1beta = serde_json::json!({
            "contents": [{
                "parts": [{
                    "text": full_prompt
                }]
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 8192,
                "responseMimeType": "application/json"
            }
        });

        // Try different API endpoints and model name variations
        let mut response = None;
        let mut last_error = String::new();
        let mut tried_models: Vec<String> = vec![gemini_model.clone()];
        
        // List of models to try in order (removed deprecated models)
        let models_to_try: Vec<String> = vec![
            gemini_model.clone(),
            "gemini-2.5-flash".to_string(),
            "gemini-1.5-flash".to_string(),
            "gemini-1.5-pro".to_string(),
        ];
        
            eprintln!("=== Network Request Debug ===");
        eprintln!("API Provider: {}", api_provider);
        eprintln!("Model: {} (mapped from: {})", gemini_model, model);
        eprintln!("Request Body Size (v1): {} bytes", serde_json::to_string(&body_v1).unwrap_or_default().len());
        eprintln!("Request Body Size (v1beta): {} bytes", serde_json::to_string(&body_v1beta).unwrap_or_default().len());
        
        // Try v1 API first (for newer models)
        let mut api_key_invalid = false;
        let mut quota_exceeded = false;
        for model_name in models_to_try.iter() {
            if response.is_some() {
                break;
            }
            if api_key_invalid {
                break;
            }
            if quota_exceeded {
                break;
            }
            
            let url_v1 = format!("https://generativelanguage.googleapis.com/v1/models/{}:generateContent?key={}", 
                model_name, api_key);
            eprintln!("Trying Gemini API v1 with model: {}", model_name);
            eprintln!("Endpoint: {}...", &url_v1[..url_v1.find('?').unwrap_or(url_v1.len())]);
            eprintln!("Sending request...");
            let start_time = std::time::Instant::now();
            let response_result = client
                .post(&url_v1)
                .header("Content-Type", "application/json")
                .json(&body_v1)
                .send()
                .await;
            let elapsed = start_time.elapsed();
            eprintln!("Request completed in {:?}", elapsed);
            
            match response_result {
                Ok(resp) => {
                    eprintln!("Response Status: {}", resp.status());
                    if resp.status().is_success() {
                        eprintln!("Successfully received response from Gemini API v1");
                        response = Some(resp);
                        break;
                    } else {
                        let status = resp.status();
                        let error_text = resp.text().await.unwrap_or_default();
                        eprintln!("API error: {} - {}", status, &error_text[..error_text.len().min(200)]);
                        if !tried_models.contains(model_name) {
                            tried_models.push(model_name.clone());
                        }
                        
                        // Check if error is related to invalid or expired API key
                        if error_text.contains("API_KEY_INVALID") || 
                           error_text.contains("API key not valid") ||
                           error_text.contains("INVALID_ARGUMENT") && error_text.contains("API key") {
                            api_key_invalid = true;
                            // Check if API key is expired
                            if error_text.contains("expired") || error_text.contains("renew") {
                                last_error = format!("API key expired. Please renew your Gemini API key at https://makersuite.google.com/app/apikey. You may need to create a new API key if the current one has expired.");
                            } else {
                                last_error = format!("Invalid API key. Please check your Gemini API key at https://makersuite.google.com/app/apikey. Error: {}", error_text);
                            }
                            break;
                        }
                        // Check if quota exceeded (429) - stop trying other models
                        if status == 429 || error_text.contains("RESOURCE_EXHAUSTED") || 
                           error_text.contains("quota") || error_text.contains("rate limit") {
                            quota_exceeded = true;
                            last_error = format!("API quota exceeded. You have reached your Gemini API usage limit. Please check your usage at https://ai.dev/rate-limit or upgrade your plan. For more information: https://ai.google.dev/gemini-api/docs/rate-limits");
                            break;
                        }
                        // Check if model not found (404) - skip this model and try next
                        if status == 404 && error_text.contains("not found") {
                            // Skip this model and continue with next one
                            continue;
                        }
                        last_error = format!("v1 API error {} for {}: {}", status, model_name, error_text);
                    }
                }
                Err(e) => {
                    if !tried_models.contains(&model_name.to_string()) {
                        tried_models.push(model_name.to_string());
                    }
                    last_error = format!("v1 API network error for {}: {}", model_name, e);
                }
            }
        }
        
        // If v1 failed and API key is valid and quota not exceeded, try v1beta
        if response.is_none() && !api_key_invalid && !quota_exceeded {
            for model_name in models_to_try.iter() {
                if response.is_some() {
                    break;
                }
                if api_key_invalid {
                    break;
                }
                if quota_exceeded {
                    break;
                }
                
                let url_v1beta = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}", 
                    model_name, api_key);
                eprintln!("Trying Gemini API v1beta with model: {}", model_name);
                eprintln!("Endpoint: {}...", &url_v1beta[..url_v1beta.find('?').unwrap_or(url_v1beta.len())]);
                eprintln!("Sending request...");
                let start_time = std::time::Instant::now();
                let response_result = client
                    .post(&url_v1beta)
                    .header("Content-Type", "application/json")
                    .json(&body_v1beta)
                    .send()
                    .await;
                let elapsed = start_time.elapsed();
                eprintln!("Request completed in {:?}", elapsed);
                
                match response_result
                {
                    Ok(resp) => {
                        eprintln!("Response Status: {}", resp.status());
                        if resp.status().is_success() {
                            eprintln!("Successfully received response from Gemini API v1beta");
                            response = Some(resp);
                            break;
                        } else {
                            let status = resp.status();
                            let error_text = resp.text().await.unwrap_or_default();
                            eprintln!("API error: {} - {}", status, &error_text[..error_text.len().min(200)]);
                            if !tried_models.contains(&model_name.to_string()) {
                                tried_models.push(model_name.to_string());
                            }
                            
                            // Check if error is related to invalid or expired API key
                            if error_text.contains("API_KEY_INVALID") || 
                               error_text.contains("API key not valid") ||
                               error_text.contains("INVALID_ARGUMENT") && error_text.contains("API key") {
                                api_key_invalid = true;
                                // Check if API key is expired
                                if error_text.contains("expired") || error_text.contains("renew") {
                                    last_error = format!("API key expired. Please renew your Gemini API key at https://makersuite.google.com/app/apikey. You may need to create a new API key if the current one has expired.");
                                } else {
                                    last_error = format!("Invalid API key. Please check your Gemini API key at https://makersuite.google.com/app/apikey. Error: {}", error_text);
                                }
                                break;
                            }
                            // Check if quota exceeded (429) - stop trying other models
                            if status == 429 || error_text.contains("RESOURCE_EXHAUSTED") || 
                               error_text.contains("quota") || error_text.contains("rate limit") {
                                quota_exceeded = true;
                                last_error = format!("API quota exceeded. You have reached your Gemini API usage limit. Please check your usage at https://ai.dev/rate-limit or upgrade your plan. For more information: https://ai.google.dev/gemini-api/docs/rate-limits");
                                break;
                            }
                            // Check if model not found (404) - skip this model and try next
                            if status == 404 && error_text.contains("not found") {
                                // Skip this model and continue with next one
                                continue;
                            }
                            last_error = format!("v1beta API error {} for {}: {}", status, model_name, error_text);
                        }
                    }
                    Err(e) => {
                        if !tried_models.contains(model_name) {
                            tried_models.push(model_name.clone());
                        }
                        last_error = format!("v1beta API network error for {}: {}", model_name, e);
                    }
                }
            }
        }
        
        response.ok_or_else(|| {
            if api_key_invalid || quota_exceeded {
                last_error.clone()
            } else {
                format!("Gemini API error. Tried models: {}. Last error: {}", 
                    tried_models.join(", "), last_error)
            }
        })?
    } else if api_provider == "huggingface" {
        // Hugging Face Inference API
        eprintln!("=== Network Request Debug ===");
        eprintln!("API Provider: {}", api_provider);
        
        let hf_model = if let Some(mapper) = api_config.model_mapping {
            mapper(model)
        } else {
            if model.starts_with("huggingface:") {
                model.strip_prefix("huggingface:").unwrap_or(model).to_string()
            } else {
                model.to_string()
            }
        };
        
        let url = format!("{}/{}", api_url, hf_model);
        eprintln!("Endpoint: {}", url);
        eprintln!("Model: {} (mapped from: {})", hf_model, model);
        
        let body = serde_json::json!({
            "inputs": format!("You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. CRITICAL: You MUST return ALL required fields including 'analysis', 'prediction', 'risk_assessment', 'recommendations', 'technical_summary', and 'price_targets'. Do NOT omit any field. All text content must be in Simplified Chinese (??).\n\n{}", prompt),
            "parameters": {
                "max_new_tokens": 2000,
                "temperature": 0.3,
                "return_full_text": false
            }
        });
        eprintln!("Request Body Size: {} bytes", serde_json::to_string(&body).unwrap_or_default().len());

        let mut request = client.post(&url);
        if api_config.auth_header == "Authorization" {
            eprintln!("Auth Header: {} {}...", api_config.auth_header_value, if api_key.len() > 10 { &api_key[..10] } else { "***" });
            request = request.header("Authorization", format!("{} {}", api_config.auth_header_value, api_key));
        }
        eprintln!("Sending request...");
        let start_time = std::time::Instant::now();
        let response_result = request
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await;
        let elapsed = start_time.elapsed();
        eprintln!("Request completed in {:?}", elapsed);
        
        match &response_result {
            Ok(resp) => {
                eprintln!("Response Status: {}", resp.status());
            }
            Err(e) => {
                eprintln!("Request failed: {}", e);
            }
        }
        
        response_result.map_err(|e| format!("Network error: {}", e))?
    } else {
        return Err("Unsupported API provider".to_string());
    };

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API error: {} - {}", status, error_text));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    let content: String = if api_provider == "openai" || api_provider == "groq" || api_provider == "xai" {
        json["choices"][0]["message"]["content"]
            .as_str()
            .ok_or("No content in response")?
            .to_string()
    } else if api_provider == "anthropic" {
        json["content"][0]["text"]
            .as_str()
            .ok_or("No content in response")?
            .to_string()
    } else if api_provider == "gemini" {
        // Check for errors first
        if let Some(error) = json.get("error") {
            let error_msg = error["message"]
                .as_str()
                .unwrap_or("Unknown Gemini API error");
            return Err(format!("Gemini API error: {}", error_msg));
        }
        
        // Check if response was truncated
        if let Some(candidates) = json.get("candidates").and_then(|c| c.as_array()) {
            if let Some(first_candidate) = candidates.first() {
                if let Some(finish_reason) = first_candidate.get("finishReason").and_then(|r| r.as_str()) {
                    if finish_reason == "MAX_TOKENS" || finish_reason == "OTHER" {
                        eprintln!("Warning: Gemini response may be truncated. finishReason: {}", finish_reason);
                    }
                }
                
                // Extract text from all parts (Gemini may return multiple parts)
                let mut text_parts = Vec::new();
                if let Some(content) = first_candidate.get("content") {
                    if let Some(parts) = content.get("parts").and_then(|p| p.as_array()) {
                        for part in parts {
                            if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                text_parts.push(text);
                            }
                        }
                    }
                }
                
                if text_parts.is_empty() {
                    return Err("No text content in Gemini response".to_string());
                }
                
                // Combine all parts
                let text = text_parts.join("");
                
                // Gemini may return text wrapped in markdown code blocks, extract JSON
                let text_clean = if text.trim_start().starts_with("```json") {
                    text.trim_start()
                        .strip_prefix("```json")
                        .and_then(|s| s.strip_suffix("```"))
                        .map(|s| s.trim().to_string())
                        .unwrap_or_else(|| text.clone())
                } else if text.trim_start().starts_with("```") {
                    text.trim_start()
                        .strip_prefix("```")
                        .and_then(|s| s.strip_suffix("```"))
                        .map(|s| s.trim().to_string())
                        .unwrap_or_else(|| text.clone())
                } else {
                    text.clone()
                };
                
                eprintln!("Gemini response: {} parts, total length: {} chars, finishReason: {:?}", 
                    text_parts.len(), 
                    text_clean.len(),
                    first_candidate.get("finishReason").and_then(|r| r.as_str()));
                
                text_clean
            } else {
                return Err("No candidates in Gemini response".to_string());
            }
        } else {
            return Err("Invalid Gemini response format: no candidates".to_string());
        }
    } else if api_provider == "huggingface" {
        // Hugging Face returns array of generated text
        if let Some(text_array) = json.as_array() {
            if let Some(first_item) = text_array.first() {
                first_item["generated_text"]
                    .as_str()
                    .ok_or("No generated text in response")?
                    .to_string()
            } else {
                return Err("Empty response from Hugging Face".to_string());
            }
        } else if json["generated_text"].is_string() {
            json["generated_text"]
                .as_str()
                .ok_or("No generated text in response")?
                .to_string()
        } else {
            return Err("Unexpected Hugging Face response format".to_string());
        }
    } else {
        return Err("Unsupported API provider for content extraction".to_string());
    };

    // Debug: Log raw content from API
    eprintln!("=== AI API Response Debug ===");
    eprintln!("API Provider: {}", api_provider);
    eprintln!("Raw Content Length: {} chars", content.len());
    eprintln!("Raw Content (first 500 chars): {}", 
        truncate_string_safe(&content, 500));
    
    // Clean and extract JSON from content
    let cleaned_content = extract_json_from_text(&content);
    eprintln!("Cleaned Content Length: {} chars", cleaned_content.len());
    eprintln!("Cleaned Content (first 1000 chars): {}", 
        truncate_string_safe(&cleaned_content, 1000));

    // Try to parse JSON, with fallback for incomplete responses
    eprintln!("=== Attempting JSON Parse (Step 1: Direct parse) ===");
    let result: AIAnalysisResult = match serde_json::from_str(&cleaned_content) {
        Ok(parsed) => {
            eprintln!("??Direct parse succeeded!");
            parsed
        },
        Err(e) => {
            eprintln!("??Direct parse failed: {}", e);
            eprintln!("=== Attempting JSON Parse (Step 2: Aggressive extraction) ===");
            
            // Try to find and extract JSON object more aggressively
            let json_candidate = find_json_in_text(&cleaned_content);
            eprintln!("Extracted JSON candidate length: {} chars", json_candidate.len());
            eprintln!("JSON candidate (first 800 chars): {}", 
                truncate_string_safe(&json_candidate, 800));
            
            // Try to validate and fix common JSON issues before parsing
            let fixed_candidate = fix_json_common_issues(&json_candidate);
            eprintln!("Fixed candidate length: {} chars", fixed_candidate.len());
            
            // Try parsing the fixed candidate
            eprintln!("=== Attempting JSON Parse (Step 3: Parse fixed candidate) ===");
            let parse_result = serde_json::from_str::<AIAnalysisResult>(&fixed_candidate);
            
            match parse_result {
                Ok(parsed) => {
                    eprintln!("??Fixed candidate parse succeeded!");
                    parsed
                },
                Err(e2) => {
                    eprintln!("??Fixed candidate parse failed: {}", e2);
                    eprintln!("=== Attempting JSON Parse (Step 4: Parse as partial JSON) ===");
                    
                    // Try to parse as partial JSON and fill missing fields
                    match serde_json::from_str::<serde_json::Value>(&fixed_candidate) {
                        Ok(partial_json) => {
                            eprintln!("??Successfully parsed as partial JSON Value");
                            eprintln!("Partial JSON keys: {:?}", partial_json.as_object()
                                .map(|obj| obj.keys().collect::<Vec<_>>())
                                .unwrap_or_default());
                            
                            if let Ok(patched_result) = patch_incomplete_ai_result(&partial_json, symbol, data) {
                                eprintln!("??Successfully patched incomplete JSON");
                                eprintln!("=== Patched Result Details ===");
                                eprintln!("  analysis: {} chars", patched_result.analysis.len());
                                eprintln!("  prediction: price={:.2}, confidence={:.1}, trend={}, reasoning={} chars",
                                    patched_result.prediction.price,
                                    patched_result.prediction.confidence,
                                    patched_result.prediction.trend,
                                    patched_result.prediction.reasoning.len());
                                eprintln!("  risk_assessment: level={}, factors={}",
                                    patched_result.risk_assessment.level,
                                    patched_result.risk_assessment.factors.len());
                                eprintln!("  recommendations: {} items", patched_result.recommendations.len());
                                eprintln!("  technical_summary: indicators={}, overall_signal={}",
                                    patched_result.technical_summary.indicators.len(),
                                    patched_result.technical_summary.overall_signal);
                                eprintln!("  price_targets: {} items", patched_result.price_targets.len());
                                eprintln!("================================");
                                return Ok(patched_result);
                            } else {
                                eprintln!("??Failed to patch incomplete JSON");
                            }
                        },
                        Err(e3) => {
                            eprintln!("??Failed to parse as partial JSON Value: {}", e3);
                            eprintln!("Fixed candidate (first 500 chars): {}", 
                                truncate_string_safe(&fixed_candidate, 500));
                        }
                    }
                    
                    // If JSON parsing still fails, try to extract at least the analysis text
                    // and create a minimal valid response
                    eprintln!("=== Attempting JSON Parse (Step 5: Extract analysis text for fallback) ===");
                    if let Some(analysis_text) = extract_analysis_text(&cleaned_content) {
                        eprintln!("??Extracted analysis text: {} chars", analysis_text.len());
                        eprintln!("AI API partially failed, using fallback analysis. Error: {}", e2);
                        create_fallback_analysis(analysis_text, symbol, data)
                    } else {
                        eprintln!("??Failed to extract analysis text");
                        // Log the problematic content for debugging
                        let preview = if cleaned_content.len() > 1000 {
                            // Find the last valid UTF-8 character boundary before 1000 bytes
                            let mut end_idx = 1000;
                            while end_idx > 0 && !cleaned_content.is_char_boundary(end_idx) {
                                end_idx -= 1;
                            }
                            if end_idx == 0 {
                                end_idx = 1000; // Fallback if no valid boundary found
                            }
                            format!("{}...", &cleaned_content[..end_idx])
                        } else {
                            cleaned_content.clone()
                        };
                        eprintln!("=== Final Error: All parsing attempts failed ===");
                        eprintln!("Original error: {}", e);
                        eprintln!("Final error: {}", e2);
                        eprintln!("Content length: {}", cleaned_content.len());
                        eprintln!("Content preview: {}", preview);
                        return Err(format!("Failed to parse AI response: {}. Original error: {}. Content length: {}. Preview: {}",
                            e2, e, cleaned_content.len(), preview));
                    }
                }
            }
        }
    };

    eprintln!("=== Parse Success: Final result ===");
    eprintln!("Analysis length: {} chars", result.analysis.len());
    eprintln!("Prediction: price={:.2}, confidence={:.1}, trend={}", 
        result.prediction.price, 
        result.prediction.confidence,
        result.prediction.trend);
    eprintln!("Risk level: {}", result.risk_assessment.level);
    eprintln!("Recommendations count: {}", result.recommendations.len());
    eprintln!("Indicators count: {}", result.technical_summary.indicators.len());
    eprintln!("Price targets count: {}", result.price_targets.len());
    eprintln!("================================");

    Ok(result)
}
