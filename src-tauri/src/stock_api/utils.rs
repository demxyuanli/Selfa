use chrono::{Local, Timelike, Weekday, Datelike};

pub fn is_trading_hours() -> bool {
    let now = Local::now();
    let weekday = now.weekday();
    
    if weekday == Weekday::Sat || weekday == Weekday::Sun {
        return false;
    }
    
    let hour = now.hour();
    let minute = now.minute();
    let total_minutes = hour * 60 + minute;
    
    (total_minutes >= 570 && total_minutes <= 690) || (total_minutes >= 780 && total_minutes <= 900)
}

pub fn should_reset_triggered_alerts() -> bool {
    let now = Local::now();
    let weekday = now.weekday();
    
    if weekday == Weekday::Sat || weekday == Weekday::Sun {
        return false;
    }
    
    let hour = now.hour();
    hour >= 15
}

pub fn parse_symbol(symbol: &str) -> (String, String) {
    let code = symbol.trim();
    
    // Handle Sector/Block codes (BKxxxx)
    if code.starts_with("BK") {
        return (format!("90.{}", code), "BK".to_string());
    }
    
    // Special handling for index symbols
    if code == "000001" {
        return (format!("1.{}", code), "SH".to_string());
    }
    
    // 000688 is STAR Index (科创50指数), which is a Shanghai market index, not Shenzhen
    if code == "000688" {
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

pub fn parse_date(date_str: &str) -> Result<chrono::NaiveDate, String> {
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

pub fn parse_datetime(date_str: &str) -> Result<chrono::NaiveDateTime, String> {
    // Try full datetime first
    chrono::NaiveDateTime::parse_from_str(date_str, "%Y-%m-%d %H:%M:%S")
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(date_str, "%Y-%m-%d %H:%M"))
        .or_else(|_| {
            // Fallback to date only, assume start of day
            parse_date(date_str).map(|d| d.and_hms_opt(0, 0, 0).unwrap())
        })
        .map_err(|e| format!("Failed to parse datetime: {}", e))
}

pub fn add_days(date: &chrono::NaiveDate, days: i32) -> Result<String, String> {
    let new_date = *date + chrono::Duration::days(days as i64);
    Ok(new_date.format("%Y-%m-%d").to_string())
}

pub fn add_minutes(datetime_str: &str, minutes: i64) -> Result<String, String> {
    let dt = parse_datetime(datetime_str)?;
    let new_dt = dt + chrono::Duration::minutes(minutes);
    Ok(new_dt.format("%Y-%m-%d %H:%M:%S").to_string())
}

pub fn calculate_variance(data: &[f64]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }
    let mean = data.iter().sum::<f64>() / data.len() as f64;
    let variance = data.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / data.len() as f64;
    variance
}

pub fn determine_signal(predicted: f64, current: f64, trend: f64) -> String {
    let change_percent = (predicted - current) / current * 100.0;
    if change_percent > 2.0 && trend > 0.0 {
        "buy".to_string()
    } else if change_percent < -2.0 && trend < 0.0 {
        "sell".to_string()
    } else {
        "hold".to_string()
    }
}

pub fn polynomial_predict(data: &[f64], x: f64, degree: usize) -> f64 {
    let n = data.len();
    if n < degree + 1 {
        return if n > 0 { data[n - 1] } else { 0.0 };
    }

    let coeffs = polynomial_fit(data, degree);
    let mut result = 0.0;
    for j in 0..=degree {
        result += coeffs[j] * x.powi(j as i32);
    }
    result
}

fn polynomial_fit(data: &[f64], degree: usize) -> Vec<f64> {
    let n = data.len();
    if n < degree + 1 {
        return vec![if n > 0 { data[n - 1] } else { 0.0 }];
    }

    let mut x_matrix = vec![vec![0.0; degree + 1]; n];
    let mut y_vec = vec![0.0; n];

    for i in 0..n {
        let xi = i as f64;
        y_vec[i] = data[i];
        for j in 0..=degree {
            x_matrix[i][j] = xi.powi(j as i32);
        }
    }

    solve_polynomial_system(&x_matrix, &y_vec, degree)
}

fn solve_polynomial_system(x_matrix: &[Vec<f64>], y_vec: &[f64], degree: usize) -> Vec<f64> {
    let n = x_matrix.len();
    let m = degree + 1;

    let mut xtx = vec![vec![0.0; m]; m];
    let mut xty = vec![0.0; m];

    for i in 0..m {
        for j in 0..m {
            let mut sum = 0.0;
            for k in 0..n {
                sum += x_matrix[k][i] * x_matrix[k][j];
            }
            xtx[i][j] = sum;
        }
        
        let mut sum = 0.0;
        for k in 0..n {
            sum += x_matrix[k][i] * y_vec[k];
        }
        xty[i] = sum;
    }

    gaussian_elimination(&mut xtx, &mut xty)
}

fn gaussian_elimination(a: &mut [Vec<f64>], b: &mut [f64]) -> Vec<f64> {
    let n = b.len();
    
    for i in 0..n {
        let mut max_row = i;
        for k in (i + 1)..n {
            if a[k][i].abs() > a[max_row][i].abs() {
                max_row = k;
            }
        }
        
        if max_row != i {
            a.swap(i, max_row);
            b.swap(i, max_row);
        }
        
        if a[i][i].abs() < 1e-10 {
            for j in i + 1..n {
                if a[j][i].abs() > 1e-10 {
                    for k in i..n {
                        a[i][k] += a[j][k];
                    }
                    b[i] += b[j];
                    break;
                }
            }
        }
        
        if a[i][i].abs() < 1e-10 {
            continue;
        }
        
        for k in (i + 1)..n {
            let factor = a[k][i] / a[i][i];
            for j in i..n {
                a[k][j] -= factor * a[i][j];
            }
            b[k] -= factor * b[i];
        }
    }
    
    let mut x = vec![0.0; n];
    for i in (0..n).rev() {
        x[i] = b[i];
        for j in (i + 1)..n {
            x[i] -= a[i][j] * x[j];
        }
        if a[i][i].abs() > 1e-10 {
            x[i] /= a[i][i];
        }
    }
    
    x
}

pub fn calculate_trend_slope(data: &[f64]) -> f64 {
    if data.len() < 2 {
        return 0.0;
    }
    let n = data.len() as f64;
    let x_sum: f64 = (0..data.len()).map(|i| i as f64).sum();
    let y_sum: f64 = data.iter().sum();
    let xy_sum: f64 = (0..data.len()).map(|i| i as f64 * data[i]).sum();
    let x2_sum: f64 = (0..data.len()).map(|i| (i as f64).powi(2)).sum();

    let slope = (n * xy_sum - x_sum * y_sum) / (n * x2_sum - x_sum * x_sum);
    slope
}

pub fn calculate_autocorrelation(data: &[f64], lag: usize) -> f64 {
    if data.len() <= lag || lag == 0 {
        return 0.0;
    }
    
    let mean = data.iter().sum::<f64>() / data.len() as f64;
    let mut numerator = 0.0;
    let mut denominator = 0.0;
    
    for i in lag..data.len() {
        let diff = data[i] - mean;
        let lag_diff = data[i - lag] - mean;
        numerator += diff * lag_diff;
        denominator += lag_diff * lag_diff;
    }
    
    if denominator == 0.0 {
        return 0.0;
    }
    
    numerator / denominator
}

pub fn calculate_volatility(data: &[f64], window: usize) -> f64 {
    if data.len() < 2 || window < 2 {
        return 0.0;
    }
    
    let recent_data = &data[data.len().saturating_sub(window)..];
    if recent_data.len() < 2 {
        return 0.0;
    }
    
    let mut returns = Vec::new();
    for i in 1..recent_data.len() {
        if recent_data[i - 1] > 0.0 {
            returns.push((recent_data[i] / recent_data[i - 1] - 1.0).abs());
        }
    }
    
    if returns.is_empty() {
        return 0.0;
    }
    
    calculate_variance(&returns).sqrt()
}

pub fn validate_data(data: &[f64]) -> Vec<f64> {
    data.iter()
        .filter_map(|&x| {
            if x.is_finite() && x > 0.0 {
                Some(x)
            } else {
                None
            }
        })
        .collect()
}

pub fn calculate_r_squared(actual: &[f64], predicted: &[f64]) -> f64 {
    if actual.len() != predicted.len() || actual.is_empty() {
        return 0.0;
    }
    
    let mean = actual.iter().sum::<f64>() / actual.len() as f64;
    let mut ss_res = 0.0;
    let mut ss_tot = 0.0;
    
    for (a, p) in actual.iter().zip(predicted.iter()) {
        ss_res += (a - p).powi(2);
        ss_tot += (a - mean).powi(2);
    }
    
    if ss_tot == 0.0 {
        return 0.0;
    }
    
    1.0 - (ss_res / ss_tot)
}

pub fn detect_swing_high(data: &[f64], window: usize) -> Option<(usize, f64)> {
    if data.len() < window * 2 + 1 {
        return None;
    }
    
    let start = window;
    let end = data.len() - window;
    
    for i in start..end {
        let center_value = data[i];
        let mut is_high = true;
        
        for j in (i.saturating_sub(window))..i {
            if data[j] >= center_value {
                is_high = false;
                break;
            }
        }
        
        if is_high {
            for j in (i + 1)..=(i + window).min(data.len() - 1) {
                if data[j] >= center_value {
                    is_high = false;
                    break;
                }
            }
        }
        
        if is_high {
            return Some((i, center_value));
        }
    }
    
    None
}

pub fn detect_swing_low(data: &[f64], window: usize) -> Option<(usize, f64)> {
    if data.len() < window * 2 + 1 {
        return None;
    }
    
    let start = window;
    let end = data.len() - window;
    
    for i in start..end {
        let center_value = data[i];
        let mut is_low = true;
        
        for j in (i.saturating_sub(window))..i {
            if data[j] <= center_value {
                is_low = false;
                break;
            }
        }
        
        if is_low {
            for j in (i + 1)..=(i + window).min(data.len() - 1) {
                if data[j] <= center_value {
                    is_low = false;
                    break;
                }
            }
        }
        
        if is_low {
            return Some((i, center_value));
        }
    }
    
    None
}

pub fn detect_swing_high_with_volume(
    prices: &[f64],
    volumes: &[i64],
    window: usize,
) -> Option<(usize, f64)> {
    if prices.len() != volumes.len() || prices.len() < window * 2 + 1 {
        return detect_swing_high(prices, window);
    }
    
    let start = window;
    let end = prices.len() - window;
    
    // Calculate average volume for volume confirmation
    let avg_volume: f64 = volumes.iter().map(|&v| v as f64).sum::<f64>() / volumes.len() as f64;
    
    for i in start..end {
        let center_value = prices[i];
        let mut is_high = true;
        
        for j in (i.saturating_sub(window))..i {
            if prices[j] >= center_value {
                is_high = false;
                break;
            }
        }
        
        if is_high {
            for j in (i + 1)..=(i + window).min(prices.len() - 1) {
                if prices[j] >= center_value {
                    is_high = false;
                    break;
                }
            }
        }
        
        // Volume confirmation: swing high should have volume >= average
        if is_high {
            let center_volume = volumes[i] as f64;
            if center_volume >= avg_volume * 0.8 {
                return Some((i, center_value));
            }
        }
    }
    
    // Fallback to price-only detection if no volume-confirmed swing found
    detect_swing_high(prices, window)
}

pub fn detect_swing_low_with_volume(
    prices: &[f64],
    volumes: &[i64],
    window: usize,
) -> Option<(usize, f64)> {
    if prices.len() != volumes.len() || prices.len() < window * 2 + 1 {
        return detect_swing_low(prices, window);
    }
    
    let start = window;
    let end = prices.len() - window;
    
    // Calculate average volume for volume confirmation
    let avg_volume: f64 = volumes.iter().map(|&v| v as f64).sum::<f64>() / volumes.len() as f64;
    
    for i in start..end {
        let center_value = prices[i];
        let mut is_low = true;
        
        for j in (i.saturating_sub(window))..i {
            if prices[j] <= center_value {
                is_low = false;
                break;
            }
        }
        
        if is_low {
            for j in (i + 1)..=(i + window).min(prices.len() - 1) {
                if prices[j] <= center_value {
                    is_low = false;
                    break;
                }
            }
        }
        
        // Volume confirmation: swing low should have volume >= average
        if is_low {
            let center_volume = volumes[i] as f64;
            if center_volume >= avg_volume * 0.8 {
                return Some((i, center_value));
            }
        }
    }
    
    // Fallback to price-only detection if no volume-confirmed swing found
    detect_swing_low(prices, window)
}
