import { StockWithQuote } from "../types";

export const getBoxplotOption = (stocksWithQuotes: StockWithQuote[], t: (key: string, params?: any) => string) => {
  const changePercentValues = stocksWithQuotes.map(s => s.quote.change_percent || 0);
  const peValues = stocksWithQuotes.filter(s => s.quote.pe_ratio && s.quote.pe_ratio > 0).map(s => s.quote.pe_ratio!);

  const calculateBoxplot = (values: number[]) => {
    if (values.length === 0) return [0, 0, 0, 0, 0];
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const median = sorted[Math.floor(sorted.length * 0.5)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    return [min, q1, median, q3, max];
  };

  const changePercentBox = calculateBoxplot(changePercentValues);
  const peBox = peValues.length > 0 ? calculateBoxplot(peValues) : [0, 0, 0, 0, 0];

  return {
    title: {
      text: t("heatmap.dataDistribution"),
      subtext: t("heatmap.boxplotSubtext"),
      left: "center",
      top: "2%",
      textStyle: { fontSize: 16, fontWeight: "bold" },
      subtextStyle: { fontSize: 11, color: "#858585" },
    },
    tooltip: {
      trigger: "item",
      formatter: (params: any) => {
        const data = params.data;
        const indicator = params.name === `${t("heatmap.changePercentUnit")}(%)` ? t("stock.changePercent") : t("heatmap.peRatio");
        return `
          <div style="padding: 8px;">
            <div style="font-weight: bold; margin-bottom: 4px;">${indicator} ${t("heatmap.distributionStats")}</div>
            <div style="border-top: 1px solid #555; padding-top: 4px; margin-top: 4px;">
              <div>${t("heatmap.minValueLabel")}: ${data[0].toFixed(2)}</div>
              <div>${t("heatmap.q1Label")}: ${data[1].toFixed(2)}</div>
              <div style="color: #3b82f6; font-weight: bold;">${t("heatmap.medianLabel")}: ${data[2].toFixed(2)}</div>
              <div>${t("heatmap.q3Label")}: ${data[3].toFixed(2)}</div>
              <div>${t("heatmap.maxValueLabel")}: ${data[4].toFixed(2)}</div>
              <div style="margin-top: 4px; font-size: 10px; color: #858585;">${t("heatmap.iqrLabel")}: ${(data[3] - data[1]).toFixed(2)}</div>
            </div>
          </div>
        `;
      },
    },
    xAxis: {
      type: "category",
      name: t("heatmap.indicatorType"),
      nameLocation: "middle",
      nameGap: 30,
      nameTextStyle: { fontSize: 12 },
      data: [`${t("heatmap.changePercentUnit")}(%)`, t("heatmap.peRatio")],
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: "value",
      name: t("heatmap.indicatorValue"),
      nameLocation: "middle",
      nameGap: 50,
      nameTextStyle: { fontSize: 12 },
    },
    series: [{
      type: "boxplot",
      name: t("heatmap.distributionStats"),
      data: [changePercentBox, peBox],
      itemStyle: {
        color: "#3b82f6",
        borderColor: "#1e40af",
        borderWidth: 2,
      },
    }],
  };
};
