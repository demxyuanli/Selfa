import { StockData, IndicatorType, OscillatorType, IndicatorParams, GannConfig } from "../types";
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
} from "../../../utils/technicalIndicators";
import { calculateGannSquareOf9, calculateReferencePrice } from "../../../utils/gannSquareOf9";
import { detectSignals } from "../../../utils/signalDetection";

export interface ChartOptionParams {
  klineData: StockData[];
  overlayIndicator: IndicatorType;
  oscillatorType: OscillatorType;
  showSignals: boolean;
  showGann: boolean;
  indicatorParams: IndicatorParams;
  gannConfig: GannConfig;
  t: (key: string) => string;
}

export function generateChartOption(params: ChartOptionParams): any {
  const {
    klineData,
    overlayIndicator,
    oscillatorType,
    showSignals,
    showGann,
    indicatorParams,
    gannConfig,
    t,
  } = params;

  if (!klineData || klineData.length === 0) return {};

  const dates = klineData.map((d) => (d.date.includes(" ") ? d.date.split(" ")[0] : d.date));
  const closes = klineData.map((d) => d.close);
  const highs = klineData.map((d) => d.high);
  const lows = klineData.map((d) => d.low);
  const candlestickData = klineData.map((d) => [d.open, d.close, d.low, d.high]);
  const volumes = klineData.map((d) => ({
    value: d.volume,
    itemStyle: { color: d.close >= d.open ? "#ff0000" : "#00ff00" },
  }));

  const series: any[] = [];
  const grids: any[] = [
    { left: "8%", right: "3%", top: "18%", height: oscillatorType !== "none" ? "48%" : "62%" },
    { left: "8%", right: "3%", top: oscillatorType !== "none" ? "68%" : "83%", height: "15%" },
  ];

  if (oscillatorType !== "none") {
    grids.push({ left: "8%", right: "3%", top: "86%", height: "10%" });
  }

  const supportLevel = Math.min(...lows.slice(-20));
  const resistanceLevel = Math.max(...highs.slice(-20));

  const candlestickMarkLineData: any[] = [
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
  ];

  if (showGann) {
    const referencePrice = calculateReferencePrice(gannConfig.referenceMode, klineData, gannConfig.customReferencePrice || undefined);
    const anglesToUse = gannConfig.showMajorAngles ? [90, 180, 270, 360] : gannConfig.angles;
    const gannResult = calculateGannSquareOf9({
      referencePrice,
      angles: anglesToUse,
      cycles: gannConfig.cycles,
    });

    const visibleLevels = gannResult.levels.filter((level) => {
      if (level.type === "support" && !gannConfig.showSupport) return false;
      if (level.type === "resistance" && !gannConfig.showResistance) return false;
      return true;
    });

    const priceMin = Math.min(...lows);
    const priceMax = Math.max(...highs);
    const priceRange = Math.max(priceMax - priceMin, priceMin * 0.01);
    const extendedMin = priceMin - priceRange * 0.5;
    const extendedMax = priceMax + priceRange * 0.5;

    const filteredLevels = visibleLevels.filter((level) => level.price >= extendedMin && level.price <= extendedMax);

    filteredLevels.forEach((level) => {
      const isMajorAngle = [90, 180, 270, 360].includes(level.angle);
      const lineColor = level.type === "support" ? (isMajorAngle ? "#00ff00" : "rgba(0, 255, 0, 0.5)") : isMajorAngle ? "#ff0000" : "rgba(255, 0, 0, 0.5)";
      const lineWidth = isMajorAngle ? 1.5 : 1;
      const lineType = isMajorAngle ? "solid" : "dashed";

      candlestickMarkLineData.push({
        yAxis: level.price,
        label: {
          show: isMajorAngle,
          position: "insideEndRight",
          formatter: `${level.type === "support" ? t("analysis.gannSupport") : t("analysis.gannResistance")} ${level.angle}°: ${level.price.toFixed(2)}`,
          fontSize: 9,
          color: lineColor,
        },
        lineStyle: {
          color: lineColor,
          width: lineWidth,
          type: lineType,
        },
      });
    });
  }

  series.push({
    name: t("index.dailyK"),
    type: "candlestick",
    data: candlestickData,
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
      data: candlestickMarkLineData,
    },
  });

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

  if (showSignals) {
    const signals = detectSignals(klineData, showSignals);
    const signalData = dates.map((_date, idx) => {
      const signal = signals.find((s) => s.date === klineData[idx].date);
      return signal ? (signal.type === "golden" ? closes[idx] : null) : null;
    });
    const signalData2 = dates.map((_date, idx) => {
      const signal = signals.find((s) => s.date === klineData[idx].date);
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
      },
      {
        name: t("analysis.deathCross"),
        type: "scatter",
        data: signalData2,
        symbol: "triangle",
        symbolRotate: 180,
        symbolSize: 10,
        itemStyle: { color: "#FF69B4" },
      }
    );
  }

  series.push({
    name: t("stock.volume"),
    type: "bar",
    xAxisIndex: 1,
    yAxisIndex: 1,
    data: volumes,
  });

  const xAxis: any[] = [
    { type: "category", data: dates, gridIndex: 0, axisLabel: { fontSize: 9, color: "#858585" }, splitLine: { show: false }, axisPointer: { snap: true } },
    { type: "category", data: dates, gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false }, axisPointer: { snap: true } },
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
  ];

  if (oscillatorType === "rsi") {
    const rsi = calculateRSI(closes, indicatorParams.rsiPeriod);
    xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" }, splitLine: { show: false }, axisPointer: { snap: true } });
    yAxis.push({
      type: "value",
      gridIndex: 2,
      min: 0,
      max: 100,
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
    series.push({
      name: t("analysis.rsi"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: rsi,
      symbol: "none",
      lineStyle: { color: "#9b59b6", width: 1.5 },
      markLine: {
        silent: true,
        symbol: "none",
        data: [
          {
            yAxis: 70,
            name: t("analysis.overbought"),
            lineStyle: { color: "#ff0000", type: "dashed", width: 1 },
            label: {
              show: true,
              position: "insideEndRight",
              formatter: t("analysis.overboughtZone"),
              fontSize: 9,
              color: "#ff0000",
            },
          },
          {
            yAxis: 30,
            name: t("analysis.oversold"),
            lineStyle: { color: "#00ff00", type: "dashed", width: 1 },
            label: {
              show: true,
              position: "insideEndRight",
              formatter: t("analysis.oversoldZone"),
              fontSize: 9,
              color: "#00ff00",
            },
          },
        ],
      },
      markArea: {
        silent: true,
        itemStyle: {
          color: "rgba(255, 0, 0, 0.1)",
        },
        data: [[{ yAxis: 70 }, { yAxis: 100 }]],
        label: {
          show: true,
          position: "inside",
          formatter: t("analysis.overboughtZone"),
          fontSize: 9,
          color: "#ff0000",
        },
      },
    });
    series.push({
      name: t("analysis.oversoldZone"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: [],
      markArea: {
        silent: true,
        itemStyle: {
          color: "rgba(0, 255, 0, 0.1)",
        },
        data: [[{ yAxis: 0 }, { yAxis: 30 }]],
        label: {
          show: true,
          position: "inside",
          formatter: t("analysis.oversoldZone"),
          fontSize: 9,
          color: "#00ff00",
        },
      },
      lineStyle: { opacity: 0 },
      symbol: "none",
    });
  } else if (oscillatorType === "macd") {
    const macd = calculateMACD(closes, indicatorParams.macdFast, indicatorParams.macdSlow, indicatorParams.macdSignal);
    xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" }, splitLine: { show: false }, axisPointer: { snap: true } });
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
      name: t("analysis.zeroLine"),
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
      axisPointer: { snap: true },
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
      name: t("analysis.overbought100"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(100),
      symbol: "none",
      lineStyle: { color: "#ff0000", width: 1, type: "dashed" },
    });
    series.push({
      name: t("analysis.oversold100"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(-100),
      symbol: "none",
      lineStyle: { color: "#00ff00", width: 1, type: "dashed" },
    });
    series.push({
      name: t("analysis.zeroLine"),
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
      name: t("analysis.plusDI"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: adxData.plusDI,
      symbol: "none",
      lineStyle: { color: "#00ff00", width: 1 },
    });
    series.push({
      name: t("analysis.minusDI"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: adxData.minusDI,
      symbol: "none",
      lineStyle: { color: "#ff0000", width: 1 },
    });
    series.push({
      name: t("analysis.trendStrength25"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(25),
      symbol: "none",
      lineStyle: { color: "#ff9800", width: 1, type: "dashed" },
    });
  } else if (oscillatorType === "dmi") {
    const dmiData = calculateADX(highs, lows, closes, 14);
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
      name: t("analysis.plusDIFull"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: dmiData.plusDI,
      symbol: "none",
      lineStyle: { color: "#00ff00", width: 1.5 },
    });
    series.push({
      name: t("analysis.minusDIFull"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: dmiData.minusDI,
      symbol: "none",
      lineStyle: { color: "#ff0000", width: 1.5 },
    });
    series.push({
      name: t("analysis.adxTrendStrength"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: dmiData.adx,
      symbol: "none",
      lineStyle: { color: "#9c27b0", width: 1, type: "dashed" },
    });
    series.push({
      name: t("analysis.trendStrength25"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(25),
      symbol: "none",
      lineStyle: { color: "#ff9800", width: 1, type: "dashed" },
    });
  } else if (oscillatorType === "stochrsi") {
    const stochRsiData = calculateStochRSI(
      closes,
      indicatorParams.stochRsiRsiPeriod,
      indicatorParams.stochRsiStochPeriod,
      indicatorParams.stochRsiKPeriod,
      indicatorParams.stochRsiDPeriod
    );
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
      name: t("analysis.stochRsiK"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: stochRsiData.k,
      symbol: "none",
      lineStyle: { color: "#2196f3", width: 1.5 },
    });
    series.push({
      name: t("analysis.stochRsiD"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: stochRsiData.d,
      symbol: "none",
      lineStyle: { color: "#ff5722", width: 1.5 },
    });
    series.push({
      name: t("analysis.overbought80"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(80),
      symbol: "none",
      lineStyle: { color: "#ff0000", width: 1, type: "dashed" },
    });
    series.push({
      name: t("analysis.oversold20"),
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
    xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585", formatter: (value: number) => `${value}%` }, axisPointer: { snap: true } });
    yAxis.push({
      type: "value",
      gridIndex: 2,
      min: 0,
      max: 100,
      axisLabel: { fontSize: 9, color: "#858585", formatter: (value: number) => `${value}%` },
    });
    series.push({
      name: t("analysis.bbPercent"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: bbPercent,
      symbol: "none",
      lineStyle: { color: "#9c27b0", width: 1.5 },
    });
    series.push({
      name: t("analysis.overbought80Percent"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(80),
      symbol: "none",
      lineStyle: { color: "#ff0000", width: 1, type: "dashed" },
    });
    series.push({
      name: t("analysis.oversold20Percent"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(20),
      symbol: "none",
      lineStyle: { color: "#00ff00", width: 1, type: "dashed" },
    });
    series.push({
      name: t("analysis.middle50Percent"),
      type: "line",
      xAxisIndex: 2,
      yAxisIndex: 2,
      data: new Array(dates.length).fill(50),
      symbol: "none",
      lineStyle: { color: "#666", width: 1, type: "dashed" },
    });
  }

  const supportLevelForTooltip = supportLevel;
  const resistanceLevelForTooltip = resistanceLevel;

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
              value = `O:${p.value[0].toFixed(2)} H:${p.value[1].toFixed(2)} L:${p.value[2].toFixed(2)} C:${p.value[3].toFixed(2)}`;
            } else {
              value = typeof p.value === "number" ? p.value.toFixed(2) : p.value;
            }
            result += `<div style="margin: 2px 0;">
              <span style="display:inline-block;width:8px;height:8px;background:${p.color};border-radius:50%;margin-right:4px;"></span>
              ${p.seriesName}: <strong>${value}</strong>
            </div>`;
          }
        });

        if (idx >= 0 && idx < klineData.length) {
          const data = klineData[idx];
          const distToSupport = ((data.close - supportLevelForTooltip) / supportLevelForTooltip * 100).toFixed(2);
          const distToResistance = ((resistanceLevelForTooltip - data.close) / resistanceLevelForTooltip * 100).toFixed(2);
          result += `<div style="margin-top: 6px;padding-top: 6px;border-top: 1px solid #555;">
            <div>${t("analysis.supportLevel")}: ${supportLevelForTooltip.toFixed(2)} (${distToSupport}%)</div>
            <div>${t("analysis.resistanceLevel")}: ${resistanceLevelForTooltip.toFixed(2)} (${distToResistance}%)</div>
          </div>`;
        }

        return result;
      },
    },
    legend: {
      data: series.map((s) => s.name).filter(Boolean),
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
