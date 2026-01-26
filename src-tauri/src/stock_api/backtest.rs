use serde::{Deserialize, Serialize};
use crate::stock_api::types::StockData;
use crate::stock_api::technical_indicators::{
    calculate_sma, calculate_rsi, calculate_macd, calculate_bollinger_bands, calculate_kdj
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "params")]
pub enum StrategyType {
    MaCross { fast: usize, slow: usize },
    Rsi { period: usize, overbought: f64, oversold: f64 },
    Macd { fast: usize, slow: usize, signal: usize },
    Kdj { period: usize, k_period: usize, d_period: usize, overbought: f64, oversold: f64 },
    Bollinger { period: usize, multiplier: f64 },
    Turtle { entry_period: usize, exit_period: usize },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestConfig {
    pub initial_capital: f64,
    pub commission_rate: f64,
    pub strategy: StrategyType,
    pub stop_loss_pct: Option<f64>,
    pub take_profit_pct: Option<f64>,
    pub position_size_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trade {
    pub date: String,
    pub price: f64,
    pub quantity: f64,
    pub type_: String, // "buy" or "sell"
    pub profit: Option<f64>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquityPoint {
    pub date: String,
    pub equity: f64,
    pub drawdown_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestResult {
    pub total_return: f64,
    pub total_return_pct: f64,
    pub max_drawdown: f64,
    pub max_drawdown_pct: f64,
    pub win_rate: f64,
    pub profit_factor: f64,
    pub sharpe_ratio: f64,
    pub sortino_ratio: f64,
    pub total_trades: usize,
    pub winning_trades: usize,
    pub losing_trades: usize,
    pub trades: Vec<Trade>,
    pub equity_curve: Vec<EquityPoint>,
    pub next_signal: Option<String>, // "buy", "sell", or "hold"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationResult {
    pub params: String,
    pub total_return_pct: f64,
    pub max_drawdown_pct: f64,
    pub win_rate: f64,
    pub sharpe_ratio: f64,
}

pub fn run_backtest(data: &[StockData], config: BacktestConfig) -> Result<BacktestResult, String> {
    if data.len() < 50 {
        return Err("Insufficient data for backtest (minimum 50 points)".to_string());
    }

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let dates: Vec<String> = data.iter().map(|d| d.date.clone()).collect();
    
    let mut cash = config.initial_capital;
    let mut holdings = 0.0;
    let mut trades: Vec<Trade> = Vec::new();
    let mut equity_curve: Vec<EquityPoint> = Vec::new();
    
    // Strategy signals: 1 = buy, -1 = sell, 0 = hold
    let signals = generate_signals(data, &closes, &config.strategy);
    
    let mut entry_price = 0.0;
    let mut peak_equity = config.initial_capital;
    let mut max_drawdown = 0.0;
    let mut max_drawdown_pct = 0.0;

    for i in 0..data.len() {
        let price = closes[i];
        let date = &dates[i];
        let signal = signals[i];
        
        let mut action = "hold";
        let mut reason = "";

        // Check Stop Loss / Take Profit first if holding
        if holdings > 0.0 {
            let pnl_pct = (price - entry_price) / entry_price * 100.0;
            
            if let Some(sl) = config.stop_loss_pct {
                if pnl_pct <= -sl {
                    action = "sell";
                    reason = "stop_loss";
                }
            }
            
            if let Some(tp) = config.take_profit_pct {
                if pnl_pct >= tp {
                    action = "sell";
                    reason = "take_profit";
                }
            }
        }

        // Strategy signal overrides if no SL/TP trigger or if looking to enter
        if action == "hold" {
            if signal == 1 && holdings == 0.0 {
                action = "buy";
                reason = "strategy_signal";
            } else if signal == -1 && holdings > 0.0 {
                action = "sell";
                reason = "strategy_signal";
            }
        }

        // Execute Trade
        if action == "buy" && cash > 0.0 {
            // Calculate max affordable amount considering commission: amount * (1 + rate) <= cash
            // amount <= cash / (1 + rate)
            let max_afford_amount = cash / (1.0 + config.commission_rate);
            let target_amount = cash * (config.position_size_pct / 100.0);
            
            // Take the smaller of target and affordable to ensure we can pay commission
            let invest_amount = target_amount.min(max_afford_amount);
            
            if invest_amount > 0.0 {
                let quantity = invest_amount / price;
                let cost = quantity * price * (1.0 + config.commission_rate);
                
                // Allow for small floating point errors
                if cost <= cash * 1.000001 {
                    // Update cash, ensuring it doesn't go below zero due to float precision
                    cash = (cash - cost).max(0.0);
                    holdings += quantity;
                    entry_price = price;
                    
                    trades.push(Trade {
                        date: date.clone(),
                        price,
                        quantity,
                        type_: "buy".to_string(),
                        profit: None,
                        reason: reason.to_string(),
                    });
                }
            }
        } else if action == "sell" && holdings > 0.0 {
            let revenue = holdings * price * (1.0 - config.commission_rate);
            let buy_cost = holdings * entry_price; // Approximate cost basis
            let profit = revenue - buy_cost; // Simplified profit calc
            
            cash += revenue;
            
            trades.push(Trade {
                date: date.clone(),
                price,
                quantity: holdings,
                type_: "sell".to_string(),
                profit: Some(profit),
                reason: reason.to_string(),
            });
            
            holdings = 0.0;
            entry_price = 0.0;
        }

        // Update Equity
        let current_equity = cash + (holdings * price);
        
        if current_equity > peak_equity {
            peak_equity = current_equity;
        }
        
        let drawdown = peak_equity - current_equity;
        let drawdown_pct = if peak_equity > 0.0 { (drawdown / peak_equity) * 100.0 } else { 0.0 };
        
        if drawdown > max_drawdown {
            max_drawdown = drawdown;
        }
        if drawdown_pct > max_drawdown_pct {
            max_drawdown_pct = drawdown_pct;
        }

        equity_curve.push(EquityPoint {
            date: date.clone(),
            equity: current_equity,
            drawdown_pct,
        });
    }

    // Calculate Metrics
    let final_equity = equity_curve.last().map(|p| p.equity).unwrap_or(config.initial_capital);
    let total_return = final_equity - config.initial_capital;
    let total_return_pct = (total_return / config.initial_capital) * 100.0;
    
    let winning_trades = trades.iter().filter(|t| t.type_ == "sell" && t.profit.unwrap_or(0.0) > 0.0).count();
    let losing_trades = trades.iter().filter(|t| t.type_ == "sell" && t.profit.unwrap_or(0.0) <= 0.0).count();
    let total_sell_trades = winning_trades + losing_trades;
    let win_rate = if total_sell_trades > 0 { winning_trades as f64 / total_sell_trades as f64 * 100.0 } else { 0.0 };
    
    let gross_profit: f64 = trades.iter().filter(|t| t.type_ == "sell").map(|t| t.profit.unwrap_or(0.0).max(0.0)).sum();
    let gross_loss: f64 = trades.iter().filter(|t| t.type_ == "sell").map(|t| t.profit.unwrap_or(0.0).min(0.0).abs()).sum();
    let profit_factor = if gross_loss > 0.0 { gross_profit / gross_loss } else { if gross_profit > 0.0 { f64::INFINITY } else { 0.0 } };

    // Calculate Sharpe Ratio (Daily returns)
    let daily_returns: Vec<f64> = equity_curve.windows(2).map(|w| {
        (w[1].equity - w[0].equity) / w[0].equity
    }).collect();
    
    let sharpe_ratio = calculate_sharpe_ratio(&daily_returns);
    let sortino_ratio = calculate_sortino_ratio(&daily_returns);

    // Determine next signal (based on the last calculated signal)
    let next_signal = if let Some(&last_sig) = signals.last() {
        if last_sig == 1 { Some("buy".to_string()) }
        else if last_sig == -1 { Some("sell".to_string()) }
        else { Some("hold".to_string()) }
    } else {
        None
    };

    Ok(BacktestResult {
        total_return,
        total_return_pct,
        max_drawdown,
        max_drawdown_pct,
        win_rate,
        profit_factor,
        sharpe_ratio,
        sortino_ratio,
        total_trades: total_sell_trades,
        winning_trades,
        losing_trades,
        trades,
        equity_curve,
        next_signal,
    })
}

pub fn run_optimization(data: &[StockData], config: BacktestConfig) -> Result<Vec<OptimizationResult>, String> {
    if data.len() < 50 {
        return Err("Insufficient data for optimization (minimum 50 points)".to_string());
    }
    let base = &config;
    let mut results: Vec<OptimizationResult> = Vec::new();

    let build_cfg = |strategy: StrategyType| BacktestConfig {
        initial_capital: base.initial_capital,
        commission_rate: base.commission_rate,
        strategy,
        stop_loss_pct: base.stop_loss_pct,
        take_profit_pct: base.take_profit_pct,
        position_size_pct: base.position_size_pct,
    };

    match &config.strategy {
        StrategyType::MaCross { .. } => {
            for fast in [5, 10, 15] {
                for slow in [20, 30, 40] {
                    if slow <= fast { continue; }
                    let cfg = build_cfg(StrategyType::MaCross { fast, slow });
                    if let Ok(r) = run_backtest(data, cfg) {
                        results.push(OptimizationResult {
                            params: format!("MaCross fast={} slow={}", fast, slow),
                            total_return_pct: r.total_return_pct,
                            max_drawdown_pct: r.max_drawdown_pct,
                            win_rate: r.win_rate,
                            sharpe_ratio: r.sharpe_ratio,
                        });
                    }
                }
            }
        }
        StrategyType::Rsi { .. } => {
            for period in [10, 14, 20] {
                for overbought in [70.0, 75.0, 80.0] {
                    for oversold in [20.0, 25.0, 30.0] {
                        if oversold >= overbought { continue; }
                        let cfg = build_cfg(StrategyType::Rsi { period, overbought, oversold });
                        if let Ok(r) = run_backtest(data, cfg) {
                            results.push(OptimizationResult {
                                params: format!("Rsi period={} ob={} os={}", period, overbought as i32, oversold as i32),
                                total_return_pct: r.total_return_pct,
                                max_drawdown_pct: r.max_drawdown_pct,
                                win_rate: r.win_rate,
                                sharpe_ratio: r.sharpe_ratio,
                            });
                        }
                    }
                }
            }
        }
        StrategyType::Macd { .. } => {
            for fast in [8, 12] {
                for slow in [20, 26] {
                    for signal in [7, 9] {
                        if slow <= fast { continue; }
                        let cfg = build_cfg(StrategyType::Macd { fast, slow, signal });
                        if let Ok(r) = run_backtest(data, cfg) {
                            results.push(OptimizationResult {
                                params: format!("Macd fast={} slow={} signal={}", fast, slow, signal),
                                total_return_pct: r.total_return_pct,
                                max_drawdown_pct: r.max_drawdown_pct,
                                win_rate: r.win_rate,
                                sharpe_ratio: r.sharpe_ratio,
                            });
                        }
                    }
                }
            }
        }
        StrategyType::Kdj { .. } => {
            for period in [7, 9, 14] {
                let (k_period, d_period, overbought, oversold) = (3, 3, 80.0, 20.0);
                let cfg = build_cfg(StrategyType::Kdj { period, k_period, d_period, overbought, oversold });
                if let Ok(r) = run_backtest(data, cfg) {
                    results.push(OptimizationResult {
                        params: format!("Kdj period={}", period),
                        total_return_pct: r.total_return_pct,
                        max_drawdown_pct: r.max_drawdown_pct,
                        win_rate: r.win_rate,
                        sharpe_ratio: r.sharpe_ratio,
                    });
                }
            }
        }
        StrategyType::Bollinger { .. } => {
            for period in [15, 20, 25] {
                for multiplier in [1.5, 2.0, 2.5] {
                    let cfg = build_cfg(StrategyType::Bollinger { period, multiplier });
                    if let Ok(r) = run_backtest(data, cfg) {
                        results.push(OptimizationResult {
                            params: format!("Bollinger period={} mult={}", period, multiplier),
                            total_return_pct: r.total_return_pct,
                            max_drawdown_pct: r.max_drawdown_pct,
                            win_rate: r.win_rate,
                            sharpe_ratio: r.sharpe_ratio,
                        });
                    }
                }
            }
        }
        StrategyType::Turtle { .. } => {
            for entry_period in [15, 20, 25] {
                for exit_period in [8, 10, 12] {
                    if exit_period >= entry_period { continue; }
                    let cfg = build_cfg(StrategyType::Turtle { entry_period, exit_period });
                    if let Ok(r) = run_backtest(data, cfg) {
                        results.push(OptimizationResult {
                            params: format!("Turtle entry={} exit={}", entry_period, exit_period),
                            total_return_pct: r.total_return_pct,
                            max_drawdown_pct: r.max_drawdown_pct,
                            win_rate: r.win_rate,
                            sharpe_ratio: r.sharpe_ratio,
                        });
                    }
                }
            }
        }
    }

    results.sort_by(|a, b| b.sharpe_ratio.partial_cmp(&a.sharpe_ratio).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(20);
    Ok(results)
}

fn generate_signals(data: &[StockData], closes: &[f64], strategy: &StrategyType) -> Vec<i32> {
    let mut signals = vec![0; data.len()];
    
    match strategy {
        StrategyType::MaCross { fast, slow } => {
            let ma_fast = calculate_sma(closes, *fast);
            let ma_slow = calculate_sma(closes, *slow);
            
            for i in *slow..data.len() {
                if ma_fast[i] > ma_slow[i] && ma_fast[i-1] <= ma_slow[i-1] {
                    signals[i] = 1; // Buy
                } else if ma_fast[i] < ma_slow[i] && ma_fast[i-1] >= ma_slow[i-1] {
                    signals[i] = -1; // Sell
                }
            }
        },
        StrategyType::Rsi { period, overbought, oversold } => {
            let rsi = calculate_rsi(closes, *period);
            for i in (*period + 1)..data.len() {
                if rsi[i] > *oversold && rsi[i - 1] <= *oversold {
                    signals[i] = 1;
                } else if rsi[i] < *overbought && rsi[i - 1] >= *overbought {
                    signals[i] = -1;
                } else if rsi[i] < *oversold && rsi[i - 1] >= *oversold {
                    signals[i] = -1;
                }
            }
        },
        StrategyType::Macd { fast, slow, signal } => {
            let macd_res = calculate_macd(closes, *fast, *slow, *signal);
            
            for i in *slow..data.len() {
                // Golden cross
                if macd_res.macd[i] > macd_res.signal[i] && macd_res.macd[i-1] <= macd_res.signal[i-1] {
                    signals[i] = 1;
                }
                // Death cross
                else if macd_res.macd[i] < macd_res.signal[i] && macd_res.macd[i-1] >= macd_res.signal[i-1] {
                    signals[i] = -1;
                }
            }
        },
        StrategyType::Kdj { period, k_period, d_period, overbought, oversold } => {
             let kdj = calculate_kdj(data, *period, *k_period, *d_period);
             for i in *period..data.len() {
                // Golden cross (K crosses D upwards) in oversold zone
                if kdj.k[i] > kdj.d[i] && kdj.k[i-1] <= kdj.d[i-1] && kdj.k[i] < *oversold {
                    signals[i] = 1;
                }
                // Death cross (K crosses D downwards) in overbought zone
                else if kdj.k[i] < kdj.d[i] && kdj.k[i-1] >= kdj.d[i-1] && kdj.k[i] > *overbought {
                    signals[i] = -1;
                }
             }
        },
        StrategyType::Bollinger { period, multiplier } => {
            let bb = calculate_bollinger_bands(closes, *period, *multiplier);
            
            for i in *period..data.len() {
                // Mean reversion: Buy when price crosses above lower band (recovering)
                // Or Trend following: Buy when price breaks upper band?
                // Let's implement Mean Reversion for BB usually
                
                // Buy: Price closes above lower band after being below it
                if closes[i] > bb.lower[i] && closes[i-1] <= bb.lower[i-1] {
                     signals[i] = 1;
                }
                // Sell: Price closes below upper band after being above it
                else if closes[i] < bb.upper[i] && closes[i-1] >= bb.upper[i-1] {
                    signals[i] = -1;
                }
            }
        },
        StrategyType::Turtle { entry_period, exit_period } => {
            // Donchian Channels logic
            // Buy when price > Max(High, entry_period) of previous days
            // Sell when price < Min(Low, exit_period) of previous days
            
            // We need High and Low prices
            let highs: Vec<f64> = data.iter().map(|d| d.high).collect();
            let lows: Vec<f64> = data.iter().map(|d| d.low).collect();
            
            let start_idx = (*entry_period).max(*exit_period);
            
            for i in start_idx..data.len() {
                // Calculate Max High of previous N days (excluding today)
                let max_high = highs[i-*entry_period..i].iter().fold(f64::MIN, |a: f64, &b| a.max(b));
                
                // Calculate Min Low of previous M days (excluding today)
                let min_low = lows[i-*exit_period..i].iter().fold(f64::MAX, |a: f64, &b| a.min(b));
                
                if closes[i] > max_high {
                    signals[i] = 1; // Buy breakout
                } else if closes[i] < min_low {
                    signals[i] = -1; // Sell breakdown
                }
            }
        }
    }
    
    signals
}

fn calculate_sharpe_ratio(returns: &[f64]) -> f64 {
    if returns.is_empty() { return 0.0; }
    let mean = returns.iter().sum::<f64>() / returns.len() as f64;
    let variance = returns.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / returns.len() as f64;
    let std_dev = variance.sqrt();
    
    if std_dev == 0.0 { return 0.0; }
    // Annualize (assuming daily returns, 252 trading days)
    (mean / std_dev) * (252.0f64).sqrt()
}

fn calculate_sortino_ratio(returns: &[f64]) -> f64 {
    if returns.is_empty() { return 0.0; }
    let mean = returns.iter().sum::<f64>() / returns.len() as f64;
    
    // Downside deviation (only negative returns)
    let negative_returns: Vec<f64> = returns.iter().filter(|&&x| x < 0.0).cloned().collect();
    let downside_variance = negative_returns.iter().map(|&x| x.powi(2)).sum::<f64>() / returns.len() as f64;
    let downside_std_dev = downside_variance.sqrt();
    
    if downside_std_dev == 0.0 { return 0.0; }
    (mean / downside_std_dev) * (252.0f64).sqrt()
}
