export interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockAnalysisProps {
  timeSeriesData: StockData[];
  klineData: StockData[];
  analysisType: "timeseries" | "kline";
}

export interface AnalysisResult {
  key: string;
  titleKey: string;
  descKey: string;
  descParams: Record<string, string | number>;
  signal: "bullish" | "bearish" | "neutral";
  confidence: number;
  extraKey?: string;
}

export interface TimeSeriesParams {
  maPeriod: number;
  volumeMultiplier: number;
}

export interface KLineParams {
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  rsiPeriod: number;
  kdjPeriod: number;
  bbPeriod: number;
  atrPeriod: number;
  trendDays: number;
}
