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
  vwap?: number[];
  bollinger_middle?: number[];
  bollinger_upper?: number[];
  bollinger_lower?: number[];
  bollinger_bandwidth?: number[];
  atr?: number[];
  kdj_k?: number[];
  kdj_d?: number[];
  kdj_j?: number[];
  williams_r?: number[];
  dkx?: number[];
  madkx?: number[];
  patterns?: (string | null)[];
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
        label: t("analysis.closePrice"),
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
            backgroundColor: "rgba(0, 255, 0, 0.2)",
          }
        );
        break;
      case "dkx":
        if (indicators.dkx && indicators.madkx) {
          datasets.push(
            {
              label: t("analysis.dkx"),
              data: indicators.dkx,
              borderColor: "rgb(255, 193, 7)", // Amber
              fill: false,
              borderWidth: 2,
            },
            {
              label: t("analysis.madkx"),
              data: indicators.madkx,
              borderColor: "rgb(255, 87, 34)", // Deep Orange
              fill: false,
              borderWidth: 1,
              borderDash: [5, 5],
            }
          );
        }
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
          {t("analysis.sma")}
        </button>
        <button
          className={selectedIndicator === "ema" ? "active" : ""}
          onClick={() => setSelectedIndicator("ema")}
        >
          {t("analysis.ema")}
        </button>
        <button
          className={selectedIndicator === "rsi" ? "active" : ""}
          onClick={() => setSelectedIndicator("rsi")}
        >
          {t("analysis.rsi")}
        </button>
        <button
          className={selectedIndicator === "macd" ? "active" : ""}
          onClick={() => setSelectedIndicator("macd")}
        >
          {t("analysis.macd")}
        </button>
        <button
          className={selectedIndicator === "dkx" ? "active" : ""}
          onClick={() => setSelectedIndicator("dkx")}
        >
          {t("analysis.dkx")} ({t("analysis.trend")})
        </button>
      </div>
      <div className="chart-container">
        <Line data={chartData} options={options} />
      </div>
      
      {indicators.patterns && (
        <div className="patterns-list" style={{ marginTop: '20px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#ccc' }}>{t("analysis.detectedPatterns")}</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {indicators.patterns.map((p, i) => {
              if (!p) return null;
              // Only show last 30 days
              if (i < indicators.patterns!.length - 30) return null;
              
              return (
                <div key={i} style={{ 
                  background: '#333', 
                  padding: '4px 8px', 
                  borderRadius: '4px',
                  fontSize: '12px',
                  borderLeft: '3px solid #2196f3'
                }}>
                  <span style={{ color: '#888', marginRight: '5px' }}>{data[i].date}:</span>
                  <span style={{ color: '#fff', fontWeight: 'bold' }}>{p}</span>
                </div>
              );
            }).filter(Boolean).reverse()}
          </div>
        </div>
      )}
    </div>
  );
};

export default TechnicalAnalysis;
