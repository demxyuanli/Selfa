import { StockInfo, StockQuote, HeatmapSummary } from "../types";

export const getSummary = (
  stocks: Array<{ stock: StockInfo; quote: StockQuote | null }>
): HeatmapSummary => {
  if (stocks.length === 0) {
    return {
      total: 0,
      withQuote: 0,
      upCount: 0,
      downCount: 0,
      flatCount: 0,
      totalChange: 0,
      avgChange: 0,
      maxGain: { symbol: "", name: "", change: 0 },
      maxLoss: { symbol: "", name: "", change: 0 },
    };
  }

  const stocksWithQuotes = stocks.filter((s): s is { stock: StockInfo; quote: StockQuote } => s.quote !== null);
  const upCount = stocksWithQuotes.filter((s) => s.quote.change_percent > 0).length;
  const downCount = stocksWithQuotes.filter((s) => s.quote.change_percent < 0).length;
  const flatCount = stocksWithQuotes.filter((s) => s.quote.change_percent === 0).length;
  const totalChange = stocksWithQuotes.reduce((sum, s) => sum + s.quote.change_percent, 0);
  const avgChange = stocksWithQuotes.length > 0 ? totalChange / stocksWithQuotes.length : 0;

  const maxGain = stocksWithQuotes.reduce(
    (max, s) => (s.quote.change_percent > max.change ? { symbol: s.stock.symbol, name: s.stock.name, change: s.quote.change_percent } : max),
    { symbol: "", name: "", change: -Infinity }
  );

  const maxLoss = stocksWithQuotes.reduce(
    (min, s) => (s.quote.change_percent < min.change ? { symbol: s.stock.symbol, name: s.stock.name, change: s.quote.change_percent } : min),
    { symbol: "", name: "", change: Infinity }
  );

  return {
    total: stocks.length,
    withQuote: stocksWithQuotes.length,
    upCount,
    downCount,
    flatCount,
    totalChange,
    avgChange,
    maxGain,
    maxLoss,
  };
};
