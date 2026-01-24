use super::types::StockData;

pub fn detect_patterns(data: &[StockData]) -> Vec<Option<String>> {
    let mut results = vec![None; data.len()];

    if data.len() < 3 {
        return results;
    }

    for i in 2..data.len() {
        let current = &data[i];
        let prev = &data[i - 1];
        let prev2 = &data[i - 2];

        // Doji
        if is_doji(current) {
            results[i] = Some("Doji".to_string());
            continue;
        }

        // Hammer / Hanging Man
        if is_hammer(current) {
            // If downtrend, it's a Hammer (Bullish)
            // If uptrend, it's a Hanging Man (Bearish) - simplified
            // For now just call it Hammer/Hanging Man based on shape
            results[i] = Some("Hammer".to_string());
            continue;
        }

        // Engulfing
        if is_bullish_engulfing(prev, current) {
            results[i] = Some("Bullish Engulfing".to_string());
            continue;
        }
        if is_bearish_engulfing(prev, current) {
            results[i] = Some("Bearish Engulfing".to_string());
            continue;
        }

        // Morning Star (3 candles)
        if is_morning_star(prev2, prev, current) {
            results[i] = Some("Morning Star".to_string());
            continue;
        }

        // Evening Star (3 candles)
        if is_evening_star(prev2, prev, current) {
            results[i] = Some("Evening Star".to_string());
            continue;
        }
    }

    results
}

fn is_doji(d: &StockData) -> bool {
    let body = (d.close - d.open).abs();
    let range = d.high - d.low;
    range > 0.0 && body <= range * 0.1
}

fn is_hammer(d: &StockData) -> bool {
    let body = (d.close - d.open).abs();
    let range = d.high - d.low;
    let lower_shadow = d.open.min(d.close) - d.low;
    let upper_shadow = d.high - d.open.max(d.close);

    // Small body, long lower shadow, small upper shadow
    range > 0.0 
        && body <= range * 0.3 
        && lower_shadow >= body * 2.0 
        && upper_shadow <= range * 0.1
}

fn is_bullish_engulfing(prev: &StockData, curr: &StockData) -> bool {
    // Prev is bearish, Curr is bullish
    let prev_body = prev.close < prev.open;
    let curr_body = curr.close > curr.open;
    
    // Curr body engulfs Prev body
    prev_body && curr_body 
        && curr.open <= prev.close 
        && curr.close >= prev.open
}

fn is_bearish_engulfing(prev: &StockData, curr: &StockData) -> bool {
    // Prev is bullish, Curr is bearish
    let prev_body = prev.close > prev.open;
    let curr_body = curr.close < curr.open;
    
    // Curr body engulfs Prev body
    prev_body && curr_body 
        && curr.open >= prev.close 
        && curr.close <= prev.open
}

fn is_morning_star(first: &StockData, second: &StockData, third: &StockData) -> bool {
    // 1. Long bearish
    let first_bearish = first.close < first.open && (first.open - first.close) > (first.high - first.low) * 0.5;
    
    // 2. Gap down small body (doji-like)
    let second_small = (second.close - second.open).abs() < (second.high - second.low) * 0.3;
    let _gap_down = second.high < first.low; // Strict gap, or just body gap
    
    // 3. Bullish candle closing well into first
    let third_bullish = third.close > third.open;
    let third_closes_into_first = third.close > (first.close + first.open) / 2.0;

    first_bearish && second_small && third_bullish && third_closes_into_first
}

fn is_evening_star(first: &StockData, second: &StockData, third: &StockData) -> bool {
    // 1. Long bullish
    let first_bullish = first.close > first.open && (first.close - first.open) > (first.high - first.low) * 0.5;
    
    // 2. Gap up small body
    let second_small = (second.close - second.open).abs() < (second.high - second.low) * 0.3;
    
    // 3. Bearish candle closing well into first
    let third_bearish = third.close < third.open;
    let third_closes_into_first = third.close < (first.close + first.open) / 2.0;

    first_bullish && second_small && third_bearish && third_closes_into_first
}
