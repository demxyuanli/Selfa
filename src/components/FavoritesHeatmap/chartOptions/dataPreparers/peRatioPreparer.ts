import { StockWithQuote } from "../../types";
import { TreemapDataConfig, TreemapDataItem } from "../utils/treemapDataTypes";

export const preparePeRatioData = (
  stocksWithQuotes: StockWithQuote[]
): TreemapDataConfig | null => {
  const validPE = stocksWithQuotes.filter(s => s.quote!.pe_ratio && s.quote!.pe_ratio > 0);
  if (validPE.length === 0) {
    return null;
  }

  const sorted = [...validPE].sort((a, b) => {
    const peA = a.quote!.pe_ratio || 0;
    const peB = b.quote!.pe_ratio || 0;
    return peB - peA;
  });

  const treemapData: TreemapDataItem[] = sorted.map((stock, index) => {
    const peRatio = stock.quote!.pe_ratio ?? 0;
    const marketCap = stock.quote!.market_cap || stock.quote!.price * 1000000;
    return {
      name: stock.stock.symbol,
      value: peRatio || 0.01,
      rank: validPE.length - index,
      peRatio: peRatio,
      changePercent: stock.quote!.change_percent ?? 0,
      price: stock.quote!.price ?? 0,
      change: stock.quote!.change ?? 0,
      volume: stock.quote!.volume ?? 0,
      turnover: stock.quote!.turnover ?? 0,
      marketCap,
      fullName: stock.stock.name,
    };
  });

  const colorValues = treemapData.map(d => d.rank!);

  return {
    treemapData,
    colorValues,
    minValue: 1,
    maxValue: validPE.length,
    colorValueKey: "rank",
  };
};
