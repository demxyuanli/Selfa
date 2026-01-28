#![allow(dead_code)]

use crate::stock_api::types::{StockData, PredictionResult};
use crate::stock_api::utils::{parse_date, add_days};
use rand::prelude::*;
use rayon::prelude::*;

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

    let volatility = if config.use_garch {
        calculate_garch_volatility(&returns, config.garch_alpha, config.garch_beta)
    } else {
        calculate_historical_volatility(&returns)
    };

    let simulation_results = run_monte_carlo_simulations(
        closes.last().unwrap(),
        &returns,
        volatility,
        config.simulations,
        period,
    );

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
        return 0.02;
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

    let mut sigma_squared = returns[0].powi(2);

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
    let mean_return = if returns.is_empty() {
        0.0
    } else {
        returns.iter().sum::<f64>() / returns.len() as f64
    };

    let variance = if returns.len() > 1 {
        returns.iter()
            .map(|&r| (r - mean_return).powi(2))
            .sum::<f64>() / (returns.len() - 1) as f64
    } else {
        0.0
    };
    let drift = mean_return - 0.5 * variance;

    // Parallelize Monte Carlo simulations using rayon
    (0..num_simulations).into_par_iter().map(|_| {
        let mut rng = thread_rng();
        let mut price_path = vec![*start_price];
        let mut current_price = *start_price;

        for _ in 0..period {
            let u1: f64 = rng.gen();
            let u2: f64 = rng.gen();
            let z = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();

            let shock = if rng.gen::<f64>() < 0.05 {
                z * 3.0
            } else {
                z
            };

            let change = drift + volatility * shock;
            current_price = current_price * change.exp();
            price_path.push(current_price);
        }

        price_path
    }).collect()
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

        let lower_idx = ((1.0 - confidence_level) / 2.0 * day_prices.len() as f64) as usize;
        let upper_idx = ((1.0 + confidence_level) / 2.0 * day_prices.len() as f64) as usize;

        let lower_bound = *day_prices.get(lower_idx).unwrap_or(&day_prices[0]);
        let last_idx = day_prices.len() - 1;
        let upper_bound = *day_prices.get(upper_idx.min(last_idx))
            .unwrap_or(&day_prices[last_idx]);

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
            reasoning: None,
        });
    }

    Ok(results)
}

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
