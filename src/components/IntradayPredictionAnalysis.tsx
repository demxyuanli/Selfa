import React, { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import * as echarts from "echarts";
import ChartDialog from "./ChartDialog";
import "./StockAnalysis.css";
import "./PredictionAnalysis.css";

// --- Types ---
interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PredictionResult {
  date: string;
  predicted_price: number;
  confidence: number;
  signal: "buy" | "sell" | "hold";
  upper_bound: number;
  lower_bound: number;
  method: string;
}

interface TechnicalIndicators {
  sma_20: number[];
  sma_50: number[];
  ema_12: number[];
  ema_26: number[];
  rsi: number[];
  macd: number[];
  macd_signal: number[];
  macd_histogram: number[];
  vwap: number[];
  bollinger_middle: number[];
  bollinger_upper: number[];
  bollinger_lower: number[];
  kdj_k: number[];
  kdj_d: number[];
  kdj_j: number[];
}

interface VolumeProfileBin {
  price_range_start: number;
  price_range_end: number;
  volume: number;
  buy_volume: number;
  sell_volume: number;
}

interface LargeOrder {
  date: string;
  price: number;
  volume: number;
  amount: number;
  type_: string;
}

interface BuyingPressure {
  total_buy_volume: number;
  total_sell_volume: number;
  buy_sell_ratio: number;
  net_inflow: number;
}

interface IntradayAnalysisResult {
  volume_profile: VolumeProfileBin[];
  large_orders: LargeOrder[];
  buying_pressure: BuyingPressure;
  vwap: number[];
  vwap_deviation: number[];
  relative_volume: number[];
  momentum: number[];
  volatility: number[];
  opening_range_high: number;
  opening_range_low: number;
  opening_range_breakout: string;
  trend_slope: number;
  trend_r2: number;
}

interface IntradayPredictionAnalysisProps {
  klineData: StockData[];
}

type IntradayPredictionMethod = 
  | "intraday_ma"
  | "intraday_volatility"
  | "intraday_regime";

type ActiveTab = "prediction" | "indicators" | "data_analysis";

// --- Components ---

interface CustomEChartsProps {
  option: any;
  style?: React.CSSProperties;
  className?: string;
  onEvents?: Record<string, (params: any) => void>;
}

const CustomECharts: React.FC<CustomEChartsProps> = ({ option, style, className, onEvents }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    try {
      const instance = echarts.init(chartRef.current, undefined, {
        renderer: 'canvas',
        devicePixelRatio: window.devicePixelRatio || 1
      });
      chartInstanceRef.current = instance;

      if (onEvents) {
        Object.entries(onEvents).forEach(([eventName, handler]) => {
          instance.on(eventName, handler);
        });
      }

      if (option) {
        instance.setOption(option, true);
      }

      const handleResize = () => {
        instance.resize();
      };
      window.addEventListener('resize', handleResize);
      
      const resizeObserver = new ResizeObserver(() => instance.resize());
      resizeObserver.observe(chartRef.current);

      return () => {
        window.removeEventListener('resize', handleResize);
        resizeObserver.disconnect();
        instance.dispose();
      };
    } catch (error) {
      console.error("Failed to initialize chart:", error);
    }
  }, []);

  useEffect(() => {
    if (chartInstanceRef.current && option) {
      chartInstanceRef.current.setOption(option, true); // true = notMerge (replace)
    }
  }, [option]);

  return <div ref={chartRef} style={style} className={className} />;
};

const IntradayPredictionAnalysis: React.FC<IntradayPredictionAnalysisProps> = ({ klineData }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ActiveTab>("prediction");
  
  // Prediction State
  const [method, setMethod] = useState<IntradayPredictionMethod>("intraday_ma");
  const [period, setPeriod] = useState(10);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  
  // Indicators State
  const [indicators, setIndicators] = useState<TechnicalIndicators | null>(null);
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(["MA", "VOL"]));
  
  // Data Analysis State
  const [analysisResult, setAnalysisResult] = useState<IntradayAnalysisResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);

  // --- Data Fetching ---

  useEffect(() => {
    if (klineData.length > 0) {
      if (activeTab === "prediction") {
        if (selectedPointIndex === null) {
            generatePrediction(klineData);
        } else {
            generatePrediction(klineData.slice(0, selectedPointIndex + 1));
        }
      } else if (activeTab === "indicators") {
        fetchIndicators();
      } else if (activeTab === "data_analysis") {
        fetchAnalysis();
      }
    }
  }, [activeTab, method, period, klineData, selectedPointIndex]);

  const generatePrediction = async (dataToUse: StockData[]) => {
    if (dataToUse.length < 20) return;
    setLoading(true);
    try {
      const result: PredictionResult[] = await invoke("predict_stock_price", {
        data: dataToUse,
        method,
        period,
      });
      setPredictions(result);
    } catch (err) {
      console.error("Error generating prediction:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchIndicators = async () => {
    setLoading(true);
    try {
      const result: TechnicalIndicators = await invoke("calculate_technical_indicators", {
        data: klineData,
      });
      setIndicators(result);
    } catch (err) {
      console.error("Error fetching indicators:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalysis = async () => {
    setLoading(true);
    try {
      const result: IntradayAnalysisResult = await invoke("get_intraday_analysis", {
        data: klineData,
      });
      setAnalysisResult(result);
    } catch (err) {
      console.error("Error fetching analysis:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- Chart Logic ---

  const handleChartClick = (params: any) => {
    if (activeTab === "prediction" && params && params.dataIndex !== undefined) {
      if (params.dataIndex < klineData.length) {
        setSelectedPointIndex(params.dataIndex);
      }
    }
  };

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

  const chartOption = useMemo(() => {
    if (klineData.length === 0) return {};

    // Determine if it's intraday data (check if times vary within the same day or just generic time check)
    // For this component, we assume it IS intraday data.
    // We construct a full trading day axis.
    const fullDayTimes = generateTradingMinutes();
    
    // Map existing data to the full day axis
    const timeToDataMap = new Map<string, StockData>();
    
    klineData.forEach(d => {
      const timePart = d.date.split(" ").pop(); // "HH:mm:ss"
      if (timePart) {
        const timeHHMM = timePart.substring(0, 5); // "HH:mm"
        timeToDataMap.set(timeHHMM, d);
      }
    });

    // Create aligned data arrays
    // We need to fill gaps. ECharts handles nulls as breaks or connected lines depending on config.
    // Usually for stock charts, we might want to connect or leave gaps. 
    // But for "aligned" axis, we must provide a value for every category or null.
    
    // However, if klineData has times NOT in standard trading hours (e.g. 09:25 pre-market), 
    // we might want to include them or ignore them. 
    // The user requirement is "conform to trading session specifications", so we strictly use standard hours.
    
    const alignedCloses = fullDayTimes.map(t => {
      const d = timeToDataMap.get(t);
      return d ? d.close : null;
    });

    // Find the last valid index to know where to start prediction
    let lastValidIndex = -1;
    for (let i = 0; i < alignedCloses.length; i++) {
        if (alignedCloses[i] !== null) lastValidIndex = i;
    }
    
    // If we have no valid data in standard hours, fallback to raw data? 
    // No, user wants standard axis.
    
    // Use fullDayTimes as the X-axis categories
    const finalDates = fullDayTimes;

    // Common Grid
    const grid = { left: "10%", right: "8%", top: "10%", bottom: "15%" };

    if (activeTab === "prediction") {
      // Note: selectedPointIndex is an index into klineData, NOT fullDayTimes.
      // We need to map selectedPointIndex (from raw klineData) to index in fullDayTimes.
      
      let mappedPredictionStartIdx = -1;
      if (selectedPointIndex !== null && klineData[selectedPointIndex]) {
          const t = klineData[selectedPointIndex].date.split(" ").pop()?.substring(0, 5);
          if (t) mappedPredictionStartIdx = fullDayTimes.indexOf(t);
      } else {
          mappedPredictionStartIdx = lastValidIndex;
      }
      
      const lastPrice = mappedPredictionStartIdx !== -1 ? alignedCloses[mappedPredictionStartIdx] : 0;
      
      // Prepare prediction data arrays aligned to fullDayTimes
      const predData = new Array(fullDayTimes.length).fill(null);
      const upperData = new Array(fullDayTimes.length).fill(null);
      const lowerData = new Array(fullDayTimes.length).fill(null);
      
      if (mappedPredictionStartIdx !== -1 && lastPrice !== null) {
        predData[mappedPredictionStartIdx] = lastPrice;
        upperData[mappedPredictionStartIdx] = lastPrice;
        lowerData[mappedPredictionStartIdx] = lastPrice;
        
        predictions.forEach((p, i) => {
            // Predictions need to be placed at the correct time slots following the start
            // The prediction result has a 'date' (time). We should match it.
            const pTime = p.date.split(" ").pop()?.substring(0, 5);
            if (pTime) {
                const idx = fullDayTimes.indexOf(pTime);
                if (idx !== -1) {
                    predData[idx] = p.predicted_price;
                    upperData[idx] = p.upper_bound;
                    lowerData[idx] = p.lower_bound;
                }
            } else {
                // Fallback if prediction has no time (unlikely) or just sequential?
                // If prediction just says "next bar", we increment index.
                const idx = mappedPredictionStartIdx + 1 + i;
                if (idx < fullDayTimes.length) {
                    predData[idx] = p.predicted_price;
                    upperData[idx] = p.upper_bound;
                    lowerData[idx] = p.lower_bound;
                }
            }
        });
      }
      
      const lastPred = predictions[predictions.length - 1]?.predicted_price || lastPrice || 0;
      const trendDirection = lastPred > (lastPrice || 0) ? "up" : "down";
      
      // Find index of last prediction for markPoint
      let lastPredIdx = -1;
      for(let i = fullDayTimes.length - 1; i >= 0; i--) {
          if (predData[i] !== null) {
              lastPredIdx = i;
              break;
          }
      }

      return {
        backgroundColor: "transparent",
        tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
        grid,
        xAxis: { type: "category", data: finalDates },
        yAxis: { scale: true, splitLine: { show: true, lineStyle: { type: "dashed", color: "#eee" } } },
        series: [
          {
            name: t("stock.price"),
            type: "line",
            data: alignedCloses,
            itemStyle: { color: "#007acc" },
            symbol: "none",
            connectNulls: true, // Connect gaps in data
            markPoint: mappedPredictionStartIdx !== -1 ? {
                data: [{ coord: [mappedPredictionStartIdx, lastPrice], symbol: "circle", symbolSize: 8, itemStyle: { color: "#007acc" } }]
            } : undefined
          },
          {
            name: t("analysis.prediction"),
            type: "line",
            data: predData,
            smooth: true,
            symbol: "none",
            connectNulls: true,
            lineStyle: {
                color: trendDirection === "up" ? "#ff4081" : "#00e676",
                width: 3,
                type: "dashed"
            },
            markPoint: lastPredIdx !== -1 ? {
                data: [{
                    coord: [lastPredIdx, lastPred],
                    symbol: "pin",
                    symbolSize: 30,
                    itemStyle: { color: trendDirection === "up" ? "#ff4081" : "#00e676" },
                    label: { 
                        show: true, 
                        formatter: () => {
                            return typeof lastPred === 'number' ? lastPred.toFixed(2) : '0.00';
                        }, 
                        color: "#fff", 
                        fontSize: 9 
                    }
                }]
            } : undefined
          },
          { name: t("analysis.upperBound"), type: "line", data: upperData, symbol: "none", connectNulls: true, lineStyle: { opacity: 0 }, areaStyle: { color: trendDirection === "up" ? "rgba(255, 64, 129, 0.1)" : "rgba(0, 230, 118, 0.1)" } },
          { name: t("analysis.lowerBound"), type: "line", data: lowerData, symbol: "none", connectNulls: true, lineStyle: { opacity: 0 } }
        ]
      };
    } 
    
    else if (activeTab === "indicators") {
      // Indicators Layout: Main Chart (Price + MA/BB) + Sub Charts (MACD/RSI/KDJ)
      const subCharts = [];
      if (activeIndicators.has("MACD")) subCharts.push("MACD");
      if (activeIndicators.has("RSI")) subCharts.push("RSI");
      if (activeIndicators.has("KDJ")) subCharts.push("KDJ");
      if (activeIndicators.has("VOL")) subCharts.push("VOL");

      const gridHeight = 100 / (1 + subCharts.length) - 5;
      const grids = [];
      const xAxes: any[] = [];
      const yAxes: any[] = [];
      const series: any[] = [];

      // Helper to align indicator data
      const alignIndicatorData = (data: number[]) => {
          // Indicator data usually matches klineData length and order.
          // We map it to fullDayTimes using the same logic as alignedCloses.
          // Assuming data[i] corresponds to klineData[i].
          const aligned = new Array(fullDayTimes.length).fill(null);
          klineData.forEach((d, i) => {
              const timePart = d.date.split(" ").pop()?.substring(0, 5);
              if (timePart) {
                  const idx = fullDayTimes.indexOf(timePart);
                  if (idx !== -1 && i < data.length) {
                      aligned[idx] = data[i];
                  }
              }
          });
          return aligned;
      };

      // Main Chart
      grids.push({ left: "10%", right: "8%", top: "5%", height: `${gridHeight}%` });
      xAxes.push({ type: "category", data: finalDates, show: subCharts.length === 0 }); // Hide x-axis if subcharts exist
      yAxes.push({ scale: true, splitLine: { show: false } });
      
      series.push({
        name: t("stock.price"),
        type: "line",
        data: alignedCloses,
        itemStyle: { color: "#333" },
        showSymbol: false,
        connectNulls: true
      });

      if (indicators) {
        if (activeIndicators.has("MA")) {
            series.push({ name: t("analysis.ma20"), type: "line", data: alignIndicatorData(indicators.sma_20), showSymbol: false, lineStyle: { width: 1 }, connectNulls: true });
            series.push({ name: t("analysis.ma50"), type: "line", data: alignIndicatorData(indicators.sma_50), showSymbol: false, lineStyle: { width: 1 }, connectNulls: true });
        }
        if (activeIndicators.has("BOLL")) {
            series.push({ name: t("analysis.upper"), type: "line", data: alignIndicatorData(indicators.bollinger_upper), showSymbol: false, lineStyle: { type: "dashed", opacity: 0.5 }, connectNulls: true });
            series.push({ name: t("analysis.lower"), type: "line", data: alignIndicatorData(indicators.bollinger_lower), showSymbol: false, lineStyle: { type: "dashed", opacity: 0.5 }, connectNulls: true });
        }
        if (activeIndicators.has("VWAP")) {
            series.push({ name: t("indicatorVWAP"), type: "line", data: alignIndicatorData(indicators.vwap), showSymbol: false, itemStyle: { color: "#9c27b0" }, lineStyle: { width: 2 }, connectNulls: true });
        }
      }

      // Sub Charts
      subCharts.forEach((ind, idx) => {
        const top = 5 + gridHeight + 5 + idx * (gridHeight + 5);
        grids.push({ left: "10%", right: "8%", top: `${top}%`, height: `${gridHeight}%` });
        xAxes.push({ 
            type: "category", 
            data: finalDates, 
            gridIndex: idx + 1, 
            show: idx === subCharts.length - 1 // Show axis only on last chart
        });
        yAxes.push({ gridIndex: idx + 1, scale: true, splitLine: { show: false }, axisLabel: { fontSize: 9 } });

        if (ind === "MACD" && indicators) {
            series.push({ name: t("analysis.macdDIF"), type: "line", xAxisIndex: idx + 1, yAxisIndex: idx + 1, data: alignIndicatorData(indicators.macd), showSymbol: false, connectNulls: true });
            series.push({ name: t("analysis.macdDEA"), type: "line", xAxisIndex: idx + 1, yAxisIndex: idx + 1, data: alignIndicatorData(indicators.macd_signal), showSymbol: false, connectNulls: true });
            series.push({ name: t("indicatorMACD"), type: "bar", xAxisIndex: idx + 1, yAxisIndex: idx + 1, data: alignIndicatorData(indicators.macd_histogram), itemStyle: { color: (p: any) => p.value > 0 ? "#ef5350" : "#26a69a" } });
        } else if (ind === "RSI" && indicators) {
            series.push({ name: t("indicatorRSI"), type: "line", xAxisIndex: idx + 1, yAxisIndex: idx + 1, data: alignIndicatorData(indicators.rsi), showSymbol: false, connectNulls: true });
            series.push({ type: 'line', xAxisIndex: idx + 1, yAxisIndex: idx + 1, markLine: { data: [{ yAxis: 70 }, { yAxis: 30 }], symbol: "none", lineStyle: { type: "dashed", color: "#ccc" } } });
        } else if (ind === "KDJ" && indicators) {
            series.push({ name: t("analysis.kdjK"), type: "line", xAxisIndex: idx + 1, yAxisIndex: idx + 1, data: alignIndicatorData(indicators.kdj_k), showSymbol: false, connectNulls: true });
            series.push({ name: t("analysis.kdjD"), type: "line", xAxisIndex: idx + 1, yAxisIndex: idx + 1, data: alignIndicatorData(indicators.kdj_d), showSymbol: false, connectNulls: true });
            series.push({ name: t("analysis.kdjJ"), type: "line", xAxisIndex: idx + 1, yAxisIndex: idx + 1, data: alignIndicatorData(indicators.kdj_j), showSymbol: false, connectNulls: true });
        } else if (ind === "VOL") {
            const alignedVol = new Array(fullDayTimes.length).fill(null);
            klineData.forEach((d) => {
                const timePart = d.date.split(" ").pop()?.substring(0, 5);
                if (timePart) {
                    const idx = fullDayTimes.indexOf(timePart);
                    if (idx !== -1) {
                        alignedVol[idx] = {
                            value: d.volume,
                            itemStyle: { color: d.close > d.open ? "#ef5350" : "#26a69a" }
                        };
                    }
                }
            });
            
            series.push({ 
                name: t("analysis.analysisVolume"), 
                type: "bar", 
                xAxisIndex: idx + 1, 
                yAxisIndex: idx + 1, 
                data: alignedVol
            });
        }
      });

      return {
        tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
        axisPointer: { link: { xAxisIndex: 'all' } },
        grid: grids,
        xAxis: xAxes,
        yAxis: yAxes,
        series: series
      };
    } 
    
    else if (activeTab === "data_analysis" && analysisResult) {
      // Data Analysis Layout:
      // Left: Price Chart with Large Orders
      // Right: Volume Profile (Horizontal)
      
      // Align Large Orders
      const alignedLargeOrders = analysisResult.large_orders.map(o => {
          const timePart = o.date.split(" ").pop()?.substring(0, 5);
          const idx = timePart ? fullDayTimes.indexOf(timePart) : -1;
          return [idx, o.price, o.volume, o.type_];
      }).filter(item => item[0] !== -1);

      return {
        tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
        grid: [
            { left: "5%", right: "35%", top: "10%", bottom: "10%" }, // Price Chart
            { left: "70%", right: "5%", top: "10%", bottom: "10%" }  // Volume Profile
        ],
        xAxis: [
            { type: "category", data: finalDates, gridIndex: 0 },
            { type: "value", gridIndex: 1, show: false } // Volume axis
        ],
        yAxis: [
            { scale: true, gridIndex: 0 },
            { type: "category", data: analysisResult.volume_profile.map(b => b.price_range_start.toFixed(2)), gridIndex: 1, show: false } // Price axis for profile (aligned)
        ],
        series: [
            {
                name: t("stock.price"),
                type: "line",
                data: alignedCloses,
                xAxisIndex: 0,
                yAxisIndex: 0,
                showSymbol: false,
                connectNulls: true,
                markLine: {
                  data: [
                    { yAxis: analysisResult.opening_range_high, name: "OR High" },
                    { yAxis: analysisResult.opening_range_low, name: "OR Low" }
                  ],
                  symbol: "none",
                  lineStyle: { type: "dashed", color: "#888" },
                  label: { show: true }
                }
            },
            {
                name: t("analysis.indicatorVWAP"),
                type: "line",
                data: alignIndicatorData(analysisResult.vwap), 
                xAxisIndex: 0,
                yAxisIndex: 0,
                showSymbol: false,
                connectNulls: true,
                lineStyle: { width: 1, color: "#ffd54f" }
            },
            // Large Orders Scatter
            {
                name: t("analysis.analysisLargeOrders"),
                type: "scatter",
                xAxisIndex: 0,
                yAxisIndex: 0,
                data: alignedLargeOrders,
                symbolSize: (val: any) => Math.min(20, Math.max(5, Math.log(val[2]) * 2)),
                itemStyle: {
                    color: (p: any) => p.data[3] === "buy" ? "rgba(239, 83, 80, 0.7)" : "rgba(38, 166, 154, 0.7)"
                }
            },
            // Volume Profile (Horizontal Bar)
            {
                name: t("analysis.analysisBuyVolume"),
                type: "bar",
                stack: "profile",
                xAxisIndex: 1,
                yAxisIndex: 1,
                data: analysisResult.volume_profile.map(b => b.buy_volume),
                itemStyle: { color: "rgba(239, 83, 80, 0.5)" },
                barWidth: "90%"
            },
            {
                name: t("analysis.analysisSellVolume"),
                type: "bar",
                stack: "profile",
                xAxisIndex: 1,
                yAxisIndex: 1,
                data: analysisResult.volume_profile.map(b => b.sell_volume),
                itemStyle: { color: "rgba(38, 166, 154, 0.5)" },
                barWidth: "90%"
            }
        ]
      };
    }

    return {};
  }, [klineData, activeTab, predictions, indicators, activeIndicators, analysisResult, selectedPointIndex, t]);

  const toggleIndicator = (key: string) => {
    const newSet = new Set(activeIndicators);
    if (newSet.has(key)) newSet.delete(key);
    else newSet.add(key);
    setActiveIndicators(newSet);
  };

  return (
    <div className="prediction-analysis intraday-prediction">
      {/* Top Tab Bar */}
      <div className="intraday-tabs">
        <button className={`tab-btn ${activeTab === "prediction" ? "active" : ""}`} onClick={() => setActiveTab("prediction")}>
          {t("analysis.tabPrediction")}
        </button>
        <button className={`tab-btn ${activeTab === "indicators" ? "active" : ""}`} onClick={() => setActiveTab("indicators")}>
          {t("analysis.tabIndicators")}
        </button>
        <button className={`tab-btn ${activeTab === "data_analysis" ? "active" : ""}`} onClick={() => setActiveTab("data_analysis")}>
          {t("analysis.tabDataAnalysis")}
        </button>
      </div>

      <div className="analysis-columns">
        {/* Left Column: Parameters */}
        <div className="analysis-column params-column">
          <div className="column-header">{t("analysis.params")}</div>
          <div className="params-content">
            {activeTab === "prediction" && (
              <div className="param-section">
                <label className="param-section-label">{t("analysis.intradayPrediction")}</label>
                <div className="param-inputs">
                  <div className="param-item">
                    <span className="param-item-label">{t("analysis.predictionMethod")}</span>
                    <select value={method} onChange={(e) => setMethod(e.target.value as IntradayPredictionMethod)} className="param-select">
                      <option value="intraday_ma">{t("analysis.methodIntradayMA")}</option>
                      <option value="intraday_volatility">{t("analysis.methodIntradayVolatility")}</option>
                      <option value="intraday_regime">{t("analysis.methodIntradayRegime")}</option>
                    </select>
                  </div>
                  <div className="param-item">
                    <span className="param-item-label">{t("analysis.predictionPeriod")} ({t("analysis.bars")})</span>
                    <input
                      type="number"
                      value={period}
                      onChange={(e) => setPeriod(parseInt(e.target.value) || 5)}
                      min="3"
                      max="60"
                    />
                  </div>
                  {selectedPointIndex !== null && (
                    <button className="generate-btn reset" onClick={() => setSelectedPointIndex(null)}>
                      {t("analysis.resetSelection")}
                    </button>
                  )}
                  <button
                    className="generate-btn"
                    onClick={() => generatePrediction(selectedPointIndex !== null ? klineData.slice(0, selectedPointIndex + 1) : klineData)}
                    disabled={loading || klineData.length < 20}
                  >
                    {loading ? t("app.loading") : t("analysis.generate")}
                  </button>
                </div>
              </div>
            )}
            {activeTab === "indicators" && (
              <div className="param-section">
                <label className="param-section-label">{t("analysis.indicators")}</label>
                <div className="indicator-toggles">
                  {["MA", "BOLL", "VWAP", "MACD", "RSI", "KDJ", "VOL"].map(ind => (
                    <button key={ind} className={`toggle-btn ${activeIndicators.has(ind) ? "active" : ""}`} onClick={() => toggleIndicator(ind)}>
                      {t(`analysis.indicator${ind}`) || ind}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeTab === "data_analysis" && analysisResult && (
              <div className="param-section">
                <label className="param-section-label">{t("analysis.analysisBuySellPressure")}</label>
                <div className="pressure-gauge">
                  <div className="pressure-label">{t("analysis.buy")}: {(analysisResult.buying_pressure.total_buy_volume / 10000).toFixed(0)}{t("common.tenThousand")}</div>
                  <div className="pressure-bar">
                    <div className="pressure-fill buy" style={{ width: `${(analysisResult.buying_pressure.total_buy_volume / (analysisResult.buying_pressure.total_buy_volume + analysisResult.buying_pressure.total_sell_volume)) * 100}%` }}></div>
                  </div>
                  <div className="pressure-label">{t("analysis.sell")}: {(analysisResult.buying_pressure.total_sell_volume / 10000).toFixed(0)}{t("common.tenThousand")}</div>
                </div>
                <div className="stat-item">
                  <span>{t("analysis.analysisNetInflow")}:</span>
                  <span className={analysisResult.buying_pressure.net_inflow > 0 ? "text-up" : "text-down"}>
                    {analysisResult.buying_pressure.net_inflow > 0 ? "+" : ""}{(analysisResult.buying_pressure.net_inflow / 10000).toFixed(2)}{t("common.tenThousand")}
                  </span>
                </div>
                <div className="stat-item">
                  <span>OR Range:</span>
                  <span>{analysisResult.opening_range_low.toFixed(2)} - {analysisResult.opening_range_high.toFixed(2)}</span>
                </div>
                <div className="stat-item">
                  <span>OR Break:</span>
                  <span>{analysisResult.opening_range_breakout}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="column-divider" />

        {/* Middle Column: Results */}
        <div className="analysis-column results-column">
          <div className="column-header">{t("analysis.results")}</div>
          <div className="results-content">
            {loading ? (
              <div className="no-data">{t("app.loading")}</div>
            ) : activeTab === "prediction" ? (
              predictions.length === 0 ? (
                <div className="no-data">{t("analysis.noData")}</div>
              ) : (
                <div className="prediction-results-list">
                  {predictions.map((pred, idx) => (
                    <div key={idx} className="prediction-result-card">
                      <div className="pred-result-header">
                        <span className="pred-date">{pred.date.split(" ").pop()}</span>
                        <span
                          className="pred-signal"
                          style={{ backgroundColor: pred.signal === "buy" ? "#ff4081" : pred.signal === "sell" ? "#00e676" : "#ffab00" }}
                        >
                          {pred.signal === "buy" ? t("analysis.bullish") : pred.signal === "sell" ? t("analysis.bearish") : t("analysis.neutral")}
                        </span>
                      </div>
                      <div className="pred-price">
                        {t("analysis.predictedPrice")}: {pred.predicted_price.toFixed(2)}
                      </div>
                      <div className="pred-range">
                        {t("analysis.priceRange")}: {pred.lower_bound.toFixed(2)} - {pred.upper_bound.toFixed(2)}
                      </div>
                      <div className="pred-confidence">
                        <span>{t("analysis.confidence")}: {pred.confidence.toFixed(0)}%</span>
                        <div className="confidence-bar-mini">
                          <div
                            className="confidence-fill-mini"
                            style={{
                              width: `${pred.confidence}%`,
                              backgroundColor: pred.confidence > 70 ? "#ff4081" : pred.confidence > 50 ? "#ffab00" : "#00e676",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : activeTab === "indicators" ? (
              indicators && activeIndicators.size > 0 ? (
                <div className="indicators-results" style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", height: "100%" }}>
                  {activeIndicators.has("MA") && indicators.sma_20.length > 0 && (
                    <div className="indicator-card" style={{ background: "#252526", border: "1px solid #3e3e42", borderRadius: "4px", padding: "12px" }}>
                      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <span className="card-title" style={{ fontSize: "12px", fontWeight: "bold", color: "#cccccc" }}>{t("analysis.indicatorMA")}</span>
                        {klineData.length > 0 && (() => {
                          const lastPrice = klineData[klineData.length - 1].close;
                          const ma20 = indicators.sma_20[indicators.sma_20.length - 1];
                          const ma50 = indicators.sma_50.length > 0 ? indicators.sma_50[indicators.sma_50.length - 1] : ma20;
                          let signal = "neutral";
                          if (lastPrice > ma20 && ma20 > ma50) signal = "buy";
                          else if (lastPrice < ma20 && ma20 < ma50) signal = "sell";
                          return (
                            <span
                              className="signal-badge"
                              style={{
                                backgroundColor: signal === "buy" ? "#ff4081" : signal === "sell" ? "#00e676" : "#ffab00",
                                padding: "2px 8px",
                                borderRadius: "3px",
                                fontSize: "9px",
                                fontWeight: "bold",
                                color: "white",
                              }}
                            >
                              {signal === "buy" ? t("analysis.bullish") : signal === "sell" ? t("analysis.bearish") : t("analysis.neutral")}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="indicators-list" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div className="indicator-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                          <span className="indicator-name" style={{ color: "#858585" }}>{t("analysis.ma20")}:</span>
                          <span className="indicator-value" style={{ color: "#cccccc", fontWeight: "500" }}>{indicators.sma_20[indicators.sma_20.length - 1].toFixed(2)}</span>
                        </div>
                        {indicators.sma_50.length > 0 && (
                          <div className="indicator-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                            <span className="indicator-name" style={{ color: "#858585" }}>{t("analysis.ma50")}:</span>
                            <span className="indicator-value" style={{ color: "#cccccc", fontWeight: "500" }}>{indicators.sma_50[indicators.sma_50.length - 1].toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {activeIndicators.has("BOLL") && indicators.bollinger_upper.length > 0 && (
                    <div className="indicator-card" style={{ background: "#252526", border: "1px solid #3e3e42", borderRadius: "4px", padding: "12px" }}>
                      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <span className="card-title" style={{ fontSize: "12px", fontWeight: "bold", color: "#cccccc" }}>{t("analysis.indicatorBOLL")}</span>
                        {klineData.length > 0 && (() => {
                          const lastPrice = klineData[klineData.length - 1].close;
                          const upper = indicators.bollinger_upper[indicators.bollinger_upper.length - 1];
                          const lower = indicators.bollinger_lower[indicators.bollinger_lower.length - 1];
                          let signal = "neutral";
                          if (lastPrice > upper) signal = "sell";
                          else if (lastPrice < lower) signal = "buy";
                          return (
                            <span
                              className="signal-badge"
                              style={{
                                backgroundColor: signal === "buy" ? "#ff4081" : signal === "sell" ? "#00e676" : "#ffab00",
                                padding: "2px 8px",
                                borderRadius: "3px",
                                fontSize: "9px",
                                fontWeight: "bold",
                                color: "white",
                              }}
                            >
                              {signal === "buy" ? t("analysis.bullish") : signal === "sell" ? t("analysis.bearish") : t("analysis.neutral")}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="indicators-list" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div className="indicator-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                          <span className="indicator-name" style={{ color: "#858585" }}>{t("analysis.upper")}:</span>
                          <span className="indicator-value" style={{ color: "#cccccc", fontWeight: "500" }}>{indicators.bollinger_upper[indicators.bollinger_upper.length - 1].toFixed(2)}</span>
                        </div>
                        <div className="indicator-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                          <span className="indicator-name" style={{ color: "#858585" }}>{t("analysis.lower")}:</span>
                          <span className="indicator-value" style={{ color: "#cccccc", fontWeight: "500" }}>{indicators.bollinger_lower[indicators.bollinger_lower.length - 1].toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeIndicators.has("VWAP") && indicators.vwap.length > 0 && (
                    <div className="indicator-card" style={{ background: "#252526", border: "1px solid #3e3e42", borderRadius: "4px", padding: "12px" }}>
                      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <span className="card-title" style={{ fontSize: "12px", fontWeight: "bold", color: "#cccccc" }}>{t("analysis.indicatorVWAP")}</span>
                        {klineData.length > 0 && (() => {
                          const lastPrice = klineData[klineData.length - 1].close;
                          const vwap = indicators.vwap[indicators.vwap.length - 1];
                          const signal = lastPrice > vwap ? "buy" : "sell";
                          return (
                            <span
                              className="signal-badge"
                              style={{
                                backgroundColor: signal === "buy" ? "#ff4081" : signal === "sell" ? "#00e676" : "#ffab00",
                                padding: "2px 8px",
                                borderRadius: "3px",
                                fontSize: "9px",
                                fontWeight: "bold",
                                color: "white",
                              }}
                            >
                              {signal === "buy" ? t("analysis.bullish") : signal === "sell" ? t("analysis.bearish") : t("analysis.neutral")}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="indicators-list" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div className="indicator-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                          <span className="indicator-name" style={{ color: "#858585" }}>{t("analysis.overlayVWAP")}:</span>
                          <span className="indicator-value" style={{ color: "#cccccc", fontWeight: "500" }}>{indicators.vwap[indicators.vwap.length - 1].toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeIndicators.has("MACD") && indicators.macd.length > 0 && (
                    <div className="indicator-card" style={{ background: "#252526", border: "1px solid #3e3e42", borderRadius: "4px", padding: "12px" }}>
                      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <span className="card-title" style={{ fontSize: "12px", fontWeight: "bold", color: "#cccccc" }}>{t("analysis.indicatorMACD")}</span>
                        {(() => {
                          const macd = indicators.macd[indicators.macd.length - 1];
                          const signal = indicators.macd_signal[indicators.macd_signal.length - 1];
                          const prevMacd = indicators.macd.length > 1 ? indicators.macd[indicators.macd.length - 2] : macd;
                          const prevSignal = indicators.macd_signal.length > 1 ? indicators.macd_signal[indicators.macd_signal.length - 2] : signal;
                          let indicatorSignal = "neutral";
                          if (macd > signal && prevMacd <= prevSignal) indicatorSignal = "buy";
                          else if (macd < signal && prevMacd >= prevSignal) indicatorSignal = "sell";
                          return (
                            <span
                              className="signal-badge"
                              style={{
                                backgroundColor: indicatorSignal === "buy" ? "#ff4081" : indicatorSignal === "sell" ? "#00e676" : "#ffab00",
                                padding: "2px 8px",
                                borderRadius: "3px",
                                fontSize: "9px",
                                fontWeight: "bold",
                                color: "white",
                              }}
                            >
                              {indicatorSignal === "buy" ? t("analysis.bullish") : indicatorSignal === "sell" ? t("analysis.bearish") : t("analysis.neutral")}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="indicators-list" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div className="indicator-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                          <span className="indicator-name" style={{ color: "#858585" }}>{t("analysis.macdDIF")}:</span>
                          <span className="indicator-value" style={{ color: "#cccccc", fontWeight: "500" }}>{indicators.macd[indicators.macd.length - 1].toFixed(2)}</span>
                        </div>
                        <div className="indicator-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                          <span className="indicator-name" style={{ color: "#858585" }}>{t("analysis.macdDEA")}:</span>
                          <span className="indicator-value" style={{ color: "#cccccc", fontWeight: "500" }}>{indicators.macd_signal[indicators.macd_signal.length - 1].toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeIndicators.has("RSI") && indicators.rsi.length > 0 && (
                    <div className="indicator-card" style={{ background: "#252526", border: "1px solid #3e3e42", borderRadius: "4px", padding: "12px" }}>
                      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <span className="card-title" style={{ fontSize: "12px", fontWeight: "bold", color: "#cccccc" }}>{t("analysis.indicatorRSI")}</span>
                        {(() => {
                          const rsi = indicators.rsi[indicators.rsi.length - 1];
                          let signal = "neutral";
                          if (rsi < 30) signal = "buy";
                          else if (rsi > 70) signal = "sell";
                          return (
                            <span
                              className="signal-badge"
                              style={{
                                backgroundColor: signal === "buy" ? "#ff4081" : signal === "sell" ? "#00e676" : "#ffab00",
                                padding: "2px 8px",
                                borderRadius: "3px",
                                fontSize: "9px",
                                fontWeight: "bold",
                                color: "white",
                              }}
                            >
                              {signal === "buy" ? t("analysis.bullish") : signal === "sell" ? t("analysis.bearish") : t("analysis.neutral")}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="indicators-list" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div className="indicator-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                          <span className="indicator-name" style={{ color: "#858585" }}>{t("analysis.rsi")}:</span>
                          <span className="indicator-value" style={{ color: "#cccccc", fontWeight: "500" }}>{indicators.rsi[indicators.rsi.length - 1].toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeIndicators.has("KDJ") && indicators.kdj_k.length > 0 && (
                    <div className="indicator-card" style={{ background: "#252526", border: "1px solid #3e3e42", borderRadius: "4px", padding: "12px" }}>
                      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <span className="card-title" style={{ fontSize: "12px", fontWeight: "bold", color: "#cccccc" }}>{t("analysis.indicatorKDJ")}</span>
                        {(() => {
                          const k = indicators.kdj_k[indicators.kdj_k.length - 1];
                          const d = indicators.kdj_d[indicators.kdj_d.length - 1];
                          const j = indicators.kdj_j[indicators.kdj_j.length - 1];
                          let signal = "neutral";
                          if (k < 20 && d < 20 && j < 20) signal = "buy";
                          else if (k > 80 && d > 80 && j > 80) signal = "sell";
                          return (
                            <span
                              className="signal-badge"
                              style={{
                                backgroundColor: signal === "buy" ? "#ff4081" : signal === "sell" ? "#00e676" : "#ffab00",
                                padding: "2px 8px",
                                borderRadius: "3px",
                                fontSize: "9px",
                                fontWeight: "bold",
                                color: "white",
                              }}
                            >
                              {signal === "buy" ? t("analysis.bullish") : signal === "sell" ? t("analysis.bearish") : t("analysis.neutral")}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="indicators-list" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div className="indicator-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                          <span className="indicator-name" style={{ color: "#858585" }}>{t("analysis.kdjK")}:</span>
                          <span className="indicator-value" style={{ color: "#cccccc", fontWeight: "500" }}>{indicators.kdj_k[indicators.kdj_k.length - 1].toFixed(2)}</span>
                        </div>
                        <div className="indicator-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                          <span className="indicator-name" style={{ color: "#858585" }}>{t("analysis.kdjD")}:</span>
                          <span className="indicator-value" style={{ color: "#cccccc", fontWeight: "500" }}>{indicators.kdj_d[indicators.kdj_d.length - 1].toFixed(2)}</span>
                        </div>
                        <div className="indicator-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                          <span className="indicator-name" style={{ color: "#858585" }}>{t("analysis.kdjJ")}:</span>
                          <span className="indicator-value" style={{ color: "#cccccc", fontWeight: "500" }}>{indicators.kdj_j[indicators.kdj_j.length - 1].toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeIndicators.has("VOL") && klineData.length > 0 && (
                    <div className="indicator-card" style={{ background: "#252526", border: "1px solid #3e3e42", borderRadius: "4px", padding: "12px" }}>
                      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <span className="card-title" style={{ fontSize: "12px", fontWeight: "bold", color: "#cccccc" }}>{t("analysis.indicatorVOL")}</span>
                      </div>
                      <div className="indicators-list" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div className="indicator-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                          <span className="indicator-name" style={{ color: "#858585" }}>{t("analysis.analysisVolume")}:</span>
                          <span className="indicator-value" style={{ color: "#cccccc", fontWeight: "500" }}>{(klineData[klineData.length - 1].volume / 10000).toFixed(2)}{t("common.tenThousand")}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="no-data">{t("analysis.selectIndicators")}</div>
              )
            ) : activeTab === "data_analysis" ? (
              analysisResult ? (
                <div className="analysis-results">
                  <div className="stat-item">
                    <span>{t("analysis.analysisBuyVolume")}:</span>
                    <span className="text-up">{(analysisResult.buying_pressure.total_buy_volume / 10000).toFixed(2)}{t("common.tenThousand")}</span>
                  </div>
                  <div className="stat-item">
                    <span>{t("analysis.analysisSellVolume")}:</span>
                    <span className="text-down">{(analysisResult.buying_pressure.total_sell_volume / 10000).toFixed(2)}{t("common.tenThousand")}</span>
                  </div>
                  <div className="stat-item">
                    <span>{t("analysis.analysisNetInflow")}:</span>
                    <span className={analysisResult.buying_pressure.net_inflow > 0 ? "text-up" : "text-down"}>
                      {analysisResult.buying_pressure.net_inflow > 0 ? "+" : ""}{(analysisResult.buying_pressure.net_inflow / 10000).toFixed(2)}{t("common.tenThousand")}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span>VWAP Dev:</span>
                    <span>{analysisResult.vwap_deviation.length > 0 ? analysisResult.vwap_deviation[analysisResult.vwap_deviation.length - 1].toFixed(3) : "0.000"}</span>
                  </div>
                  <div className="stat-item">
                    <span>Rel Vol:</span>
                    <span>{analysisResult.relative_volume.length > 0 ? analysisResult.relative_volume[analysisResult.relative_volume.length - 1].toFixed(2) : "0.00"}</span>
                  </div>
                  <div className="stat-item">
                    <span>Momentum:</span>
                    <span>{analysisResult.momentum.length > 0 ? (analysisResult.momentum[analysisResult.momentum.length - 1] * 100).toFixed(2) : "0.00"}%</span>
                  </div>
                  <div className="stat-item">
                    <span>Volatility:</span>
                    <span>{analysisResult.volatility.length > 0 ? (analysisResult.volatility[analysisResult.volatility.length - 1] * 100).toFixed(2) : "0.00"}%</span>
                  </div>
                  <div className="stat-item">
                    <span>Trend Slope:</span>
                    <span>{analysisResult.trend_slope.toFixed(6)}</span>
                  </div>
                  <div className="stat-item">
                    <span>Trend R2:</span>
                    <span>{analysisResult.trend_r2.toFixed(3)}</span>
                  </div>
                </div>
              ) : (
                <div className="no-data">{t("analysis.noData")}</div>
              )
            ) : null}
          </div>
        </div>

        <div className="column-divider" />

        {/* Right Column: Chart */}
        <div className="analysis-column chart-column">
          <div className="column-header">
            <span>{t("analysis.chart")}</span>
            <button className="chart-zoom-button" onClick={() => setIsChartDialogOpen(true)} title={t("chart.zoom")}>
              {t("chart.zoomAbbr")}
            </button>
          </div>
          <div className="chart-content">
            {loading ? (
              <div className="no-data">{t("app.loading")}</div>
            ) : Object.keys(chartOption).length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <CustomECharts option={chartOption} onEvents={{ click: handleChartClick }} style={{ height: "100%", width: "100%" }} />
            )}
          </div>
        </div>
      </div>
      
      <ChartDialog isOpen={isChartDialogOpen} onClose={() => setIsChartDialogOpen(false)} title={t("chart.title")} chartOption={chartOption} />
    </div>
  );
};

export default IntradayPredictionAnalysis;
