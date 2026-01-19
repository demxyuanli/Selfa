import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import { getAnalysisParams, getTechnicalIndicatorParams } from "../utils/settings";
import Icon from "./Icon";
import "./AnalysisPanel.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface AnalysisPanelProps {
  visible: boolean;
  onClose: () => void;
  timeSeriesData: StockData[];
  klineData: StockData[];
  stockSymbol: string;
  stockName: string;
}

type AnalysisType = "timeseries" | "kline";

interface TimeSeriesParams {
  priceChangeThreshold: number;
  volumeMultiplier: number;
  maPeriod: number;
}

interface KLineParams {
  maPeriods: number[];
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  rsiPeriod: number;
  kdjPeriod: number;
  bbPeriod: number;
  atrPeriod: number;
  trendDays: number;
}

interface AnalysisResult {
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
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calculateMACD(data: number[], fast: number, slow: number, signal: number) {
  if (data.length < slow) return [];
  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = calculateEMA(macdLine.slice(slow - 1), signal);
  
  const result = [];
  for (let i = 0; i < signalLine.length; i++) {
    const idx = slow - 1 + i;
    result.push({
      macd: macdLine[idx],
      signal: signalLine[i],
      histogram: macdLine[idx] - signalLine[i],
    });
  }
  return result;
}

function calculateRSI(data: number[], period: number): number | null {
  if (data.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = data.length - period; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

function calculateKDJ(highs: number[], lows: number[], closes: number[], period = 9) {
  if (closes.length < period) return null;
  
  const n = closes.length;
  let rsv = 0, k = 50, d = 50;
  let prevK = 50;
  
  for (let i = n - period; i < n; i++) {
    const periodHighs = highs.slice(Math.max(0, i - period + 1), i + 1);
    const periodLows = lows.slice(Math.max(0, i - period + 1), i + 1);
    const hh = Math.max(...periodHighs);
    const ll = Math.min(...periodLows);
    rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
    prevK = k;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
  }
  
  const j = 3 * k - 2 * d;
  return { k, d, j, prevK };
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

function calculateOBV(closes: number[], volumes: number[]): { value: number; trend: string } {
  if (closes.length < 2) return { value: 0, trend: "neutral" };
  
  let obv = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
  }
  
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
  
  let atr = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    atr += tr;
  }
  return atr / period;
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

function calculateRSIArray(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(period).fill(null);
  for (let i = period; i < data.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const change = data[j] - data[j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const rs = losses === 0 ? 100 : gains / losses;
    result.push(100 - (100 / (1 + rs)));
  }
  return result;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  visible,
  onClose,
  timeSeriesData,
  klineData,
  stockSymbol,
  stockName,
}) => {
  const { t } = useTranslation();
  const [analysisType, setAnalysisType] = useState<AnalysisType>("timeseries");
  
  const analysisDefaults = getAnalysisParams();
  const indicatorDefaults = getTechnicalIndicatorParams();
  
  const [tsParams, setTsParams] = useState<TimeSeriesParams>({
    priceChangeThreshold: analysisDefaults.priceChangeThreshold,
    volumeMultiplier: analysisDefaults.volumeMultiplier,
    maPeriod: analysisDefaults.maPeriod,
  });

  const [klParams, setKlParams] = useState<KLineParams>({
    maPeriods: indicatorDefaults.maPeriods,
    macdFast: indicatorDefaults.macdFast,
    macdSlow: indicatorDefaults.macdSlow,
    macdSignal: indicatorDefaults.macdSignal,
    rsiPeriod: indicatorDefaults.rsiPeriod,
    kdjPeriod: indicatorDefaults.kdjPeriod,
    bbPeriod: indicatorDefaults.bbPeriod,
    atrPeriod: indicatorDefaults.atrPeriod,
    trendDays: analysisDefaults.trendDays,
  });

  // ============= Time Series Analysis =============
  const timeSeriesAnalysis = useMemo((): AnalysisResult[] => {
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
      titleKey: "analysis.priceMovement",
      descKey: "analysis.priceMovementDesc",
      descParams: {
        price: lastPrice.toFixed(2),
        change: (priceChange >= 0 ? "+" : "") + priceChange.toFixed(2),
        high: maxPrice.toFixed(2),
        low: minPrice.toFixed(2),
        amplitude: amplitude.toFixed(2),
      },
      signal: priceChange > tsParams.priceChangeThreshold ? "bullish" : 
              priceChange < -tsParams.priceChangeThreshold ? "bearish" : "neutral",
      confidence: Math.min(Math.abs(priceChange) / tsParams.priceChangeThreshold * 50, 100),
    });

    // 2. Volume Analysis
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVolumes = volumes.slice(-10);
    const recentAvgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const volumeRatio = recentAvgVolume / avgVolume;
    
    results.push({
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
    const recentPrices = prices.slice(-maPeriod);
    const ma = recentPrices.reduce((a, b) => a + b, 0) / maPeriod;
    const priceVsMa = ((lastPrice - ma) / ma) * 100;
    
    results.push({
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

  // ============= K-Line Analysis =============
  const klineAnalysis = useMemo((): AnalysisResult[] => {
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
    const trendStart = trendPrices[0];
    const trendEnd = trendPrices[trendPrices.length - 1];
    const trendChange = ((trendEnd - trendStart) / trendStart) * 100;
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < trendPrices.length; i++) {
      sumX += i; sumY += trendPrices[i]; sumXY += i * trendPrices[i]; sumX2 += i * i;
    }
    const n = trendPrices.length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgPrice = sumY / n;
    const normalizedSlope = (slope / avgPrice) * 100;
    
    const trendKey = normalizedSlope > 0.1 ? "analysis.uptrend" : normalizedSlope < -0.1 ? "analysis.downtrend" : "analysis.sideways";
    results.push({
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
      titleKey: "analysis.maSystem",
      descKey: "analysis.maSystemDesc",
      descParams: { ma5: ma5.toFixed(2), ma10: ma10.toFixed(2), ma20: ma20.toFixed(2), score: maBullishScore },
      signal: maBullishScore >= 4 ? "bullish" : maBullishScore <= 1 ? "bearish" : "neutral",
      confidence: Math.abs(maBullishScore - 2.5) * 40,
      extraKey: maExtraKey,
    });

    // 3. MACD
    const macd = calculateMACD(closes, klParams.macdFast, klParams.macdSlow, klParams.macdSignal);
    if (macd.length > 0) {
      const lastMacd = macd[macd.length - 1];
      const prevMacd = macd.length > 1 ? macd[macd.length - 2] : lastMacd;
      const histogram = lastMacd.histogram;
      const prevHistogram = prevMacd.histogram;
      
      const macdExtraKey = histogram > 0 && histogram > prevHistogram ? "analysis.bullishMomentumUp" :
                          histogram < 0 && histogram < prevHistogram ? "analysis.bearishMomentumUp" :
                          histogram > 0 ? "analysis.bullishWeakening" : "analysis.bearishWeakening";
      results.push({
        titleKey: "analysis.macdIndicator",
        descKey: "analysis.macdDesc",
        descParams: { macd: lastMacd.macd.toFixed(3), signal: lastMacd.signal.toFixed(3), histogram: histogram.toFixed(3) },
        signal: histogram > 0 ? "bullish" : "bearish",
        confidence: Math.min(Math.abs(histogram) * 1000, 100),
        extraKey: macdExtraKey,
      });
    }

    // 4. RSI
    const rsi = calculateRSI(closes, klParams.rsiPeriod);
    if (rsi !== null) {
      const rsiExtraKey = rsi > 70 ? "analysis.overbought" : rsi < 30 ? "analysis.oversold" : 
                          rsi > 50 ? "analysis.bullishZone" : "analysis.bearishZone";
      results.push({
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
      let bbExtraKey = "analysis.middleRange";
      let bbSignal: "bullish" | "bearish" | "neutral" = "neutral";
      if (pricePos > 90) { bbExtraKey = "analysis.nearUpperBand"; bbSignal = "bearish"; }
      else if (pricePos < 10) { bbExtraKey = "analysis.nearLowerBand"; bbSignal = "bullish"; }
      else if (bb.width < 5) { bbExtraKey = "analysis.bandNarrowing"; }
      
      results.push({
        titleKey: "analysis.bollinger",
        descKey: "analysis.bollingerDesc",
        descParams: { upper: bb.upper.toFixed(2), middle: bb.middle.toFixed(2), lower: bb.lower.toFixed(2), width: bb.width.toFixed(2) },
        signal: bbSignal,
        confidence: pricePos > 80 || pricePos < 20 ? 70 : 40,
        extraKey: bbExtraKey,
      });
    }

    // 7. OBV
    const obv = calculateOBV(closes, volumes);
    const obvExtraKey = obv.trend === "rising" ? "analysis.obvRising" : obv.trend === "falling" ? "analysis.obvFalling" : undefined;
    results.push({
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
        titleKey: "analysis.williamsR",
        descKey: "analysis.williamsRDesc",
        descParams: { value: willR.toFixed(2) },
        signal: willR > -20 ? "bearish" : willR < -80 ? "bullish" : "neutral",
        confidence: willR > -20 || willR < -80 ? 70 : 40,
        extraKey: willExtraKey,
      });
    }

    // 10. Support/Resistance
    const recentLows = lows.slice(-20);
    const recentHighs = highs.slice(-20);
    const support = Math.min(...recentLows);
    const resistance = Math.max(...recentHighs);
    const pricePosition = ((lastClose - support) / (resistance - support)) * 100;
    const srExtraKey = pricePosition > 80 ? "analysis.nearResistance" : pricePosition < 20 ? "analysis.nearSupport" : "analysis.middleRange";
    
    results.push({
      titleKey: "analysis.supportResistance",
      descKey: "analysis.supportResistanceDesc",
      descParams: { support: support.toFixed(2), resistance: resistance.toFixed(2), position: pricePosition.toFixed(1) },
      signal: pricePosition < 30 ? "bullish" : pricePosition > 70 ? "bearish" : "neutral",
      confidence: pricePosition < 20 || pricePosition > 80 ? 70 : 40,
      extraKey: srExtraKey,
    });

    return results;
  }, [klineData, klParams, t]);

  // Chart options for Time Series
  const timeSeriesChartOption = useMemo(() => {
    if (!timeSeriesData || timeSeriesData.length === 0) return {};
    
    const times = timeSeriesData.map(d => d.date.includes(" ") ? d.date.split(" ")[1] : d.date);
    const prices = timeSeriesData.map(d => d.close);
    const volumes = timeSeriesData.map(d => d.volume);
    
    const maPeriod = tsParams.maPeriod;
    const maData: (number | null)[] = prices.map((_, i) => {
      if (i < maPeriod - 1) return null;
      const slice = prices.slice(i - maPeriod + 1, i + 1);
      return slice.reduce((a, b) => a + b, 0) / maPeriod;
    });

    return {
      backgroundColor: "#1e1e1e",
      grid: [
        { left: "8%", right: "3%", top: "8%", height: "50%" },
        { left: "8%", right: "3%", top: "65%", height: "25%" },
      ],
      xAxis: [
        { type: "category", data: times, gridIndex: 0, axisLabel: { fontSize: 9, color: "#858585" } },
        { type: "category", data: times, gridIndex: 1, axisLabel: { show: false } },
      ],
      yAxis: [
        { type: "value", gridIndex: 0, scale: true, axisLabel: { fontSize: 9, color: "#858585" } },
        { type: "value", gridIndex: 1, scale: true, axisLabel: { fontSize: 9, color: "#858585" } },
      ],
      series: [
        { name: t("stock.price"), type: "line", data: prices, smooth: false, symbol: "none", lineStyle: { color: "#007acc", width: 1 } },
        { name: `MA${maPeriod}`, type: "line", data: maData, smooth: true, symbol: "none", lineStyle: { color: "#f39c12", width: 1, type: "dashed" } },
        { name: t("stock.volume"), type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: volumes, itemStyle: { color: "#3498db" } },
      ],
      tooltip: { trigger: "axis", backgroundColor: "rgba(37, 37, 38, 0.95)", textStyle: { color: "#ccc", fontSize: 10 } },
      legend: { data: [t("stock.price"), `MA${maPeriod}`, t("stock.volume")], textStyle: { color: "#858585", fontSize: 9 }, top: 0 },
    };
  }, [timeSeriesData, tsParams.maPeriod, t]);

  // Chart options for K-Line
  const klineChartOption = useMemo(() => {
    if (!klineData || klineData.length === 0) return {};
    
    const dates = klineData.map(d => d.date.split(" ")[0]);
    const closes = klineData.map(d => d.close);
    
    const ma5 = closes.map((_, i) => i < 4 ? null : calculateMA(closes.slice(0, i + 1), 5));
    const ma10 = closes.map((_, i) => i < 9 ? null : calculateMA(closes.slice(0, i + 1), 10));
    const ma20 = closes.map((_, i) => i < 19 ? null : calculateMA(closes.slice(0, i + 1), 20));
    
    const macdData = calculateMACD(closes, klParams.macdFast, klParams.macdSlow, klParams.macdSignal);
    const macdLine: (number | null)[] = new Array(closes.length - macdData.length).fill(null);
    const signalLine: (number | null)[] = new Array(closes.length - macdData.length).fill(null);
    const histogram: (number | null)[] = new Array(closes.length - macdData.length).fill(null);
    macdData.forEach(d => {
      macdLine.push(d.macd);
      signalLine.push(d.signal);
      histogram.push(d.histogram);
    });

    return {
      backgroundColor: "#1e1e1e",
      grid: [
        { left: "8%", right: "3%", top: "8%", height: "45%" },
        { left: "8%", right: "3%", top: "58%", height: "18%" },
        { left: "8%", right: "3%", top: "80%", height: "15%" },
      ],
      xAxis: [
        { type: "category", data: dates, gridIndex: 0, axisLabel: { fontSize: 9, color: "#858585" } },
        { type: "category", data: dates, gridIndex: 1, axisLabel: { show: false } },
        { type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" } },
      ],
      yAxis: [
        { type: "value", gridIndex: 0, scale: true, axisLabel: { fontSize: 9, color: "#858585" } },
        { type: "value", gridIndex: 1, scale: true, axisLabel: { fontSize: 9, color: "#858585" } },
        { type: "value", gridIndex: 2, scale: true, axisLabel: { fontSize: 9, color: "#858585" } },
      ],
      series: [
        { name: t("stock.price"), type: "line", data: closes, smooth: false, symbol: "none", lineStyle: { color: "#007acc", width: 1.5 } },
        { name: "MA5", type: "line", data: ma5, smooth: true, symbol: "none", lineStyle: { color: "#ffff00", width: 1 } },
        { name: "MA10", type: "line", data: ma10, smooth: true, symbol: "none", lineStyle: { color: "#00ffff", width: 1 } },
        { name: "MA20", type: "line", data: ma20, smooth: true, symbol: "none", lineStyle: { color: "#ff00ff", width: 1 } },
        { name: "MACD", type: "line", xAxisIndex: 1, yAxisIndex: 1, data: macdLine, symbol: "none", lineStyle: { color: "#007acc", width: 1 } },
        { name: "Signal", type: "line", xAxisIndex: 1, yAxisIndex: 1, data: signalLine, symbol: "none", lineStyle: { color: "#f39c12", width: 1 } },
        { name: "Histogram", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: histogram.map(v => ({ value: v, itemStyle: { color: v && v > 0 ? "#2ecc71" : "#e74c3c" } })) },
        { name: "RSI", type: "line", xAxisIndex: 2, yAxisIndex: 2, data: calculateRSIArray(closes, klParams.rsiPeriod), symbol: "none", lineStyle: { color: "#9b59b6", width: 1 } },
      ],
      tooltip: { trigger: "axis", backgroundColor: "rgba(37, 37, 38, 0.95)", textStyle: { color: "#ccc", fontSize: 10 } },
      legend: { data: [t("stock.price"), "MA5", "MA10", "MA20"], textStyle: { color: "#858585", fontSize: 8 }, top: 0 },
    };
  }, [klineData, klParams, t]);

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "bullish": return "#2ecc71";
      case "bearish": return "#e74c3c";
      default: return "#f39c12";
    }
  };

  if (!visible) return null;

  const currentAnalysis = analysisType === "timeseries" ? timeSeriesAnalysis : klineAnalysis;
  const currentChartOption = analysisType === "timeseries" ? timeSeriesChartOption : klineChartOption;

  return (
    <div className="analysis-panel-overlay">
      <div className="analysis-panel">
        <div className="analysis-header">
          <div className="analysis-title">
            <span>{t("analysis.title")} - {stockSymbol} {stockName}</span>
          </div>
          <button className="close-btn" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="analysis-tabs">
          <button
            className={`tab-btn ${analysisType === "timeseries" ? "active" : ""}`}
            onClick={() => setAnalysisType("timeseries")}
          >
            {t("analysis.timeSeries")}
          </button>
          <button
            className={`tab-btn ${analysisType === "kline" ? "active" : ""}`}
            onClick={() => setAnalysisType("kline")}
          >
            {t("analysis.klineAnalysis")}
          </button>
        </div>

        <div className="analysis-content">
          <div className="params-section">
            <div className="section-title">{t("analysis.params")}</div>
            {analysisType === "timeseries" ? (
              <div className="params-grid">
                <div className="param-item">
                  <label>{t("stock.price")} (%)</label>
                  <input
                    type="number"
                    value={tsParams.priceChangeThreshold}
                    onChange={(e) => setTsParams({ ...tsParams, priceChangeThreshold: parseFloat(e.target.value) || 2 })}
                    step="0.5" min="0.5" max="10"
                  />
                </div>
                <div className="param-item">
                  <label>{t("stock.volume")}</label>
                  <input
                    type="number"
                    value={tsParams.volumeMultiplier}
                    onChange={(e) => setTsParams({ ...tsParams, volumeMultiplier: parseFloat(e.target.value) || 2 })}
                    step="0.5" min="1" max="5"
                  />
                </div>
                <div className="param-item">
                  <label>MA</label>
                  <input
                    type="number"
                    value={tsParams.maPeriod}
                    onChange={(e) => setTsParams({ ...tsParams, maPeriod: parseInt(e.target.value) || 5 })}
                    step="1" min="2" max="30"
                  />
                </div>
              </div>
            ) : (
              <div className="params-grid">
                <div className="param-item">
                  <label>MACD Fast</label>
                  <input type="number" value={klParams.macdFast} onChange={(e) => setKlParams({ ...klParams, macdFast: parseInt(e.target.value) || 12 })} min="5" max="20" />
                </div>
                <div className="param-item">
                  <label>MACD Slow</label>
                  <input type="number" value={klParams.macdSlow} onChange={(e) => setKlParams({ ...klParams, macdSlow: parseInt(e.target.value) || 26 })} min="15" max="40" />
                </div>
                <div className="param-item">
                  <label>MACD Signal</label>
                  <input type="number" value={klParams.macdSignal} onChange={(e) => setKlParams({ ...klParams, macdSignal: parseInt(e.target.value) || 9 })} min="5" max="15" />
                </div>
                <div className="param-item">
                  <label>RSI</label>
                  <input type="number" value={klParams.rsiPeriod} onChange={(e) => setKlParams({ ...klParams, rsiPeriod: parseInt(e.target.value) || 14 })} min="5" max="30" />
                </div>
                <div className="param-item">
                  <label>KDJ</label>
                  <input type="number" value={klParams.kdjPeriod} onChange={(e) => setKlParams({ ...klParams, kdjPeriod: parseInt(e.target.value) || 9 })} min="5" max="20" />
                </div>
                <div className="param-item">
                  <label>BB</label>
                  <input type="number" value={klParams.bbPeriod} onChange={(e) => setKlParams({ ...klParams, bbPeriod: parseInt(e.target.value) || 20 })} min="10" max="30" />
                </div>
                <div className="param-item">
                  <label>ATR</label>
                  <input type="number" value={klParams.atrPeriod} onChange={(e) => setKlParams({ ...klParams, atrPeriod: parseInt(e.target.value) || 14 })} min="5" max="30" />
                </div>
                <div className="param-item">
                  <label>{t("analysis.trend")}</label>
                  <input type="number" value={klParams.trendDays} onChange={(e) => setKlParams({ ...klParams, trendDays: parseInt(e.target.value) || 20 })} min="5" max="60" />
                </div>
              </div>
            )}
          </div>

          <div className="results-section">
            <div className="section-title">{t("analysis.results")}</div>
            {currentAnalysis.length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <div className="results-list">
                {currentAnalysis.map((result, index) => (
                  <div key={index} className="result-item">
                    <div className="result-header">
                      <span className="result-title">{t(result.titleKey)}</span>
                      <div className="result-signal" style={{ backgroundColor: getSignalColor(result.signal) }}>
                        {t(`analysis.${result.signal}`)}
                      </div>
                    </div>
                    <div className="result-description">{t(result.descKey, result.descParams)}</div>
                    {result.extraKey && <div className="result-extra">{t(result.extraKey)}</div>}
                    <div className="confidence-bar">
                      <div className="confidence-label">{t("analysis.confidence")}: {result.confidence.toFixed(0)}%</div>
                      <div className="confidence-track">
                        <div className="confidence-fill" style={{ width: `${result.confidence}%`, backgroundColor: getSignalColor(result.signal) }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="chart-section">
            <div className="section-title">{t("analysis.chart")}</div>
            {Object.keys(currentChartOption).length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <div className="chart-container">
                <ReactECharts option={currentChartOption} style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisPanel;
