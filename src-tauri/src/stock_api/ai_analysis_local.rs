use super::types::{StockData, StockQuote, AIAnalysisResult, AIPrediction, AIRiskAssessment, AITechnicalSummary, AIIndicator, AIPriceTarget};
use super::utils::calculate_variance;
use super::technical_indicators::{calculate_rsi, calculate_macd, calculate_sma, calculate_ema};
use super::prediction::{predict_linear_regression, predict_moving_average, predict_technical_indicator, predict_polynomial, predict_exponential_smoothing};
use super::prediction_advanced::predict_ensemble;
use super::types::PredictionResult;

pub fn generate_local_ai_analysis(
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

    let last_date = data.last().map(|d| d.date.as_str()).unwrap_or("");
    let prediction_methods = vec!["linear", "ma", "technical", "polynomial", "exponential", "ensemble"];
    let prediction_period = 10;
    
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
            let predictions: Vec<PredictionResult> = predictions;
            if let Some(last_pred) = predictions.last() {
                prediction_prices.push(last_pred.predicted_price);
                prediction_confidences.push(last_pred.confidence);
            }
        }
    }
    
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
        last_price * (1.0 + trend_slope / 100.0 * 0.1)
    };
    
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

    let base_confidence = (50.0 + (bullish_signals + bearish_signals) as f64 * 5.0).min(85.0);
    let avg_prediction_confidence = if !prediction_confidences.is_empty() {
        prediction_confidences.iter().sum::<f64>() / prediction_confidences.len() as f64
    } else {
        60.0
    };
    
    let confidence = (base_confidence * 0.4 + avg_prediction_confidence * 0.6 * (prediction_consistency / 100.0)).min(90.0);

    let volatility = calculate_variance(&closes).sqrt() / last_price * 100.0;
    let risk_level = if volatility > 5.0 {
        "high"
    } else if volatility > 2.0 {
        "medium"
    } else {
        "low"
    };

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

pub fn create_fallback_analysis(analysis_text: String, _symbol: &str, data: &[StockData]) -> AIAnalysisResult {
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

pub fn format_recent_data(data: &[StockData]) -> String {
    let recent = data.iter().rev().take(10).rev();
    recent
        .map(|d| format!("{}: O={:.2}, H={:.2}, L={:.2}, C={:.2}, V={}", 
            d.date, d.open, d.high, d.low, d.close, d.volume))
        .collect::<Vec<_>>()
        .join("\n")
}
