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
  const opens = data.map(d => d.open);
  const volumes = data.map(d => d.volume);

  if (analysisType === "timeseries") {
    // Generate standard trading minutes
    const generateTradingMinutes = () => {
        const times: string[] = [];
        // Morning 09:30 - 11:30
        for (let h = 9; h <= 11; h++) {
          for (let m = 0; m < 60; m++) {
            if (h === 9 && m < 30) continue;
            if (h === 11 && m > 30) break;
            times.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
          }
        }
        // Afternoon 13:00 - 15:00
        for (let h = 13; h <= 15; h++) {
          for (let m = 0; m < 60; m++) {
            if (h === 15 && m > 0) break;
            times.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
          }
        }
        return times;
    };

    const fullDayTimes = generateTradingMinutes();

    // Map existing data to standard times
    const timeToDataMap = new Map<string, StockData>();
    timeSeriesData.forEach(d => {
        const timePart = d.date.includes(" ") ? d.date.split(" ")[1].substring(0, 5) : d.date.substring(0, 5);
        timeToDataMap.set(timePart, d);
    });

    const alignedCloses = fullDayTimes.map(t => timeToDataMap.get(t)?.close ?? null);
    const alignedVolumes = fullDayTimes.map(t => timeToDataMap.get(t)?.volume ?? null);
    
    // Calculate MA on original data then map
    const denseCloses = timeSeriesData.map(d => d.close);
    const denseMa = denseCloses.map((_, i) => i < tsParams.maPeriod - 1 ? null : calculateMA(denseCloses.slice(0, i + 1), tsParams.maPeriod));
    
    const alignedMa = fullDayTimes.map(t => {
        const d = timeToDataMap.get(t);
        if (!d) return null;
        const idx = timeSeriesData.findIndex(item => (item.date.includes(" ") ? item.date.split(" ")[1].substring(0, 5) : item.date.substring(0, 5)) === t);
        if (idx !== -1) return denseMa[idx];
        return null;
    });

    return {
      backgroundColor: "transparent",
      axisPointer: {
        link: [{ xAxisIndex: [0, 1] }],
        snap: true,
        label: {
          backgroundColor: "#777",
        },
      },
      grid: [{ left: "8%", right: "3%", top: "8%", height: "55%" }, { left: "8%", right: "3%", top: "70%", height: "25%" }],
      xAxis: [
        { type: "category", data: fullDayTimes, gridIndex: 0, axisLabel: { fontSize: 9, color: "#858585" }, axisPointer: { snap: true } },
        { type: "category", data: fullDayTimes, gridIndex: 1, axisLabel: { show: false }, axisPointer: { snap: true } },
      ],
      yAxis: [
        { type: "value", gridIndex: 0, scale: true, axisPointer: { snap: true }, axisLabel: { fontSize: 9, color: "#858585" } },
        { type: "value", gridIndex: 1, scale: true, axisPointer: { snap: true }, axisLabel: { fontSize: 9, color: "#858585" } },
      ],
      series: [
        { name: t("stock.price"), type: "line", data: alignedCloses, symbol: "none", connectNulls: true, lineStyle: { color: "#007acc", width: 1.5 } },
        { name: `MA${tsParams.maPeriod}`, type: "line", data: alignedMa, symbol: "none", connectNulls: true, lineStyle: { color: "#f39c12", width: 1, type: "dashed" } },
        { name: t("stock.volume"), type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: alignedVolumes, itemStyle: { color: "#3498db" } },
      ],
      tooltip: { 
        trigger: "axis", 
        axisPointer: { type: "cross", snap: true },
        backgroundColor: "rgba(37, 37, 38, 0.95)", 
        textStyle: { color: "#ccc", fontSize: 10 } 
      },
    };
  } else {
    const ma5 = closes.map((_, i) => i < 4 ? null : calculateMA(closes.slice(0, i + 1), 5));
    const ma10 = closes.map((_, i) => i < 9 ? null : calculateMA(closes.slice(0, i + 1), 10));
    const ma20 = closes.map((_, i) => i < 19 ? null : calculateMA(closes.slice(0, i + 1), 20));
    
    return {
      backgroundColor: "transparent",
      axisPointer: {
        link: [{ xAxisIndex: [0, 1] }],
        snap: true,
        label: {
          backgroundColor: "#777",
        },
      },
      grid: [{ left: "8%", right: "3%", top: "8%", height: "55%" }, { left: "8%", right: "3%", top: "70%", height: "25%" }],
      xAxis: [
        { 
          type: "category", 
          data: dates, 
          gridIndex: 0, 
          axisLabel: { fontSize: 9, color: "#858585" },
          splitLine: { show: false },
          axisPointer: { snap: true },
        },
        { 
          type: "category", 
          data: dates, 
          gridIndex: 1, 
          axisLabel: { fontSize: 9, color: "#858585" },
          splitLine: { show: false },
          axisPointer: { snap: true },
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
        { name: t("stock.volume"), type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: volumes.map((v, i) => ({ value: v, itemStyle: { color: closes[i] >= opens[i] ? "#ff0000" : "#00ff00" } })) },
      ],
      tooltip: { 
        trigger: "axis", 
        axisPointer: { type: "cross", snap: true },
        backgroundColor: "rgba(37, 37, 38, 0.95)", 
        textStyle: { color: "#ccc", fontSize: 10 } 
      },
      legend: { data: [t("stock.price"), "MA5", "MA10", "MA20"], textStyle: { color: "#858585", fontSize: 8 }, top: 0 },
    };
  }
}
