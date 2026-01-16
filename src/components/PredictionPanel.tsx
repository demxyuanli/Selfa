import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactECharts from "echarts-for-react";
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
          name: "K线",
          type: "candlestick",
          data: candlestickData,
          itemStyle: {
            color: "#f44336",
            color0: "#4caf50",
            borderColor: "#f44336",
            borderColor0: "#4caf50",
          },
        },
        {
          name: "预测价格",
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
          name: "上界",
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
          name: "下界",
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
        data: ["K线", "预测价格", "上界", "下界"],
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
        return "#4caf50";
      case "sell":
        return "#f44336";
      default:
        return "#858585";
    }
  };

  const getSignalText = (signal: string) => {
    switch (signal) {
      case "buy":
        return "买入";
      case "sell":
        return "卖出";
      default:
        return "持有";
    }
  };

  return (
    <div className="prediction-panel">
      <div className="prediction-header">
        <span>价格预测</span>
        <button className="close-btn" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="prediction-controls">
        <div className="control-group">
          <label>预测方法:</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PredictionMethod)}
          >
            <option value="linear">线性回归</option>
            <option value="ma">移动平均外推</option>
            <option value="technical">技术指标</option>
            <option value="polynomial">多项式回归</option>
          </select>
        </div>
        <div className="control-group">
          <label>预测天数:</label>
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
            <option value={5}>5天</option>
            <option value={10}>10天</option>
            <option value={30}>30天</option>
          </select>
        </div>
        <button className="generate-btn" onClick={generatePrediction} disabled={loading}>
          {loading ? "计算中..." : "生成预测"}
        </button>
      </div>
      <div className="prediction-chart">
        {loading ? (
          <div className="loading-message">计算预测中...</div>
        ) : predictions.length > 0 ? (
          <ReactECharts
            option={chartOption}
            style={{ height: "100%", width: "100%" }}
            opts={{ renderer: "canvas" }}
          />
        ) : (
          <div className="empty-message">暂无预测数据</div>
        )}
      </div>
      <div className="prediction-results">
        <div className="results-header">预测结果</div>
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>预测价格</th>
              <th>置信度</th>
              <th>信号</th>
              <th>价格区间</th>
            </tr>
          </thead>
          <tbody>
            {predictions.map((pred, idx) => (
              <tr key={idx}>
                <td>{pred.date}</td>
                <td style={{ color: pred.predicted_price >= klineData[klineData.length - 1]?.close ? "#f44336" : "#4caf50" }}>
                  {pred.predicted_price.toFixed(2)}
                </td>
                <td>
                  <div className="confidence-bar">
                    <div
                      className="confidence-fill"
                      style={{
                        width: `${pred.confidence}%`,
                        backgroundColor: pred.confidence > 70 ? "#4caf50" : pred.confidence > 50 ? "#ff9800" : "#f44336",
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
        ! 风险提示：预测结果仅供参考，不构成投资建议。投资有风险，入市需谨慎。
      </div>
    </div>
  );
};

export default PredictionPanel;
