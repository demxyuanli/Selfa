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
      console.debug("TimeSeriesThumbnail: No data provided");
      return {};
    }

    const dataMap = new Map<string, { price: number; volume: number }>();
    data.forEach((d) => {
      const dateStr = d.date;
      // Handle different date formats:
      // - "YYYY-MM-DD HH:MM:SS" -> extract "HH:MM"
      // - "YYYY-MM-DD HH:MM" -> extract "HH:MM"
      // - "HH:MM" -> use directly
      let timeStr: string;
      if (dateStr.includes(" ")) {
        const timePart = dateStr.split(" ")[1];
        // Extract HH:MM from HH:MM:SS if needed
        timeStr = timePart.split(":").slice(0, 2).join(":");
      } else if (dateStr.includes(":")) {
        // Already in HH:MM format
        timeStr = dateStr.split(":").slice(0, 2).join(":");
      } else {
        // Fallback: try to use as-is
        timeStr = dateStr;
      }
      dataMap.set(timeStr, { price: d.close, volume: d.volume });
    });

    // Debug: log data mapping
    if (dataMap.size > 0) {
      const sampleTimes = Array.from(dataMap.keys()).slice(0, 5);
      console.debug("TimeSeriesThumbnail: Mapped times sample:", sampleTimes);
    }

    let lastMorningPrice: number | null = null;
    let lastPrice: number | null = null;
    const prices: (number | null)[] = fullTradingTimes.map((time) => {
      // Try exact match first
      let dataPoint = dataMap.get(time);
      
      // If no exact match, try to find nearest 5-minute interval
      // 5-minute K-line data points are at :00, :05, :10, :15, :20, :25, :30, :35, :40, :45, :50, :55
      if (!dataPoint) {
        const [hours, minutes] = time.split(":").map(Number);
        // Round down to nearest 5-minute interval
        const roundedMinutes = Math.floor(minutes / 5) * 5;
        const roundedTime = `${hours.toString().padStart(2, "0")}:${roundedMinutes.toString().padStart(2, "0")}`;
        dataPoint = dataMap.get(roundedTime);
      }
      
      if (dataPoint) {
        const [hours, minutes] = time.split(":").map(Number);
        const totalMinutes = hours * 60 + minutes;
        if (totalMinutes < 13 * 60) {
          lastMorningPrice = dataPoint.price;
        }
        lastPrice = dataPoint.price;
        return dataPoint.price;
      }
      
      // Use last known price for continuity
      if (lastPrice !== null) {
        return lastPrice;
      }
      
      // Use last morning price at 13:00 for continuity
      if (time === "13:00" && lastMorningPrice !== null) {
        lastPrice = lastMorningPrice;
        return lastMorningPrice;
      }
      
      return null;
    });

    const validPrices = prices.filter((p): p is number => p !== null);
    
    // Debug: log valid prices count
    if (validPrices.length === 0) {
      console.warn("TimeSeriesThumbnail: No valid prices found. Data count:", data.length, "Mapped times:", Array.from(dataMap.keys()));
    }
    
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
