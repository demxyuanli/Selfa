export interface MACDSignal {
  action: string;
  signal: "bullish" | "bearish" | "neutral";
  strength: number;
  reason: string;
}

export interface MACDData {
  macdLine: number[];
  signalLine: (number | null)[];
  histogramArray: (number | null)[];
}

export function analyzeMACDSignal(macd: MACDData | null, closes: number[], volumes: number[]): MACDSignal {
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

  const recentPrices = closes.slice(-20);
  const trend_direction = recentPrices.length >= 10 ?
    (recentPrices[recentPrices.length - 1] > recentPrices[0] ? "uptrend" : "downtrend") : "sideways";

  const recentVolumes = volumes.slice(-5);
  const volume_trend = recentVolumes.length >= 2 ?
    (recentVolumes[recentVolumes.length - 1] > recentVolumes[0] * 1.2 ? "explosive" :
     recentVolumes[recentVolumes.length - 1] > recentVolumes[0] ? "increasing" : "decreasing") : "stable";

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

function evaluateMACDSignal(current: any, prev: any, context: any): MACDSignal {
  const signal: MACDSignal = { action: "HOLD", signal: "neutral", strength: 0, reason: "analysis.macdSignalHold" };

  let base_strength_multiplier = 1.0;
  if (current.zero_axis_position === "below") {
    base_strength_multiplier = 0.4;
  } else if (current.zero_axis_position === "near") {
    base_strength_multiplier = 0.7;
  }

  const golden_cross = (prev.diff <= prev.dea) && (current.diff > current.dea);
  const death_cross = (prev.diff >= prev.dea) && (current.diff < current.dea);

  const red_expanding = current.macd_histogram > 0 && current.macd_histogram > prev.macd_histogram;
  const green_expanding = current.macd_histogram < 0 && Math.abs(current.macd_histogram) > Math.abs(prev.macd_histogram);
  const red_shrinking = current.macd_histogram > 0 && current.macd_histogram < prev.macd_histogram;
  const turning_green = current.macd_histogram <= 0 && prev.macd_histogram > 0;

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
  else if (red_shrinking && current.zero_axis_position === "above" && !golden_cross) {
    signal.action = "REDUCE";
    signal.signal = "bearish";
    signal.strength = -3;
    signal.reason = "analysis.macdReducing";
  }

  if (context.trend_direction === "downtrend" && signal.signal === "bullish") {
    signal.strength *= 0.5;
    signal.reason = "analysis.macdAgainstTrend";
  }

  if (Math.abs(signal.strength) < 4) {
    signal.action = "HOLD";
    signal.signal = "neutral";
    signal.reason = "analysis.macdSignalHold";
  }

  return signal;
}

export interface MACDRSISignal {
  macdAction: string;
  rsiCondition: string;
  action: string;
  signal: "bullish" | "bearish" | "neutral";
  strength: number;
  reason: string;
}

export function analyzeMACDRSISignal(macd: MACDData | null, rsi: number | null, closes: number[]): MACDRSISignal {
  if (!macd || rsi === null) {
    return {
      macdAction: "HOLD",
      rsiCondition: "neutral",
      action: "HOLD",
      signal: "neutral",
      strength: 0,
      reason: "analysis.compositeSignalHold"
    };
  }

  const macdSignal = analyzeMACDSignal(macd, closes, []);

  let rsiCondition = "neutral";
  if (rsi >= 70) rsiCondition = "overbought";
  else if (rsi <= 30) rsiCondition = "oversold";
  else if (rsi >= 60) rsiCondition = "bullish";
  else if (rsi <= 40) rsiCondition = "bearish";

  const result: MACDRSISignal = {
    macdAction: macdSignal.action,
    rsiCondition,
    action: "HOLD",
    signal: "neutral",
    strength: 0,
    reason: "analysis.compositeSignalHold"
  };

  if (macdSignal.action === "BUY" && rsiCondition === "oversold") {
    result.action = "STRONG_BUY";
    result.signal = "bullish";
    result.strength = 9;
    result.reason = "analysis.compositeStrongBuy";
  }
  else if (macdSignal.action === "BUY" && rsiCondition === "neutral") {
    result.action = "BUY";
    result.signal = "bullish";
    result.strength = 7;
    result.reason = "analysis.compositeBuy";
  }
  else if (macdSignal.action === "SELL" && rsiCondition === "overbought") {
    result.action = "STRONG_SELL";
    result.signal = "bearish";
    result.strength = -9;
    result.reason = "analysis.compositeStrongSell";
  }
  else if (macdSignal.action === "SELL" && rsiCondition === "neutral") {
    result.action = "SELL";
    result.signal = "bearish";
    result.strength = -7;
    result.reason = "analysis.compositeSell";
  }
  else if (macdSignal.action === "BUY" && rsiCondition === "overbought") {
    result.action = "CAUTION_BUY";
    result.signal = "bullish";
    result.strength = 4;
    result.reason = "analysis.compositeCautionBuy";
  }
  else if (macdSignal.action === "SELL" && rsiCondition === "oversold") {
    result.action = "CAUTION_SELL";
    result.signal = "bearish";
    result.strength = -4;
    result.reason = "analysis.compositeCautionSell";
  }

  return result;
}
