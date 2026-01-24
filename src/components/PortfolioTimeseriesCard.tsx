import React, { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import { stockDataManager } from "../services/StockDataManager";
import { useTradingHoursTimeseriesRefresh } from "../hooks/useTradingHoursTimeseriesRefresh";
import "./PortfolioTimeseriesCard.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PortfolioPosition {
  id: number;
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  profit: number;
  profitPercent: number;
  previousClose?: number;
}

interface PortfolioTimeseriesCardProps {
  onStockSelect?: (symbol: string, name: string) => void;
}

// Generate full trading hours time points (09:30-11:30, 13:00-15:00)
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

const PORTFOLIO_LINE_COLORS = [
  "#007acc", // blue
  "#00ff00", // green
  "#ff9800", // orange
  "#9c27b0", // purple
  "#ff0000", // red
  "#00bcd4", // cyan
  "#e91e63", // pink
  "#ffeb3b", // yellow
  "#795548", // brown
  "#607d8b", // blue-grey
];

const PortfolioTimeseriesCard: React.FC<PortfolioTimeseriesCardProps> = ({ onStockSelect: _onStockSelect }) => {
  const { t } = useTranslation();
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [timeseriesData, setTimeseriesData] = useState<Map<string, StockData[]>>(new Map());
  const [currentPrices, setCurrentPrices] = useState<Map<string, number>>(new Map());
  const [previousCloses, setPreviousCloses] = useState<Map<string, number>>(new Map());
  const [indexData, setIndexData] = useState<Map<string, StockData[]>>(new Map());
  const [amplificationFactor, setAmplificationFactor] = useState(3.5); // Amplification factor for price movements
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fullTradingTimes = useMemo(() => generateFullTradingTimes(), []);

  // Define benchmark indices
  const BENCHMARK_INDICES = [
    { symbol: "000001", name: t("portfolio.shanghaiIndex") || "Shanghai Index" },
    { symbol: "000688", name: t("portfolio.starIndex") || "STAR Index" }
  ];

  const loadPortfolioAndTimeseries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const positionsData: Array<[number, string, string, number, number, number | null]> =
        await invoke("get_portfolio_positions");

      // Fetch all stock data bundles using stockDataManager
      const positionSymbols = positionsData.map(([_, symbol]) => symbol);
      const stockBundles = await stockDataManager.getBatchStockData(positionSymbols);
      
      const positionsWithPrices = positionsData.map(([id, symbol, name, quantity, avgCost, currentPrice]) => {
        const bundle = stockBundles.get(symbol);
        let price = currentPrice || avgCost;
        let previousClose: number | undefined = undefined;
        
        // Get price from bundle
        if (bundle?.quote) {
          if (bundle.quote.price && bundle.quote.price > 0) {
            price = bundle.quote.price;
          } else if (bundle.quote.previous_close && bundle.quote.previous_close > 0) {
            price = bundle.quote.previous_close;
          }
          previousClose = bundle.quote.previous_close;
        }

        const validPrice = price && price > 0 ? price : avgCost;
        const marketValue = quantity * validPrice;
        const profit = (validPrice - avgCost) * quantity;
        const profitPercent = avgCost > 0 ? ((validPrice - avgCost) / avgCost) * 100 : 0;

        return {
          id,
          symbol,
          name,
          quantity,
          avgCost,
          currentPrice: validPrice,
          marketValue,
          profit,
          profitPercent,
          previousClose,
        } as PortfolioPosition;
      });

      // Limit to first 3 positions for better visualization
      const limitedPositions = positionsWithPrices.slice(0, 3);
      setPositions(limitedPositions);

      // Store current prices and previous closes for positions and indices
      const pricesMap = new Map<string, number>();
      const previousClosesMap = new Map<string, number>();
      limitedPositions.forEach((position) => {
        pricesMap.set(position.symbol, position.currentPrice);
        if (position.previousClose) {
          previousClosesMap.set(position.symbol, position.previousClose);
        }
      });

      // Fetch benchmark index data bundles
      const indexSymbols = BENCHMARK_INDICES.map(index => index.symbol);
      const indexBundles = await stockDataManager.getBatchStockData(indexSymbols);
      
      // Get previous closes for benchmark indices
      BENCHMARK_INDICES.forEach((index) => {
        const bundle = indexBundles.get(index.symbol);
        if (bundle?.quote?.previous_close) {
          previousClosesMap.set(index.symbol, bundle.quote.previous_close);
        }
      });

      setCurrentPrices(pricesMap);
      setPreviousCloses(previousClosesMap);

      // Extract timeseries data from bundles for limited positions
      const timeseriesMap = new Map<string, StockData[]>();
      limitedPositions.forEach((position) => {
        const bundle = stockBundles.get(position.symbol);
        if (bundle?.time_series && bundle.time_series.length > 0) {
          timeseriesMap.set(position.symbol, bundle.time_series);
        }
      });
      setTimeseriesData(timeseriesMap);

      // Extract benchmark index data from bundles
      const indexDataMap = new Map<string, StockData[]>();
      BENCHMARK_INDICES.forEach((index) => {
        const bundle = indexBundles.get(index.symbol);
        if (bundle?.time_series && bundle.time_series.length > 0) {
          indexDataMap.set(index.symbol, bundle.time_series);
        }
      });
      setIndexData(indexDataMap);
    } catch (err) {
      console.error("Error loading portfolio timeseries:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolioAndTimeseries();
  }, [loadPortfolioAndTimeseries]);

  useTradingHoursTimeseriesRefresh(loadPortfolioAndTimeseries, {
    enabled: true,
    intervalInMs: 30000,
  });

  const chartOption = useMemo(() => {
    if (positions.length === 0) {
      return {};
    }

    const stockSeries: any[] = [];
    const indexSeries: any[] = [];
    const volumeSeries: any[] = [];
    const legendData: string[] = [];
    let allStockPrices: number[] = [];
    let allIndexPrices: number[] = [];
    // Store original prices by series index and data index for tooltip
    const originalPriceMap = new Map<string, Map<number, number>>();
    const volumeDataMap = new Map<string, (number | null)[]>();

    positions.forEach((position, index) => {
      const data = timeseriesData.get(position.symbol);
      const currentPrice = currentPrices.get(position.symbol);
      const previousClose = previousCloses.get(position.symbol);
      
      // Skip if no data at all
      if ((!data || data.length === 0) && !currentPrice) return;
      
      // Use previous close as reference, fallback to first historical price if available
      let referencePrice = previousClose;
      if (!referencePrice && data && data.length > 0) {
        // Use first historical price as reference
        referencePrice = data[0].close;
      }
      if (!referencePrice && currentPrice) {
        // Fallback to current price
        referencePrice = currentPrice;
      }
      if (!referencePrice) return;

      // Convert prices to percentage changes relative to reference price, then apply amplification
      // Formula: amplified_value = (price / reference_price - 1) * amplification_factor * 100
      // This makes all stocks comparable on the same scale
      const calculateAmplifiedChange = (price: number): number => {
        if (!referencePrice || referencePrice === 0) return 0;
        const changePercent = ((price / referencePrice) - 1) * amplificationFactor * 100;
        return changePercent;
      };

      // If no historical data, create a minimal line from current price
      if (!data || data.length === 0) {
        if (!currentPrice) return;
        
        const amplifiedCurrent = calculateAmplifiedChange(currentPrice);
        // Show line only at the last few time points
        const prices: (number | null)[] = fullTradingTimes.map((_, idx) => {
          if (idx >= fullTradingTimes.length - 5) {
            return amplifiedCurrent;
          }
          return null;
        });

        allStockPrices.push(amplifiedCurrent);

        const color = PORTFOLIO_LINE_COLORS[index % PORTFOLIO_LINE_COLORS.length];
        const label = `${position.symbol} ${position.name}`;
        legendData.push(label);

        // Store original prices for this series
        const noDataOriginalPricesMap = new Map<number, number>();
        prices.forEach((p, idx) => {
          if (p !== null) {
            noDataOriginalPricesMap.set(idx, currentPrice);
          }
        });
        originalPriceMap.set(label, noDataOriginalPricesMap);

        // Main price line (for lower stock area)
        stockSeries.push({
          name: label,
          type: "line",
          data: prices,
          symbol: "none",
          lineStyle: {
            color: color,
            width: 1.5,
          },
          smooth: false,
          connectNulls: true,
          xAxisIndex: 1,
          yAxisIndex: 1,
        });

        // Previous close reference line (horizontal at 0%)
        if (previousClose) {
          const previousCloseLine: (number | null)[] = fullTradingTimes.map(() => 0);
          stockSeries.push({
            name: `${label} (${t("portfolio.previousClose")})`,
            type: "line",
            data: previousCloseLine,
            symbol: "none",
            lineStyle: {
              color: color,
              width: 1,
              type: "dashed",
              opacity: 0.5,
            },
            smooth: false,
            connectNulls: true,
            silent: true,
            xAxisIndex: 1,
            yAxisIndex: 1,
          });
        }

        // Average cost reference line
        if (position.avgCost && position.avgCost > 0) {
          const avgCostAmplified = calculateAmplifiedChange(position.avgCost);
          const avgCostLine: (number | null)[] = fullTradingTimes.map(() => avgCostAmplified);
          allStockPrices.push(avgCostAmplified);
          stockSeries.push({
            name: `${label} (${t("portfolio.cost")})`,
            type: "line",
            data: avgCostLine,
            symbol: "none",
            lineStyle: {
              color: color,
              width: 1.5,
              type: "dashed",
              opacity: 0.7,
            },
            smooth: false,
            connectNulls: true,
            silent: true,
            xAxisIndex: 1,
            yAxisIndex: 1,
          });
        }
        return;
      }

      // Debug: log data sample
      if (index === 0 && data.length > 0) {
        console.log("PortfolioTimeseries sample data:", {
          symbol: position.symbol,
          dataLength: data.length,
          firstDate: data[0]?.date,
          lastDate: data[data.length - 1]?.date,
        });
      }

      const dataMap = new Map<string, { price: number; volume: number }>();
      data.forEach((d) => {
        const dateStr = d.date;
        let timeStr = dateStr.includes(" ") ? dateStr.split(" ")[1] : dateStr;
        // Extract HH:MM from HH:MM:SS format if needed
        if (timeStr.includes(":")) {
          const parts = timeStr.split(":");
          if (parts.length >= 2) {
            timeStr = `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
          }
        }
        dataMap.set(timeStr, { price: d.close, volume: d.volume });
      });

      // Store original prices for tooltip display
      const originalPricesMap = new Map<number, number>();
      let lastPrice: number | null = null;
      let lastValidIndex = -1;
      const amplifiedPrices: (number | null)[] = fullTradingTimes.map((time, idx) => {
        const dataPoint = dataMap.get(time);
        if (dataPoint) {
          lastPrice = dataPoint.price;
          lastValidIndex = idx;
          originalPricesMap.set(idx, dataPoint.price);
          return calculateAmplifiedChange(dataPoint.price);
        }
        
        // Use last valid price for continuity if we have one
        if (lastPrice !== null && lastValidIndex >= 0) {
          // For 13:00, use last morning price for continuity
          if (time === "13:00" && idx > 0) {
            originalPricesMap.set(idx, lastPrice);
            return calculateAmplifiedChange(lastPrice);
          }
        }
        
        return null;
      });

      // Merge current price at the end if available
      if (currentPrice) {
        const lastIndex = amplifiedPrices.length - 1;
        if (lastIndex >= 0) {
          const amplifiedCurrent = calculateAmplifiedChange(currentPrice);
          if (amplifiedPrices[lastIndex] === null || amplifiedPrices[lastIndex] !== amplifiedCurrent) {
            amplifiedPrices[lastIndex] = amplifiedCurrent;
            originalPricesMap.set(lastIndex, currentPrice);
          }
        }
      }

      const validPrices = amplifiedPrices.filter((p): p is number => p !== null);
      if (validPrices.length === 0) return;

      // Debug: log mapped data
      if (index === 0) {
        console.log("PortfolioTimeseries mapped prices:", {
          symbol: position.symbol,
          totalPoints: amplifiedPrices.length,
          validPoints: validPrices.length,
          referencePrice,
          amplificationFactor,
        });
      }

      allStockPrices.push(...validPrices);

      const color = PORTFOLIO_LINE_COLORS[index % PORTFOLIO_LINE_COLORS.length];
      const label = `${position.symbol} ${position.name}`;
      legendData.push(label);

      // Store original prices map for this series
      originalPriceMap.set(label, originalPricesMap);

      // Main price line (for lower stock area)
      stockSeries.push({
        name: label,
        type: "line",
        data: amplifiedPrices,
        symbol: "none",
        lineStyle: {
          color: color,
          width: 1.5,
        },
        smooth: false,
        connectNulls: true,
        xAxisIndex: 1,
        yAxisIndex: 1,
      });

      // Previous close reference line (horizontal dashed line at 0% change)
      if (previousClose) {
        const previousCloseLine: (number | null)[] = fullTradingTimes.map(() => 0);
        stockSeries.push({
          name: `${label} ${t("portfolio.previousCloseLabel")}`,
          type: "line",
          data: previousCloseLine,
          symbol: "none",
          lineStyle: {
            color: color,
            width: 1,
            type: "dashed",
            opacity: 0.5,
          },
          smooth: false,
          connectNulls: true,
          silent: true, // Don't trigger tooltip
          xAxisIndex: 1,
          yAxisIndex: 1,
        });
      }

      // Average cost reference line (horizontal line at cost price)
      if (position.avgCost && position.avgCost > 0) {
        const avgCostAmplified = calculateAmplifiedChange(position.avgCost);
        const avgCostLine: (number | null)[] = fullTradingTimes.map(() => avgCostAmplified);
        allStockPrices.push(avgCostAmplified);
        stockSeries.push({
          name: `${label} ${t("portfolio.costLabel")}`,
          type: "line",
          data: avgCostLine,
          symbol: "none",
          lineStyle: {
            color: color,
            width: 1.5,
            type: "dashed",
            opacity: 0.7,
          },
          smooth: false,
          connectNulls: true,
          silent: true, // Don't trigger tooltip
          xAxisIndex: 1,
          yAxisIndex: 1,
        });
      }
    });

    // Add benchmark index lines
    const INDEX_COLORS = ["#ff0000", "#ff9900"]; // Red for Shanghai Index, Orange for STAR Index
    BENCHMARK_INDICES.forEach((index, indexIdx) => {
      const data = indexData.get(index.symbol);
      if (!data || data.length === 0) return;

      // Use previous close as reference price for the index
      let referencePrice = previousCloses.get(index.symbol);
      if (!referencePrice && data && data.length > 0) {
        // Use the first historical price as reference
        referencePrice = data[0].close;
      }
      if (!referencePrice) return;

      const dataMap = new Map<string, { price: number; volume: number }>();
      data.forEach((d) => {
        const dateStr = d.date;
        let timeStr = dateStr.includes(" ") ? dateStr.split(" ")[1] : dateStr;
        if (timeStr.includes(":")) {
          const parts = timeStr.split(":");
          if (parts.length >= 2) {
            timeStr = `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
          }
        }
        dataMap.set(timeStr, { price: d.close, volume: d.volume });
      });

      // Calculate amplified percentage changes
      const calculateAmplifiedChange = (price: number): number => {
        if (!referencePrice || referencePrice === 0) return 0;
        const changePercent = ((price / referencePrice) - 1) * amplificationFactor * 100;
        return changePercent;
      };

      // Store original prices for tooltip display
      const originalPricesMap = new Map<number, number>();
      let lastPrice: number | null = null;
      let lastValidIndex = -1;
      const amplifiedPrices: (number | null)[] = fullTradingTimes.map((time, idx) => {
        const dataPoint = dataMap.get(time);
        if (dataPoint) {
          lastPrice = dataPoint.price;
          lastValidIndex = idx;
          originalPricesMap.set(idx, dataPoint.price);
          return calculateAmplifiedChange(dataPoint.price);
        }

        // Use last valid price for continuity if we have one
        if (lastPrice !== null && lastValidIndex >= 0) {
          if (time === "13:00" && idx > 0) {
            originalPricesMap.set(idx, lastPrice);
            return calculateAmplifiedChange(lastPrice);
          }
        }

        return null;
      });

      const validPrices = amplifiedPrices.filter((p): p is number => p !== null);
      if (validPrices.length === 0) return;

      allIndexPrices.push(...validPrices);
      legendData.push(index.name);

      // Store original prices map for this series
      originalPriceMap.set(index.name, originalPricesMap);

      // Prepare volume data for this index
      const volumeData: (number | null)[] = fullTradingTimes.map((time) => {
        const dataPoint = dataMap.get(time);
        return dataPoint ? dataPoint.volume : null;
      });
      volumeDataMap.set(index.name, volumeData);

      // Add index line with shadow area (for upper index area)
      indexSeries.push({
        name: index.name,
        type: "line",
        data: amplifiedPrices,
        symbol: "none",
        lineStyle: {
          color: INDEX_COLORS[indexIdx % INDEX_COLORS.length],
          width: 2,
          opacity: 0.8,
        },
        areaStyle: {
          color: INDEX_COLORS[indexIdx % INDEX_COLORS.length],
          opacity: 0.1,
        },
        smooth: false,
        connectNulls: true,
        xAxisIndex: 0,
        yAxisIndex: 0,
        z: 10,
      });
    });

    // Add volume bar charts for indices (upper area)
    BENCHMARK_INDICES.forEach((index, indexIdx) => {
      const volumeData = volumeDataMap.get(index.name);
      if (!volumeData || volumeData.every(v => v === null)) return;

      const maxVolume = Math.max(...volumeData.filter((v): v is number => v !== null));
      if (maxVolume === 0) return;

      // Normalize volume data (scale to percentage range for better visualization)
      const normalizedVolume = volumeData.map(v => {
        if (v === null) return null;
        return (v / maxVolume) * 100; // Scale to 0-100 range
      });

      volumeSeries.push({
        name: `${index.name} Volume`,
        type: "bar",
        data: normalizedVolume,
        itemStyle: {
          color: INDEX_COLORS[indexIdx % INDEX_COLORS.length],
          opacity: 0.3,
        },
        xAxisIndex: 0,
        yAxisIndex: 2, // Use separate y-axis for volume
        silent: true, // Don't trigger tooltip for volume bars
        z: 1, // Behind index lines
      });
    });

    if (indexSeries.length === 0 && stockSeries.length === 0) {
      return {};
    }

    // Y-axis range for index percentage changes
    const indexMinPrice = allIndexPrices.length > 0 ? Math.min(...allIndexPrices) : -5;
    const indexMaxPrice = allIndexPrices.length > 0 ? Math.max(...allIndexPrices) : 5;
    const indexPriceRange = indexMaxPrice - indexMinPrice;
    const indexYAxisMin = indexMinPrice - Math.max(indexPriceRange * 0.1, 1);
    const indexYAxisMax = indexMaxPrice + Math.max(indexPriceRange * 0.1, 1);

    // Y-axis range for stock percentage changes
    const stockMinPrice = allStockPrices.length > 0 ? Math.min(...allStockPrices) : -5;
    const stockMaxPrice = allStockPrices.length > 0 ? Math.max(...allStockPrices) : 5;
    const stockPriceRange = stockMaxPrice - stockMinPrice;
    const stockYAxisMin = stockMinPrice - Math.max(stockPriceRange * 0.1, 1);
    const stockYAxisMax = stockMaxPrice + Math.max(stockPriceRange * 0.1, 1);

    return {
      backgroundColor: "#1e1e1e",
      grid: [
        // Upper grid for indices and volume
        {
          left: "8%",
          right: "3%",
          top: "15%",
          height: "25%",
          containLabel: false,
        },
        // Lower grid for stocks
        {
          left: "8%",
          right: "3%",
          top: "40%",
          bottom: "8%",
          containLabel: false,
        },
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          snap: true,
        },
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#555",
        textStyle: { color: "#ccc", fontSize: 12 },
        formatter: (params: any) => {
          if (!params || !Array.isArray(params)) return "";
          const time = params[0].axisValue;
          const dataIndex = params[0].dataIndex;
          let result = `<div style="margin-bottom: 4px; font-weight: 600;">${time}</div>`;
          result += `<div style="margin-bottom: 4px; font-size: 10px; color: #999;">${t("portfolio.previousCloseReference")}</div>`;
          params.forEach((param: any) => {
            if (param.value !== null && param.value !== undefined && 
                !param.seriesName?.includes(t("portfolio.previousClose")) && 
                !param.seriesName?.includes(t("portfolio.cost"))) {
              const value = typeof param.value === "number" ? param.value : 0;
              const color = param.color || "#ccc";
              // Get original price from stored map
              const seriesOriginalPrices = originalPriceMap.get(param.seriesName);
              const originalPrice = seriesOriginalPrices?.get(dataIndex);
              
              result += `<div style="margin: 2px 0;">
                <span style="display: inline-block; width: 10px; height: 10px; background-color: ${color}; margin-right: 6px; border-radius: 2px;"></span>
                ${param.seriesName}: `;
              
              if (originalPrice !== null && originalPrice !== undefined) {
                result += `<span style="font-weight: 600;">${t("common.currencySymbol")}${originalPrice.toFixed(2)}</span> `;
                result += `<span style="font-size: 11px; color: #999;">(${value >= 0 ? "+" : ""}${value.toFixed(2)}%)</span>`;
              } else {
                result += `<span style="font-weight: 600;">${value >= 0 ? "+" : ""}${value.toFixed(2)}%</span>`;
              }
              
              result += `</div>`;
            }
          });
          return result;
        },
      },
      legend: {
        data: legendData,
        textStyle: { color: "#858585", fontSize: 10 },
        top: 0,
        type: "scroll",
        orient: "horizontal",
        left: "center",
      },
      xAxis: [
        // Upper x-axis for indices
        {
          type: "category",
          data: fullTradingTimes,
          boundaryGap: false,
          gridIndex: 0,
          axisPointer: {
            snap: true,
          },
          axisLabel: {
            show: false, // Hide labels in upper area
            fontSize: 9,
            color: "#858585",
          },
          axisLine: {
            lineStyle: { color: "#555" },
          },
        },
        // Lower x-axis for stocks
        {
          type: "category",
          data: fullTradingTimes,
          boundaryGap: false,
          gridIndex: 1,
          axisPointer: {
            snap: true,
          },
          axisLabel: {
            fontSize: 9,
            color: "#858585",
            interval: (index: number) => {
              const time = fullTradingTimes[index];
              return time.endsWith(":00") || time === "09:30" || time === "11:30" || time === "13:00" || time === "15:00";
            },
          },
          axisLine: {
            lineStyle: { color: "#555" },
          },
        },
      ],
      yAxis: [
        // Upper y-axis for index price changes
        {
          type: "value",
          scale: false,
          min: indexYAxisMin,
          max: indexYAxisMax,
          gridIndex: 0,
          axisPointer: {
            snap: true,
          },
          axisLabel: {
            fontSize: 9,
            color: "#858585",
            formatter: (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`,
          },
          axisLine: {
            lineStyle: { color: "#555" },
          },
          splitLine: {
            lineStyle: { color: "#333", type: "dashed" },
          },
        },
        // Lower y-axis for stock price changes
        {
          type: "value",
          scale: false,
          min: stockYAxisMin,
          max: stockYAxisMax,
          gridIndex: 1,
          axisPointer: {
            snap: true,
          },
          axisLabel: {
            fontSize: 9,
            color: "#858585",
            formatter: (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`,
          },
          axisLine: {
            lineStyle: { color: "#555" },
          },
          splitLine: {
            lineStyle: { color: "#333", type: "dashed" },
          },
        },
        // Volume y-axis for upper area (right side)
        {
          type: "value",
          gridIndex: 0,
          position: "right",
          axisPointer: {
            snap: true,
          },
          axisLabel: {
            show: false, // Hide volume axis labels
            fontSize: 9,
            color: "#858585",
          },
          axisLine: {
            show: false,
          },
          splitLine: {
            show: false,
          },
        },
      ],
      series: [...indexSeries, ...volumeSeries, ...stockSeries],
    };
    // Note: originalPriceMap is created inside useMemo, so it's included in the dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [positions, timeseriesData, currentPrices, previousCloses, indexData, amplificationFactor, fullTradingTimes, BENCHMARK_INDICES, t]);

  if (loading) {
    return (
      <div className="portfolio-timeseries-card">
        <div className="card-loading">{t("app.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portfolio-timeseries-card">
        <div className="card-error">{error}</div>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="portfolio-timeseries-card">
        <div className="card-empty">{t("portfolio.noPositions")}</div>
      </div>
    );
  }

  const hasData = timeseriesData.size > 0 || currentPrices.size > 0;

  return (
    <div className="portfolio-timeseries-card">
      <div className="card-header">
        <h3>{t("portfolio.timeseriesChart")}</h3>
        <div className="card-stats">
          <div className="stat-item">
            <span className="stat-label">{t("portfolio.positions")}</span>
            <span className="stat-value">{positions.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t("portfolio.withData")}</span>
            <span className="stat-value">
              {timeseriesData.size > 0 ? `${timeseriesData.size} (${t("portfolio.historical")})` : `${currentPrices.size} (${t("portfolio.realtime")})`}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t("portfolio.amplificationFactor")}</span>
            <input
              type="number"
              min="0.5"
              max="10"
              step="0.5"
              value={amplificationFactor}
              onChange={(e) => setAmplificationFactor(parseFloat(e.target.value) || 3.5)}
              style={{
                width: "60px",
                padding: "2px 4px",
                fontSize: "12px",
                border: "1px solid var(--border-color)",
                borderRadius: "3px",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>
      </div>
      {hasData ? (
        <div className="card-chart-container">
          <ReactECharts
            option={chartOption}
            style={{ height: "100%", width: "100%" }}
            opts={{ renderer: "canvas" }}
            notMerge={false}
            lazyUpdate={true}
          />
        </div>
      ) : (
        <div className="card-no-data">{t("portfolio.noTimeseriesData")}</div>
      )}
    </div>
  );
};

export default PortfolioTimeseriesCard;
