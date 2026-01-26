use crate::stock_api::types::SectorInfo;
use crate::stock_api::utils::parse_symbol;

pub async fn get_related_sectors(symbol: &str) -> Result<Vec<SectorInfo>, String> {
    println!("[get_related_sectors] Starting for symbol: {}", symbol);
    let (secid, _) = parse_symbol(symbol);
    println!("[get_related_sectors] Parsed secid: {}", secid);
    
    // Try to get more fields that might contain sector codes
    // f107: industry code, f127: sector name, f128: concept name, f184: related sectors
    // f225: might contain sector codes, f165: might contain sector info
    let fields = "f107,f127,f128,f184,f225,f165";
    let url = format!(
        "http://push2.eastmoney.com/api/qt/stock/get?secid={}&fields={}",
        secid, fields
    );
    println!("[get_related_sectors] Request URL: {}", url);
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| {
            eprintln!("[get_related_sectors] Client build error: {}", e);
            format!("Client error: {}", e)
        })?;
    
    println!("[get_related_sectors] Sending request...");
    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            eprintln!("[get_related_sectors] Network error: {}", e);
            format!("Network error: {}", e)
        })?;
    
    println!("[get_related_sectors] Response status: {}", response.status());
    if !response.status().is_success() {
        eprintln!("[get_related_sectors] API error: {}", response.status());
        return Err(format!("API error: {}", response.status()));
    }
    
    println!("[get_related_sectors] Parsing JSON response...");
    let json: serde_json::Value = response.json().await
        .map_err(|e| {
            eprintln!("[get_related_sectors] Parse error: {}", e);
            format!("Parse error: {}", e)
        })?;
    
    println!("[get_related_sectors] JSON response received, checking data field...");
    let data = &json["data"];
    if data.is_null() {
        eprintln!("[get_related_sectors] Data field is null, returning empty vector");
        println!("[get_related_sectors] Full JSON response: {}", serde_json::to_string_pretty(&json).unwrap_or_default());
        return Ok(Vec::new());
    }
    
    println!("[get_related_sectors] Data field exists, extracting sector codes...");
    println!("[get_related_sectors] f107 (industry): {:?}", data["f107"].as_str());
    println!("[get_related_sectors] f127 (sector): {:?}", data["f127"].as_str());
    println!("[get_related_sectors] f128 (concept): {:?}", data["f128"].as_str());
    println!("[get_related_sectors] f184 (related): {:?}", data["f184"].as_str());
    println!("[get_related_sectors] f225: {:?}", data["f225"].as_str());
    println!("[get_related_sectors] f165: {:?}", data["f165"].as_str());
    
    let mut sectors = Vec::new();
    
    // Parse f184: related sectors (format: "BK0477,BK0478" or "BK0477|板块名称,BK0478|板块名称")
    if let Some(f184) = data["f184"].as_str() {
        println!("[get_related_sectors] Processing f184: {}", f184);
        if !f184.is_empty() {
            // Handle multiple separators
            let sector_codes: Vec<&str> = f184
                .split(|c| c == ',' || c == ';' || c == '|' || c == '、')
                .collect();
            println!("[get_related_sectors] Found {} sector codes in f184", sector_codes.len());
            
            for (idx, code) in sector_codes.iter().enumerate() {
                let code = code.trim();
                if code.is_empty() {
                    continue;
                }
                
                // Add delay between requests
                if idx > 0 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
                }
                
                // Handle format like "BK0477|板块名称"
                let (sector_code, sector_name) = if let Some(pos) = code.find('|') {
                    (code[..pos].trim(), code[pos+1..].trim())
                } else {
                    (code, "")
                };
                
                println!("[get_related_sectors] Processing sector code {} of {}: {}, name: {}", 
                    idx + 1, sector_codes.len(), sector_code, sector_name);
                
                if sector_code.starts_with("BK") && !sectors.iter().any(|s: &SectorInfo| s.code == sector_code) {
                    // Fetch sector quote to get name and change_percent
                    println!("[get_related_sectors] Fetching info for sector: {}", sector_code);
                    match fetch_sector_info(sector_code, sector_name).await {
                        Ok(info) => {
                            println!("[get_related_sectors] Successfully fetched sector: {} - {} - {:.2}%", 
                                info.code, info.name, info.change_percent);
                            sectors.push(info);
                        }
                        Err(e) => {
                            eprintln!("[get_related_sectors] Failed to fetch sector {}: {}", sector_code, e);
                        }
                    }
                } else {
                    if !sector_code.starts_with("BK") {
                        println!("[get_related_sectors] Skipping non-BK code: {}", sector_code);
                    } else {
                        println!("[get_related_sectors] Sector code {} already exists, skipping", sector_code);
                    }
                }
            }
        }
    } else {
        println!("[get_related_sectors] f184 field is not a string or missing");
    }
    
    // Parse f225: might contain sector codes
    if let Some(f225) = data["f225"].as_str() {
        println!("[get_related_sectors] Processing f225: {}", f225);
        if !f225.is_empty() {
            // Handle multiple separators
            let sector_codes: Vec<&str> = f225
                .split(|c| c == ',' || c == ';' || c == '|' || c == '、')
                .collect();
            println!("[get_related_sectors] Found {} codes in f225", sector_codes.len());
            
            for (idx, code) in sector_codes.iter().enumerate() {
                let code = code.trim();
                if code.is_empty() {
                    continue;
                }
                
                // Add delay between requests
                if idx > 0 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
                }
                
                let (sector_code, sector_name) = if let Some(pos) = code.find('|') {
                    (code[..pos].trim(), code[pos+1..].trim())
                } else {
                    (code, "")
                };
                
                println!("[get_related_sectors] Processing f225 code {} of {}: {}, name: {}", 
                    idx + 1, sector_codes.len(), sector_code, sector_name);
                
                if sector_code.starts_with("BK") && !sectors.iter().any(|s: &SectorInfo| s.code == sector_code) {
                    println!("[get_related_sectors] Fetching info for sector from f225: {}", sector_code);
                    match fetch_sector_info(sector_code, sector_name).await {
                        Ok(info) => {
                            println!("[get_related_sectors] Successfully fetched sector: {} - {} - {:.2}%", 
                                info.code, info.name, info.change_percent);
                            sectors.push(info);
                        }
                        Err(e) => {
                            eprintln!("[get_related_sectors] Failed to fetch sector {}: {}", sector_code, e);
                        }
                    }
                } else {
                    if !sector_code.starts_with("BK") {
                        println!("[get_related_sectors] Skipping non-BK code from f225: {}", sector_code);
                    } else {
                        println!("[get_related_sectors] Sector code {} from f225 already exists, skipping", sector_code);
                    }
                }
            }
        }
    }
    
    // Parse f127 and f128: these contain sector names, need to search for codes
    // Try to search for sector codes by name
    if let Some(f127) = data["f127"].as_str() {
        println!("[get_related_sectors] Processing f127 (sector name): {}", f127);
        if !f127.is_empty() {
            // Handle multiple separators: comma, semicolon, pipe, or space
            let sector_names: Vec<&str> = f127
                .split(|c| c == ',' || c == ';' || c == '|' || c == '、')
                .collect();
            println!("[get_related_sectors] Split f127 into {} names: {:?}", sector_names.len(), sector_names);
            
            for (idx, name) in sector_names.iter().enumerate() {
                let name = name.trim();
                if name.is_empty() {
                    println!("[get_related_sectors] Skipping empty name at index {}", idx);
                    continue;
                }
                
                // Add delay between requests to avoid connection issues
                if idx > 0 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
                }
                
                println!("[get_related_sectors] Processing sector name {} of {}: {}", idx + 1, sector_names.len(), name);
                match search_sector_code_by_name(name).await {
                    Ok(sector_code) => {
                        if !sectors.iter().any(|s: &SectorInfo| s.code == sector_code) {
                            println!("[get_related_sectors] Found sector code: {} for name: {}", sector_code, name);
                            match fetch_sector_info(&sector_code, name).await {
                                Ok(mut info) => {
                                    info.sector_type = "Sector".to_string();
                                    println!("[get_related_sectors] Successfully fetched sector: {} - {} ({}) - {:.2}%", 
                                        info.code, info.name, info.sector_type, info.change_percent);
                                    sectors.push(info);
                                }
                                Err(e) => {
                                    eprintln!("[get_related_sectors] Failed to fetch sector {}: {}", sector_code, e);
                                }
                            }
                        } else {
                            println!("[get_related_sectors] Sector code {} already exists, skipping", sector_code);
                        }
                    }
                    Err(e) => {
                        eprintln!("[get_related_sectors] Could not find sector code for name {}: {}", name, e);
                    }
                }
            }
        }
    }
    
    // Parse f128: concept sector names
    if let Some(f128) = data["f128"].as_str() {
        println!("[get_related_sectors] Processing f128 (concept name): {}", f128);
        if !f128.is_empty() {
            // Handle multiple separators: comma, semicolon, pipe, or space
            let concept_names: Vec<&str> = f128
                .split(|c| c == ',' || c == ';' || c == '|' || c == '、')
                .collect();
            println!("[get_related_sectors] Split f128 into {} names: {:?}", concept_names.len(), concept_names);
            
            for (idx, name) in concept_names.iter().enumerate() {
                let name = name.trim();
                if name.is_empty() {
                    println!("[get_related_sectors] Skipping empty concept name at index {}", idx);
                    continue;
                }
                
                // Add delay between requests to avoid connection issues
                if idx > 0 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
                }
                
                println!("[get_related_sectors] Processing concept name {} of {}: {}", idx + 1, concept_names.len(), name);
                match search_sector_code_by_name(name).await {
                    Ok(concept_code) => {
                        if !sectors.iter().any(|s: &SectorInfo| s.code == concept_code) {
                            println!("[get_related_sectors] Found concept code: {} for name: {}", concept_code, name);
                            match fetch_sector_info(&concept_code, name).await {
                                Ok(mut info) => {
                                    info.sector_type = "Concept".to_string();
                                    println!("[get_related_sectors] Successfully fetched concept: {} - {} ({}) - {:.2}%", 
                                        info.code, info.name, info.sector_type, info.change_percent);
                                    sectors.push(info);
                                }
                                Err(e) => {
                                    eprintln!("[get_related_sectors] Failed to fetch concept {}: {}", concept_code, e);
                                }
                            }
                        } else {
                            println!("[get_related_sectors] Concept code {} already exists, skipping", concept_code);
                        }
                    }
                    Err(e) => {
                        eprintln!("[get_related_sectors] Could not find concept code for name {}: {}", name, e);
                    }
                }
            }
        }
    }
    
    // Parse f107: industry code (might be a code or name)
    if let Some(f107) = data["f107"].as_str() {
        println!("[get_related_sectors] Processing f107 (industry): {}", f107);
        if !f107.is_empty() && !sectors.iter().any(|s: &SectorInfo| s.code == f107) {
            // Check if it's already a BK code
            if f107.starts_with("BK") {
                println!("[get_related_sectors] f107 is a BK code: {}", f107);
                let sector_info = fetch_sector_info(f107, "").await;
                match sector_info {
                    Ok(mut info) => {
                        info.sector_type = "Industry".to_string();
                        println!("[get_related_sectors] Successfully fetched industry: {} - {}", info.code, info.name);
                        sectors.push(info);
                    }
                    Err(e) => {
                        eprintln!("[get_related_sectors] Failed to fetch industry {}: {}", f107, e);
                    }
                }
            } else {
                // Try to search for industry code by name
                println!("[get_related_sectors] Searching for industry code by name: {}", f107);
                if let Ok(industry_code) = search_sector_code_by_name(f107).await {
                    println!("[get_related_sectors] Found industry code: {} for name: {}", industry_code, f107);
                    let sector_info = fetch_sector_info(&industry_code, f107).await;
                    match sector_info {
                        Ok(mut info) => {
                            info.sector_type = "Industry".to_string();
                            println!("[get_related_sectors] Successfully fetched industry: {} - {}", info.code, info.name);
                            sectors.push(info);
                        }
                        Err(e) => {
                            eprintln!("[get_related_sectors] Failed to fetch industry {}: {}", industry_code, e);
                        }
                    }
                } else {
                    println!("[get_related_sectors] Could not find industry code for name: {}", f107);
                }
            }
        }
    } else {
        println!("[get_related_sectors] f107 field is not a string or missing");
    }
    
    println!("[get_related_sectors] Final result: found {} sectors", sectors.len());
    for (i, sector) in sectors.iter().enumerate() {
        println!("[get_related_sectors] Sector {}: {} - {} ({}) - {:.2}%", 
            i + 1, sector.code, sector.name, sector.sector_type, sector.change_percent);
    }
    
    Ok(sectors)
}

pub async fn search_sector_code_by_name(sector_name: &str) -> Result<String, String> {
    println!("[search_sector_code_by_name] Searching for sector code by name: {}", sector_name);
    
    // Use EastMoney search API to find sector by name
    // Try different filter combinations to find sectors
    // m:90 means sector/block market, t:3 means sector/block type
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Client error: {}", e))?;
    
    // First, try the search API (more reliable and faster)
    let search_url = format!(
        "http://searchapi.eastmoney.com/api/suggest/get?input={}&type=14",
        urlencoding::encode(sector_name)
    );
    
    println!("[search_sector_code_by_name] Trying search API first: {}", search_url);
    
    // Retry logic for search API (up to 3 attempts with delays)
    for attempt in 1..=3 {
        if attempt > 1 {
            tokio::time::sleep(tokio::time::Duration::from_millis(500 * attempt as u64)).await;
        }
        
        match client.get(&search_url).timeout(std::time::Duration::from_secs(10)).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    if let Ok(json) = response.json::<serde_json::Value>().await {
                        println!("[search_sector_code_by_name] Search API response received");
                        // Parse search results - the structure is QuotationCodeTable.Data
                        if let Some(quotation_table) = json.get("QuotationCodeTable") {
                            if let Some(data_array) = quotation_table.get("Data").and_then(|d| d.as_array()) {
                                println!("[search_sector_code_by_name] Found {} items in search results", data_array.len());
                                for item in data_array {
                                    if let Some(name) = item.get("Name").and_then(|n| n.as_str()) {
                                        // Try exact match first
                                        if name == sector_name {
                                            // Prefer QuoteID if available (it's already in secid format)
                                            if let Some(quote_id) = item.get("QuoteID").and_then(|q| q.as_str()) {
                                                println!("[search_sector_code_by_name] Found exact match: {} -> {} (QuoteID: {})", sector_name, item.get("Code").and_then(|c| c.as_str()).unwrap_or(""), quote_id);
                                                // Return QuoteID if it's in secid format (contains dot), otherwise return Code
                                                if quote_id.contains('.') {
                                                    return Ok(quote_id.to_string());
                                                }
                                            }
                                            if let Some(code) = item.get("Code").and_then(|c| c.as_str()) {
                                                println!("[search_sector_code_by_name] Found exact match: {} -> {}", sector_name, code);
                                                return Ok(code.to_string());
                                            }
                                        }
                                        // Try contains match
                                        else if name.contains(sector_name) || sector_name.contains(name) {
                                            // Prefer QuoteID if available
                                            if let Some(quote_id) = item.get("QuoteID").and_then(|q| q.as_str()) {
                                                println!("[search_sector_code_by_name] Found partial match: {} -> {} (QuoteID: {})", sector_name, item.get("Code").and_then(|c| c.as_str()).unwrap_or(""), quote_id);
                                                if quote_id.contains('.') {
                                                    return Ok(quote_id.to_string());
                                                }
                                            }
                                            if let Some(code) = item.get("Code").and_then(|c| c.as_str()) {
                                                println!("[search_sector_code_by_name] Found partial match: {} -> {} (name: {})", sector_name, code, name);
                                                return Ok(code.to_string());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        // Also try the old structure (Quots) for backward compatibility
                        if let Some(quots) = json.get("Quots").and_then(|q| q.as_array()) {
                            println!("[search_sector_code_by_name] Found {} items in Quots", quots.len());
                            for quot in quots {
                                if let Some(name) = quot.get("Name").and_then(|n| n.as_str()) {
                                    if name == sector_name || name.contains(sector_name) || sector_name.contains(name) {
                                        if let Some(code) = quot.get("Code").and_then(|c| c.as_str()) {
                                            println!("[search_sector_code_by_name] Found via Quots: {} -> {}", sector_name, code);
                                            return Ok(code.to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                if attempt < 3 {
                    eprintln!("[search_sector_code_by_name] Search API error (attempt {}): {}", attempt, e);
                } else {
                    eprintln!("[search_sector_code_by_name] Search API failed after 3 attempts: {}", e);
                }
            }
        }
    }
    
    // Fallback: Try clist API with limited requests (only first page of first filter)
    println!("[search_sector_code_by_name] Search API failed, trying fallback clist API...");
    
    let filter = "m:90+t:3";
    let url = format!(
        "http://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&fs={}&fields=f12,f14,f3",
        filter
    );
    
    // Add delay before fallback request
    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
    
    for attempt in 1..=2 {
        if attempt > 1 {
            tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
        }
        
        match client.get(&url).timeout(std::time::Duration::from_secs(10)).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    if let Ok(json) = response.json::<serde_json::Value>().await {
                        let diff_array = json["data"]["diff"].as_array()
                            .or_else(|| json["diff"].as_array())
                            .or_else(|| json["data"].as_array());
                        
                        if let Some(diff) = diff_array {
                            for item in diff {
                                if let Some(name) = item["f14"].as_str() {
                                    if name == sector_name {
                                        if let Some(code) = item["f12"].as_str() {
                                            println!("[search_sector_code_by_name] Found exact match via fallback: {} -> {}", sector_name, code);
                                            return Ok(code.to_string());
                                        }
                                    }
                                    else if name.contains(sector_name) || sector_name.contains(name) {
                                        if let Some(code) = item["f12"].as_str() {
                                            println!("[search_sector_code_by_name] Found partial match via fallback: {} -> {} (name: {})", sector_name, code, name);
                                            return Ok(code.to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                if attempt < 2 {
                    eprintln!("[search_sector_code_by_name] Fallback API error (attempt {}): {}", attempt, e);
                }
            }
        }
    }
    
    Err(format!("Sector code not found for name: {}", sector_name))
}

pub async fn fetch_sector_info(sector_code: &str, default_name: &str) -> Result<SectorInfo, String> {
    println!("[fetch_sector_info] Starting for sector_code: {}, default_name: {}", sector_code, default_name);
    
    // Check if sector_code is already in secid format (contains dot, like "2.932094" or "90.BK0145")
    let secid = if sector_code.contains('.') {
        println!("[fetch_sector_info] Code is already in secid format: {}", sector_code);
        sector_code.to_string()
    } else {
        // Convert code to secid format using parse_symbol
        let (parsed_secid, _) = parse_symbol(sector_code);
        println!("[fetch_sector_info] Parsed secid: {}", parsed_secid);
        parsed_secid
    };
    
    let url = format!(
        "http://push2.eastmoney.com/api/qt/stock/get?secid={}&fields=f14,f43,f170",
        secid
    );
    println!("[fetch_sector_info] Request URL: {}", url);
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| {
            eprintln!("[fetch_sector_info] Client build error: {}", e);
            format!("Client error: {}", e)
        })?;
    
    println!("[fetch_sector_info] Sending request...");
    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await;
    
    let (name, change_percent) = match response {
        Ok(resp) => {
            println!("[fetch_sector_info] Response status: {}", resp.status());
            if resp.status().is_success() {
                match resp.json::<serde_json::Value>().await {
                    Ok(json) => {
                        println!("[fetch_sector_info] JSON response received");
                        if let Some(data) = json["data"].as_object() {
                            let name = data.get("f14")
                                .and_then(|v| v.as_str())
                                .unwrap_or(default_name)
                                .to_string();
                            let change_percent = data.get("f170")
                                .and_then(|v| v.as_f64())
                                .map(|v| v / 100.0)
                                .unwrap_or(0.0);
                            println!("[fetch_sector_info] Extracted name: {}, change_percent: {:.2}%", name, change_percent);
                            (name, change_percent)
                        } else {
                            eprintln!("[fetch_sector_info] Data field is null or not an object, trying clist API fallback");
                            // Try using clist API as fallback
                            match fetch_sector_info_from_clist(sector_code, default_name, &client).await {
                                Ok((n, cp)) => (n, cp),
                                Err(_) => {
                                    // If secid format was different, try alternative secid formats
                                    // Extract code part if sector_code is already in secid format
                                    let code_part = if sector_code.contains('.') {
                                        sector_code.split('.').nth(1).unwrap_or(sector_code)
                                    } else {
                                        sector_code
                                    };
                                    
                                    if code_part != sector_code || secid != sector_code {
                                        println!("[fetch_sector_info] Trying alternative secid formats for code: {}...", code_part);
                                        // Try with different market codes: 1, 2, 90
                                        let alternatives = vec!["1", "2", "90"];
                                        for market_code in alternatives {
                                            let alt_secid = format!("{}.{}", market_code, code_part);
                                            if alt_secid != secid {
                                                println!("[fetch_sector_info] Trying alternative secid: {}", alt_secid);
                                                let alt_url = format!(
                                                    "http://push2.eastmoney.com/api/qt/stock/get?secid={}&fields=f14,f43,f170",
                                                    alt_secid
                                                );
                                                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                                                if let Ok(alt_resp) = client.get(&alt_url).timeout(std::time::Duration::from_secs(10)).send().await {
                                                    if alt_resp.status().is_success() {
                                                        if let Ok(alt_json) = alt_resp.json::<serde_json::Value>().await {
                                                            if let Some(alt_data) = alt_json["data"].as_object() {
                                                                let alt_name = alt_data.get("f14")
                                                                    .and_then(|v| v.as_str())
                                                                    .unwrap_or(default_name)
                                                                    .to_string();
                                                                let alt_change_percent = alt_data.get("f170")
                                                                    .and_then(|v| v.as_f64())
                                                                    .map(|v| v / 100.0)
                                                                    .unwrap_or(0.0);
                                                                println!("[fetch_sector_info] Successfully fetched with alternative secid {}: name={}, change_percent={:.2}%", alt_secid, alt_name, alt_change_percent);
                                                                return Ok(SectorInfo {
                                                                    code: code_part.to_string(),
                                                                    name: alt_name,
                                                                    sector_type: "Sector".to_string(),
                                                                    change_percent: alt_change_percent,
                                                                    secid: Some(alt_secid),
                                                                });
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    println!("[fetch_sector_info] Full JSON response: {}", serde_json::to_string_pretty(&json).unwrap_or_default());
                                    (default_name.to_string(), 0.0)
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[fetch_sector_info] JSON parse error: {}", e);
                        (default_name.to_string(), 0.0)
                    }
                }
            } else {
                eprintln!("[fetch_sector_info] API error: {}", resp.status());
                // Try clist API as fallback
                match fetch_sector_info_from_clist(sector_code, default_name, &client).await {
                    Ok((n, cp)) => (n, cp),
                    Err(_) => (default_name.to_string(), 0.0)
                }
            }
        }
        Err(e) => {
            eprintln!("[fetch_sector_info] Network error: {}", e);
            (default_name.to_string(), 0.0)
        }
    };
    
    let final_name = if name.is_empty() { sector_code.to_string() } else { name };
    // Extract code part if sector_code is in QuoteID format (contains dot)
    let final_code = if sector_code.contains('.') {
        sector_code.split('.').nth(1).unwrap_or(sector_code).to_string()
    } else {
        sector_code.to_string()
    };
    // Save original secid if sector_code was in secid format
    let secid = if sector_code.contains('.') {
        Some(sector_code.to_string())
    } else {
        None
    };
    println!("[fetch_sector_info] Final result: code={}, name={}, change_percent={:.2}%, secid={:?}", 
        final_code, final_name, change_percent, secid);
    
    Ok(SectorInfo {
        code: final_code,
        name: final_name,
        sector_type: "Sector".to_string(), // Will be overridden by caller
        change_percent,
        secid,
    })
}

// Helper function to fetch sector info from clist API
pub async fn fetch_sector_info_from_clist(sector_code: &str, default_name: &str, client: &reqwest::Client) -> Result<(String, f64), String> {
    println!("[fetch_sector_info_from_clist] Trying clist API for code: {}", sector_code);
    
    // Try different filter options to find the sector
    let filters = vec!["m:90+t:3", "m:90+t:2", "m:90+t:1"];
    
    for filter in filters {
        let url = format!(
            "http://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&fs={}&fields=f12,f14,f3",
            filter
        );
        
        // Add delay between requests
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        
        match client.get(&url).timeout(std::time::Duration::from_secs(10)).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    if let Ok(json) = response.json::<serde_json::Value>().await {
                        let diff_array = json["data"]["diff"].as_array()
                            .or_else(|| json["diff"].as_array())
                            .or_else(|| json["data"].as_array());
                        
                        if let Some(diff) = diff_array {
                            for item in diff {
                                if let Some(code) = item["f12"].as_str() {
                                    if code == sector_code {
                                        let name = item["f14"].as_str().unwrap_or(default_name).to_string();
                                        let change_percent = item["f3"].as_f64().unwrap_or(0.0) / 100.0;
                                        println!("[fetch_sector_info_from_clist] Found via clist: name={}, change_percent={:.2}%", name, change_percent);
                                        return Ok((name, change_percent));
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("[fetch_sector_info_from_clist] Network error with filter {}: {}", filter, e);
            }
        }
    }
    
    Err("Not found in clist API".to_string())
}

pub async fn fetch_all_indices() -> Result<Vec<SectorInfo>, String> {
    println!("[fetch_all_indices] Starting to fetch all indices from East Money API");
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Client error: {}", e))?;
    
    let mut all_indices = Vec::new();
    let mut page = 1;
    let page_size = 100;
    let max_pages = 50; // Limit to prevent infinite loops
    
    // Fetch indices from sector/block market (m:90+t:3)
    // This includes industry, concept, and sector indices
    let filter = "m:90+t:3";
    let fields = "f12,f14,f3";
    
    loop {
        if page > max_pages {
            println!("[fetch_all_indices] Reached max pages limit ({})", max_pages);
            break;
        }
        
        let url = format!(
            "http://push2.eastmoney.com/api/qt/clist/get?pn={}&pz={}&fs={}&fields={}&np=1",
            page, page_size, filter, fields
        );
        
        println!("[fetch_all_indices] Fetching page {}...", page);
        
        match client.get(&url).timeout(std::time::Duration::from_secs(15)).send().await {
            Ok(response) => {
                if !response.status().is_success() {
                    eprintln!("[fetch_all_indices] API error on page {}: {}", page, response.status());
                    break;
                }
                
                match response.json::<serde_json::Value>().await {
                    Ok(json) => {
                        let data = &json["data"];
                        if data.is_null() {
                            println!("[fetch_all_indices] No data on page {}, stopping", page);
                            break;
                        }
                        
                        let diff_array = data["diff"].as_array();
                        if let Some(diff) = diff_array {
                            if diff.is_empty() {
                                println!("[fetch_all_indices] Empty page {}, stopping", page);
                                break;
                            }
                            
                            println!("[fetch_all_indices] Found {} indices on page {}", diff.len(), page);
                            
                            for item in diff {
                                if let Some(code) = item["f12"].as_str() {
                                    if code.starts_with("BK") {
                                        let name = item["f14"].as_str().unwrap_or("").to_string();
                                        let change_percent = item["f3"].as_f64().unwrap_or(0.0) / 100.0;
                                        
                                        // Convert to secid format
                                        let (secid, _) = parse_symbol(code);
                                        
                                        // Determine sector type based on name patterns (rough heuristic)
                                        let sector_type = if name.contains("概念") {
                                            "Concept"
                                        } else if name.contains("行业") || name.contains("板块") {
                                            "Industry"
                                        } else {
                                            "Sector"
                                        };
                                        
                                        all_indices.push(SectorInfo {
                                            code: code.to_string(),
                                            name,
                                            sector_type: sector_type.to_string(),
                                            change_percent,
                                            secid: Some(secid),
                                        });
                                    }
                                }
                            }
                            
                            // Check if there are more pages
                            let total = data["total"].as_i64().unwrap_or(0);
                            let current_count = (page - 1) * page_size + diff.len();
                            if current_count >= total as usize {
                                println!("[fetch_all_indices] Reached end of data (total: {})", total);
                                break;
                            }
                            
                            page += 1;
                            // Add delay between pages to avoid rate limiting
                            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                        } else {
                            println!("[fetch_all_indices] No diff array on page {}, stopping", page);
                            break;
                        }
                    }
                    Err(e) => {
                        eprintln!("[fetch_all_indices] Parse error on page {}: {}", page, e);
                        break;
                    }
                }
            }
            Err(e) => {
                eprintln!("[fetch_all_indices] Network error on page {}: {}", page, e);
                break;
            }
        }
    }
    
    println!("[fetch_all_indices] Fetched {} total indices", all_indices.len());
    Ok(all_indices)
}
