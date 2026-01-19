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
  high: number;
  low: number;
  open: number;
  previous_close: number;
}

export interface TagInfo {
  id: number;
  name: string;
  color: string;
}

export interface StockWithTags extends StockInfo {
  tags: TagInfo[];
  quote?: StockQuote | null;
}

export interface GroupData {
  name: string;
  stocks: StockWithTags[];
  expanded: boolean;
  quotes?: Map<string, StockQuote | null>;
}

export interface LeftSidebarProps {
  visible: boolean;
  onToggle: () => void;
  onStockSelect: (symbol: string, name: string) => void;
  onStockRemove?: (symbol: string) => void;
}

export type PanelType = "search" | "favorites" | "groups" | "tags";

export const DEFAULT_TAG_COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
  "#1abc9c", "#e91e63", "#00bcd4", "#ff5722", "#607d8b"
];
