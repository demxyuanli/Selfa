use crate::stock_api::types::StockQuote;
use crate::stock_api::http_client::{http_client, reset_http_client, is_connection_error};
use crate::stock_api::utils::parse_symbol;

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
    let client = http_client().await?;

    eprintln!("=== Network Request Debug ===");
    eprintln!("Fetching stock quote for symbol: {}", symbol);
    eprintln!("Endpoint: {}", url);

    let mut last_error = String::new();
    let mut json_result: Option<serde_json::Value> = None;
    let mut client = client;

    for attempt in 0..3 {
        eprintln!("Attempt {}: Sending request...", attempt + 1);
        let start_time = std::time::Instant::now();
        let response_result = client.get(&url).timeout(std::time::Duration::from_secs(10)).send().await;
        let elapsed = start_time.elapsed();
        eprintln!("Request completed in {:?}", elapsed);
        
        match response_result {
            Ok(response) => {
                eprintln!("Response Status: {}", response.status());
                if !response.status().is_success() {
                    last_error = format!("API error: {}", response.status());
                    eprintln!("API error: {}", last_error);
                } else {
                    match response.json::<serde_json::Value>().await {
                        Ok(val) => {
                            eprintln!("Successfully parsed JSON response");
                            json_result = Some(val);
                            break;
                        }
                        Err(e) => {
                            last_error = format!("Parse error: {}", e);
                            eprintln!("Parse error: {}", e);
                        }
                    }
                }
            }
            Err(e) => {
                let error_msg = format!("Network error: {}", e);
                last_error = error_msg.clone();
                eprintln!("{}", error_msg);
                
                if is_connection_error(&error_msg) && attempt < 2 {
                    eprintln!("Connection error detected, resetting HTTP client...");
                    reset_http_client().await;
                    client = http_client().await?;
                }
            }
        }
        
        if attempt < 2 {
            eprintln!("Retrying in {}ms...", 500 * (attempt + 1));
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
