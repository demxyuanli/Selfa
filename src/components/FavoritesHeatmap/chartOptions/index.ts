import { StockWithQuote, HeatmapType, ChartViewType } from "../types";
import { getTreemapOption } from "./treemapOption";
import { getScatterOption } from "./scatterOption";
import { getBarOption } from "./barOption";
import { getRadarOption } from "./radarOption";
import { getBoxplotOption } from "./boxplotOption";
import { getMatrixHeatmapOption } from "./matrixOption";
import { getPieOption } from "./pieOption";
import { getBubbleOption } from "./bubbleOption";
import { getLineOption } from "./lineOption";

export const getChartOption = (
  stocksWithQuotes: StockWithQuote[],
  chartViewType: ChartViewType,
  heatmapType: HeatmapType,
  t: (key: string, params?: any) => string
) => {
  if (stocksWithQuotes.length === 0) {
    return {};
  }

  // Route to different chart type generators
  switch (chartViewType) {
    case "treemap":
      return getTreemapOption(stocksWithQuotes, heatmapType, t);
    case "scatter":
      return getScatterOption(stocksWithQuotes, t);
    case "bar":
      return getBarOption(stocksWithQuotes, heatmapType, t);
    case "radar":
      return getRadarOption(stocksWithQuotes, t);
    case "boxplot":
      return getBoxplotOption(stocksWithQuotes, t);
    case "matrix":
      return getMatrixHeatmapOption(stocksWithQuotes, t);
    case "pie":
      return getPieOption(stocksWithQuotes, t);
    case "bubble":
      return getBubbleOption(stocksWithQuotes, t);
    case "line":
      return getLineOption(stocksWithQuotes, t);
    default:
      return getTreemapOption(stocksWithQuotes, heatmapType, t);
  }
};
