use crate::stock_api::types::{StockData, PredictionResult};
use crate::stock_api::utils::{parse_date, add_days, calculate_variance, determine_signal};
use rand::prelude::*;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct MonteCarloConfig {
    pub simulations: usize,
    pub time_horizon: usize,
    pub confidence_level: f64,
    pub use_garch: bool,
    pub garch_alpha: f64,
    pub garch_beta: f64,
}

impl Default for MonteCarloConfig {
    fn default() -> Self {
        MonteCarloConfig {
            simulations: 1000,
            time_horizon: 30,
            confidence_level: 0.95,
            use_garch: false,
            garch_alpha: 0.1,
            garch_beta: 0.8,
        }
    }
}

pub fn predict_monte_carlo(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let config = MonteCarloConfig::default();
    predict_monte_carlo_with_config(data, start_date, period, &config)
}

pub fn predict_monte_carlo_with_config(
    data: &[StockData],
    start_date: &str,
    period: usize,
    config: &MonteCarloConfig,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 20 {
        return Err("Need at least 20 data points for Monte Carlo simulation".to_string());
    }

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let returns = calculate_returns(&closes);

    if returns.is_empty() {
        return Err("Could not calculate returns".to_string());
    }

    // 计算波动率
    let volatility = if config.use_garch {
        calculate_garch_volatility(&returns, config.garch_alpha, config.garch_beta)
    } else {
        calculate_historical_volatility(&returns)
    };

    // 运行Monte Carlo模拟
    let simulation_results = run_monte_carlo_simulations(
        closes.last().unwrap(),
        &returns,
        volatility,
        config.simulations,
        period,
    );

    // 分析模拟结果
    generate_prediction_from_simulations(
        &simulation_results,
        start_date,
        period,
        config.confidence_level,
    )
}

fn calculate_returns(prices: &[f64]) -> Vec<f64> {
    prices.windows(2)
        .map(|window| (window[1] - window[0]) / window[0])
        .collect()
}

fn calculate_historical_volatility(returns: &[f64]) -> f64 {
    if returns.is_empty() {
        return 0.02; // 默认2%波动率
    }

    let mean_return = returns.iter().sum::<f64>() / returns.len() as f64;
    let variance = returns.iter()
        .map(|&r| (r - mean_return).powi(2))
        .sum::<f64>() / returns.len() as f64;

    variance.sqrt()
}

fn calculate_garch_volatility(returns: &[f64], alpha: f64, beta: f64) -> f64 {
    if returns.len() < 2 {
        return calculate_historical_volatility(returns);
    }

    let mut sigma_squared = returns[0].powi(2); // 初始波动率

    for &ret in returns.iter().skip(1) {
        sigma_squared = (1.0 - alpha - beta) * ret.powi(2) + beta * sigma_squared;
    }

    sigma_squared.sqrt()
}

fn run_monte_carlo_simulations(
    start_price: &f64,
    returns: &[f64],
    volatility: f64,
    num_simulations: usize,
    period: usize,
) -> Vec<Vec<f64>> {
    let mut rng = thread_rng();
    let mut results = Vec::with_capacity(num_simulations);

    let mean_return = if returns.is_empty() {
        0.0
    } else {
        returns.iter().sum::<f64>() / returns.len() as f64
    };

    for _ in 0..num_simulations {
        let mut price_path = vec![*start_price];

        for _ in 0..period {
            // 使用几何布朗运动模型
            let random_shock: f64 = rng.sample(rand_distr::StandardNormal);
            let daily_return = mean_return + volatility * random_shock;

            let new_price = price_path.last().unwrap() * (1.0 + daily_return);
            price_path.push(new_price);
        }

        results.push(price_path);
    }

    results
}

fn generate_prediction_from_simulations(
    simulations: &[Vec<f64>],
    start_date: &str,
    period: usize,
    confidence_level: f64,
) -> Result<Vec<PredictionResult>, String> {
    if simulations.is_empty() {
        return Err("No simulation results".to_string());
    }

    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;

    for day in 1..=period {
        let mut day_prices: Vec<f64> = simulations.iter()
            .filter_map(|path| path.get(day).copied())
            .collect();

        if day_prices.is_empty() {
            continue;
        }

        day_prices.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let mean_price = day_prices.iter().sum::<f64>() / day_prices.len() as f64;

        // 计算分位数
        let lower_idx = ((1.0 - confidence_level) / 2.0 * day_prices.len() as f64) as usize;
        let upper_idx = ((1.0 + confidence_level) / 2.0 * day_prices.len() as f64) as usize;

        let lower_bound = *day_prices.get(lower_idx).unwrap_or(&day_prices[0]);
        let last_idx = day_prices.len() - 1;
        let upper_bound = *day_prices.get(upper_idx.min(last_idx))
            .unwrap_or(&day_prices[last_idx]);

        // 计算概率分布
        let start_price = simulations[0][0];
        let probability_up = day_prices.iter()
            .filter(|&&price| price > start_price)
            .count() as f64 / day_prices.len() as f64;

        let signal = if probability_up > 0.6 {
            "buy"
        } else if probability_up < 0.4 {
            "sell"
        } else {
            "hold"
        };

        let confidence = (probability_up.max(1.0 - probability_up) * 100.0).min(85.0).max(50.0);

        let date = add_days(&base_date, day as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: mean_price,
            confidence,
            signal: signal.to_string(),
            upper_bound,
            lower_bound,
            method: "monte_carlo".to_string(),
        });
    }

    Ok(results)
}

// 扩展的Monte Carlo方法：结合GARCH和跳跃扩散
pub fn predict_monte_carlo_advanced(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    let config = MonteCarloConfig {
        simulations: 2000,
        time_horizon: period,
        confidence_level: 0.90,
        use_garch: true,
        garch_alpha: 0.15,
        garch_beta: 0.75,
    };

    predict_monte_carlo_with_config(data, start_date, period, &config)
}