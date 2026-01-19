import { StockWithQuote } from "../types";

export const getLineOption = (stocksWithQuotes: StockWithQuote[], t: (key: string, params?: any) => string) => {
  const topN = stocksWithQuotes.slice(0, 10);
  const categories = topN.map(s => s.stock.symbol);
  
  const changePercentData = topN.map(s => s.quote.change_percent || 0);
  const priceData = topN.map(s => s.quote.price || 0);

  return {
    title: {
      text: t("heatmap.top10ChangePrice"),
      subtext: t("heatmap.leftYAxis"),
      left: "center",
      top: "2%",
      textStyle: { fontSize: 16, fontWeight: "bold" },
      subtextStyle: { fontSize: 11, color: "#858585" },
    },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        if (!params || params.length === 0) return "";
        const param = params[0];
        const idx = param.dataIndex;
        const stock = topN[idx];
        let result = `<div style="padding: 8px;"><div style="font-weight: bold; margin-bottom: 4px;"><strong>${stock.stock.symbol}</strong> ${stock.stock.name}</div><div style="border-top: 1px solid #555; padding-top: 4px; margin-top: 4px;">`;
        params.forEach((p: any) => {
          if (p.value !== null && p.value !== undefined) {
            const value = typeof p.value === "number" ? p.value.toFixed(2) : p.value;
            const unit = p.seriesName.includes(t("heatmap.changePercentUnit")) ? '%' : p.seriesName.includes(t("heatmap.priceUnit")) ? '¥' : '';
            result += `<div style="margin: 2px 0;"><span style="display:inline-block;width:8px;height:8px;background:${p.color};border-radius:50%;margin-right:4px;"></span>${p.seriesName}: <strong>${value}${unit}</strong></div>`;
          }
        });
        result += `</div></div>`;
        return result;
      },
    },
    legend: {
      data: [`${t("heatmap.changePercentUnit")}(%)`, `${t("heatmap.priceUnit")}`],
      bottom: "5%",
      textStyle: { fontSize: 11 },
    },
    grid: {
      left: "8%",
      right: "8%",
      bottom: "12%",
      top: "15%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      name: t("heatmap.stockCode"),
      nameLocation: "middle",
      nameGap: 35,
      nameTextStyle: { fontSize: 12 },
      data: categories,
      axisLabel: { rotate: 45, fontSize: 10 },
    },
    yAxis: [
      {
        type: "value",
        name: `${t("heatmap.changePercentUnit")}(%)`,
        nameLocation: "middle",
        nameGap: 50,
        nameTextStyle: { fontSize: 12 },
        position: "left",
        axisLabel: { fontSize: 10 },
      },
      {
        type: "value",
        name: `${t("heatmap.priceUnit")}`,
        nameLocation: "middle",
        nameGap: 50,
        nameTextStyle: { fontSize: 12 },
        position: "right",
        axisLabel: { fontSize: 10 },
      },
    ],
    series: [
      {
        name: `${t("heatmap.changePercentUnit")}(%)`,
        type: "line",
        yAxisIndex: 0,
        data: changePercentData,
        itemStyle: { color: "#ff0000" },
        lineStyle: { color: "#ff0000", width: 2 },
        areaStyle: { opacity: 0.3, color: "#ff0000" },
        smooth: true,
      },
      {
        name: `${t("heatmap.priceUnit")}`,
        type: "line",
        yAxisIndex: 1,
        data: priceData,
        itemStyle: { color: "#3b82f6" },
        lineStyle: { color: "#3b82f6", width: 2 },
        smooth: true,
      },
    ],
  };
};
