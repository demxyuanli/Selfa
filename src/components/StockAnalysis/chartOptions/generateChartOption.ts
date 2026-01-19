import { StockData, TimeSeriesParams } from "../types";
import { calculateMA } from "../utils/indicators";

export interface ChartOptionParams {
  analysisType: "timeseries" | "kline";
  timeSeriesData: StockData[];
  klineData: StockData[];
  tsParams: TimeSeriesParams;
  t: (key: string) => string;
}

export function generateChartOption(params: ChartOptionParams): any {
  const { analysisType, timeSeriesData, klineData, tsParams, t } = params;
  const data = analysisType === "timeseries" ? timeSeriesData : klineData;
  if (!data || data.length === 0) return {};

  const dates = data.map(d => d.date.includes(" ") ? d.date.split(" ")[1] : d.date.split(" ")[0]);
  const closes = data.map(d => d.close);
  const volumes = data.map(d => d.volume);

  if (analysisType === "timeseries") {
    const ma = closes.map((_, i) => i < tsParams.maPeriod - 1 ? null : calculateMA(closes.slice(0, i + 1), tsParams.maPeriod));
    return {
      backgroundColor: "transparent",
      grid: [{ left: "8%", right: "3%", top: "8%", height: "55%" }, { left: "8%", right: "3%", top: "70%", height: "25%" }],
      xAxis: [
        { type: "category", data: dates, gridIndex: 0, axisLabel: { fontSize: 9, color: "#858585" } },
        { type: "category", data: dates, gridIndex: 1, axisLabel: { show: false } },
      ],
      yAxis: [
        { type: "value", gridIndex: 0, scale: true, axisLabel: { fontSize: 9, color: "#858585" } },
        { type: "value", gridIndex: 1, scale: true, axisLabel: { fontSize: 9, color: "#858585" } },
      ],
      series: [
        { name: t("stock.price"), type: "line", data: closes, symbol: "none", lineStyle: { color: "#007acc", width: 1.5 } },
        { name: `MA${tsParams.maPeriod}`, type: "line", data: ma, symbol: "none", lineStyle: { color: "#f39c12", width: 1, type: "dashed" } },
        { name: t("stock.volume"), type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: volumes, itemStyle: { color: "#3498db" } },
      ],
      tooltip: { trigger: "axis", backgroundColor: "rgba(37, 37, 38, 0.95)", textStyle: { color: "#ccc", fontSize: 10 } },
    };
  } else {
    const ma5 = closes.map((_, i) => i < 4 ? null : calculateMA(closes.slice(0, i + 1), 5));
    const ma10 = closes.map((_, i) => i < 9 ? null : calculateMA(closes.slice(0, i + 1), 10));
    const ma20 = closes.map((_, i) => i < 19 ? null : calculateMA(closes.slice(0, i + 1), 20));
    
    return {
      backgroundColor: "transparent",
      grid: [{ left: "8%", right: "3%", top: "8%", height: "55%" }, { left: "8%", right: "3%", top: "70%", height: "25%" }],
      xAxis: [
        { 
          type: "category", 
          data: dates, 
          gridIndex: 0, 
          axisLabel: { fontSize: 9, color: "#858585" },
          splitLine: { show: false },
        },
        { 
          type: "category", 
          data: dates, 
          gridIndex: 1, 
          axisLabel: { fontSize: 9, color: "#858585" },
          splitLine: { show: false },
        },
      ],
      yAxis: [
        { 
          type: "value", 
          gridIndex: 0, 
          scale: true, 
          axisLabel: { fontSize: 9, color: "#858585" },
          splitLine: {
            show: true,
            lineStyle: {
              color: "rgba(133, 133, 133, 0.15)",
              type: "dashed",
              width: 1,
            },
          },
        },
        { 
          type: "value", 
          gridIndex: 1, 
          scale: true, 
          axisLabel: { fontSize: 9, color: "#858585" },
          splitLine: {
            show: true,
            lineStyle: {
              color: "rgba(133, 133, 133, 0.15)",
              type: "dashed",
              width: 1,
            },
          },
        },
      ],
      series: [
        { name: t("stock.price"), type: "line", data: closes, symbol: "none", lineStyle: { color: "#007acc", width: 1.5 } },
        { name: "MA5", type: "line", data: ma5, symbol: "none", lineStyle: { color: "#ffff00", width: 1 } },
        { name: "MA10", type: "line", data: ma10, symbol: "none", lineStyle: { color: "#00ffff", width: 1 } },
        { name: "MA20", type: "line", data: ma20, symbol: "none", lineStyle: { color: "#ff00ff", width: 1 } },
        { name: t("stock.volume"), type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: volumes.map((v, i) => ({ value: v, itemStyle: { color: closes[i] >= (closes[i-1] || closes[i]) ? "#2ecc71" : "#e74c3c" } })) },
      ],
      tooltip: { trigger: "axis", backgroundColor: "rgba(37, 37, 38, 0.95)", textStyle: { color: "#ccc", fontSize: 10 } },
      legend: { data: [t("stock.price"), "MA5", "MA10", "MA20"], textStyle: { color: "#858585", fontSize: 8 }, top: 0 },
    };
  }
}
