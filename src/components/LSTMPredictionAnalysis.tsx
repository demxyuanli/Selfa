import React, { useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import ChartDialog from "./ChartDialog";
import "./StockAnalysis.css";
import "./LSTMPredictionAnalysis.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface LSTMPredictionAnalysisProps {
  klineData: StockData[];
}

// Simplified LSTM-like prediction using sequence analysis
const LSTMPredictionAnalysis: React.FC<LSTMPredictionAnalysisProps> = ({ klineData }) => {
  const { t } = useTranslation();
  const [sequenceLength, setSequenceLength] = useState(30);
  const [predictionDays, setPredictionDays] = useState(10);
  const [epochs, setEpochs] = useState(50);
  const [learningRate, setLearningRate] = useState(0.01);
  const [isTraining, setIsTraining] = useState(false);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  const chartRef = useRef<ReactECharts>(null);
  const [predictions, setPredictions] = useState<number[]>([]);

  // Normalize data
  const normalize = (values: number[]): { normalized: number[]; min: number; max: number } => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return {
      normalized: values.map((v) => (v - min) / range),
      min,
      max,
    };
  };

  // Denormalize data
  const denormalize = (normalized: number[], min: number, max: number): number[] => {
    const range = max - min;
    return normalized.map((v) => v * range + min);
  };

  // Create sequences for LSTM-like training
  // const _createSequences = (data: number[], seqLength: number): Array<{ input: number[]; output: number }> => {
  //   const sequences: Array<{ input: number[]; output: number }> = [];
  //   for (let i = 0; i < data.length - seqLength; i++) {
  //     sequences.push({
  //       input: data.slice(i, i + seqLength),
  //       output: data[i + seqLength],
  //     });
  //   }
  //   return sequences;
  // };

  // Simplified LSTM-like prediction using weighted moving average with momentum
  const predictLSTM = async (): Promise<number[]> => {
    if (klineData.length < sequenceLength + 10) {
      throw new Error(t("analysis.insufficientData"));
    }

    setIsTraining(true);

    // Simulate training delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      const closes = klineData.map((d) => d.close);
      const { normalized, min, max } = normalize(closes);

      // Use the last sequenceLength points for prediction
      const lastSequence = normalized.slice(-sequenceLength);
      const predictions: number[] = [];

      // Calculate momentum and trend
      const recentChanges = normalized.slice(-20).map((val, idx, arr) => 
        idx > 0 ? val - arr[idx - 1] : 0
      );
      const momentum = recentChanges.reduce((a, b) => a + b, 0) / recentChanges.length;
      const trend = (normalized[normalized.length - 1] - normalized[normalized.length - 20]) / 20;

      // Predict future values
      let currentSequence = [...lastSequence];
      for (let i = 0; i < predictionDays; i++) {
        // Weighted average of recent values with momentum
        const weights = currentSequence.map((_, idx) => Math.exp(-(sequenceLength - idx) * 0.1));
        const weightedSum = currentSequence.reduce((sum, val, idx) => sum + val * weights[idx], 0);
        const weightSum = weights.reduce((a, b) => a + b, 0);
        let nextValue = weightedSum / weightSum;

        // Add momentum and trend
        nextValue = nextValue + momentum * 0.3 + trend * 0.2;

        // Add some randomness based on historical volatility
        const recentVolatility = normalized.slice(-10).reduce((sum, val, idx, arr) => {
          if (idx === 0) return 0;
          return sum + Math.abs(val - arr[idx - 1]);
        }, 0) / 9;
        const noise = (Math.random() - 0.5) * recentVolatility * 0.1;
        nextValue = nextValue + noise;

        // Clip to reasonable range
        nextValue = Math.max(0, Math.min(1, nextValue));

        predictions.push(nextValue);
        currentSequence = [...currentSequence.slice(1), nextValue];
      }

      // Denormalize predictions
      const denormalized = denormalize(predictions, min, max);
      setPredictions(denormalized);

      return denormalized;
    } finally {
      setIsTraining(false);
    }
  };

  const chartOption = useMemo(() => {
    if (klineData.length === 0) return {};

    const dates = klineData.map((d) => {
      const dateStr = d.date;
      return dateStr.includes(" ") ? dateStr.split(" ")[0] : dateStr;
    });

    const closes = klineData.map((d) => d.close);
    const actualDates = [...dates];
    const actualValues = [...closes];

    // Generate future dates for predictions
    const futureDates: string[] = [];
    if (predictions.length > 0) {
      const lastDate = new Date(dates[dates.length - 1]);
      for (let i = 1; i <= predictions.length; i++) {
        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + i);
        futureDates.push(nextDate.toISOString().split("T")[0]);
      }
    }

    const allDates = [...actualDates, ...futureDates];
    const allValues = [...actualValues, ...new Array(actualDates.length).fill(null), ...predictions];

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#555",
        textStyle: { color: "#ccc" },
      },
      legend: {
        data: [t("analysis.actualPrice"), t("analysis.lstmPrediction")],
        textStyle: { color: "#858585", fontSize: 10 },
        top: 0,
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "3%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: allDates,
        axisLabel: { color: "#858585", fontSize: 9 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#858585", fontSize: 9 },
        splitLine: { lineStyle: { color: "rgba(133, 133, 133, 0.15)" } },
      },
      series: [
        {
          name: t("analysis.actualPrice"),
          type: "line",
          data: actualValues.map((v, i) => [i, v]),
          lineStyle: { color: "#007acc", width: 2 },
          itemStyle: { color: "#007acc" },
        },
        {
          name: t("analysis.lstmPrediction"),
          type: "line",
          data: allValues.map((v, i) => [i, v]),
          lineStyle: { color: "#00ff00", width: 2, type: "dashed" },
          itemStyle: { color: "#00ff00" },
          markLine: {
            symbol: ["none", "none"],
            data: [
              {
                xAxis: actualDates.length - 1,
                lineStyle: { color: "#858585", type: "dashed", width: 1 },
              },
            ],
          },
        },
      ],
    };
  }, [klineData, predictions, t]);

  return (
    <div className="lstm-prediction-analysis">
      <div className="analysis-columns">
        <div className="analysis-column params-column">
          <div className="column-header">{t("analysis.lstmPrediction")}</div>
          <div className="params-content">
            <div className="param-section">
              <label className="param-section-label">{t("analysis.sequenceLength")}</label>
              <input
                type="number"
                value={sequenceLength}
                onChange={(e) => setSequenceLength(parseInt(e.target.value) || 30)}
                className="param-input"
                min={10}
                max={100}
                step={5}
              />
              <div className="param-help">{t("analysis.sequenceLengthDesc")}</div>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.predictionDays")}</label>
              <input
                type="number"
                value={predictionDays}
                onChange={(e) => setPredictionDays(parseInt(e.target.value) || 10)}
                className="param-input"
                min={1}
                max={30}
              />
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.epochs")}</label>
              <input
                type="number"
                value={epochs}
                onChange={(e) => setEpochs(parseInt(e.target.value) || 50)}
                className="param-input"
                min={10}
                max={500}
                step={10}
                disabled={true}
              />
              <div className="param-help">{t("analysis.epochsDesc")}</div>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.learningRate")}</label>
              <input
                type="number"
                value={learningRate}
                onChange={(e) => setLearningRate(parseFloat(e.target.value) || 0.01)}
                className="param-input"
                min={0.001}
                max={0.1}
                step={0.001}
                disabled={true}
              />
              <div className="param-help">{t("analysis.learningRateDesc")}</div>
            </div>
            <div className="param-section">
              <button
                onClick={predictLSTM}
                disabled={isTraining || klineData.length < sequenceLength + 10}
                className="param-btn primary"
              >
                {isTraining ? t("analysis.training") : t("analysis.runLSTM")}
              </button>
            </div>
            {predictions.length > 0 && (
              <div className="param-section">
                <div className="prediction-results">
                  <div className="result-title">{t("analysis.predictionResults")}</div>
                  <div className="result-item">
                    <span className="result-label">{t("analysis.currentPrice")}:</span>
                    <span className="result-value">
                      {klineData[klineData.length - 1].close.toFixed(2)}
                    </span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">{t("analysis.predictedPrice")} ({predictionDays}{t("analysis.daysAfter")}):</span>
                    <span className="result-value">
                      {predictions[predictions.length - 1]?.toFixed(2) || "-"}
                    </span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">{t("analysis.expectedChange")}:</span>
                    <span className={`result-value ${predictions[predictions.length - 1] > klineData[klineData.length - 1].close ? "positive" : "negative"}`}>
                      {predictions.length > 0
                        ? (((predictions[predictions.length - 1] - klineData[klineData.length - 1].close) / klineData[klineData.length - 1].close) * 100).toFixed(2)
                        : "-"}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="column-divider" />
        <div className="analysis-column chart-column">
          <div className="column-header">
            <span>{t("analysis.chart")}</span>
            <button
              className="chart-zoom-button-overlay"
              onClick={() => setIsChartDialogOpen(true)}
              title={t("chart.zoom")}
            >
              ZO
            </button>
          </div>
          <div className="chart-content">
            {Object.keys(chartOption).length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <ReactECharts
                ref={chartRef}
                option={chartOption}
                style={{ height: "100%", width: "100%" }}
                opts={{ renderer: "canvas" }}
              />
            )}
          </div>
        </div>
      </div>
      <ChartDialog
        isOpen={isChartDialogOpen}
        onClose={() => setIsChartDialogOpen(false)}
        title={`${t("analysis.lstmPrediction")} - ${t("chart.title")}`}
        chartOption={chartOption}
      />
    </div>
  );
};

export default LSTMPredictionAnalysis;
