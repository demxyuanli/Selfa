import { StockData } from "../types";
import { getChipDistributionParams } from "../../../utils/settings";

export function calculateMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calculateMACD(data: number[], fast = 12, slow = 26, signal = 9) {
  if (data.length < slow) return null;
  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLineRaw = calculateEMA(macdLine.slice(slow - 1), signal);
  
  const signalLine: (number | null)[] = new Array(slow - 1).fill(null);
  signalLineRaw.forEach((val) => {
    signalLine.push(val);
  });
  
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

export function calculateRSI(data: number[], period = 14): number | null {
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

export function calculateKDJ(highs: number[], lows: number[], closes: number[], period = 9) {
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

export function calculateBollingerBands(data: number[], period = 20, multiplier = 2) {
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

export function calculateChipDistribution(
  data: StockData[],
  priceBins?: number,
  decayFactor?: number
): {
  priceLevels: number[];
  chipAmounts: number[];
  avgCost: number;
  profitRatio: number;
  concentration: number;
  mainPeaks: Array<{ price: number; amount: number }>;
} | null {
  const defaults = getChipDistributionParams();
  const bins = priceBins ?? defaults.priceBins;
  const decay = decayFactor ?? defaults.decayFactor;
  if (data.length < 20) return null;

  const closes = data.map(d => d.close);
  const volumes = data.map(d => d.volume);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const currentPrice = closes[closes.length - 1];

  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const priceRange = maxPrice - minPrice;
  const binSize = priceRange / bins;

  const chipDistribution = new Array(bins).fill(0);
  const priceLevels: number[] = [];

  for (let i = 0; i < bins; i++) {
    priceLevels.push(minPrice + (i + 0.5) * binSize);
  }

  for (let day = 0; day < data.length; day++) {
    const dayVolume = volumes[day];
    const dayHigh = highs[day];
    const dayLow = lows[day];
    const dayClose = closes[day];
    
    const typicalPrice = (dayHigh + dayLow + dayClose * 2) / 4;
    
    for (let bin = 0; bin < bins; bin++) {
      const binPrice = priceLevels[bin];
      
      if (binPrice >= dayLow && binPrice <= dayHigh) {
        const distance = Math.abs(binPrice - typicalPrice);
        const maxDistance = Math.max(typicalPrice - dayLow, dayHigh - typicalPrice);
        const weight = maxDistance > 0 ? 1 - (distance / maxDistance) : 1;
        
        const ageFactor = Math.pow(decay, data.length - day - 1);
        chipDistribution[bin] += dayVolume * weight * ageFactor;
      }
    }
  }

  let totalChips = 0;
  let weightedPriceSum = 0;
  
  for (let i = 0; i < bins; i++) {
    totalChips += chipDistribution[i];
    weightedPriceSum += chipDistribution[i] * priceLevels[i];
  }

  const avgCost = totalChips > 0 ? weightedPriceSum / totalChips : currentPrice;

  let profitChips = 0;
  for (let i = 0; i < bins; i++) {
    if (priceLevels[i] < currentPrice) {
      profitChips += chipDistribution[i];
    }
  }
  const profitRatio = totalChips > 0 ? (profitChips / totalChips) * 100 : 50;

  const meanChip = totalChips / bins;
  let variance = 0;
  for (let i = 0; i < bins; i++) {
    variance += Math.pow(chipDistribution[i] - meanChip, 2);
  }
  const stdDev = Math.sqrt(variance / bins);
  const concentration = meanChip > 0 ? (1 - stdDev / meanChip) * 100 : 0;

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

  return {
    priceLevels,
    chipAmounts: chipDistribution,
    avgCost,
    profitRatio,
    concentration: Math.max(0, Math.min(100, concentration)),
    mainPeaks: topPeaks,
  };
}

export function calculateOBV(closes: number[], volumes: number[]): { value: number; trend: string } {
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

export function calculateATR(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

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

  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trueRanges[i];
  }
  atr /= period;

  for (let i = period; i < trueRanges.length; i++) {
    atr = ((atr * (period - 1)) + trueRanges[i]) / period;
  }

  return atr;
}

export function calculateWilliamsR(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (closes.length < period) return null;
  
  const periodHighs = highs.slice(-period);
  const periodLows = lows.slice(-period);
  const hh = Math.max(...periodHighs);
  const ll = Math.min(...periodLows);
  const close = closes[closes.length - 1];
  
  if (hh === ll) return -50;
  return ((hh - close) / (hh - ll)) * -100;
}

export function calculateSupportResistance(highs: number[], lows: number[], closes: number[], lookbackPeriod = 20) {
  const recentData = closes.slice(-lookbackPeriod);
  const recentHighs = highs.slice(-lookbackPeriod);
  const recentLows = lows.slice(-lookbackPeriod);

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

  let support = Math.min(...recentLows);
  let resistance = Math.max(...recentHighs);

  if (pivotLows.length > 0) {
    const recentPivotLows = pivotLows.slice(-3);
    support = Math.max(...recentPivotLows);
  }

  if (pivotHighs.length > 0) {
    const recentPivotHighs = pivotHighs.slice(-3);
    resistance = Math.min(...recentPivotHighs);
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
