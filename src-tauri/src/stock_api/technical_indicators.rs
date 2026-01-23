use super::types::{StockData, TechnicalIndicators};

pub struct MacdResult {
    pub macd: Vec<f64>,
    pub signal: Vec<f64>,
    pub histogram: Vec<f64>,
}

pub struct BollingerResult {
    pub middle: Vec<f64>,
    pub upper: Vec<f64>,
    pub lower: Vec<f64>,
    pub bandwidth: Vec<f64>,
}

pub struct KdjResult {
    pub k: Vec<f64>,
    pub d: Vec<f64>,
    pub j: Vec<f64>,
}

pub fn calculate_indicators(data: Vec<StockData>) -> TechnicalIndicators {
    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();

    let sma_20 = calculate_sma(&closes, 20);
    let sma_50 = calculate_sma(&closes, 50);
    let ema_12 = calculate_ema(&closes, 12);
    let ema_26 = calculate_ema(&closes, 26);

    let rsi = calculate_rsi(&closes, 14);
    let macd_res = calculate_macd(&closes, 12, 26, 9);

    let vwap = calculate_vwap(&data);
    let bb = calculate_bollinger_bands(&closes, 20, 2.0);
    let atr = calculate_atr(&data, 14);
    let kdj = calculate_kdj(&data, 9, 3, 3);
    let williams_r = calculate_williams_r(&data, 14);

    TechnicalIndicators {
        sma_20,
        sma_50,
        ema_12,
        ema_26,
        rsi,
        macd: macd_res.macd,
        macd_signal: macd_res.signal,
        macd_histogram: macd_res.histogram,
        vwap,
        bollinger_middle: bb.middle,
        bollinger_upper: bb.upper,
        bollinger_lower: bb.lower,
        bollinger_bandwidth: bb.bandwidth,
        atr,
        kdj_k: kdj.k,
        kdj_d: kdj.d,
        kdj_j: kdj.j,
        williams_r,
    }
}

// ---------------------------------------------------------------------------
// Core algorithms (optimized)
// ---------------------------------------------------------------------------

pub fn calculate_sma(data: &[f64], period: usize) -> Vec<f64> {
    if data.len() < period {
        return vec![0.0; data.len()];
    }

    let mut result = vec![0.0; period - 1];
    let mut sum: f64 = data.iter().take(period).sum();
    result.push(sum / period as f64);

    for i in period..data.len() {
        sum += data[i] - data[i - period];
        result.push(sum / period as f64);
    }

    result
}

pub fn calculate_ema(data: &[f64], period: usize) -> Vec<f64> {
    if data.is_empty() {
        return Vec::new();
    }

    let k = 2.0 / (period as f64 + 1.0);
    let mut result = Vec::with_capacity(data.len());

    let mut ema = data[0];
    result.push(ema);

    for &price in data.iter().skip(1) {
        ema = price * k + ema * (1.0 - k);
        result.push(ema);
    }

    result
}

pub fn calculate_std_dev(data: &[f64], period: usize, sma: &[f64]) -> Vec<f64> {
    let mut result = vec![0.0; data.len()];

    for i in (period - 1)..data.len() {
        let window = &data[(i + 1 - period)..=i];
        let mean = sma[i];
        let variance: f64 = window
            .iter()
            .map(|&x| (x - mean).powi(2))
            .sum::<f64>()
            / period as f64;
        result[i] = variance.sqrt();
    }

    result
}

// ---------------------------------------------------------------------------
// Advanced / trading-oriented indicators
// ---------------------------------------------------------------------------

pub fn calculate_vwap(data: &[StockData]) -> Vec<f64> {
    let mut vwap = Vec::with_capacity(data.len());
    let mut cum_pv = 0.0;
    let mut cum_vol = 0.0;

    for d in data {
        let typical_price = (d.high + d.low + d.close) / 3.0;
        let vol = d.volume as f64;

        cum_pv += typical_price * vol;
        cum_vol += vol;

        if cum_vol == 0.0 {
            vwap.push(typical_price);
        } else {
            vwap.push(cum_pv / cum_vol);
        }
    }

    vwap
}

pub fn calculate_bollinger_bands(
    data: &[f64],
    period: usize,
    std_dev_multiplier: f64,
) -> BollingerResult {
    let sma = calculate_sma(data, period);
    let std_dev = calculate_std_dev(data, period, &sma);

    let mut upper = vec![0.0; data.len()];
    let mut lower = vec![0.0; data.len()];
    let mut bandwidth = vec![0.0; data.len()];

    for i in 0..data.len() {
        if sma[i] != 0.0 {
            upper[i] = sma[i] + (std_dev[i] * std_dev_multiplier);
            lower[i] = sma[i] - (std_dev[i] * std_dev_multiplier);
            bandwidth[i] = (upper[i] - lower[i]) / sma[i];
        }
    }

    BollingerResult {
        middle: sma,
        upper,
        lower,
        bandwidth,
    }
}

pub fn calculate_rsi_wilder(data: &[f64], period: usize) -> Vec<f64> {
    if data.len() < period + 1 {
        return vec![0.0; data.len()];
    }

    let mut rsi = vec![0.0; data.len()];
    let mut avg_gain = 0.0;
    let mut avg_loss = 0.0;

    for i in 1..=period {
        let change = data[i] - data[i - 1];
        if change > 0.0 {
            avg_gain += change;
        } else {
            avg_loss += -change;
        }
    }
    avg_gain /= period as f64;
    avg_loss /= period as f64;

    rsi[period] = 100.0
        - (100.0 / (1.0 + (avg_gain / avg_loss.max(f64::EPSILON))));

    for i in (period + 1)..data.len() {
        let change = data[i] - data[i - 1];
        let current_gain = if change > 0.0 { change } else { 0.0 };
        let current_loss = if change < 0.0 { -change } else { 0.0 };

        avg_gain = ((avg_gain * (period as f64 - 1.0)) + current_gain) / period as f64;
        avg_loss = ((avg_loss * (period as f64 - 1.0)) + current_loss) / period as f64;

        if avg_loss == 0.0 {
            rsi[i] = 100.0;
        } else {
            let rs = avg_gain / avg_loss;
            rsi[i] = 100.0 - (100.0 / (1.0 + rs));
        }
    }

    rsi
}

pub fn calculate_rsi(data: &[f64], period: usize) -> Vec<f64> {
    calculate_rsi_wilder(data, period)
}

pub fn calculate_atr(data: &[StockData], period: usize) -> Vec<f64> {
    if data.len() < period {
        return vec![0.0; data.len()];
    }

    let mut tr_vec = Vec::with_capacity(data.len());
    tr_vec.push(data[0].high - data[0].low);

    for i in 1..data.len() {
        let hl = data[i].high - data[i].low;
        let hc = (data[i].high - data[i - 1].close).abs();
        let lc = (data[i].low - data[i - 1].close).abs();
        tr_vec.push(hl.max(hc).max(lc));
    }

    let mut atr = vec![0.0; data.len()];

    let first_atr: f64 = tr_vec.iter().take(period).sum::<f64>() / period as f64;
    atr[period - 1] = first_atr;

    for i in period..data.len() {
        atr[i] = (atr[i - 1] * (period as f64 - 1.0) + tr_vec[i]) / period as f64;
    }

    atr
}

pub fn calculate_kdj(
    data: &[StockData],
    n: usize,
    m1: usize,
    m2: usize,
) -> KdjResult {
    let mut rsv_vec = vec![0.0; data.len()];

    for i in (n - 1)..data.len() {
        let window = &data[(i + 1 - n)..=i];
        let low_n = window.iter().map(|d| d.low).fold(f64::INFINITY, f64::min);
        let high_n = window
            .iter()
            .map(|d| d.high)
            .fold(f64::NEG_INFINITY, f64::max);

        if (high_n - low_n).abs() > f64::EPSILON {
            rsv_vec[i] = (data[i].close - low_n) / (high_n - low_n) * 100.0;
        } else {
            rsv_vec[i] = 50.0;
        }
    }

    let mut k = vec![0.0; data.len()];
    let mut d = vec![0.0; data.len()];
    let mut j = vec![0.0; data.len()];

    let mut prev_k = 50.0;
    let mut prev_d = 50.0;

    for i in 0..data.len() {
        if i < n - 1 {
            k[i] = 50.0;
            d[i] = 50.0;
            j[i] = 50.0;
            continue;
        }

        let k_val = (prev_k * (m1 as f64 - 1.0) + rsv_vec[i]) / m1 as f64;
        let d_val = (prev_d * (m2 as f64 - 1.0) + k_val) / m2 as f64;
        let j_val = 3.0 * k_val - 2.0 * d_val;

        k[i] = k_val;
        d[i] = d_val;
        j[i] = j_val;

        prev_k = k_val;
        prev_d = d_val;
    }

    KdjResult { k, d, j }
}

pub fn calculate_williams_r(data: &[StockData], period: usize) -> Vec<f64> {
    let mut result = vec![0.0; data.len()];

    for i in (period - 1)..data.len() {
        let window = &data[(i + 1 - period)..=i];
        let high_n = window
            .iter()
            .map(|d| d.high)
            .fold(f64::NEG_INFINITY, f64::max);
        let low_n = window.iter().map(|d| d.low).fold(f64::INFINITY, f64::min);

        if (high_n - low_n).abs() > f64::EPSILON {
            result[i] = -100.0 * (high_n - data[i].close) / (high_n - low_n);
        } else {
            result[i] = -50.0;
        }
    }

    result
}

pub fn calculate_macd(
    data: &[f64],
    fast: usize,
    slow: usize,
    signal: usize,
) -> MacdResult {
    let ema_fast = calculate_ema(data, fast);
    let ema_slow = calculate_ema(data, slow);

    let macd_line: Vec<f64> = ema_fast
        .iter()
        .zip(ema_slow.iter())
        .map(|(f, s)| {
            let diff = f - s;
            if diff.is_finite() {
                diff
            } else {
                0.0
            }
        })
        .collect();

    let signal_line = calculate_ema(&macd_line, signal);

    let histogram: Vec<f64> = macd_line
        .iter()
        .zip(signal_line.iter())
        .map(|(m, s)| {
            let h = m - s;
            if h.is_finite() {
                h
            } else {
                0.0
            }
        })
        .collect();

    MacdResult {
        macd: macd_line,
        signal: signal_line,
        histogram,
    }
}

// ---------------------------------------------------------------------------
// Legacy / optional indicators (kept for compatibility)
// ---------------------------------------------------------------------------

#[allow(dead_code)]
pub fn calculate_stochastic_oscillator(data: &[StockData], period: usize) -> Vec<f64> {
    if data.len() < period {
        return vec![0.0; data.len()];
    }

    let mut k_values = vec![0.0; period - 1];

    for i in (period - 1)..data.len() {
        let window = &data[(i + 1 - period)..=i];
        let high = window.iter().map(|d| d.high).fold(0.0_f64, f64::max);
        let low = window.iter().map(|d| d.low).fold(f64::INFINITY, f64::min);
        let close = data[i].close;

        if (high - low).abs() > f64::EPSILON
            && high.is_finite()
            && low.is_finite()
            && close.is_finite()
        {
            let stoch_k = ((close - low) / (high - low)) * 100.0;
            k_values.push(stoch_k);
        } else {
            k_values.push(50.0);
        }
    }

    k_values
}

#[allow(dead_code)]
pub struct StochasticResult {
    pub k: Vec<f64>,
    pub d: Vec<f64>,
}

#[allow(dead_code)]
pub fn calculate_stochastic_with_d(
    data: &[StockData],
    k_period: usize,
    d_period: usize,
) -> StochasticResult {
    let k_values = calculate_stochastic_oscillator(data, k_period);

    let mut d_values = vec![0.0; k_period - 1];

    if k_values.len() >= k_period - 1 + d_period {
        for idx in (k_period - 1)..k_values.len() {
            if idx >= d_period - 1 {
                let d_window_start = idx.saturating_sub(d_period - 1);
                let d_sum: f64 = k_values[d_window_start..=idx].iter().sum();
                d_values.push(d_sum / d_period as f64);
            } else {
                d_values.push(50.0);
            }
        }
    } else {
        for _idx in (k_period - 1)..k_values.len() {
            d_values.push(50.0);
        }
    }

    StochasticResult {
        k: k_values,
        d: d_values,
    }
}

#[allow(dead_code)]
pub fn calculate_adx(data: &[StockData], period: usize) -> Vec<f64> {
    if data.len() < period + 1 {
        return vec![0.0; data.len()];
    }

    let mut tr_values = Vec::new();
    let mut plus_dm = Vec::new();
    let mut minus_dm = Vec::new();

    for i in 1..data.len() {
        let high_diff = data[i].high - data[i - 1].high;
        let low_diff = data[i - 1].low - data[i].low;

        let tr = (data[i].high - data[i].low)
            .abs()
            .max((data[i].high - data[i - 1].close).abs())
            .max((data[i].low - data[i - 1].close).abs());
        tr_values.push(tr);

        let plus = if high_diff > low_diff && high_diff > 0.0 {
            high_diff
        } else {
            0.0
        };
        let minus = if low_diff > high_diff && low_diff > 0.0 {
            low_diff
        } else {
            0.0
        };
        plus_dm.push(plus);
        minus_dm.push(minus);
    }

    let mut result = vec![0.0; period];

    let mut atr = if !tr_values.is_empty() {
        tr_values[0..period.min(tr_values.len())]
            .iter()
            .sum::<f64>()
            / period.min(tr_values.len()) as f64
    } else {
        0.0
    };
    let mut plus_di_smoothed = if !plus_dm.is_empty() {
        plus_dm[0..period.min(plus_dm.len())]
            .iter()
            .sum::<f64>()
            / period.min(plus_dm.len()) as f64
    } else {
        0.0
    };
    let mut minus_di_smoothed = if !minus_dm.is_empty() {
        minus_dm[0..period.min(minus_dm.len())]
            .iter()
            .sum::<f64>()
            / period.min(minus_dm.len()) as f64
    } else {
        0.0
    };

    let wilder_factor = (period as f64 - 1.0) / period as f64;

    for i in period..tr_values.len() {
        atr = atr * wilder_factor + tr_values[i];
        plus_di_smoothed = plus_di_smoothed * wilder_factor + plus_dm[i];
        minus_di_smoothed = minus_di_smoothed * wilder_factor + minus_dm[i];

        let plus_di = if atr > 0.0 {
            (plus_di_smoothed / atr) * 100.0
        } else {
            0.0
        };
        let minus_di = if atr > 0.0 {
            (minus_di_smoothed / atr) * 100.0
        } else {
            0.0
        };

        let dx = if (plus_di + minus_di) > 0.0 {
            ((plus_di - minus_di).abs() / (plus_di + minus_di)) * 100.0
        } else {
            0.0
        };

        result.push(dx);
    }

    result
}
