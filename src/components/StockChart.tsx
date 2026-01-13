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
}

const StockChart: React.FC<StockChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const labels = data.map((d) => d.date);
    const closes = data.map((d) => d.close);
    const highs = data.map((d) => d.high);
    const lows = data.map((d) => d.low);

    return {
      labels,
      datasets: [
        {
          label: "Close",
          data: closes,
          borderColor: "rgb(44, 62, 80)",
          backgroundColor: "rgba(44, 62, 80, 0.1)",
          fill: true,
          tension: 0.4,
        },
        {
          label: "High",
          data: highs,
          borderColor: "rgb(76, 175, 80)",
          backgroundColor: "rgba(76, 175, 80, 0.1)",
          fill: false,
          tension: 0.4,
        },
        {
          label: "Low",
          data: lows,
          borderColor: "rgb(244, 67, 54)",
          backgroundColor: "rgba(244, 67, 54, 0.1)",
          fill: false,
          tension: 0.4,
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
      },
      title: {
        display: true,
        text: "Stock Price Chart",
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

