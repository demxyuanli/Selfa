use super::types::{StockData, AIAnalysisResult, AIPrediction, AIRiskAssessment, AITechnicalSummary, AIIndicator, AIPriceTarget};
use super::technical_indicators::{calculate_rsi, calculate_macd, calculate_sma};

pub fn extract_json_from_text(text: &str) -> String {
    let trimmed = text.trim();
    
    if trimmed.starts_with("```json") {
        if let Some(json_part) = trimmed.strip_prefix("```json") {
            if let Some(json_clean) = json_part.strip_suffix("```") {
                return json_clean.trim().to_string();
            }
            if let Some(start_pos) = json_part.find('{') {
                return extract_json_object(&json_part[start_pos..]);
            }
        }
    } else if trimmed.starts_with("```") {
        if let Some(json_part) = trimmed.strip_prefix("```") {
            if let Some(json_clean) = json_part.strip_suffix("```") {
                let cleaned = json_clean.trim();
                if let Some(start_pos) = cleaned.find('{') {
                    return extract_json_object(&cleaned[start_pos..]);
                }
                return cleaned.to_string();
            }
            if let Some(start_pos) = json_part.find('{') {
                return extract_json_object(&json_part[start_pos..]);
            }
        }
    }
    
    if let Some(start_pos) = trimmed.find('{') {
        return extract_json_object(&trimmed[start_pos..]);
    }
    
    trimmed.to_string()
}

pub fn find_json_in_text(text: &str) -> String {
    let extracted = extract_json_from_text(text);
    
    if let Some(start_pos) = text.find('{') {
        let mut best_json = String::new();
        let mut best_length = 0;
        
        for i in start_pos..text.len().min(start_pos + 100) {
            if text.chars().nth(i) == Some('{') {
                let candidate = extract_json_object(&text[i..]);
                if candidate.len() > best_length {
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
        
        return extracted;
    }
    
    extracted
}

pub fn extract_analysis_text(text: &str) -> Option<String> {
    if let Some(start) = text.find("\"analysis\"") {
        let remaining = &text[start..];
        if let Some(colon_pos) = remaining.find(':') {
            let value_start = colon_pos + 1;
            let value_text = &remaining[value_start..].trim();

            if value_text.starts_with('"') {
                let mut in_escape = false;
                let mut result = String::new();
                let mut chars = value_text.chars().skip(1);

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

    let cleaned = text.trim();
    if cleaned.len() > 50 && !cleaned.contains("error") && !cleaned.contains("Error") {
        Some(cleaned.to_string())
    } else {
        None
    }
}

pub fn extract_json_object(text: &str) -> String {
    let mut result = String::new();
    let mut depth = 0;
    let mut array_depth = 0;
    let mut in_string = false;
    let mut escape_next = false;
    let mut chars = text.chars().peekable();
    let mut started_with_array = false;
    
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
                        return result;
                    }
                }
            }
            _ => {
                result.push(ch);
            }
        }
    }
    
    if depth > 0 || array_depth > 0 {
        if in_string {
            result.push('"');
        }
        
        while array_depth > 0 {
            result.push(']');
            array_depth -= 1;
        }
        
        while depth > 0 {
            result.push('}');
            depth -= 1;
        }
    }
    
    result
}

pub fn patch_incomplete_ai_result(
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

    let analysis = partial_json.get("analysis")
        .and_then(|v| v.as_str())
        .unwrap_or("基于技术指标的分析")
        .to_string();

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

    let recommendations = partial_json.get("recommendations")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect())
        .unwrap_or_else(|| vec!["建议谨慎投资".to_string(), "关注市场变化".to_string()]);

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

pub fn fix_json_common_issues(json_str: &str) -> String {
    let fixed = json_str.to_string();
    
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
                let mut next_idx = i + 1;
                while next_idx < chars.len() && chars[next_idx].is_whitespace() {
                    next_idx += 1;
                }
                if next_idx < chars.len() && (chars[next_idx] == ']' || chars[next_idx] == '}') {
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

pub fn truncate_string_safe(text: &str, max_chars: usize) -> &str {
    let char_count = text.chars().count();
    if char_count <= max_chars {
        return text;
    }
    
    if let Some((idx, _)) = text.char_indices().nth(max_chars) {
        &text[..idx]
    } else {
        text
    }
}
