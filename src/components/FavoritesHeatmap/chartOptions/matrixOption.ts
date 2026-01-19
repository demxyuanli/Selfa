import { StockWithQuote } from "../types";

export const getMatrixHeatmapOption = (stocksWithQuotes: StockWithQuote[], t: (key: string, params?: any) => string) => {
  const topN = stocksWithQuotes.slice(0, 15);
  const categories = topN.map(s => s.stock.symbol);
  
  const normalizeValue = (value: number, min: number, max: number) => {
    if (max === min) return 0;
    return ((value - min) / (max - min)) * 100;
  };

  const changePercentValues = topN.map(s => s.quote.change_percent || 0);
  const marketCapValues = topN.map(s => s.quote.market_cap || 0);
  const volumeValues = topN.map(s => s.quote.volume || 0);
  const peValues = topN.map(s => s.quote.pe_ratio || 0).filter(v => v > 0);

  const indicators = [t("stock.changePercent"), t("stock.marketCap"), t("stock.volume"), "PE"];
  const minMax = indicators.map((_, idx) => {
    if (idx === 0) return [Math.min(...changePercentValues), Math.max(...changePercentValues)];
    if (idx === 1) return [Math.min(...marketCapValues), Math.max(...marketCapValues)];
    if (idx === 2) return [Math.min(...volumeValues), Math.max(...volumeValues)];
    return peValues.length > 0 ? [Math.min(...peValues), Math.max(...peValues)] : [0, 0];
  });

  const data: number[][] = [];
  topN.forEach((stock, stockIdx) => {
    data.push([
      normalizeValue(changePercentValues[stockIdx], minMax[0][0], minMax[0][1]),
      normalizeValue(marketCapValues[stockIdx], minMax[1][0], minMax[1][1]),
      normalizeValue(volumeValues[stockIdx], minMax[2][0], minMax[2][1]),
      peValues.length > 0 ? normalizeValue(stock.quote.pe_ratio || 0, minMax[3][0], minMax[3][1]) : 0,
    ]);
  });

  return {
    title: {
      text: t("heatmap.multiIndicatorMatrix"),
      subtext: t("heatmap.matrixSubtext"),
      left: "center",
      top: "2%",
      textStyle: { fontSize: 16, fontWeight: "bold" },
      subtextStyle: { fontSize: 11, color: "#858585" },
    },
    tooltip: {
      position: "top",
      formatter: (params: any) => {
        const [indicatorIdx, stockIdx] = [params.data[0], params.data[1]];
        const stock = topN[stockIdx];
        const indicator = indicators[indicatorIdx];
        let value = 0;
        let formattedValue = "";
        if (indicatorIdx === 0) {
          value = stock.quote.change_percent || 0;
          formattedValue = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
        } else if (indicatorIdx === 1) {
          value = stock.quote.market_cap || 0;
          formattedValue = value >= 100000000 ? `${(value / 100000000).toFixed(1)}${t("common.hundredMillion")}` : `${(value / 10000).toFixed(0)}${t("common.tenThousand")}`;
        } else if (indicatorIdx === 2) {
          value = stock.quote.volume || 0;
          formattedValue = value >= 100000000 ? `${(value / 100000000).toFixed(1)}${t("common.hundredMillion")}${t("common.shares")}` : `${(value / 10000).toFixed(0)}${t("common.tenThousand")}${t("common.shares")}`;
        } else {
          value = stock.quote.pe_ratio || 0;
          formattedValue = value.toFixed(2);
        }
        return `
          <div style="padding: 8px;">
            <div style="font-weight: bold; margin-bottom: 4px;"><strong>${stock.stock.symbol}</strong> ${stock.stock.name}</div>
            <div style="border-top: 1px solid #555; padding-top: 4px; margin-top: 4px;">
              <div><strong>${indicator}</strong>: ${formattedValue}</div>
              <div style="margin-top: 4px; font-size: 10px; color: #858585;">${t("heatmap.normalizedValueLabel")}: ${params.data[2].toFixed(1)}/100</div>
            </div>
          </div>
        `;
      },
    },
    grid: {
      height: "65%",
      top: "12%",
      left: "15%",
      right: "10%",
    },
    xAxis: {
      type: "category",
      name: t("heatmap.stockCode"),
      nameLocation: "middle",
      nameGap: 35,
      nameTextStyle: { fontSize: 12 },
      data: categories,
      splitArea: { show: true },
      axisLabel: { rotate: 45, fontSize: 9 },
    },
    yAxis: {
      type: "category",
      name: t("heatmap.indicatorType"),
      nameLocation: "middle",
      nameGap: 50,
      nameTextStyle: { fontSize: 12 },
      data: indicators,
      splitArea: { show: true },
      axisLabel: { fontSize: 11 },
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: "8%",
      text: [t("heatmap.high"), t("heatmap.low")],
      textStyle: { fontSize: 10 },
      inRange: { color: ["#00ff00", "#eab308", "#ff0000"] },
    },
    series: [{
      type: "heatmap",
      name: t("heatmap.indicatorValue"),
      data: data.flatMap((row, stockIdx) =>
        row.map((value, indicatorIdx) => [indicatorIdx, stockIdx, value])
      ),
      label: { show: false },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: "rgba(0, 0, 0, 0.5)" },
      },
    }],
  };
};
