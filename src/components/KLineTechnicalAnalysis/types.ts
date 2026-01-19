export interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type IndicatorType = "sma" | "ema" | "bollinger" | "vwap" | "none";
export type OscillatorType = "rsi" | "macd" | "kdj" | "momentum" | "cci" | "adx" | "dmi" | "stochrsi" | "bbpercent" | "none";
export type GannReferenceMode = "current" | "swingLow" | "swingHigh" | "average" | "custom";

export interface IndicatorParams {
  rsiPeriod: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  kdjPeriod: number;
  momentumPeriod: number;
  cciPeriod: number;
  adxPeriod: number;
  stochRsiRsiPeriod: number;
  stochRsiStochPeriod: number;
  stochRsiKPeriod: number;
  stochRsiDPeriod: number;
  bbPercentPeriod: number;
}

export interface GannConfig {
  referenceMode: GannReferenceMode;
  customReferencePrice: number;
  angles: number[];
  cycles: number;
  showSupport: boolean;
  showResistance: boolean;
  showMajorAngles: boolean;
}
