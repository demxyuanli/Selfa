// Technical Indicators Calculation Utilities

export interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Calculate SMA (Simple Moving Average)
export function calculateSMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

// Calculate EMA (Exponential Moving Average)
export function calculateEMA(data: number[], period: number): (number | null)[] {
  if (data.length < period) return data.map(() => null);
  const k = 2 / (period + 1);
  const result: (number | null)[] = [data[0]];
  let ema = data[0];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

// Calculate Bollinger Bands
export function calculateBollingerBands(data: number[], period: number, multiplier: number) {
  const sma = calculateSMA(data, period);
  const result: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } = {
    upper: [],
    middle: sma,
    lower: [],
  };

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.upper.push(null);
      result.lower.push(null);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      result.upper.push(mean + multiplier * stdDev);
      result.lower.push(mean - multiplier * stdDev);
    }
  }
  return result;
}

// Calculate VWAP (Volume Weighted Average Price)
export function calculateVWAP(data: StockData[]): (number | null)[] {
  const result: (number | null)[] = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < data.length; i++) {
    const typicalPrice = (data[i].high + data[i].low + data[i].close) / 3;
    cumulativeTPV += typicalPrice * data[i].volume;
    cumulativeVolume += data[i].volume;
    result.push(cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : null);
  }
  return result;
}

// Calculate RSI using Wilder's smoothing method
export function calculateRSI(data: number[], period: number): (number | null)[] {
  if (data.length < period + 1) return data.map(() => null);
  const result: (number | null)[] = new Array(period).fill(null);

  // Calculate initial average gains and losses using simple average
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) gains += change;
    else losses -= change; // Note: losses are stored as positive values
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate RSI for the first valid period
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - (100 / (1 + rs)));

  // Calculate subsequent RSI values using Wilder's smoothing
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) {
      avgGain = ((avgGain * (period - 1)) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = ((avgLoss * (period - 1)) - change) / period;
    }

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - (100 / (1 + rs)));
  }

  return result;
}

// Calculate MACD
export function calculateMACD(data: number[], fast: number, slow: number, signal: number) {
  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);
  const macdLine: (number | null)[] = emaFast.map((f, i) =>
    f !== null && emaSlow[i] !== null ? f - emaSlow[i]! : null
  );

  // Calculate signal line directly from MACD line
  // Convert null values to 0 for EMA calculation, then restore nulls where MACD is null
  const macdForSignal = macdLine.map(v => v !== null ? v : 0);
  const signalLineRaw = calculateEMA(macdForSignal, signal);

  // Restore null values in signal line where MACD line is null
  const signalLine: (number | null)[] = signalLineRaw.map((s, i) =>
    macdLine[i] !== null ? s : null
  );

  // Calculate histogram
  const histogram: (number | null)[] = macdLine.map((m, i) => {
    const s = signalLine[i];
    return m !== null && s !== null ? m - s : null;
  });

  return {
    macdLine,
    signalLine,
    histogram,
    macd: macdLine[macdLine.length - 1] || 0,
    signal: signalLine[signalLine.length - 1] || 0,
    histogramValue: histogram[histogram.length - 1] || 0,
  };
}

// Calculate Stochastic RSI
export function calculateStochRSI(closes: number[], rsiPeriod: number, stochPeriod: number, kPeriod: number, dPeriod: number) {
  const rsiValues = calculateRSI(closes, rsiPeriod);
  const stochK: (number | null)[] = [];
  const stochD: (number | null)[] = [];

  // Calculate %K
  for (let i = 0; i < rsiValues.length; i++) {
    if (i < stochPeriod - 1) {
      stochK.push(null);
      continue;
    }

    // Get RSI values for the stochastic period
    const rsiSlice: number[] = [];
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      if (rsiValues[j] !== null) {
        rsiSlice.push(rsiValues[j]!);
      }
    }

    if (rsiSlice.length === stochPeriod) {
      const highestRSI = Math.max(...rsiSlice);
      const lowestRSI = Math.min(...rsiSlice);
      const currentRSI = rsiValues[i];

      if (currentRSI !== null && highestRSI !== lowestRSI) {
        const k = ((currentRSI - lowestRSI) / (highestRSI - lowestRSI)) * 100;
        stochK.push(k);
      } else {
        stochK.push(50); // Neutral value when range is zero
      }
    } else {
      stochK.push(null);
    }
  }

  // Calculate %D (SMA of %K)
  for (let i = 0; i < stochK.length; i++) {
    if (i < kPeriod + dPeriod - 2) {
      stochD.push(null);
      continue;
    }

    let sumK = 0;
    let count = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      if (stochK[j] !== null) {
        sumK += stochK[j]!;
        count++;
      }
    }

    if (count === dPeriod) {
      stochD.push(sumK / count);
    } else {
      stochD.push(null);
    }
  }

  return {
    k: stochK,
    d: stochD,
    rsi: rsiValues
  };
}

// Calculate Average Directional Index (ADX)
export function calculateADX(highs: number[], lows: number[], closes: number[], period: number) {
  const len = closes.length;
  if (len < period + 1) {
    return {
      adx: new Array(len).fill(null),
      plusDI: new Array(len).fill(null),
      minusDI: new Array(len).fill(null),
    };
  }

  const plusDI: (number | null)[] = new Array(len).fill(null);
  const minusDI: (number | null)[] = new Array(len).fill(null);
  const adx: (number | null)[] = new Array(len).fill(null);

  // Calculate +DI and -DI
  for (let i = period; i < len; i++) {
    let sumTR = 0, sumPlusDM = 0, sumMinusDM = 0;

    // Calculate smoothed TR, +DM, -DM for the period
    for (let j = i - period + 1; j <= i; j++) {
      const tr = Math.max(
        highs[j] - lows[j],
        Math.abs(highs[j] - closes[j - 1]),
        Math.abs(lows[j] - closes[j - 1])
      );
      sumTR += tr;

      const upMove = highs[j] - highs[j - 1];
      const downMove = lows[j - 1] - lows[j];

      if (upMove > downMove && upMove > 0) sumPlusDM += upMove;
      if (downMove > upMove && downMove > 0) sumMinusDM += downMove;
    }

    const avgTR = sumTR / period;
    const avgPlusDM = sumPlusDM / period;
    const avgMinusDM = sumMinusDM / period;

    plusDI[i] = avgTR > 0 ? (avgPlusDM / avgTR) * 100 : 0;
    minusDI[i] = avgTR > 0 ? (avgMinusDM / avgTR) * 100 : 0;
  }

  // Calculate ADX
  for (let i = period * 2; i < len; i++) {
    // Simple average for ADX (simplified version)
    let sumDX = 0;
    let count = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const p = plusDI[j] || 0;
      const m = minusDI[j] || 0;
      if (p + m > 0) {
        const dx = Math.abs(p - m) / (p + m) * 100;
        sumDX += dx;
        count++;
      }
    }
    adx[i] = count > 0 ? sumDX / count : null;
  }

  return {
    adx,
    plusDI,
    minusDI,
  };
}

// Calculate Commodity Channel Index (CCI)
export function calculateCCI(highs: number[], lows: number[], closes: number[], period: number): (number | null)[] {
  if (closes.length < period) return closes.map(() => null);
  const result: (number | null)[] = new Array(period - 1).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    // Calculate Typical Price for the period
    const typicalPrices: number[] = [];
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (highs[j] + lows[j] + closes[j]) / 3;
      typicalPrices.push(tp);
    }

    // Calculate SMA of Typical Price
    const smaTP = typicalPrices.reduce((sum, tp) => sum + tp, 0) / period;

    // Calculate Mean Deviation
    const deviations = typicalPrices.map(tp => Math.abs(tp - smaTP));
    const meanDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / period;

    // Calculate CCI
    const currentTP = (highs[i] + lows[i] + closes[i]) / 3;
    const cci = meanDeviation !== 0 ? (currentTP - smaTP) / (0.015 * meanDeviation) : 0;

    result.push(cci);
  }

  return result;
}

// Calculate KDJ
export function calculateKDJ(highs: number[], lows: number[], closes: number[], period: number) {
  const result: { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] } = {
    k: new Array(period).fill(null),
    d: new Array(period).fill(null),
    j: new Array(period).fill(null),
  };
  
  let k = 50, d = 50;
  
  for (let i = period; i < closes.length; i++) {
    const periodHighs = highs.slice(i - period + 1, i + 1);
    const periodLows = lows.slice(i - period + 1, i + 1);
    const hh = Math.max(...periodHighs);
    const ll = Math.min(...periodLows);
    const rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
    const j = 3 * k - 2 * d;
    result.k.push(k);
    result.d.push(d);
    result.j.push(j);
  }
  return result;
}
