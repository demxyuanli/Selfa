import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SimilarityResult {
  match_date: string;
  similarity_score: number;
  future_data: StockData[];
}

interface SimilarityPredictionProps {
  symbol: string;
  currentData?: StockData[];
}

const SimilarityPrediction: React.FC<SimilarityPredictionProps> = ({ symbol }) => {
  const { t } = useTranslation();
  const [results, setResults] = useState<SimilarityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [lookback, setLookback] = useState(60);
  const [horizon, setHorizon] = useState(20);

  useEffect(() => {
    fetchPrediction();
  }, [symbol]); // Only fetch on symbol change initially, or manual refresh

  const fetchPrediction = async () => {
    setLoading(true);
    try {
      const res: SimilarityResult[] = await invoke("get_similarity_prediction", {
        symbol,
        period: "daily",
        lookbackWindow: lookback,
        forecastHorizon: horizon,
      });
      setResults(res);
    } catch (err) {
      console.error("Error fetching similarity prediction:", err);
    } finally {
      setLoading(false);
    }
  };

  const chartData = {
    labels: [...Array(horizon).keys()].map(i => `+${i + 1}${t("time.daysShort")}`),
    datasets: results.map((res, index) => ({
      label: `${t("similarity.match")}: ${res.match_date} (${(res.similarity_score * 100).toFixed(1)}%)`,
      data: res.future_data.map(d => {
        // Normalize to start from 0% change relative to match start
        if (res.future_data.length === 0) return 0;
        const startPrice = res.future_data[0].open; 
        return ((d.close - startPrice) / startPrice) * 100;
      }),
      borderColor: index === 0 ? "rgb(255, 99, 132)" : `rgba(54, 162, 235, ${1 - index * 0.2})`,
      borderWidth: index === 0 ? 3 : 1,
      pointRadius: 0,
      tension: 0.4,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 20,
        bottom: 10,
        left: 10,
        right: 10,
      },
    },
    plugins: {
      title: {
        display: true,
        text: t("similarity.title"),
        padding: {
          top: 10,
          bottom: 20,
        },
      },
      legend: {
        position: "top" as const,
        labels: {
          padding: 10,
          boxWidth: 12,
          font: {
            size: 10,
          },
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ${Number(context.raw).toFixed(2)}%`,
        },
      },
    },
    scales: {
      y: {
        title: {
          display: true,
          text: t("similarity.percentChange"),
        },
      },
    },
  };

  return (
    <div className="similarity-prediction" style={{ height: "100%", padding: "10px", display: "flex", flexDirection: "column" }}>
      <div className="controls" style={{ marginBottom: "10px", display: "flex", gap: "15px", alignItems: "center", background: "#333", padding: "10px", borderRadius: "8px" }}>
        <div className="param-group" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <label style={{ color: "#ccc", fontSize: "12px" }}>{t("similarity.lookback")}:</label>
          <input 
            type="number" 
            value={lookback} 
            onChange={(e) => setLookback(Number(e.target.value))} 
            style={{ width: "60px", background: "#444", border: "1px solid #555", color: "white", padding: "2px 5px" }} 
          />
        </div>
        <div className="param-group" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <label style={{ color: "#ccc", fontSize: "12px" }}>{t("similarity.horizon")}:</label>
          <input 
            type="number" 
            value={horizon} 
            onChange={(e) => setHorizon(Number(e.target.value))} 
            style={{ width: "60px", background: "#444", border: "1px solid #555", color: "white", padding: "2px 5px" }} 
          />
        </div>
        <button 
          onClick={fetchPrediction} 
          disabled={loading}
          style={{ 
            padding: "4px 12px", 
            background: "#2196f3", 
            border: "none", 
            borderRadius: "4px", 
            color: "white", 
            cursor: "pointer",
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? t("app.loading") : t("similarity.refresh")}
        </button>
      </div>
      
      <div className="chart-wrapper" style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {results.length > 0 ? (
          <Line data={chartData} options={options} />
        ) : (
          <div className="no-data">{t("similarity.noData")}</div>
        )}
      </div>

      <div className="explanation" style={{ marginTop: "10px", fontSize: "12px", color: "#888" }}>
        {t("similarity.explanation")}
      </div>
    </div>
  );
};

export default SimilarityPrediction;
