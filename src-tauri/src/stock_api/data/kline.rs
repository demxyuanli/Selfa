use crate::stock_api::types::StockData;
use crate::stock_api::utils::parse_symbol;

pub async fn fetch_time_series(symbol: &str) -> Result<Vec<StockData>, String> {
    let (secid, _) = parse_symbol(symbol);
    
    let url = format!(
        "http://push2his.eastmoney.com/api/qt/stock/kline/get?secid={}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f61&klt=1&fqt=1&beg=0&end=20500000&lmt=1200",
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
                                    let amount = if parts.len() > 6 { parts[6].parse::<f64>().ok() } else { None };
                                    // parts[7] is amplitude (f58)
                                    let turnover_rate = if parts.len() > 8 { parts[8].parse::<f64>().ok() } else { None };
                                    
                                    result.push(StockData {
                                        date,
                                        open,
                                        high,
                                        low,
                                        close,
                                        volume,
                                        amount,
                                        turnover_rate,
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
        "1m" => (1, 240),
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
        "http://push2his.eastmoney.com/api/qt/stock/kline/get?secid={}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f61&klt={}&fqt=1&beg=0&end=20500000&lmt={}",
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
                    let amount = if parts.len() > 6 { parts[6].parse::<f64>().ok() } else { None };
                    // parts[7] is amplitude (f58)
                    let turnover_rate = if parts.len() > 8 { parts[8].parse::<f64>().ok() } else { None };
                    
                    result.push(StockData {
                        date,
                        open,
                        high,
                        low,
                        close,
                        volume,
                        amount,
                        turnover_rate,
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
