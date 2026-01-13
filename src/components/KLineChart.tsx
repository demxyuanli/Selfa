import React, { useMemo } from "react";
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
} from "chart.js";
import { Line } from "react-chartjs-2";
import "./KLineChart.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
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

interface KLineChartProps {
  data: StockData[];
}

const KLineChart: React.FC<KLineChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        labels: [],
        datasets: [],
      };
    }

    const labels = data.map((d) => {
      const dateStr = d.date;
      if (dateStr.includes(" ")) {
        return dateStr.split(" ")[0];
      }
      return dateStr;
    });
    const closes = data.map((d) => d.close);
    const highs = data.map((d) => d.high);
    const lows = data.map((d) => d.low);

    return {
      labels,
      datasets: [
        {
          label: "Close",
          data: closes,
          borderColor: "rgb(0, 122, 204)",
          backgroundColor: "rgba(0, 122, 204, 0.1)",
          fill: true,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: "High",
          data: highs,
          borderColor: "rgb(78, 201, 176)",
          backgroundColor: "rgba(78, 201, 176, 0.1)",
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: "Low",
          data: lows,
          borderColor: "rgb(244, 135, 113)",
          backgroundColor: "rgba(244, 135, 113, 0.1)",
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
      ],
    };
  }, [data]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          color: "rgb(204, 204, 204)",
        },
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
          color: "rgba(62, 62, 66, 0.5)",
        },
        ticks: {
          color: "rgb(133, 133, 133)",
        },
      },
      y: {
        display: true,
        grid: {
          color: "rgba(62, 62, 66, 0.5)",
        },
        ticks: {
          color: "rgb(133, 133, 133)",
        },
      },
    },
    interaction: {
      mode: "nearest" as const,
      axis: "x" as const,
      intersect: false,
    },
  };

  if (!data || data.length === 0) {
    return (
      <div className="kline-chart">
        <div className="chart-empty">No K-line data available</div>
      </div>
    );
  }

  return (
    <div className="kline-chart">
      <Line data={chartData} options={options} />
    </div>
  );
};

export default KLineChart;
