import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import ChartDialog from "./ChartDialog";
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

interface KLineTechnicalAnalysisProps {
  klineData: StockData[];
}

type IndicatorType = "sma" | "ema" | "bollinger" | "vwap" | "none";
type OscillatorType = "rsi" | "macd" | "kdj" | "momentum" | "cci" | "adx" | "dmi" | "stochrsi" | "bbpercent" | "none";


const KLineTechnicalAnalysis: React.FC<KLineTechnicalAnalysisProps> = ({ klineData }) => {
  const { t } = useTranslation();
  const [overlayIndicator, setOverlayIndicator] = useState<IndicatorType>("sma");
  const [oscillatorType, setOscillatorType] = useState<OscillatorType>("rsi");

  // Dynamic parameters for indicators
  const [indicatorParams, setIndicatorParams] = useState({
    rsiPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    kdjPeriod: 9,
    momentumPeriod: 10,
    cciPeriod: 20,
    adxPeriod: 14,
    stochRsiRsiPeriod: 14,
    stochRsiStochPeriod: 14,
    stochRsiKPeriod: 3,
    stochRsiDPeriod: 3,
    bbPercentPeriod: 20,
  });
  const [showSignals, setShowSignals] = useState(true);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  const [selectedDateIndex, setSelectedDateIndex] = useState<number | null>(null);
  const chartRef = useRef<ReactECharts>(null);

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
    
    // Calculate signal line from MACD line (filter nulls first)
    const macdValues: number[] = [];
    for (let i = 0; i < macdLine.length; i++) {
      if (macdLine[i] !== null) {
        macdValues.push(macdLine[i]!);
      }
    }
    
    const signalLineRaw = calculateEMA(macdValues, signal);
    const signalLine: (number | null)[] = new Array(macdLine.length).fill(null);
    
    // Find first non-null index in macdLine
    let firstNonNull = -1;
    for (let i = 0; i < macdLine.length; i++) {
      if (macdLine[i] !== null) {
        firstNonNull = i;
        break;
      }
    }
    
    // Place signal line values starting from where we have enough data
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

  // Calculate Average Directional Index (ADX)
  const calculateADX = (highs: number[], lows: number[], closes: number[], period: number) => {
    const len = closes.length;
    if (len < period + 1) {
      return {
        adx: new Array(len).fill(null),
        plusDI: new Array(len).fill(null),
        minusDI: new Array(len).fill(null),
      };
    }

    const plusDI: (number | null)[] = new Array(len).fill(null);
    const minusDI: (number | null)[] = new Array(len).fill(null);
    const adx: (number | null)[] = new Array(len).fill(null);

    // Calculate +DI and -DI
    for (let i = period; i < len; i++) {
      let sumTR = 0, sumPlusDM = 0, sumMinusDM = 0;

      // Calculate smoothed TR, +DM, -DM for the period
      for (let j = i - period + 1; j <= i; j++) {
        const tr = Math.max(
          highs[j] - lows[j],
          Math.abs(highs[j] - closes[j - 1]),
          Math.abs(lows[j] - closes[j - 1])
        );
        sumTR += tr;

        const upMove = highs[j] - highs[j - 1];
        const downMove = lows[j - 1] - lows[j];

        if (upMove > downMove && upMove > 0) sumPlusDM += upMove;
        if (downMove > upMove && downMove > 0) sumMinusDM += downMove;
      }

      const avgTR = sumTR / period;
      const avgPlusDM = sumPlusDM / period;
      const avgMinusDM = sumMinusDM / period;

      plusDI[i] = avgTR > 0 ? (avgPlusDM / avgTR) * 100 : 0;
      minusDI[i] = avgTR > 0 ? (avgMinusDM / avgTR) * 100 : 0;
    }

    // Calculate ADX
    for (let i = period * 2; i < len; i++) {
      // Simple average for ADX (simplified version)
      let sumDX = 0;
      let count = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const p = plusDI[j] || 0;
        const m = minusDI[j] || 0;
        if (p + m > 0) {
          const dx = Math.abs(p - m) / (p + m) * 100;
          sumDX += dx;
          count++;
        }
      }
      adx[i] = count > 0 ? sumDX / count : null;
    }

    return {
      adx,
      plusDI,
      minusDI,
    };
  };

  // Calculate Stochastic RSI
  const calculateStochRSI = (closes: number[], rsiPeriod: number, stochPeriod: number, kPeriod: number, dPeriod: number) => {
    const rsiValues = calculateRSI(closes, rsiPeriod);
    const stochK: (number | null)[] = [];
    const stochD: (number | null)[] = [];

    // Calculate %K
    for (let i = 0; i < rsiValues.length; i++) {
      if (i < stochPeriod - 1) {
        stochK.push(null);
        continue;
      }

      // Get RSI values for the stochastic period
      const rsiSlice: number[] = [];
      for (let j = i - stochPeriod + 1; j <= i; j++) {
        if (rsiValues[j] !== null) {
          rsiSlice.push(rsiValues[j]!);
        }
      }

      if (rsiSlice.length === stochPeriod) {
        const highestRSI = Math.max(...rsiSlice);
        const lowestRSI = Math.min(...rsiSlice);
        const currentRSI = rsiValues[i];

        if (currentRSI !== null && highestRSI !== lowestRSI) {
          const k = ((currentRSI - lowestRSI) / (highestRSI - lowestRSI)) * 100;
          stochK.push(k);
        } else {
          stochK.push(50); // Neutral value when range is zero
        }
      } else {
        stochK.push(null);
      }
    }

    // Calculate %D (SMA of %K)
    for (let i = 0; i < stochK.length; i++) {
      if (i < kPeriod + dPeriod - 2) {
        stochD.push(null);
        continue;
      }

      let sumK = 0;
      let count = 0;
      for (let j = i - dPeriod + 1; j <= i; j++) {
        if (stochK[j] !== null) {
          sumK += stochK[j]!;
          count++;
        }
      }

      if (count === dPeriod) {
        stochD.push(sumK / count);
      } else {
        stochD.push(null);
      }
    }

    return {
      k: stochK,
      d: stochD,
      rsi: rsiValues
    };
  };

  // Calculate Commodity Channel Index (CCI)
  const calculateCCI = (highs: number[], lows: number[], closes: number[], period: number): (number | null)[] => {
    if (closes.length < period) return closes.map(() => null);
    const result: (number | null)[] = new Array(period - 1).fill(null);

    for (let i = period - 1; i < closes.length; i++) {
      // Calculate Typical Price for the period
      const typicalPrices: number[] = [];
      for (let j = i - period + 1; j <= i; j++) {
        const tp = (highs[j] + lows[j] + closes[j]) / 3;
        typicalPrices.push(tp);
      }

      // Calculate SMA of Typical Price
      const smaTP = typicalPrices.reduce((sum, tp) => sum + tp, 0) / period;

      // Calculate Mean Deviation
      const deviations = typicalPrices.map(tp => Math.abs(tp - smaTP));
      const meanDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / period;

      // Calculate CCI
      const currentTP = (highs[i] + lows[i] + closes[i]) / 3;
      const cci = meanDeviation !== 0 ? (currentTP - smaTP) / (0.015 * meanDeviation) : 0;

      result.push(cci);
    }

    return result;
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
    const grids: any[] = [
      { left: "8%", right: "3%", top: "18%", height: oscillatorType !== "none" ? "48%" : "62%" },
      { left: "8%", right: "3%", top: oscillatorType !== "none" ? "68%" : "83%", height: "15%" },
    ];
    
    if (oscillatorType !== "none") {
      grids.push({ left: "8%", right: "3%", top: "86%", height: "10%" });
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
      const rsi = calculateRSI(closes, indicatorParams.rsiPeriod);
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
      const macd = calculateMACD(closes, indicatorParams.macdFast, indicatorParams.macdSlow, indicatorParams.macdSignal);
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
      const kdj = calculateKDJ(highs, lows, closes, indicatorParams.kdjPeriod);
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
    } else if (oscillatorType === "momentum") {
      // Calculate momentum as percentage change from N periods ago
      const momentumData: (number | null)[] = [];
      for (let i = 0; i < closes.length; i++) {
        if (i >= indicatorParams.momentumPeriod) {
          const momentum = ((closes[i] - closes[i - indicatorParams.momentumPeriod]) / closes[i - indicatorParams.momentumPeriod]) * 100;
          momentumData.push(momentum);
        } else {
          momentumData.push(null);
        }
      }

      xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" } });
      yAxis.push({
        type: "value",
        gridIndex: 2,
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

      // Add zero line
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

      xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" } });
      yAxis.push({
        type: "value",
        gridIndex: 2,
        axisLabel: { fontSize: 9, color: "#858585" },
      });

      // Add CCI line
      series.push({
        name: t("analysis.cci"),
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: cciData,
        symbol: "none",
        lineStyle: { color: "#e91e63", width: 1.5 },
      });

      // Add overbought line (+100)
      series.push({
        name: "Overbought (+100)",
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: new Array(dates.length).fill(100),
        symbol: "none",
        lineStyle: { color: "#f44336", width: 1, type: "dashed" },
      });

      // Add oversold line (-100)
      series.push({
        name: "Oversold (-100)",
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: new Array(dates.length).fill(-100),
        symbol: "none",
        lineStyle: { color: "#4caf50", width: 1, type: "dashed" },
      });

      // Add zero line
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

      xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" } });
      yAxis.push({
        type: "value",
        gridIndex: 2,
        min: 0,
        max: 100,
        axisLabel: { fontSize: 9, color: "#858585" },
      });

      // Add ADX line
      series.push({
        name: t("analysis.adx"),
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: adxData.adx,
        symbol: "none",
        lineStyle: { color: "#9c27b0", width: 1.5 },
      });

      // Add +DI line
      series.push({
        name: "+DI",
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: adxData.plusDI,
        symbol: "none",
        lineStyle: { color: "#4caf50", width: 1 },
      });

      // Add -DI line
      series.push({
        name: "-DI",
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: adxData.minusDI,
        symbol: "none",
        lineStyle: { color: "#f44336", width: 1 },
      });

      // Add trend strength line (25)
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
      const dmiData = calculateADX(highs, lows, closes, 14);

      xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" } });
      yAxis.push({
        type: "value",
        gridIndex: 2,
        min: 0,
        max: 100,
        axisLabel: { fontSize: 9, color: "#858585" },
      });

      // Add +DI line
      series.push({
        name: "+DI (Directional Indicator)",
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: dmiData.plusDI,
        symbol: "none",
        lineStyle: { color: "#4caf50", width: 1.5 },
      });

      // Add -DI line
      series.push({
        name: "-DI (Directional Indicator)",
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: dmiData.minusDI,
        symbol: "none",
        lineStyle: { color: "#f44336", width: 1.5 },
      });

      // Add ADX line for reference
      series.push({
        name: "ADX (Trend Strength)",
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: dmiData.adx,
        symbol: "none",
        lineStyle: { color: "#9c27b0", width: 1, type: "dashed" },
      });

      // Add trend strength line (25)
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

      xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" } });
      yAxis.push({
        type: "value",
        gridIndex: 2,
        min: 0,
        max: 100,
        axisLabel: { fontSize: 9, color: "#858585" },
      });

      // Add StochRSI %K line
      series.push({
        name: "StochRSI %K",
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: stochRsiData.k,
        symbol: "none",
        lineStyle: { color: "#2196f3", width: 1.5 },
      });

      // Add StochRSI %D line
      series.push({
        name: "StochRSI %D",
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: stochRsiData.d,
        symbol: "none",
        lineStyle: { color: "#ff5722", width: 1.5 },
      });

      // Add overbought line (80)
      series.push({
        name: "Overbought (80)",
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: new Array(dates.length).fill(80),
        symbol: "none",
        lineStyle: { color: "#f44336", width: 1, type: "dashed" },
      });

      // Add oversold line (20)
      series.push({
        name: "Oversold (20)",
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: new Array(dates.length).fill(20),
        symbol: "none",
        lineStyle: { color: "#4caf50", width: 1, type: "dashed" },
      });
    } else if (oscillatorType === "bbpercent") {
      // Calculate Bollinger Bands %B
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

      xAxis.push({ type: "category", data: dates, gridIndex: 2, axisLabel: { fontSize: 9, color: "#858585" } });
      yAxis.push({
        type: "value",
        gridIndex: 2,
        min: 0,
        max: 100,
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

      // Add overbought line (80%)
      series.push({
        name: "Overbought (80%)",
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: new Array(dates.length).fill(80),
        symbol: "none",
        lineStyle: { color: "#f44336", width: 1, type: "dashed" },
      });

      // Add oversold line (20%)
      series.push({
        name: "Oversold (20%)",
        type: "line",
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: new Array(dates.length).fill(20),
        symbol: "none",
        lineStyle: { color: "#4caf50", width: 1, type: "dashed" },
      });

      // Add middle line (50%)
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

    return {
      backgroundColor: "transparent",
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
  }, [klineData, overlayIndicator, oscillatorType, showSignals, indicatorParams]);

  useEffect(() => {
    let resizeTimer: number | null = null;
    const handleResize = () => {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      resizeTimer = setTimeout(() => {
        if (chartRef.current) {
          try {
            const instance = chartRef.current.getEchartsInstance();
            if (instance && !instance.isDisposed()) {
              instance.resize();
            }
          } catch (error) {
            // Ignore errors during resize
          }
        }
      }, 100);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      window.removeEventListener("resize", handleResize);
    };
  }, []);

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
                  <option value="momentum">{t("analysis.oscillatorMomentum")}</option>
                  <option value="cci">{t("analysis.oscillatorCCI")}</option>
                  <option value="adx">{t("analysis.oscillatorADX")}</option>
                  <option value="dmi">{t("analysis.oscillatorDMI")}</option>
                  <option value="stochrsi">{t("analysis.oscillatorStochRSI")}</option>
                  <option value="bbpercent">{t("analysis.oscillatorBBPercent")}</option>
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
                <>
                  {/* Dynamic Parameter Controls */}
                  <div className="param-section">
                    <label className="param-section-label">{t("analysis.indicatorParams")}</label>
                    <div className="param-inputs">
                      {oscillatorType === "rsi" && (
                        <div className="param-row">
                          <label>RSI {t("analysis.period")}</label>
                          <input
                            type="number"
                            value={indicatorParams.rsiPeriod}
                            onChange={(e) => setIndicatorParams({...indicatorParams, rsiPeriod: parseInt(e.target.value) || 14})}
                            min="2"
                            max="50"
                            className="param-input"
                          />
                        </div>
                      )}
                      {oscillatorType === "macd" && (
                        <>
                          <div className="param-row">
                            <label>MACD Fast</label>
                            <input
                              type="number"
                              value={indicatorParams.macdFast}
                              onChange={(e) => setIndicatorParams({...indicatorParams, macdFast: parseInt(e.target.value) || 12})}
                              min="2"
                              max="50"
                              className="param-input"
                            />
                          </div>
                          <div className="param-row">
                            <label>MACD Slow</label>
                            <input
                              type="number"
                              value={indicatorParams.macdSlow}
                              onChange={(e) => setIndicatorParams({...indicatorParams, macdSlow: parseInt(e.target.value) || 26})}
                              min="5"
                              max="100"
                              className="param-input"
                            />
                          </div>
                          <div className="param-row">
                            <label>MACD Signal</label>
                            <input
                              type="number"
                              value={indicatorParams.macdSignal}
                              onChange={(e) => setIndicatorParams({...indicatorParams, macdSignal: parseInt(e.target.value) || 9})}
                              min="2"
                              max="50"
                              className="param-input"
                            />
                          </div>
                        </>
                      )}
                      {oscillatorType === "kdj" && (
                        <div className="param-row">
                          <label>KDJ {t("analysis.period")}</label>
                          <input
                            type="number"
                            value={indicatorParams.kdjPeriod}
                            onChange={(e) => setIndicatorParams({...indicatorParams, kdjPeriod: parseInt(e.target.value) || 9})}
                            min="2"
                            max="50"
                            className="param-input"
                          />
                        </div>
                      )}
                      {oscillatorType === "momentum" && (
                        <div className="param-row">
                          <label>{t("analysis.period")}</label>
                          <input
                            type="number"
                            value={indicatorParams.momentumPeriod}
                            onChange={(e) => setIndicatorParams({...indicatorParams, momentumPeriod: parseInt(e.target.value) || 10})}
                            min="2"
                            max="50"
                            className="param-input"
                          />
                        </div>
                      )}
                      {oscillatorType === "cci" && (
                        <div className="param-row">
                          <label>CCI {t("analysis.period")}</label>
                          <input
                            type="number"
                            value={indicatorParams.cciPeriod}
                            onChange={(e) => setIndicatorParams({...indicatorParams, cciPeriod: parseInt(e.target.value) || 20})}
                            min="2"
                            max="50"
                            className="param-input"
                          />
                        </div>
                      )}
                      {oscillatorType === "adx" && (
                        <div className="param-row">
                          <label>ADX {t("analysis.period")}</label>
                          <input
                            type="number"
                            value={indicatorParams.adxPeriod}
                            onChange={(e) => setIndicatorParams({...indicatorParams, adxPeriod: parseInt(e.target.value) || 14})}
                            min="2"
                            max="50"
                            className="param-input"
                          />
                        </div>
                      )}
                      {oscillatorType === "stochrsi" && (
                        <>
                          <div className="param-row">
                            <label>RSI {t("analysis.period")}</label>
                            <input
                              type="number"
                              value={indicatorParams.stochRsiRsiPeriod}
                              onChange={(e) => setIndicatorParams({...indicatorParams, stochRsiRsiPeriod: parseInt(e.target.value) || 14})}
                              min="2"
                              max="50"
                              className="param-input"
                            />
                          </div>
                          <div className="param-row">
                            <label>Stoch {t("analysis.period")}</label>
                            <input
                              type="number"
                              value={indicatorParams.stochRsiStochPeriod}
                              onChange={(e) => setIndicatorParams({...indicatorParams, stochRsiStochPeriod: parseInt(e.target.value) || 14})}
                              min="2"
                              max="50"
                              className="param-input"
                            />
                          </div>
                        </>
                      )}
                      {oscillatorType === "bbpercent" && (
                        <div className="param-row">
                          <label>BB {t("analysis.period")}</label>
                          <input
                            type="number"
                            value={indicatorParams.bbPercentPeriod}
                            onChange={(e) => setIndicatorParams({...indicatorParams, bbPercentPeriod: parseInt(e.target.value) || 20})}
                            min="2"
                            max="50"
                            className="param-input"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Indicator Description */}
                  <div className="summary-card">
                    <div className="summary-title">{t("analysis.oscillator")}: {oscillatorType.toUpperCase()}</div>
                    <div className="summary-desc">
                      {oscillatorType === "rsi" && t("analysis.oscillatorDescRSI")}
                      {oscillatorType === "macd" && t("analysis.oscillatorDescMACD")}
                      {oscillatorType === "kdj" && t("analysis.oscillatorDescKDJ")}
                      {oscillatorType === "momentum" && t("analysis.oscillatorDescMomentum")}
                      {oscillatorType === "cci" && t("analysis.oscillatorDescCCI")}
                      {oscillatorType === "adx" && t("analysis.oscillatorDescADX")}
                      {oscillatorType === "dmi" && t("analysis.oscillatorDescDMI")}
                      {oscillatorType === "stochrsi" && t("analysis.oscillatorDescStochRSI")}
                      {oscillatorType === "bbpercent" && t("analysis.oscillatorDescBBPercent")}
                    </div>
                  </div>
                </>
              )}
              {showSignals && (
                <div className="summary-card">
                  <div className="summary-title">{t("analysis.tradingSignals")}</div>
                  <div className="summary-desc" dangerouslySetInnerHTML={{ __html: t("analysis.signalDesc") }} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="column-divider" />

        {/* Right Column: Chart */}
        <div className="analysis-column chart-column">
          <div className="column-header">
            <span>{t("analysis.chart")}</span>
          </div>
          {selectedDateIndex !== null && selectedDateIndex >= 0 && selectedDateIndex < klineData.length && (
            <div style={{ padding: "4px 12px", fontSize: "11px", color: "#858585", borderBottom: "1px solid #3e3e42" }}>
              <strong style={{ color: "#007acc" }}>{t("analysis.selectedDate")}:</strong> {klineData[selectedDateIndex].date} | 
              O: {klineData[selectedDateIndex].open.toFixed(2)} | 
              H: {klineData[selectedDateIndex].high.toFixed(2)} | 
              L: {klineData[selectedDateIndex].low.toFixed(2)} | 
              C: {klineData[selectedDateIndex].close.toFixed(2)} | 
              V: {(klineData[selectedDateIndex].volume / 10000).toFixed(2)}万
            </div>
          )}
          <div className="chart-content" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Main K-line chart */}
            <div style={{ flex: "1 1 60%", minHeight: 0, position: "relative" }}>
              {Object.keys(chartOption).length === 0 ? (
                <div className="no-data">{t("analysis.noData")}</div>
              ) : (
                <>
                  <button
                    className="chart-zoom-button-overlay"
                    onClick={() => setIsChartDialogOpen(true)}
                    title={t("chart.zoom")}
                  >
                    ZO
                  </button>
                  <ReactECharts
                    ref={chartRef}
                    option={chartOption}
                    style={{ height: "100%", width: "100%" }}
                    opts={{ renderer: "canvas" }}
                    onEvents={{
                      click: (params: any) => {
                        if (params.componentType === "series" || params.componentType === "xAxis") {
                          const dataIndex = params.dataIndex;
                          if (dataIndex !== null && dataIndex !== undefined && dataIndex >= 0 && dataIndex < klineData.length) {
                            setSelectedDateIndex(dataIndex);
                          }
                        }
                      },
                      mousemove: (params: any) => {
                        if (params.componentType === "series" || params.componentType === "xAxis") {
                          const dataIndex = params.dataIndex;
                          if (dataIndex !== null && dataIndex !== undefined && dataIndex >= 0 && dataIndex < klineData.length) {
                            setSelectedDateIndex(dataIndex);
                          }
                        }
                      },
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <ChartDialog
        isOpen={isChartDialogOpen}
        onClose={() => setIsChartDialogOpen(false)}
        title={`${t("analysis.klineAnalysis")} - ${t("chart.title")}`}
        chartOption={chartOption}
      />
    </div>
  );
};

export default KLineTechnicalAnalysis;
