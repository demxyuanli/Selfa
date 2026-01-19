import { StockWithQuote } from "../types";

export const getPieOption = (stocksWithQuotes: StockWithQuote[], t: (key: string, params?: any) => string) => {
  const upCount = stocksWithQuotes.filter(s => (s.quote.change_percent || 0) > 0).length;
  const downCount = stocksWithQuotes.filter(s => (s.quote.change_percent || 0) < 0).length;
  const flatCount = stocksWithQuotes.filter(s => (s.quote.change_percent || 0) === 0).length;
  const total = stocksWithQuotes.length;

  return {
    title: {
      text: t("heatmap.changeDistribution"),
      subtext: `${t("heatmap.totalStocks", { count: total })} | ${t("heatmap.redUp")} | ${t("heatmap.greenDown")} | ${t("heatmap.yellowFlat")}`,
      left: "center",
      top: "2%",
      textStyle: { fontSize: 16, fontWeight: "bold" },
      subtextStyle: { fontSize: 11, color: "#858585" },
    },
    tooltip: {
      trigger: "item",
      formatter: (params: any) => {
        return `
          <div style="padding: 8px;">
            <div style="font-weight: bold; margin-bottom: 4px;">${params.name}</div>
            <div style="border-top: 1px solid #555; padding-top: 4px; margin-top: 4px;">
              <div>${t("heatmap.count")}: <strong>${params.value}</strong> ${t("common.shares")}</div>
              <div>${t("heatmap.percentage")}: <strong>${params.percent}%</strong></div>
              ${total > 0 ? `<div style="margin-top: 4px; font-size: 10px; color: #858585;">${t("heatmap.ofTotal")}: ${((params.value / total) * 100).toFixed(1)}%</div>` : ''}
            </div>
          </div>
        `;
      },
    },
    legend: {
      orient: "vertical",
      left: "left",
      top: "15%",
      textStyle: { fontSize: 12 },
    },
    series: [{
      type: "pie",
      name: t("heatmap.changeDistribution"),
      radius: ["40%", "70%"],
      center: ["60%", "55%"],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: "#fff",
        borderWidth: 2,
      },
      label: {
        show: true,
        formatter: `{b}\n{c}${t("common.shares")} ({d}%)`,
        fontSize: 11,
      },
      emphasis: {
        label: { show: true, fontSize: 13, fontWeight: "bold" },
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: "rgba(0, 0, 0, 0.5)",
        },
      },
      data: [
        { value: upCount, name: t("heatmap.up"), itemStyle: { color: "#ff0000" } },
        { value: downCount, name: t("heatmap.down"), itemStyle: { color: "#00ff00" } },
        { value: flatCount, name: t("heatmap.flat"), itemStyle: { color: "#eab308" } },
      ],
    }],
  };
};
