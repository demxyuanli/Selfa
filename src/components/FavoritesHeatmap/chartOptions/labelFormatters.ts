import { HeatmapType } from "../types";
import { TreemapDataItem } from "./utils/treemapDataTypes";
import { formatLargeNumber, formatChangePercent, getShortName } from "./utils/formatters";

export const createLabelFormatter = (
  heatmapType: HeatmapType,
  t: (key: string, params?: any) => string
): ((params: any) => string) => {
  return (params: any) => {
    if (!params) return "";
    const data: TreemapDataItem = params.data || params;
    if (!data || typeof data !== "object") return "";
    
    const displayName = (data.fullName || data.name || "").toString();
    if (!displayName) return "";
    
    const shortName = getShortName(displayName, 6);

    switch (heatmapType) {
      case "marketCap": {
        const marketCap = Number(data.marketCap) || 0;
        if (!isFinite(marketCap) || marketCap <= 0) return shortName;
        const marketCapText = formatLargeNumber(marketCap, t);
        return `${shortName}\n${marketCapText}`;
      }
      case "changePercent": {
        const changePercent = Number(data.changePercent) || 0;
        if (!isFinite(changePercent)) return shortName;
        const changeText = formatChangePercent(changePercent);
        return `${shortName}\n${changeText}`;
      }
      case "peRatio": {
        const peRatio = Number(data.peRatio) || 0;
        if (!isFinite(peRatio) || peRatio <= 0) return shortName;
        return `${shortName}\nPE:${peRatio.toFixed(1)}`;
      }
      case "turnover": {
        const turnover = Number(data.turnover) || 0;
        if (!isFinite(turnover) || turnover <= 0) return shortName;
        const turnoverText = formatLargeNumber(turnover, t);
        return `${shortName}\n${turnoverText}`;
      }
      default:
        return shortName;
    }
  };
};
