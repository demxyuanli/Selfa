// Chip Distribution (Cost Distribution) Calculation

import { StockData } from "./technicalIndicators";

export interface ChipDistributionResult {
  priceLevels: number[];
  chipAmounts: number[];
  avgCost: number;
  profitRatio: number;
  concentration: number;
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

// Calculate Chip Distribution (Cost Distribution)
import { getChipDistributionParams } from "./settings";

export function calculateChipDistribution(
  data: StockData[],
  priceBins?: number,
  decayFactor?: number
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

  // Calculate concentration (A股标准：数值越小越集中)
  const meanChip = totalChips / bins;
  let variance = 0;
  for (let i = 0; i < bins; i++) {
    variance += Math.pow(chipDistribution[i] - meanChip, 2);
  }
  const stdDev = Math.sqrt(variance / bins);
  const concentration = meanChip > 0 ? (stdDev / meanChip) * 100 : 100;

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
  // Sort by amount and take top 3
  mainPeaks.sort((a, b) => b.amount - a.amount);
  const topPeaks = mainPeaks.slice(0, 3);

  // Analyze peak pattern (单峰/多峰)
  const peakCount = topPeaks.length;
  const isSinglePeak = peakCount === 1;
  const isMultiPeak = peakCount >= 2;
  
  // Determine position (低位/中位/高位)
  const priceRangeValue = maxPrice - minPrice;
  const pricePosition = priceRangeValue > 0 ? ((currentPrice - minPrice) / priceRangeValue) * 100 : 50;
  let position: "low" | "middle" | "high" = "middle";
  if (pricePosition < 30) position = "low";
  else if (pricePosition > 70) position = "high";
  
  // Analyze peak pattern type
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

  return {
    priceLevels,
    chipAmounts: chipDistribution,
    avgCost,
    profitRatio,
    concentration: Math.max(0, concentration),
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
