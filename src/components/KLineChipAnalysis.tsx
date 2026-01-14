import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import "./StockAnalysis.css";
import "./KLineTechnicalAnalysis.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface KLineChipAnalysisProps {
  klineData: StockData[];
}

type IndicatorType = "sma" | "ema" | "bollinger" | "vwap" | "none";
type OscillatorType = "rsi" | "macd" | "kdj" | "none";

// Calculate Chip Distribution (Cost Distribution)
function calculateChipDistribution(
  data: StockData[],
  priceBins: number = 60,
  decayFactor: number = 0.95
): {
  priceLevels: number[];
  chipAmounts: number[];
  avgCost: number;
  profitRatio: number;
  concentration: number;
  mainPeaks: Array<{ price: number; amount: number }>;
  peakCount: number;
  isSinglePeak: boolean;
  isMultiPeak: boolean;
  position: "low" | "middle" | "high";
  peakPattern: "singleDense" | "multiPeak" | "scattered";
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
} | null {
  if (data.length < 20) return null;

  const closes = data.map(d => d.close);
  const volumes = data.map(d => d.volume);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const currentPrice = closes[closes.length - 1];

  // Find price range
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const priceRange = maxPrice - minPrice;
  const binSize = priceRange / priceBins;

  // Initialize chip distribution array
  const chipDistribution = new Array(priceBins).fill(0);
  const priceLevels: number[] = [];

  // Calculate price level for each bin
  for (let i = 0; i < priceBins; i++) {
    priceLevels.push(minPrice + (i + 0.5) * binSize);
  }

  // Distribute chips based on historical trading
  // Use triangular distribution within each day's price range
  for (let day = 0; day < data.length; day++) {
    const dayVolume = volumes[day];
    const dayHigh = highs[day];
    const dayLow = lows[day];
    const dayClose = closes[day];
    
    // Calculate typical price (weighted towards close price)
    const typicalPrice = (dayHigh + dayLow + dayClose * 2) / 4;
    
    // Distribute volume across price bins
    // More volume concentrated around typical price
    for (let bin = 0; bin < priceBins; bin++) {
      const binPrice = priceLevels[bin];
      
      if (binPrice >= dayLow && binPrice <= dayHigh) {
        // Triangular distribution centered at typical price
        const distance = Math.abs(binPrice - typicalPrice);
        const maxDistance = Math.max(typicalPrice - dayLow, dayHigh - typicalPrice);
        const weight = maxDistance > 0 ? 1 - (distance / maxDistance) : 1;
        
        // Apply decay factor (older chips decay)
        const ageFactor = Math.pow(decayFactor, data.length - day - 1);
        chipDistribution[bin] += dayVolume * weight * ageFactor;
      }
    }
  }

  // Calculate statistics
  let totalChips = 0;
  let weightedPriceSum = 0;
  
  for (let i = 0; i < priceBins; i++) {
    totalChips += chipDistribution[i];
    weightedPriceSum += chipDistribution[i] * priceLevels[i];
  }

  const avgCost = totalChips > 0 ? weightedPriceSum / totalChips : currentPrice;

  // Calculate profit ratio (chips below current price / total chips)
  let profitChips = 0;
  for (let i = 0; i < priceBins; i++) {
    if (priceLevels[i] < currentPrice) {
      profitChips += chipDistribution[i];
    }
  }
  const profitRatio = totalChips > 0 ? (profitChips / totalChips) * 100 : 50;

  // Calculate concentration (A股标准：数值越小越集中)
  const meanChip = totalChips / priceBins;
  let variance = 0;
  for (let i = 0; i < priceBins; i++) {
    variance += Math.pow(chipDistribution[i] - meanChip, 2);
  }
  const stdDev = Math.sqrt(variance / priceBins);
  const concentration = meanChip > 0 ? (stdDev / meanChip) * 100 : 100;

  // Find main peaks (local maxima)
  const mainPeaks: Array<{ price: number; amount: number }> = [];
  for (let i = 1; i < priceBins - 1; i++) {
    if (chipDistribution[i] > chipDistribution[i - 1] && 
        chipDistribution[i] > chipDistribution[i + 1] &&
        chipDistribution[i] > meanChip * 1.5) {
      mainPeaks.push({
        price: priceLevels[i],
        amount: chipDistribution[i],
      });
    }
  }
  // Sort by amount and take top 3
  mainPeaks.sort((a, b) => b.amount - a.amount);
  const topPeaks = mainPeaks.slice(0, 3);

  // Analyze peak pattern (单峰/多峰)
  const peakCount = topPeaks.length;
  const isSinglePeak = peakCount === 1;
  const isMultiPeak = peakCount >= 2;
  
  // Determine position (低位/中位/高位)
  const priceRangeValue = maxPrice - minPrice;
  const pricePosition = priceRangeValue > 0 ? ((currentPrice - minPrice) / priceRangeValue) * 100 : 50;
  let position: "low" | "middle" | "high" = "middle";
  if (pricePosition < 30) position = "low";
  else if (pricePosition > 70) position = "high";
  
  // Analyze peak pattern type
  let peakPattern: "singleDense" | "multiPeak" | "scattered" = "scattered";
  if (isSinglePeak && concentration < 15) {
    peakPattern = "singleDense";
  } else if (isMultiPeak && concentration < 20) {
    peakPattern = "multiPeak";
  }

  return {
    priceLevels,
    chipAmounts: chipDistribution,
    avgCost,
    profitRatio,
    concentration: Math.max(0, concentration),
    mainPeaks: topPeaks,
    peakCount,
    isSinglePeak,
    isMultiPeak,
    position,
    peakPattern,
    currentPrice,
    minPrice,
    maxPrice,
  };
}

const KLineChipAnalysis: React.FC<KLineChipAnalysisProps> = ({ klineData }) => {
  const { t } = useTranslation();
  const [overlayIndicator, setOverlayIndicator] = useState<IndicatorType>("sma");
  const [oscillatorType, setOscillatorType] = useState<OscillatorType>("rsi");
  const [showSignals, setShowSignals] = useState(true);

  // Calculate chip distribution
  const chipData = useMemo(() => calculateChipDistribution(klineData, 60, 0.95), [klineData]);

  // Calculate SMA
  const calculateSMA = (data: number[], period: number): (number | null)[] => {
    const result: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else {
        const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
      }
    }
    return result;
  };

  // Calculate EMA
  const calculateEMA = (data: number[], period: number): (number | null)[] => {
    if (data.length < period) return data.map(() => null);
    const k = 2 / (period + 1);
    const result: (number | null)[] = [data[0]];
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
      result.push(ema);
    }
    return result;
  };

  // Calculate Bollinger Bands
  const calculateBollingerBands = (data: number[], period: number, multiplier: number) => {
    const sma = calculateSMA(data, period);
    const result: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } = {
      upper: [],
      middle: sma,
      lower: [],
    };

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.upper.push(null);
        result.lower.push(null);
      } else {
        const slice = data.slice(i - period + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        result.upper.push(mean + multiplier * stdDev);
        result.lower.push(mean - multiplier * stdDev);
      }
    }
    return result;
  };

  // Calculate VWAP
  const calculateVWAP = (data: StockData[]): (number | null)[] => {
    const result: (number | null)[] = [];
    let cumulativeTPV = 0;
    let cumulativeVolume = 0;

    for (let i = 0; i < data.length; i++) {
      const typicalPrice = (data[i].high + data[i].low + data[i].close) / 3;
      cumulativeTPV += typicalPrice * data[i].volume;
      cumulativeVolume += data[i].volume;
      result.push(cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : null);
    }
    return result;
  };

  // Calculate RSI
  const calculateRSI = (data: number[], period: number): (number | null)[] => {
    if (data.length < period + 1) return data.map(() => null);
    const result: (number | null)[] = new Array(period).fill(null);
    
    for (let i = period; i < data.length; i++) {
      let gains = 0, losses = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const change = data[j] - data[j - 1];
        if (change > 0) gains += change;
        else losses -= change;
      }
      const rs = losses === 0 ? 100 : gains / losses;
      result.push(100 - (100 / (1 + rs)));
    }
    return result;
  };

  // Calculate MACD
  const calculateMACD = (data: number[], fast: number, slow: number, signal: number) => {
    const emaFast = calculateEMA(data, fast);
    const emaSlow = calculateEMA(data, slow);
    const macdLine: (number | null)[] = emaFast.map((f, i) => 
      f !== null && emaSlow[i] !== null ? f - emaSlow[i]! : null
    );
    
    const macdValues: number[] = [];
    for (let i = 0; i < macdLine.length; i++) {
      if (macdLine[i] !== null) {
        macdValues.push(macdLine[i]!);
      }
    }
    
    const signalLineRaw = calculateEMA(macdValues, signal);
    const signalLine: (number | null)[] = new Array(macdLine.length).fill(null);
    
    let firstNonNull = -1;
    for (let i = 0; i < macdLine.length; i++) {
      if (macdLine[i] !== null) {
        firstNonNull = i;
        break;
      }
    }
    
    const signalStartIdx = firstNonNull >= 0 ? firstNonNull + signal - 1 : 0;
    signalLineRaw.forEach((v, i) => {
      const idx = signalStartIdx + i;
      if (idx < signalLine.length) {
        signalLine[idx] = v;
      }
    });
    
    const histogram: (number | null)[] = macdLine.map((m, i) => {
      const s = signalLine[i];
      return m !== null && s !== null ? m - s : null;
    });
    
    return { macdLine, signalLine, histogram };
  };

  // Calculate KDJ
  const calculateKDJ = (highs: number[], lows: number[], closes: number[], period: number) => {
    const result: { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] } = {
      k: new Array(period).fill(null),
      d: new Array(period).fill(null),
      j: new Array(period).fill(null),
    };
    
    let k = 50, d = 50;
    
    for (let i = period; i < closes.length; i++) {
      const periodHighs = highs.slice(i - period + 1, i + 1);
      const periodLows = lows.slice(i - period + 1, i + 1);
      const hh = Math.max(...periodHighs);
      const ll = Math.min(...periodLows);
      const rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
      k = (2 / 3) * k + (1 / 3) * rsv;
      d = (2 / 3) * d + (1 / 3) * k;
      const j = 3 * k - 2 * d;
      result.k.push(k);
      result.d.push(d);
      result.j.push(j);
    }
    return result;
  };

  // Detect trading signals
  const detectSignals = () => {
    if (!showSignals || klineData.length < 20) return [];
    
    const closes = klineData.map(d => d.close);
    const ma5 = calculateSMA(closes, 5).filter(v => v !== null) as number[];
    const ma10 = calculateSMA(closes, 10).filter(v => v !== null) as number[];
    
    const signals: Array<{ date: string; type: "golden" | "death"; price: number }> = [];
    
    // Golden Cross / Death Cross
    for (let i = 1; i < ma5.length && i < ma10.length; i++) {
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
  };

  const chartOption = useMemo(() => {
    if (!klineData || klineData.length === 0) return {};

    const dates = klineData.map(d => d.date.includes(" ") ? d.date.split(" ")[0] : d.date);
    const closes = klineData.map(d => d.close);
    const highs = klineData.map(d => d.high);
    const lows = klineData.map(d => d.low);
    const candlestickData = klineData.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = klineData.map((d) => ({
      value: d.volume,
      itemStyle: { color: d.close >= d.open ? "#f44336" : "#4caf50" }
    }));

    const series: any[] = [];
    // Grid layout: Main K-line chart on left, chip distribution on right
    const grids: any[] = [
      { left: "8%", right: chipData ? "22%" : "3%", top: "10%", height: oscillatorType !== "none" ? "50%" : "65%" }, // Main chart
      { left: "8%", right: chipData ? "22%" : "3%", top: oscillatorType !== "none" ? "65%" : "80%", height: "15%" }, // Volume
    ];
    
    if (oscillatorType !== "none") {
      grids.push({ left: "8%", right: chipData ? "22%" : "3%", top: "85%", height: "10%" }); // Oscillator
    }

    // Add chip distribution grid on the right side (if chip data available)
    if (chipData) {
      grids.push({
        left: "78%",
        right: "2%",
        top: "10%",
        height: oscillatorType !== "none" ? "50%" : "65%",
        id: "chipGrid"
      });
    }

    // Calculate support and resistance levels
    const supportLevel = Math.min(...lows.slice(-20));
    const resistanceLevel = Math.max(...highs.slice(-20));

    // Main candlestick chart
    series.push({
      name: t("index.dailyK"),
      type: "candlestick",
      data: candlestickData,
      itemStyle: {
        color: "#f44336",
        color0: "#4caf50",
        borderColor: "#f44336",
        borderColor0: "#4caf50",
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
              color: "#4caf50",
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
              color: "#f44336",
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
      const signals = detectSignals();
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

    // Volume
    series.push({
      name: t("stock.volume"),
      type: "bar",
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: volumes,
    });

    // Oscillators
    const xAxis: any[] = [
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
        axisLabel: { show: false },
        splitLine: { show: false },
      },
    ];
    const yAxis: any[] = [
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
    ];

    if (oscillatorType === "rsi") {
      const rsi = calculateRSI(closes, 14);
      xAxis.push({ 
        type: "category", 
        data: dates, 
        gridIndex: 2, 
        axisLabel: { fontSize: 9, color: "#858585" },
        splitLine: { show: false },
      });
      yAxis.push({
        type: "value",
        gridIndex: 2,
        min: 0,
        max: 100,
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
              lineStyle: { color: "#f44336", type: "dashed", width: 1 },
              label: {
                show: true,
                position: "insideEndRight",
                formatter: t("analysis.overboughtZone"),
                fontSize: 9,
                color: "#f44336",
              },
            },
            {
              yAxis: 30,
              name: t("analysis.oversold"),
              lineStyle: { color: "#4caf50", type: "dashed", width: 1 },
              label: {
                show: true,
                position: "insideEndRight",
                formatter: t("analysis.oversoldZone"),
                fontSize: 9,
                color: "#4caf50",
              },
            },
          ],
        },
        markArea: {
          silent: true,
          itemStyle: {
            color: "rgba(244, 67, 54, 0.1)",
          },
          data: [
            [{ yAxis: 70 }, { yAxis: 100 }],
          ],
          label: {
            show: true,
            position: "inside",
            formatter: t("analysis.overboughtZone"),
            fontSize: 9,
            color: "#f44336",
          },
        },
      });
      
      // Add oversold zone
      series.push({
        name: t("analysis.oversoldZone"),
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: [],
        markArea: {
          silent: true,
          itemStyle: {
            color: "rgba(76, 175, 80, 0.1)",
          },
          data: [
            [{ yAxis: 0 }, { yAxis: 30 }],
          ],
          label: {
            show: true,
            position: "inside",
            formatter: t("analysis.oversoldZone"),
            fontSize: 9,
            color: "#4caf50",
          },
        },
        lineStyle: { opacity: 0 },
        symbol: "none",
      });
    } else if (oscillatorType === "macd") {
      const macd = calculateMACD(closes, 12, 26, 9);
      xAxis.push({ 
        type: "category", 
        data: dates, 
        gridIndex: 2, 
        axisLabel: { fontSize: 9, color: "#858585" },
        splitLine: { show: false },
      });
      yAxis.push({ 
        type: "value", 
        gridIndex: 2, 
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
          data: macd.histogram.map(v => ({
            value: v,
            itemStyle: { color: v !== null && v > 0 ? "#4caf50" : "#f44336" }
          })),
        }
      );
    } else if (oscillatorType === "kdj") {
      const kdj = calculateKDJ(highs, lows, closes, 9);
      xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" } });
      yAxis.push({
        type: "value",
        gridIndex: 2,
        min: 0,
        max: 100,
        axisLabel: { fontSize: 9, color: "#858585" },
      });
      series.push(
        { name: t("analysis.kdjK"), type: "line", xAxisIndex: 2, yAxisIndex: 2, data: kdj.k, symbol: "none", lineStyle: { color: "#ffff00", width: 1 } },
        { name: t("analysis.kdjD"), type: "line", xAxisIndex: 2, yAxisIndex: 2, data: kdj.d, symbol: "none", lineStyle: { color: "#00ffff", width: 1 } },
        { name: t("analysis.kdjJ"), type: "line", xAxisIndex: 2, yAxisIndex: 2, data: kdj.j, symbol: "none", lineStyle: { color: "#ff00ff", width: 1 } }
      );
    }

    // Add chip distribution to the chart if available
    if (chipData) {
      const chipGridIndex = grids.length - 1; // Last grid is chip distribution
      
      // Add X-axis for chip distribution (price levels)
      xAxis.push({
        type: "category",
        gridIndex: chipGridIndex,
        data: chipData.priceLevels.map(p => p.toFixed(2)),
        axisLabel: {
          show: false, // Hide price labels to save space
          rotate: 45,
          fontSize: 8,
        },
        splitLine: {
          show: false,
        },
      });

      // Add Y-axis for chip distribution (chip amounts)
      const chipYAxisIndex = yAxis.length; // Index of the chip Y-axis we're about to add
      yAxis.push({
        type: "value",
        gridIndex: chipGridIndex,
        axisLabel: {
          show: false, // Hide amount labels to save space
        },
        splitLine: {
          show: false,
        },
      });

      // Prepare chip distribution data (vertical bars - standard format)
      const chipSeriesData = chipData.priceLevels.map((price, idx) => {
        const amount = chipData.chipAmounts[idx];
        const isProfit = price < chipData.currentPrice;

        return {
          value: amount, // Just the amount, x-axis is category (price levels)
          itemStyle: {
            color: isProfit ? "#ff4444" : "#44aa44", // 红色=获利盘，绿色=套牢盘
            opacity: 0.8,
            borderWidth: 0.5,
            borderColor: isProfit ? "#ff6666" : "#66bb66",
          },
        };
      });
      
      // Add chip distribution series (vertical bar chart - standard format)
      series.push({
        name: t("analysis.chipDistribution"),
        type: "bar",
        xAxisIndex: chipGridIndex,
        yAxisIndex: chipYAxisIndex,
        data: chipSeriesData,
        barWidth: "100%", // Full width for each price bin
        label: {
          show: false,
        },
        tooltip: {
          trigger: "item",
          formatter: (params: any) => {
            const dataIndex = params.dataIndex;
            const price = chipData.priceLevels[dataIndex];
            const amount = chipData.chipAmounts[dataIndex];
            const isProfit = price < chipData.currentPrice;
            return `<div>
              <div><strong>${t("stock.price")}: ${price.toFixed(2)}</strong></div>
              <div>${t("analysis.chipAmount")}: ${amount.toFixed(0)}</div>
              <div style="color: ${isProfit ? "#ff4444" : "#44aa44"}">
                ${isProfit ? t("analysis.profitChip") : t("analysis.lossChip")}
              </div>
            </div>`;
          },
        },
      });

      // Add average cost line on chip distribution (horizontal line)
      const avgCostIndex = chipData.priceLevels.findIndex(p => p >= chipData.avgCost);
      if (avgCostIndex >= 0) {
        series.push({
          name: t("analysis.avgCost"),
          type: "line",
          xAxisIndex: chipGridIndex,
          yAxisIndex: chipYAxisIndex,
          data: chipData.priceLevels.map(() => chipData.avgCost),
          symbol: "none",
          lineStyle: {
            color: "#FFD700",
            width: 2,
            type: "solid",
          },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: {
              color: "#FFD700",
              width: 2,
              type: "solid",
            },
            label: {
              show: true,
              position: "end",
              formatter: `${t("analysis.avgCost")}: ${chipData.avgCost.toFixed(2)}`,
              fontSize: 8,
              color: "#FFD700",
            },
            data: [
              {
                yAxis: chipData.avgCost,
              },
            ],
          },
        });
      }
    }

    return {
      backgroundColor: "transparent",
      grid: grids,
      xAxis,
      yAxis,
      graphic: [
        {
          type: "text",
          left: "center",
          top: "2%",
          style: {
            text: `${t("analysis.overlayIndicator")}: ${overlayIndicator !== "none" ? overlayIndicator.toUpperCase() : t("analysis.overlayNone")} | ${t("analysis.oscillator")}: ${oscillatorType !== "none" ? oscillatorType.toUpperCase() : t("analysis.oscillatorNone")}`,
            fontSize: 11,
            fontWeight: "bold",
            fill: "#858585",
          },
        },
      ],
      series,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
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
          
          // Add support/resistance info
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
        textStyle: { color: "#858585", fontSize: 8 },
        itemWidth: 8,
        itemHeight: 8,
        top: 0,
      },
      dataZoom: [
        { type: "inside", xAxisIndex: [0, 1, oscillatorType !== "none" ? 2 : 1] },
        { show: true, type: "slider", xAxisIndex: [0, 1, oscillatorType !== "none" ? 2 : 1], top: "95%", height: 15 },
      ],
    };
  }, [klineData, overlayIndicator, oscillatorType, showSignals, chipData, t]);

  return (
    <div className="kline-technical-analysis">
      <div className="analysis-columns">
        {/* Left Column: Parameters */}
        <div className="analysis-column params-column">
          <div className="column-header">{t("analysis.params")}</div>
          <div className="params-content">
            <div className="param-section">
              <label className="param-section-label">{t("analysis.overlayIndicator")}</label>
              <div className="param-inputs">
                <select
                  value={overlayIndicator}
                  onChange={(e) => setOverlayIndicator(e.target.value as IndicatorType)}
                  className="param-select"
                >
                  <option value="none">{t("analysis.overlayNone")}</option>
                  <option value="sma">{t("analysis.overlaySMA")}</option>
                  <option value="ema">{t("analysis.overlayEMA")}</option>
                  <option value="bollinger">{t("analysis.overlayBollinger")}</option>
                  <option value="vwap">{t("analysis.overlayVWAP")}</option>
                </select>
              </div>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.oscillator")}</label>
              <div className="param-inputs">
                <select
                  value={oscillatorType}
                  onChange={(e) => setOscillatorType(e.target.value as OscillatorType)}
                  className="param-select"
                >
                  <option value="none">{t("analysis.oscillatorNone")}</option>
                  <option value="rsi">{t("analysis.oscillatorRSI")}</option>
                  <option value="macd">{t("analysis.oscillatorMACD")}</option>
                  <option value="kdj">{t("analysis.oscillatorKDJ")}</option>
                </select>
              </div>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.tradingSignals")}</label>
              <div className="param-inputs">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={showSignals}
                    onChange={(e) => setShowSignals(e.target.checked)}
                  />
                  <span>{t("analysis.showSignals")}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="column-divider" />

        {/* Middle Column: Results (40% fixed) */}
        <div className="analysis-column results-column">
          <div className="column-header">{t("analysis.results")}</div>
          <div className="results-content">
            <div className="indicator-summary">
              {overlayIndicator !== "none" && (
                <div className="summary-card">
                  <div className="summary-title">{t("analysis.overlayIndicator")}: {overlayIndicator.toUpperCase()}</div>
                  <div className="summary-desc">
                    {overlayIndicator === "sma" && t("analysis.overlayDescSMA")}
                    {overlayIndicator === "ema" && t("analysis.overlayDescEMA")}
                    {overlayIndicator === "bollinger" && t("analysis.overlayDescBollinger")}
                    {overlayIndicator === "vwap" && t("analysis.overlayDescVWAP")}
                  </div>
                </div>
              )}
              {oscillatorType !== "none" && (
                <div className="summary-card">
                  <div className="summary-title">{t("analysis.oscillator")}: {oscillatorType.toUpperCase()}</div>
                  <div className="summary-desc">
                    {oscillatorType === "rsi" && t("analysis.oscillatorDescRSI")}
                    {oscillatorType === "macd" && t("analysis.oscillatorDescMACD")}
                    {oscillatorType === "kdj" && t("analysis.oscillatorDescKDJ")}
                  </div>
                </div>
              )}
              {showSignals && (
                <div className="summary-card">
                  <div className="summary-title">{t("analysis.tradingSignals")}</div>
                  <div className="summary-desc" dangerouslySetInnerHTML={{ __html: t("analysis.signalDesc") }} />
                </div>
              )}
              {chipData && (
                <div className="summary-card result-card">
                  <div className="result-header">
                    <span className="result-title">{t("analysis.chipDistribution")}</span>
                    <span 
                      className="result-signal" 
                      style={{ 
                        backgroundColor: chipData.profitRatio > 70 ? "#2ecc71" : 
                                       chipData.profitRatio < 30 ? "#e74c3c" : "#f39c12" 
                      }}
                    >
                      {chipData.profitRatio > 70 ? t("analysis.bullish") : 
                       chipData.profitRatio < 30 ? t("analysis.bearish") : t("analysis.neutral")}
                    </span>
                  </div>
                  <div className="result-desc">
                    {t("analysis.chipDistributionDesc")
                      .replace("{avgCost}", chipData.avgCost.toFixed(2))
                      .replace("{profitRatio}", chipData.profitRatio.toFixed(1))
                      .replace("{concentration}", chipData.concentration.toFixed(1))
                      .replace("{peakCount}", chipData.peakCount.toString())
                      .replace("{position}", t(`analysis.chipPosition${chipData.position.charAt(0).toUpperCase() + chipData.position.slice(1)}`))}
                  </div>
                  <div className="result-desc" style={{ marginTop: "4px", fontSize: "10px", color: "#858585" }}>
                    {chipData.isSinglePeak ? t("analysis.chipSinglePeak") : t("analysis.chipMultiPeak")}
                    {chipData.mainPeaks.length > 0 && (
                      <span> - {t("analysis.chipMainPeaks")}: {chipData.mainPeaks.map((p: { price: number; amount: number }) => p.price.toFixed(2)).join(", ")}</span>
                    )}
                  </div>
                  {chipData.position === "low" && chipData.isSinglePeak && chipData.concentration < 15 && (
                    <div className="result-extra" style={{ color: "#2ecc71", fontWeight: "bold" }}>
                      {t("analysis.chipLowSinglePeak")}
                    </div>
                  )}
                  {chipData.position === "low" && chipData.isMultiPeak && chipData.concentration < 20 && (
                    <div className="result-extra" style={{ color: "#2ecc71" }}>
                      {t("analysis.chipLowMultiPeak")}
                    </div>
                  )}
                  {chipData.position === "high" && chipData.isSinglePeak && chipData.concentration < 18 && (
                    <div className="result-extra" style={{ color: "#f39c12" }}>
                      {t("analysis.chipHighSinglePeak")}
                    </div>
                  )}
                  {chipData.position === "high" && chipData.concentration > 20 && (
                    <div className="result-extra" style={{ color: "#e74c3c", fontWeight: "bold" }}>
                      {t("analysis.chipHighScattered")}
                    </div>
                  )}
                  {chipData.concentration < 10 && (
                    <div className="result-extra" style={{ color: "#2ecc71" }}>
                      {t("analysis.chipHighlyConcentrated")}
                    </div>
                  )}
                  {chipData.concentration >= 20 && chipData.concentration < 30 && (
                    <div className="result-extra">{t("analysis.chipModerateConcentration")}</div>
                  )}
                  {chipData.concentration >= 30 && (
                    <div className="result-extra" style={{ color: "#e74c3c" }}>
                      {t("analysis.chipScattered")}
                    </div>
                  )}
                  <div className="confidence-bar">
                    <span className="confidence-text">
                      {t("analysis.confidence")}: {Math.abs(chipData.profitRatio - 50) * 2}%
                    </span>
                    <div className="confidence-track">
                      <div 
                        className="confidence-fill" 
                        style={{ 
                          width: `${Math.abs(chipData.profitRatio - 50) * 2}%`, 
                          backgroundColor: chipData.profitRatio > 70 ? "#2ecc71" : 
                                         chipData.profitRatio < 30 ? "#e74c3c" : "#f39c12"
                        }} 
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="column-divider" />

        {/* Right Column: Chart */}
        <div className="analysis-column chart-column">
          <div className="column-header">{t("analysis.chart")}</div>
          <div className="chart-content">
            {Object.keys(chartOption).length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <ReactECharts
                option={chartOption}
                style={{ height: "100%", width: "100%" }}
                opts={{ renderer: "canvas" }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default KLineChipAnalysis;
