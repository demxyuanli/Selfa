import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import "./StockChart.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockChartProps {
  data: StockData[];
  period?: string;
}

const StockChart: React.FC<StockChartProps> = ({ data, period }) => {
  const { t } = useTranslation();
  const chartData = useMemo(() => {
    // Check if intraday (1d)
    if (period === "1d") {
        // Generate standard trading minutes
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
        
        // Map data to times
        const timeToDataMap = new Map<string, StockData>();
        data.forEach(d => {
            // Assume date format "YYYY-MM-DD HH:mm:ss" or just time
            const timePart = d.date.includes(" ") ? d.date.split(" ")[1].substring(0, 5) : d.date.substring(0, 5);
            timeToDataMap.set(timePart, d);
        });

        const alignedCloses = times.map(t => timeToDataMap.get(t)?.close ?? null);
        const alignedHighs = times.map(t => timeToDataMap.get(t)?.high ?? null);
        const alignedLows = times.map(t => timeToDataMap.get(t)?.low ?? null);

        return {
            labels: times,
            datasets: [
                {
                    label: t("analysis.close"),
                    data: alignedCloses,
                    borderColor: "rgb(44, 62, 80)",
                    backgroundColor: "rgba(44, 62, 80, 0.1)",
                    fill: true,
                    tension: 0.4,
                    spanGaps: true, // Connect points over nulls
                },
                {
                    label: t("analysis.high"),
                    data: alignedHighs,
                    borderColor: "rgb(76, 175, 80)",
                    backgroundColor: "rgba(0, 255, 0, 0.1)",
                    fill: false,
                    tension: 0.4,
                    spanGaps: true,
                    hidden: true, // Usually hide high/low in intraday line chart to avoid clutter
                },
                {
                    label: t("analysis.low"),
                    data: alignedLows,
                    borderColor: "rgb(244, 67, 54)",
                    backgroundColor: "rgba(255, 0, 0, 0.1)",
                    fill: false,
                    tension: 0.4,
                    spanGaps: true,
                    hidden: true,
                },
            ],
        };
    }

    const labels = data.map((d) => d.date);
    const closes = data.map((d) => d.close);
    const highs = data.map((d) => d.high);
    const lows = data.map((d) => d.low);

    return {
      labels,
      datasets: [
        {
          label: t("analysis.close"),
          data: closes,
          borderColor: "rgb(44, 62, 80)",
          backgroundColor: "rgba(44, 62, 80, 0.1)",
          fill: true,
          tension: 0.4,
        },
        {
          label: t("analysis.high"),
          data: highs,
          borderColor: "rgb(76, 175, 80)",
          backgroundColor: "rgba(0, 255, 0, 0.1)",
          fill: false,
          tension: 0.4,
        },
        {
          label: t("analysis.low"),
          data: lows,
          borderColor: "rgb(244, 67, 54)",
          backgroundColor: "rgba(255, 0, 0, 0.1)",
          fill: false,
          tension: 0.4,
        },
      ],
    };
  }, [data, t, period]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: true,
        text: t("analysis.stockPriceChart"),
      },
      tooltip: {
        mode: "index" as const,
        intersect: false,
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false,
        },
      },
      y: {
        display: true,
        grid: {
          color: "rgba(0, 0, 0, 0.05)",
        },
      },
    },
    interaction: {
      mode: "nearest" as const,
      axis: "x" as const,
      intersect: false,
    },
  };

  return (
    <div className="stock-chart">
      <div className="chart-container">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};

export default StockChart;

