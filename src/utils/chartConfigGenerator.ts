// Chart Configuration Generator for K-Line Chip Analysis

import { StockData } from "./technicalIndicators";
import { ChipDistributionResult } from "./chipDistribution";
import {
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  calculateVWAP,
  calculateRSI,
  calculateMACD,
  calculateKDJ,
  calculateStochRSI,
  calculateADX,
  calculateCCI,
} from "./technicalIndicators";

export type IndicatorType = "sma" | "ema" | "bollinger" | "vwap" | "none";
export type OscillatorType = "rsi" | "macd" | "kdj" | "momentum" | "cci" | "adx" | "dmi" | "stochrsi" | "bbpercent" | "none";

export interface IndicatorParams {
  rsiPeriod: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  kdjPeriod: number;
  momentumPeriod: number;
  cciPeriod: number;
  adxPeriod: number;
  stochRsiRsiPeriod: number;
  stochRsiStochPeriod: number;
  stochRsiKPeriod: number;
  stochRsiDPeriod: number;
  bbPercentPeriod: number;
}

export interface ChartConfigOptions {
  klineData: StockData[];
  overlayIndicator: IndicatorType;
  oscillatorType: OscillatorType;
  showSignals: boolean;
  chipData: ChipDistributionResult | null;
  indicatorParams: IndicatorParams;
  selectedDateIndex?: number | null;
  chipCalculationData?: StockData[]; // Add this to track the data used for chip calculation
  t: (key: string) => string;
}

export function generateChartConfig(options: ChartConfigOptions): any {
  const { klineData, overlayIndicator, oscillatorType, showSignals, chipData, indicatorParams, selectedDateIndex, chipCalculationData, t } = options;

  if (!klineData || klineData.length === 0) return {};

  const dates = klineData.map(d => d.date.includes(" ") ? d.date.split(" ")[0] : d.date);
  const closes = klineData.map(d => d.close);
  const highs = klineData.map(d => d.high);
  const lows = klineData.map(d => d.low);
  const volumes = klineData.map((d) => ({
    value: d.volume,
    itemStyle: { color: d.close >= d.open ? "#ff0000" : "#00ff00" }
  }));

  const series: any[] = [];
  const grids: any[] = [
    { left: "8%", right: chipData ? "22%" : "3%", top: "18%", height: oscillatorType !== "none" ? "48%" : "62%" }, // Main chart
    { left: "8%", right: chipData ? "22%" : "3%", top: oscillatorType !== "none" ? "68%" : "83%", height: "15%" }, // Volume
  ];

  if (oscillatorType !== "none") {
    grids.push({ left: "8%", right: chipData ? "22%" : "3%", top: "86%", height: "10%" }); // Oscillator
  }

  // Add chip distribution grid if available
  // Position it to the right of the main K-line chart, aligned at the right boundary
  if (chipData) {
    grids.push({
      left: "78%",  // Start from the right boundary of K-line chart (8% + 70% = 78%)
      right: "3%",
      top: "18%",
      height: oscillatorType !== "none" ? "48%" : "62%",
    });
  }

  // Calculate support and resistance levels
  const supportLevel = Math.min(...lows.slice(-20));
  const resistanceLevel = Math.max(...highs.slice(-20));

  // Main candlestick chart
  series.push({
    name: t("index.dailyK"),
    type: "candlestick",
    data: klineData.map(d => [d.open, d.close, d.low, d.high]),
    itemStyle: {
      color: "#ff0000",
      color0: "#00ff00",
      borderColor: "#ff0000",
      borderColor0: "#00ff00",
    },
    markLine: {
      silent: true,
      symbol: "none",
      lineStyle: {
        color: "#858585",
        type: "dashed",
        width: 1,
      },
      data: [
        {
          name: t("analysis.supportLevel"),
          yAxis: supportLevel,
          label: {
            show: true,
            position: "insideEndRight",
            formatter: `${t("analysis.supportLevel")}: ${supportLevel.toFixed(2)}`,
            fontSize: 9,
            color: "#00ff00",
          },
        },
        {
          name: t("analysis.resistanceLevel"),
          yAxis: resistanceLevel,
          label: {
            show: true,
            position: "insideEndRight",
            formatter: `${t("analysis.resistanceLevel")}: ${resistanceLevel.toFixed(2)}`,
            fontSize: 9,
            color: "#ff0000",
          },
        },
      ],
    },
  });

  // Overlay indicators
  if (overlayIndicator === "sma") {
    const ma5 = calculateSMA(closes, 5);
    const ma10 = calculateSMA(closes, 10);
    const ma20 = calculateSMA(closes, 20);
    series.push(
      { name: t("analysis.ma5"), type: "line", data: ma5, symbol: "none", lineStyle: { color: "#ffff00", width: 1 } },
      { name: t("analysis.ma10"), type: "line", data: ma10, symbol: "none", lineStyle: { color: "#00ffff", width: 1 } },
      { name: t("analysis.ma20"), type: "line", data: ma20, symbol: "none", lineStyle: { color: "#ff00ff", width: 1 } }
    );
  } else if (overlayIndicator === "ema") {
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    series.push(
      { name: t("analysis.ema12"), type: "line", data: ema12, symbol: "none", lineStyle: { color: "#ffff00", width: 1 } },
      { name: t("analysis.ema26"), type: "line", data: ema26, symbol: "none", lineStyle: { color: "#00ffff", width: 1 } }
    );
  } else if (overlayIndicator === "bollinger") {
    const bb = calculateBollingerBands(closes, 20, 2);
    series.push(
      { name: t("analysis.upper"), type: "line", data: bb.upper, symbol: "none", lineStyle: { color: "#00BCD4", width: 1.5, type: "dashed" } },
      { name: t("analysis.middle"), type: "line", data: bb.middle, symbol: "none", lineStyle: { color: "#FFC107", width: 1.5 } },
      { name: t("analysis.lower"), type: "line", data: bb.lower, symbol: "none", lineStyle: { color: "#00BCD4", width: 1.5, type: "dashed" } }
    );
  } else if (overlayIndicator === "vwap") {
    const vwap = calculateVWAP(klineData);
    series.push({ name: t("analysis.overlayVWAP"), type: "line", data: vwap, symbol: "none", lineStyle: { color: "#00bcd4", width: 1.5 } });
  }

  // Trading signals
  if (showSignals) {
    const signals = detectSignals(klineData, closes);
    const signalData = dates.map((_date, idx) => {
      const signal = signals.find(s => s.date === klineData[idx].date);
      return signal ? (signal.type === "golden" ? closes[idx] : null) : null;
    });
    const signalData2 = dates.map((_date, idx) => {
      const signal = signals.find(s => s.date === klineData[idx].date);
      return signal ? (signal.type === "death" ? closes[idx] : null) : null;
    });
    series.push(
      {
        name: t("analysis.goldenCross"),
        type: "scatter",
        data: signalData,
        symbol: "triangle",
        symbolSize: 10,
        itemStyle: { color: "#FFD700" },
        markPoint: {
          data: signals.filter(s => s.type === "golden").map(s => ({
            name: t("analysis.goldenCross"),
            coord: [dates.findIndex(d => d === (s.date.includes(" ") ? s.date.split(" ")[0] : s.date)), s.price],
            symbol: "triangle",
            symbolSize: 12,
            itemStyle: { color: "#FFD700" },
          })),
        },
      },
      {
        name: t("analysis.deathCross"),
        type: "scatter",
        data: signalData2,
        symbol: "triangle",
        symbolSize: 10,
        itemStyle: { color: "#FF69B4" },
        markPoint: {
          data: signals.filter(s => s.type === "death").map(s => ({
            name: t("analysis.deathCross"),
            coord: [dates.findIndex(d => d === (s.date.includes(" ") ? s.date.split(" ")[0] : s.date)), s.price],
            symbol: "triangle",
            symbolSize: 12,
            itemStyle: { color: "#FF69B4" },
          })),
        },
      }
    );
  }

  // Volume chart
  series.push({
    name: t("stock.volume"),
    type: "bar",
    xAxisIndex: 1,
    yAxisIndex: 1,
    data: volumes,
  });

  // X and Y axes
  const xAxis: any[] = [
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
  ];
  const yAxis: any[] = [
    { 
      type: "value", 
      gridIndex: 0, 
      scale: true,
      axisPointer: { snap: true },
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
  ];

  // Oscillator indicators
  if (oscillatorType === "rsi") {
    const rsi = calculateRSI(closes, indicatorParams.rsiPeriod);
    xAxis.push({ 
      type: "category", 
      data: dates, 
      gridIndex: 2, 
      axisLabel: { fontSize: 9, color: "#858585" },
      axisPointer: { snap: true },
    });
    yAxis.push({
      type: "value",
      gridIndex: 2,
      min: 0,
      max: 100,
      axisPointer: { snap: true },
      axisLabel: { fontSize: 9, color: "#858585" },
    });
    series.push({
      name: t("analysis.rsi"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: rsi,
      symbol: "none",
      lineStyle: { color: "#9b59b6", width: 1.5 },
      markArea: {
        itemStyle: {
          color: "rgba(255, 152, 0, 0.1)",
        },
        data: [
          [{ yAxis: 70 }, { yAxis: 100 }],
        ],
      },
      markLine: {
        silent: true,
        symbol: "none",
        lineStyle: {
          color: "#ff9800",
          type: "dashed",
          width: 1,
        },
        data: [
          {
            name: t("analysis.overbought"),
            yAxis: 70,
            label: {
              show: true,
              position: "insideEndRight",
              formatter: t("analysis.overbought"),
              fontSize: 8,
              color: "#ff9800",
            },
          },
          {
            name: t("analysis.oversold"),
            yAxis: 30,
            label: {
              show: true,
              position: "insideEndRight",
              formatter: t("analysis.oversold"),
              fontSize: 8,
              color: "#ff9800",
            },
          },
        ],
      },
    });
    series.push({
      name: "RSI Overbought Area",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(70),
      symbol: "none",
      lineStyle: { opacity: 0 },
      markArea: {
        itemStyle: {
          color: "rgba(255, 152, 0, 0.1)",
        },
        data: [
          [{ yAxis: 70 }, { yAxis: 100 }],
        ],
      },
    });
  } else if (oscillatorType === "macd") {
    const macd = calculateMACD(closes, indicatorParams.macdFast, indicatorParams.macdSlow, indicatorParams.macdSignal);
    xAxis.push({ 
      type: "category", 
      data: dates, 
      gridIndex: 2, 
      axisLabel: { fontSize: 9, color: "#858585" },
      axisPointer: { snap: true },
    });
    yAxis.push({ 
      type: "value", 
      gridIndex: 2,
      axisPointer: { snap: true },
      axisLabel: { fontSize: 9, color: "#858585" },
      splitLine: {
        show: true,
        lineStyle: {
          color: "rgba(133, 133, 133, 0.15)",
          type: "dashed",
          width: 1,
        },
      },
    });
    series.push(
      {
        name: t("analysis.macd"),
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: macd.macdLine,
        symbol: "none",
        lineStyle: { color: "#007acc", width: 1.5 },
      },
      {
        name: t("analysis.macdSignal"),
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: macd.signalLine,
        symbol: "none",
        lineStyle: { color: "#f39c12", width: 1 },
      },
      {
        name: t("analysis.macdHistogram"),
        type: "bar",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: macd.histogram.map((v) => ({
          value: v,
          itemStyle: { color: v !== null && v > 0 ? "#00ff00" : "#ff0000" },
        })),
      }
    );
  } else if (oscillatorType === "kdj") {
    const kdj = calculateKDJ(highs, lows, closes, indicatorParams.kdjPeriod);
    xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" }, axisPointer: { snap: true } });
    yAxis.push({
      type: "value",
      gridIndex: 2,
      min: 0,
      max: 100,
      axisPointer: { snap: true },
      axisLabel: { fontSize: 9, color: "#858585" },
    });
    series.push(
      { name: t("analysis.kdjK"), type: "line", xAxisIndex: 2, yAxisIndex: 2, data: kdj.k, symbol: "none", lineStyle: { color: "#ffff00", width: 1 } },
      { name: t("analysis.kdjD"), type: "line", xAxisIndex: 2, yAxisIndex: 2, data: kdj.d, symbol: "none", lineStyle: { color: "#00ffff", width: 1 } },
      { name: t("analysis.kdjJ"), type: "line", xAxisIndex: 2, yAxisIndex: 2, data: kdj.j, symbol: "none", lineStyle: { color: "#ff00ff", width: 1 } }
    );
  } else if (oscillatorType === "momentum") {
    const momentumData: (number | null)[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (i >= indicatorParams.momentumPeriod) {
        const momentum = ((closes[i] - closes[i - indicatorParams.momentumPeriod]) / closes[i - indicatorParams.momentumPeriod]) * 100;
        momentumData.push(momentum);
      } else {
        momentumData.push(null);
      }
    }

    xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" }, axisPointer: { snap: true } });
    yAxis.push({
      type: "value",
      gridIndex: 2,
      axisPointer: { snap: true },
      axisLabel: { fontSize: 9, color: "#858585", formatter: (value: number) => `${value.toFixed(1)}%` },
    });
    series.push({
      name: t("analysis.momentum"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: momentumData,
      symbol: "none",
      lineStyle: { color: "#ff9800", width: 1.5 },
      areaStyle: { opacity: 0.1, color: "#ff9800" },
    });
    series.push({
      name: "Zero Line",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(0),
      symbol: "none",
      lineStyle: { color: "#666", width: 1, type: "dashed" },
    });
  } else if (oscillatorType === "cci") {
    const cciData = calculateCCI(highs, lows, closes, indicatorParams.cciPeriod);
    xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" }, axisPointer: { snap: true } });
    yAxis.push({
      type: "value",
      gridIndex: 2,
      axisLabel: { fontSize: 9, color: "#858585" },
    });
    series.push({
      name: t("analysis.cci"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: cciData,
      symbol: "none",
      lineStyle: { color: "#e91e63", width: 1.5 },
    });
    series.push({
      name: "Overbought (+100)",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(100),
      symbol: "none",
      lineStyle: { color: "#ff0000", width: 1, type: "dashed" },
    });
    series.push({
      name: "Oversold (-100)",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(-100),
      symbol: "none",
      lineStyle: { color: "#00ff00", width: 1, type: "dashed" },
    });
    series.push({
      name: "Zero Line",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(0),
      symbol: "none",
      lineStyle: { color: "#666", width: 1, type: "dashed" },
    });
  } else if (oscillatorType === "adx") {
    const adxData = calculateADX(highs, lows, closes, indicatorParams.adxPeriod);
    xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" }, axisPointer: { snap: true } });
    yAxis.push({
      type: "value",
      gridIndex: 2,
      min: 0,
      max: 100,
      axisPointer: { snap: true },
      axisLabel: { fontSize: 9, color: "#858585" },
    });
    series.push({
      name: t("analysis.adx"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: adxData.adx,
      symbol: "none",
      lineStyle: { color: "#9c27b0", width: 1.5 },
    });
    series.push({
      name: "+DI",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: adxData.plusDI,
      symbol: "none",
      lineStyle: { color: "#00ff00", width: 1 },
    });
    series.push({
      name: "-DI",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: adxData.minusDI,
      symbol: "none",
      lineStyle: { color: "#ff0000", width: 1 },
    });
    series.push({
      name: "Trend Strength (25)",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(25),
      symbol: "none",
      lineStyle: { color: "#ff9800", width: 1, type: "dashed" },
    });
  } else if (oscillatorType === "dmi") {
    const dmiData = calculateADX(highs, lows, closes, indicatorParams.adxPeriod);
    xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" }, axisPointer: { snap: true } });
    yAxis.push({
      type: "value",
      gridIndex: 2,
      min: 0,
      max: 100,
      axisPointer: { snap: true },
      axisLabel: { fontSize: 9, color: "#858585" },
    });
    series.push({
      name: "+DI (Directional Indicator)",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: dmiData.plusDI,
      symbol: "none",
      lineStyle: { color: "#00ff00", width: 1.5 },
    });
    series.push({
      name: "-DI (Directional Indicator)",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: dmiData.minusDI,
      symbol: "none",
      lineStyle: { color: "#ff0000", width: 1.5 },
    });
    series.push({
      name: "ADX (Trend Strength)",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: dmiData.adx,
      symbol: "none",
      lineStyle: { color: "#9c27b0", width: 1, type: "dashed" },
    });
    series.push({
      name: "Trend Strength (25)",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(25),
      symbol: "none",
      lineStyle: { color: "#ff9800", width: 1, type: "dashed" },
    });
  } else if (oscillatorType === "stochrsi") {
    const stochRsiData = calculateStochRSI(closes, indicatorParams.stochRsiRsiPeriod, indicatorParams.stochRsiStochPeriod, indicatorParams.stochRsiKPeriod, indicatorParams.stochRsiDPeriod);
    xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" }, axisPointer: { snap: true } });
    yAxis.push({
      type: "value",
      gridIndex: 2,
      min: 0,
      max: 100,
      axisPointer: { snap: true },
      axisLabel: { fontSize: 9, color: "#858585" },
    });
    series.push({
      name: "StochRSI %K",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: stochRsiData.k,
      symbol: "none",
      lineStyle: { color: "#2196f3", width: 1.5 },
    });
    series.push({
      name: "StochRSI %D",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: stochRsiData.d,
      symbol: "none",
      lineStyle: { color: "#ff5722", width: 1.5 },
    });
    series.push({
      name: "Overbought (80)",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(80),
      symbol: "none",
      lineStyle: { color: "#ff0000", width: 1, type: "dashed" },
    });
    series.push({
      name: "Oversold (20)",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(20),
      symbol: "none",
      lineStyle: { color: "#00ff00", width: 1, type: "dashed" },
    });
  } else if (oscillatorType === "bbpercent") {
    const bb = calculateBollingerBands(closes, indicatorParams.bbPercentPeriod, 2);
    const bbPercent: (number | null)[] = [];
    for (let i = 0; i < closes.length; i++) {
      const upper = bb.upper[i];
      const lower = bb.lower[i];
      const price = closes[i];
      if (upper !== null && lower !== null && upper > lower) {
        const percent = ((price - lower) / (upper - lower)) * 100;
        bbPercent.push(percent);
      } else {
        bbPercent.push(null);
      }
    }
    xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" }, axisPointer: { snap: true } });
    yAxis.push({
      type: "value",
      gridIndex: 2,
      min: 0,
      max: 100,
      axisPointer: { snap: true },
      axisLabel: { fontSize: 9, color: "#858585", formatter: (value: number) => `${value}%` },
    });
    series.push({
      name: "BB %B",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: bbPercent,
      symbol: "none",
      lineStyle: { color: "#9c27b0", width: 1.5 },
    });
    series.push({
      name: "Overbought (80%)",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(80),
      symbol: "none",
      lineStyle: { color: "#ff0000", width: 1, type: "dashed" },
    });
    series.push({
      name: "Oversold (20%)",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(20),
      symbol: "none",
      lineStyle: { color: "#00ff00", width: 1, type: "dashed" },
    });
    series.push({
      name: "Middle (50%)",
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(50),
      symbol: "none",
      lineStyle: { color: "#666", width: 1, type: "dashed" },
    });
  }

  // Add chip distribution to the chart if available
  if (chipData && chipData.dailyDistributions) {
    const chipGridIndex = grids.length - 1;
    const minPrice = Math.min(...lows);
    const maxPrice = Math.max(...highs);
    const mainYAxis = yAxis[0];
    
    // Use value axis for chip amount (horizontal, from left to right)
    xAxis.push({
      type: "value",
      gridIndex: chipGridIndex,
      position: "bottom",
      min: 0,
      axisLabel: { show: false },
      splitLine: { show: false },
      axisPointer: { show: false }, // Chip xAxis should not participate in crosshair
    });

    const chipYAxisIndex = yAxis.length;
    yAxis.push({
      type: "value",
      gridIndex: chipGridIndex,
      scale: true,
      min: mainYAxis.min !== undefined ? mainYAxis.min : minPrice,
      max: mainYAxis.max !== undefined ? mainYAxis.max : maxPrice,
      position: "right",  // Position Y-axis on the right side to align with K-line chart boundary
      inverse: false,
      axisPointer: { 
        snap: true,
        show: true,
      },
      axisLabel: { show: false },
      splitLine: { show: false },
    });

    // Map selectedDateIndex from klineData to chipData.dailyDistributions
    // chipData.dailyDistributions is based on chipCalculationData, which may be longer than klineData
    let displayDateIndex = chipData.dailyDistributions.length - 1;
    if (selectedDateIndex !== null && selectedDateIndex !== undefined && selectedDateIndex >= 0 && selectedDateIndex < klineData.length) {
      const selectedDate = klineData[selectedDateIndex].date;
      const dateKey = selectedDate.includes(" ") ? selectedDate.split(" ")[0] : selectedDate;
      
      // Find the corresponding index in chipData.dailyDistributions
      const chipIndex = chipData.dailyDistributions.findIndex((dist) => {
        const distDateKey = dist.date.includes(" ") ? dist.date.split(" ")[0] : dist.date;
        return distDateKey === dateKey;
      });
      
      if (chipIndex >= 0 && chipIndex < chipData.dailyDistributions.length) {
        displayDateIndex = chipIndex;
      } else {
        // Fallback: try to use selectedDateIndex if chipCalculationData length matches klineData
        if (chipCalculationData && chipCalculationData.length === klineData.length && selectedDateIndex < chipData.dailyDistributions.length) {
          displayDateIndex = selectedDateIndex;
        }
      }
    }
    
    const dayDist = chipData.dailyDistributions[displayDateIndex];
    // Get the price from the corresponding klineData or chipCalculationData
    const dayPrice = (selectedDateIndex !== null && selectedDateIndex !== undefined && selectedDateIndex >= 0 && selectedDateIndex < closes.length)
      ? closes[selectedDateIndex]
      : (chipCalculationData && displayDateIndex < chipCalculationData.length ? chipCalculationData[displayDateIndex].close : closes[closes.length - 1]);
    
    // Find max chip amount for this day for scaling
    const maxChipAmount = Math.max(...dayDist.chipAmounts, 1);
    
    // Create data for the selected day's chip distribution
    const chipSeriesData: Array<[number, number]> = [];
    
    for (let priceIdx = 0; priceIdx < chipData.priceLevels.length; priceIdx++) {
      const price = chipData.priceLevels[priceIdx];
      const amount = dayDist.chipAmounts[priceIdx];
      if (amount > 0) {
        chipSeriesData.push([amount, price]);
      }
    }
    
    // Update X-axis max based on current day's max amount
    const chipXAxis = xAxis[xAxis.length - 1];
    if (chipXAxis && chipXAxis.type === "value") {
      chipXAxis.max = maxChipAmount * 1.1;
    }
    
    // Create a custom series that renders flame chart for the selected day
    series.push({
      name: t("analysis.chipDistribution"),
      type: "custom",
      xAxisIndex: chipGridIndex,
      yAxisIndex: chipYAxisIndex,
      renderItem: (params: any, api: any) => {
        const amount = api.value(0);
        const price = api.value(1);
        
        if (amount <= 0) return null;
        
        // Get coordinate for this price
        const pricePoint = api.coord([amount, price]);
        // Get coordinate for the start (left edge, which is K-line chart right boundary)
        const startPoint = api.coord([0, price]);
        const barWidth = pricePoint[0] - startPoint[0];
        
        const isProfit = price < dayPrice;
        
        // Calculate bar height (based on price bin size)
        const binHeight = params.coordSys.height / chipData.priceLevels.length;
        
        return {
          type: "rect",
          shape: {
            x: startPoint[0],  // Start from left (K-line chart right boundary)
            y: pricePoint[1] - binHeight * 0.4,
            width: barWidth,  // Extend to the right based on amount
            height: binHeight * 0.8,
          },
          style: {
            fill: isProfit ? "#ff4444" : "#44aa44",
            opacity: 0.8,
            stroke: isProfit ? "#ff6666" : "#66bb66",
            lineWidth: 0.5,
          },
        };
      },
      data: chipSeriesData,
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          const amount = params.value[0];
          const price = params.value[1];
          const isProfit = price < dayPrice;
          const dayDate = dates[displayDateIndex] || "";
          return `<div>
            <div><strong>${t("stock.date")}: ${dayDate}</strong></div>
            <div><strong>${t("stock.price")}: ${price.toFixed(2)}</strong></div>
            <div>${t("analysis.chipAmount")}: ${amount.toFixed(0)}</div>
            <div style="color: ${isProfit ? "#ff4444" : "#44aa44"}">
              ${isProfit ? t("analysis.profitChip") : t("analysis.lossChip")}
            </div>
          </div>`;
        },
      },
    });

    // Add average cost line for the selected day
    series.push({
      name: t("analysis.avgCost"),
      type: "line",
      xAxisIndex: chipGridIndex,
      yAxisIndex: chipYAxisIndex,
      data: [[0, dayDist.avgCost], [maxChipAmount * 1.1, dayDist.avgCost]],
      symbol: "none",
      lineStyle: { color: "#FFD700", width: 2, type: "solid" },
      z: 10,
    });

    // Add current price line for the selected day
    series.push({
      name: t("stock.price"),
      type: "line",
      xAxisIndex: chipGridIndex,
      yAxisIndex: chipYAxisIndex,
      data: [[0, dayPrice], [maxChipAmount * 1.1, dayPrice]],
      symbol: "none",
      lineStyle: { color: "#2196F3", width: 1.5, type: "dashed" },
      z: 10,
    });
  }

  return {
    backgroundColor: "transparent",
    axisPointer: {
      link: [{ xAxisIndex: "all" }],
      snap: true,
      label: {
        backgroundColor: "#777",
      },
    },
    grid: grids,
    xAxis,
    yAxis,
    graphic: [
      {
        type: "text",
        left: "center",
        top: "1%",
        style: {
          text: `${t("analysis.overlayIndicator")}: ${overlayIndicator !== "none" ? overlayIndicator.toUpperCase() : t("analysis.overlayNone")} | ${t("analysis.oscillator")}: ${oscillatorType !== "none" ? oscillatorType.toUpperCase() : t("analysis.oscillatorNone")}`,
          fontSize: 10,
          fontWeight: "bold",
          fill: "#858585",
        },
      },
    ],
    series,
    tooltip: {
      trigger: "axis",
      axisPointer: { 
        type: "cross", 
        snap: true,
        link: [{ xAxisIndex: "all" }],
        crossStyle: {
          color: "#007acc",
          width: 1,
          type: "dashed",
        },
        lineStyle: {
          color: "#007acc",
          width: 1,
          type: "dashed",
        },
        label: {
          backgroundColor: "#007acc",
          color: "#fff",
        },
      },
      backgroundColor: "rgba(37, 37, 38, 0.95)",
      borderColor: "#555",
      borderWidth: 1,
      textStyle: { color: "#ccc", fontSize: 10 },
      formatter: (params: any) => {
        if (!params || params.length === 0) return "";
        const param = params[0];
        const idx = param.dataIndex;
        let result = `<div style="margin-bottom: 4px;"><strong>${param.axisValue}</strong></div>`;
        params.forEach((p: any) => {
          if (p.value !== null && p.value !== undefined) {
            let value: string;
            if (Array.isArray(p.value)) {
              const o = p.value[0] != null ? p.value[0].toFixed(2) : "N/A";
              const h = p.value[1] != null ? p.value[1].toFixed(2) : "N/A";
              const l = p.value[2] != null ? p.value[2].toFixed(2) : "N/A";
              const c = p.value[3] != null ? p.value[3].toFixed(2) : "N/A";
              value = `O:${o} H:${h} L:${l} C:${c}`;
            } else {
              value = typeof p.value === "number" ? p.value.toFixed(2) : String(p.value || "");
            }
            result += `<div style="margin: 2px 0;">
              <span style="display:inline-block;width:8px;height:8px;background:${p.color};border-radius:50%;margin-right:4px;"></span>
              ${p.seriesName}: <strong>${value}</strong>
            </div>`;
          }
        });
        if (idx >= 0 && idx < klineData.length) {
          const data = klineData[idx];
          const distToSupport = ((data.close - supportLevel) / supportLevel * 100).toFixed(2);
          const distToResistance = ((resistanceLevel - data.close) / resistanceLevel * 100).toFixed(2);
          result += `<div style="margin-top: 6px;padding-top: 6px;border-top: 1px solid #555;">
            <div>${t("analysis.supportLevel")}: ${supportLevel.toFixed(2)} (${distToSupport}%)</div>
            <div>${t("analysis.resistanceLevel")}: ${resistanceLevel.toFixed(2)} (${distToResistance}%)</div>
          </div>`;
        }
        return result;
      },
    },
    legend: {
      data: series.map(s => s.name).filter(Boolean),
      textStyle: { color: "#858585", fontSize: 10 },
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 12,
      top: "4%",
      left: "center",
      orient: "horizontal",
    },
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1, oscillatorType !== "none" ? 2 : 1] },
      { show: true, type: "slider", xAxisIndex: [0, 1, oscillatorType !== "none" ? 2 : 1], top: "95%", height: 15 },
    ],
  };
}

function detectSignals(klineData: StockData[], closes: number[]): Array<{ date: string; type: "golden" | "death"; price: number }> {
  if (klineData.length < 20) return [];
  
  const ma5 = calculateSMA(closes, 5).filter(v => v !== null) as number[];
  const ma10 = calculateSMA(closes, 10).filter(v => v !== null) as number[];
  
  const signals: Array<{ date: string; type: "golden" | "death"; price: number }> = [];
  
  for (let i = 1; i < ma5.length; i++) {
    const idx5 = closes.length - ma5.length + i;
    const idx10 = closes.length - ma10.length + i;
    if (idx5 >= 0 && idx10 >= 0 && idx5 < klineData.length && idx10 < klineData.length) {
      const prev5 = ma5[i - 1];
      const curr5 = ma5[i];
      const prev10 = ma10[i - 1];
      const curr10 = ma10[i];
      
      if (prev5 < prev10 && curr5 > curr10) {
        signals.push({ date: klineData[idx5].date, type: "golden", price: closes[idx5] });
      } else if (prev5 > prev10 && curr5 < curr10) {
        signals.push({ date: klineData[idx5].date, type: "death", price: closes[idx5] });
      }
    }
  }
  
  return signals;
}
