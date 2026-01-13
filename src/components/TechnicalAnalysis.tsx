import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
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
import "./TechnicalAnalysis.css";

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

interface TechnicalIndicators {
  sma_20: number[];
  sma_50: number[];
  ema_12: number[];
  ema_26: number[];
  rsi: number[];
  macd: number[];
  macd_signal: number[];
  macd_histogram: number[];
}

interface TechnicalAnalysisProps {
  data: StockData[];
}

const TechnicalAnalysis: React.FC<TechnicalAnalysisProps> = ({ data }) => {
  const { t } = useTranslation();
  const [indicators, setIndicators] = useState<TechnicalIndicators | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndicator, setSelectedIndicator] = useState<string>("sma");

  useEffect(() => {
    const fetchIndicators = async () => {
      if (data.length === 0) return;

      setLoading(true);
      try {
        const result: TechnicalIndicators = await invoke(
          "calculate_technical_indicators",
          { data }
        );
        setIndicators(result);
      } catch (err) {
        console.error("Error calculating indicators:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchIndicators();
  }, [data]);

  const chartData = useMemo(() => {
    if (!indicators) return null;

    const labels = data.map((d) => d.date);
    const closes = data.map((d) => d.close);

    const datasets: any[] = [
      {
        label: "Close Price",
        data: closes,
        borderColor: "rgb(44, 62, 80)",
        backgroundColor: "rgba(44, 62, 80, 0.1)",
        fill: false,
      },
    ];

    switch (selectedIndicator) {
      case "sma":
        datasets.push(
          {
            label: t("analysis.sma20"),
            data: indicators.sma_20,
            borderColor: "rgb(33, 150, 243)",
            fill: false,
          },
          {
            label: t("analysis.sma50"),
            data: indicators.sma_50,
            borderColor: "rgb(156, 39, 176)",
            fill: false,
          }
        );
        break;
      case "ema":
        datasets.push(
          {
            label: t("analysis.ema12"),
            data: indicators.ema_12,
            borderColor: "rgb(33, 150, 243)",
            fill: false,
          },
          {
            label: t("analysis.ema26"),
            data: indicators.ema_26,
            borderColor: "rgb(156, 39, 176)",
            fill: false,
          }
        );
        break;
      case "rsi":
        datasets.push({
          label: t("analysis.rsi"),
          data: indicators.rsi,
          borderColor: "rgb(255, 152, 0)",
          fill: false,
          yAxisID: "y1",
        });
        break;
      case "macd":
        datasets.push(
          {
            label: t("analysis.macd"),
            data: indicators.macd,
            borderColor: "rgb(33, 150, 243)",
            fill: false,
          },
          {
            label: t("analysis.macdSignal"),
            data: indicators.macd_signal,
            borderColor: "rgb(244, 67, 54)",
            fill: false,
          },
          {
            label: t("analysis.macdHistogram"),
            data: indicators.macd_histogram,
            borderColor: "rgb(76, 175, 80)",
            type: "bar",
            backgroundColor: "rgba(76, 175, 80, 0.2)",
          }
        );
        break;
    }

    return { labels, datasets };
  }, [indicators, data, selectedIndicator, t]);

  if (loading) {
    return <div className="loading-message">{t("app.loading")}</div>;
  }

  if (!indicators || !chartData) {
    return null;
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: true,
        text: t("analysis.title"),
      },
    },
    scales: {
      y: {
        type: "linear" as const,
        display: true,
        position: "left" as const,
      },
      ...(selectedIndicator === "rsi" && {
        y1: {
          type: "linear" as const,
          display: true,
          position: "right" as const,
          grid: {
            drawOnChartArea: false,
          },
          min: 0,
          max: 100,
        },
      }),
    },
  };

  return (
    <div className="technical-analysis">
      <div className="indicator-selector">
        <button
          className={selectedIndicator === "sma" ? "active" : ""}
          onClick={() => setSelectedIndicator("sma")}
        >
          SMA
        </button>
        <button
          className={selectedIndicator === "ema" ? "active" : ""}
          onClick={() => setSelectedIndicator("ema")}
        >
          EMA
        </button>
        <button
          className={selectedIndicator === "rsi" ? "active" : ""}
          onClick={() => setSelectedIndicator("rsi")}
        >
          RSI
        </button>
        <button
          className={selectedIndicator === "macd" ? "active" : ""}
          onClick={() => setSelectedIndicator("macd")}
        >
          MACD
        </button>
      </div>
      <div className="chart-container">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};

export default TechnicalAnalysis;

