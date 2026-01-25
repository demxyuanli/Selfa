import React, { useMemo, useState, memo } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import "./TimeSeriesChart.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockQuote {
  previous_close: number;
}

interface TimeSeriesChartProps {
  data: StockData[];
  quote?: StockQuote | null;
  compact?: boolean; // For sidebar charts
}

// Generate full trading hours time points (09:30-11:30, 13:00-15:00)
const generateFullTradingTimes = (): string[] => {
  const times: string[] = [];
  // Morning: 09:30-11:30
  for (let h = 9; h <= 11; h++) {
    for (let m = 0; m < 60; m++) {
      if (h === 9 && m < 30) continue;
      if (h === 11 && m > 30) break;
      times.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    }
  }
  // Afternoon: 13:00-15:00
  for (let h = 13; h <= 14; h++) {
    for (let m = 0; m < 60; m++) {
      times.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    }
  }
  // 15:00
  times.push("15:00");
  return times;
};

const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({ data, quote, compact = false }) => {
  const { t } = useTranslation();
  const [crosshairData, setCrosshairData] = useState<{ time: string; price: number; volume: number; percent: number } | null>(null);
  const fullTradingTimes = useMemo(() => generateFullTradingTimes(), []);

  const option = useMemo(() => {
    if (!data || data.length === 0) {
      return {};
    }
    
    const previousClose = quote?.previous_close;
    const dataMap = new Map<string, { price: number; volume: number; open: number; close: number }>();
    data.forEach((d) => {
      const dateStr = d.date;
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
      // Normalize time format to HH:MM (pad with zeros if needed)
      const parts = timeStr.split(":");
      if (parts.length >= 2) {
        const hours = parts[0].padStart(2, "0");
        const minutes = parts[1].padStart(2, "0");
        timeStr = `${hours}:${minutes}`;
      }
      dataMap.set(timeStr, { price: d.close, volume: d.volume, open: d.open, close: d.close });
    });

    // Map prices and volumes to full trading times
    // Use forward fill for missing data points to ensure continuity
    let lastValidPrice: number | null = null;
    let lastMorningPrice: number | null = null;
    const prices: (number | null)[] = fullTradingTimes.map((time) => {
      const dataPoint = dataMap.get(time);
      if (dataPoint) {
        const [hours, minutes] = time.split(":").map(Number);
        const totalMinutes = hours * 60 + minutes;
        // Track last price before 13:00
        if (totalMinutes < 13 * 60) {
          lastMorningPrice = dataPoint.price;
        }
        lastValidPrice = dataPoint.price;
        return dataPoint.price;
      }
      // If this is 13:00 and we have last morning price, use it to ensure continuity
      if (time === "13:00" && lastMorningPrice !== null) {
        lastValidPrice = lastMorningPrice;
        return lastMorningPrice;
      }
      // Forward fill: use last valid price for missing data points
      if (lastValidPrice !== null) {
        return lastValidPrice;
      }
      return null;
    });
    
    const volumes: (number | null)[] = fullTradingTimes.map((time) => {
      const dataPoint = dataMap.get(time);
      return dataPoint ? dataPoint.volume : null;
    });

    // Calculate price range for Y axis
    const validPrices = prices.filter((p): p is number => p !== null);
    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : 0;
    const priceRange = maxPrice - minPrice;
    
    // Y axis: min with 10% padding below, max without padding
    const yAxisMin = minPrice - priceRange * 0.1;
    const yAxisMax = maxPrice;
    
    const avgPrice = validPrices.length > 0 ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length : 0;

    // Calculate percentage range if previous close is available
    let percentMin: number | undefined;
    let percentMax: number | undefined;
    
    if (previousClose) {
      percentMin = ((yAxisMin - previousClose) / previousClose) * 100;
      percentMax = ((yAxisMax - previousClose) / previousClose) * 100;
    }

    const volumeColors = fullTradingTimes.map((time, index) => {
      const dataPoint = dataMap.get(time);
      if (!dataPoint || dataPoint.volume === null) {
        return "rgba(133, 133, 133, 0.3)";
      }
      // Determine color based on current minute's open vs close (A-share convention: red for up, green for down)
      return dataPoint.close >= dataPoint.open ? "#ff0000" : "#00ff00";
    });

    return {
      backgroundColor: "#1e1e1e",
      axisPointer: {
        link: [{ xAxisIndex: [0, 1] }],
        snap: true,
        label: {
          backgroundColor: "#777",
        },
      },
      grid: [
        {
          left: "5%",
          right: "3%",
          top: "10%",
          height: "60%",
        },
        {
          left: "5%",
          right: "3%",
          top: "75%",
          height: "20%",
        },
      ],
      xAxis: [
        {
          type: "category",
          data: fullTradingTimes,
          boundaryGap: false,
          axisPointer: {
            snap: true,
          },
          axisLine: {
            lineStyle: {
              color: "#3e3e42",
            },
          },
          axisLabel: {
            color: "#858585",
            fontSize: compact ? 7 : 9,
            interval: 0,
            formatter: (value: string, index: number) => {
              const timeStr = value;
              if (!timeStr || !timeStr.includes(":")) {
                return "";
              }
              const [hours, minutes] = timeStr.split(":");
              const h = parseInt(hours);
              const m = parseInt(minutes);
              const totalMinutes = h * 60 + m;
              // Trading hours: 09:30-11:30 and 13:00-15:00
              const morningStart = 9 * 60 + 30;
              const morningEnd = 11 * 60 + 30;
              const afternoonStart = 13 * 60;
              const afternoonEnd = 15 * 60;
              
              // Don't show 11:30 if next label is 13:00 (to avoid overlap)
              if (totalMinutes === morningEnd) {
                // Check if next time point is 13:00
                if (index < fullTradingTimes.length - 1) {
                  const nextTime = fullTradingTimes[index + 1];
                  if (nextTime === "13:00") {
                    return ""; // Don't show 11:30, only show 13:00
                  }
                }
              }
              
              // Check if within trading hours
              const inMorning = totalMinutes >= morningStart && totalMinutes <= morningEnd;
              const inAfternoon = totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd;
              
              if (inMorning || inAfternoon) {
                // Show label every 30 minutes
                if (totalMinutes % 30 === 0) {
                  return value;
                }
              }
              return "";
            },
          },
          splitLine: {
            show: true,
            lineStyle: {
              color: "#3e3e42",
              opacity: 0.3,
            },
            interval: (_index: number, value: string) => {
              const timeStr = value;
              if (!timeStr || !timeStr.includes(":")) {
                return false;
              }
              const [hours, minutes] = timeStr.split(":");
              const h = parseInt(hours);
              const m = parseInt(minutes);
              const totalMinutes = h * 60 + m;
              // Trading hours: 09:30-11:30 and 13:00-15:00
              const morningStart = 9 * 60 + 30;
              const morningEnd = 11 * 60 + 30;
              const afternoonStart = 13 * 60;
              const afternoonEnd = 15 * 60;
              
              // Check if within trading hours
              const inMorning = totalMinutes >= morningStart && totalMinutes <= morningEnd;
              const inAfternoon = totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd;
              
              if (inMorning || inAfternoon) {
                // Show grid line every 30 minutes
                return totalMinutes % 30 === 0;
              }
              return false;
            },
          },
        },
        {
          type: "category",
          gridIndex: 1,
          data: fullTradingTimes,
          boundaryGap: false,
          axisLine: {
            lineStyle: {
              color: "#3e3e42",
            },
          },
          axisPointer: {
            snap: true,
          },
          axisLabel: {
            color: "#858585",
            fontSize: 9,
            interval: 0,
            formatter: (value: string, index: number) => {
              const timeStr = value;
              if (!timeStr || !timeStr.includes(":")) {
                return "";
              }
              const [hours, minutes] = timeStr.split(":");
              const h = parseInt(hours);
              const m = parseInt(minutes);
              const totalMinutes = h * 60 + m;
              // Trading hours: 09:30-11:30 and 13:00-15:00
              const morningStart = 9 * 60 + 30;
              const morningEnd = 11 * 60 + 30;
              const afternoonStart = 13 * 60;
              const afternoonEnd = 15 * 60;
              
              // Don't show 11:30 if next label is 13:00 (to avoid overlap)
              if (totalMinutes === morningEnd) {
                // Check if next time point is 13:00
                if (index < fullTradingTimes.length - 1) {
                  const nextTime = fullTradingTimes[index + 1];
                  if (nextTime === "13:00") {
                    return ""; // Don't show 11:30, only show 13:00
                  }
                }
              }
              
              // Check if within trading hours
              const inMorning = totalMinutes >= morningStart && totalMinutes <= morningEnd;
              const inAfternoon = totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd;
              
              if (inMorning || inAfternoon) {
                // Show label every 30 minutes
                if (totalMinutes % 30 === 0) {
                  return value;
                }
              }
              return "";
            },
          },
          splitLine: {
            show: false,
          },
        },
      ],
      yAxis: [
        {
          type: "value",
          scale: true,
          min: yAxisMin,
          max: yAxisMax,
          axisPointer: {
            snap: true,
          },
          splitArea: {
            show: true,
            areaStyle: {
              color: ["rgba(62, 62, 66, 0.1)", "rgba(62, 62, 66, 0.05)"],
            },
          },
          axisLabel: {
            color: "#858585",
            fontSize: compact ? 7 : 9,
            formatter: (value: number) => {
              if (compact) {
                // No unit, just number
                return value.toFixed(0);
              }
              return value.toFixed(2);
            },
          },
          axisLine: {
            lineStyle: {
              color: "#3e3e42",
            },
          },
          splitLine: {
            show: true,
            lineStyle: {
              color: "#3e3e42",
              opacity: 0.5,
            },
          },
        },
        {
          type: "value",
          gridIndex: 1,
          scale: true,
          axisPointer: {
            snap: true,
          },
          axisLabel: {
            color: "#858585",
            fontSize: compact ? 7 : 9,
            formatter: (value: number) => {
              if (compact) {
                // Round to 100 million, no unit
                return Math.round(value / 100000000).toString();
              }
              return (value / 10000).toFixed(1) + t("common.tenThousand");
            },
          },
          axisLine: {
            lineStyle: {
              color: "#3e3e42",
            },
          },
          splitLine: {
            show: true,
            lineStyle: {
              color: "#3e3e42",
              opacity: 0.3,
            },
          },
        },
        {
          type: "value",
          scale: true,
          min: percentMin,
          max: percentMax,
          position: "right",
          axisLine: {
            show: false,
          },
          axisLabel: {
            color: "#858585",
            fontSize: compact ? 7 : 9,
            formatter: (value: number) => {
              return value.toFixed(2) + "%";
            },
          },
          splitLine: {
            show: false,
          },
        },
      ],
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: [0, 1],
          start: 0,
          end: 100,
        },
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          snap: true,
          lineStyle: {
            color: "#007acc",
            width: 1,
          },
          crossStyle: {
            color: "#007acc",
          },
        },
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#3e3e42",
        borderWidth: 1,
        textStyle: {
          color: "#cccccc",
          fontSize: compact ? 8 : 10,
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return "";
          const param = params[0];
          const dataIndex = param.dataIndex;
          if (dataIndex < 0 || dataIndex >= fullTradingTimes.length) return "";

          const price = prices[dataIndex];
          const volume = volumes[dataIndex];
          const time = fullTradingTimes[dataIndex];
          
          if (price === null || volume === null) {
            return `
              <div style="padding: 4px 0;">
                <div><strong>${time}</strong></div>
                <div>${t("chart.noData")}</div>
              </div>
            `;
          }

          let percentChangeStr = "";
          if (previousClose && price !== undefined && price !== null) {
            const change = price - previousClose;
            const percent = (change / previousClose) * 100;
            const color = change > 0 ? "#ff0000" : change < 0 ? "#00ff00" : "#cccccc";
            const sign = change > 0 ? "+" : "";
            percentChangeStr = `<div>${t("chart.change")}: <span style="color: ${color};">${sign}${percent.toFixed(2)}%</span></div>`;
          }

          return `
            <div style="padding: 4px 0;">
              <div><strong>${time}</strong></div>
              <div>${t("chart.price")}: <span style="color: #cccccc;">${price.toFixed(2)}</span></div>
              ${percentChangeStr}
              <div>${t("chart.avgPrice")}: <span style="color: #858585;">${avgPrice.toFixed(2)}</span></div>
              <div>${t("chart.volume")}: <span style="color: #cccccc;">${(volume / 10000).toFixed(2)}${t("common.tenThousand")}</span></div>
            </div>
          `;
        },
      },
      series: [
        {
          name: t("chart.price"),
          type: "line",
          data: prices,
          smooth: false,
          symbol: "none",
          connectNulls: true, // Connect null values using forward fill to ensure continuity
          lineStyle: {
            color: "#007acc",
            width: 1,
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
                  color: "rgba(0, 122, 204, 0.3)",
                },
                {
                  offset: 1,
                  color: "rgba(0, 122, 204, 0.05)",
                },
              ],
            },
          },
          emphasis: {
            focus: "series",
          },
        },
        {
          name: t("chart.avgPrice"),
          type: "line",
          data: prices.map(() => avgPrice),
          smooth: false,
          symbol: "none",
          lineStyle: {
            color: "#858585",
            width: 1,
            type: "dashed",
          },
          emphasis: {
            focus: "series",
          },
        },
        {
          name: t("chart.volume"),
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes.map((vol, index) => ({
            value: vol,
            itemStyle: {
              color: volumeColors[index],
            },
          })),
          emphasis: {
            focus: "series",
          },
        },
      ],
    };
  }, [data, fullTradingTimes, t, quote]);

  if (!data || data.length === 0) {
    return (
      <div className="time-series-chart">
        <div className="chart-empty">{t("chart.noTimeSeriesData")}</div>
      </div>
    );
  }

  const previousClose = quote?.previous_close;

  return (
    <div className="time-series-chart">
      {crosshairData && (
        <div className="crosshair-info">
          <div>{t("chart.time")}: {crosshairData.time}</div>
          <div>{t("chart.price")}: {crosshairData.price.toFixed(2)}</div>
          {previousClose && (
            <div>
              {t("chart.change")}: 
              <span style={{ color: crosshairData.price > previousClose ? "#ff0000" : crosshairData.price < previousClose ? "#00ff00" : "#cccccc" }}>
                {crosshairData.price > previousClose ? "+" : ""}
                {((crosshairData.price - previousClose) / previousClose * 100).toFixed(2)}%
              </span>
            </div>
          )}
          <div>{t("chart.volume")}: {(crosshairData.volume / 10000).toFixed(2)}{t("common.tenThousand")}</div>
        </div>
      )}
      <ReactECharts
        option={option}
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "canvas" }}
        notMerge={false}
        lazyUpdate={true}
        onEvents={{
          mousemove: (params: any) => {
            if (params.dataIndex !== undefined && params.dataIndex >= 0 && params.dataIndex < fullTradingTimes.length) {
              const index = params.dataIndex;
              const time = fullTradingTimes[index];
              
              // Find corresponding data point
              const dataPoint = data.find((d) => {
                const dateStr = d.date;
                const timeStr = dateStr.includes(" ") ? dateStr.split(" ")[1] : dateStr;
                return timeStr === time;
              });
              
              if (dataPoint) {
                setCrosshairData({
                  time: time,
                  price: dataPoint.close,
                  volume: dataPoint.volume,
                  percent: previousClose ? (dataPoint.close - previousClose) / previousClose * 100 : 0,
                });
              } else {
                setCrosshairData(null);
              }
            }
          },
          mouseout: () => {
            setCrosshairData(null);
          },
        }}
      />
    </div>
  );
};

export default memo(TimeSeriesChart, (prevProps, nextProps) => {
  // Only re-render if data actually changed
  if (prevProps.data.length !== nextProps.data.length) {
    return false;
  }
  // Deep compare data arrays
  for (let i = 0; i < prevProps.data.length; i++) {
    const prev = prevProps.data[i];
    const next = nextProps.data[i];
    if (prev.date !== next.date || prev.close !== next.close || prev.volume !== next.volume) {
      return false;
    }
  }
  // Also check compact prop
  if (prevProps.compact !== nextProps.compact) {
    return false;
  }
  // Check quote
  if (prevProps.quote?.previous_close !== nextProps.quote?.previous_close) {
    return false;
  }
  return true; // Props are equal, skip re-render
});
