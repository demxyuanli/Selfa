use crate::stock_api::types::StockInfo;

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
        "http://searchapi.eastmoney.com/api/suggest/get?input={}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=50",
        encoded_query
    );
    
    eprintln!("=== Network Request Debug ===");
    eprintln!("Searching stocks with query: {}", query);
    eprintln!("Endpoint: {}", url);
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Client error: {}", e))?;

    eprintln!("Sending request...");
    let start_time = std::time::Instant::now();
    let response_result = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await;
    let elapsed = start_time.elapsed();
    eprintln!("Request completed in {:?}", elapsed);

    let response = response_result.map_err(|e| {
        eprintln!("Network error: {}", e);
        format!("Network error: {}", e)
    })?;

    eprintln!("Response Status: {}", response.status());
    if !response.status().is_success() {
        eprintln!("API error: {}", response.status());
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
            "http://searchapi.eastmoney.com/api/suggest/get?input={}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=100",
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
            "http://searchapi.eastmoney.com/api/suggest/get?input={}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=100",
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
