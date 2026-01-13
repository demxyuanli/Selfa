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
        "http://push2his.eastmoney.com/api/qt/stock/kline/get?secid={}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=1&fqt=1&beg=0&end=20500000&lmt=240",
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
        "1d" => (5, 240),
        "5d" => (15, 240),
        "1mo" => (60, 240),
        "3mo" => (101, 90),
        "6mo" => (101, 180),
        "1y" => (101, 365),
        "2y" => (103, 24),
        "5y" => (103, 60),
        _ => (101, 365),
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
