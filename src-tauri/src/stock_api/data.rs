use super::types::{StockData, StockInfo, StockQuote};
use super::utils::parse_symbol;

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
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Client error: {}", e))?;

    let mut last_error = String::new();
    let mut json_result: Option<serde_json::Value> = None;

    for attempt in 0..3 {
        match client.get(&url).timeout(std::time::Duration::from_secs(10)).send().await {
            Ok(response) => {
                if !response.status().is_success() {
                    last_error = format!("API error: {}", response.status());
                } else {
                    match response.json::<serde_json::Value>().await {
                        Ok(val) => {
                            json_result = Some(val);
                            break;
                        }
                        Err(e) => last_error = format!("Parse error: {}", e),
                    }
                }
            }
            Err(e) => last_error = format!("Network error: {}", e),
        }
        
        if attempt < 2 {
            tokio::time::sleep(tokio::time::Duration::from_millis(500 * (attempt + 1) as u64)).await;
        }
    }

    let json = json_result.ok_or(last_error)?;
    
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
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Client error: {}", e))?;
    
    // Retry up to 3 times for network errors
    let mut last_error = None;
    for attempt in 0..3 {
        let response_result = client
            .get(&url)
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await;
        
        match response_result {
            Ok(response) => {
                if !response.status().is_success() {
                    return Err(format!("API error: {}", response.status()));
                }
                
                match response.json::<serde_json::Value>().await {
                    Ok(json) => {
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
                        
                        return Ok(result);
                    }
                    Err(e) => {
                        last_error = Some(format!("Parse error: {}", e));
                        if attempt < 2 {
                            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                            continue;
                        }
                    }
                }
            }
            Err(e) => {
                last_error = Some(format!("Network error: {}", e));
                if attempt < 2 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(500 * (attempt + 1) as u64)).await;
                    continue;
                }
            }
        }
    }
    
    Err(last_error.unwrap_or_else(|| "Unknown error".to_string()))
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
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Client error: {}", e))?;
    
    // Helper function to parse response
    let parse_response = |json: serde_json::Value| -> Result<Vec<StockData>, String> {
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
    };
    
    // Helper function to make a request
    let make_request = || async {
        client
            .get(&url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
    };
    
    // First attempt
    let response_result = make_request().await;
    match response_result {
        Ok(response) => {
            if !response.status().is_success() {
                return Err(format!("API error: {}", response.status()));
            }
            
            match response.json::<serde_json::Value>().await {
                Ok(json) => return parse_response(json),
                Err(_e) => {
                    // Parse error, try immediate retry
                }
            }
        }
        Err(_) => {
            // Network error, try immediate retry
        }
    }
    
    // Short delay then retry (second attempt)
    tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
    let response_result = make_request().await;
    match response_result {
        Ok(response) => {
            if !response.status().is_success() {
                return Err(format!("API error: {}", response.status()));
            }
            match response.json::<serde_json::Value>().await {
                Ok(json) => return parse_response(json),
                Err(_e) => {}
            }
        }
        Err(_) => {}
    }

    // Brief delay and final retry (third attempt)
    tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
    let response_result = make_request().await;
    match response_result {
        Ok(response) => {
            if !response.status().is_success() {
                return Err(format!("API error after retry: {}", response.status()));
            }
            match response.json::<serde_json::Value>().await {
                Ok(json) => parse_response(json),
                Err(e) => Err(format!("Parse error after retry: {}", e)),
            }
        }
        Err(e) => Err(format!("Network error after retry: {}", e)),
    }
}

pub async fn filter_stocks_by_market_and_sector(market_filter: Option<&str>, sector_filter: Option<&str>, page: usize, page_size: usize) -> Result<Vec<StockInfo>, String> {
    // Build filter string
    // m:0+t:6 means all A-shares (Shanghai + Shenzhen)
    // m:1 means Shanghai market
    // m:0 means Shenzhen market
    // b:BK0477 means a specific sector
    let mut filter_parts = Vec::new();
    
    if let Some(market) = market_filter {
        match market {
            "all" => filter_parts.push("m:0+t:6".to_string()), // All A-shares
            "sh" => filter_parts.push("m:1".to_string()), // Shanghai
            "sz" => filter_parts.push("m:0".to_string()), // Shenzhen
            _ => filter_parts.push("m:0+t:6".to_string()), // Default to all A-shares
        }
    } else {
        filter_parts.push("m:0+t:6".to_string()); // Default to all A-shares
    }
    
    if let Some(sector) = sector_filter {
        if !sector.is_empty() {
            filter_parts.push(format!("b:{}", sector));
        }
    }
    
    let fs = filter_parts.join("+");
    
    // Fields: f12=code, f14=name, f2=price, f3=change_percent, f4=change, f5=volume, f6=amount
    let fields = "f12,f14,f2,f3,f4,f5,f6";
    
    let url = format!(
        "http://push2.eastmoney.com/api/qt/clist/get?pn={}&pz={}&fs={}&fields={}&np=1",
        page, page_size, fs, fields
    );
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Client error: {}", e))?;
    
    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
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
        return Ok(Vec::new());
    }
    
    let stocks = data["diff"].as_array()
        .ok_or("No stock data in response")?;
    
    let mut results = Vec::new();
    
    for stock in stocks {
        let code = stock["f12"].as_str().unwrap_or("");
        let name = stock["f14"].as_str().unwrap_or("");
        
        if code.is_empty() || name.is_empty() {
            continue;
        }
        
        // Determine exchange from code
        let exchange = if code.starts_with("6") || code == "000001" {
            "SH".to_string()
        } else if code.starts_with("0") || code.starts_with("3") {
            "SZ".to_string()
        } else {
            "SH".to_string() // Default to Shanghai
        };
        
        results.push(StockInfo {
            symbol: code.to_string(),
            name: name.to_string(),
            exchange,
        });
    }
    
    Ok(results)
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
