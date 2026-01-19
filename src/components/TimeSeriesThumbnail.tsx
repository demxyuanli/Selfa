import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TimeSeriesThumbnailProps {
  data: StockData[];
  height?: number;
}

const generateFullTradingTimes = (): string[] => {
  const times: string[] = [];
  for (let h = 9; h <= 11; h++) {
    for (let m = 0; m < 60; m++) {
      if (h === 9 && m < 30) continue;
      if (h === 11 && m > 30) break;
      times.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    }
  }
  for (let h = 13; h <= 14; h++) {
    for (let m = 0; m < 60; m++) {
      times.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    }
  }
  times.push("15:00");
  return times;
};

const TimeSeriesThumbnail: React.FC<TimeSeriesThumbnailProps> = ({ data, height = 40 }) => {
  const fullTradingTimes = useMemo(() => generateFullTradingTimes(), []);

  const option = useMemo(() => {
    if (!data || data.length === 0) {
      return {};
    }

    const dataMap = new Map<string, { price: number; volume: number }>();
    data.forEach((d) => {
      const dateStr = d.date;
      const timeStr = dateStr.includes(" ") ? dateStr.split(" ")[1] : dateStr;
      dataMap.set(timeStr, { price: d.close, volume: d.volume });
    });

    let lastMorningPrice: number | null = null;
    const prices: (number | null)[] = fullTradingTimes.map((time) => {
      const dataPoint = dataMap.get(time);
      if (dataPoint) {
        const [hours, minutes] = time.split(":").map(Number);
        const totalMinutes = hours * 60 + minutes;
        if (totalMinutes < 13 * 60) {
          lastMorningPrice = dataPoint.price;
        }
        return dataPoint.price;
      }
      if (time === "13:00" && lastMorningPrice !== null) {
        return lastMorningPrice;
      }
      return null;
    });

    const validPrices = prices.filter((p): p is number => p !== null);
    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : 0;
    const priceRange = maxPrice - minPrice;
    const yAxisMin = minPrice - priceRange * 0.1;
    const yAxisMax = maxPrice;

    const avgPrice = validPrices.length > 0 ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length : 0;

    const lineColor = validPrices.length > 0 && validPrices[validPrices.length - 1] >= avgPrice ? "#ef5350" : "#26a69a";

    return {
      grid: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        containLabel: false,
      },
      xAxis: {
        type: "category",
        data: fullTradingTimes,
        boundaryGap: false,
        show: false,
      },
      yAxis: {
        type: "value",
        scale: true,
        min: yAxisMin,
        max: yAxisMax,
        show: false,
      },
      series: [
        {
          type: "line",
          data: prices,
          smooth: true,
          symbol: "none",
          lineStyle: {
            color: lineColor,
            width: 1.5,
            shadowColor: lineColor === "#ef5350" ? "rgba(239, 83, 80, 0.4)" : "rgba(38, 166, 154, 0.4)",
            shadowBlur: 3,
            shadowOffsetY: 1,
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                {
                  offset: 0,
                  color: lineColor === "#ef5350" ? "rgba(239, 83, 80, 0.15)" : "rgba(38, 166, 154, 0.15)",
                },
                {
                  offset: 0.5,
                  color: lineColor === "#ef5350" ? "rgba(239, 83, 80, 0.08)" : "rgba(38, 166, 154, 0.08)",
                },
                {
                  offset: 1,
                  color: lineColor === "#ef5350" ? "rgba(239, 83, 80, 0.02)" : "rgba(38, 166, 154, 0.02)",
                },
              ],
            },
            shadowColor: lineColor === "#ef5350" ? "rgba(239, 83, 80, 0.3)" : "rgba(38, 166, 154, 0.3)",
            shadowBlur: 4,
            shadowOffsetY: 2,
          },
        },
      ],
      animation: false,
    };
  }, [data, fullTradingTimes]);

  if (!data || data.length === 0) {
    return (
      <div style={{ width: "100%", height: `${height}px`, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "10px" }}>
        -
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={{ width: "100%", height: `${height}px` }}
      opts={{ renderer: "canvas", devicePixelRatio: 1 }}
    />
  );
};

export default TimeSeriesThumbnail;
