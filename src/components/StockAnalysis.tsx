import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import ChartDialog from "./ChartDialog";
import "./StockAnalysis.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockAnalysisProps {
  timeSeriesData: StockData[];
  klineData: StockData[];
  analysisType: "timeseries" | "kline";
}

interface AnalysisResult {
  key: string;
  titleKey: string;
  descKey: string;
  descParams: Record<string, string | number>;
  signal: "bullish" | "bearish" | "neutral";
  confidence: number;
  extraKey?: string;
}

// ============= Technical Indicator Calculations =============

function calculateMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calculateMACD(data: number[], fast = 12, slow = 26, signal = 9) {
  if (data.length < slow) return null;
  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLineRaw = calculateEMA(macdLine.slice(slow - 1), signal);
  
  // Pad signalLine to match macdLine length
  const signalLine: (number | null)[] = new Array(slow - 1).fill(null);
  signalLineRaw.forEach((val) => {
    signalLine.push(val);
  });
  
  // Calculate histogram
  const histogram: (number | null)[] = macdLine.map((m, i) => {
    const s = signalLine[i];
    return s !== null ? m - s : null;
  });
  
  const idx = data.length - 1;
  
  return {
    macd: macdLine[idx],
    signal: signalLine[idx] || 0,
    histogram: histogram[idx] || 0,
    prevHistogram: histogram[idx - 1] || 0,
    macdLine,
    signalLine,
    histogramArray: histogram,
  };
}

function calculateRSI(data: number[], period = 14): number | null {
  if (data.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = data.length - period; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return 100;
  return 100 - (100 / (1 + gains / losses));
}

function calculateKDJ(highs: number[], lows: number[], closes: number[], period = 9) {
  if (closes.length < period) return null;
  
  const n = closes.length;
  let rsv = 0, k = 50, d = 50;
  
  for (let i = n - period; i < n; i++) {
    const periodHighs = highs.slice(Math.max(0, i - period + 1), i + 1);
    const periodLows = lows.slice(Math.max(0, i - period + 1), i + 1);
    const hh = Math.max(...periodHighs);
    const ll = Math.min(...periodLows);
    rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
  }
  
  const j = 3 * k - 2 * d;
  return { k, d, j, prevK: k - (rsv - k) / 2 };
}

function calculateBollingerBands(data: number[], period = 20, multiplier = 2) {
  if (data.length < period) return null;
  
  const slice = data.slice(-period);
  const ma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - ma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: ma + multiplier * stdDev,
    middle: ma,
    lower: ma - multiplier * stdDev,
    width: ((ma + multiplier * stdDev) - (ma - multiplier * stdDev)) / ma * 100,
  };
}

// Calculate Chip Distribution (Cost Distribution)
function calculateChipDistribution(
  data: StockData[],
  priceBins: number = 60,
  decayFactor: number = 0.95
): {
  priceLevels: number[];
  chipAmounts: number[];
  avgCost: number;
  profitRatio: number;
  concentration: number;
  mainPeaks: Array<{ price: number; amount: number }>;
} | null {
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
  const binSize = priceRange / priceBins;

  // Initialize chip distribution array
  const chipDistribution = new Array(priceBins).fill(0);
  const priceLevels: number[] = [];

  // Calculate price level for each bin
  for (let i = 0; i < priceBins; i++) {
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
    for (let bin = 0; bin < priceBins; bin++) {
      const binPrice = priceLevels[bin];
      
      if (binPrice >= dayLow && binPrice <= dayHigh) {
        // Triangular distribution centered at typical price
        const distance = Math.abs(binPrice - typicalPrice);
        const maxDistance = Math.max(typicalPrice - dayLow, dayHigh - typicalPrice);
        const weight = maxDistance > 0 ? 1 - (distance / maxDistance) : 1;
        
        // Apply decay factor (older chips decay)
        const ageFactor = Math.pow(decayFactor, data.length - day - 1);
        chipDistribution[bin] += dayVolume * weight * ageFactor;
      }
    }
  }

  // Calculate statistics
  let totalChips = 0;
  let weightedPriceSum = 0;
  
  for (let i = 0; i < priceBins; i++) {
    totalChips += chipDistribution[i];
    weightedPriceSum += chipDistribution[i] * priceLevels[i];
  }

  const avgCost = totalChips > 0 ? weightedPriceSum / totalChips : currentPrice;

  // Calculate profit ratio (chips below current price / total chips)
  let profitChips = 0;
  for (let i = 0; i < priceBins; i++) {
    if (priceLevels[i] < currentPrice) {
      profitChips += chipDistribution[i];
    }
  }
  const profitRatio = totalChips > 0 ? (profitChips / totalChips) * 100 : 50;

  // Calculate concentration (how concentrated the chips are)
  // Using coefficient of variation
  const meanChip = totalChips / priceBins;
  let variance = 0;
  for (let i = 0; i < priceBins; i++) {
    variance += Math.pow(chipDistribution[i] - meanChip, 2);
  }
  const stdDev = Math.sqrt(variance / priceBins);
  const concentration = meanChip > 0 ? (1 - stdDev / meanChip) * 100 : 0;

  // Find main peaks (local maxima)
  const mainPeaks: Array<{ price: number; amount: number }> = [];
  for (let i = 1; i < priceBins - 1; i++) {
    if (chipDistribution[i] > chipDistribution[i - 1] && 
        chipDistribution[i] > chipDistribution[i + 1] &&
        chipDistribution[i] > meanChip * 1.5) {
      mainPeaks.push({
        price: priceLevels[i],
        amount: chipDistribution[i],
      });
    }
  }
  // Sort by amount and take top 3
  mainPeaks.sort((a, b) => b.amount - a.amount);
  const topPeaks = mainPeaks.slice(0, 3);

  return {
    priceLevels,
    chipAmounts: chipDistribution,
    avgCost,
    profitRatio,
    concentration: Math.max(0, Math.min(100, concentration)),
    mainPeaks: topPeaks,
  };
}

function calculateOBV(closes: number[], volumes: number[]): { value: number; trend: string } {
  if (closes.length < 2) return { value: 0, trend: "neutral" };
  
  let obv = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
  }
  
  // Calculate OBV trend using recent 10 periods
  const recentLen = Math.min(10, closes.length - 1);
  let recentObv = 0, prevObv = 0;
  for (let i = closes.length - recentLen; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) recentObv += volumes[i];
    else if (closes[i] < closes[i - 1]) recentObv -= volumes[i];
  }
  for (let i = closes.length - recentLen * 2; i < closes.length - recentLen && i > 0; i++) {
    if (closes[i] > closes[i - 1]) prevObv += volumes[i];
    else if (closes[i] < closes[i - 1]) prevObv -= volumes[i];
  }
  
  const trend = recentObv > prevObv ? "rising" : recentObv < prevObv ? "falling" : "neutral";
  return { value: obv, trend };
}

function calculateATR(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  // Calculate True Range for each period
  const trueRanges: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) return null;

  // Calculate initial ATR using simple average (Wilder's method)
  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trueRanges[i];
  }
  atr /= period;

  // Apply Wilder's smoothing for subsequent values
  for (let i = period; i < trueRanges.length; i++) {
    atr = ((atr * (period - 1)) + trueRanges[i]) / period;
  }

  return atr;
}

function analyzeMACDSignal(macd: any, closes: number[], volumes: number[]): {
  action: string;
  signal: "bullish" | "bearish" | "neutral";
  strength: number;
  reason: string;
} {
  if (!macd || !macd.macdLine || !macd.signalLine || !macd.histogramArray || 
      macd.macdLine.length < 2 || macd.signalLine.length < 2 || macd.histogramArray.length < 2) {
    return { action: "HOLD", signal: "neutral", strength: 0, reason: "analysis.macdSignalHold" };
  }

  const histogram = macd.histogramArray;
  const current = {
    diff: macd.macdLine[macd.macdLine.length - 1] || 0,
    dea: macd.signalLine[macd.signalLine.length - 1] || 0,
    macd_histogram: histogram[histogram.length - 1] || 0,
    prev_histogram: histogram[histogram.length - 2] || 0,
    zero_axis_position: Math.abs(macd.macdLine[macd.macdLine.length - 1] || 0) < 0.0005 ? "near" :
                       (macd.macdLine[macd.macdLine.length - 1] || 0) > 0 ? "above" : "below"
  };

  const prev = {
    diff: macd.macdLine[macd.macdLine.length - 2] || 0,
    dea: macd.signalLine[macd.signalLine.length - 2] || 0,
    macd_histogram: current.prev_histogram,
    prev_histogram: histogram[histogram.length - 3] || 0,
    zero_axis_position: Math.abs(macd.macdLine[macd.macdLine.length - 2] || 0) < 0.0005 ? "near" :
                       (macd.macdLine[macd.macdLine.length - 2] || 0) > 0 ? "above" : "below"
  };

  // 判断趋势方向（简化版：基于最近20日均线斜率）
  const recentPrices = closes.slice(-20);
  const trend_direction = recentPrices.length >= 10 ?
    (recentPrices[recentPrices.length - 1] > recentPrices[0] ? "uptrend" : "downtrend") : "sideways";

  // 判断成交量趋势（简化版）
  const recentVolumes = volumes.slice(-5);
  const volume_trend = recentVolumes.length >= 2 ?
    (recentVolumes[recentVolumes.length - 1] > recentVolumes[0] * 1.2 ? "explosive" :
     recentVolumes[recentVolumes.length - 1] > recentVolumes[0] ? "increasing" : "decreasing") : "stable";

  // 判断是否为第一次交叉（简化版：检查最近10天是否有过交叉）
  const recentCrosses = [];
  for (let i = Math.max(0, macd.macdLine.length - 10); i < macd.macdLine.length - 1; i++) {
    const diff1 = macd.macdLine[i] || 0;
    const diff2 = macd.macdLine[i + 1] || 0;
    const dea1 = macd.signalLine[i] || 0;
    const dea2 = macd.signalLine[i + 1] || 0;
    if ((diff1 <= dea1 && diff2 > dea2) || (diff1 >= dea1 && diff2 < dea2)) {
      recentCrosses.push(i);
    }
  }
  const is_first_cross = recentCrosses.length <= 1;

  const context = {
    trend_direction,
    volume_trend,
    is_first_cross
  };

  return evaluateMACDSignal(current, prev, context);
}

function evaluateMACDSignal(current: any, prev: any, context: any): {
  action: string;
  signal: "bullish" | "bearish" | "neutral";
  strength: number;
  reason: string;
} {
  const signal = { action: "HOLD", signal: "neutral" as "bullish" | "bearish" | "neutral", strength: 0, reason: "analysis.macdSignalHold" };

  // 1. 先看零轴位置（最重要分水岭）
  let base_strength_multiplier = 1.0;
  if (current.zero_axis_position === "below") {
    base_strength_multiplier = 0.4; // 零轴下方信号强度打折严重
  } else if (current.zero_axis_position === "near") {
    base_strength_multiplier = 0.7;
  }

  // 2. 金叉/死叉发生判断
  const golden_cross = (prev.diff <= prev.dea) && (current.diff > current.dea);
  const death_cross = (prev.diff >= prev.dea) && (current.diff < current.dea);

  // 3. 柱子形态变化
  const red_expanding = current.macd_histogram > 0 && current.macd_histogram > prev.macd_histogram;
  const green_expanding = current.macd_histogram < 0 && Math.abs(current.macd_histogram) > Math.abs(prev.macd_histogram);
  const red_shrinking = current.macd_histogram > 0 && current.macd_histogram < prev.macd_histogram;
  const turning_green = current.macd_histogram <= 0 && prev.macd_histogram > 0;

  // 买入信号逻辑
  if (golden_cross) {
    if (current.zero_axis_position === "above") {
      if (context.is_first_cross) {
        signal.action = "BUY";
        signal.signal = "bullish";
        signal.strength = 9 * base_strength_multiplier;
        signal.reason = "analysis.macdStrongBuy";
      } else {
        signal.action = "BUY";
        signal.signal = "bullish";
        signal.strength = 7 * base_strength_multiplier;
        signal.reason = "analysis.macdGoodBuy";
      }

      if (red_expanding && context.volume_trend === "explosive") {
        signal.strength += 2;
      }
    } else if (current.zero_axis_position === "below") {
      signal.action = "BUY";
      signal.signal = "bullish";
      signal.strength = 4 * base_strength_multiplier;
      signal.reason = "analysis.macdWeakBuy";
      if (red_expanding) {
        signal.strength += 1.5;
      }
    }
  }
  // 卖出信号逻辑
  else if (death_cross) {
    if (current.zero_axis_position === "above") {
      signal.action = "SELL";
      signal.signal = "bearish";
      signal.strength = -7 * base_strength_multiplier;
      signal.reason = "analysis.macdGoodSell";
      if (turning_green) {
        signal.strength -= 1;
      }
    } else {
      signal.action = "SELL";
      signal.signal = "bearish";
      signal.strength = -9 * base_strength_multiplier;
      signal.reason = "analysis.macdStrongSell";
      if (green_expanding) {
        signal.strength -= 2;
      }
    }
  }
  // 特殊形态
  else if (red_shrinking && current.zero_axis_position === "above" && !golden_cross) {
    signal.action = "REDUCE";
    signal.signal = "bearish";
    signal.strength = -3;
    signal.reason = "analysis.macdReducing";
  }

  // 趋势过滤
  if (context.trend_direction === "downtrend" && signal.signal === "bullish") {
    signal.strength *= 0.5;
    signal.reason = "analysis.macdAgainstTrend";
  }

  // 过滤太弱的信号
  if (Math.abs(signal.strength) < 4) {
    signal.action = "HOLD";
    signal.signal = "neutral";
    signal.reason = "analysis.macdSignalHold";
  }

  return signal;
}

function analyzeMACDRSISignal(macd: any, rsi: number, closes: number[]): {
  macdAction: string;
  rsiCondition: string;
  action: string;
  signal: "bullish" | "bearish" | "neutral";
  strength: number;
  reason: string;
} {
  // 获取MACD信号
  const macdSignal = analyzeMACDSignal(macd, closes, []);

  // RSI条件判断
  let rsiCondition = "neutral";
  if (rsi >= 70) rsiCondition = "overbought";
  else if (rsi <= 30) rsiCondition = "oversold";
  else if (rsi >= 60) rsiCondition = "bullish";
  else if (rsi <= 40) rsiCondition = "bearish";

  // 组合信号分析
  const result = {
    macdAction: macdSignal.action,
    rsiCondition,
    action: "HOLD",
    signal: "neutral" as "bullish" | "bearish" | "neutral",
    strength: 0,
    reason: "analysis.compositeSignalHold"
  };

  // MACD金叉 + RSI超卖 = 强买入
  if (macdSignal.action === "BUY" && rsiCondition === "oversold") {
    result.action = "STRONG_BUY";
    result.signal = "bullish";
    result.strength = 9;
    result.reason = "analysis.compositeStrongBuy";
  }
  // MACD金叉 + RSI中性 = 买入
  else if (macdSignal.action === "BUY" && rsiCondition === "neutral") {
    result.action = "BUY";
    result.signal = "bullish";
    result.strength = 7;
    result.reason = "analysis.compositeBuy";
  }
  // MACD死叉 + RSI超买 = 强卖出
  else if (macdSignal.action === "SELL" && rsiCondition === "overbought") {
    result.action = "STRONG_SELL";
    result.signal = "bearish";
    result.strength = -9;
    result.reason = "analysis.compositeStrongSell";
  }
  // MACD死叉 + RSI中性 = 卖出
  else if (macdSignal.action === "SELL" && rsiCondition === "neutral") {
    result.action = "SELL";
    result.signal = "bearish";
    result.strength = -7;
    result.reason = "analysis.compositeSell";
  }
  // MACD金叉 + RSI超买 = 谨慎买入（可能冲高回落）
  else if (macdSignal.action === "BUY" && rsiCondition === "overbought") {
    result.action = "CAUTION_BUY";
    result.signal = "bullish";
    result.strength = 4;
    result.reason = "analysis.compositeCautionBuy";
  }
  // MACD死叉 + RSI超卖 = 谨慎卖出（可能探底反弹）
  else if (macdSignal.action === "SELL" && rsiCondition === "oversold") {
    result.action = "CAUTION_SELL";
    result.signal = "bearish";
    result.strength = -4;
    result.reason = "analysis.compositeCautionSell";
  }

  return result;
}

function calculateWilliamsR(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (closes.length < period) return null;
  
  const periodHighs = highs.slice(-period);
  const periodLows = lows.slice(-period);
  const hh = Math.max(...periodHighs);
  const ll = Math.min(...periodLows);
  const close = closes[closes.length - 1];
  
  if (hh === ll) return -50;
  return ((hh - close) / (hh - ll)) * -100;
}

function calculateSupportResistance(highs: number[], lows: number[], closes: number[], lookbackPeriod = 20) {
  // Use pivot points and volume profile for better support/resistance
  const recentData = closes.slice(-lookbackPeriod);
  const recentHighs = highs.slice(-lookbackPeriod);
  const recentLows = lows.slice(-lookbackPeriod);

  // Find pivot points (local highs and lows)
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];

  for (let i = 1; i < recentData.length - 1; i++) {
    if (recentHighs[i] > recentHighs[i - 1] && recentHighs[i] > recentHighs[i + 1]) {
      pivotHighs.push(recentHighs[i]);
    }
    if (recentLows[i] < recentLows[i - 1] && recentLows[i] < recentLows[i + 1]) {
      pivotLows.push(recentLows[i]);
    }
  }

  // Calculate support and resistance from pivot points or recent extremes
  let support = Math.min(...recentLows);
  let resistance = Math.max(...recentHighs);

  if (pivotLows.length > 0) {
    // Use the most recent significant pivot low as support
    const recentPivotLows = pivotLows.slice(-3); // Last 3 pivot lows
    support = Math.max(...recentPivotLows); // Use the highest pivot low as support
  }

  if (pivotHighs.length > 0) {
    // Use the most recent significant pivot high as resistance
    const recentPivotHighs = pivotHighs.slice(-3); // Last 3 pivot highs
    resistance = Math.min(...recentPivotHighs); // Use the lowest pivot high as resistance
  }

  const currentPrice = closes[closes.length - 1];
  const position = resistance > support ?
    ((currentPrice - support) / (resistance - support)) * 100 : 50;

  return {
    support,
    resistance,
    position,
    pivotHighs,
    pivotLows
  };
}

const StockAnalysis: React.FC<StockAnalysisProps> = ({
  timeSeriesData,
  klineData,
  analysisType,
}) => {
  const { t } = useTranslation();
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  const chartRef = useRef<ReactECharts>(null);
  
  // Parameters
  const [tsParams, setTsParams] = useState({ maPeriod: 5, volumeMultiplier: 2.0 });
  const [klParams, setKlParams] = useState({ 
    macdFast: 12, macdSlow: 26, macdSignal: 9, 
    rsiPeriod: 14, kdjPeriod: 9, bbPeriod: 20, atrPeriod: 14, trendDays: 20
  });

  // Time Series Analysis Results
  const timeSeriesResults = useMemo((): AnalysisResult[] => {
    if (!timeSeriesData || timeSeriesData.length < 2) return [];
    
    const results: AnalysisResult[] = [];
    const prices = timeSeriesData.map(d => d.close);
    const volumes = timeSeriesData.map(d => d.volume);
    
    // 1. Price Movement
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const priceChange = ((lastPrice - firstPrice) / firstPrice) * 100;
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const amplitude = ((maxPrice - minPrice) / minPrice) * 100;
    
    results.push({
      key: "priceMovement",
      titleKey: "analysis.priceMovement",
      descKey: "analysis.priceMovementDesc",
      descParams: {
        price: lastPrice.toFixed(2),
        change: (priceChange >= 0 ? "+" : "") + priceChange.toFixed(2),
        high: maxPrice.toFixed(2),
        low: minPrice.toFixed(2),
        amplitude: amplitude.toFixed(2),
      },
      signal: priceChange > 1 ? "bullish" : priceChange < -1 ? "bearish" : "neutral",
      confidence: Math.min(Math.abs(priceChange) * 20, 100),
    });

    // 2. Volume Analysis
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVolumes = volumes.slice(-10);
    const recentAvgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const volumeRatio = recentAvgVolume / avgVolume;
    
    results.push({
      key: "volumeAnalysis",
      titleKey: "analysis.volumeAnalysis",
      descKey: "analysis.volumeAnalysisDesc",
      descParams: {
        avg: (avgVolume / 10000).toFixed(1) + "k",
        recent: (recentAvgVolume / 10000).toFixed(1) + "k",
        ratio: volumeRatio.toFixed(2),
      },
      signal: volumeRatio > tsParams.volumeMultiplier && priceChange > 0 ? "bullish" :
              volumeRatio > tsParams.volumeMultiplier && priceChange < 0 ? "bearish" : "neutral",
      confidence: Math.min(volumeRatio / tsParams.volumeMultiplier * 50, 100),
      extraKey: volumeRatio > tsParams.volumeMultiplier ? "analysis.volumeSpike" : undefined,
    });

    // 3. MA Analysis
    const maPeriod = Math.min(tsParams.maPeriod, prices.length);
    const ma = calculateMA(prices, maPeriod);
    const priceVsMa = ((lastPrice - ma) / ma) * 100;
    
    results.push({
      key: "maAnalysis",
      titleKey: "analysis.maAnalysis",
      descKey: "analysis.maAnalysisDesc",
      descParams: { period: maPeriod, ma: ma.toFixed(2), deviation: (priceVsMa >= 0 ? "+" : "") + priceVsMa.toFixed(2) },
      signal: lastPrice > ma ? "bullish" : "bearish",
      confidence: Math.min(Math.abs(priceVsMa) * 20, 100),
      extraKey: lastPrice > ma ? "analysis.priceAboveMA" : "analysis.priceBelowMA",
    });

    // 4. Momentum
    if (prices.length >= 10) {
      const momentum = ((prices[prices.length - 1] - prices[prices.length - 10]) / prices[prices.length - 10]) * 100;
      results.push({
        key: "momentum",
        titleKey: "analysis.momentum",
        descKey: "analysis.momentumDesc",
        descParams: { value: (momentum >= 0 ? "+" : "") + momentum.toFixed(2) },
        signal: momentum > 0.5 ? "bullish" : momentum < -0.5 ? "bearish" : "neutral",
        confidence: Math.min(Math.abs(momentum) * 30, 100),
        extraKey: Math.abs(momentum) > 1 ? (momentum > 0 ? "analysis.strongUpMomentum" : "analysis.strongDownMomentum") : "analysis.weakMomentum",
      });
    }

    return results;
  }, [timeSeriesData, tsParams]);

  // K-Line Analysis Results
  const klineResults = useMemo((): AnalysisResult[] => {
    if (!klineData || klineData.length < 20) return [];
    
    const results: AnalysisResult[] = [];
    const closes = klineData.map(d => d.close);
    const highs = klineData.map(d => d.high);
    const lows = klineData.map(d => d.low);
    const volumes = klineData.map(d => d.volume);
    const lastClose = closes[closes.length - 1];
    
    // 1. Trend Analysis
    const trendDays = Math.min(klParams.trendDays, closes.length);
    const trendPrices = closes.slice(-trendDays);
    const trendChange = ((trendPrices[trendPrices.length - 1] - trendPrices[0]) / trendPrices[0]) * 100;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < trendPrices.length; i++) {
      sumX += i; sumY += trendPrices[i]; sumXY += i * trendPrices[i]; sumX2 += i * i;
    }
    const n = trendPrices.length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const normalizedSlope = (slope / (sumY / n)) * 100;
    
    const trendKey = normalizedSlope > 0.1 ? "analysis.uptrend" : normalizedSlope < -0.1 ? "analysis.downtrend" : "analysis.sideways";
    results.push({
      key: "trend",
      titleKey: "analysis.trendAnalysis",
      descKey: "analysis.trendAnalysisDesc",
      descParams: { 
        change: (trendChange >= 0 ? "+" : "") + trendChange.toFixed(2),
        trend: t(trendKey),
        strength: Math.abs(normalizedSlope).toFixed(2),
      },
      signal: normalizedSlope > 0.1 ? "bullish" : normalizedSlope < -0.1 ? "bearish" : "neutral",
      confidence: Math.min(Math.abs(normalizedSlope) * 50, 100),
    });

    // 2. MA System
    const ma5 = calculateMA(closes, 5);
    const ma10 = calculateMA(closes, 10);
    const ma20 = calculateMA(closes, 20);
    const maSignals = [lastClose > ma5, lastClose > ma10, lastClose > ma20, ma5 > ma10, ma10 > ma20];
    const maBullishScore = maSignals.filter(Boolean).length;
    
    const maExtraKey = maBullishScore >= 4 ? "analysis.strongBullishAlign" : 
                       maBullishScore <= 1 ? "analysis.strongBearishAlign" : "analysis.mixedSignals";
    results.push({
      key: "maSystem",
      titleKey: "analysis.maSystem",
      descKey: "analysis.maSystemDesc",
      descParams: { ma5: ma5.toFixed(2), ma10: ma10.toFixed(2), ma20: ma20.toFixed(2), score: maBullishScore },
      signal: maBullishScore >= 4 ? "bullish" : maBullishScore <= 1 ? "bearish" : "neutral",
      confidence: Math.abs(maBullishScore - 2.5) * 40,
      extraKey: maExtraKey,
    });

    // 3. MACD Advanced Analysis
    const macd = calculateMACD(closes, klParams.macdFast, klParams.macdSlow, klParams.macdSignal);
    if (macd) {
      // 实现高级MACD分析逻辑
      const macdSignal = analyzeMACDSignal(macd, closes, volumes);
      results.push({
        key: "macd",
        titleKey: "analysis.macdIndicator",
        descKey: "analysis.macdDesc",
        descParams: {
          macd: macd.macd.toFixed(3),
          signal: macd.signal.toFixed(3),
          histogram: macd.histogram.toFixed(3),
          action: macdSignal.action,
          strength: macdSignal.strength.toFixed(1)
        },
        signal: macdSignal.signal,
        confidence: Math.abs(macdSignal.strength),
        extraKey: macdSignal.reason,
      });
    }

    // 4. RSI (calculate early for composite analysis)
    const rsi = calculateRSI(closes, klParams.rsiPeriod);

    // 3.5. MACD + RSI Composite Analysis
    if (macd && rsi !== null) {
      const compositeSignal = analyzeMACDRSISignal(macd, rsi, closes);
      if (compositeSignal.action !== "HOLD") {
        results.push({
          key: "macd_rsi_composite",
          titleKey: "analysis.macdRsiComposite",
          descKey: "analysis.macdRsiCompositeDesc",
          descParams: {
            macdAction: compositeSignal.macdAction,
            rsiValue: rsi.toFixed(2),
            action: compositeSignal.action,
            strength: compositeSignal.strength.toFixed(1)
          },
          signal: compositeSignal.signal,
          confidence: Math.abs(compositeSignal.strength),
          extraKey: compositeSignal.reason,
        });
      }
    }

    // RSI analysis (already calculated above)
    if (rsi !== null) {
      const rsiExtraKey = rsi > 70 ? "analysis.overbought" : rsi < 30 ? "analysis.oversold" : 
                          rsi > 50 ? "analysis.bullishZone" : "analysis.bearishZone";
      results.push({
        key: "rsi",
        titleKey: "analysis.rsiIndicator",
        descKey: "analysis.rsiDesc",
        descParams: { value: rsi.toFixed(2) },
        signal: rsi > 70 ? "bearish" : rsi < 30 ? "bullish" : rsi > 50 ? "bullish" : "bearish",
        confidence: rsi > 70 || rsi < 30 ? 80 : Math.abs(rsi - 50) * 2,
        extraKey: rsiExtraKey,
      });
    }

    // 5. KDJ
    const kdj = calculateKDJ(highs, lows, closes, klParams.kdjPeriod);
    if (kdj) {
      let kdjExtraKey = "analysis.mixedSignals";
      let kdjSignal: "bullish" | "bearish" | "neutral" = "neutral";
      if (kdj.k > 80 && kdj.d > 80) { kdjExtraKey = "analysis.kdjOverbought"; kdjSignal = "bearish"; }
      else if (kdj.k < 20 && kdj.d < 20) { kdjExtraKey = "analysis.kdjOversold"; kdjSignal = "bullish"; }
      else if (kdj.k > kdj.d && kdj.prevK < kdj.d) { kdjExtraKey = "analysis.kdjGoldenCross"; kdjSignal = "bullish"; }
      else if (kdj.k < kdj.d && kdj.prevK > kdj.d) { kdjExtraKey = "analysis.kdjDeathCross"; kdjSignal = "bearish"; }
      
      results.push({
        key: "kdj",
        titleKey: "analysis.kdj",
        descKey: "analysis.kdjDesc",
        descParams: { k: kdj.k.toFixed(2), d: kdj.d.toFixed(2), j: kdj.j.toFixed(2) },
        signal: kdjSignal,
        confidence: Math.max(Math.abs(kdj.k - 50), Math.abs(kdj.d - 50)),
        extraKey: kdjExtraKey,
      });
    }

    // 6. Bollinger Bands
    const bb = calculateBollingerBands(closes, klParams.bbPeriod);
    if (bb) {
      const pricePos = (lastClose - bb.lower) / (bb.upper - bb.lower) * 100;
      const isAboveMiddle = lastClose > bb.middle;
      
      let bbExtraKey = "analysis.middleRange";
      let bbSignal: "bullish" | "bearish" | "neutral" = "neutral";
      
      // Check if price breaks through bands
      if (lastClose > bb.upper) {
        // Price breaks above upper band - strong bullish momentum
        bbExtraKey = "analysis.nearUpperBand";
        bbSignal = "bullish";
      } else if (lastClose < bb.lower) {
        // Price breaks below lower band - strong bearish momentum
        bbExtraKey = "analysis.nearLowerBand";
        bbSignal = "bearish";
      } else if (pricePos > 90) {
        // Price near upper band - overbought, expect pullback (mean reversion)
        bbExtraKey = "analysis.nearUpperBand";
        bbSignal = "bearish";
      } else if (pricePos < 10) {
        // Price near lower band - oversold, expect bounce (mean reversion)
        bbExtraKey = "analysis.nearLowerBand";
        bbSignal = "bullish";
      } else if (bb.width < 5) {
        // Band narrowing - volatility compression, potential breakout
        bbExtraKey = "analysis.bandNarrowing";
        bbSignal = isAboveMiddle ? "bullish" : "bearish";
      } else {
        // Price in middle range
        bbSignal = isAboveMiddle ? "bullish" : "bearish";
      }
      
      results.push({
        key: "bollinger",
        titleKey: "analysis.bollinger",
        descKey: "analysis.bollingerDesc",
        descParams: { upper: bb.upper.toFixed(2), middle: bb.middle.toFixed(2), lower: bb.lower.toFixed(2), width: bb.width.toFixed(2) },
        signal: bbSignal,
        confidence: lastClose > bb.upper || lastClose < bb.lower ? 80 : (pricePos > 80 || pricePos < 20 ? 70 : 40),
        extraKey: bbExtraKey,
      });
    }

    // 7. OBV
    const obv = calculateOBV(closes, volumes);
    const obvExtraKey = obv.trend === "rising" ? "analysis.obvRising" : obv.trend === "falling" ? "analysis.obvFalling" : undefined;
    results.push({
      key: "obv",
      titleKey: "analysis.obv",
      descKey: "analysis.obvDesc",
      descParams: { value: (obv.value / 100000000).toFixed(2) + "B", trend: t(`analysis.${obv.trend === "rising" ? "uptrend" : obv.trend === "falling" ? "downtrend" : "sideways"}`) },
      signal: obv.trend === "rising" ? "bullish" : obv.trend === "falling" ? "bearish" : "neutral",
      confidence: obv.trend !== "neutral" ? 60 : 30,
      extraKey: obvExtraKey,
    });

    // 8. ATR
    const atr = calculateATR(highs, lows, closes, klParams.atrPeriod);
    if (atr !== null) {
      const volatility = (atr / lastClose) * 100;
      const atrExtraKey = volatility > 3 ? "analysis.highVolatility" : volatility < 1 ? "analysis.lowVolatility" : undefined;
      results.push({
        key: "atr",
        titleKey: "analysis.atr",
        descKey: "analysis.atrDesc",
        descParams: { value: atr.toFixed(2), volatility: volatility.toFixed(2) },
        signal: "neutral",
        confidence: 50,
        extraKey: atrExtraKey,
      });
    }

    // 9. Williams %R
    const willR = calculateWilliamsR(highs, lows, closes, 14);
    if (willR !== null) {
      const willExtraKey = willR > -20 ? "analysis.willOverbought" : willR < -80 ? "analysis.willOversold" : undefined;
      results.push({
        key: "williamsR",
        titleKey: "analysis.williamsR",
        descKey: "analysis.williamsRDesc",
        descParams: { value: willR.toFixed(2) },
        signal: willR > -20 ? "bearish" : willR < -80 ? "bullish" : "neutral",
        confidence: willR > -20 || willR < -80 ? 70 : 40,
        extraKey: willExtraKey,
      });
    }

    // 10. Support/Resistance Analysis
    const supportResistance = calculateSupportResistance(highs, lows, closes, 20);
    const srExtraKey = supportResistance.position > 80 ? "analysis.nearResistance" :
                      supportResistance.position < 20 ? "analysis.nearSupport" : "analysis.middleRange";
    
    results.push({
      key: "supportResistance",
      titleKey: "analysis.supportResistance",
      descKey: "analysis.supportResistanceDesc",
      descParams: {
        support: supportResistance.support.toFixed(2),
        resistance: supportResistance.resistance.toFixed(2),
        position: supportResistance.position.toFixed(1)
      },
      signal: supportResistance.position < 30 ? "bullish" : supportResistance.position > 70 ? "bearish" : "neutral",
      confidence: supportResistance.position < 20 || supportResistance.position > 80 ? 70 : 40,
      extraKey: srExtraKey,
    });

    // 11. Chip Distribution Analysis
    const chipData = calculateChipDistribution(klineData, 60, 0.95);
    if (chipData) {
      const chipSignal: "bullish" | "bearish" | "neutral" = 
        chipData.profitRatio > 70 ? "bullish" : 
        chipData.profitRatio < 30 ? "bearish" : "neutral";
      
      const chipExtraKey = chipData.profitRatio > 70 ? "analysis.chipMostlyProfit" :
                          chipData.profitRatio < 30 ? "analysis.chipMostlyLoss" :
                          chipData.concentration > 60 ? "analysis.chipConcentrated" :
                          "analysis.chipScattered";
      
      const peakInfo = chipData.mainPeaks.length > 0 
        ? chipData.mainPeaks.map(p => `${p.price.toFixed(2)}`).join(", ")
        : "N/A";
      
      results.push({
        key: "chipDistribution",
        titleKey: "analysis.chipDistribution",
        descKey: "analysis.chipDistributionDesc",
        descParams: {
          avgCost: chipData.avgCost.toFixed(2),
          profitRatio: chipData.profitRatio.toFixed(1),
          concentration: chipData.concentration.toFixed(1),
          peaks: peakInfo,
        },
        signal: chipSignal,
        confidence: Math.abs(chipData.profitRatio - 50) * 2,
        extraKey: chipExtraKey,
      });
    }

    return results;
  }, [klineData, klParams, t]);

  const currentResults = analysisType === "timeseries" ? timeSeriesResults : klineResults;

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "bullish": return "#2ecc71";
      case "bearish": return "#e74c3c";
      default: return "#f39c12";
    }
  };

  // Chart Options
  const chartOption = useMemo(() => {
    const data = analysisType === "timeseries" ? timeSeriesData : klineData;
    if (!data || data.length === 0) return {};

    const dates = data.map(d => d.date.includes(" ") ? d.date.split(" ")[1] : d.date.split(" ")[0]);
    const closes = data.map(d => d.close);
    const volumes = data.map(d => d.volume);

    if (analysisType === "timeseries") {
      const ma = closes.map((_, i) => i < tsParams.maPeriod - 1 ? null : calculateMA(closes.slice(0, i + 1), tsParams.maPeriod));
      return {
        backgroundColor: "transparent",
        grid: [{ left: "8%", right: "3%", top: "8%", height: "55%" }, { left: "8%", right: "3%", top: "70%", height: "25%" }],
        xAxis: [
          { type: "category", data: dates, gridIndex: 0, axisLabel: { fontSize: 9, color: "#858585" } },
          { type: "category", data: dates, gridIndex: 1, axisLabel: { show: false } },
        ],
        yAxis: [
          { type: "value", gridIndex: 0, scale: true, axisLabel: { fontSize: 9, color: "#858585" } },
          { type: "value", gridIndex: 1, scale: true, axisLabel: { fontSize: 9, color: "#858585" } },
        ],
        series: [
          { name: t("stock.price"), type: "line", data: closes, symbol: "none", lineStyle: { color: "#007acc", width: 1.5 } },
          { name: `MA${tsParams.maPeriod}`, type: "line", data: ma, symbol: "none", lineStyle: { color: "#f39c12", width: 1, type: "dashed" } },
          { name: t("stock.volume"), type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: volumes, itemStyle: { color: "#3498db" } },
        ],
        tooltip: { trigger: "axis", backgroundColor: "rgba(37, 37, 38, 0.95)", textStyle: { color: "#ccc", fontSize: 10 } },
      };
    } else {
      // K-line chart with more indicators
      const ma5 = closes.map((_, i) => i < 4 ? null : calculateMA(closes.slice(0, i + 1), 5));
      const ma10 = closes.map((_, i) => i < 9 ? null : calculateMA(closes.slice(0, i + 1), 10));
      const ma20 = closes.map((_, i) => i < 19 ? null : calculateMA(closes.slice(0, i + 1), 20));
      
      return {
        backgroundColor: "transparent",
        grid: [{ left: "8%", right: "3%", top: "8%", height: "55%" }, { left: "8%", right: "3%", top: "70%", height: "25%" }],
        xAxis: [
          { 
            type: "category", 
            data: dates, 
            gridIndex: 0, 
            axisLabel: { fontSize: 9, color: "#858585" },
            splitLine: { show: false },
          },
          { 
            type: "category", 
            data: dates, 
            gridIndex: 1, 
            axisLabel: { fontSize: 9, color: "#858585" },
            splitLine: { show: false },
          },
        ],
        yAxis: [
          { 
            type: "value", 
            gridIndex: 0, 
            scale: true, 
            axisLabel: { fontSize: 9, color: "#858585" },
            splitLine: {
              show: true,
              lineStyle: {
                color: "rgba(133, 133, 133, 0.15)",
                type: "dashed",
                width: 1,
              },
            },
          },
          { 
            type: "value", 
            gridIndex: 1, 
            scale: true, 
            axisLabel: { fontSize: 9, color: "#858585" },
            splitLine: {
              show: true,
              lineStyle: {
                color: "rgba(133, 133, 133, 0.15)",
                type: "dashed",
                width: 1,
              },
            },
          },
        ],
        series: [
          { name: t("stock.price"), type: "line", data: closes, symbol: "none", lineStyle: { color: "#007acc", width: 1.5 } },
          { name: "MA5", type: "line", data: ma5, symbol: "none", lineStyle: { color: "#ffff00", width: 1 } },
          { name: "MA10", type: "line", data: ma10, symbol: "none", lineStyle: { color: "#00ffff", width: 1 } },
          { name: "MA20", type: "line", data: ma20, symbol: "none", lineStyle: { color: "#ff00ff", width: 1 } },
          { name: t("stock.volume"), type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: volumes.map((v, i) => ({ value: v, itemStyle: { color: closes[i] >= (closes[i-1] || closes[i]) ? "#2ecc71" : "#e74c3c" } })) },
        ],
        tooltip: { trigger: "axis", backgroundColor: "rgba(37, 37, 38, 0.95)", textStyle: { color: "#ccc", fontSize: 10 } },
        legend: { data: [t("stock.price"), "MA5", "MA10", "MA20"], textStyle: { color: "#858585", fontSize: 8 }, top: 0 },
      };
    }
  }, [analysisType, timeSeriesData, klineData, tsParams, t]);

  useEffect(() => {
    let resizeTimer: number | null = null;
    const handleResize = () => {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      resizeTimer = setTimeout(() => {
        if (chartRef.current) {
          try {
            const instance = chartRef.current.getEchartsInstance();
            if (instance && !instance.isDisposed()) {
              instance.resize();
            }
          } catch (error) {
            // Ignore errors during resize
          }
        }
      }, 100);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div className="stock-analysis">
      <div className="analysis-columns">
        {/* Left Column: Parameters */}
        <div className="analysis-column params-column">
          <div className="column-header">{t("analysis.params")}</div>
          <div className="params-content">
            {analysisType === "timeseries" ? (
              <>
                <div className="param-section">
                  <label className="param-section-label">MA</label>
                  <div className="param-inputs">
                    <div className="param-item">
                      <span className="param-item-label">Period</span>
                      <input 
                        type="number" 
                        value={tsParams.maPeriod} 
                        onChange={(e) => setTsParams({ ...tsParams, maPeriod: parseInt(e.target.value) || 5 })} 
                        min="2" 
                        max="30" 
                      />
                    </div>
                  </div>
                </div>
                <div className="param-section">
                  <label className="param-section-label">{t("stock.volume")}</label>
                  <div className="param-inputs">
                    <div className="param-item">
                      <span className="param-item-label">Multiplier</span>
                      <input 
                        type="number" 
                        value={tsParams.volumeMultiplier} 
                        onChange={(e) => setTsParams({ ...tsParams, volumeMultiplier: parseFloat(e.target.value) || 2 })} 
                        min="1" 
                        max="5" 
                        step="0.5" 
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="param-section">
                  <label className="param-section-label">MACD</label>
                  <div className="param-inputs">
                    <div className="param-item">
                      <span className="param-item-label">Fast</span>
                      <input 
                        type="number" 
                        value={klParams.macdFast} 
                        onChange={(e) => setKlParams({ ...klParams, macdFast: parseInt(e.target.value) || 12 })} 
                        min="5" 
                        max="20" 
                      />
                    </div>
                    <div className="param-item">
                      <span className="param-item-label">Slow</span>
                      <input 
                        type="number" 
                        value={klParams.macdSlow} 
                        onChange={(e) => setKlParams({ ...klParams, macdSlow: parseInt(e.target.value) || 26 })} 
                        min="15" 
                        max="40" 
                      />
                    </div>
                    <div className="param-item">
                      <span className="param-item-label">Signal</span>
                      <input 
                        type="number" 
                        value={klParams.macdSignal} 
                        onChange={(e) => setKlParams({ ...klParams, macdSignal: parseInt(e.target.value) || 9 })} 
                        min="5" 
                        max="15" 
                      />
                    </div>
                  </div>
                </div>
                <div className="param-section">
                  <label className="param-section-label">RSI</label>
                  <div className="param-inputs">
                    <div className="param-item">
                      <span className="param-item-label">Period</span>
                      <input 
                        type="number" 
                        value={klParams.rsiPeriod} 
                        onChange={(e) => setKlParams({ ...klParams, rsiPeriod: parseInt(e.target.value) || 14 })} 
                        min="5" 
                        max="30" 
                      />
                    </div>
                  </div>
                </div>
                <div className="param-section">
                  <label className="param-section-label">KDJ</label>
                  <div className="param-inputs">
                    <div className="param-item">
                      <span className="param-item-label">Period</span>
                      <input 
                        type="number" 
                        value={klParams.kdjPeriod} 
                        onChange={(e) => setKlParams({ ...klParams, kdjPeriod: parseInt(e.target.value) || 9 })} 
                        min="5" 
                        max="20" 
                      />
                    </div>
                  </div>
                </div>
                <div className="param-section">
                  <label className="param-section-label">Bollinger</label>
                  <div className="param-inputs">
                    <div className="param-item">
                      <span className="param-item-label">Period</span>
                      <input 
                        type="number" 
                        value={klParams.bbPeriod} 
                        onChange={(e) => setKlParams({ ...klParams, bbPeriod: parseInt(e.target.value) || 20 })} 
                        min="10" 
                        max="30" 
                      />
                    </div>
                  </div>
                </div>
                <div className="param-section">
                  <label className="param-section-label">ATR</label>
                  <div className="param-inputs">
                    <div className="param-item">
                      <span className="param-item-label">Period</span>
                      <input 
                        type="number" 
                        value={klParams.atrPeriod} 
                        onChange={(e) => setKlParams({ ...klParams, atrPeriod: parseInt(e.target.value) || 14 })} 
                        min="5" 
                        max="30" 
                      />
                    </div>
                  </div>
                </div>
                <div className="param-section">
                  <label className="param-section-label">{t("analysis.trend")}</label>
                  <div className="param-inputs">
                    <div className="param-item">
                      <span className="param-item-label">Days</span>
                      <input 
                        type="number" 
                        value={klParams.trendDays} 
                        onChange={(e) => setKlParams({ ...klParams, trendDays: parseInt(e.target.value) || 20 })} 
                        min="5" 
                        max="60" 
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Column Divider */}
        <div className="column-divider" />

        {/* Middle Column: Results (40% fixed) */}
        <div className="analysis-column results-column">
          <div className="column-header">{t("analysis.results")}</div>
          <div className="results-content">
            {currentResults.length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <div className="results-list">
                {currentResults.map((result) => (
                  <div key={result.key} className="result-card">
                    <div className="result-header">
                      <span className="result-title">{t(result.titleKey)}</span>
                      <span className="result-signal" style={{ backgroundColor: getSignalColor(result.signal) }}>
                        {t(`analysis.${result.signal}`)}
                      </span>
                    </div>
                    <div className="result-desc">
                      {(() => {
                        let desc = t(result.descKey);
                        if (result.descParams) {
                          Object.keys(result.descParams).forEach(key => {
                            desc = desc.replace(`{${key}}`, String(result.descParams[key]));
                          });
                        }
                        return desc;
                      })()}
                    </div>
                    {result.extraKey && (
                      <div className="result-extra">{t(result.extraKey)}</div>
                    )}
                    <div className="confidence-bar">
                      <span className="confidence-text">{t("analysis.confidence")}: {result.confidence.toFixed(0)}%</span>
                      <div className="confidence-track">
                        <div className="confidence-fill" style={{ width: `${result.confidence}%`, backgroundColor: getSignalColor(result.signal) }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Column Divider */}
        <div className="column-divider" />

        {/* Right Column: Chart */}
        <div className="analysis-column chart-column">
          <div className="column-header">
            <span>{t("analysis.chart")}</span>
          </div>
          <div className="chart-content">
            {Object.keys(chartOption).length > 0 ? (
              <>
                <button
                  className="chart-zoom-button-overlay"
                  onClick={() => setIsChartDialogOpen(true)}
                  title={t("chart.zoom")}
                >
                  ZO
                </button>
                <ReactECharts ref={chartRef} option={chartOption} style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
              </>
            ) : (
              <div className="no-data">{t("analysis.noData")}</div>
            )}
          </div>
        </div>
      </div>
      <ChartDialog
        isOpen={isChartDialogOpen}
        onClose={() => setIsChartDialogOpen(false)}
        title={`${t("analysis.timeSeries")} - ${t("chart.title")}`}
        chartOption={chartOption}
      />
    </div>
  );
};

export default StockAnalysis;
