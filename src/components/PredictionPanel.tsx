import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import Icon from "./Icon";
import "./PredictionPanel.css";

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

interface PredictionPanelProps {
  data: StockData[];
  klineData: StockData[];
  visible: boolean;
  onClose: () => void;
}

type PredictionMethod = "linear" | "ma" | "technical" | "polynomial";

const PredictionPanel: React.FC<PredictionPanelProps> = ({
  klineData,
  visible,
  onClose,
}) => {
  const { t } = useTranslation();
  const [method, setMethod] = useState<PredictionMethod>("linear");
  const [period, setPeriod] = useState(5);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && klineData.length > 0) {
      generatePrediction();
    }
  }, [visible, method, period, klineData]);

  const generatePrediction = async () => {
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

    const candlestickData = klineData.map((d) => [d.open, d.close, d.low, d.high]);
    const predictedPrices = predictions.map((p) => p.predicted_price);
    const upperBounds = predictions.map((p) => p.upper_bound);
    const lowerBounds = predictions.map((p) => p.lower_bound);

    const historicalPrices = klineData.map((d) => d.close);
    const lastPrice = historicalPrices[historicalPrices.length - 1];
    const predData = [lastPrice, ...predictedPrices];
    const upperData = [lastPrice, ...upperBounds];
    const lowerData = [lastPrice, ...lowerBounds];

    return {
      backgroundColor: "#1e1e1e",
      grid: {
        left: "5%",
        right: "3%",
        top: "15%",
        bottom: "10%",
      },
      xAxis: {
        type: "category",
        data: allDates,
        scale: true,
        boundaryGap: false,
        axisLabel: {
          color: "#858585",
          fontSize: 11,
        },
        axisLine: {
          lineStyle: {
            color: "#3e3e42",
          },
        },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: {
          color: "#858585",
          fontSize: 11,
        },
        axisLine: {
          lineStyle: {
            color: "#3e3e42",
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: "#3e3e42",
            opacity: 0.5,
          },
        },
      },
      series: [
        {
          name: t("portfolio.kline"),
          type: "candlestick",
          data: candlestickData,
          itemStyle: {
            color: "#ff0000",
            color0: "#00ff00",
            borderColor: "#ff0000",
            borderColor0: "#00ff00",
          },
        },
        {
          name: t("portfolio.predictedPrice"),
          type: "line",
          data: [...new Array(dates.length).fill(null), ...predData],
          smooth: false,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: {
            color: "#ff9800",
            width: 2,
            type: "dashed",
          },
          itemStyle: {
            color: "#ff9800",
          },
        },
        {
          name: t("portfolio.upperBound"),
          type: "line",
          data: [...new Array(dates.length).fill(null), ...upperData],
          smooth: false,
          symbol: "none",
          lineStyle: {
            color: "#ff9800",
            width: 1,
            type: "dotted",
            opacity: 0.5,
          },
        },
        {
          name: t("portfolio.lowerBound"),
          type: "line",
          data: [...new Array(dates.length).fill(null), ...lowerData],
          smooth: false,
          symbol: "none",
          lineStyle: {
            color: "#ff9800",
            width: 1,
            type: "dotted",
            opacity: 0.5,
          },
        },
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
        },
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#3e3e42",
        textStyle: {
          color: "#cccccc",
        },
      },
      legend: {
        data: [t("portfolio.kline"), t("portfolio.predictedPrice"), t("portfolio.upperBound"), t("portfolio.lowerBound")],
        textStyle: {
          color: "#cccccc",
          fontSize: 6,
        },
        itemWidth: 8,
        itemHeight: 8,
        top: 0,
      },
    };
  }, [klineData, predictions]);

  if (!visible) return null;

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "buy":
        return "#00ff00";
      case "sell":
        return "#ff0000";
      default:
        return "#858585";
    }
  };

  const getSignalText = (signal: string) => {
    switch (signal) {
      case "buy":
        return t("aiAgent.buy");
      case "sell":
        return t("aiAgent.sell");
      default:
        return t("aiAgent.hold");
    }
  };

  return (
    <div className="prediction-panel">
      <div className="prediction-header">
        <span>{t("portfolio.pricePrediction")}</span>
        <button className="close-btn" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="prediction-controls">
        <div className="control-group">
          <label>{t("portfolio.predictionMethod")}:</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PredictionMethod)}
          >
            <option value="linear">{t("portfolio.linearRegression")}</option>
            <option value="ma">{t("portfolio.movingAverage")}</option>
            <option value="technical">{t("portfolio.technicalIndicator")}</option>
            <option value="polynomial">{t("portfolio.polynomialRegression")}</option>
          </select>
        </div>
        <div className="control-group">
          <label>{t("portfolio.predictionDays")}:</label>
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
            <option value={5}>5{t("portfolio.days")}</option>
            <option value={10}>10{t("portfolio.days")}</option>
            <option value={30}>30{t("portfolio.days")}</option>
          </select>
        </div>
        <button className="generate-btn" onClick={generatePrediction} disabled={loading}>
          {loading ? t("portfolio.calculating") : t("portfolio.generatePrediction")}
        </button>
      </div>
      <div className="prediction-chart">
        {loading ? (
          <div className="loading-message">{t("portfolio.calculatingPrediction")}</div>
        ) : predictions.length > 0 ? (
          <ReactECharts
            option={chartOption}
            style={{ height: "100%", width: "100%" }}
            opts={{ renderer: "canvas" }}
          />
        ) : (
          <div className="empty-message">{t("portfolio.noPredictionData")}</div>
        )}
      </div>
      <div className="prediction-results">
        <div className="results-header">{t("portfolio.predictionResults")}</div>
        <table>
          <thead>
            <tr>
              <th>{t("portfolio.date")}</th>
              <th>{t("portfolio.predictedPrice")}</th>
              <th>{t("portfolio.confidence")}</th>
              <th>{t("portfolio.signal")}</th>
              <th>{t("portfolio.priceRange")}</th>
            </tr>
          </thead>
          <tbody>
            {predictions.map((pred, idx) => (
              <tr key={idx}>
                <td>{pred.date}</td>
                <td style={{ color: pred.predicted_price >= klineData[klineData.length - 1]?.close ? "#ff0000" : "#00ff00" }}>
                  {pred.predicted_price.toFixed(2)}
                </td>
                <td>
                  <div className="confidence-bar">
                    <div
                      className="confidence-fill"
                      style={{
                        width: `${pred.confidence}%`,
                        backgroundColor: pred.confidence > 70 ? "#00ff00" : pred.confidence > 50 ? "#ff9800" : "#ff0000",
                      }}
                    />
                    <span>{pred.confidence.toFixed(0)}%</span>
                  </div>
                </td>
                <td style={{ color: getSignalColor(pred.signal) }}>
                  {getSignalText(pred.signal)}
                </td>
                <td>
                  {pred.lower_bound.toFixed(2)} - {pred.upper_bound.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="prediction-warning">
        ! {t("portfolio.riskWarning")}
      </div>
    </div>
  );
};

export default PredictionPanel;
