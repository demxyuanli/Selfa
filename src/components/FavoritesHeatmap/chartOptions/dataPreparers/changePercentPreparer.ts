import { StockWithQuote } from "../../types";
import { TreemapDataConfig, TreemapDataItem } from "../utils/treemapDataTypes";

export const prepareChangePercentData = (
  stocksWithQuotes: StockWithQuote[]
): TreemapDataConfig | null => {
  if (stocksWithQuotes.length === 0) {
    return null;
  }
  
  const sorted = [...stocksWithQuotes].sort((a, b) => {
    const changeA = Math.abs(a.quote!.change_percent ?? 0);
    const changeB = Math.abs(b.quote!.change_percent ?? 0);
    return changeB - changeA;
  });

  const colorValues = sorted.map((s) => s.quote!.change_percent);
  const minValue = Math.min(...colorValues);
  const maxValue = Math.max(...colorValues);

  const absChanges = sorted.map(s => Math.abs(s.quote!.change_percent ?? 0));
  const maxAbsChange = Math.max(...absChanges);

  const treemapData: TreemapDataItem[] = sorted.map((stock) => {
    const changePct = stock.quote!.change_percent ?? 0;
    const absChange = Math.abs(changePct);

    let sizeValue: number;
    if (maxAbsChange === 0) {
      sizeValue = 1;
    } else if (absChange === 0) {
      sizeValue = 0.5;
    } else {
      const normalized = absChange / maxAbsChange;
      sizeValue = Math.sqrt(normalized) * maxAbsChange + 0.1;
    }

    sizeValue = Math.max(sizeValue, 0.1);

    const marketCap = stock.quote!.market_cap || stock.quote!.price * 1000000;
    return {
      name: stock.stock.symbol,
      value: sizeValue,
      changePercent: changePct,
      absChange: absChange,
      price: stock.quote!.price ?? 0,
      change: stock.quote!.change ?? 0,
      volume: stock.quote!.volume ?? 0,
      turnover: stock.quote!.turnover ?? 0,
      marketCap,
      fullName: stock.stock.name,
    };
  });

  return {
    treemapData,
    colorValues,
    minValue,
    maxValue,
    colorValueKey: "changePercent",
  };
};
