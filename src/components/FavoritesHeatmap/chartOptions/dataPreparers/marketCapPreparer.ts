import { StockWithQuote } from "../../types";
import { TreemapDataConfig, TreemapDataItem } from "../utils/treemapDataTypes";

export const prepareMarketCapData = (
  stocksWithQuotes: StockWithQuote[]
): TreemapDataConfig | null => {
  const validStocks = stocksWithQuotes.filter(s => {
    const marketCap = s.quote!.market_cap;
    return marketCap !== null && marketCap !== undefined && Number(marketCap) > 0;
  });

  if (validStocks.length === 0) {
    console.warn("No valid market cap data found for any stocks");
    return null;
  }

  const sorted = [...validStocks].sort((a, b) => {
    const capA = Number(a.quote!.market_cap!) || 0;
    const capB = Number(b.quote!.market_cap!) || 0;
    return capB - capA;
  });

  const treemapData: TreemapDataItem[] = sorted.map((stock, index) => {
    const marketCap = Number(stock.quote!.market_cap!) || 0;
    const treemapValue = marketCap > 0 ? marketCap : 1;
    return {
      name: stock.stock.symbol,
      value: treemapValue,
      rank: validStocks.length - index,
      changePercent: stock.quote!.change_percent ?? 0,
      price: stock.quote!.price ?? 0,
      change: stock.quote!.change ?? 0,
      volume: stock.quote!.volume ?? 0,
      turnover: stock.quote!.turnover ?? 0,
      marketCap: marketCap,
      fullName: stock.stock.name,
    };
  });

  const colorValues = treemapData.map(d => d.rank!);

  return {
    treemapData,
    colorValues,
    minValue: 1,
    maxValue: validStocks.length,
    colorValueKey: "rank",
  };
};
