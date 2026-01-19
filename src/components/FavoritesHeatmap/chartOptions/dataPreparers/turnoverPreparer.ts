import { StockWithQuote } from "../../types";
import { TreemapDataConfig, TreemapDataItem } from "../utils/treemapDataTypes";

export const prepareTurnoverData = (
  stocksWithQuotes: StockWithQuote[]
): TreemapDataConfig | null => {
  const validTurnover = stocksWithQuotes.filter(s => s.quote!.turnover && s.quote!.turnover > 0);
  if (validTurnover.length === 0) {
    return null;
  }

  const sorted = [...validTurnover].sort((a, b) => {
    const turnA = a.quote!.turnover || 0;
    const turnB = b.quote!.turnover || 0;
    return turnB - turnA;
  });

  const treemapData: TreemapDataItem[] = sorted.map((stock, index) => {
    const turnover = stock.quote!.turnover ?? 0;
    const marketCap = stock.quote!.market_cap || stock.quote!.price * 1000000;
    return {
      name: stock.stock.symbol,
      value: turnover || 0.01,
      rank: validTurnover.length - index,
      turnover: turnover,
      changePercent: stock.quote!.change_percent ?? 0,
      price: stock.quote!.price ?? 0,
      change: stock.quote!.change ?? 0,
      volume: stock.quote!.volume ?? 0,
      marketCap,
      fullName: stock.stock.name,
    };
  });

  const colorValues = treemapData.map(d => d.rank!);

  return {
    treemapData,
    colorValues,
    minValue: 1,
    maxValue: validTurnover.length,
    colorValueKey: "rank",
  };
};
