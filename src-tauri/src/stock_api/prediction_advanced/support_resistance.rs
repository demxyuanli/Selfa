use crate::stock_api::types::{StockData, PredictionResult};
use crate::stock_api::utils::{parse_date, add_days, calculate_variance, determine_signal, detect_swing_high, detect_swing_low, detect_swing_high_with_volume, detect_swing_low_with_volume};

#[derive(Debug, Clone)]
pub struct SupportResistanceLevel {
    pub price: f64,
    pub strength: f64,      // 强度评分
    pub touch_count: usize, // 触及次数
    pub volume_weight: f64, // 成交量权重
    pub is_support: bool,   // true为支撑，false为阻力
}

pub fn calculate_support_resistance_levels(
    data: &[StockData],
    lookback: usize,
) -> Vec<SupportResistanceLevel> {
    if data.len() < 20 {
        return Vec::new();
    }

    let lookback = lookback.min(data.len());
    let recent_data = &data[data.len().saturating_sub(lookback)..];

    let highs: Vec<f64> = recent_data.iter().map(|d| d.high).collect();
    let lows: Vec<f64> = recent_data.iter().map(|d| d.low).collect();
    let volumes: Vec<i64> = recent_data.iter().map(|d| d.volume).collect();
    let closes: Vec<f64> = recent_data.iter().map(|d| d.close).collect();

    let mut levels = Vec::new();
    let avg_volume = volumes.iter().sum::<i64>() as f64 / volumes.len() as f64;

    // 检测阻力位（swing highs）
    if let Some((high_idx, high_val)) = detect_swing_high_with_volume(&highs, &volumes, 5) {
        let touch_count = count_touches(&closes, high_val, 0.005);
        let volume_weight = calculate_volume_weight(&volumes, high_idx, avg_volume);
        let strength = calculate_level_strength(touch_count, volume_weight, lookback);

        levels.push(SupportResistanceLevel {
            price: high_val,
            strength,
            touch_count,
            volume_weight,
            is_support: false,
        });
    }

    // 检测支撑位（swing lows）
    if let Some((low_idx, low_val)) = detect_swing_low_with_volume(&lows, &volumes, 5) {
        let touch_count = count_touches(&closes, low_val, 0.005);
        let volume_weight = calculate_volume_weight(&volumes, low_idx, avg_volume);
        let strength = calculate_level_strength(touch_count, volume_weight, lookback);

        levels.push(SupportResistanceLevel {
            price: low_val,
            strength,
            touch_count,
            volume_weight,
            is_support: true,
        });
    }

    // 寻找额外的支撑阻力位
    let additional_levels = find_additional_levels(&closes, &volumes, avg_volume);
    levels.extend(additional_levels);

    // 按强度排序
    levels.sort_by(|a, b| b.strength.partial_cmp(&a.strength).unwrap());
    levels.truncate(10); // 只保留前10个最强的水平

    levels
}

fn count_touches(prices: &[f64], level: f64, tolerance: f64) -> usize {
    let tolerance_amount = level * tolerance;
    prices.iter()
        .filter(|&&price| (price - level).abs() <= tolerance_amount)
        .count()
}

fn calculate_volume_weight(volumes: &[i64], level_idx: usize, avg_volume: f64) -> f64 {
    if level_idx >= volumes.len() {
        return 1.0;
    }

    let level_volume = volumes[level_idx] as f64;
    if avg_volume > 0.0 {
        (level_volume / avg_volume).min(3.0) // 限制最大权重为3倍
    } else {
        1.0
    }
}

fn calculate_level_strength(touch_count: usize, volume_weight: f64, lookback: usize) -> f64 {
    let touch_score = touch_count as f64 / (lookback as f64 / 10.0).max(1.0);
    let volume_score = volume_weight.min(2.0);

    (touch_score * volume_score).min(10.0) // 限制最大强度为10
}

fn find_additional_levels(closes: &[f64], volumes: &[i64], avg_volume: f64) -> Vec<SupportResistanceLevel> {
    let mut levels = Vec::new();

    // 使用聚类方法寻找价格密集区
    let price_clusters = find_price_clusters(closes, 0.01); // 1%的价格容差

    for cluster in price_clusters {
        let center_price = cluster.center;
        let touch_count = cluster.points.len();
        let avg_volume_in_cluster = cluster.volumes.iter().sum::<f64>() / cluster.volumes.len() as f64;
        let volume_weight = if avg_volume > 0.0 {
            (avg_volume_in_cluster / avg_volume).min(2.0)
        } else {
            1.0
        };

        let strength = calculate_level_strength(touch_count, volume_weight, closes.len());

        // 确定是支撑还是阻力
        let is_support = cluster.points.iter().all(|&price| price <= center_price * 1.005);

        levels.push(SupportResistanceLevel {
            price: center_price,
            strength,
            touch_count,
            volume_weight,
            is_support,
        });
    }

    levels
}

#[derive(Debug)]
struct PriceCluster {
    center: f64,
    points: Vec<f64>,
    volumes: Vec<f64>,
}

fn find_price_clusters(prices: &[f64], tolerance: f64) -> Vec<PriceCluster> {
    let mut clusters = Vec::new();
    let mut used_indices = vec![false; prices.len()];

    for i in 0..prices.len() {
        if used_indices[i] {
            continue;
        }

        let mut cluster_points = Vec::new();
        let mut cluster_volumes: Vec<i64> = Vec::new();
        let center_price = prices[i];

        // 寻找在容差范围内的所有价格点
        for j in 0..prices.len() {
            if !used_indices[j] && (prices[j] - center_price).abs() / center_price <= tolerance {
                cluster_points.push(prices[j]);
                used_indices[j] = true;
            }
        }

        if cluster_points.len() >= 3 { // 至少需要3个点形成有效聚类
            let cluster_len = cluster_points.len();
            clusters.push(PriceCluster {
                center: cluster_points.iter().sum::<f64>() / cluster_len as f64,
                points: cluster_points,
                volumes: vec![1.0; cluster_len], // 简化处理，实际应该使用真实的成交量
            });
        }
    }

    clusters
}

pub fn predict_support_resistance(
    data: &[StockData],
    start_date: &str,
    period: usize,
) -> Result<Vec<PredictionResult>, String> {
    if data.len() < 30 {
        return Err("Need at least 30 data points for support/resistance prediction".to_string());
    }

    let levels = calculate_support_resistance_levels(data, 60);
    if levels.is_empty() {
        return Err("No significant support/resistance levels found".to_string());
    }

    let closes: Vec<f64> = data.iter().map(|d| d.close).collect();
    let last_price = *closes.last().unwrap();

    // 找到最近的支撑和阻力位
    let nearest_support = levels.iter()
        .filter(|l| l.is_support && l.price < last_price)
        .max_by(|a, b| a.price.partial_cmp(&b.price).unwrap());

    let nearest_resistance = levels.iter()
        .filter(|l| !l.is_support && l.price > last_price)
        .min_by(|a, b| a.price.partial_cmp(&b.price).unwrap());

    let mut results = Vec::new();
    let base_date = parse_date(start_date)?;
    let variance = calculate_variance(&closes);
    let std_dev = variance.sqrt();

    for i in 1..=period {
        let progress_ratio = i as f64 / period as f64;

        // 基于支撑阻力的预测逻辑
        let predicted = if let (Some(support), Some(resistance)) = (nearest_support, nearest_resistance) {
            // 在支撑和阻力之间震荡
            let range = resistance.price - support.price;
            let position = (last_price - support.price) / range;

            if position < 0.3 {
                // 接近支撑，倾向反弹
                last_price + (range * 0.2 * (1.0 - progress_ratio))
            } else if position > 0.7 {
                // 接近阻力，倾向回落
                last_price - (range * 0.2 * (1.0 - progress_ratio))
            } else {
                // 中间区域，保持趋势
                last_price + (resistance.price - last_price) * 0.1 * progress_ratio
            }
        } else if let Some(support) = nearest_support {
            // 只有支撑，倾向上涨
            last_price + (last_price - support.price) * 0.5 * progress_ratio
        } else if let Some(resistance) = nearest_resistance {
            // 只有阻力，倾向下跌
            last_price - (resistance.price - last_price) * 0.5 * progress_ratio
        } else {
            // 没有明显水平，保持当前价格
            last_price
        };

        // 基于水平强度计算置信度
        let max_strength = levels.iter().map(|l| l.strength).fold(0.0, f64::max);
        let confidence = (60.0 + max_strength * 5.0).min(85.0);

        let signal = determine_signal(predicted, last_price, 0.0);

        let date = add_days(&base_date, i as i32)?;
        results.push(PredictionResult {
            date,
            predicted_price: predicted,
            confidence,
            signal,
            upper_bound: predicted + std_dev * 0.8,
            lower_bound: predicted - std_dev * 0.8,
            method: "support_resistance".to_string(),
        });
    }

    Ok(results)
}