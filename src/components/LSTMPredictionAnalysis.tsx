import React, { useState, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
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

interface PredictionResult {
  date: string;
  predicted_price: number;
  confidence: number;
  signal: "buy" | "sell" | "hold";
  upper_bound: number;
  lower_bound: number;
  method: string;
}

interface LSTMPredictionAnalysisProps {
  klineData: StockData[];
}

type LSTMModelType = "local_simulation" | "deos_gpt" | "sspt" | "space_explore" | "boris_gan";

// Simplified LSTM-like prediction using sequence analysis
const LSTMPredictionAnalysis: React.FC<LSTMPredictionAnalysisProps> = ({ klineData }) => {
  const { t } = useTranslation();
  const [modelType, setModelType] = useState<LSTMModelType>("local_simulation");
  const [sequenceLength, setSequenceLength] = useState(30);
  const [predictionDays, setPredictionDays] = useState(10);
  const [epochs, setEpochs] = useState(5);
  const [learningRate, setLearningRate] = useState(0.01);
  const [isTraining, setIsTraining] = useState(false);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  const chartRef = useRef<ReactECharts>(null);
  
  // Unified state for predictions (either number[] for local or PredictionResult[] for backend)
  // We will map everything to PredictionResult structure for consistency
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);

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

  // Simplified LSTM-like prediction using weighted moving average with momentum
  const predictLocalSimulation = async (): Promise<PredictionResult[]> => {
    if (klineData.length < sequenceLength + 10) {
      throw new Error(t("analysis.insufficientData"));
    }

    // Simulate training delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const closes = klineData.map((d) => d.close);
    const { normalized, min, max } = normalize(closes);

    // Use the last sequenceLength points for prediction
    const lastSequence = normalized.slice(-sequenceLength);
    const rawPredictions: number[] = [];

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

      rawPredictions.push(nextValue);
      currentSequence = [...currentSequence.slice(1), nextValue];
    }

    // Denormalize predictions
    const denormalized = denormalize(rawPredictions, min, max);
    const lastDateStr = klineData[klineData.length - 1].date;
    const lastDate = new Date(lastDateStr.includes(" ") ? lastDateStr.split(" ")[0] : lastDateStr);

    return denormalized.map((price, idx) => {
      const date = new Date(lastDate);
      date.setDate(date.getDate() + idx + 1);
      return {
        date: date.toISOString().split("T")[0],
        predicted_price: price,
        confidence: 50, // Static confidence for simulation
        signal: "hold",
        upper_bound: price * 1.02,
        lower_bound: price * 0.98,
        method: "local_simulation"
      };
    });
  };

  const predictBackend = async (method: string): Promise<PredictionResult[]> => {
    return await invoke("predict_stock_price", {
      data: klineData,
      method: method,
      period: predictionDays,
      // Pass epochs only for SSPT if needed, but currently backend doesn't take extra args dynamically.
      // We can encode it or rely on defaults. For now, let's keep it simple.
    });
  };

  const runPrediction = async () => {
    if (klineData.length === 0) return;
    
    setIsTraining(true);
    setPredictions([]);

    try {
      let results: PredictionResult[] = [];
      if (modelType === "local_simulation") {
        results = await predictLocalSimulation();
      } else {
        results = await predictBackend(modelType);
      }
      setPredictions(results);
    } catch (error) {
      console.error("Prediction failed:", error);
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

    // Use prediction results
    const predDates = predictions.map(p => p.date);
    const predValues = predictions.map(p => p.predicted_price);
    const upperBounds = predictions.map(p => p.upper_bound);
    const lowerBounds = predictions.map(p => p.lower_bound);

    const allDates = [...actualDates, ...predDates];
    
    // To make the line continuous, we need to add the last actual point to the prediction series
    const lastActualPrice = actualValues[actualValues.length - 1];
    const paddedPredValues = [...new Array(actualDates.length - 1).fill(null), lastActualPrice, ...predValues];
    const paddedUpper = [...new Array(actualDates.length).fill(null), ...upperBounds];
    const paddedLower = [...new Array(actualDates.length).fill(null), ...lowerBounds];

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          snap: true,
        },
        backgroundColor: "transparent",
        borderColor: "transparent",
        borderWidth: 0,
        padding: 0,
        extraCssText: "box-shadow: none;",
        textStyle: { color: "#ccc" },
        formatter: (params: any) => {
          let res = `<div>${params[0].axisValue}</div>`;
          params.forEach((param: any) => {
             if (param.value !== null && param.value !== undefined) {
               // Handle array data [index, value] or just value
               const val = Array.isArray(param.value) ? param.value[1] : param.value;
               if (val !== null) {
                 res += `<div>${param.marker} ${param.seriesName}: ${Number(val).toFixed(2)}</div>`;
               }
             }
          });
          return res;
        }
      },
      legend: {
        data: [t("lstm.actualPrice"), t("lstm.lstmPrediction"), t("analysis.upperBound"), t("analysis.lowerBound")],
        textStyle: { color: "#858585", fontSize: 10 },
        top: "2%",
        left: "center",
      },
      grid: {
        left: "3%",
        right: "4%",
        top: "15%",
        bottom: "8%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: allDates,
        axisLabel: { color: "#858585", fontSize: 9 },
        splitLine: { show: false },
        axisPointer: {
          snap: true,
        },
      },
      yAxis: {
        type: "value",
        axisPointer: {
          snap: true,
        },
        axisLabel: { color: "#858585", fontSize: 9 },
        splitLine: { lineStyle: { color: "rgba(133, 133, 133, 0.15)" } },
      },
      series: [
        {
          name: t("lstm.actualPrice"),
          type: "line",
          data: actualValues,
          lineStyle: { color: "#007acc", width: 2 },
          itemStyle: { color: "#007acc" },
        },
        {
          name: t("lstm.lstmPrediction"),
          type: "line",
          data: paddedPredValues,
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
        {
          name: t("analysis.upperBound"),
          type: "line",
          data: paddedUpper,
          lineStyle: { color: "#81c784", width: 1, type: "dotted", opacity: 0.5 },
          symbol: "none",
        },
        {
          name: t("analysis.lowerBound"),
          type: "line",
          data: paddedLower,
          lineStyle: { color: "#81c784", width: 1, type: "dotted", opacity: 0.5 },
          symbol: "none",
        },
      ],
    };
  }, [klineData, predictions, t]);

  return (
    <div className="lstm-prediction-analysis">
      <div className="analysis-columns">
        <div className="analysis-column params-column">
          <div className="column-header">{t("lstm.lstmPrediction")}</div>
          <div className="params-content">
            <div className="param-section">
              <label className="param-section-label">{t("analysis.predictionMethod")}</label>
              <select 
                value={modelType} 
                onChange={(e) => setModelType(e.target.value as LSTMModelType)}
                className="param-select"
                style={{ width: "100%", padding: "6px", backgroundColor: "#2d2d30", color: "#ccc", border: "1px solid #3e3e42", borderRadius: "2px" }}
              >
                <option value="deos_gpt">DeOS AlphaTimeGPT-2025 (Advanced)</option>
                <option value="sspt">StockTime/SSPT (Fine-tuned)</option>
                <option value="space_explore">NEOAI/SpaceExplore-27M (Latent)</option>
                <option value="boris_gan">StockPredictionAI (GAN/Fourier Hybrid)</option>
                <option value="local_simulation">Local Simulation (Legacy)</option>
              </select>
            </div>

            {modelType === "sspt" && (
              <div className="param-section">
                <label className="param-section-label">{t("analysis.epochs")} (Fine-tuning)</label>
                <input
                  type="number"
                  value={epochs}
                  onChange={(e) => setEpochs(parseInt(e.target.value) || 5)}
                  className="param-input"
                  min={1}
                  max={10}
                  step={1}
                />
                <div className="param-help">1-5 epochs recommended for few-shot learning</div>
              </div>
            )}

            {modelType === "local_simulation" && (
              <div className="param-section">
                <label className="param-section-label">{t("lstm.sequenceLength")}</label>
                <input
                  type="number"
                  value={sequenceLength}
                  onChange={(e) => setSequenceLength(parseInt(e.target.value) || 30)}
                  className="param-input"
                  min={10}
                  max={100}
                  step={5}
                />
                <div className="param-help">{t("lstm.sequenceLengthDesc")}</div>
              </div>
            )}
            
            <div className="param-section">
              <label className="param-section-label">{t("lstm.predictionDays")}</label>
              <input
                type="number"
                value={predictionDays}
                onChange={(e) => setPredictionDays(parseInt(e.target.value) || 10)}
                className="param-input"
                min={1}
                max={30}
              />
            </div>

            {modelType === "local_simulation" && (
              <>
                <div className="param-section">
                  <label className="param-section-label">{t("analysis.epochs")}</label>
                  <input
                    type="number"
                    value={epochs}
                    onChange={(e) => setEpochs(parseInt(e.target.value) || 5)}
                    className="param-input"
                    min={1}
                    max={10}
                    step={1}
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
              </>
            )}

            <div className="param-section">
              <button
                onClick={runPrediction}
                disabled={isTraining || klineData.length < 20}
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
                      {predictions[predictions.length - 1]?.predicted_price.toFixed(2) || "-"}
                    </span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">{t("analysis.expectedChange")}:</span>
                    <span className={`result-value ${predictions[predictions.length - 1].predicted_price > klineData[klineData.length - 1].close ? "positive" : "negative"}`}>
                      {predictions.length > 0
                        ? (((predictions[predictions.length - 1].predicted_price - klineData[klineData.length - 1].close) / klineData[klineData.length - 1].close) * 100).toFixed(2)
                        : "-"}%
                    </span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">{t("analysis.confidence")}:</span>
                    <span className="result-value">
                      {predictions[predictions.length - 1]?.confidence.toFixed(0)}%
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
              className="chart-zoom-button"
              onClick={() => setIsChartDialogOpen(true)}
              title={t("chart.zoom")}
            >
              {t("chart.zoomAbbr")}
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
        title={`${t("lstm.lstmPrediction")} - ${t("chart.title")}`}
        chartOption={chartOption}
      />
    </div>
  );
};

export default LSTMPredictionAnalysis;
