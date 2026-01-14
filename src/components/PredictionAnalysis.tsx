import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import "./StockAnalysis.css";
import "./PredictionAnalysis.css";

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
  | "ensemble";

const PredictionAnalysis: React.FC<PredictionAnalysisProps> = ({ klineData }) => {
  const { t } = useTranslation();
  const [method, setMethod] = useState<PredictionMethod>("linear");
  const [period, setPeriod] = useState(5);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [loading, setLoading] = useState(false);

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
      return {};
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

    return {
      backgroundColor: "transparent",
      grid: {
        left: "8%",
        right: "3%",
        top: "12%",
        bottom: "10%",
      },
      xAxis: {
        type: "category",
        data: allDates,
        scale: true,
        boundaryGap: false,
        axisLabel: {
          color: "#858585",
          fontSize: 9,
        },
        splitLine: {
          show: false,
        },
      },
      yAxis: {
        type: "value",
        scale: true,
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
      graphic: [
        {
          type: "text",
          left: "center",
          top: "2%",
          style: {
            text: `${t("analysis.method")}: ${getMethodLabel(method)} | ${t("analysis.period")}: ${period}${t("stock.periods.1d")}`,
            fontSize: 11,
            fontWeight: "bold",
            fill: "#858585",
          },
        },
      ],
      series: [
        {
          name: t("stock.price"),
          type: "line",
          data: [...closes, ...new Array(predictions.length).fill(null)],
          symbol: "none",
          lineStyle: {
            color: "#007acc",
            width: 2,
          },
          markPoint: {
            data: [
              {
                name: t("analysis.currentPrice"),
                coord: [predictionStartIdx, lastPrice],
                symbol: "circle",
                symbolSize: 8,
                itemStyle: { color: "#007acc" },
                label: {
                  show: true,
                  position: "top",
                  formatter: t("analysis.currentPrice") + "\n" + lastPrice.toFixed(2),
                  fontSize: 9,
                  color: "#007acc",
                },
              },
            ],
          },
          markLine: {
            data: [
              {
                xAxis: predictionStartIdx,
                lineStyle: {
                  color: "#ff9800",
                  type: "dashed",
                  width: 2,
                },
                label: {
                  show: true,
                  position: "insideEndTop",
                  formatter: t("analysis.predictionStart"),
                  fontSize: 9,
                  color: "#ff9800",
                },
              },
            ],
          },
        },
        {
          name: t("analysis.prediction"),
          type: "line",
          data: [...new Array(dates.length).fill(null), ...predData],
          smooth: false,
          symbol: "circle",
          symbolSize: 5,
          lineStyle: {
            color: "#ff9800",
            width: 2.5,
            type: "dashed",
          },
          itemStyle: {
            color: "#ff9800",
          },
          markPoint: {
            data: predictions.map((pred, idx) => ({
              name: t("analysis.predictedPrice"),
              coord: [dates.length + idx, pred.predicted_price],
              symbol: "circle",
              symbolSize: 6,
              itemStyle: { color: "#ff9800" },
              label: {
                show: idx === 0 || idx === predictions.length - 1,
                position: "top",
                formatter: `${pred.date}\n${pred.predicted_price.toFixed(2)}`,
                fontSize: 8,
                color: "#ff9800",
              },
            })),
          },
        },
        {
          name: t("analysis.upperBound"),
          type: "line",
          data: [...new Array(dates.length).fill(null), ...upperData],
          smooth: false,
          symbol: "none",
          lineStyle: {
            color: "#ff9800",
            width: 1,
            type: "dotted",
            opacity: 0.6,
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(255, 152, 0, 0.1)" },
                { offset: 1, color: "rgba(255, 152, 0, 0.05)" },
              ],
            },
          },
        },
        {
          name: t("analysis.lowerBound"),
          type: "line",
          data: [...new Array(dates.length).fill(null), ...lowerData],
          smooth: false,
          symbol: "none",
          lineStyle: {
            color: "#ff9800",
            width: 1,
            type: "dotted",
            opacity: 0.6,
          },
        },
        {
          name: t("analysis.confidenceInterval"),
          type: "line",
          data: [...new Array(dates.length).fill(null), ...predData],
          markArea: {
            itemStyle: {
              color: "rgba(255, 152, 0, 0.15)",
            },
            data: [
              [
                { xAxis: predictionStartIdx, yAxis: lowerData[0] },
                { xAxis: allDates.length - 1, yAxis: upperData[upperData.length - 1] },
              ],
            ],
            label: {
              show: true,
              position: "inside",
              formatter: t("analysis.confidenceInterval"),
              fontSize: 9,
              color: "#ff9800",
            },
          },
          lineStyle: { opacity: 0 },
          symbol: "none",
        },
      ],
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#555",
        borderWidth: 1,
        textStyle: {
          color: "#ccc",
          fontSize: 10,
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return "";
          const param = params[0];
          const idx = param.dataIndex;
          let result = `<div style="margin-bottom: 4px;"><strong>${param.axisValue}</strong></div>`;
          
          params.forEach((p: any) => {
            if (p.value !== null && p.value !== undefined) {
              const value = typeof p.value === "number" ? p.value.toFixed(2) : p.value;
              result += `<div style="margin: 2px 0;">
                <span style="display:inline-block;width:8px;height:8px;background:${p.color};border-radius:50%;margin-right:4px;"></span>
                ${p.seriesName}: <strong>${value}</strong>
              </div>`;
            }
          });
          
          if (idx >= dates.length && predictions[idx - dates.length]) {
            const pred = predictions[idx - dates.length];
            result += `<div style="margin-top: 6px;padding-top: 6px;border-top: 1px solid #555;">
              <div>${t("analysis.confidence")}: ${pred.confidence}%</div>
              <div>${t("analysis.priceRange")}: ${pred.lower_bound.toFixed(2)} - ${pred.upper_bound.toFixed(2)}</div>
            </div>`;
          }
          
          return result;
        },
      },
      legend: {
        data: [t("stock.price"), t("analysis.prediction"), t("analysis.upperBound"), t("analysis.lowerBound")],
        textStyle: {
          color: "#858585",
          fontSize: 8,
        },
        itemWidth: 8,
        itemHeight: 8,
        top: 0,
      },
    };
  }, [klineData, predictions, method, period, t]);

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "buy": return "#4caf50";
      case "sell": return "#f44336";
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
                            backgroundColor: pred.confidence > 70 ? "#4caf50" : pred.confidence > 50 ? "#ff9800" : "#f44336",
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
          <div className="column-header">{t("analysis.chart")}</div>
          <div className="chart-content">
            {loading ? (
              <div className="no-data">{t("app.loading")}</div>
            ) : Object.keys(chartOption).length === 0 ? (
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

export default PredictionAnalysis;
