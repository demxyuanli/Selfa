use super::types::{StockData, StockQuote, PredictionResult, AIAnalysisResult};
use super::technical_indicators::{calculate_sma, calculate_ema, calculate_rsi, calculate_macd};
use super::prediction::{predict_linear_regression, predict_moving_average, predict_technical_indicator, predict_polynomial, predict_exponential_smoothing};
use super::prediction_advanced::predict_ensemble;
use super::ai_analysis_json::{extract_json_from_text, find_json_in_text, extract_analysis_text, patch_incomplete_ai_result, fix_json_common_issues, truncate_string_safe};
use super::ai_analysis_local::{generate_local_ai_analysis, create_fallback_analysis, format_recent_data};

pub async fn ai_analyze_stock(
    symbol: &str,
    data: &[StockData],
    quote: Option<&StockQuote>,
    api_key: Option<&str>,
    model: &str,
    use_local_fallback: bool,
) -> Result<AIAnalysisResult, String> {
    if data.len() < 20 {
        return Err("Insufficient data for AI analysis".to_string());
    }

    // Check if model is free (Groq and Gemini are free but still need API key)
    let is_free_model = model.starts_with("groq:") || 
                       model.starts_with("llama") || 
                       model.starts_with("mixtral") ||
                       model.starts_with("gemini");
    
    // For models that require API key but none provided, use local analysis
    if (api_key.is_none() && !is_free_model) || use_local_fallback {
        return generate_local_ai_analysis(symbol, data, quote);
    }
    
    // For free models, still need API key (but it's free to get)
    // If no key provided for free model, fall back to local analysis
    let api_key_to_use = if is_free_model {
        api_key.unwrap_or_else(|| {
            // Free APIs require API key - user needs to get free API key
            return "";
        })
    } else {
        api_key.unwrap_or("")
    };
    
    if api_key_to_use.is_empty() && is_free_model {
        let error_msg = if model.starts_with("gemini") {
            "Gemini API requires a free API key. Please get one from https://makersuite.google.com/app/apikey".to_string()
        } else {
            "Free API models require a free API key. Please get one from the provider's website".to_string()
        };
        return Err(error_msg);
    }

    match call_ai_api(symbol, data, quote, api_key_to_use, model).await {
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

    let prompt = format!(
        r#"Please analyze the following stock data and provide a comprehensive analysis in JSON format. IMPORTANT: All text content must be in Chinese (Simplified Chinese).

Stock Symbol: {}
Current Price: {:.2}
Price Change: {:.2}%

Recent Price Data (last 10 days):
{}

Technical Indicators:
- RSI (14): {:.2} (??>70, ??<30)
- MACD: {:.2}, Signal: {:.2}
- MA20: {:.2}, MA50: {:.2}
- EMA12: {:.2}, EMA26: {:.2}
- Current Price vs MA20: {:.2}%
- Current Price vs MA50: {:.2}%
- Bollinger Bands: Upper={:.2}, Lower={:.2}, Position={:.1}%
- Volume Ratio (recent/avg): {:.2}x

Multiple Prediction Methods Results (????????):
{}
Average Prediction: {:.2}
Prediction Range: {:.2} - {:.2} (range: {:.2})

CRITICAL REQUIREMENTS - YOU MUST RETURN ALL REQUIRED FIELDS:

Please provide analysis in the following JSON format. ALL FIELDS ARE REQUIRED - DO NOT OMIT ANY FIELD:

{{
  "analysis": "????????-5????????",
  "prediction": {{
    "price": <predicted_price>,
    "confidence": <confidence_0_100>,
    "trend": "bullish|bearish|neutral",
    "reasoning": "??????????"
  }},
  "risk_assessment": {{
    "level": "low|medium|high",
    "factors": ["????1????", "????2????"]
  }},
  "recommendations": ["????1????", "????2????", "????3????"],
  "technical_summary": {{
    "indicators": [
      {{"name": "RSI", "value": <value>, "signal": "buy|sell|hold"}},
      {{"name": "MACD", "value": <value>, "signal": "buy|sell|hold"}},
      {{"name": "MA20", "value": <value>, "signal": "buy|sell|hold"}},
      {{"name": "MA50", "value": <value>, "signal": "buy|sell|hold"}}
    ],
    "overall_signal": "buy|sell|hold"
  }},
  "price_targets": [
    {{"period": "1??", "target": <price>, "probability": <0_100>}},
    {{"period": "1??", "target": <price>, "probability": <0_100>}},
    {{"period": "3??", "target": <price>, "probability": <0_100>}}
  ]
}}

REQUIRED FIELDS CHECKLIST (ALL MUST BE PRESENT):
??"analysis" - string (required)
??"prediction" - object with "price", "confidence", "trend", "reasoning" (all required)
??"risk_assessment" - object with "level", "factors" (both required)
??"recommendations" - array with at least 2 items (required)
??"technical_summary" - object with "indicators" (array) and "overall_signal" (both required)
??"price_targets" - array with at least 2 items (required)

IMPORTANT INSTRUCTIONS: 
1. ALL FIELDS ABOVE ARE MANDATORY - DO NOT SKIP ANY FIELD
2. Consider all prediction methods when making your prediction - use the average and range as reference
3. Analyze the consistency between different methods - if they converge, confidence should be higher
4. Consider technical indicators, volume patterns, and prediction convergence together
5. All text content in the JSON response must be in Simplified Chinese
6. Respond ONLY with valid, complete JSON containing ALL required fields
7. DO NOT include any text before or after the JSON object
8. Ensure the JSON is properly formatted and complete before responding."#,
        symbol,
        last_price,
        price_change,
        format_recent_data(data),
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

    let (api_url, api_provider) = if model.starts_with("gpt") {
        ("https://api.openai.com/v1/chat/completions", "openai")
    } else if model.starts_with("claude") {
        ("https://api.anthropic.com/v1/messages", "anthropic")
    } else if model.starts_with("groq") || model.starts_with("llama") || model.starts_with("mixtral") {
        ("https://api.groq.com/openai/v1/chat/completions", "groq")
    } else if model.starts_with("gemini") {
        ("https://generativelanguage.googleapis.com/v1/models", "gemini") // Will try v1 first, fallback to v1beta
    } else if model.starts_with("huggingface") || model.contains("/") {
        ("https://api-inference.huggingface.co/models", "huggingface")
    } else {
        return Err("Unsupported model".to_string());
    };

    let client = reqwest::Client::builder()
        .user_agent("StockAnalyzer/1.0")
        .build()
        .map_err(|e| format!("Client error: {}", e))?;

    let response = if api_provider == "openai" || api_provider == "groq" {
        // OpenAI-compatible API (OpenAI, Groq)
        let groq_model = if model.starts_with("groq:") {
            model.strip_prefix("groq:").unwrap_or(model)
        } else if model.starts_with("llama") {
            "llama-3.1-70b-versatile"
        } else if model.starts_with("mixtral") {
            "mixtral-8x7b-32768"
        } else {
            model
        };
        
        let body = serde_json::json!({
            "model": groq_model,
            "messages": [
                {"role": "system", "content": "You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. CRITICAL: You MUST return ALL required fields including 'analysis', 'prediction', 'risk_assessment', 'recommendations', 'technical_summary', and 'price_targets'. Do NOT omit any field. All text content must be in Simplified Chinese (??)."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        });

        client
            .post(api_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?
    } else if api_provider == "anthropic" {
        // Claude API
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

        client
            .post(api_url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?
    } else if api_provider == "gemini" {
        // Google Gemini API
        // Map user selection to actual API model names
        let gemini_model = if model.starts_with("gemini:") {
            let model_name = model.strip_prefix("gemini:").unwrap_or("gemini-2.5-flash");
            // Map to correct API model names
            match model_name {
                "gemini-3-flash-preview" => "gemini-3-flash-preview",
                "gemini-1.5-flash" => "gemini-1.5-flash",
                "gemini-1.5-pro" => "gemini-1.5-pro",
                "gemini-2.5-flash" => "gemini-2.5-flash",
                "gemini-2.5-pro" => "gemini-2.5-pro",
                "gemini-pro" => "gemini-2.5-flash", // Fallback to 2.5-flash
                _ => "gemini-2.5-flash"
            }
        } else if model == "gemini" {
            "gemini-2.5-flash"
        } else {
            "gemini-2.5-flash"
        };
        
        // Build the prompt with system instruction (Chinese output required)
        let full_prompt = format!(
            "You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. CRITICAL: You MUST return ALL required fields including 'analysis', 'prediction', 'risk_assessment', 'recommendations', 'technical_summary', and 'price_targets'. Do NOT omit any field. All text content must be in Simplified Chinese (??).\n\n{}",
            prompt
        );
        
        let body = serde_json::json!({
            "contents": [{
                "parts": [{
                    "text": full_prompt
                }]
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 4000,
                "responseMimeType": "application/json"
            }
        });

        // Try different API endpoints and model name variations
        let mut response = None;
        let mut last_error = String::new();
        let mut tried_models = vec![gemini_model.to_string()];
        
        // List of models to try in order (removed deprecated models)
        let models_to_try = vec![
            gemini_model,
            "gemini-2.5-flash",
            "gemini-1.5-flash",
            "gemini-1.5-pro",
        ];
        
        // Try v1 API first (for newer models)
        let mut api_key_invalid = false;
        let mut quota_exceeded = false;
        for model_name in &models_to_try {
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
            match client
                .post(&url_v1)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
            {
                Ok(resp) => {
                    if resp.status().is_success() {
                        response = Some(resp);
                        break;
                    } else {
                        let status = resp.status();
                        let error_text = resp.text().await.unwrap_or_default();
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
            for model_name in &models_to_try {
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
                match client
                    .post(&url_v1beta)
                    .header("Content-Type", "application/json")
                    .json(&body)
                    .send()
                    .await
                {
                    Ok(resp) => {
                        if resp.status().is_success() {
                            response = Some(resp);
                            break;
                        } else {
                            let status = resp.status();
                            let error_text = resp.text().await.unwrap_or_default();
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
                        if !tried_models.contains(&model_name.to_string()) {
                            tried_models.push(model_name.to_string());
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
        let hf_model = if model.starts_with("huggingface:") {
            model.strip_prefix("huggingface:").unwrap_or(model)
        } else {
            model
        };
        
        let url = format!("{}/{}", api_url, hf_model);
        let body = serde_json::json!({
            "inputs": format!("You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. CRITICAL: You MUST return ALL required fields including 'analysis', 'prediction', 'risk_assessment', 'recommendations', 'technical_summary', and 'price_targets'. Do NOT omit any field. All text content must be in Simplified Chinese (??).\n\n{}", prompt),
            "parameters": {
                "max_new_tokens": 2000,
                "temperature": 0.3,
                "return_full_text": false
            }
        });

        client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?
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

    let content = if api_provider == "openai" || api_provider == "groq" {
        json["choices"][0]["message"]["content"]
            .as_str()
            .ok_or("No content in response")?
    } else if api_provider == "anthropic" {
        json["content"][0]["text"]
            .as_str()
            .ok_or("No content in response")?
    } else if api_provider == "gemini" {
        // Check for errors first
        if let Some(error) = json.get("error") {
            let error_msg = error["message"]
                .as_str()
                .unwrap_or("Unknown Gemini API error");
            return Err(format!("Gemini API error: {}", error_msg));
        }
        
        // Extract text from candidates
        let text = json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .ok_or("No content in Gemini response")?;
        
        // Gemini may return text wrapped in markdown code blocks, extract JSON
        let text_clean = if text.trim_start().starts_with("```json") {
            text.trim_start()
                .strip_prefix("```json")
                .and_then(|s| s.strip_suffix("```"))
                .map(|s| s.trim())
                .unwrap_or(text)
        } else if text.trim_start().starts_with("```") {
            text.trim_start()
                .strip_prefix("```")
                .and_then(|s| s.strip_suffix("```"))
                .map(|s| s.trim())
                .unwrap_or(text)
        } else {
            text
        };
        
        text_clean
    } else if api_provider == "huggingface" {
        // Hugging Face returns array of generated text
        if let Some(text_array) = json.as_array() {
            if let Some(first_item) = text_array.first() {
                first_item["generated_text"]
                    .as_str()
                    .ok_or("No generated text in response")?
            } else {
                return Err("Empty response from Hugging Face".to_string());
            }
        } else if json["generated_text"].is_string() {
            json["generated_text"]
                .as_str()
                .ok_or("No generated text in response")?
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
        truncate_string_safe(content, 500));
    
    // Clean and extract JSON from content
    let cleaned_content = extract_json_from_text(content);
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
