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

interface KLineTechnicalAnalysisProps {
  klineData: StockData[];
}

type IndicatorType = "sma" | "ema" | "bollinger" | "vwap" | "none";
type OscillatorType = "rsi" | "macd" | "kdj" | "momentum" | "none";


const KLineTechnicalAnalysis: React.FC<KLineTechnicalAnalysisProps> = ({ klineData }) => {
  const { t } = useTranslation();
  const [overlayIndicator, setOverlayIndicator] = useState<IndicatorType>("sma");
  const [oscillatorType, setOscillatorType] = useState<OscillatorType>("rsi");
  const [showSignals, setShowSignals] = useState(true);

  // Main chart option
    if (!chipData) return {};
    
    const chartData = chipData.priceLevels.map((price, idx) => {
      const amount = chipData.chipAmounts[idx];
      const isProfit = price < chipData.currentPrice;
      return {
        value: [amount, price],
        itemStyle: {
          color: isProfit ? "#f44336" : "#4caf50", // 红色=获利盘，绿色=套牢盘
        },
      };
    });

    return {
      backgroundColor: "transparent",
      grid: {
        left: "15%",
        right: "5%",
        top: "10%",
        bottom: "10%",
      },
      xAxis: {
        type: "value",
        name: t("analysis.chipAmount"),
        nameLocation: "middle",
        nameGap: 30,
        axisLabel: {
          color: "#858585",
          fontSize: 9,
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: "rgba(133, 133, 133, 0.15)",
            type: "dashed",
            width: 1,
          },
        },
      },
      yAxis: {
        type: "value",
        name: t("stock.price"),
        nameLocation: "middle",
        nameGap: 50,
        scale: true,
        axisLabel: {
          color: "#858585",
          fontSize: 9,
        },
        splitLine: {
          show: false,
        },
      },
      series: [
        {
          name: t("analysis.chipDistribution"),
          type: "bar",
          data: chartData,
          barWidth: "60%",
          label: {
            show: false,
          },
        },
        {
          name: t("analysis.avgCost"),
          type: "line",
          data: [[chipData.avgCost, chipData.avgCost]],
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
              position: "insideEndRight",
              formatter: `${t("analysis.avgCost")}: ${chipData.avgCost.toFixed(2)}`,
              fontSize: 9,
              color: "#FFD700",
            },
            data: [
              {
                yAxis: chipData.avgCost,
              },
            ],
          },
        },
        {
          name: t("analysis.currentPrice"),
          type: "line",
          data: [[chipData.currentPrice, chipData.currentPrice]],
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: {
              color: "#007acc",
              width: 2,
              type: "dashed",
            },
            label: {
              show: true,
              position: "insideEndRight",
              formatter: `${t("analysis.currentPrice")}: ${chipData.currentPrice.toFixed(2)}`,
              fontSize: 9,
              color: "#007acc",
            },
            data: [
              {
                yAxis: chipData.currentPrice,
              },
            ],
          },
        },
      ],
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#555",
        borderWidth: 1,
        textStyle: { color: "#ccc", fontSize: 10 },
        formatter: (params: any) => {
          if (!params || params.length === 0) return "";
          const param = params[0];
          if (param.seriesName === t("analysis.chipDistribution")) {
            const price = param.value[1];
            const amount = param.value[0];
            const isProfit = price < chipData.currentPrice;
            return `<div>
              <div><strong>${t("stock.price")}: ${price.toFixed(2)}</strong></div>
              <div>${t("analysis.chipAmount")}: ${amount.toFixed(0)}</div>
              <div style="color: ${isProfit ? "#f44336" : "#4caf50"}">
                ${isProfit ? t("analysis.profitChip") : t("analysis.lossChip")}
              </div>
            </div>`;
          }
          return "";
        },
      },
      legend: {
        data: series.map(s => s.name).filter(Boolean),
        textStyle: { color: "#858585", fontSize: 8 },
        itemWidth: 8,
        itemHeight: 8,
        top: 0,
      },
    };
  }, [klineData, overlayIndicator, oscillatorType, showSignals]);

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
      { left: "8%", right: "3%", top: "10%", height: oscillatorType !== "none" ? "50%" : "65%" },
      { left: "8%", right: "3%", top: oscillatorType !== "none" ? "65%" : "80%", height: "15%" },
    ];
    
    if (oscillatorType !== "none") {
      grids.push({ left: "8%", right: "3%", top: "85%", height: "10%" });
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
  }, [klineData, overlayIndicator, oscillatorType, showSignals]);

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
            </div>
          </div>
        </div>

        <div className="column-divider" />

        {/* Right Column: Chart */}
        <div className="analysis-column chart-column">
          <div className="column-header">{t("analysis.chart")}</div>
          <div className="chart-content" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Main K-line chart */}
            <div style={{ flex: "1 1 60%", minHeight: 0 }}>
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
    </div>
  );
};

export default KLineTechnicalAnalysis;
