export interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap?: number;
  pe_ratio?: number;
  turnover?: number;
  high: number;
  low: number;
  open: number;
  previous_close: number;
}

export type HeatmapType = "marketCap" | "changePercent" | "peRatio" | "turnover";
export type ChartViewType = "treemap" | "scatter" | "bar" | "radar" | "boxplot" | "matrix" | "pie" | "bubble" | "line";

export interface StockWithQuote {
  stock: StockInfo;
  quote: StockQuote;
}

export interface HeatmapSummary {
  total: number;
  withQuote: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  totalChange: number;
  avgChange: number;
  maxGain: { symbol: string; name: string; change: number };
  maxLoss: { symbol: string; name: string; change: number };
}
