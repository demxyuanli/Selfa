use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use super::types::StockData;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum DecayMethod {
    Fixed,      // Fixed decay factor (current method)
    Dynamic,    // Dynamic decay based on turnover rate (kengerlwl method)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum DistributionType {
    Uniform,    // Average distribution (平均分布)
    Triangular, // Triangular distribution (三角形分布)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChipAnalysisResult {
    pub date: String,
    pub price: f64,
    pub peak_price: f64,
    pub profit_ratio: f64,
    pub lockup_ratio: f64,      // Added: Lock-up ratio
    pub concentration_90: f64,
    pub concentration_70: f64,
    pub average_cost: f64,
    pub support_price: Option<f64>,    // Added: Support level
    pub resistance_price: Option<f64>, // Added: Resistance level
    // Additional fields for detailed chip distribution visualization
    pub price_levels: Option<Vec<f64>>,  // Price levels for chip distribution
    pub chip_amounts: Option<Vec<f64>>, // Chip amounts at each price level
    pub min_price: Option<f64>,
    pub max_price: Option<f64>,
}

// Chip distribution state
struct ChipState {
    // Map price (multiplied by 100 to use integer) to mass
    chips: HashMap<i64, f64>,
    total_mass: f64,
}

impl ChipState {
    fn new() -> Self {
        ChipState {
            chips: HashMap::new(),
            total_mass: 0.0,
        }
    }

    fn update_fixed_decay(&mut self, data: &StockData, factor_precision: f64, decay_factor: f64) {
        // Fixed decay method: use constant decay factor
        // Mass = Mass * decay_factor (e.g., 0.97 means 3% decay per day)
        
        // Decay existing chips
        self.chips.retain(|_, mass| {
            *mass *= decay_factor;
            *mass > 1e-6 // Threshold
        });
        
        // Add new chips based on volume
        // Distribute volume across [low, high] using triangular distribution
        // Center: (H+L+2C)/4 (aligned with frontend)
        let low_int = (data.low * factor_precision).round() as i64;
        let high_int = (data.high * factor_precision).round() as i64;
        let avg_price = (data.high + data.low + data.close * 2.0) / 4.0;
        let avg_int = (avg_price * factor_precision).round() as i64;
        
        if low_int >= high_int {
            let price_int = (data.close * factor_precision).round() as i64;
            *self.chips.entry(price_int).or_insert(0.0) += data.volume as f64;
        } else {
            // Triangular distribution centered at average price
            let volume_per_unit = data.volume as f64 / (high_int - low_int + 1) as f64;
            for p in low_int..=high_int {
                let price = p as f64 / factor_precision;
                let weight = if p <= avg_int {
                    // Left side of triangle
                    if avg_int > low_int {
                        (price - data.low) / (avg_price - data.low)
                    } else {
                        1.0
                    }
                } else {
                    // Right side of triangle
                    if high_int > avg_int {
                        (data.high - price) / (data.high - avg_price)
                    } else {
                        1.0
                    }
                };
                *self.chips.entry(p).or_insert(0.0) += volume_per_unit * weight.max(0.0);
            }
        }
        
        self.total_mass = self.chips.values().sum();
    }
    
    fn update_dynamic_decay(&mut self, data: &StockData, factor_precision: f64, decay_coefficient: f64, dist_type: &DistributionType, avg_turnover_rate: f64) {
        // Dynamic decay method (kengerlwl): use turnover rate with decay coefficient
        // Formula: 当日成本 * (换手率 * A) + 上一日成本分布图 * (1 - 换手率 * A)
        // where A is decay_coefficient (历史换手衰减系数)
        
        // Turnover rate is in percent (e.g., 2.5 means 2.5%)
        let turnover_rate = data.turnover_rate.unwrap_or(0.0) / 100.0;
        
        // Adaptive A mechanism:
        // A = A_base * (1 + k * (turnover / avg_turnover - 1))
        // k = 0.3 (adjustable)
        let k = 0.3;
        let avg_turnover = if avg_turnover_rate > 1e-6 { avg_turnover_rate } else { 0.01 }; // Avoid div by zero
        let adaptive_decay = decay_coefficient * (1.0 + k * (turnover_rate / avg_turnover - 1.0));
        // Clamp A to reasonable range [0.5, 2.0] to avoid extreme values
        let final_decay_coefficient = adaptive_decay.max(0.5).min(2.0);

        // Calculate decay factor: (1 - turnover_rate * decay_coefficient)
        let effective_turnover = turnover_rate * final_decay_coefficient;
        // Ensure effective turnover is within [0, 1]
        let effective_turnover = effective_turnover.max(0.0).min(1.0);
        
        let remain_factor = 1.0 - effective_turnover;
        let new_chip_factor = effective_turnover;
        
        // Decay existing chips
        self.chips.retain(|_, mass| {
            *mass *= remain_factor;
            *mass > 1e-6 // Threshold
        });
        
        // Add new chips based on distribution type
        let low_int = (data.low * factor_precision).round() as i64;
        let high_int = (data.high * factor_precision).round() as i64;
        
        if low_int >= high_int {
            let price_int = (data.close * factor_precision).round() as i64;
            *self.chips.entry(price_int).or_insert(0.0) += new_chip_factor;
        } else {
            match dist_type {
                DistributionType::Uniform => {
                    // Average distribution: uniform across [low, high]
                    let range_count = high_int - low_int + 1;
                    let mass_per_unit = new_chip_factor / range_count as f64;
                    
                    for p in low_int..=high_int {
                        *self.chips.entry(p).or_insert(0.0) += mass_per_unit;
                    }
                }
                DistributionType::Triangular => {
                    // Triangular distribution: centered at (H+L+2C)/4 (aligned with frontend)
                    let avg_price = (data.high + data.low + data.close * 2.0) / 4.0;
                    let avg_int = (avg_price * factor_precision).round() as i64;
                    
                    // Improved Triangular Weight Calculation
                    // Calculate weights first, then normalize
                    let mut weights = Vec::with_capacity((high_int - low_int + 1) as usize);
                    let mut total_weight = 0.0;
                    
                    for p in low_int..=high_int {
                        let weight = if p <= avg_int {
                            // Left side
                            if avg_int > low_int {
                                (p - low_int) as f64 / (avg_int - low_int) as f64
                            } else {
                                1.0
                            }
                        } else {
                            // Right side
                            if high_int > avg_int {
                                (high_int - p) as f64 / (high_int - avg_int) as f64
                            } else {
                                1.0
                            }
                        };
                        // Use max(0.0) to be safe, though logic should prevent negative
                        let w = weight.max(0.0);
                        weights.push((p, w));
                        total_weight += w;
                    }
                    
                    if total_weight > 0.0 {
                        for (p, w) in weights {
                            let mass = new_chip_factor * (w / total_weight);
                            *self.chips.entry(p).or_insert(0.0) += mass;
                        }
                    } else {
                        // Fallback to uniform if something goes wrong
                        let mass = new_chip_factor / weights.len() as f64;
                        for (p, _) in weights {
                            *self.chips.entry(p).or_insert(0.0) += mass;
                        }
                    }
                }
            }
        }
        
        self.total_mass = self.chips.values().sum();
    }
    
    fn get_chip_distribution(&self, factor_precision: f64, bins: usize, min_price: f64, max_price: f64) -> (Vec<f64>, Vec<f64>) {
        if self.chips.is_empty() {
            return (vec![], vec![]);
        }
        
        let bin_size = (max_price - min_price) / bins as f64;
        let mut price_levels = Vec::with_capacity(bins);
        let mut chip_amounts = vec![0.0; bins];
        
        // Initialize price levels
        for i in 0..bins {
            price_levels.push(min_price + (i as f64 + 0.5) * bin_size);
        }
        
        // Distribute chips into bins
        for (&price_int, &mass) in &self.chips {
            let price = price_int as f64 / factor_precision;
            if price >= min_price && price <= max_price {
                let bin_index = ((price - min_price) / bin_size).floor() as usize;
                let bin_index = bin_index.min(bins - 1);
                chip_amounts[bin_index] += mass;
            }
        }
        
        (price_levels, chip_amounts)
    }
    
    fn calculate_metrics(&self, current_price: f64, factor_precision: f64) -> (f64, f64, f64, f64, f64, f64, Option<f64>, Option<f64>) {
        if self.chips.is_empty() {
            return (0.0, 0.0, 1.0, 0.0, 0.0, 0.0, None, None);
        }
        
        let mut sorted_chips: Vec<(f64, f64)> = self.chips.iter()
            .map(|(&p, &mass)| (p as f64 / factor_precision, mass))
            .collect();
        
        sorted_chips.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        
        // 1. Peak Price (Mode)
        let mut max_mass = -1.0;
        let mut peak_price = 0.0;
        
        for (p, mass) in &sorted_chips {
            if *mass > max_mass {
                max_mass = *mass;
                peak_price = *p;
            }
        }
        
        // Support & Resistance (Local Peaks)
        // Find peaks with significant mass (> 20% of max_mass)
        let mut peaks = Vec::new();
        let len = sorted_chips.len();
        if len >= 3 {
             for i in 1..len-1 {
                 if sorted_chips[i].1 > sorted_chips[i-1].1 && sorted_chips[i].1 > sorted_chips[i+1].1 {
                     if sorted_chips[i].1 > max_mass * 0.2 {
                        peaks.push(sorted_chips[i].0);
                     }
                 }
             }
        }
        
        // Also consider the global peak as a candidate if not caught (though it should be)
        if !peaks.contains(&peak_price) && max_mass > 0.0 {
            peaks.push(peak_price);
        }

        // Find nearest support (below current) and resistance (above current)
        let mut support = None;
        let mut resistance = None;
        let mut min_diff_sup = f64::INFINITY;
        let mut min_diff_res = f64::INFINITY;
        
        for p in peaks {
            if p < current_price {
                let diff = current_price - p;
                if diff < min_diff_sup {
                    min_diff_sup = diff;
                    support = Some(p);
                }
            } else if p > current_price {
                let diff = p - current_price;
                if diff < min_diff_res {
                    min_diff_res = diff;
                    resistance = Some(p);
                }
            }
        }
        
        // 2. Average Cost
        let mut sum_product = 0.0;
        let mut total_mass = 0.0;
        let mut profit_mass = 0.0;
        
        for (p, mass) in &sorted_chips {
            sum_product += p * mass;
            total_mass += mass;
            if *p < current_price {
                profit_mass += mass;
            }
        }
        
        let average_cost = if total_mass > 0.0 { sum_product / total_mass } else { 0.0 };
        let profit_ratio = if total_mass > 0.0 { profit_mass / total_mass } else { 0.0 };
        let lockup_ratio = 1.0 - profit_ratio;
        
        // 3. Concentration
        // 90% concentration: range containing middle 90% of chips (5% to 95%)
        // 70% concentration: range containing middle 70% of chips (15% to 85%)
        
        let mut cum_mass = 0.0;
        let target_5 = total_mass * 0.05;
        let target_15 = total_mass * 0.15;
        let target_85 = total_mass * 0.85;
        let target_95 = total_mass * 0.95;
        
        let mut p_5 = 0.0;
        let mut p_15 = 0.0;
        let mut p_85 = 0.0;
        let mut p_95 = 0.0;
        
        for (p, mass) in &sorted_chips {
            cum_mass += mass;
            if p_5 == 0.0 && cum_mass >= target_5 { p_5 = *p; }
            if p_15 == 0.0 && cum_mass >= target_15 { p_15 = *p; }
            if p_85 == 0.0 && cum_mass >= target_85 { p_85 = *p; }
            if p_95 == 0.0 && cum_mass >= target_95 { p_95 = *p; }
        }
        
        // Concentration = (range / avgCost) * 100 (aligned with frontend)
        let range_90 = p_95 - p_5;
        let range_70 = p_85 - p_15;
        let concentration_90 = if average_cost > 0.0 { range_90 / average_cost * 100.0 } else { 100.0 };
        let concentration_70 = if average_cost > 0.0 { range_70 / average_cost * 100.0 } else { 100.0 };
        
        (peak_price, profit_ratio, lockup_ratio, concentration_90, concentration_70, average_cost, support, resistance)
    }
}

pub fn calculate_chip_distribution(
    data: &[StockData],
    decay_method: DecayMethod,
    decay_factor: f64,  // For Fixed: decay factor (e.g., 0.97), For Dynamic: decay coefficient A (e.g., 1.0)
    distribution_type: DistributionType,
    include_distribution: bool, // Whether to include detailed price_levels and chip_amounts
    price_bins: usize, // Number of bins for distribution
) -> Vec<ChipAnalysisResult> {
    let mut results = Vec::new();
    let mut state = ChipState::new();
    let factor = 100.0; // Precision 0.01
    
    // Calculate price range for distribution bins
    let min_price = data.iter().map(|d| d.low).fold(f64::INFINITY, f64::min);
    let max_price = data.iter().map(|d| d.high).fold(f64::NEG_INFINITY, f64::max);
    
    // Pre-calculate average turnover rate for Dynamic decay
    let avg_turnover = if matches!(decay_method, DecayMethod::Dynamic) {
        let sum_turnover: f64 = data.iter()
            .map(|d| d.turnover_rate.unwrap_or(0.0))
            .sum();
        if !data.is_empty() { sum_turnover / data.len() as f64 / 100.0 } else { 0.0 }
    } else {
        0.0
    };
    
    // Initialize first day's distribution
    if let Some(first) = data.first() {
        match decay_method {
            DecayMethod::Fixed => {
                // Initialize with volume at first day's price range; center (H+L+2C)/4
                let low_int = (first.low * factor).round() as i64;
                let high_int = (first.high * factor).round() as i64;
                let avg_price = (first.high + first.low + first.close * 2.0) / 4.0;
                let avg_int = (avg_price * factor).round() as i64;
                
                if low_int >= high_int {
                    let price_int = (first.close * factor).round() as i64;
                    state.chips.insert(price_int, first.volume as f64);
                } else {
                    let volume_per_unit = first.volume as f64 / (high_int - low_int + 1) as f64;
                    for p in low_int..=high_int {
                        let price = p as f64 / factor;
                        let weight = if p <= avg_int {
                            if avg_int > low_int {
                                (price - first.low) / (avg_price - first.low)
                            } else {
                                1.0
                            }
                        } else {
                            if high_int > avg_int {
                                (first.high - price) / (first.high - avg_price)
                            } else {
                                1.0
                            }
                        };
                        state.chips.insert(p, volume_per_unit * weight.max(0.0));
                    }
                }
            }
            DecayMethod::Dynamic => {
                // Initialize with 100% mass at first day's (H+L+2C)/4
                let avg_price = (first.high + first.low + first.close * 2.0) / 4.0;
                let price_int = (avg_price * factor).round() as i64;
                state.chips.insert(price_int, 1.0);
            }
        }
        state.total_mass = state.chips.values().sum();
    }

    for d in data {
        match decay_method {
            DecayMethod::Fixed => {
                state.update_fixed_decay(d, factor, decay_factor);
            }
            DecayMethod::Dynamic => {
                state.update_dynamic_decay(d, factor, decay_factor, &distribution_type, avg_turnover);
            }
        }
        
        let (peak, profit, lockup, c90, c70, avg, support, resistance) = state.calculate_metrics(d.close, factor);
        
        // Get detailed chip distribution if requested
        let (price_levels, chip_amounts) = if include_distribution {
            state.get_chip_distribution(factor, price_bins, min_price, max_price)
        } else {
            (vec![], vec![])
        };
        
        results.push(ChipAnalysisResult {
            date: d.date.clone(),
            price: d.close,
            peak_price: peak,
            profit_ratio: profit,
            lockup_ratio: lockup,
            concentration_90: c90,
            concentration_70: c70,
            average_cost: avg,
            support_price: support,
            resistance_price: resistance,
            price_levels: if include_distribution && !price_levels.is_empty() { Some(price_levels) } else { None },
            chip_amounts: if include_distribution && !chip_amounts.is_empty() { Some(chip_amounts) } else { None },
            min_price: if include_distribution { Some(min_price) } else { None },
            max_price: if include_distribution { Some(max_price) } else { None },
        });
    }
    
    results
}
