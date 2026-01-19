import { StockWithQuote, HeatmapType } from "../../types";
import { TreemapDataConfig } from "../utils/treemapDataTypes";
import { prepareMarketCapData } from "./marketCapPreparer";
import { prepareChangePercentData } from "./changePercentPreparer";
import { preparePeRatioData } from "./peRatioPreparer";
import { prepareTurnoverData } from "./turnoverPreparer";

export const prepareTreemapData = (
  stocksWithQuotes: StockWithQuote[],
  heatmapType: HeatmapType
): TreemapDataConfig | null => {
  switch (heatmapType) {
    case "marketCap":
      return prepareMarketCapData(stocksWithQuotes);
    case "changePercent":
      return prepareChangePercentData(stocksWithQuotes);
    case "peRatio":
      return preparePeRatioData(stocksWithQuotes);
    case "turnover":
      return prepareTurnoverData(stocksWithQuotes);
    default:
      return null;
  }
};
