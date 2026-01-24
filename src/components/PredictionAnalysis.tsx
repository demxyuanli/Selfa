import React, { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import * as echarts from "echarts";
import ChartDialog from "./ChartDialog";
import { getIconText } from "./IconUtils";
import "./StockAnalysis.css";
import "./PredictionAnalysis.css";

// Custom ECharts component with proper lifecycle management
interface CustomEChartsProps {
  option: any;
  style?: React.CSSProperties;
  className?: string;
}

const CustomECharts: React.FC<CustomEChartsProps> = ({ option, style, className }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Initialize chart
    try {
      if (!chartRef.current) return;
      
      const instance = echarts.init(chartRef.current, undefined, {
        renderer: 'canvas',
        devicePixelRatio: window.devicePixelRatio || 1
      });
      chartInstanceRef.current = instance;

      // Set initial option
      if (option) {
        instance.setOption(option, true);
      }

      // Ensure chart resizes to container size
      setTimeout(() => {
        if (chartInstanceRef.current && chartRef.current) {
          try {
            chartInstanceRef.current.resize({
              width: chartRef.current.clientWidth,
              height: chartRef.current.clientHeight,
            });
          } catch (error) {
            console.debug("Error in initial resize:", error);
          }
        }
      }, 0);
    } catch (error) {
      console.error("Failed to initialize chart:", error);
    }

    // Cleanup function
    return () => {
      if (chartInstanceRef.current) {
        try {
          // Dispose chart instance
          if (!chartInstanceRef.current.isDisposed()) {
            chartInstanceRef.current.dispose();
          }
        } catch (error) {
          console.debug("Error disposing chart:", error);
        }
        chartInstanceRef.current = null;
      }
    };
  }, []);

  // Update chart when option changes
  useEffect(() => {
    if (chartInstanceRef.current && option) {
      try {
        chartInstanceRef.current.setOption(option, true);
      } catch (error) {
        console.error("Failed to update chart option:", error);
      }
    }
  }, [option]);

  // Handle window resize and container resize
  useEffect(() => {
    const handleResize = () => {
      if (chartInstanceRef.current && chartRef.current) {
        try {
          chartInstanceRef.current.resize({
            width: chartRef.current.clientWidth,
            height: chartRef.current.clientHeight,
          });
        } catch (error) {
          console.debug("Error resizing chart:", error);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    
    // Use ResizeObserver to watch container size changes
    let resizeObserver: ResizeObserver | null = null;
    if (chartRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(chartRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver && chartRef.current) {
        resizeObserver.unobserve(chartRef.current);
        resizeObserver.disconnect();
      }
    };
  }, []);

  return (
    <div
      ref={chartRef}
      style={{ ...style, height: '100%', width: '100%' }}
      className={className}
    />
  );
};

// Error boundary for chart components
class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void; t: (key: string) => string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError?: (error: Error) => void; t: (key: string) => string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Chart error boundary caught an error:", error, errorInfo);
    this.props.onError?.(error);
    this.setState({ hasError: true });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="chart-error">
          <div className="error-message">{this.props.t("chart.loadFailed")}</div>
          <button
            onClick={() => window.location.reload()}
            className="retry-button"
          >
            {this.props.t("chart.refreshPage")}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

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

interface PredictionAnalysisProps {
  klineData: StockData[];
}

type PredictionMethod = 
  | "linear" 
  | "ma" 
  | "technical" 
  | "polynomial"
  | "arima"
  | "exponential"
  | "mean_reversion"
  | "wma"
  | "pattern"
  | "similarity"
  | "ensemble"
  | "fibonacci"
  | "fibonacci_extension"
  | "monte_carlo"
  | "monte_carlo_advanced"
  | "intraday_ma"
  | "intraday_volatility"
  | "intraday_regime";

const PredictionAnalysis: React.FC<PredictionAnalysisProps> = ({ klineData }) => {
  const { t } = useTranslation();
  const [method, setMethod] = useState<PredictionMethod>("linear");
  const [period, setPeriod] = useState(5);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartResetKey, setChartResetKey] = useState(0);

  const getMethodLabel = (m: PredictionMethod): string => {
    const labels: Record<PredictionMethod, string> = {
      technical: t("analysis.methodTechnical"),
      ma: t("analysis.methodMA"),
      wma: t("analysis.methodWMA"),
      pattern: t("analysis.methodPattern"),
      linear: t("analysis.methodLinear"),
      polynomial: t("analysis.methodPolynomial"),
      arima: t("analysis.methodARIMA"),
      exponential: t("analysis.methodExponential"),
      mean_reversion: t("analysis.methodMeanReversion"),
      similarity: t("analysis.methodSimilarity"),
      ensemble: t("analysis.methodEnsemble"),
      fibonacci: t("analysis.methodFibonacci"),
      fibonacci_extension: t("analysis.methodFibonacciExtension"),
      monte_carlo: t("analysis.methodMonteCarlo"),
      monte_carlo_advanced: t("analysis.methodMonteCarloAdvanced"),
      intraday_ma: t("analysis.methodIntradayMA"),
      intraday_volatility: t("analysis.methodIntradayVolatility"),
      intraday_regime: t("analysis.methodIntradayRegime"),
    };
    return labels[m] || m;
  };

  useEffect(() => {
    if (klineData.length > 0) {
      generatePrediction();
    }
  }, [method, period, klineData]);


  const generatePrediction = async () => {
    if (klineData.length < 20) {
      setPredictions([]);
      return;
    }
    
    setLoading(true);
    try {
      const result: PredictionResult[] = await invoke("predict_stock_price", {
        data: klineData,
        method: method,
        period: period,
      });
      setPredictions(result);
    } catch (err) {
      console.error("Error generating prediction:", err);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  };

  const chartOption = useMemo(() => {
    if (klineData.length === 0 || predictions.length === 0) {
      return {
        graphic: {
          elements: [{
            type: "text",
            left: "center",
            top: "middle",
            style: {
              text: t("chart.noData"),
              fontSize: 14,
              fill: "#999",
            },
          }],
        },
      };
    }

    const dates = klineData.map((d) => {
      const dateStr = d.date;
      if (dateStr.includes(" ")) {
        return dateStr.split(" ")[0];
      }
      return dateStr;
    });

    const predDates = predictions.map((p) => p.date);
    const allDates = [...dates, ...predDates];

    const closes = klineData.map((d) => d.close);
    const predictedPrices = predictions.map((p) => p.predicted_price);
    const upperBounds = predictions.map((p) => p.upper_bound);
    const lowerBounds = predictions.map((p) => p.lower_bound);

    const lastPrice = closes[closes.length - 1];
    const predData = [lastPrice, ...predictedPrices];
    const upperData = [lastPrice, ...upperBounds];
    const lowerData = [lastPrice, ...lowerBounds];
    const predictionStartIdx = dates.length - 1;

    // Calculate trend and signals with validation
    const lastPred = predictions[predictions.length - 1]?.predicted_price || lastPrice;
    const trendDirection = lastPred > lastPrice * 1.001 ? "up" : lastPred < lastPrice * 0.999 ? "down" : "flat";
    const trendPercent = lastPrice > 0 ? ((lastPred - lastPrice) / lastPrice * 100) : 0;

    // Calculate average confidence with validation
    const validPredictions = predictions.filter(p => p.confidence > 0);
    const avgConfidence = validPredictions.length > 0
      ? validPredictions.reduce((sum, p) => sum + p.confidence, 0) / validPredictions.length
      : 50.0;

    return {
      backgroundColor: "transparent",
      grid: {
        left: "10%",
        right: "8%",
        top: "25%",
        bottom: "25%",
      },
      xAxis: {
        type: "category",
        data: allDates,
        scale: true,
        boundaryGap: false,
        axisLabel: {
          color: "#858585",
          fontSize: 9,
          interval: allDates.length > 30 ? Math.max(1, Math.floor(allDates.length / 12)) : 0,
          rotate: allDates.length > 30 ? 45 : 0,
          margin: 8,
        },
        splitLine: {
          show: false,
        },
        axisPointer: {
          snap: true,
        },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisPointer: {
          snap: true,
        },
        axisLabel: {
          color: "#858585",
          fontSize: 9,
          formatter: (value: number) => value.toFixed(2),
          margin: 8,
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: "rgba(133, 133, 133, 0.15)",
            type: "dashed",
            width: 1,
          },
        },
        splitNumber: 6,
      },
      graphic: [
        // Compact info panel - top left, single line
        {
          type: "group",
          left: "2%",
          top: "12%",
          children: [
            {
              type: "text",
              style: {
                text: `${t("analysis.method")}: ${getMethodLabel(method)} | ${t("analysis.period")}: ${period}${t("analysis.days")} | ${t("analysis.trend")}: ${trendDirection === "up" ? "↑ " + t("chart.trendUp") : trendDirection === "down" ? "↓ " + t("chart.trendDown") : "→ " + t("chart.trendSideways")} ${Math.abs(trendPercent).toFixed(2)}% | ${t("analysis.confidence")}: ${avgConfidence.toFixed(1)}%`,
                fontSize: 10,
                fill: "#666",
                fontWeight: "normal",
              },
            },
          ],
        },
      ],
      series: [
        // Historical price line
        {
          name: t("stock.price"),
          type: "line",
          data: [...closes, ...new Array(predictions.length).fill(null)],
          symbol: "none",
          lineStyle: {
            color: "#007acc",
            width: 2,
            shadowColor: "rgba(0, 122, 204, 0.3)",
            shadowBlur: 4,
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(0, 122, 204, 0.1)" },
                { offset: 1, color: "rgba(0, 122, 204, 0.02)" },
              ],
            },
          },
          markPoint: {
            data: [
              {
                name: t("analysis.currentPrice"),
                coord: [predictionStartIdx, lastPrice],
                symbol: "circle",
                symbolSize: 10,
                itemStyle: {
                  color: "#007acc",
                  borderColor: "#fff",
                  borderWidth: 2,
                  shadowColor: "rgba(0, 122, 204, 0.5)",
                  shadowBlur: 6,
                },
                label: {
                  show: true,
                  position: "top",
                  formatter: `${t("analysis.currentPrice")}\n${t("common.currencySymbol")}${lastPrice.toFixed(2)}`,
                  fontSize: 11,
                  color: "#007acc",
                  fontWeight: "bold",
                  textBorderColor: "#fff",
                  textBorderWidth: 2,
                  distance: 8,
                },
              },
            ],
          },
        },
        // Prediction line with improved styling
        {
          name: t("analysis.prediction"),
          type: "line",
          data: [...new Array(dates.length).fill(null), ...predData],
          smooth: true,
          symbol: "circle",
          symbolSize: (_value: any, params: any) => {
            // Larger symbols for prediction points
            if (params.dataIndex >= dates.length) {
              return 8;
            }
            return 0;
          },
          showSymbol: true,
          lineStyle: {
            color: trendDirection === "up" ? "#00ff00" : trendDirection === "down" ? "#ff0000" : "#ff9800",
            width: 3,
            type: "solid",
            shadowColor: trendDirection === "up" ? "rgba(0, 255, 0, 0.5)" :
                        trendDirection === "down" ? "rgba(255, 0, 0, 0.5)" : "rgba(255, 152, 0, 0.5)",
            shadowBlur: 6,
          },
          itemStyle: {
            color: (params: any) => {
              if (params.dataIndex >= dates.length) {
                const predIdx = params.dataIndex - dates.length;
                const pred = predictions[predIdx];
                if (pred) {
                  return pred.signal === "buy" ? "#00ff00" : pred.signal === "sell" ? "#ff0000" : "#ff9800";
                }
              }
              return trendDirection === "up" ? "#00ff00" : trendDirection === "down" ? "#ff0000" : "#ff9800";
            },
            borderColor: "#fff",
            borderWidth: 2,
          },
          label: {
            show: true,
            position: (params: any) => {
              // Alternate label positions to avoid overlap
              if (params.dataIndex >= dates.length) {
                const predIdx = params.dataIndex - dates.length;
                // Alternate between top and bottom, with some offset
                const isEven = predIdx % 2 === 0;
                const isFirst = predIdx === 0;
                const isLast = predIdx === predictions.length - 1;
                
                if (isFirst) return "top";
                if (isLast) return "bottom";
                return isEven ? "top" : "bottom";
              }
              return "top";
            },
            formatter: (params: any) => {
              if (params.dataIndex >= dates.length) {
                const predIdx = params.dataIndex - dates.length;
                const pred = predictions[predIdx];
                if (pred) {
                  const signalIconName = pred.signal === "buy" ? "buy" : pred.signal === "sell" ? "sell" : "neutral";
                  const signalIconText = getIconText(signalIconName);
                  // Show date and price, with confidence on next line
                  return `${signalIconText} ${pred.date.split(' ')[0]}\n${t("common.currencySymbol")}${pred.predicted_price.toFixed(2)}\n${pred.confidence.toFixed(0)}%`;
                }
              }
              return "";
            },
            fontSize: 8,
            color: (params: any) => {
              if (params.dataIndex >= dates.length) {
                const predIdx = params.dataIndex - dates.length;
                const pred = predictions[predIdx];
                if (pred) {
                  return pred.signal === "buy" ? "#00ff00" : pred.signal === "sell" ? "#ff0000" : "#ff9800";
                }
              }
              return "#333";
            },
            fontWeight: "bold",
            distance: 12,
            textBorderColor: "#fff",
            textBorderWidth: 2,
            backgroundColor: "rgba(255, 255, 255, 0.8)",
            padding: [2, 4],
            borderRadius: 3,
          },
          emphasis: {
            focus: "series",
            itemStyle: {
              borderWidth: 3,
              shadowBlur: 10,
            },
            label: {
              fontSize: 10,
              show: true,
            },
          },
        },
        // Upper bound line (subtle)
        {
          name: t("analysis.upperBound"),
          type: "line",
          data: [...new Array(dates.length).fill(null), ...upperData],
          smooth: true,
          symbol: "none",
          lineStyle: {
            color: trendDirection === "up" ? "#81c784" : trendDirection === "down" ? "#ef5350" : "#ffb74d",
            width: 1,
            type: "dotted",
            opacity: 0.6,
          },
        },
        // Lower bound line (subtle)
        {
          name: t("analysis.lowerBound"),
          type: "line",
          data: [...new Array(dates.length).fill(null), ...lowerData],
          smooth: true,
          symbol: "none",
          lineStyle: {
            color: trendDirection === "up" ? "#81c784" : trendDirection === "down" ? "#ef5350" : "#ffb74d",
            width: 1,
            type: "dotted",
            opacity: 0.6,
          },
        },
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          snap: true,
        },
        backgroundColor: "rgba(255, 255, 255, 0.98)",
        borderColor: "#ddd",
        borderWidth: 1,
        borderRadius: 8,
        textStyle: {
          color: "#333",
          fontSize: 12,
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return "";
          const param = params[0];
          const idx = param.dataIndex;

          let result = `<div style="margin-bottom: 8px;"><strong style="font-size: 14px; color: #007acc;">${param.axisValue}</strong></div>`;

          params.forEach((p: any) => {
            if (p.value !== null && p.value !== undefined) {
              const value = typeof p.value === "number" ? `${t("common.currencySymbol")}${p.value.toFixed(2)}` : p.value;
              const iconName = p.seriesName === t("stock.price") ? "trendUp" :
                          p.seriesName === t("analysis.prediction") ? "prediction" :
                          p.seriesName === t("analysis.upperBound") ? "arrowUp" :
                          p.seriesName === t("analysis.lowerBound") ? "arrowDown" : "chart";
              const iconText = getIconText(iconName);

              result += `<div style="margin: 4px 0; padding: 2px 0;">
                <span style="display:inline-block;width:10px;height:10px;background:${p.color};border-radius:50%;margin-right:6px;border: 1px solid #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.1);"></span>
                <span style="font-size: 14px; margin-right: 4px;">${iconText}</span> ${p.seriesName}: <strong style="color: ${p.color}">${value}</strong>
              </div>`;
            }
          });

          if (idx >= dates.length && predictions[idx - dates.length]) {
            const pred = predictions[idx - dates.length];
            const signalIconName = pred.signal === "buy" ? "buy" : pred.signal === "sell" ? "sell" : "neutral";
            const signalIconText = getIconText(signalIconName);
            const signalText = pred.signal === "buy" ? t("analysis.bullish") : pred.signal === "sell" ? t("analysis.bearish") : t("analysis.neutral");

            result += `<div style="margin-top: 8px;padding-top: 8px;border-top: 2px solid #eee;">
              <div style="margin: 4px 0;"><strong><span style="font-size: 16px; margin-right: 4px;">${signalIconText}</span>${t("analysis.signal")}: ${signalText}</strong></div>
              <div style="margin: 4px 0;">${t("analysis.confidence")}: <strong style="color: ${pred.confidence > 70 ? '#00ff00' : pred.confidence > 50 ? '#ff9800' : '#ff0000'}">${pred.confidence.toFixed(1)}%</strong></div>
              <div style="margin: 4px 0;">${t("analysis.priceRange")}: ${t("common.currencySymbol")}${pred.lower_bound.toFixed(2)} - ${t("common.currencySymbol")}${pred.upper_bound.toFixed(2)}</div>
              <div style="margin: 4px 0; font-size: 11px; color: #666;">${t("analysis.method")}: ${pred.method}</div>
            </div>`;
          }

          return result;
        },
      },
      legend: {
        data: [
          t("stock.price"),
          t("analysis.prediction"),
          t("analysis.upperBound"),
          t("analysis.lowerBound")
        ],
        textStyle: {
          color: "#666",
          fontSize: 10,
          fontWeight: "normal",
        },
        itemWidth: 14,
        itemHeight: 8,
        itemGap: 20,
        top: "4%",
        left: "center",
        orient: "horizontal",
      },
    };
  }, [klineData, predictions, method, period, t]);

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "buy": return "#00ff00";
      case "sell": return "#ff0000";
      default: return "#858585";
    }
  };

  const getSignalText = (signal: string) => {
    switch (signal) {
      case "buy": return t("analysis.bullish");
      case "sell": return t("analysis.bearish");
      default: return t("analysis.neutral");
    }
  };

  return (
    <div className="prediction-analysis">
      <div className="analysis-columns">
        {/* Left Column: Parameters */}
        <div className="analysis-column params-column">
          <div className="column-header">{t("analysis.params")}</div>
          <div className="params-content">
            <div className="param-section">
              <label className="param-section-label">{t("analysis.prediction")}</label>
              <div className="param-inputs">
                <div className="param-item">
                  <span className="param-item-label">{t("analysis.predictionMethod")}</span>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PredictionMethod)}
                    className="param-select"
                  >
                    <optgroup label={t("analysis.groupTechnical")}>
                      <option value="technical">{t("analysis.methodTechnical")}</option>
                      <option value="ma">{t("analysis.methodMA")}</option>
                      <option value="wma">{t("analysis.methodWMA")}</option>
                      <option value="pattern">{t("analysis.methodPattern")}</option>
                      <option value="fibonacci">{t("analysis.methodFibonacci")}</option>
                      <option value="fibonacci_extension">{t("analysis.methodFibonacciExtension")}</option>
                    </optgroup>
                    <optgroup label={t("analysis.groupStatistical")}>
                      <option value="linear">{t("analysis.methodLinear")}</option>
                      <option value="polynomial">{t("analysis.methodPolynomial")}</option>
                      <option value="arima">{t("analysis.methodARIMA")}</option>
                      <option value="exponential">{t("analysis.methodExponential")}</option>
                      <option value="mean_reversion">{t("analysis.methodMeanReversion")}</option>
                    </optgroup>
                    <optgroup label={t("analysis.groupAdvanced")}>
                      <option value="similarity">{t("analysis.methodSimilarity")}</option>
                      <option value="ensemble">{t("analysis.methodEnsemble")}</option>
                      <option value="monte_carlo">{t("analysis.methodMonteCarlo")}</option>
                      <option value="monte_carlo_advanced">{t("analysis.methodMonteCarloAdvanced")}</option>
                    </optgroup>
                    <optgroup label={t("analysis.groupIntraday")}>
                      <option value="intraday_ma">{t("analysis.methodIntradayMA")}</option>
                      <option value="intraday_volatility">{t("analysis.methodIntradayVolatility")}</option>
                      <option value="intraday_regime">{t("analysis.methodIntradayRegime")}</option>
                    </optgroup>
                  </select>
                </div>
                <div className="param-item">
                  <span className="param-item-label">{t("analysis.predictionPeriod")}</span>
                  <input
                    type="number"
                    value={period}
                    onChange={(e) => setPeriod(parseInt(e.target.value) || 5)}
                    min="3"
                    max="30"
                  />
                </div>
                <button
                  className="generate-btn"
                  onClick={generatePrediction}
                  disabled={loading || klineData.length < 20}
                >
                  {loading ? t("app.loading") : t("analysis.generate")}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="column-divider" />

        {/* Middle Column: Results (40% fixed) */}
        <div className="analysis-column results-column">
          <div className="column-header">{t("analysis.results")}</div>
          <div className="results-content">
            {loading ? (
              <div className="no-data">{t("app.loading")}</div>
            ) : predictions.length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <div className="prediction-results-list">
                {predictions.map((pred, idx) => (
                  <div key={idx} className="prediction-result-card">
                    <div className="pred-result-header">
                      <span className="pred-date">{pred.date}</span>
                      <span
                        className="pred-signal"
                        style={{ backgroundColor: getSignalColor(pred.signal) }}
                      >
                        {getSignalText(pred.signal)}
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
                            backgroundColor: pred.confidence > 70 ? "#00ff00" : pred.confidence > 50 ? "#ff9800" : "#ff0000",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="column-divider" />

        {/* Right Column: Chart */}
        <div className="analysis-column chart-column">
          <div className="column-header">
            <span>{t("analysis.chart")}</span>
            <button
              className="chart-zoom-button"
              onClick={() => setIsChartDialogOpen(true)}
              title={t("chart.zoom")}
            >
              {t("chart.zoomAbbr")}
            </button>
          </div>
          <div className="chart-content">
            {loading ? (
              <div className="no-data">{t("app.loading")}</div>
            ) : Object.keys(chartOption).length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <ChartErrorBoundary
                t={t}
                onError={(error) => {
                  console.error("Prediction chart error:", error);
                  // Force chart reset by incrementing reset key
                  setChartResetKey(prev => prev + 1);
                  // Clear predictions temporarily
                  setPredictions([]);
                  setTimeout(() => {
                    if (klineData.length > 0) {
                      generatePrediction();
                    }
                  }, 100);
                }}
              >
                <div style={{ position: "relative", height: "100%", width: "100%" }}>
                  <CustomECharts
                    key={chartResetKey}
                    option={chartOption}
                    style={{ height: "100%", width: "100%" }}
                  />
                </div>
              </ChartErrorBoundary>
            )}
          </div>
        </div>
      </div>
      <ChartDialog
        isOpen={isChartDialogOpen}
        onClose={() => setIsChartDialogOpen(false)}
        title={`${t("analysis.prediction")} - ${t("chart.title")}`}
        chartOption={chartOption}
      />
    </div>
  );
};

export default PredictionAnalysis;
