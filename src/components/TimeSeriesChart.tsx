import React, { useMemo, useRef, useEffect } from "react";
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
import { Line, Bar } from "react-chartjs-2";
import "./TimeSeriesChart.css";

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

interface TimeSeriesChartProps {
  data: StockData[];
  quote?: any;
}

const tradingHours = ["09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30"];

const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({ data }) => {
  const priceChartRef = useRef<any>(null);
  const volumeChartRef = useRef<any>(null);
  const [crosshairData, setCrosshairData] = React.useState<{ time: string; price: number; volume: number; index: number } | null>(null);

  const { labels, prices, volumes, avgPrice, volumeColors } = useMemo(() => {
    if (!data || data.length === 0) {
      return { labels: [], prices: [], volumes: [], avgPrice: 0, volumeColors: [] };
    }

    const lbls = data.map((d) => {
      const dateStr = d.date;
      if (dateStr.includes(" ")) {
        return dateStr.split(" ")[1] || dateStr;
      }
      return dateStr;
    });
    const prcs = data.map((d) => d.close);
    const vols = data.map((d) => d.volume);
    const avg = prcs.length > 0 ? prcs.reduce((a, b) => a + b, 0) / prcs.length : 0;

    const colors = prcs.map((price, index) => {
      if (index === 0) {
        return "rgba(133, 133, 133, 0.6)";
      }
      const prevPrice = prcs[index - 1];
      return price >= prevPrice ? "rgba(244, 67, 54, 0.8)" : "rgba(76, 175, 80, 0.8)";
    });

    return { labels: lbls, prices: prcs, volumes: vols, avgPrice: avg, volumeColors: colors };
  }, [data]);

  const priceChartData = useMemo(() => {
    if (labels.length === 0) {
      return {
        labels: [],
        datasets: [],
      };
    }

    return {
      labels,
      datasets: [
        {
          label: "Price",
          data: prices,
          borderColor: "rgb(0, 122, 204)",
          backgroundColor: "rgba(0, 122, 204, 0.1)",
          borderWidth: 1,
          fill: true,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 4,
          yAxisID: "y",
        },
        {
          label: "Avg Price",
          data: prices.map(() => avgPrice),
          borderColor: "rgb(133, 133, 133)",
          borderDash: [5, 5],
          borderWidth: 1,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 0,
          yAxisID: "y",
        },
      ],
    };
  }, [labels, prices, avgPrice]);

  const volumeChartData = useMemo(() => {
    if (labels.length === 0) {
      return {
        labels: [],
        datasets: [],
      };
    }

    return {
      labels,
      datasets: [
        {
          label: "Volume",
          data: volumes,
          backgroundColor: volumeColors,
          yAxisID: "y1",
        },
      ],
    };
  }, [labels, volumes, volumeColors]);

  const handleChartHover = useMemo(() => {
    return (event: MouseEvent, chartRef: any) => {
      if (!chartRef.current || !labels.length) return;

      try {
        const chart = chartRef.current;
        const rect = chart.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;

        const dataX = chart.scales.x.getValueForPixel(x);

        if (dataX >= 0 && dataX < labels.length) {
          const index = Math.round(dataX);
          if (index >= 0 && index < labels.length) {
            setCrosshairData({
              time: labels[index],
              price: prices[index],
              volume: volumes[index],
              index,
            });
          }
        }
      } catch (err) {
        console.error("Error handling hover:", err);
      }
    };
  }, [labels, prices, volumes]);

  const handlePriceChartHover = (event: any) => {
    if (event.native) {
      handleChartHover(event.native, priceChartRef);
    }
  };

  const handleVolumeChartHover = (event: any) => {
    if (event.native) {
      handleChartHover(event.native, volumeChartRef);
    }
  };

  const priceOptions = {
    responsive: true,
    maintainAspectRatio: false,
    onHover: handlePriceChartHover,
    plugins: {
      legend: {
        display: true,
        position: "top" as const,
        labels: {
          color: "rgb(204, 204, 204)",
          usePointStyle: true,
        },
      },
      tooltip: {
        enabled: true,
        mode: "index" as const,
        intersect: false,
        callbacks: {
          label: function(context: any) {
            const index = context.dataIndex;
            if (index >= 0 && index < labels.length) {
              return [
                `Time: ${labels[index]}`,
                `Price: ${prices[index].toFixed(2)}`,
                `Avg: ${avgPrice.toFixed(2)}`,
                `Volume: ${(volumes[index] / 10000).toFixed(2)}万`,
              ];
            }
            return [];
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          color: "rgba(62, 62, 66, 0.5)",
          drawBorder: true,
        },
        ticks: {
          color: "rgb(133, 133, 133)",
          maxTicksLimit: 12,
          callback: function(value: any) {
            const index = value as number;
            if (index >= 0 && index < labels.length) {
              const label = labels[index];
              if (tradingHours.includes(label)) {
                return label;
              }
            }
            return "";
          },
        },
      },
      y: {
        display: true,
        position: "left" as const,
        grid: {
          color: "rgba(62, 62, 66, 0.5)",
          drawBorder: true,
        },
        ticks: {
          color: "rgb(133, 133, 133)",
        },
        title: {
          display: true,
          text: "Price",
          color: "rgb(204, 204, 204)",
        },
      },
    },
    interaction: {
      mode: "nearest" as const,
      axis: "x" as const,
      intersect: false,
    },
  };

  const volumeOptions = {
    responsive: true,
    maintainAspectRatio: false,
    onHover: handleVolumeChartHover,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
        mode: "index" as const,
        intersect: false,
        callbacks: {
          label: function(context: any) {
            const index = context.dataIndex;
            if (index >= 0 && index < volumes.length) {
              return `Volume: ${(volumes[index] / 10000).toFixed(2)}万`;
            }
            return "";
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          color: "rgba(62, 62, 66, 0.5)",
          drawBorder: true,
        },
        ticks: {
          color: "rgb(133, 133, 133)",
          maxTicksLimit: 12,
          callback: function(value: any) {
            const index = value as number;
            if (index >= 0 && index < labels.length) {
              const label = labels[index];
              if (tradingHours.includes(label)) {
                return label;
              }
            }
            return "";
          },
        },
      },
      y: {
        display: true,
        position: "right" as const,
        grid: {
          color: "rgba(62, 62, 66, 0.5)",
          drawBorder: true,
        },
        ticks: {
          color: "rgb(133, 133, 133)",
        },
        title: {
          display: true,
          text: "Volume",
          color: "rgb(204, 204, 204)",
        },
      },
    },
    interaction: {
      mode: "nearest" as const,
      axis: "x" as const,
      intersect: false,
    },
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (priceChartRef.current) {
        handleChartHover(event, priceChartRef);
      }
    };

    const handleMouseLeave = () => {
      setCrosshairData(null);
    };

    const priceChartElement = priceChartRef.current?.canvas;
    if (priceChartElement) {
      priceChartElement.addEventListener("mousemove", handleMouseMove);
      priceChartElement.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      if (priceChartElement) {
        priceChartElement.removeEventListener("mousemove", handleMouseMove);
        priceChartElement.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, [handleChartHover]);

  if (!data || data.length === 0) {
    return (
      <div className="time-series-chart">
        <div className="chart-empty">No time series data available</div>
      </div>
    );
  }

  return (
    <div className="time-series-chart">
      {crosshairData && (
        <div className="crosshair-info">
          <div>Time: {crosshairData.time}</div>
          <div>Price: {crosshairData.price.toFixed(2)}</div>
          <div>Volume: {(crosshairData.volume / 10000).toFixed(2)}万</div>
        </div>
      )}
      <div className="price-chart">
        <Line ref={priceChartRef} data={priceChartData} options={priceOptions} />
      </div>
      <div className="volume-chart">
        <Bar ref={volumeChartRef} data={volumeChartData} options={volumeOptions} />
      </div>
    </div>
  );
};

export default TimeSeriesChart;
