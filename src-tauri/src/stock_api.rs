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
    // f43: price, f44: high, f45: low, f46: open, f47: volume, f48: turnover (交易额)
    // f58: name, f60: previous_close, f169: change, f170: change_percent
    // f116: total_market_cap (total market capitalization), f117: circulation_market_cap
    // f115: pe_ratio (TTM PE / 滚动市盈率)
    let fields = "f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f57,f58,f60,f107,f115,f116,f117,f137,f169,f170,f171,f184";
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
    
    // f116: total market cap (total market capitalization) in yuan (元)
    // f117: circulation market cap (free float market value) in yuan (元)
    let market_cap = data["f116"].as_i64().or_else(|| {
        // Fallback to circulation market cap if total market cap is not available
        data["f117"].as_i64()
    });
    
    // f115: pe_ratio (TTM PE / 滚动市盈率) - value is already in correct format, no scaling needed
    let pe_ratio = data["f115"].as_f64();
    
    // f48: turnover (交易额/成交额) in yuan (元)
    let turnover = data["f48"].as_i64();
    
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
        pe_ratio,
        turnover,
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
    let price_change = if closes.len() >= 2 {
        ((last_price - closes[closes.len() - 2]) / closes[closes.len() - 2]) * 100.0
    } else {
        0.0
    };

    let rsi = calculate_rsi(&closes, 14);
    let macd_result = calculate_macd(&closes, 12, 26, 9);
    let ma20 = calculate_sma(&closes, 20);
    let ma50 = calculate_sma(&closes, 50);

    let last_rsi = rsi.last().copied().unwrap_or(50.0);
    let last_macd = macd_result.macd.last().copied().unwrap_or(0.0);
    let last_signal = macd_result.signal.last().copied().unwrap_or(0.0);
    let last_ma20 = ma20.iter().rev().find(|&&x| x > 0.0).copied().unwrap_or(last_price);
    let last_ma50 = ma50.iter().rev().find(|&&x| x > 0.0).copied().unwrap_or(last_price);

    let prompt = format!(
        r#"Please analyze the following stock data and provide a comprehensive analysis in JSON format. IMPORTANT: All text content must be in Chinese (Simplified Chinese).

Stock Symbol: {}
Current Price: {:.2}
Price Change: {:.2}%

Recent Price Data (last 10 days):
{}

Technical Indicators:
- RSI (14): {:.2}
- MACD: {:.2}, Signal: {:.2}
- MA20: {:.2}, MA50: {:.2}
- Current Price vs MA20: {:.2}%
- Current Price vs MA50: {:.2}%

Please provide analysis in the following JSON format (all text fields must be in Chinese):
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

IMPORTANT: All text content in the JSON response must be in Simplified Chinese. Respond ONLY with valid JSON, no additional text."#,
        symbol,
        last_price,
        price_change,
        format_recent_data(data),
        last_rsi,
        last_macd,
        last_signal,
        last_ma20,
        last_ma50,
        ((last_price - last_ma20) / last_ma20) * 100.0,
        ((last_price - last_ma50) / last_ma50) * 100.0,
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
                {"role": "system", "content": "You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. IMPORTANT: All text content must be in Simplified Chinese (中文)."},
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
            "You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. IMPORTANT: All text content must be in Simplified Chinese (中文).\n\n{}",
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
            "You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. IMPORTANT: All text content must be in Simplified Chinese (中文).\n\n{}",
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
            "inputs": format!("You are a professional stock market analyst. Provide accurate, data-driven analysis in JSON format. IMPORTANT: All text content must be in Simplified Chinese (中文).\n\n{}", prompt),
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

    // Clean and extract JSON from content
    let cleaned_content = extract_json_from_text(content);

    // Try to parse JSON, with fallback for incomplete responses
    let result: AIAnalysisResult = match serde_json::from_str(&cleaned_content) {
        Ok(parsed) => parsed,
        Err(e) => {
            // Try to find and extract JSON object more aggressively
            let json_candidate = find_json_in_text(&cleaned_content);
            match serde_json::from_str(&json_candidate) {
                Ok(parsed) => parsed,
                Err(e2) => {
                    // If JSON parsing still fails, try to extract at least the analysis text
                    // and create a minimal valid response
                    if let Some(analysis_text) = extract_analysis_text(&cleaned_content) {
                        eprintln!("AI API partially failed, using fallback analysis. Error: {}", e2);
                        create_fallback_analysis(analysis_text, symbol, data)
                    } else {
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
                        return Err(format!("Failed to parse AI response: {}. Original error: {}. Content length: {}. Preview: {}",
                            e2, e, cleaned_content.len(), preview));
                    }
                }
            }
        }
    };

    Ok(result)
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
fn create_fallback_analysis(analysis_text: String, symbol: &str, data: &[StockData]) -> AIAnalysisResult {
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
    let mut in_string = false;
    let mut escape_next = false;
    let mut chars = text.chars().peekable();
    
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
                    if depth == 0 {
                        // Found complete JSON object
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
    if depth > 0 {
        // Try to close unclosed objects/arrays
        while depth > 0 {
            // Check if we're in the middle of a string
            if in_string {
                // Close the string
                result.push('"');
                in_string = false;
            }
            // Close objects/arrays
            result.push('}');
            depth -= 1;
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

    let mut bullish_signals = 0;
    let mut bearish_signals = 0;

    if last_price > last_ma20 { bullish_signals += 1; } else { bearish_signals += 1; }
    if last_price > last_ma50 { bullish_signals += 1; } else { bearish_signals += 1; }
    if last_ma20 > last_ma50 { bullish_signals += 1; } else { bearish_signals += 1; }
    if last_ema12 > last_ema26 { bullish_signals += 1; } else { bearish_signals += 1; }
    if last_macd > last_signal { bullish_signals += 1; } else { bearish_signals += 1; }
    if last_rsi > 50.0 { bullish_signals += 1; } else { bearish_signals += 1; }

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

    let predicted_price = if trend_slope > 0.0 {
        last_price * (1.0 + trend_slope / 100.0 * 0.1)
    } else {
        last_price * (1.0 + trend_slope / 100.0 * 0.1)
    };

    let confidence = (50.0 + (bullish_signals + bearish_signals) as f64 * 5.0).min(85.0);

    let volatility = calculate_variance(&closes).sqrt() / last_price * 100.0;
    let risk_level = if volatility > 5.0 {
        "high"
    } else if volatility > 2.0 {
        "medium"
    } else {
        "low"
    };

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
