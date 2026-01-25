// Chip Distribution (Cost Distribution) Calculation

import { StockData } from "./technicalIndicators";

export type ChipMorphology =
  | "low_single_dense"
  | "bottom_converging"
  | "high_single_dense"
  | "multi_peak"
  | "scattered";

export interface ChipMetricsDetail {
  profitRatio: number;
  trappedRatio: number;
  avgCost: number;
  concentration90: number;
  concentration70: number;
  range90Low: number;
  range90High: number;
  avgCostProfit: number | null;
  avgCostTrapped: number | null;
  chipDeviation: number;
  supportLevel: number | null;
  resistanceLevel: number | null;
  morphology: ChipMorphology;
  chipInterpretation: string;
  peakCount: number;
  position: "low" | "middle" | "high";
  mainPeaks: Array<{ price: number; amount: number }>;
  prediction?: ChipPrediction;
}

export interface ChipPrediction {
  score: number; // -100 to 100 (Bearish to Bullish)
  signal: "buy" | "sell" | "hold" | "strong_buy" | "strong_sell";
  confidence: number; // 0 to 100
  reasoning: string[];
  targetPrice?: number;
  stopLossPrice?: number;
}

export interface ChipDistributionResult {
  priceLevels: number[];
  chipAmounts: number[];
  avgCost: number;
  profitRatio: number;
  trappedRatio: number;
  concentration: number;
  concentration90: number;
  concentration70: number;
  range90Low: number;
  range90High: number;
  avgCostProfit: number | null;
  avgCostTrapped: number | null;
  chipDeviation: number;
  supportLevel: number | null;
  resistanceLevel: number | null;
  morphology: ChipMorphology;
  chipInterpretation: string;
  prediction: ChipPrediction;
  mainPeaks: Array<{ price: number; amount: number }>;
  peakCount: number;
  isSinglePeak: boolean;
  isMultiPeak: boolean;
  position: "low" | "middle" | "high";
  peakPattern: "singleDense" | "multiPeak" | "scattered";
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  dailyDistributions?: Array<{
    date: string;
    chipAmounts: number[];
    avgCost: number;
  }>;
}

function calculateChipPrediction(
  metrics: ChipMetricsDetail,
  currentPrice: number,
  t?: (key: string) => string
): ChipPrediction {
  let score = 0;
  let confidence = 50;
  const reasoning: string[] = [];
  const { 
    morphology, 
    profitRatio, 
    trappedRatio, 
    concentration90, 
    avgCost, 
    supportLevel, 
    resistanceLevel,
    position
  } = metrics;

  // Default translation function if not provided
  const translate = t || ((key: string) => {
    const defaultTranslations: Record<string, string> = {
      "chipPredictionReasoning.lowSingleDense": "Low single peak dense: Classic bottom accumulation signal.",
      "chipPredictionReasoning.highSingleDenseHighProfit": "High single peak with high profit: Risk of distribution/dump.",
      "chipPredictionReasoning.highSingleDense": "High single peak: Trend continuation possible but risky.",
      "chipPredictionReasoning.bottomConverging": "Bottom converging: Chips collecting at lows, stabilizing.",
      "chipPredictionReasoning.multiPeak": "Multi-peak: Divergence in consensus, likely volatile/sideways.",
      "chipPredictionReasoning.scattered": "Scattered chips: No clear consensus, weak trend support.",
      "chipPredictionReasoning.extremelyHighProfit": "Extremely high profit ratio (>90%): Strong trend but overbought risk.",
      "chipPredictionReasoning.extremelyLowProfit": "Extremely low profit ratio (<10%) at lows: Potential oversold bounce.",
      "chipPredictionReasoning.heavyTrappedSupply": "Heavy trapped supply (>80%): Strong overhead resistance.",
      "chipPredictionReasoning.priceAboveCost20": "Price 20% above avg cost: Profit taking likely.",
      "chipPredictionReasoning.priceBelowCost20": "Price 20% below avg cost: Valuation attractive.",
      "chipPredictionReasoning.highConcentration": "High chip concentration: Strong consensus, explosive move likely.",
    };
    return defaultTranslations[key] || key;
  });

  // 1. Morphology Analysis
  if (morphology === "low_single_dense") {
    score += 40;
    confidence += 20;
    reasoning.push(translate("analysis.chipPredictionReasoning.lowSingleDense"));
  } else if (morphology === "high_single_dense") {
    if (profitRatio > 80) {
      score -= 30;
      reasoning.push(translate("analysis.chipPredictionReasoning.highSingleDenseHighProfit"));
    } else {
      score += 10;
      reasoning.push(translate("analysis.chipPredictionReasoning.highSingleDense"));
    }
  } else if (morphology === "bottom_converging") {
    score += 25;
    reasoning.push(translate("analysis.chipPredictionReasoning.bottomConverging"));
  } else if (morphology === "multi_peak") {
    score -= 10;
    reasoning.push(translate("analysis.chipPredictionReasoning.multiPeak"));
  } else if (morphology === "scattered") {
    score -= 20;
    reasoning.push(translate("analysis.chipPredictionReasoning.scattered"));
  }

  // 2. Profit/Trapped Ratio Analysis
  if (profitRatio > 90) {
    score += 10; // Momentum strong, but watch out
    reasoning.push(translate("analysis.chipPredictionReasoning.extremelyHighProfit"));
  } else if (profitRatio < 10 && position === "low") {
    score += 15; // Oversold bounce potential
    reasoning.push(translate("analysis.chipPredictionReasoning.extremelyLowProfit"));
  }

  if (trappedRatio > 80) {
    score -= 20;
    reasoning.push(translate("analysis.chipPredictionReasoning.heavyTrappedSupply"));
  }

  // 3. Cost vs Price Analysis (ASR/CYS)
  const deviation = ((currentPrice - avgCost) / avgCost) * 100;
  if (deviation > 20) {
    score -= 10; // Too far above cost
    reasoning.push(translate("analysis.chipPredictionReasoning.priceAboveCost20"));
  } else if (deviation < -20) {
    score += 15; // Too far below cost
    reasoning.push(translate("analysis.chipPredictionReasoning.priceBelowCost20"));
  }

  // 4. Concentration
  if (concentration90 < 10) {
    confidence += 15;
    reasoning.push(translate("analysis.chipPredictionReasoning.highConcentration"));
  }

  // Determine Signal
  let signal: ChipPrediction["signal"] = "hold";
  if (score >= 40) signal = "strong_buy";
  else if (score >= 15) signal = "buy";
  else if (score <= -40) signal = "strong_sell";
  else if (score <= -15) signal = "sell";

  // Calculate Targets
  let targetPrice = resistanceLevel ? resistanceLevel * 1.05 : currentPrice * 1.1;
  let stopLossPrice = supportLevel ? supportLevel * 0.95 : currentPrice * 0.9;

  // Adjust Score Boundary
  score = Math.max(-100, Math.min(100, score));
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    score,
    signal,
    confidence,
    reasoning,
    targetPrice,
    stopLossPrice
  };
}

function getPriceAtPercentile(
  priceLevels: number[],
  chipAmounts: number[],
  total: number,
  pct: number,
  minPrice: number,
  maxPrice: number
): number {
  const target = pct * total;
  const bins = priceLevels.length;
  const binSize = (maxPrice - minPrice) / bins;
  let cum = 0;
  for (let i = 0; i < bins; i++) {
    const leftEdge = minPrice + i * binSize;
    if (cum + chipAmounts[i] >= target) {
      const frac = chipAmounts[i] > 0 ? (target - cum) / chipAmounts[i] : 0;
      return leftEdge + binSize * frac;
    }
    cum += chipAmounts[i];
  }
  return maxPrice;
}

/**
 * Compute detailed chip metrics from price levels and chip amounts.
 * Used for both aggregate and per-day (selected date) chip analysis.
 */
export function computeChipMetrics(
  priceLevels: number[],
  chipAmounts: number[],
  currentPrice: number,
  minPrice: number,
  maxPrice: number,
  t?: (key: string) => string
): ChipMetricsDetail {
  const bins = priceLevels.length;
  const total = chipAmounts.reduce((s, a) => s + a, 0);
  if (total <= 0) {
    return {
      profitRatio: 50,
      trappedRatio: 50,
      avgCost: currentPrice,
      concentration90: 100,
      concentration70: 100,
      range90Low: minPrice,
      range90High: maxPrice,
      avgCostProfit: null,
      avgCostTrapped: null,
      chipDeviation: 0,
      supportLevel: null,
      resistanceLevel: null,
      morphology: "scattered",
      chipInterpretation: "",
      peakCount: 0,
      position: "middle",
      mainPeaks: [],
    };
  }

  const avgCost = chipAmounts.reduce((s, a, i) => s + a * priceLevels[i], 0) / total;

  let profitChips = 0;
  let trappedChips = 0;
  let sumProfit = 0;
  let sumTrapped = 0;
  for (let i = 0; i < bins; i++) {
    if (priceLevels[i] < currentPrice) {
      profitChips += chipAmounts[i];
      sumProfit += chipAmounts[i] * priceLevels[i];
    } else if (priceLevels[i] > currentPrice) {
      trappedChips += chipAmounts[i];
      sumTrapped += chipAmounts[i] * priceLevels[i];
    }
  }
  const profitRatio = (profitChips / total) * 100;
  const trappedRatio = (trappedChips / total) * 100;
  const avgCostProfit = profitChips > 0 ? sumProfit / profitChips : null;
  const avgCostTrapped = trappedChips > 0 ? sumTrapped / trappedChips : null;

  const baseForDev = avgCostProfit ?? avgCost;
  const chipDeviation = currentPrice > 0 ? ((currentPrice - baseForDev) / currentPrice) * 100 : 0;

  const p5 = getPriceAtPercentile(priceLevels, chipAmounts, total, 0.05, minPrice, maxPrice);
  const p15 = getPriceAtPercentile(priceLevels, chipAmounts, total, 0.15, minPrice, maxPrice);
  const p85 = getPriceAtPercentile(priceLevels, chipAmounts, total, 0.85, minPrice, maxPrice);
  const p95 = getPriceAtPercentile(priceLevels, chipAmounts, total, 0.95, minPrice, maxPrice);
  const range90 = p95 - p5;
  const range70 = p85 - p15;
  const concentration90 = avgCost > 0 ? (range90 / avgCost) * 100 : 100;
  const concentration70 = avgCost > 0 ? (range70 / avgCost) * 100 : 100;

  let supportLevel: number | null = null;
  let maxProfitAmount = 0;
  for (let i = 0; i < bins; i++) {
    if (priceLevels[i] < currentPrice && chipAmounts[i] > maxProfitAmount) {
      maxProfitAmount = chipAmounts[i];
      supportLevel = priceLevels[i];
    }
  }

  let resistanceLevel: number | null = null;
  let maxTrappedAmount = 0;
  for (let i = 0; i < bins; i++) {
    if (priceLevels[i] > currentPrice && chipAmounts[i] > maxTrappedAmount) {
      maxTrappedAmount = chipAmounts[i];
      resistanceLevel = priceLevels[i];
    }
  }

  const meanChip = total / bins;
  const mainPeaks: Array<{ price: number; amount: number }> = [];
  for (let i = 1; i < bins - 1; i++) {
    if (
      chipAmounts[i] > chipAmounts[i - 1] &&
      chipAmounts[i] > chipAmounts[i + 1] &&
      chipAmounts[i] > meanChip * 1.5
    ) {
      mainPeaks.push({ price: priceLevels[i], amount: chipAmounts[i] });
    }
  }
  mainPeaks.sort((a, b) => b.amount - a.amount);
  const topPeaks = mainPeaks.slice(0, 3);
  const peakCount = topPeaks.length;

  const priceRangeValue = maxPrice - minPrice;
  const pricePosition = priceRangeValue > 0 ? ((currentPrice - minPrice) / priceRangeValue) * 100 : 50;
  let position: "low" | "middle" | "high" = "middle";
  if (pricePosition < 30) position = "low";
  else if (pricePosition > 70) position = "high";

  let morphology: ChipMorphology = "scattered";
  if (position === "low" && peakCount === 1 && concentration90 < 12) {
    morphology = "low_single_dense";
  } else if (position === "high" && peakCount === 1 && concentration90 < 18) {
    morphology = "high_single_dense";
  } else if (concentration90 > 25) {
    morphology = "scattered";
  } else if (position === "low" && peakCount >= 2 && concentration90 < 20) {
    morphology = "bottom_converging";
  } else if (peakCount >= 2 && peakCount <= 4) {
    morphology = "multi_peak";
  }

  let chipInterpretation = "";
  if (morphology === "low_single_dense") {
    chipInterpretation = "low_single_dense_tactics";
  } else if (morphology === "high_single_dense" && profitRatio > 80) {
    chipInterpretation = "high_dense_high_profit_tactics";
  } else if (morphology === "high_single_dense") {
    chipInterpretation = "high_single_dense_tactics";
  } else if (morphology === "multi_peak") {
    chipInterpretation = "multi_peak_tactics";
  } else if (morphology === "scattered") {
    chipInterpretation = "scattered_tactics";
  } else if (morphology === "bottom_converging") {
    chipInterpretation = "bottom_converging_tactics";
  } else if (profitRatio > 70) {
    chipInterpretation = "high_profit_tactics";
  } else if (trappedRatio > 60) {
    chipInterpretation = "high_trapped_tactics";
  } else if (concentration90 < 12) {
    chipInterpretation = "highly_concentrated_tactics";
  } else {
    chipInterpretation = "neutral_tactics";
  }

  const baseMetrics: ChipMetricsDetail = {
    profitRatio,
    trappedRatio,
    avgCost,
    concentration90,
    concentration70,
    range90Low: p5,
    range90High: p95,
    avgCostProfit,
    avgCostTrapped,
    chipDeviation,
    supportLevel,
    resistanceLevel,
    morphology,
    chipInterpretation,
    peakCount,
    position,
    mainPeaks: topPeaks,
  };

  const prediction = calculateChipPrediction(baseMetrics, currentPrice, t);

  return {
    ...baseMetrics,
    prediction
  };
}

// Calculate Chip Distribution (Cost Distribution)
import { getChipDistributionParams } from "./settings";

export function calculateChipDistribution(
  data: StockData[],
  priceBins?: number,
  decayFactor?: number,
  t?: (key: string) => string
): ChipDistributionResult | null {
  const defaults = getChipDistributionParams();
  const bins = priceBins ?? defaults.priceBins;
  const decay = decayFactor ?? defaults.decayFactor;
  if (data.length < 20) return null;

  const closes = data.map(d => d.close);
  const volumes = data.map(d => d.volume);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const currentPrice = closes[closes.length - 1];

  // Find price range
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const priceRange = maxPrice - minPrice;
  const binSize = priceRange / bins;

  // Initialize chip distribution array
  const chipDistribution = new Array(bins).fill(0);
  const priceLevels: number[] = [];

  // Calculate price level for each bin
  for (let i = 0; i < bins; i++) {
    priceLevels.push(minPrice + (i + 0.5) * binSize);
  }

  // Distribute chips based on historical trading
  // Use triangular distribution within each day's price range
  for (let day = 0; day < data.length; day++) {
    const dayVolume = volumes[day];
    const dayHigh = highs[day];
    const dayLow = lows[day];
    const dayClose = closes[day];
    
    // Calculate typical price (weighted towards close price)
    const typicalPrice = (dayHigh + dayLow + dayClose * 2) / 4;
    
    // Distribute volume across price bins
    // More volume concentrated around typical price
    for (let bin = 0; bin < bins; bin++) {
      const binPrice = priceLevels[bin];
      
      if (binPrice >= dayLow && binPrice <= dayHigh) {
        // Triangular distribution centered at typical price
        const distance = Math.abs(binPrice - typicalPrice);
        const maxDistance = Math.max(typicalPrice - dayLow, dayHigh - typicalPrice);
        const weight = maxDistance > 0 ? 1 - (distance / maxDistance) : 1;
        
        // Apply decay factor (older chips decay)
        const ageFactor = Math.pow(decay, data.length - day - 1);
        chipDistribution[bin] += dayVolume * weight * ageFactor;
      }
    }
  }

  // Calculate statistics
  let totalChips = 0;
  let weightedPriceSum = 0;
  
  for (let i = 0; i < bins; i++) {
    totalChips += chipDistribution[i];
    weightedPriceSum += chipDistribution[i] * priceLevels[i];
  }

  const avgCost = totalChips > 0 ? weightedPriceSum / totalChips : currentPrice;

  // Calculate profit ratio (chips below current price / total chips)
  let profitChips = 0;
  for (let i = 0; i < bins; i++) {
    if (priceLevels[i] < currentPrice) {
      profitChips += chipDistribution[i];
    }
  }
  const profitRatio = totalChips > 0 ? (profitChips / totalChips) * 100 : 50;

  // Calculate concentration (variance-based, legacy)
  const meanChip = totalChips / bins;
  let variance = 0;
  for (let i = 0; i < bins; i++) {
    variance += Math.pow(chipDistribution[i] - meanChip, 2);
  }
  const stdDev = Math.sqrt(variance / bins);
  const concentration = meanChip > 0 ? (stdDev / meanChip) * 100 : 100;

  // Extended metrics: 90/70 concentration, support/resistance, morphology, etc.
  const metrics = computeChipMetrics(priceLevels, chipDistribution, currentPrice, minPrice, maxPrice, t);

  // Find main peaks (local maxima)
  const mainPeaks: Array<{ price: number; amount: number }> = [];
  for (let i = 1; i < bins - 1; i++) {
    if (chipDistribution[i] > chipDistribution[i - 1] && 
        chipDistribution[i] > chipDistribution[i + 1] &&
        chipDistribution[i] > meanChip * 1.5) {
      mainPeaks.push({
        price: priceLevels[i],
        amount: chipDistribution[i],
      });
    }
  }
  mainPeaks.sort((a, b) => b.amount - a.amount);
  const topPeaks = mainPeaks.slice(0, 3);

  const peakCount = topPeaks.length;
  const isSinglePeak = peakCount === 1;
  const isMultiPeak = peakCount >= 2;
  const position = metrics.position;
  
  let peakPattern: "singleDense" | "multiPeak" | "scattered" = "scattered";
  if (isSinglePeak && concentration < 15) {
    peakPattern = "singleDense";
  } else if (isMultiPeak && concentration < 20) {
    peakPattern = "multiPeak";
  }

  // Calculate daily chip distributions for flame chart
  const dailyDistributions: Array<{
    date: string;
    chipAmounts: number[];
    avgCost: number;
  }> = [];
  
  for (let day = 0; day < data.length; day++) {
    // Calculate cumulative distribution up to this day
    const dayChipDistribution = new Array(bins).fill(0);
    
    for (let d = 0; d <= day; d++) {
      const dVolume = volumes[d];
      const dHigh = highs[d];
      const dLow = lows[d];
      const dClose = closes[d];
      const dTypicalPrice = (dHigh + dLow + dClose * 2) / 4;
      
      for (let bin = 0; bin < bins; bin++) {
        const binPrice = priceLevels[bin];
        if (binPrice >= dLow && binPrice <= dHigh) {
          const distance = Math.abs(binPrice - dTypicalPrice);
          const maxDistance = Math.max(dTypicalPrice - dLow, dHigh - dTypicalPrice);
          const weight = maxDistance > 0 ? 1 - (distance / maxDistance) : 1;
          const ageFactor = Math.pow(decay, day - d);
          dayChipDistribution[bin] += dVolume * weight * ageFactor;
        }
      }
    }
    
    // Calculate average cost for this day
    let dayTotalChips = 0;
    let dayWeightedPriceSum = 0;
    for (let i = 0; i < bins; i++) {
      dayTotalChips += dayChipDistribution[i];
      dayWeightedPriceSum += dayChipDistribution[i] * priceLevels[i];
    }
    const dayAvgCost = dayTotalChips > 0 ? dayWeightedPriceSum / dayTotalChips : closes[day];
    
    dailyDistributions.push({
      date: data[day].date,
      chipAmounts: [...dayChipDistribution],
      avgCost: dayAvgCost,
    });
  }

  // Calculate prediction
  const prediction = calculateChipPrediction(
    metrics,
    currentPrice,
    t
  );

  return {
    priceLevels,
    chipAmounts: chipDistribution,
    avgCost,
    profitRatio,
    trappedRatio: metrics.trappedRatio,
    concentration: Math.max(0, concentration),
    concentration90: metrics.concentration90,
    concentration70: metrics.concentration70,
    range90Low: metrics.range90Low,
    range90High: metrics.range90High,
    avgCostProfit: metrics.avgCostProfit,
    avgCostTrapped: metrics.avgCostTrapped,
    chipDeviation: metrics.chipDeviation,
    supportLevel: metrics.supportLevel,
    resistanceLevel: metrics.resistanceLevel,
    morphology: metrics.morphology,
    chipInterpretation: metrics.chipInterpretation,
    prediction,
    mainPeaks: topPeaks,
    peakCount,
    isSinglePeak,
    isMultiPeak,
    position,
    peakPattern,
    currentPrice,
    minPrice,
    maxPrice,
    dailyDistributions,
  };
}
