import { StockWithQuote } from "../types";

export const getScatterOption = (stocksWithQuotes: StockWithQuote[], t: (key: string, params?: any) => string) => {
  const data = stocksWithQuotes.map(s => ({
    name: s.stock.symbol,
    fullName: s.stock.name,
    value: [
      s.quote.market_cap ? Math.log10(s.quote.market_cap + 1) : 0,
      s.quote.change_percent || 0,
      s.quote.volume || 0
    ],
    marketCap: s.quote.market_cap || 0,
    changePercent: s.quote.change_percent || 0,
    volume: s.quote.volume || 0,
    price: s.quote.price || 0,
    peRatio: s.quote.pe_ratio || 0,
  }));

  return {
    title: {
      text: t("heatmap.marketCapVsChange"),
      subtext: t("heatmap.scatterSubtext"),
      left: "center",
      top: "2%",
      textStyle: { fontSize: 16, fontWeight: "bold" },
      subtextStyle: { fontSize: 11, color: "#858585" },
    },
    tooltip: {
      trigger: "item",
      formatter: (params: any) => {
        const d = params.data;
        return `
          <div style="padding: 8px;">
            <div style="font-weight: bold; margin-bottom: 4px;"><strong>${d.name}</strong> ${d.fullName}</div>
            <div style="border-top: 1px solid #555; padding-top: 4px; margin-top: 4px;">
              <div>${t("stock.marketCap")}: ${d.marketCap >= 100000000 ? `${(d.marketCap / 100000000).toFixed(1)}${t("common.hundredMillion")}` : `${(d.marketCap / 10000).toFixed(0)}${t("common.tenThousand")}`}</div>
              <div>${t("stock.changePercent")}: <span style="color: ${d.changePercent >= 0 ? '#ff0000' : '#00ff00'}">${d.changePercent >= 0 ? '+' : ''}${d.changePercent.toFixed(2)}%</span></div>
              <div>${t("stock.price")}: ¥${d.price.toFixed(2)}</div>
              <div>${t("stock.volume")}: ${d.volume >= 100000000 ? `${(d.volume / 100000000).toFixed(1)}${t("common.hundredMillion")}${t("common.shares")}` : `${(d.volume / 10000).toFixed(0)}${t("common.tenThousand")}${t("common.shares")}`}</div>
              ${d.peRatio > 0 ? `<div>PE: ${d.peRatio.toFixed(2)}</div>` : ''}
            </div>
          </div>
        `;
      },
    },
    xAxis: {
      type: "value",
      name: t("heatmap.marketCapLog"),
      nameLocation: "middle",
      nameGap: 30,
      nameTextStyle: { fontSize: 12, padding: [10, 0, 0, 0] },
      scale: true,
      axisLabel: { formatter: (value: number) => `10^${value.toFixed(1)}` },
    },
    yAxis: {
      type: "value",
      name: `${t("stock.changePercent")}(%)`,
      nameLocation: "middle",
      nameGap: 50,
      nameTextStyle: { fontSize: 12 },
    },
    visualMap: {
      show: true,
      dimension: 1,
      min: Math.min(...data.map(d => d.value[1])),
      max: Math.max(...data.map(d => d.value[1])),
      inRange: {
        color: ["#00ff00", "#eab308", "#ff0000"],
      },
      orient: "vertical",
      right: "2%",
      top: "center",
      text: [t("heatmap.changeHigh"), t("heatmap.changeLow")],
      textStyle: { fontSize: 10 },
    },
    series: [{
      type: "scatter",
      name: t("heatmap.stockDistribution"),
      data: data,
      symbolSize: (data: number[]) => {
        const maxVolume = Math.max(...stocksWithQuotes.map(s => s.quote.volume || 0));
        const size = Math.sqrt((data[2] || 0) / maxVolume) * 100;
        return Math.max(10, Math.min(50, size));
      },
      itemStyle: {
        opacity: 0.7,
      },
    }],
  };
};
