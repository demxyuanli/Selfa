use super::types::{StockData, StockQuote, PredictionResult, AIAnalysisResult, AIPrediction, AIRiskAssessment, AITechnicalSummary, AIIndicator, AIPriceTarget};
use super::utils::calculate_variance;
use super::technical_indicators::{calculate_sma, calculate_ema, calculate_rsi, calculate_macd};
use super::prediction::{predict_linear_regression, predict_moving_average, predict_technical_indicator, predict_polynomial, predict_exponential_smoothing, predict_ensemble};

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
                if let Some(last_pred) = predictions.last() {
                    all_predictions.push(last_pred.predicted_price);
                    let method_label = match *method {
                        "linear" => "线性回归",
                        "ma" => "移动平均",
                        "technical" => "技术指标",
                        "polynomial" => "多项式",
                        "exponential" => "指数平滑",
                        "ensemble" => "集成方法",
                        _ => method,
                    };
                    prediction_summary.push_str(&format!(
                        "- {} ({}天): {:.2}, 置信度: {:.1}%\n",
                        method_label, period, last_pred.predicted_price, last_pred.confidence
                    ));
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
- RSI (14): {:.2} (超买>70, 超卖<30)
- MACD: {:.2}, Signal: {:.2}
- MA20: {:.2}, MA50: {:.2}
- EMA12: {:.2}, EMA26: {:.2}
- Current Price vs MA20: {:.2}%
- Current Price vs MA50: {:.2}%
- Bollinger Bands: Upper={:.2}, Lower={:.2}, Position={:.1}%
- Volume Ratio (recent/avg): {:.2}x

Multiple Prediction Methods Results (综合多种预测方法):
{}
Average Prediction: {:.2}
Prediction Range: {:.2} - {:.2} (range: {:.2})

CRITICAL REQUIREMENTS - YOU MUST RETURN ALL REQUIRED FIELDS:

Please provide analysis in the following JSON format. ALL FIELDS ARE REQUIRED - DO NOT OMIT ANY FIELD:

{{
  "analysis": "综合分析文本（3-5段，使用中文）",
  "prediction": {{
    "price": <predicted_price>,
    "confidence": <confidence_0_100>,
    "trend": "bullish|bearish|neutral",
    "reasoning": "预测理由（使用中文）"
  }},
  "risk_assessment": {{
    "level": "low|medium|high",
    "factors": ["风险因素1（中文）", "风险因素2（中文）"]
  }},
  "recommendations": ["投资建议1（中文）", "投资建议2（中文）", "投资建议3（中文）"],
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
    {{"period": "1周", "target": <price>, "probability": <0_100>}},
    {{"period": "1个月", "target": <price>, "probability": <0_100>}},
    {{"period": "3个月", "target": <price>, "probability": <0_100>}}
  ]
}}

REQUIRED FIELDS CHECKLIST (ALL MUST BE PRESENT):
✓ "analysis" - string (required)
✓ "prediction" - object with "price", "confidence", "trend", "reasoning" (all required)
✓ "risk_assessment" - object with "level", "factors" (both required)
✓ "recommendations" - array with at least 2 items (required)
✓ "technical_summary" - object with "indicators" (array) and "overall_signal" (both required)
✓ "price_targets" - array with at least 2 items (required)

IMPORTANT INSTRUCTIONS: 
1. ALL FIELDS ABOVE ARE MANDATORY - DO NOT SKIP ANY FIELD
2. Consider all prediction methods when making your prediction - use the average and range as reference
3. Analyze the consistency between different methods - if they converge, confidence should be higher
4. Consider technical indicators, volume patterns, and prediction convergence together
5. All text content in the JSON response must be in Simplified Chinese
6. Respond ONLY with valid, complete JSON containing ALL required fields
7. DO NOT include any text before or after the JSON object
8. Ensure the JSON is properly formatted and complete before responding"#,
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
                {"role": "system", "content": "You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. CRITICAL: You MUST return ALL required fields including 'analysis', 'prediction', 'risk_assessment', 'recommendations', 'technical_summary', and 'price_targets'. Do NOT omit any field. All text content must be in Simplified Chinese (中文)."},
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
            "You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. CRITICAL: You MUST return ALL required fields including 'analysis', 'prediction', 'risk_assessment', 'recommendations', 'technical_summary', and 'price_targets'. Do NOT omit any field. All text content must be in Simplified Chinese (中文).\n\n{}",
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
            "You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. CRITICAL: You MUST return ALL required fields including 'analysis', 'prediction', 'risk_assessment', 'recommendations', 'technical_summary', and 'price_targets'. Do NOT omit any field. All text content must be in Simplified Chinese (中文).\n\n{}",
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
        
        // List of models to try in order
        let models_to_try = vec![
            gemini_model,
            "gemini-2.5-flash",
            "gemini-1.5-flash",
            "gemini-1.5-pro",
            "gemini-pro",
        ];
        
        // Try v1 API first (for newer models)
        for model_name in &models_to_try {
            if response.is_some() {
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
        
        // If v1 failed, try v1beta
        if response.is_none() {
            for model_name in &models_to_try {
                if response.is_some() {
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
            format!("Gemini API error. Tried models: {}. Last error: {}", 
                tried_models.join(", "), last_error)
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
            "inputs": format!("You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. CRITICAL: You MUST return ALL required fields including 'analysis', 'prediction', 'risk_assessment', 'recommendations', 'technical_summary', and 'price_targets'. Do NOT omit any field. All text content must be in Simplified Chinese (中文).\n\n{}", prompt),
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
            eprintln!("✓ Direct parse succeeded!");
            parsed
        },
        Err(e) => {
            eprintln!("✗ Direct parse failed: {}", e);
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
                    eprintln!("✓ Fixed candidate parse succeeded!");
                    parsed
                },
                Err(e2) => {
                    eprintln!("✗ Fixed candidate parse failed: {}", e2);
                    eprintln!("=== Attempting JSON Parse (Step 4: Parse as partial JSON) ===");
                    
                    // Try to parse as partial JSON and fill missing fields
                    match serde_json::from_str::<serde_json::Value>(&fixed_candidate) {
                        Ok(partial_json) => {
                            eprintln!("✓ Successfully parsed as partial JSON Value");
                            eprintln!("Partial JSON keys: {:?}", partial_json.as_object()
                                .map(|obj| obj.keys().collect::<Vec<_>>())
                                .unwrap_or_default());
                            
                            if let Ok(patched_result) = patch_incomplete_ai_result(&partial_json, symbol, data) {
                                eprintln!("✓ Successfully patched incomplete JSON");
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
                                eprintln!("✗ Failed to patch incomplete JSON");
                            }
                        },
                        Err(e3) => {
                            eprintln!("✗ Failed to parse as partial JSON Value: {}", e3);
                            eprintln!("Fixed candidate (first 500 chars): {}", 
                                truncate_string_safe(&fixed_candidate, 500));
                        }
                    }
                    
                    // If JSON parsing still fails, try to extract at least the analysis text
                    // and create a minimal valid response
                    eprintln!("=== Attempting JSON Parse (Step 5: Extract analysis text for fallback) ===");
                    if let Some(analysis_text) = extract_analysis_text(&cleaned_content) {
                        eprintln!("✓ Extracted analysis text: {} chars", analysis_text.len());
                        eprintln!("AI API partially failed, using fallback analysis. Error: {}", e2);
                        create_fallback_analysis(analysis_text, symbol, data)
                    } else {
                        eprintln!("✗ Failed to extract analysis text");
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

// Safely truncate string to max_chars characters, ensuring we don't split multi-byte characters
fn truncate_string_safe(text: &str, max_chars: usize) -> &str {
    let char_count = text.chars().count();
    if char_count <= max_chars {
        return text;
    }
    
    // Find the exact byte position after max_chars characters
    if let Some((idx, _)) = text.char_indices().nth(max_chars) {
        &text[..idx]
    } else {
        text
    }
}

// Extract JSON from text that may contain markdown code blocks or other text
fn extract_json_from_text(text: &str) -> String {
    let trimmed = text.trim();
    
    // Try to extract JSON from markdown code blocks
    if trimmed.starts_with("```json") {
        if let Some(json_part) = trimmed.strip_prefix("```json") {
            if let Some(json_clean) = json_part.strip_suffix("```") {
                return json_clean.trim().to_string();
            }
            // If no closing ```, try to find the first { and extract from there
            if let Some(start_pos) = json_part.find('{') {
                return extract_json_object(&json_part[start_pos..]);
            }
        }
    } else if trimmed.starts_with("```") {
        if let Some(json_part) = trimmed.strip_prefix("```") {
            if let Some(json_clean) = json_part.strip_suffix("```") {
                let cleaned = json_clean.trim();
                // Try to find JSON object in the cleaned text
                if let Some(start_pos) = cleaned.find('{') {
                    return extract_json_object(&cleaned[start_pos..]);
                }
                return cleaned.to_string();
            }
            // If no closing ```, try to find the first { and extract from there
            if let Some(start_pos) = json_part.find('{') {
                return extract_json_object(&json_part[start_pos..]);
            }
        }
    }
    
    // Try to find JSON object in the text
    if let Some(start_pos) = trimmed.find('{') {
        return extract_json_object(&trimmed[start_pos..]);
    }
    
    // Return as-is if no JSON object found
    trimmed.to_string()
}

// More aggressive JSON finding - looks for the largest valid JSON object
fn find_json_in_text(text: &str) -> String {
    // First try the standard extraction
    let extracted = extract_json_from_text(text);
    
    // If that didn't work or produced invalid JSON, try to find JSON more aggressively
    if let Some(start_pos) = text.find('{') {
        let mut best_json = String::new();
        let mut best_length = 0;
        
        // Try multiple starting positions
        for i in start_pos..text.len().min(start_pos + 100) {
            if text.chars().nth(i) == Some('{') {
                let candidate = extract_json_object(&text[i..]);
                if candidate.len() > best_length {
                    // Try to validate it's valid JSON
                    if serde_json::from_str::<serde_json::Value>(&candidate).is_ok() {
                        best_json = candidate;
                        best_length = best_json.len();
                    }
                }
            }
        }
        
        if !best_json.is_empty() {
            return best_json;
        }
        
        // Fallback: return the extracted version
        return extracted;
    }
    
    extracted
}

// Extract analysis text from potentially malformed AI response
fn extract_analysis_text(text: &str) -> Option<String> {
    // Try to find analysis field in the text
    if let Some(start) = text.find("\"analysis\"") {
        let remaining = &text[start..];
        if let Some(colon_pos) = remaining.find(':') {
            let value_start = colon_pos + 1;
            let value_text = &remaining[value_start..].trim();

            // Find the start of the string value
            if value_text.starts_with('"') {
                let mut in_escape = false;
                let mut result = String::new();
                let mut chars = value_text.chars().skip(1); // Skip opening quote

                while let Some(ch) = chars.next() {
                    match ch {
                        '\\' => {
                            if in_escape {
                                result.push('\\');
                                in_escape = false;
                            } else {
                                in_escape = true;
                            }
                        }
                        '"' => {
                            if !in_escape {
                                // End of string
                                return Some(result);
                            } else {
                                result.push('"');
                                in_escape = false;
                            }
                        }
                        _ => {
                            if in_escape {
                                result.push('\\');
                                in_escape = false;
                            }
                            result.push(ch);
                        }
                    }
                }
            }
        }
    }

    // Fallback: try to extract any substantial text content
    let cleaned = text.trim();
    if cleaned.len() > 50 && !cleaned.contains("error") && !cleaned.contains("Error") {
        Some(cleaned.to_string())
    } else {
        None
    }
}

// Create a fallback analysis when AI response is malformed
fn create_fallback_analysis(analysis_text: String, _symbol: &str, data: &[StockData]) -> AIAnalysisResult {
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = closes[closes.len() - 1];
    let price_change = if closes.len() >= 2 {
        ((last_price - closes[closes.len() - 2]) / closes[closes.len() - 2]) * 100.0
    } else {
        0.0
    };

    let rsi = calculate_rsi(&closes, 14);
    let last_rsi = rsi.last().copied().unwrap_or(50.0);
    let ma20 = calculate_sma(&closes, 20);
    let last_ma20 = ma20.iter().rev().find(|&&x| x > 0.0).copied().unwrap_or(last_price);

    // Create basic analysis based on technical indicators
    let trend = if last_price > last_ma20 && last_rsi > 50.0 {
        "bullish"
    } else if last_price < last_ma20 && last_rsi < 50.0 {
        "bearish"
    } else {
        "neutral"
    };

    let confidence = if trend == "neutral" { 50.0 } else { 65.0 };

    AIAnalysisResult {
        analysis: analysis_text,
        prediction: AIPrediction {
            price: (last_price * (1.0 + price_change / 100.0 * 0.1)).max(0.01),
            confidence,
            trend: trend.to_string(),
            reasoning: format!("基于技术指标分析，当前股价{}元，涨跌幅{:.2}%，RSI为{:.1}，建议投资者谨慎决策。",
                             last_price, price_change, last_rsi),
        },
        risk_assessment: AIRiskAssessment {
            level: if last_rsi > 70.0 || last_rsi < 30.0 { "high" } else { "medium" }.to_string(),
            factors: vec![
                "市场波动风险".to_string(),
                "技术指标信号不明确".to_string(),
                "AI分析数据不完整".to_string(),
            ],
        },
        recommendations: vec![
            "建议投资者根据个人风险承受能力决策".to_string(),
            "关注股价波动和技术指标变化".to_string(),
            "如有疑问可咨询专业投资顾问".to_string(),
        ],
        technical_summary: AITechnicalSummary {
            indicators: vec![
                AIIndicator {
                    name: "RSI".to_string(),
                    value: last_rsi,
                    signal: if last_rsi > 70.0 { "sell" } else if last_rsi < 30.0 { "buy" } else { "hold" }.to_string(),
                },
                AIIndicator {
                    name: "MA20".to_string(),
                    value: last_ma20,
                    signal: if last_price > last_ma20 { "buy" } else { "hold" }.to_string(),
                },
            ],
            overall_signal: if trend == "bullish" { "buy" } else if trend == "bearish" { "sell" } else { "hold" }.to_string(),
        },
        price_targets: vec![
            AIPriceTarget {
                period: "1周".to_string(),
                target: last_price * 1.05,
                probability: 60.0,
            },
            AIPriceTarget {
                period: "1个月".to_string(),
                target: last_price * 1.10,
                probability: 50.0,
            },
            AIPriceTarget {
                period: "3个月".to_string(),
                target: last_price * 1.15,
                probability: 40.0,
            },
        ],
    }
}

// Extract a complete JSON object from text, handling incomplete strings
fn extract_json_object(text: &str) -> String {
    let mut result = String::new();
    let mut depth = 0;
    let mut array_depth = 0;
    let mut in_string = false;
    let mut escape_next = false;
    let mut chars = text.chars().peekable();
    let mut started_with_array = false;
    
    // Skip whitespace to find first meaningful character
    while let Some(&ch) = chars.peek() {
        if ch.is_whitespace() {
            chars.next();
        } else if ch == '[' {
            started_with_array = true;
            break;
        } else {
            break;
        }
    }
    
    while let Some(ch) = chars.next() {
        if escape_next {
            result.push(ch);
            escape_next = false;
            continue;
        }
        
        match ch {
            '\\' => {
                result.push(ch);
                escape_next = true;
            }
            '"' => {
                result.push(ch);
                in_string = !in_string;
            }
            '{' => {
                result.push(ch);
                if !in_string {
                    depth += 1;
                }
            }
            '}' => {
                result.push(ch);
                if !in_string {
                    depth -= 1;
                    if depth == 0 && array_depth == 0 && !started_with_array {
                        // Found complete JSON object
                        return result;
                    }
                }
            }
            '[' => {
                result.push(ch);
                if !in_string {
                    array_depth += 1;
                }
            }
            ']' => {
                result.push(ch);
                if !in_string {
                    array_depth -= 1;
                    if array_depth == 0 && depth == 0 && started_with_array {
                        // Found complete JSON array
                        return result;
                    }
                }
            }
            _ => {
                result.push(ch);
            }
        }
    }
    
    // If we didn't find a complete object, try to fix common truncation issues
    if depth > 0 || array_depth > 0 {
        // Check if we're in the middle of a string
        if in_string {
            // Close the string
            result.push('"');
        }
        
        // Close unclosed arrays first
        while array_depth > 0 {
            result.push(']');
            array_depth -= 1;
        }
        
        // Close unclosed objects
        while depth > 0 {
            result.push('}');
            depth -= 1;
        }
    }
    
    result
}

// Patch incomplete AI result by filling missing fields with calculated defaults
fn patch_incomplete_ai_result(
    partial_json: &serde_json::Value,
    _symbol: &str,
    data: &[StockData],
) -> Result<AIAnalysisResult, String> {
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = closes[closes.len() - 1];
    let price_change = if closes.len() >= 2 {
        ((last_price - closes[closes.len() - 2]) / closes[closes.len() - 2]) * 100.0
    } else {
        0.0
    };

    let rsi = calculate_rsi(&closes, 14);
    let macd_result = calculate_macd(&closes, 12, 26, 9);
    let ma20 = calculate_sma(&closes, 20);
    
    let last_rsi = rsi.last().copied().unwrap_or(50.0);
    let last_macd = macd_result.macd.last().copied().unwrap_or(0.0);
    let _last_signal = macd_result.signal.last().copied().unwrap_or(0.0);
    let last_ma20 = ma20.iter().rev().find(|&&x| x > 0.0).copied().unwrap_or(last_price);

    // Extract available fields or use defaults
    let analysis = partial_json.get("analysis")
        .and_then(|v| v.as_str())
        .unwrap_or("基于技术指标的分析")
        .to_string();

    // Build prediction from partial JSON or calculate defaults
    let prediction = if let Some(pred_obj) = partial_json.get("prediction") {
        AIPrediction {
            price: pred_obj.get("price")
                .and_then(|v| v.as_f64())
                .unwrap_or(last_price),
            confidence: pred_obj.get("confidence")
                .and_then(|v| v.as_f64())
                .unwrap_or(65.0),
            trend: pred_obj.get("trend")
                .and_then(|v| v.as_str())
                .unwrap_or("neutral")
                .to_string(),
            reasoning: pred_obj.get("reasoning")
                .and_then(|v| v.as_str())
                .unwrap_or("基于技术指标分析")
                .to_string(),
        }
    } else {
        // Calculate prediction from technical indicators
        let trend = if last_price > last_ma20 && last_rsi > 50.0 {
            "bullish"
        } else if last_price < last_ma20 && last_rsi < 50.0 {
            "bearish"
        } else {
            "neutral"
        };
        
        AIPrediction {
            price: last_price * (1.0 + price_change / 100.0 * 0.1),
            confidence: 60.0,
            trend: trend.to_string(),
            reasoning: format!("基于技术指标计算：RSI={:.1}, MACD={:.2}", last_rsi, last_macd),
        }
    };

    // Build risk assessment
    let risk_assessment = if let Some(risk_obj) = partial_json.get("risk_assessment") {
        AIRiskAssessment {
            level: risk_obj.get("level")
                .and_then(|v| v.as_str())
                .unwrap_or("medium")
                .to_string(),
            factors: risk_obj.get("factors")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect())
                .unwrap_or_else(|| vec!["数据不完整".to_string()]),
        }
    } else {
        AIRiskAssessment {
            level: if last_rsi > 70.0 || last_rsi < 30.0 { "high" } else { "medium" }.to_string(),
            factors: vec!["技术指标分析".to_string()],
        }
    };

    // Build recommendations
    let recommendations = partial_json.get("recommendations")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect())
        .unwrap_or_else(|| vec!["建议谨慎投资".to_string(), "关注市场变化".to_string()]);

    // Build technical summary
    let technical_summary = if let Some(tech_obj) = partial_json.get("technical_summary") {
        AITechnicalSummary {
            indicators: tech_obj.get("indicators")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter()
                    .filter_map(|v| {
                        Some(AIIndicator {
                            name: v.get("name")?.as_str()?.to_string(),
                            value: v.get("value")?.as_f64()?,
                            signal: v.get("signal")?.as_str()?.to_string(),
                        })
                    })
                    .collect())
                .unwrap_or_default(),
            overall_signal: tech_obj.get("overall_signal")
                .and_then(|v| v.as_str())
                .unwrap_or("hold")
                .to_string(),
        }
    } else {
        AITechnicalSummary {
            indicators: vec![
                AIIndicator {
                    name: "RSI".to_string(),
                    value: last_rsi,
                    signal: if last_rsi > 70.0 { "sell" } else if last_rsi < 30.0 { "buy" } else { "hold" }.to_string(),
                },
            ],
            overall_signal: "hold".to_string(),
        }
    };

    // Build price targets
    let price_targets = partial_json.get("price_targets")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter()
            .filter_map(|v| {
                Some(AIPriceTarget {
                    period: v.get("period")?.as_str()?.to_string(),
                    target: v.get("target")?.as_f64()?,
                    probability: v.get("probability")?.as_f64()?,
                })
            })
            .collect())
        .unwrap_or_else(|| vec![
            AIPriceTarget {
                period: "1周".to_string(),
                target: last_price * 1.05,
                probability: 60.0,
            },
        ]);

    Ok(AIAnalysisResult {
        analysis,
        prediction,
        risk_assessment,
        recommendations,
        technical_summary,
        price_targets,
    })
}

// Fix common JSON formatting issues that might cause parsing errors
fn fix_json_common_issues(json_str: &str) -> String {
    let fixed = json_str.to_string();
    
    // Remove trailing commas before closing brackets/braces (but not inside strings)
    // We need to be careful not to replace commas that are inside strings
    let mut result = String::new();
    let mut in_string = false;
    let mut escape_next = false;
    let chars: Vec<char> = fixed.chars().collect();
    
    for i in 0..chars.len() {
        let ch = chars[i];
        
        if escape_next {
            result.push(ch);
            escape_next = false;
            continue;
        }
        
        match ch {
            '\\' => {
                result.push(ch);
                escape_next = true;
            }
            '"' => {
                result.push(ch);
                in_string = !in_string;
            }
            ',' if !in_string => {
                // Check if next non-whitespace char is ] or }
                let mut next_idx = i + 1;
                while next_idx < chars.len() && chars[next_idx].is_whitespace() {
                    next_idx += 1;
                }
                if next_idx < chars.len() && (chars[next_idx] == ']' || chars[next_idx] == '}') {
                    // Skip this trailing comma
                    continue;
                }
                result.push(ch);
            }
            _ => {
                result.push(ch);
            }
        }
    }
    
    result
}

fn format_recent_data(data: &[StockData]) -> String {
    let recent = data.iter().rev().take(10).rev();
    recent
        .map(|d| format!("{}: O={:.2}, H={:.2}, L={:.2}, C={:.2}, V={}", 
            d.date, d.open, d.high, d.low, d.close, d.volume))
        .collect::<Vec<_>>()
        .join("\n")
}

fn generate_local_ai_analysis(
    symbol: &str,
    data: &[StockData],
    _quote: Option<&StockQuote>,
) -> Result<AIAnalysisResult, String> {
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = closes[closes.len() - 1];
    let price_change = if closes.len() >= 2 {
        ((last_price - closes[closes.len() - 2]) / closes[closes.len() - 2]) * 100.0
    } else {
        0.0
    };

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

    let trend_slope = if closes.len() >= 20 {
        let recent = &closes[closes.len() - 20..];
        let first = recent[0];
        let last = recent[recent.len() - 1];
        ((last - first) / first) * 100.0
    } else {
        0.0
    };

    // Run multiple prediction methods and aggregate results
    let last_date = data.last().map(|d| d.date.as_str()).unwrap_or("");
    let prediction_methods = vec!["linear", "ma", "technical", "polynomial", "exponential", "ensemble"];
    let prediction_period = 10; // Use 10 days for medium-term prediction
    
    let mut prediction_prices: Vec<f64> = Vec::new();
    let mut prediction_confidences: Vec<f64> = Vec::new();
    
    for method in &prediction_methods {
        let predictions_result: Result<Vec<PredictionResult>, String> = match *method {
            "linear" => predict_linear_regression(&closes, last_date, prediction_period),
            "ma" => predict_moving_average(&closes, last_date, prediction_period),
            "technical" => predict_technical_indicator(&closes, last_date, prediction_period),
            "polynomial" => predict_polynomial(&closes, last_date, prediction_period),
            "exponential" => predict_exponential_smoothing(&closes, last_date, prediction_period),
            "ensemble" => predict_ensemble(data, last_date, prediction_period),
            _ => continue,
        };
        if let Ok(predictions) = predictions_result {
            if let Some(last_pred) = predictions.last() {
                prediction_prices.push(last_pred.predicted_price);
                prediction_confidences.push(last_pred.confidence);
            }
        }
    }
    
    // Calculate weighted average prediction based on confidences
    let predicted_price = if !prediction_prices.is_empty() && !prediction_confidences.is_empty() {
        let total_weight: f64 = prediction_confidences.iter().sum();
        if total_weight > 0.0 {
            prediction_prices.iter()
                .zip(prediction_confidences.iter())
                .map(|(price, conf)| price * conf)
                .sum::<f64>() / total_weight
        } else {
            prediction_prices.iter().sum::<f64>() / prediction_prices.len() as f64
        }
    } else {
        // Fallback to trend-based prediction
        last_price * (1.0 + trend_slope / 100.0 * 0.1)
    };
    
    // Calculate prediction consistency (lower variance = higher confidence)
    let prediction_std_dev = if prediction_prices.len() > 1 {
        let avg = prediction_prices.iter().sum::<f64>() / prediction_prices.len() as f64;
        let variance = prediction_prices.iter()
            .map(|p| (p - avg).powi(2))
            .sum::<f64>() / prediction_prices.len() as f64;
        variance.sqrt()
    } else {
        0.0
    };
    
    let prediction_consistency = if last_price > 0.0 {
        (1.0 - (prediction_std_dev / last_price).min(0.5)) * 100.0
    } else {
        50.0
    };

    let mut bullish_signals = 0;
    let mut bearish_signals = 0;

    if last_price > last_ma20 { bullish_signals += 1; } else { bearish_signals += 1; }
    if last_price > last_ma50 { bullish_signals += 1; } else { bearish_signals += 1; }
    if last_ma20 > last_ma50 { bullish_signals += 1; } else { bearish_signals += 1; }
    if last_ema12 > last_ema26 { bullish_signals += 1; } else { bearish_signals += 1; }
    if last_macd > last_signal { bullish_signals += 1; } else { bearish_signals += 1; }
    if last_rsi > 50.0 { bullish_signals += 1; } else { bearish_signals += 1; }
    if predicted_price > last_price { bullish_signals += 1; } else { bearish_signals += 1; }

    let overall_signal = if bullish_signals > bearish_signals {
        "buy"
    } else if bearish_signals > bullish_signals {
        "sell"
    } else {
        "hold"
    };

    let trend = if trend_slope > 2.0 {
        "bullish"
    } else if trend_slope < -2.0 {
        "bearish"
    } else {
        "neutral"
    };

    // Combine technical signals confidence with prediction consistency
    let base_confidence = (50.0 + (bullish_signals + bearish_signals) as f64 * 5.0).min(85.0);
    let avg_prediction_confidence = if !prediction_confidences.is_empty() {
        prediction_confidences.iter().sum::<f64>() / prediction_confidences.len() as f64
    } else {
        60.0
    };
    
    // Weighted combination: 60% prediction methods, 40% technical signals
    let confidence = (base_confidence * 0.4 + avg_prediction_confidence * 0.6 * (prediction_consistency / 100.0)).min(90.0);

    let volatility = calculate_variance(&closes).sqrt() / last_price * 100.0;
    let risk_level = if volatility > 5.0 {
        "high"
    } else if volatility > 2.0 {
        "medium"
    } else {
        "low"
    };

    // Build comprehensive analysis text
    let method_count = prediction_prices.len();
    let _analysis_text = format!(
        "综合分析了{}种预测方法（线性回归、移动平均、技术指标、多项式、指数平滑、集成方法），",
        method_count
    );
    
    let _analysis_text = format!(
        "{}\
        当前价格{:.2}，基于技术指标分析：RSI为{:.1}（{}），MACD{}，\
        价格位于MA20（{:.2}）{}，MA50（{:.2}）{}。\
        多种预测方法平均预测价格为{:.2}，预测一致性{:.1}%。\
        综合分析显示{}趋势，建议{}操作。",
        _analysis_text,
        last_price,
        last_rsi,
        if last_rsi > 70.0 { "超买" } else if last_rsi < 30.0 { "超卖" } else { "中性" },
        if last_macd > last_signal { "金叉看涨" } else { "死叉看跌" },
        last_ma20,
        if last_price > last_ma20 { "之上" } else { "之下" },
        last_ma50,
        if last_price > last_ma50 { "之上" } else { "之下" },
        predicted_price,
        prediction_consistency,
        trend,
        overall_signal
    );

    let risk_factors = vec![
        format!("Volatility: {:.2}%", volatility),
        if last_rsi > 70.0 {
            "RSI indicates overbought condition".to_string()
        } else if last_rsi < 30.0 {
            "RSI indicates oversold condition".to_string()
        } else {
            "RSI in neutral range".to_string()
        },
        if trend_slope.abs() < 1.0 {
            "Low trend strength".to_string()
        } else {
            format!("Trend strength: {:.2}%", trend_slope.abs())
        },
        if prediction_std_dev > last_price * 0.1 {
            format!("High prediction variance: {:.2}%", (prediction_std_dev / last_price) * 100.0)
        } else {
            format!("Prediction consistency: {:.1}%", prediction_consistency)
        },
    ];

    let mut recommendations = Vec::new();
    if overall_signal == "buy" {
        recommendations.push("Consider buying on dips".to_string());
        recommendations.push("Set stop-loss below recent support".to_string());
    } else if overall_signal == "sell" {
        recommendations.push("Consider taking profits".to_string());
        recommendations.push("Watch for reversal signals".to_string());
    } else {
        recommendations.push("Wait for clearer signals".to_string());
        recommendations.push("Monitor key support/resistance levels".to_string());
    }
    recommendations.push(format!("RSI at {:.1} suggests {}", last_rsi, 
        if last_rsi > 70.0 { "overbought" } else if last_rsi < 30.0 { "oversold" } else { "neutral" }));

    let indicators = vec![
        AIIndicator {
            name: "RSI".to_string(),
            value: last_rsi,
            signal: if last_rsi > 70.0 { "sell" } else if last_rsi < 30.0 { "buy" } else { "hold" }.to_string(),
        },
        AIIndicator {
            name: "MACD".to_string(),
            value: last_macd,
            signal: if last_macd > last_signal { "buy" } else { "sell" }.to_string(),
        },
        AIIndicator {
            name: "MA20".to_string(),
            value: last_ma20,
            signal: if last_price > last_ma20 { "buy" } else { "sell" }.to_string(),
        },
        AIIndicator {
            name: "MA50".to_string(),
            value: last_ma50,
            signal: if last_price > last_ma50 { "buy" } else { "sell" }.to_string(),
        },
    ];

    let price_targets = vec![
        AIPriceTarget {
            period: "1 week".to_string(),
            target: predicted_price * 1.02,
            probability: confidence * 0.8,
        },
        AIPriceTarget {
            period: "1 month".to_string(),
            target: predicted_price * 1.05,
            probability: confidence * 0.7,
        },
        AIPriceTarget {
            period: "3 months".to_string(),
            target: predicted_price * 1.10,
            probability: confidence * 0.6,
        },
    ];

    let analysis = format!(
        r#"Stock {} Analysis:

Current Price: {:.2} ({:.2}%)

Technical Analysis:
The stock is currently trading at {:.2}, showing a {} trend over the past period. 
RSI is at {:.1}, indicating {} conditions. MACD shows {}, suggesting {} momentum.

Moving averages indicate {} sentiment, with price {} the 20-day and 50-day moving averages.
The overall technical picture suggests a {} outlook.

Risk Assessment:
The stock exhibits {} volatility, classified as {} risk. Key risk factors include {}.

Recommendation:
Based on technical indicators, the recommended action is to {}. 
Investors should monitor key support and resistance levels, and consider the overall market conditions."#,
        symbol,
        last_price,
        price_change,
        last_price,
        trend,
        last_rsi,
        if last_rsi > 70.0 { "overbought" } else if last_rsi < 30.0 { "oversold" } else { "neutral" },
        if last_macd > last_signal { "positive" } else { "negative" },
        if last_macd > last_signal { "bullish" } else { "bearish" },
        if bullish_signals > bearish_signals { "bullish" } else { "bearish" },
        if last_price > last_ma20 && last_price > last_ma50 { "above" } else { "below" },
        trend,
        volatility,
        risk_level,
        risk_factors.join(", "),
        overall_signal,
    );

    Ok(AIAnalysisResult {
        analysis,
        prediction: AIPrediction {
            price: predicted_price,
            confidence,
            trend: trend.to_string(),
            reasoning: format!(
                "Based on {} trend analysis and technical indicators, the stock shows {} signals. 
                RSI at {:.1} and MACD {} suggest {} momentum.",
                trend,
                overall_signal,
                last_rsi,
                if last_macd > last_signal { "positive" } else { "negative" },
                trend
            ),
        },
        risk_assessment: AIRiskAssessment {
            level: risk_level.to_string(),
            factors: risk_factors,
        },
        recommendations,
        technical_summary: AITechnicalSummary {
            indicators,
            overall_signal: overall_signal.to_string(),
        },
        price_targets,
    })
}
