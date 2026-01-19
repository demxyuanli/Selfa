import { StockWithQuote, HeatmapType } from "../types";

export const getBarOption = (
  stocksWithQuotes: StockWithQuote[],
  heatmapType: HeatmapType,
  t: (key: string, params?: any) => string
) => {
  const sorted = [...stocksWithQuotes].sort((a, b) => {
    if (heatmapType === "changePercent") {
      return (b.quote.change_percent || 0) - (a.quote.change_percent || 0);
    } else if (heatmapType === "marketCap") {
      return (b.quote.market_cap || 0) - (a.quote.market_cap || 0);
    } else if (heatmapType === "turnover") {
      return (b.quote.turnover || 0) - (a.quote.turnover || 0);
    }
    return 0;
  });

  const topN = sorted.slice(0, 15);
  const categories = topN.map(s => s.stock.symbol);
  const values = topN.map(s => {
    if (heatmapType === "changePercent") return s.quote.change_percent || 0;
    if (heatmapType === "marketCap") return (s.quote.market_cap || 0) / 100000000;
    if (heatmapType === "turnover") return (s.quote.turnover || 0) / 100000000;
    return 0;
  });
  const colors = topN.map(s => (s.quote.change_percent || 0) >= 0 ? "#ff0000" : "#00ff00");

  const typeNames: Record<HeatmapType, string> = {
    marketCap: t("heatmap.marketCapRank"),
    changePercent: t("heatmap.changePercentRank"),
    peRatio: t("heatmap.peRatioRank"),
    turnover: t("heatmap.turnoverRank"),
  };

  return {
    title: {
      text: `TOP15 ${typeNames[heatmapType]}`,
      subtext: `${t("heatmap.redUp")} | ${t("heatmap.greenDown")} | ${t("heatmap.sortHighToLow")}`,
      left: "center",
      top: "2%",
      textStyle: { fontSize: 16, fontWeight: "bold" },
      subtextStyle: { fontSize: 11, color: "#858585" },
    },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const param = Array.isArray(params) ? params[0] : params;
        const idx = param.dataIndex;
        const stock = topN[idx];
        const rank = idx + 1;
        return `
          <div style="padding: 8px;">
            <div style="font-weight: bold; margin-bottom: 4px;">${t("heatmap.rank")} #${rank}: <strong>${stock.stock.symbol}</strong> ${stock.stock.name}</div>
            <div style="border-top: 1px solid #555; padding-top: 4px; margin-top: 4px;">
              <div>${typeNames[heatmapType]}: ${heatmapType === "changePercent" ? `${param.value >= 0 ? '+' : ''}${param.value.toFixed(2)}%` : `${param.value.toFixed(1)}${heatmapType === "marketCap" || heatmapType === "turnover" ? t("common.hundredMillion") : ''}`}</div>
              <div>${t("stock.changePercent")}: <span style="color: ${(stock.quote.change_percent || 0) >= 0 ? '#ff0000' : '#00ff00'}">${(stock.quote.change_percent || 0) >= 0 ? '+' : ''}${(stock.quote.change_percent || 0).toFixed(2)}%</span></div>
              <div>${t("stock.price")}: ¥${stock.quote.price.toFixed(2)}</div>
            </div>
          </div>
        `;
      },
    },
    grid: {
      left: "15%",
      right: "10%",
      bottom: "15%",
    },
    xAxis: {
      type: "category",
      name: t("heatmap.stockCode"),
      nameLocation: "middle",
      nameGap: 40,
      nameTextStyle: { fontSize: 12 },
      data: categories,
      axisLabel: {
        rotate: 45,
        fontSize: 10,
      },
    },
    yAxis: {
      type: "value",
      name: heatmapType === "marketCap" ? `${t("stock.marketCap")}(${t("common.hundredMillion")})` : 
            heatmapType === "turnover" ? `${t("heatmap.turnover")}(${t("common.hundredMillion")})` : `${t("stock.changePercent")}(%)`,
      nameLocation: "middle",
      nameGap: 50,
      nameTextStyle: { fontSize: 12 },
    },
    series: [{
      type: "bar",
      name: typeNames[heatmapType],
      data: values.map((v, i) => ({
        value: v,
        itemStyle: { color: colors[i] },
      })),
      label: {
        show: true,
        position: "top",
        formatter: (params: any) => {
          if (heatmapType === "changePercent") {
            return `${params.value >= 0 ? '+' : ''}${params.value.toFixed(2)}%`;
          }
          return `${params.value.toFixed(1)}${heatmapType === "marketCap" || heatmapType === "turnover" ? t("common.hundredMillion") : ''}`;
        },
        fontSize: 10,
      },
    }],
  };
};
