import { HeatmapType } from "../types";
import { TreemapDataItem } from "./utils/treemapDataTypes";
import { formatLargeNumber } from "./utils/formatters";

export const createTooltipFormatter = (
  heatmapType: HeatmapType,
  t: (key: string, params?: any) => string
): ((params: any) => string) => {
  return (params: any) => {
    if (!params) return "";
    const param = Array.isArray(params) ? params[0] : params;
    const data: TreemapDataItem = param?.data || param || {};
    
    const marketCap = data.marketCap ?? 0;
    const volume = data.volume ?? 0;
    const marketCapText = formatLargeNumber(marketCap, t);
    const volumeText = formatLargeNumber(volume, t);
    
    const turnover = data.turnover ?? 0;
    const turnoverText = turnover >= 100000000
      ? `${(turnover / 100000000).toFixed(1)}${t("common.hundredMillion")}`
      : turnover > 0
      ? `${(turnover / 10000).toFixed(0)}${t("common.tenThousand")}`
      : "N/A";

    const changePercent = data.changePercent ?? 0;
    const change = data.change ?? 0;
    const price = data.price ?? 0;
    
    let tooltipContent = `
      <div style="padding: 8px;">
        <div><strong>${data.name}</strong> ${data.fullName || ''}</div>
        <div>${t("heatmap.currentPrice")}: ¥${price.toFixed(2)}</div>
        <div>${t("stock.changePercent")}: ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%</div>
        <div>${t("heatmap.changeAmount")}: ${change >= 0 ? '+' : ''}${change.toFixed(2)}</div>
        <div>${t("stock.marketCap")}: ¥${marketCapText}</div>
        <div>${t("stock.volume")}: ${volumeText} ${t("common.shares")}</div>
    `;

    if (heatmapType === "marketCap" && data.rank) {
      tooltipContent += `<div>${t("heatmap.marketCapRankLabel")}: #${data.rank}</div>`;
    }
    if (heatmapType === "peRatio" && data.peRatio) {
      const peRatio = data.peRatio ?? 0;
      tooltipContent += `<div>${t("heatmap.peRatio")}: ${peRatio.toFixed(2)}</div>`;
      if (data.rank) {
        tooltipContent += `<div>${t("heatmap.peRankLabel")}: #${data.rank}</div>`;
      }
    }
    if (heatmapType === "turnover" && data.turnover) {
      tooltipContent += `<div>${t("heatmap.turnover")}: ¥${turnoverText}</div>`;
      if (data.rank) {
        tooltipContent += `<div>${t("heatmap.turnoverRankLabel")}: #${data.rank}</div>`;
      }
    }

    tooltipContent += `</div>`;
    return tooltipContent;
  };
};
