#![allow(dead_code)]

use super::types::PredictionResult;
use super::utils::{parse_date, add_days, calculate_variance, determine_signal, calculate_trend_slope, calculate_autocorrelation};

pub fn predict_arima(
    closes: &[f64],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if closes.len() < 30 {
        return Err("Need at least 30 data points for ARIMA".to_string());
    }

    let recent_data = &closes[closes.len().saturating_sub(50)..];
    let n = recent_data.len();

    let (d, stationary_data) = determine_differencing_order(recent_data)?;

    if stationary_data.len() < 20 {
        return Err("Insufficient stationary data for ARIMA modeling".to_string());
    }

    let (p, q, ar_coeffs, ma_coeffs, residual_variance) = fit_arima_model(&stationary_data)?;

    let model = ARIMAModel {
        p,
        d,
        q,
        ar_coeffs,
        ma_coeffs,
        residual_variance,
        aic: 0.0, // 原始函数不计算这些值
        bic: 0.0,
        log_likelihood: 0.0,
    };

    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let last_original_price = recent_data[n - 1];

    let mut prediction_history = stationary_data.clone();

    for i in 1..=period {
        let next_diff = predict_next_value(&prediction_history, &model.ar_coeffs, &model.ma_coeffs, model.residual_variance);
        prediction_history.push(next_diff);

        let mut predicted_price = last_original_price;
        for j in 0..i {
            predicted_price += prediction_history[stationary_data.len() + j];
        }

        let std_dev = (model.residual_variance * (i as f64)).sqrt();
        let confidence = (85.0 - (std_dev / predicted_price.abs().max(0.01) * 100.0).min(35.0)).max(50.0);

        let upper_bound = predicted_price + 1.96 * std_dev;
        let lower_bound = predicted_price - 1.96 * std_dev;

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
            method: format!("ARIMA({},{},{})", model.p, model.d, model.q),
            reasoning: None,
        });
    }

    Ok(results)
}

// 自动ARIMA参数选择
pub fn auto_arima(data: &[f64], config: &ARIMAConfig) -> Result<ARIMAModel, String> {
    if data.len() < 30 {
        return Err("Need at least 30 data points for auto ARIMA".to_string());
    }

    let mut best_model: Option<ARIMAModel> = None;
    let mut best_criterion_value = f64::INFINITY;

    // 遍历所有可能的参数组合
    for d in config.d_range.0..=config.d_range.1 {
        let stationary_data = if d > 0 {
            difference_series(data, d)
        } else {
            data.to_vec()
        };

        if stationary_data.len() < 10 {
            continue;
        }

        for p in config.p_range.0..=config.p_range.1 {
            for q in config.q_range.0..=config.q_range.1 {
                if p == 0 && q == 0 {
                    continue;
                }

                match fit_arma_model_with_criteria(&stationary_data, p, q, data.len()) {
                    Ok(model) => {
                        let criterion_value = match config.criterion {
                            SelectionCriterion::AIC => model.aic,
                            SelectionCriterion::BIC => model.bic,
                        };

                        if criterion_value < best_criterion_value {
                            best_criterion_value = criterion_value;
                            best_model = Some(ARIMAModel {
                                p,
                                d,
                                q,
                                ar_coeffs: model.ar_coeffs,
                                ma_coeffs: model.ma_coeffs,
                                residual_variance: model.residual_variance,
                                aic: model.aic,
                                bic: model.bic,
                                log_likelihood: model.log_likelihood,
                            });
                        }
                    }
                    Err(_) => continue,
                }
            }
        }
    }

    best_model.ok_or_else(|| "Could not find suitable ARIMA model".to_string())
}

fn determine_differencing_order(data: &[f64]) -> Result<(usize, Vec<f64>), String> {
    if data.len() < 10 {
        return Ok((0, data.to_vec()));
    }

    let is_stationary = test_stationarity(data);

    if is_stationary {
        return Ok((0, data.to_vec()));
    }

    let mut diff_data = Vec::new();
    for i in 1..data.len() {
        diff_data.push(data[i] - data[i - 1]);
    }

    let is_stationary_after_diff = test_stationarity(&diff_data);

    if is_stationary_after_diff {
        Ok((1, diff_data))
    } else {
        let mut diff2_data = Vec::new();
        for i in 1..diff_data.len() {
            diff2_data.push(diff_data[i] - diff_data[i - 1]);
        }
        Ok((2, diff2_data))
    }
}

fn test_stationarity(data: &[f64]) -> bool {
    if data.len() < 5 {
        return false;
    }

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

    rho.abs() < 0.8
}

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

    for p in 0..=3 {
        for q in 0..=3 {
            if p == 0 && q == 0 {
                continue;
            }

            match fit_arma_model(data, p, q) {
                Ok((ar_coeffs, ma_coeffs, residual_variance)) => {
                    let k = (p + q) as f64;
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

fn fit_arma_model(data: &[f64], p: usize, q: usize) -> Result<(Vec<f64>, Vec<f64>, f64), String> {
    if data.len() < p.max(q) + 5 {
        return Err("Insufficient data for ARMA fitting".to_string());
    }

    let ar_coeffs = if p > 0 {
        estimate_ar_coefficients(data, p)?
    } else {
        Vec::new()
    };

    let ma_coeffs = if q > 0 {
        estimate_ma_coefficients(data, q)?
    } else {
        Vec::new()
    };

    let residual_variance = calculate_residual_variance(data, &ar_coeffs, &ma_coeffs);

    Ok((ar_coeffs, ma_coeffs, residual_variance))
}

fn fit_arma_model_with_criteria(data: &[f64], p: usize, q: usize, original_len: usize) -> Result<ARIMAModel, String> {
    if data.len() < p.max(q) + 5 {
        return Err("Insufficient data for ARMA fitting".to_string());
    }

    let ar_coeffs = if p > 0 {
        estimate_ar_coefficients(data, p)?
    } else {
        Vec::new()
    };

    let ma_coeffs = if q > 0 {
        estimate_ma_coefficients(data, q)?
    } else {
        Vec::new()
    };

    let residual_variance = calculate_residual_variance(data, &ar_coeffs, &ma_coeffs);

    let n = original_len as f64;
    let k = (p + q) as f64;
    
    let log_likelihood = -0.5 * n * (residual_variance.ln() + 2.0 * std::f64::consts::PI);
    let aic = -2.0 * log_likelihood + 2.0 * k;
    let bic = -2.0 * log_likelihood + k * n.ln();

    Ok(ARIMAModel {
        p,
        d: 0,
        q,
        ar_coeffs,
        ma_coeffs,
        residual_variance,
        aic,
        bic,
        log_likelihood,
    })
}

fn estimate_ar_coefficients(data: &[f64], p: usize) -> Result<Vec<f64>, String> {
    if data.len() < p + 1 {
        return Err("Insufficient data for AR coefficient estimation".to_string());
    }

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

    let variance = autocorr[0];

    if variance <= 0.0 {
        return Ok(vec![0.0; p]);
    }

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
            coeffs[0] = autocorr[1] / variance;
            coeffs[1] = (autocorr[2] - coeffs[0] * autocorr[1]) / variance;
            coeffs[2] = (autocorr[3] - coeffs[0] * autocorr[2] - coeffs[1] * autocorr[1]) / variance;
        }
        _ => return Err("AR order too high for current implementation".to_string()),
    }

    Ok(coeffs)
}

fn estimate_ma_coefficients(_data: &[f64], q: usize) -> Result<Vec<f64>, String> {
    let mut coeffs = Vec::new();
    for i in 0..q {
        coeffs.push(0.1 + (i as f64) * 0.1);
    }
    Ok(coeffs)
}

fn calculate_residual_variance(data: &[f64], ar_coeffs: &[f64], ma_coeffs: &[f64]) -> f64 {
    if data.len() < ar_coeffs.len().max(ma_coeffs.len()) + 1 {
        return calculate_variance(data);
    }

    let mut residuals = Vec::new();
    let p = ar_coeffs.len();
    let q = ma_coeffs.len();

    for i in (p.max(q))..data.len() {
        let mut predicted = 0.0;

        for j in 0..p {
            if i > j {
                predicted += ar_coeffs[j] * data[i - 1 - j];
            }
        }

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

fn predict_next_value(history: &[f64], ar_coeffs: &[f64], ma_coeffs: &[f64], residual_variance: f64) -> f64 {
    let n = history.len();
    let p = ar_coeffs.len();
    let q = ma_coeffs.len();

    let mut prediction = 0.0;

    for i in 0..p {
        if n > i {
            prediction += ar_coeffs[i] * history[n - 1 - i];
        }
    }

    for i in 0..q {
        if n > i {
            prediction += ma_coeffs[i] * 0.1;
        }
    }

    prediction += (residual_variance.sqrt() * 0.1).max(0.01);

    prediction
}

#[allow(dead_code)]
fn is_stationary(data: &[f64]) -> bool {
    if data.len() < 5 {
        return false;
    }
    
    let phi = calculate_autocorrelation(data, 1);
    phi.abs() < 0.8
}

#[allow(dead_code)]
fn make_stationary(data: &[f64]) -> Vec<f64> {
    let mut diff_data = Vec::new();
    for i in 1..data.len() {
        diff_data.push(data[i] - data[i - 1]);
    }
    diff_data
}

// ARIMA配置和模型定义
#[derive(Debug, Clone)]
pub struct ARIMAConfig {
    pub p_range: (usize, usize),  // AR阶数范围
    pub d_range: (usize, usize),  // 差分阶数范围
    pub q_range: (usize, usize),  // MA阶数范围
    pub criterion: SelectionCriterion,  // 选择准则
}

impl Default for ARIMAConfig {
    fn default() -> Self {
        ARIMAConfig {
            p_range: (0, 3),
            d_range: (0, 2),
            q_range: (0, 3),
            criterion: SelectionCriterion::AIC,
        }
    }
}

#[derive(Debug, Clone)]
pub enum SelectionCriterion {
    AIC,  // Akaike信息准则
    BIC,  // 贝叶斯信息准则
}

#[derive(Debug, Clone)]
pub struct ARIMAModel {
    pub p: usize,
    pub d: usize,
    pub q: usize,
    pub ar_coeffs: Vec<f64>,
    pub ma_coeffs: Vec<f64>,
    pub residual_variance: f64,
    pub aic: f64,
    pub bic: f64,
    pub log_likelihood: f64,
}

// 差分序列生成
fn difference_series(data: &[f64], order: usize) -> Vec<f64> {
    let mut result = data.to_vec();

    for _ in 0..order {
        let mut diff_data = Vec::new();
        for i in 1..result.len() {
            diff_data.push(result[i] - result[i - 1]);
        }
        result = diff_data;
    }

    result
}
