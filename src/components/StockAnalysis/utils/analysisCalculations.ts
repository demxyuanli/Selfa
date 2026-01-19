import { StockData, AnalysisResult, TimeSeriesParams, KLineParams } from "../types";
import { calculateMA, calculateMACD, calculateRSI, calculateKDJ, calculateBollingerBands, calculateOBV, calculateATR, calculateWilliamsR, calculateSupportResistance, calculateChipDistribution } from "./indicators";
import { analyzeMACDSignal, analyzeMACDRSISignal } from "./signalAnalysis";

export function calculateTimeSeriesResults(timeSeriesData: StockData[], tsParams: TimeSeriesParams): AnalysisResult[] {
  if (!timeSeriesData || timeSeriesData.length < 2) return [];
  
  const results: AnalysisResult[] = [];
  const prices = timeSeriesData.map(d => d.close);
  const volumes = timeSeriesData.map(d => d.volume);
  
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
}

export function calculateKLineResults(klineData: StockData[], klParams: KLineParams, t: (key: string) => string): AnalysisResult[] {
  if (!klineData || klineData.length < 20) return [];
  
  const results: AnalysisResult[] = [];
  const closes = klineData.map(d => d.close);
  const highs = klineData.map(d => d.high);
  const lows = klineData.map(d => d.low);
  const volumes = klineData.map(d => d.volume);
  const lastClose = closes[closes.length - 1];
  
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

  const macd = calculateMACD(closes, klParams.macdFast, klParams.macdSlow, klParams.macdSignal);
  if (macd) {
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

  const rsi = calculateRSI(closes, klParams.rsiPeriod);

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

  if (rsi !== null) {
    const rsiExtraKey = rsi >= 70 ? "analysis.rsiOverbought" : rsi <= 30 ? "analysis.rsiOversold" : undefined;
    results.push({
      key: "rsi",
      titleKey: "analysis.rsi",
      descKey: "analysis.rsiDesc",
      descParams: { value: rsi.toFixed(2) },
      signal: rsi >= 70 ? "bearish" : rsi <= 30 ? "bullish" : "neutral",
      confidence: rsi >= 70 || rsi <= 30 ? 80 : 40,
      extraKey: rsiExtraKey,
    });
  }

  const kdj = calculateKDJ(highs, lows, closes, klParams.kdjPeriod);
  if (kdj) {
    const kdjExtraKey = kdj.k >= 80 && kdj.d >= 80 ? "analysis.kdjOverbought" :
                       kdj.k <= 20 && kdj.d <= 20 ? "analysis.kdjOversold" : undefined;
    results.push({
      key: "kdj",
      titleKey: "analysis.kdj",
      descKey: "analysis.kdjDesc",
      descParams: { k: kdj.k.toFixed(2), d: kdj.d.toFixed(2), j: kdj.j.toFixed(2) },
      signal: kdj.k >= 80 && kdj.d >= 80 ? "bearish" : kdj.k <= 20 && kdj.d <= 20 ? "bullish" : "neutral",
      confidence: (kdj.k >= 80 && kdj.d >= 80) || (kdj.k <= 20 && kdj.d <= 20) ? 75 : 40,
      extraKey: kdjExtraKey,
    });
  }

  const bb = calculateBollingerBands(closes, klParams.bbPeriod, 2);
  if (bb) {
    const bbExtraKey = lastClose >= bb.upper ? "analysis.priceAboveBBUpper" :
                      lastClose <= bb.lower ? "analysis.priceBelowBBLower" :
                      bb.width > 5 ? "analysis.bbWide" : "analysis.bbNarrow";
    results.push({
      key: "bollingerBands",
      titleKey: "analysis.bollingerBands",
      descKey: "analysis.bollingerBandsDesc",
      descParams: {
        upper: bb.upper.toFixed(2),
        middle: bb.middle.toFixed(2),
        lower: bb.lower.toFixed(2),
        width: bb.width.toFixed(2)
      },
      signal: lastClose >= bb.upper ? "bearish" : lastClose <= bb.lower ? "bullish" : "neutral",
      confidence: lastClose >= bb.upper || lastClose <= bb.lower ? 70 : 40,
      extraKey: bbExtraKey,
    });
  }

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

  const chipData = calculateChipDistribution(klineData);
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
}
