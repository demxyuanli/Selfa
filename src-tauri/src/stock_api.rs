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
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Client error: {}", e))?;

    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(5))
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
    // Try multiple parsing methods as API might return different formats
    let market_cap = data["f116"].as_i64()
        .or_else(|| {
            // Try parsing as f64 then converting to i64
            data["f116"].as_f64().and_then(|v| {
                if v.is_finite() && v >= 0.0 {
                    Some(v as i64)
                } else {
                    None
                }
            })
        })
        .or_else(|| {
            // Try parsing as string then converting to i64
            data["f116"].as_str().and_then(|s| {
                s.trim().parse::<i64>().ok()
                    .or_else(|| s.trim().parse::<f64>().ok().map(|v| v as i64))
            })
        })
        .or_else(|| {
            // Fallback to circulation market cap (f117)
            data["f117"].as_i64()
        })
        .or_else(|| {
            // Try f117 as f64
            data["f117"].as_f64().and_then(|v| {
                if v.is_finite() && v >= 0.0 {
                    Some(v as i64)
                } else {
                    None
                }
            })
        })
        .or_else(|| {
            // Try f117 as string
            data["f117"].as_str().and_then(|s| {
                s.trim().parse::<i64>().ok()
                    .or_else(|| s.trim().parse::<f64>().ok().map(|v| v as i64))
            })
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
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Client error: {}", e))?;

    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(8))
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

    let quotes = match json["QuotationCodeTable"]["Data"].as_array() {
        Some(data) => data,
        None => {
            // Try alternative response format
            if let Some(data) = json["Data"].as_array() {
                data
            } else {
                return Err("Invalid response format: missing Data array".to_string());
            }
        }
    };
    
    let mut results = Vec::new();
    
    // Return all available results (API typically returns up to 20-30 results)
    for quote in quotes.iter() {
        let code = quote["Code"].as_str().unwrap_or("");
        let name = quote["Name"].as_str().unwrap_or("");
        
        // Skip empty results
        if code.is_empty() || name.is_empty() {
            continue;
        }
        
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

// Fetch all A-share stocks in batches
// This function attempts to fetch stock lists by searching common keywords
pub async fn fetch_all_a_stocks() -> Result<Vec<StockInfo>, String> {
    let mut all_stocks: Vec<StockInfo> = Vec::new();
    let mut seen_symbols = std::collections::HashSet::new();

    // Use a more comprehensive approach to get A-share stocks
    // First try to get some well-known stocks directly
    let known_stocks = vec![
        ("000001", "平安银行", "SZ"),
        ("000002", "万科A", "SZ"),
        ("600000", "浦发银行", "SH"),
        ("600036", "招商银行", "SH"),
        ("000858", "五粮液", "SZ"),
        ("300124", "汇川技术", "SZ"),
        ("002142", "宁波银行", "SZ"),
        ("600519", "贵州茅台", "SH"),
    ];

    for (symbol, name, exchange) in known_stocks {
        if !seen_symbols.contains(symbol) {
            all_stocks.push(StockInfo {
                symbol: symbol.to_string(),
                name: name.to_string(),
                exchange: exchange.to_string(),
            });
            seen_symbols.insert(symbol.to_string());
        }
    }

    // Search with common keywords to get more comprehensive stock list
    let keywords = vec![
        "",           // Empty query might return popular stocks
        "A",          // Common prefix
        "银行",        // Banks
        "科技",        // Technology
        "医疗",        // Healthcare
        "地产",        // Real estate
    ];
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Client error: {}", e))?;
    
    for keyword in keywords {
        let encoded_query = urlencoding::encode(keyword);
        let url = format!(
            "http://searchapi.eastmoney.com/api/suggest/get?input={}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8",
            encoded_query
        );
        
        match client.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<serde_json::Value>().await {
                        Ok(json) => {
                            if let Some(quotes) = json["QuotationCodeTable"]["Data"].as_array() {
                                for quote in quotes {
                                    let code = quote["Code"].as_str().unwrap_or("");
                                    let name = quote["Name"].as_str().unwrap_or("");
                                    
                                    if code.is_empty() || name.is_empty() {
                                        continue;
                                    }
                                    
                                    // Only include A-shares (exclude indices and other securities)
                                    if !code.starts_with("6") && !code.starts_with("0") && !code.starts_with("3") {
                                        continue;
                                    }
                                    
                                    if !seen_symbols.contains(code) {
                                        let market = quote["Market"].as_i64().unwrap_or(1);
                                        let exchange = if market == 1 {
                                            "SH".to_string()
                                        } else {
                                            "SZ".to_string()
                                        };
                                        
                                        all_stocks.push(StockInfo {
                                            symbol: code.to_string(),
                                            name: name.to_string(),
                                            exchange,
                                        });
                                        
                                        seen_symbols.insert(code.to_string());
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to parse response for keyword '{}': {}", keyword, e);
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to fetch stocks for keyword '{}': {}", keyword, e);
            }
        }
        
        // Small delay between requests to avoid rate limiting
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }
    
    // Also try fetching by searching common stock code prefixes
    let prefixes = vec!["60", "68", "00", "30"];  // SH main, STAR, SZ main, ChiNext
    
    for prefix in prefixes {
        let encoded_query = urlencoding::encode(prefix);
        let url = format!(
            "http://searchapi.eastmoney.com/api/suggest/get?input={}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8",
            encoded_query
        );
        
        if let Ok(response) = client.get(&url).send().await {
            if response.status().is_success() {
                if let Ok(json) = response.json::<serde_json::Value>().await {
                    if let Some(quotes) = json["QuotationCodeTable"]["Data"].as_array() {
                        for quote in quotes {
                            let code = quote["Code"].as_str().unwrap_or("");
                            let name = quote["Name"].as_str().unwrap_or("");
                            
                            if code.is_empty() || name.is_empty() {
                                continue;
                            }
                            
                            if !seen_symbols.contains(code) {
                                let market = quote["Market"].as_i64().unwrap_or(1);
                                let exchange = if market == 1 {
                                    "SH".to_string()
                                } else {
                                    "SZ".to_string()
                                };
                                
                                all_stocks.push(StockInfo {
                                    symbol: code.to_string(),
                                    name: name.to_string(),
                                    exchange,
                                });
                                
                                seen_symbols.insert(code.to_string());
                            }
                        }
                    }
                }
            }
        }
        
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }
    
    println!("Fetched {} unique A-share stocks for cache", all_stocks.len());
    Ok(all_stocks)
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
        "fibonacci" => predict_fibonacci_retracement(data, &last_date, period)?,
        "fibonacci_extension" => predict_fibonacci_extension(data, &last_date, period)?,
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

// ARIMA (AutoRegressive Integrated Moving Average)
fn predict_arima(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 30 {
        return Err("Need at least 30 data points for ARIMA".to_string());
    }

    let recent_data = &closes[closes.len().saturating_sub(50)..];
    let n = recent_data.len();

    // Step 1: Determine differencing order (d) - check stationarity
    let (d, stationary_data) = determine_differencing_order(recent_data)?;

    if stationary_data.len() < 20 {
        return Err("Insufficient stationary data for ARIMA modeling".to_string());
    }

    // Step 2: Fit ARIMA model and select optimal p,q using AIC
    let (p, q, ar_coeffs, ma_coeffs, residual_variance) =
        fit_arima_model(&stationary_data)?;

    // Step 3: Generate predictions
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let last_original_price = recent_data[n - 1];

    // For predictions, we need to work with the differenced series
    let mut prediction_history = stationary_data.clone();

    for i in 1..=period {
        // Generate next prediction using fitted ARMA(p,q) model
        let next_diff = predict_next_value(&prediction_history, &ar_coeffs, &ma_coeffs, residual_variance);
        prediction_history.push(next_diff);

        // Convert back to original scale by reverse differencing
        let mut predicted_price = last_original_price;
        for j in 0..i {
            predicted_price += prediction_history[stationary_data.len() + j];
        }

        // Calculate confidence interval
        let std_dev = (residual_variance * (i as f64)).sqrt();
        let confidence = (85.0 - (std_dev / predicted_price.abs().max(0.01) * 100.0).min(35.0)).max(50.0);

        let upper_bound = predicted_price + 1.96 * std_dev;
        let lower_bound = predicted_price - 1.96 * std_dev;

        // Determine signal based on trend and prediction
        let trend_slope = calculate_trend_slope(&stationary_data);
        let signal = determine_signal(predicted_price, last_original_price, trend_slope);

        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price,
            confidence,
            signal,
            upper_bound,
            lower_bound,
            method: format!("ARIMA({},{},{})", p, d, q),
        });
    }

    Ok(results)
}

// Determine optimal differencing order using Augmented Dickey-Fuller test approximation
fn determine_differencing_order(data: &[f64]) -> Result<(usize, Vec<f64>), String> {
    if data.len() < 10 {
        return Ok((0, data.to_vec()));
    }

    // Test for stationarity (simplified ADF test)
    let is_stationary = test_stationarity(data);

    if is_stationary {
        return Ok((0, data.to_vec()));
    }

    // Apply first differencing
    let mut diff_data = Vec::new();
    for i in 1..data.len() {
        diff_data.push(data[i] - data[i - 1]);
    }

    // Test again
    let is_stationary_after_diff = test_stationarity(&diff_data);

    if is_stationary_after_diff {
        Ok((1, diff_data))
    } else {
        // Apply second differencing if needed
        let mut diff2_data = Vec::new();
        for i in 1..diff_data.len() {
            diff2_data.push(diff_data[i] - diff_data[i - 1]);
        }
        Ok((2, diff2_data))
    }
}

// Simplified stationarity test (approximation of ADF test)
fn test_stationarity(data: &[f64]) -> bool {
    if data.len() < 5 {
        return false;
    }

    // Calculate autocorrelation at lag 1
    let mean = data.iter().sum::<f64>() / data.len() as f64;
    let mut numerator = 0.0;
    let mut denominator = 0.0;

    for i in 1..data.len() {
        let diff = data[i] - mean;
        let lag_diff = data[i - 1] - mean;
        numerator += diff * lag_diff;
        denominator += lag_diff * lag_diff;
    }

    if denominator == 0.0 {
        return false;
    }

    let rho = numerator / denominator;

    // If autocorrelation is high (> 0.8), likely non-stationary
    rho.abs() < 0.8
}

// Fit ARIMA model and select optimal p,q using AIC
fn fit_arima_model(data: &[f64]) -> Result<(usize, usize, Vec<f64>, Vec<f64>, f64), String> {
    if data.len() < 10 {
        return Err("Insufficient data for model fitting".to_string());
    }

    let mut best_aic = f64::INFINITY;
    let mut best_p = 1;
    let mut best_q = 1;
    let mut best_ar_coeffs = Vec::new();
    let mut best_ma_coeffs = Vec::new();
    let mut best_residual_variance = 0.0;

    // Try different combinations of p and q (keep it simple: p,q <= 3)
    for p in 0..=3 {
        for q in 0..=3 {
            if p == 0 && q == 0 {
                continue; // Skip ARMA(0,0)
            }

            match fit_arma_model(data, p, q) {
                Ok((ar_coeffs, ma_coeffs, residual_variance)) => {
                    // Calculate AIC
                    let k = (p + q) as f64; // number of parameters
                    let n = data.len() as f64;
                    let aic = n * residual_variance.ln() + 2.0 * k;

                    if aic < best_aic {
                        best_aic = aic;
                        best_p = p;
                        best_q = q;
                        best_ar_coeffs = ar_coeffs;
                        best_ma_coeffs = ma_coeffs;
                        best_residual_variance = residual_variance;
                    }
                }
                Err(_) => continue,
            }
        }
    }

    Ok((best_p, best_q, best_ar_coeffs, best_ma_coeffs, best_residual_variance))
}

// Fit ARMA(p,q) model using simplified method
fn fit_arma_model(data: &[f64], p: usize, q: usize) -> Result<(Vec<f64>, Vec<f64>, f64), String> {
    if data.len() < p.max(q) + 5 {
        return Err("Insufficient data for ARMA fitting".to_string());
    }

    // Use Yule-Walker equations for AR coefficients
    let ar_coeffs = if p > 0 {
        estimate_ar_coefficients(data, p)?
    } else {
        Vec::new()
    };

    // Estimate MA coefficients (simplified approach)
    let ma_coeffs = if q > 0 {
        estimate_ma_coefficients(data, q)?
    } else {
        Vec::new()
    };

    // Calculate residual variance
    let residual_variance = calculate_residual_variance(data, &ar_coeffs, &ma_coeffs);

    Ok((ar_coeffs, ma_coeffs, residual_variance))
}

// Estimate AR coefficients using Yule-Walker method
fn estimate_ar_coefficients(data: &[f64], p: usize) -> Result<Vec<f64>, String> {
    if data.len() < p + 1 {
        return Err("Insufficient data for AR coefficient estimation".to_string());
    }

    // Calculate autocorrelations
    let mut autocorr = vec![0.0; p + 1];
    let mean = data.iter().sum::<f64>() / data.len() as f64;

    for lag in 0..=p {
        let mut sum = 0.0;
        let mut count = 0;

        for i in lag..data.len() {
            sum += (data[i] - mean) * (data[i - lag] - mean);
            count += 1;
        }

        autocorr[lag] = if count > 0 { sum / count as f64 } else { 0.0 };
    }

    // Variance of the series
    let variance = autocorr[0];

    if variance <= 0.0 {
        return Ok(vec![0.0; p]);
    }

    // Solve Yule-Walker equations (simplified for p <= 3)
    let mut coeffs = vec![0.0; p];

    match p {
        1 => {
            coeffs[0] = autocorr[1] / variance;
        }
        2 => {
            let det = variance * variance - autocorr[1] * autocorr[1];
            if det != 0.0 {
                coeffs[0] = (variance * autocorr[1] - autocorr[1] * autocorr[2]) / det;
                coeffs[1] = (autocorr[1] * autocorr[1] - variance * autocorr[2]) / det;
            }
        }
        3 => {
            // Simplified solution for AR(3)
            coeffs[0] = autocorr[1] / variance;
            coeffs[1] = (autocorr[2] - coeffs[0] * autocorr[1]) / variance;
            coeffs[2] = (autocorr[3] - coeffs[0] * autocorr[2] - coeffs[1] * autocorr[1]) / variance;
        }
        _ => return Err("AR order too high for current implementation".to_string()),
    }

    Ok(coeffs)
}

// Estimate MA coefficients (simplified)
fn estimate_ma_coefficients(_data: &[f64], q: usize) -> Result<Vec<f64>, String> {
    // Simplified MA estimation - use small positive values
    let mut coeffs = Vec::new();
    for i in 0..q {
        coeffs.push(0.1 + (i as f64) * 0.1); // 0.1, 0.2, 0.3, ...
    }
    Ok(coeffs)
}

// Calculate residual variance
fn calculate_residual_variance(data: &[f64], ar_coeffs: &[f64], ma_coeffs: &[f64]) -> f64 {
    if data.len() < ar_coeffs.len().max(ma_coeffs.len()) + 1 {
        return calculate_variance(data);
    }

    let mut residuals = Vec::new();
    let p = ar_coeffs.len();
    let q = ma_coeffs.len();

    for i in (p.max(q))..data.len() {
        let mut predicted = 0.0;

        // AR part
        for j in 0..p {
            if i > j {
                predicted += ar_coeffs[j] * data[i - 1 - j];
            }
        }

        // MA part (simplified - would need error terms in full implementation)
        for j in 0..q {
            if i > j {
                predicted += ma_coeffs[j] * (data[i - 1 - j] - predicted) * 0.1;
            }
        }

        residuals.push(data[i] - predicted);
    }

    if residuals.is_empty() {
        calculate_variance(data)
    } else {
        calculate_variance(&residuals)
    }
}

// Predict next value using fitted ARMA model
fn predict_next_value(history: &[f64], ar_coeffs: &[f64], ma_coeffs: &[f64], residual_variance: f64) -> f64 {
    let n = history.len();
    let p = ar_coeffs.len();
    let q = ma_coeffs.len();

    let mut prediction = 0.0;

    // AR part
    for i in 0..p {
        if n > i {
            prediction += ar_coeffs[i] * history[n - 1 - i];
        }
    }

    // MA part (simplified)
    for i in 0..q {
        if n > i {
            prediction += ma_coeffs[i] * 0.1; // Simplified MA contribution
        }
    }

    // Add small random component based on residual variance
    prediction += (residual_variance.sqrt() * 0.1).max(0.01);

    prediction
}

// Calculate trend slope for signal determination
fn calculate_trend_slope(data: &[f64]) -> f64 {
    if data.len() < 5 {
        return 0.0;
    }

    let n = data.len() as f64;
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    let mut sum_xy = 0.0;
    let mut sum_xx = 0.0;

    for i in 0..data.len() {
        let x = i as f64;
        let y = data[i];
        sum_x += x;
        sum_y += y;
        sum_xy += x * y;
        sum_xx += x * x;
    }

    let slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
    slope
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

fn find_significant_highs_lows(data: &[StockData], lookback: usize) -> (f64, f64, usize, usize) {
    let n = data.len();
    if n < lookback * 2 {
        let high_idx = data.iter().enumerate().max_by(|a, b| a.1.high.partial_cmp(&b.1.high).unwrap()).map(|(i, _)| i).unwrap_or(0);
        let low_idx = data.iter().enumerate().min_by(|a, b| a.1.low.partial_cmp(&b.1.low).unwrap()).map(|(i, _)| i).unwrap_or(0);
        return (data[high_idx].high, data[low_idx].low, high_idx, low_idx);
    }
    
    let recent_data = &data[n.saturating_sub(lookback * 2)..];
    let recent_high_idx = recent_data.iter().enumerate().max_by(|a, b| a.1.high.partial_cmp(&b.1.high).unwrap()).map(|(i, _)| i).unwrap_or(0);
    let recent_low_idx = recent_data.iter().enumerate().min_by(|a, b| a.1.low.partial_cmp(&b.1.low).unwrap()).map(|(i, _)| i).unwrap_or(0);
    
    let high_idx = n - lookback * 2 + recent_high_idx;
    let low_idx = n - lookback * 2 + recent_low_idx;
    
    (data[high_idx].high, data[low_idx].low, high_idx, low_idx)
}

fn predict_fibonacci_retracement(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 30 {
        return Err("Need at least 30 data points for Fibonacci retracement".to_string());
    }
    
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = closes[closes.len() - 1];
    
    let lookback = 30.min(data.len() / 2);
    let (high_price, low_price, high_idx, low_idx) = find_significant_highs_lows(data, lookback);
    
    let is_uptrend = high_idx > low_idx;
    let range = if is_uptrend {
        high_price - low_price
    } else {
        low_price - high_price
    };
    
    if range < 0.01 {
        return Err("Price range too small for Fibonacci analysis".to_string());
    }
    
    let fibonacci_ratios = vec![0.236, 0.382, 0.5, 0.618, 0.786];
    let base_price = if is_uptrend { low_price } else { high_price };
    let target_direction = if is_uptrend { -1.0 } else { 1.0 };
    
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let variance = calculate_variance(&closes);
    let std_dev = variance.sqrt();
    
    for i in 1..=period {
        let days_ratio = i as f64 / period as f64;
        let closest_ratio_idx = fibonacci_ratios.iter()
            .enumerate()
            .min_by(|a, b| {
                let dist_a = (days_ratio - *a.1).abs();
                let dist_b = (days_ratio - *b.1).abs();
                dist_a.partial_cmp(&dist_b).unwrap()
            })
            .map(|(idx, _)| idx)
            .unwrap_or(2);
        
        let target_ratio = fibonacci_ratios[closest_ratio_idx];
        let predicted = base_price + target_direction * range * target_ratio;
        
        let confidence = match target_ratio {
            0.618 => 75.0,
            0.5 => 70.0,
            0.382 => 65.0,
            0.236 => 60.0,
            0.786 => 65.0,
            _ => 60.0,
        };
        
        let trend_signal = if is_uptrend {
            if predicted < last_price * 0.98 { "buy" } else { "hold" }
        } else {
            if predicted > last_price * 1.02 { "sell" } else { "hold" }
        };
        
        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: trend_signal.to_string(),
            upper_bound: predicted + std_dev * 0.5,
            lower_bound: predicted - std_dev * 0.5,
            method: "fibonacci".to_string(),
        });
    }
    
    Ok(results)
}

fn predict_fibonacci_extension(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 50 {
        return Err("Need at least 50 data points for Fibonacci extension".to_string());
    }
    
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = closes[closes.len() - 1];
    
    let lookback = 40.min(data.len() / 2);
    let (high_price, low_price, high_idx, low_idx) = find_significant_highs_lows(data, lookback);
    
    let is_uptrend = high_idx > low_idx;
    let a_price = if is_uptrend { low_price } else { high_price };
    let b_price = if is_uptrend { high_price } else { low_price };
    let c_price = last_price;
    
    let ab_range = (b_price - a_price).abs();
    
    if ab_range < 0.01 {
        return Err("Price range too small for Fibonacci extension".to_string());
    }
    
    let fibonacci_extensions = vec![1.0, 1.618, 2.618, 4.236];
    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let variance = calculate_variance(&closes);
    let std_dev = variance.sqrt();
    
    for i in 1..=period {
        let days_progress = i as f64 / period as f64;
        let extension_idx = (days_progress * (fibonacci_extensions.len() - 1) as f64).floor() as usize;
        let extension_idx = extension_idx.min(fibonacci_extensions.len() - 1);
        let extension_ratio = fibonacci_extensions[extension_idx];
        
        let predicted = if is_uptrend {
            c_price + ab_range * extension_ratio
        } else {
            c_price - ab_range * extension_ratio
        };
        
        let confidence = match extension_ratio {
            1.0 => 70.0,
            1.618 => 75.0,
            2.618 => 65.0,
            4.236 => 55.0,
            _ => 60.0,
        };
        
        let trend_signal = if is_uptrend {
            if predicted > last_price * 1.05 { "buy" } else { "hold" }
        } else {
            if predicted < last_price * 0.95 { "sell" } else { "hold" }
        };
        
        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal: trend_signal.to_string(),
            upper_bound: predicted + std_dev * 0.8,
            lower_bound: predicted - std_dev * 0.8,
            method: "fibonacci_extension".to_string(),
        });
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
            if let Ok(predictions) = match *method {
                "linear" => predict_linear_regression(&closes, last_date, period),
                "ma" => predict_moving_average(&closes, last_date, period),
                "technical" => predict_technical_indicator(&closes, last_date, period),
                "polynomial" => predict_polynomial(&closes, last_date, period),
                "exponential" => predict_exponential_smoothing(&closes, last_date, period),
                "ensemble" => predict_ensemble(data, last_date, period),
                _ => continue,
            } {
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
    let highs: Vec<f64> = data.iter().map(|d| d.high).collect();
    let lows: Vec<f64> = data.iter().map(|d| d.low).collect();
    
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
        if content.len() > 500 { 
            &content[..500.min(content.len())] 
        } else { 
            content 
        });
    
    // Clean and extract JSON from content
    let cleaned_content = extract_json_from_text(content);
    eprintln!("Cleaned Content Length: {} chars", cleaned_content.len());
    eprintln!("Cleaned Content (first 1000 chars): {}", 
        if cleaned_content.len() > 1000 { 
            &cleaned_content[..1000.min(cleaned_content.len())] 
        } else { 
            &cleaned_content 
        });

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
                if json_candidate.len() > 800 { 
                    &json_candidate[..800.min(json_candidate.len())] 
                } else { 
                    &json_candidate 
                });
            
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
                                if fixed_candidate.len() > 500 { 
                                    &fixed_candidate[..500.min(fixed_candidate.len())] 
                                } else { 
                                    &fixed_candidate 
                                });
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
            in_string = false;
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
    symbol: &str,
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
    let last_signal = macd_result.signal.last().copied().unwrap_or(0.0);
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
    let mut fixed = json_str.to_string();
    
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
        if let Ok(predictions) = match *method {
            "linear" => predict_linear_regression(&closes, last_date, prediction_period),
            "ma" => predict_moving_average(&closes, last_date, prediction_period),
            "technical" => predict_technical_indicator(&closes, last_date, prediction_period),
            "polynomial" => predict_polynomial(&closes, last_date, prediction_period),
            "exponential" => predict_exponential_smoothing(&closes, last_date, prediction_period),
            "ensemble" => predict_ensemble(data, last_date, prediction_period),
            _ => continue,
        } {
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
    let analysis_text = format!(
        "综合分析了{}种预测方法（线性回归、移动平均、技术指标、多项式、指数平滑、集成方法），",
        method_count
    );
    
    let analysis_text = format!(
        "{}\
        当前价格{:.2}，基于技术指标分析：RSI为{:.1}（{}），MACD{}，\
        价格位于MA20（{:.2}）{}，MA50（{:.2}）{}。\
        多种预测方法平均预测价格为{:.2}，预测一致性{:.1}%。\
        综合分析显示{}趋势，建议{}操作。",
        analysis_text,
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
