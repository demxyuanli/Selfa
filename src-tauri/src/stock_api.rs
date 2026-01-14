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

fn parse_symbol(symbol: &str) -> (String, String) {
    let code = symbol.trim();
    
    if code == "000001" {
        return (format!("1.{}", code), "SH".to_string());
    }
    
    if code.starts_with("6") {
        (format!("1.{}", code), "SH".to_string())
    } else if code.starts_with("0") || code.starts_with("3") {
        (format!("0.{}", code), "SZ".to_string())
    } else if code.contains(".") {
        let parts: Vec<&str> = code.split('.').collect();
        if parts.len() == 2 {
            (code.to_string(), parts[0].to_string())
        } else {
            (format!("1.{}", code), "SH".to_string())
        }
    } else {
        (format!("1.{}", code), "SH".to_string())
    }
}

pub async fn fetch_stock_quote(symbol: &str) -> Result<StockQuote, String> {
    let (secid, _) = parse_symbol(symbol);
    let fields = "f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f57,f58,f107,f137,f170,f171,f184";
    let url = format!(
        "http://push2.eastmoney.com/api/qt/stock/get?secid={}&fields={}",
        secid, fields
    );
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|e| format!("Client error: {}", e))?;
    
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }
    
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;
    
    let data = &json["data"];
    if data.is_null() {
        return Err("No data returned".to_string());
    }
    
    let price = data["f43"].as_f64().unwrap_or(0.0) / 100.0;
    let previous_close = data["f60"].as_f64().unwrap_or(price * 100.0) / 100.0;
    let high = data["f44"].as_f64().unwrap_or(price * 100.0) / 100.0;
    let low = data["f45"].as_f64().unwrap_or(price * 100.0) / 100.0;
    let open = data["f46"].as_f64().unwrap_or(price * 100.0) / 100.0;
    let volume = data["f47"].as_i64().unwrap_or(0);
    let change = data["f169"].as_f64().unwrap_or(0.0) / 100.0;
    let change_percent = data["f170"].as_f64().unwrap_or(0.0) / 100.0;
    let market_cap = data["f116"].as_i64();
    
    let name = data["f58"]
        .as_str()
        .unwrap_or(symbol)
        .to_string();
    
    Ok(StockQuote {
        symbol: symbol.to_string(),
        name,
        price,
        change,
        change_percent,
        volume,
        market_cap,
        high,
        low,
        open,
        previous_close,
    })
}

pub async fn fetch_time_series(symbol: &str) -> Result<Vec<StockData>, String> {
    let (secid, _) = parse_symbol(symbol);
    
    let url = format!(
        "http://push2his.eastmoney.com/api/qt/stock/kline/get?secid={}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=1&fqt=1&beg=0&end=20500000&lmt=1200",
        secid
    );
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|e| format!("Client error: {}", e))?;
    
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }
    
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;
    
    let data = &json["data"];
    if data.is_null() {
        return Err("No data returned".to_string());
    }
    
    let klines = data["klines"]
        .as_array()
        .ok_or("No kline data")?;
    
    let mut result = Vec::new();
    
    for kline in klines {
        if let Some(line) = kline.as_str() {
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() >= 6 {
                let date = parts[0].to_string();
                let open = parts[1].parse::<f64>().unwrap_or(0.0);
                let close = parts[2].parse::<f64>().unwrap_or(0.0);
                let high = parts[3].parse::<f64>().unwrap_or(0.0);
                let low = parts[4].parse::<f64>().unwrap_or(0.0);
                let volume = parts[5].parse::<i64>().unwrap_or(0);
                
                result.push(StockData {
                    date,
                    open,
                    high,
                    low,
                    close,
                    volume,
                });
            }
        }
    }
    
    Ok(result)
}

pub async fn fetch_stock_history(symbol: &str, period: &str) -> Result<Vec<StockData>, String> {
    let (secid, _) = parse_symbol(symbol);
    
    let (klt, limit) = match period {
        "5m" => (5, 240),
        "30m" => (30, 240),
        "60m" => (60, 240),
        "120m" => (15, 240),
        "5d" => (1, 1200),
        "1d" => (101, 240),
        "1w" => (102, 240),
        "1mo" => (103, 240),
        "1y" => (101, 365),
        "2y" => (103, 24),
        "5y" => (103, 60),
        _ => (101, 240),
    };
    
    let url = format!(
        "http://push2his.eastmoney.com/api/qt/stock/kline/get?secid={}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt={}&fqt=1&beg=0&end=20500000&lmt={}",
        secid, klt, limit
    );
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|e| format!("Client error: {}", e))?;
    
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }
    
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;
    
    let data = &json["data"];
    if data.is_null() {
        return Err("No data returned".to_string());
    }
    
    let klines = data["klines"]
        .as_array()
        .ok_or("No kline data")?;
    
    let mut result = Vec::new();
    
    for kline in klines {
        if let Some(line) = kline.as_str() {
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() >= 6 {
                let date = parts[0].to_string();
                let open = parts[1].parse::<f64>().unwrap_or(0.0);
                let close = parts[2].parse::<f64>().unwrap_or(0.0);
                let high = parts[3].parse::<f64>().unwrap_or(0.0);
                let low = parts[4].parse::<f64>().unwrap_or(0.0);
                let volume = parts[5].parse::<i64>().unwrap_or(0);
                
                result.push(StockData {
                    date,
                    open,
                    high,
                    low,
                    close,
                    volume,
                });
            }
        }
    }
    
    Ok(result)
}

pub async fn search_stocks_by_query(query: &str) -> Result<Vec<StockInfo>, String> {
    let encoded_query = urlencoding::encode(query);
    let url = format!(
        "http://searchapi.eastmoney.com/api/suggest/get?input={}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8",
        encoded_query
    );
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|e| format!("Client error: {}", e))?;
    
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }
    
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;
    
    let quotes = json["QuotationCodeTable"]["Data"]
        .as_array()
        .ok_or("Invalid response format")?;
    
    let mut results = Vec::new();
    
    for quote in quotes.iter().take(10) {
        let code = quote["Code"].as_str().unwrap_or("");
        let name = quote["Name"].as_str().unwrap_or("");
        let market = quote["Market"].as_i64().unwrap_or(1);
        
        let exchange = if market == 1 {
            "SH".to_string()
        } else {
            "SZ".to_string()
        };
        
        results.push(StockInfo {
            symbol: code.to_string(),
            name: name.to_string(),
            exchange,
        });
    }
    
    Ok(results)
}

pub fn calculate_indicators(data: Vec<StockData>) -> TechnicalIndicators {
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    
    let sma_20 = calculate_sma(&closes, 20);
    let sma_50 = calculate_sma(&closes, 50);
    let ema_12 = calculate_ema(&closes, 12);
    let ema_26 = calculate_ema(&closes, 26);
    let rsi = calculate_rsi(&closes, 14);
    
    let macd_result = calculate_macd(&closes, 12, 26, 9);
    
    TechnicalIndicators {
        sma_20,
        sma_50,
        ema_12,
        ema_26,
        rsi,
        macd: macd_result.macd,
        macd_signal: macd_result.signal,
        macd_histogram: macd_result.histogram,
    }
}

fn calculate_sma(data: &[f64], period: usize) -> Vec<f64> {
    let mut result = Vec::new();
    
    for i in 0..data.len() {
        if i < period - 1 {
            result.push(0.0);
        } else {
            let sum: f64 = data[i.saturating_sub(period - 1)..=i].iter().sum();
            result.push(sum / period as f64);
        }
    }
    
    result
}

fn calculate_ema(data: &[f64], period: usize) -> Vec<f64> {
    if data.is_empty() {
        return Vec::new();
    }
    
    let multiplier = 2.0 / (period as f64 + 1.0);
    let mut result = Vec::new();
    let mut ema = data[0];
    
    result.push(ema);
    
    for i in 1..data.len() {
        ema = (data[i] * multiplier) + (ema * (1.0 - multiplier));
        result.push(ema);
    }
    
    result
}

fn calculate_rsi(data: &[f64], period: usize) -> Vec<f64> {
    if data.len() < period + 1 {
        return vec![0.0; data.len()];
    }
    
    let mut gains = Vec::new();
    let mut losses = Vec::new();
    
    for i in 1..data.len() {
        let change = data[i] - data[i - 1];
        gains.push(if change > 0.0 { change } else { 0.0 });
        losses.push(if change < 0.0 { -change } else { 0.0 });
    }
    
    let mut result = vec![0.0; period];
    
    for i in period..gains.len() {
        let avg_gain: f64 = gains[i.saturating_sub(period)..=i].iter().sum::<f64>() / period as f64;
        let avg_loss: f64 = losses[i.saturating_sub(period)..=i].iter().sum::<f64>() / period as f64;
        
        if avg_loss == 0.0 {
            result.push(100.0);
        } else {
            let rs = avg_gain / avg_loss;
            result.push(100.0 - (100.0 / (1.0 + rs)));
        }
    }
    
    result
}

struct MacdResult {
    macd: Vec<f64>,
    signal: Vec<f64>,
    histogram: Vec<f64>,
}

fn calculate_macd(data: &[f64], fast: usize, slow: usize, signal: usize) -> MacdResult {
    let ema_fast = calculate_ema(data, fast);
    let ema_slow = calculate_ema(data, slow);
    
    let macd_line: Vec<f64> = ema_fast
        .iter()
        .zip(ema_slow.iter())
        .map(|(f, s)| f - s)
        .collect();
    
    let signal_line = calculate_ema(&macd_line, signal);
    
    let histogram: Vec<f64> = macd_line
        .iter()
        .zip(signal_line.iter())
        .map(|(m, s)| m - s)
        .collect();
    
    MacdResult {
        macd: macd_line,
        signal: signal_line,
        histogram,
    }
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

pub fn predict_stock_price(
    data: &[StockData],
    method: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 20 {
        return Err("Insufficient data for prediction".to_string());
    }

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let dates: Vec<String> = data.iter().map(|d| d.date.clone()).collect();
    let last_date = dates.last().unwrap().clone();

    let predictions = match method {
        "linear" => predict_linear_regression(&closes, &last_date, period)?,
        "ma" => predict_moving_average(&closes, &last_date, period)?,
        "technical" => predict_technical_indicator(&closes, &last_date, period)?,
        "polynomial" => predict_polynomial(&closes, &last_date, period)?,
        "arima" => predict_arima(&closes, &last_date, period)?,
        "exponential" => predict_exponential_smoothing(&closes, &last_date, period)?,
        "mean_reversion" => predict_mean_reversion(&closes, &last_date, period)?,
        "wma" => predict_weighted_ma(&closes, &last_date, period)?,
        "pattern" => predict_pattern_recognition(data, &last_date, period)?,
        "similarity" => predict_similarity_match(&closes, &last_date, period)?,
        "ensemble" => predict_ensemble(data, &last_date, period)?,
        _ => return Err(format!("Unknown prediction method: {}", method)),
    };

    Ok(predictions)
}

fn predict_linear_regression(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let n = closes.len();
    if n < 2 {
        return Err("Need at least 2 data points".to_string());
    }

    let recent_data = &closes[n.saturating_sub(30)..];
    let n_recent = recent_data.len();

    let x_sum: f64 = (0..n_recent).map(|i| i as f64).sum();
    let y_sum: f64 = recent_data.iter().sum();
    let xy_sum: f64 = (0..n_recent)
        .map(|i| i as f64 * recent_data[i])
        .sum();
    let x2_sum: f64 = (0..n_recent).map(|i| (i as f64).powi(2)).sum();

    let slope = (n_recent as f64 * xy_sum - x_sum * y_sum)
        / (n_recent as f64 * x2_sum - x_sum * x_sum);
    let intercept = (y_sum - slope * x_sum) / n_recent as f64;

    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;

    for i in 1..=period {
        let x = n_recent as f64 + i as f64;
        let predicted = slope * x + intercept;
        let variance = calculate_variance(recent_data);
        let std_dev = variance.sqrt();
        let confidence = (100.0 - (std_dev / predicted * 100.0).min(50.0)).max(30.0);

        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, closes[closes.len() - 1], slope),
            upper_bound: predicted + std_dev,
            lower_bound: predicted - std_dev,
            method: "linear".to_string(),
        });
    }

    Ok(results)
}

fn predict_moving_average(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let ma5 = calculate_sma(closes, 5);
    let ma10 = calculate_sma(closes, 10);
    let ma20 = calculate_sma(closes, 20);

    let last_ma5 = ma5.iter().rev().find(|&&x| x > 0.0).copied().unwrap_or(closes[closes.len() - 1]);
    let last_ma10 = ma10.iter().rev().find(|&&x| x > 0.0).copied().unwrap_or(closes[closes.len() - 1]);
    let last_ma20 = ma20.iter().rev().find(|&&x| x > 0.0).copied().unwrap_or(closes[closes.len() - 1]);

    let ma5_slope = if ma5.len() >= 2 {
        let valid_ma5: Vec<f64> = ma5.iter().filter(|&&x| x > 0.0).copied().collect();
        if valid_ma5.len() >= 2 {
            (valid_ma5[valid_ma5.len() - 1] - valid_ma5[valid_ma5.len() - 2]) / 1.0
        } else {
            0.0
        }
    } else {
        0.0
    };

    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;

    for i in 1..=period {
        let predicted = last_ma5 + ma5_slope * i as f64;
        let confidence = if last_ma5 > last_ma10 && last_ma10 > last_ma20 {
            70.0
        } else if last_ma5 < last_ma10 && last_ma10 < last_ma20 {
            70.0
        } else {
            50.0
        };

        let variance = calculate_variance(closes);
        let std_dev = variance.sqrt();

        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, closes[closes.len() - 1], ma5_slope),
            upper_bound: predicted + std_dev * 0.5,
            lower_bound: predicted - std_dev * 0.5,
            method: "ma".to_string(),
        });
    }

    Ok(results)
}

fn predict_technical_indicator(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let rsi = calculate_rsi(closes, 14);
    let ema12 = calculate_ema(closes, 12);
    let ema26 = calculate_ema(closes, 26);

    let last_rsi = rsi.last().copied().unwrap_or(50.0);
    let last_ema12 = ema12.last().copied().unwrap_or(closes[closes.len() - 1]);
    let last_ema26 = ema26.last().copied().unwrap_or(closes[closes.len() - 1]);

    let trend = if last_ema12 > last_ema26 { 1.0 } else { -1.0 };
    let rsi_factor = (last_rsi - 50.0) / 50.0;

    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let last_price = closes[closes.len() - 1];

    for i in 1..=period {
        let change_factor = trend * (1.0 + rsi_factor * 0.1) * (1.0 - i as f64 * 0.02);
        let predicted = last_price * (1.0 + change_factor * 0.01);

        let confidence = if (last_rsi < 30.0 && trend > 0.0) || (last_rsi > 70.0 && trend < 0.0) {
            75.0
        } else if (last_rsi < 40.0 && trend > 0.0) || (last_rsi > 60.0 && trend < 0.0) {
            65.0
        } else {
            55.0
        };

        let variance = calculate_variance(closes);
        let std_dev = variance.sqrt();

        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, last_price, trend),
            upper_bound: predicted + std_dev * 0.6,
            lower_bound: predicted - std_dev * 0.6,
            method: "technical".to_string(),
        });
    }

    Ok(results)
}

fn predict_polynomial(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let recent_data = &closes[closes.len().saturating_sub(30)..];
    let n = recent_data.len();
    if n < 3 {
        return Err("Need at least 3 data points for polynomial regression".to_string());
    }

    let degree = 2;
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;

    for i in 1..=period {
        let x = n as f64 + i as f64;
        let predicted = polynomial_predict(recent_data, x, degree);
        let variance = calculate_variance(recent_data);
        let std_dev = variance.sqrt();
        let confidence = (100.0 - (std_dev / predicted * 100.0).min(40.0)).max(35.0);

        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, closes[closes.len() - 1], 0.0),
            upper_bound: predicted + std_dev,
            lower_bound: predicted - std_dev,
            method: "polynomial".to_string(),
        });
    }

    Ok(results)
}

fn calculate_variance(data: &[f64]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }
    let mean = data.iter().sum::<f64>() / data.len() as f64;
    let variance = data.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / data.len() as f64;
    variance
}

fn determine_signal(predicted: f64, current: f64, trend: f64) -> String {
    let change_percent = (predicted - current) / current * 100.0;
    if change_percent > 2.0 && trend > 0.0 {
        "buy".to_string()
    } else if change_percent < -2.0 && trend < 0.0 {
        "sell".to_string()
    } else {
        "hold".to_string()
    }
}

fn parse_date(date_str: &str) -> Result<chrono::NaiveDate, String> {
    if date_str.contains(" ") {
        let date_part = date_str.split(" ").next().unwrap();
        chrono::NaiveDate::parse_from_str(date_part, "%Y-%m-%d")
            .or_else(|_| chrono::NaiveDate::parse_from_str(date_part, "%Y/%m/%d"))
            .map_err(|e| format!("Failed to parse date: {}", e))
    } else {
        chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
            .or_else(|_| chrono::NaiveDate::parse_from_str(date_str, "%Y/%m/%d"))
            .map_err(|e| format!("Failed to parse date: {}", e))
    }
}

fn add_days(date: &chrono::NaiveDate, days: i32) -> Result<String, String> {
    let new_date = *date + chrono::Duration::days(days as i64);
    Ok(new_date.format("%Y-%m-%d").to_string())
}

fn polynomial_predict(data: &[f64], x: f64, degree: usize) -> f64 {
    let n = data.len();
    let mut coeffs = vec![0.0; degree + 1];

    for i in 0..n {
        let xi = i as f64;
        let yi = data[i];
        for j in 0..=degree {
            coeffs[j] += yi * xi.powi(j as i32);
        }
    }

    for j in 0..=degree {
        coeffs[j] /= n as f64;
    }

    let mut result = 0.0;
    for j in 0..=degree {
        result += coeffs[j] * x.powi(j as i32);
    }
    result
}

// ARIMA (simplified - AutoRegressive Integrated Moving Average)
fn predict_arima(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 20 {
        return Err("Need at least 20 data points for ARIMA".to_string());
    }

    let recent_data = &closes[closes.len().saturating_sub(30)..];
    let n = recent_data.len();
    
    // Calculate first difference (I=1)
    let mut diff: Vec<f64> = Vec::new();
    for i in 1..n {
        diff.push(recent_data[i] - recent_data[i - 1]);
    }
    
    // Simple AR(1) model: y_t = c + φ*y_{t-1} + ε
    let mut phi = 0.0;
    let mut sum_prev = 0.0;
    let mut sum_curr = 0.0;
    let mut sum_prev_sq = 0.0;
    
    for i in 1..diff.len() {
        sum_prev += diff[i - 1];
        sum_curr += diff[i];
        sum_prev_sq += diff[i - 1] * diff[i - 1];
    }
    
    if sum_prev_sq > 0.0 {
        phi = sum_curr / sum_prev;
    }
    
    // MA component (simplified)
    let ma_coeff = 0.3;
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let last_value = recent_data[n - 1];
    let mut last_diff = diff.last().copied().unwrap_or(0.0);
    
    for i in 1..=period {
        // ARIMA(1,1,1) prediction
        let predicted_diff = phi * last_diff * (1.0 - ma_coeff);
        last_diff = predicted_diff;
        let predicted = last_value + predicted_diff * i as f64;
        
        let variance = calculate_variance(&diff);
        let std_dev = variance.sqrt();
        let confidence = (100.0 - (std_dev / predicted.abs().max(0.01) * 100.0).min(45.0)).max(40.0);
        
        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, closes[closes.len() - 1], phi),
            upper_bound: predicted + std_dev,
            lower_bound: predicted - std_dev,
            method: "arima".to_string(),
        });
    }
    
    Ok(results)
}

// Exponential Smoothing (Holt-Winters simplified)
fn predict_exponential_smoothing(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 10 {
        return Err("Need at least 10 data points".to_string());
    }
    
    let recent_data = &closes[closes.len().saturating_sub(30)..];
    let alpha = 0.3; // Smoothing parameter
    let beta = 0.1;  // Trend parameter
    
    let mut level = recent_data[0];
    let mut trend = if recent_data.len() > 1 {
        recent_data[1] - recent_data[0]
    } else {
        0.0
    };
    
    // Initialize level and trend
    for i in 1..recent_data.len() {
        let prev_level = level;
        level = alpha * recent_data[i] + (1.0 - alpha) * (level + trend);
        trend = beta * (level - prev_level) + (1.0 - beta) * trend;
    }
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    
    for i in 1..=period {
        let predicted = level + trend * i as f64;
        let variance = calculate_variance(recent_data);
        let std_dev = variance.sqrt();
        let confidence = (100.0 - (std_dev / predicted * 100.0).min(40.0)).max(45.0);
        
        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, closes[closes.len() - 1], trend),
            upper_bound: predicted + std_dev * 0.8,
            lower_bound: predicted - std_dev * 0.8,
            method: "exponential".to_string(),
        });
    }
    
    Ok(results)
}

// Mean Reversion
fn predict_mean_reversion(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 20 {
        return Err("Need at least 20 data points".to_string());
    }
    
    let recent_data = &closes[closes.len().saturating_sub(30)..];
    let mean = recent_data.iter().sum::<f64>() / recent_data.len() as f64;
    let last_price = recent_data[recent_data.len() - 1];
    let deviation = last_price - mean;
    
    // Mean reversion speed (half-life)
    let half_life = 5.0;
    let reversion_speed = 1.0 - (0.5_f64).powf(1.0 / half_life);
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    
    for i in 1..=period {
        // Revert towards mean
        let remaining_deviation = deviation * (1.0 - reversion_speed).powi(i as i32);
        let predicted = mean + remaining_deviation;
        
        let variance = calculate_variance(recent_data);
        let std_dev = variance.sqrt();
        let confidence = if deviation.abs() / mean > 0.05 {
            60.0 // Higher confidence when far from mean
        } else {
            45.0
        };
        
        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: if deviation > 0.0 { "sell" } else { "buy" }.to_string(),
            upper_bound: predicted + std_dev * 0.7,
            lower_bound: predicted - std_dev * 0.7,
            method: "mean_reversion".to_string(),
        });
    }
    
    Ok(results)
}

// Weighted Moving Average
fn predict_weighted_ma(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 10 {
        return Err("Need at least 10 data points".to_string());
    }
    
    let recent_data = &closes[closes.len().saturating_sub(20)..];
    let n = recent_data.len();
    
    // Calculate WMA with linear weights (more recent = higher weight)
    let mut wma = 0.0;
    let mut weight_sum = 0.0;
    for i in 0..n {
        let weight = (i + 1) as f64;
        wma += recent_data[i] * weight;
        weight_sum += weight;
    }
    wma /= weight_sum;
    
    // Calculate trend from WMA
    let wma_prev = {
        let mut prev_wma = 0.0;
        let mut prev_weight_sum = 0.0;
        for i in 0..n.saturating_sub(1) {
            let weight = (i + 1) as f64;
            prev_wma += recent_data[i] * weight;
            prev_weight_sum += weight;
        }
        if prev_weight_sum > 0.0 { prev_wma / prev_weight_sum } else { wma }
    };
    
    let trend = wma - wma_prev;
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    
    for i in 1..=period {
        let predicted = wma + trend * i as f64;
        let variance = calculate_variance(recent_data);
        let std_dev = variance.sqrt();
        let confidence = (100.0 - (std_dev / predicted * 100.0).min(40.0)).max(50.0);
        
        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, closes[closes.len() - 1], trend),
            upper_bound: predicted + std_dev * 0.6,
            lower_bound: predicted - std_dev * 0.6,
            method: "wma".to_string(),
        });
    }
    
    Ok(results)
}

// Pattern Recognition (rule-based)
fn predict_pattern_recognition(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 10 {
        return Err("Need at least 10 data points".to_string());
    }
    
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let volumes: Vec<f64> = data.iter().map(|d| d.volume as f64).collect();
    let recent_closes = &closes[closes.len().saturating_sub(10)..];
    let recent_volumes = &volumes[volumes.len().saturating_sub(10)..];
    
    // Pattern: Breakthrough (price breaks resistance with volume)
    let resistance = recent_closes.iter().fold(0.0_f64, |a, &b| a.max(b));
    let support = recent_closes.iter().fold(f64::INFINITY, |a, &b| a.min(b));
    let last_price = recent_closes[recent_closes.len() - 1];
    let avg_volume = recent_volumes.iter().sum::<f64>() / recent_volumes.len() as f64;
    let last_volume = recent_volumes[recent_volumes.len() - 1];
    
    // Detect patterns
    let is_breakthrough = last_price > resistance * 0.98 && last_volume > avg_volume * 1.2;
    let is_support_bounce = last_price < support * 1.02 && last_price > support * 0.98;
    
    let trend = if is_breakthrough {
        1.0 // Bullish
    } else if is_support_bounce {
        0.5 // Neutral-bullish
    } else if last_price < (resistance + support) / 2.0 {
        -0.5 // Bearish
    } else {
        0.0 // Neutral
    };
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let price_range = resistance - support;
    
    for i in 1..=period {
        let change_factor = trend * (1.0 - i as f64 * 0.05);
        let predicted = last_price + price_range * change_factor * 0.1;
        
        let confidence = if is_breakthrough || is_support_bounce {
            65.0
        } else {
            50.0
        };
        
        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: if trend > 0.3 { "buy" } else if trend < -0.3 { "sell" } else { "hold" }.to_string(),
            upper_bound: predicted + price_range * 0.1,
            lower_bound: predicted - price_range * 0.1,
            method: "pattern".to_string(),
        });
    }
    
    Ok(results)
}

// Similarity Matching
fn predict_similarity_match(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 20 {
        return Err("Need at least 20 data points".to_string());
    }
    
    let window_size = 10.min(closes.len() / 2);
    let recent_pattern = &closes[closes.len() - window_size..];
    
    // Find similar historical patterns
    let mut best_match_idx = 0;
    let mut best_similarity = f64::INFINITY;
    
    for i in 0..(closes.len() - window_size * 2) {
        let historical_pattern = &closes[i..i + window_size];
        
        // Calculate Euclidean distance (similarity)
        let distance: f64 = recent_pattern.iter()
            .zip(historical_pattern.iter())
            .map(|(a, b)| (a - b).powi(2))
            .sum();
        
        if distance < best_similarity {
            best_similarity = distance;
            best_match_idx = i;
        }
    }
    
    // Use the pattern after the best match
    let match_start = best_match_idx + window_size;
    let match_end = (match_start + period).min(closes.len());
    let matched_pattern = &closes[match_start..match_end];
    
    // Normalize and project
    let recent_mean = recent_pattern.iter().sum::<f64>() / recent_pattern.len() as f64;
    let matched_mean = matched_pattern.iter().sum::<f64>() / matched_pattern.len() as f64;
    let scale_factor = recent_mean / matched_mean.max(0.01);
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    
    for (i, &matched_price) in matched_pattern.iter().enumerate().take(period) {
        let predicted = matched_price * scale_factor;
        let variance = calculate_variance(recent_pattern);
        let std_dev = variance.sqrt();
        let confidence = (100.0 - (best_similarity.sqrt() / recent_mean * 100.0).min(50.0)).max(45.0);
        
        let date = add_days(&base_date, (i + 1) as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: determine_signal(predicted, closes[closes.len() - 1], 0.0),
            upper_bound: predicted + std_dev,
            lower_bound: predicted - std_dev,
            method: "similarity".to_string(),
        });
    }
    
    // Fill remaining if needed
    if results.len() < period {
        let last_pred = results.last().map(|r| r.predicted_price).unwrap_or(closes[closes.len() - 1]);
        for i in results.len()..period {
            let date = add_days(&base_date, (i + 1) as i32)?;
            results.push(PredictionResult {
                date,
                predicted_price: last_pred,
                confidence: 40.0,
                signal: "hold".to_string(),
                upper_bound: last_pred * 1.02,
                lower_bound: last_pred * 0.98,
                method: "similarity".to_string(),
            });
        }
    }
    
    Ok(results)
}

// Ensemble Method (combine multiple methods)
fn predict_ensemble(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    
    // Get predictions from multiple methods
    let methods = vec!["linear", "ma", "technical", "wma"];
    let mut all_predictions: Vec<Vec<PredictionResult>> = Vec::new();
    
    for method in methods {
        if let Ok(preds) = match method {
            "linear" => predict_linear_regression(&closes, start_date, period),
            "ma" => predict_moving_average(&closes, start_date, period),
            "technical" => predict_technical_indicator(&closes, start_date, period),
            "wma" => predict_weighted_ma(&closes, start_date, period),
            _ => continue,
        } {
            all_predictions.push(preds);
        }
    }
    
    if all_predictions.is_empty() {
        return Err("Failed to generate ensemble predictions".to_string());
    }
    
    // Weighted average (equal weights for simplicity)
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    
    for i in 0..period {
        let mut sum_price = 0.0;
        let mut sum_confidence = 0.0;
        let mut count = 0;
        
        for preds in &all_predictions {
            if i < preds.len() {
                sum_price += preds[i].predicted_price;
                sum_confidence += preds[i].confidence;
                count += 1;
            }
        }
        
        if count > 0 {
            let predicted = sum_price / count as f64;
            let avg_confidence = sum_confidence / count as f64;
            let variance = calculate_variance(&closes);
            let std_dev = variance.sqrt();
            
            let date = add_days(&base_date, (i + 1) as i32)?;
            results.push(PredictionResult {
                date,
                predicted_price: predicted,
                confidence: avg_confidence.min(75.0), // Cap at 75% for ensemble
                signal: determine_signal(predicted, closes[closes.len() - 1], 0.0),
                upper_bound: predicted + std_dev * 0.7,
                lower_bound: predicted - std_dev * 0.7,
                method: "ensemble".to_string(),
            });
        }
    }
    
    Ok(results)
}
