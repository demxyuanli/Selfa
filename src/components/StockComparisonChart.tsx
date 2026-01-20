import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import "./StockComparisonChart.css";

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

interface StockComparisonChartProps {
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

const STOCK_LINE_COLORS = [
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

const INDEX_COLORS = ["#ff0000", "#0066ff", "#ff9900"]; // Red for Shanghai, Blue for Shenzhen, Orange for STAR

const StockComparisonChart: React.FC<StockComparisonChartProps> = ({ onStockSelect: _onStockSelect }) => {
  const { t } = useTranslation();
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [stockTimeseriesData, setStockTimeseriesData] = useState<Map<string, StockData[]>>(new Map());
  const [indexTimeseriesData, setIndexTimeseriesData] = useState<Map<string, StockData[]>>(new Map());
  const [currentPrices, setCurrentPrices] = useState<Map<string, number>>(new Map());
  const [previousCloses, setPreviousCloses] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set());
  const fullTradingTimes = useMemo(() => generateFullTradingTimes(), []);

  // Cache for timeseries data and prices
  const cacheRef = useRef<{
    stockTimeseries: Map<string, { data: StockData[]; timestamp: number }>;
    indexTimeseries: Map<string, { data: StockData[]; timestamp: number }>;
    prices: Map<string, { price: number; timestamp: number }>;
    previousCloses: Map<string, { price: number; timestamp: number }>;
  }>({
    stockTimeseries: new Map(),
    indexTimeseries: new Map(),
    prices: new Map(),
    previousCloses: new Map(),
  });

  const CACHE_TTL = 30000; // 30 seconds cache TTL

  // Define benchmark indices - memoized to prevent infinite loops
  const BENCHMARK_INDICES = useMemo(() => [
    { symbol: "000001", name: t("portfolio.shanghaiIndex") || "Shanghai Index" },
    { symbol: "399001", name: t("portfolio.shenzhenIndex") || "Shenzhen Index" },
    { symbol: "000688", name: t("portfolio.starIndex") || "STAR Index" }
  ], [t]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const now = Date.now();
    
    try {
      const positionsData: Array<[number, string, string, number, number, number | null]> =
        await invoke("get_portfolio_positions");

      const positionsWithPrices = await Promise.all(
        positionsData.map(async ([id, symbol, name, quantity, avgCost, currentPrice]) => {
          let price = currentPrice || avgCost;
          let previousClose: number | undefined = undefined;
          
          // Check cache for price data
          const cachedPrice = cacheRef.current.prices.get(symbol);
          const cachedPreviousClose = cacheRef.current.previousCloses.get(symbol);
          
          if (cachedPrice && (now - cachedPrice.timestamp) < CACHE_TTL) {
            price = cachedPrice.price;
          } else {
            try {
              const quote = await invoke<any>("get_stock_quote", { symbol });
              if (quote) {
                if (quote.price && quote.price > 0) {
                  price = quote.price;
                } else if (quote.previous_close && quote.previous_close > 0) {
                  price = quote.previous_close;
                }
                previousClose = quote.previous_close;
                // Update cache
                cacheRef.current.prices.set(symbol, { price, timestamp: now });
                if (previousClose) {
                  cacheRef.current.previousCloses.set(symbol, { price: previousClose, timestamp: now });
                }
              }
            } catch (err) {
              console.debug("Failed to fetch quote for", symbol, err);
              // Use cached data if available even if expired
              if (cachedPrice) {
                price = cachedPrice.price;
              }
              if (cachedPreviousClose) {
                previousClose = cachedPreviousClose.price;
              }
            }
          }
          
          // Check cache for previous close if not already set
          if (!previousClose && cachedPreviousClose && (now - cachedPreviousClose.timestamp) < CACHE_TTL) {
            previousClose = cachedPreviousClose.price;
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
        })
      );

      setPositions(positionsWithPrices);
      
      // Initialize selected stocks - select all by default, but preserve existing selections
      setSelectedStocks(prev => {
        const newSet = new Set<string>();
        positionsWithPrices.forEach(p => {
          // If stock was previously selected, keep it selected; otherwise select by default
          if (prev.has(p.symbol)) {
            newSet.add(p.symbol);
          } else {
            newSet.add(p.symbol); // Select all by default
          }
        });
        return newSet;
      });

      const pricesMap = new Map<string, number>();
      const previousClosesMap = new Map<string, number>();
      positionsWithPrices.forEach((position) => {
        pricesMap.set(position.symbol, position.currentPrice);
        if (position.previousClose) {
          previousClosesMap.set(position.symbol, position.previousClose);
        }
      });
      setCurrentPrices(pricesMap);
      setPreviousCloses(previousClosesMap);

      // Fetch stock timeseries data with cache
      const stockTimeseriesMap = new Map<string, StockData[]>();
      await Promise.all(
        positionsWithPrices.map(async (position) => {
          const cached = cacheRef.current.stockTimeseries.get(position.symbol);
          if (cached && (now - cached.timestamp) < CACHE_TTL) {
            stockTimeseriesMap.set(position.symbol, cached.data);
          } else {
            try {
              const tsData = await invoke<StockData[]>("get_time_series", {
                symbol: position.symbol,
              });
              if (tsData && tsData.length > 0) {
                stockTimeseriesMap.set(position.symbol, tsData);
                cacheRef.current.stockTimeseries.set(position.symbol, { data: tsData, timestamp: now });
              } else if (cached) {
                // Use cached data if new fetch returns empty
                stockTimeseriesMap.set(position.symbol, cached.data);
              }
            } catch (err) {
              console.debug("Failed to fetch timeseries for", position.symbol, err);
              // Use cached data if available
              if (cached) {
                stockTimeseriesMap.set(position.symbol, cached.data);
              }
            }
          }
        })
      );
      setStockTimeseriesData(stockTimeseriesMap);

      // Fetch index timeseries data with cache
      const indexTimeseriesMap = new Map<string, StockData[]>();
      await Promise.all(
        BENCHMARK_INDICES.map(async (index) => {
          const cached = cacheRef.current.indexTimeseries.get(index.symbol);
          if (cached && (now - cached.timestamp) < CACHE_TTL) {
            indexTimeseriesMap.set(index.symbol, cached.data);
          } else {
            try {
              const indexData = await invoke<StockData[]>("get_time_series", {
                symbol: index.symbol,
              });
              if (indexData && indexData.length > 0) {
                indexTimeseriesMap.set(index.symbol, indexData);
                cacheRef.current.indexTimeseries.set(index.symbol, { data: indexData, timestamp: now });
              } else if (cached) {
                // Use cached data if new fetch returns empty
                indexTimeseriesMap.set(index.symbol, cached.data);
              }
            } catch (err) {
              console.debug("Failed to fetch timeseries for index", index.symbol, err);
              // Use cached data if available
              if (cached) {
                indexTimeseriesMap.set(index.symbol, cached.data);
              }
            }
          }
          
          // Also get previous close for indices (with cache)
          const cachedPreviousClose = cacheRef.current.previousCloses.get(index.symbol);
          if (!cachedPreviousClose || (now - cachedPreviousClose.timestamp) >= CACHE_TTL) {
            try {
              const quote = await invoke<any>("get_stock_quote", { symbol: index.symbol });
              if (quote && quote.previous_close) {
                previousClosesMap.set(index.symbol, quote.previous_close);
                cacheRef.current.previousCloses.set(index.symbol, { price: quote.previous_close, timestamp: now });
              }
            } catch (err) {
              console.debug("Failed to fetch quote for index", index.symbol, err);
              // Use cached data if available
              if (cachedPreviousClose) {
                previousClosesMap.set(index.symbol, cachedPreviousClose.price);
              }
            }
          } else {
            previousClosesMap.set(index.symbol, cachedPreviousClose.price);
          }
        })
      );
      setIndexTimeseriesData(indexTimeseriesMap);
      setPreviousCloses(previousClosesMap);
    } catch (err) {
      console.error("Error loading data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [BENCHMARK_INDICES]);

  useEffect(() => {
    loadData();
    
    // Set up periodic refresh (every 30 seconds to match cache TTL)
    const refreshInterval = setInterval(() => {
      loadData();
    }, CACHE_TTL);
    
    return () => {
      clearInterval(refreshInterval);
    };
  }, [loadData]);

  const chartOption = useMemo(() => {
    if (positions.length === 0) {
      return {};
    }

    const indexSeries: any[] = [];
    const stockSeries: any[] = [];
    const legendData: string[] = [];
    let allIndexPrices: number[] = [];
    let allStockPrices: number[] = [];
    let maxVolume = 0;
    const originalPriceMap = new Map<string, Map<number, number>>();

    // Upper area: Index lines with area style
    BENCHMARK_INDICES.forEach((index, indexIdx) => {
      const data = indexTimeseriesData.get(index.symbol);
      if (!data || data.length === 0) return;

      // Use previous close as reference price
      let referencePrice = previousCloses.get(index.symbol);
      if (!referencePrice && data && data.length > 0) {
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

      // Calculate normalized percentage changes (normalize to 0% or 100%)
      const calculateNormalizedChange = (price: number): number => {
        if (!referencePrice || referencePrice === 0) return 0;
        return ((price / referencePrice) - 1) * 100;
      };

      // Find first and last valid data point indices
      let firstValidIndex = -1;
      let lastValidIndex = -1;
      for (let i = 0; i < fullTradingTimes.length; i++) {
        if (dataMap.has(fullTradingTimes[i])) {
          if (firstValidIndex === -1) {
            firstValidIndex = i;
          }
          lastValidIndex = i;
        }
      }
      if (firstValidIndex === -1) {
        // Debug: log available times if no match found
        if (dataMap.size > 0) {
          const availableTimes = Array.from(dataMap.keys()).slice(0, 10);
          console.debug(`No matching time found for ${index.name}. Available times:`, availableTimes);
          console.debug("Looking for times starting with:", fullTradingTimes.slice(0, 10));
        }
        return;
      }

      const originalPricesMap = new Map<number, number>();
      const volumeDataMap = new Map<number, { volume: number; isBuy: boolean }>();
      let lastPrice: number | null = null;
      let previousPrice: number | null = null;
      const normalizedPrices: (number | null)[] = fullTradingTimes.map((time, idx) => {
        // Don't show data before first valid data point or after last valid data point
        if (idx < firstValidIndex || idx > lastValidIndex) {
          return null;
        }

        const dataPoint = dataMap.get(time);
        if (dataPoint) {
          previousPrice = lastPrice;
          lastPrice = dataPoint.price;
          originalPricesMap.set(idx, dataPoint.price);
          
          // Determine buy/sell based on price change
          const isBuy = previousPrice === null || dataPoint.price >= previousPrice;
          volumeDataMap.set(idx, { volume: dataPoint.volume, isBuy });
          
          return calculateNormalizedChange(dataPoint.price);
        }

        // Only fill 13:00 with last morning price for continuity
        if (lastPrice !== null && time === "13:00" && idx > 0 && idx <= lastValidIndex) {
          originalPricesMap.set(idx, lastPrice);
          // For 13:00, use neutral volume (no buy/sell distinction)
          volumeDataMap.set(idx, { volume: 0, isBuy: true });
          return calculateNormalizedChange(lastPrice);
        }

        return null;
      });

      const validPrices = normalizedPrices.filter((p): p is number => p !== null);
      if (validPrices.length === 0) return;

      allIndexPrices.push(...validPrices);
      legendData.push(index.name);
      originalPriceMap.set(index.name, originalPricesMap);

      // Prepare volume data for buy/sell bars
      // Buy volume: positive (up), Sell volume: negative (down)
      const buyVolumeData: (number | null)[] = [];
      const sellVolumeData: (number | null)[] = [];
      let indexMaxVolume = 0;
      
      normalizedPrices.forEach((price, idx) => {
        const volumeInfo = volumeDataMap.get(idx);
        if (price !== null && volumeInfo && volumeInfo.volume > 0) {
          indexMaxVolume = Math.max(indexMaxVolume, volumeInfo.volume);
          if (volumeInfo.isBuy) {
            buyVolumeData.push(volumeInfo.volume); // Positive, shows upward
            sellVolumeData.push(null);
          } else {
            buyVolumeData.push(null);
            sellVolumeData.push(-volumeInfo.volume); // Negative, shows downward
          }
        } else {
          buyVolumeData.push(null);
          sellVolumeData.push(null);
        }
      });
      
      // Update global max volume
      maxVolume = Math.max(maxVolume, indexMaxVolume);

      // Add index line with area style
      indexSeries.push({
        name: index.name,
        type: "line",
        data: normalizedPrices,
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

      // Add buy volume bars (red, when price goes up)
      if (indexMaxVolume > 0) {
        indexSeries.push({
          name: `${index.name} Buy`,
          type: "bar",
          data: buyVolumeData,
          barWidth: "60%",
          barCategoryGap: "5%",
          itemStyle: {
            color: "#ff3333",
            opacity: 0.7,
          },
          xAxisIndex: 0,
          yAxisIndex: 2, // Use right Y-axis for volume
          silent: true,
          z: 1,
        });

        // Add sell volume bars (green, when price goes down)
        indexSeries.push({
          name: `${index.name} Sell`,
          type: "bar",
          data: sellVolumeData,
          barWidth: "60%",
          barCategoryGap: "5%",
          itemStyle: {
            color: "#33ff33",
            opacity: 0.7,
          },
          xAxisIndex: 0,
          yAxisIndex: 2, // Use right Y-axis for volume
          silent: true,
          z: 1,
        });
      }
    });

    // Lower area: Stock normalized percentage lines
    positions.forEach((position, index) => {
      // Skip if stock is not selected
      if (!selectedStocks.has(position.symbol)) {
        return;
      }
      const data = stockTimeseriesData.get(position.symbol);
      const currentPrice = currentPrices.get(position.symbol);
      const previousClose = previousCloses.get(position.symbol);
      
      if ((!data || data.length === 0) && !currentPrice) return;
      
      // Use previous close as reference, fallback to first historical price or current price
      let referencePrice = previousClose;
      if (!referencePrice && data && data.length > 0) {
        referencePrice = data[0].close;
      }
      if (!referencePrice && currentPrice) {
        referencePrice = currentPrice;
      }
      if (!referencePrice) return;

      // Calculate normalized percentage changes (normalize to 0% or 100%)
      const calculateNormalizedChange = (price: number): number => {
        if (!referencePrice || referencePrice === 0) return 0;
        return ((price / referencePrice) - 1) * 100;
      };

      // If no historical data, create a minimal line from current price
      if (!data || data.length === 0) {
        if (!currentPrice) return;
        
        const normalizedCurrent = calculateNormalizedChange(currentPrice);
        const prices: (number | null)[] = fullTradingTimes.map((_, idx) => {
          if (idx >= fullTradingTimes.length - 5) {
            return normalizedCurrent;
          }
          return null;
        });

        allStockPrices.push(normalizedCurrent);
        const color = STOCK_LINE_COLORS[index % STOCK_LINE_COLORS.length];
        const label = `${position.symbol} ${position.name}`;
        legendData.push(label);

        const noDataOriginalPricesMap = new Map<number, number>();
        prices.forEach((p, idx) => {
          if (p !== null) {
            noDataOriginalPricesMap.set(idx, currentPrice);
          }
        });
        originalPriceMap.set(label, noDataOriginalPricesMap);

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
        return;
      }

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

      // Find first and last valid data point indices
      let firstValidIndex = -1;
      let lastValidDataIndex = -1;
      for (let i = 0; i < fullTradingTimes.length; i++) {
        if (dataMap.has(fullTradingTimes[i])) {
          if (firstValidIndex === -1) {
            firstValidIndex = i;
          }
          lastValidDataIndex = i;
        }
      }
      if (firstValidIndex === -1) {
        // Debug: log available times if no match found
        if (dataMap.size > 0) {
          const availableTimes = Array.from(dataMap.keys()).slice(0, 10);
          console.debug(`No matching time found for ${position.symbol}. Available times:`, availableTimes);
          console.debug("Looking for times starting with:", fullTradingTimes.slice(0, 10));
        }
        // If no historical data but have current price, use last few time points
        if (currentPrice) {
          const normalizedCurrent = calculateNormalizedChange(currentPrice);
          const prices: (number | null)[] = fullTradingTimes.map((_, idx) => {
            if (idx >= fullTradingTimes.length - 5) {
              return normalizedCurrent;
            }
            return null;
          });
          allStockPrices.push(normalizedCurrent);
          const color = STOCK_LINE_COLORS[index % STOCK_LINE_COLORS.length];
          const label = `${position.symbol} ${position.name}`;
          legendData.push(label);
          const noDataOriginalPricesMap = new Map<number, number>();
          prices.forEach((p, idx) => {
            if (p !== null) {
              noDataOriginalPricesMap.set(idx, currentPrice);
            }
          });
          originalPriceMap.set(label, noDataOriginalPricesMap);
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
            connectNulls: false,
            xAxisIndex: 1,
            yAxisIndex: 1,
          });
        }
        return;
      }

      const originalPricesMap = new Map<number, number>();
      let lastPrice: number | null = null;
      const normalizedPrices: (number | null)[] = fullTradingTimes.map((time, idx) => {
        // Don't show data before first valid data point or after last valid data point
        if (idx < firstValidIndex || idx > lastValidDataIndex) {
          return null;
        }

        const dataPoint = dataMap.get(time);
        if (dataPoint) {
          lastPrice = dataPoint.price;
          originalPricesMap.set(idx, dataPoint.price);
          return calculateNormalizedChange(dataPoint.price);
        }
        
        // Only fill 13:00 with last morning price for continuity
        if (lastPrice !== null && time === "13:00" && idx > 0 && idx <= lastValidDataIndex) {
          originalPricesMap.set(idx, lastPrice);
          return calculateNormalizedChange(lastPrice);
        }
        
        return null;
      });

      // Update the last valid data point with current price if available
      // This ensures we show the most recent price without extending beyond actual data
      if (currentPrice && lastValidDataIndex >= 0 && lastValidDataIndex < normalizedPrices.length) {
        const normalizedCurrent = calculateNormalizedChange(currentPrice);
        // Only update if the last valid data point exists and current price is different
        if (normalizedPrices[lastValidDataIndex] !== normalizedCurrent) {
          normalizedPrices[lastValidDataIndex] = normalizedCurrent;
          originalPricesMap.set(lastValidDataIndex, currentPrice);
        }
      }

      const validPrices = normalizedPrices.filter((p): p is number => p !== null);
      if (validPrices.length === 0) return;

      allStockPrices.push(...validPrices);
      const color = STOCK_LINE_COLORS[index % STOCK_LINE_COLORS.length];
      const label = `${position.symbol} ${position.name}`;
      legendData.push(label);
      originalPriceMap.set(label, originalPricesMap);

      // Calculate which points to show labels
      // Show labels at key points and periodically for progressive display
      const labelShowMap = new Map<number, boolean>();
      if (validPrices.length > 0) {
        const maxValue = Math.max(...validPrices);
        const minValue = Math.min(...validPrices);
        // Show labels more frequently for progressive display (every 5-10 points depending on data length)
        const labelInterval = Math.max(5, Math.floor(validPrices.length / 15)); // Show ~15 labels max
        
        normalizedPrices.forEach((value, idx) => {
          if (value !== null && idx >= firstValidIndex && idx <= lastValidDataIndex) {
            const isFirst = idx === firstValidIndex;
            const isLast = idx === lastValidDataIndex;
            const isMax = value === maxValue;
            const isMin = value === minValue;
            const relativeIndex = idx - firstValidIndex;
            const isIntervalPoint = relativeIndex % labelInterval === 0;
            
            // Show label at first point, last point, max point, min point, and interval points
            if (isFirst || isLast || isMax || isMin || isIntervalPoint) {
              labelShowMap.set(idx, true);
            }
          }
        });
      }

      stockSeries.push({
        name: label,
        type: "line",
        data: normalizedPrices,
        symbol: "circle",
        symbolSize: 4,
        label: {
          show: (params: any) => {
            const dataIndex = params.dataIndex;
            return labelShowMap.get(dataIndex) === true;
          },
          formatter: (params: any) => {
            const dataIndex = params.dataIndex;
            const value = params.value;
            if (value === null || value === undefined) return "";
            const originalPrice = originalPricesMap.get(dataIndex);
            if (originalPrice !== undefined) {
              const changePercent = typeof value === "number" ? value : 0;
              return `¥${originalPrice.toFixed(2)}\n${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`;
            }
            return "";
          },
          position: "top",
          fontSize: 9,
          color: color,
          backgroundColor: "rgba(30, 30, 30, 0.8)",
          borderColor: color,
          borderWidth: 1,
          borderRadius: 3,
          padding: [2, 4],
          distance: 8,
        },
        lineStyle: {
          color: color,
          width: 1.5,
        },
        smooth: false,
        connectNulls: true,
        xAxisIndex: 1,
        yAxisIndex: 1,
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
        // Upper grid for indices
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
            if (param.value !== null && param.value !== undefined) {
              const value = typeof param.value === "number" ? param.value : 0;
              const color = param.color || "#ccc";
              const seriesOriginalPrices = originalPriceMap.get(param.seriesName);
              const originalPrice = seriesOriginalPrices?.get(dataIndex);
              
              result += `<div style="margin: 2px 0;">
                <span style="display: inline-block; width: 10px; height: 10px; background-color: ${color}; margin-right: 6px; border-radius: 2px;"></span>
                ${param.seriesName}: `;
              
              if (originalPrice !== null && originalPrice !== undefined) {
                result += `<span style="font-weight: 600;">¥${originalPrice.toFixed(2)}</span> `;
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
        selectedMode: false, // Disable legend click to toggle series
      },
      xAxis: [
        // Upper x-axis for indices
        {
          type: "category",
          data: fullTradingTimes,
          boundaryGap: false,
          gridIndex: 0,
          axisLabel: {
            show: false,
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
        // Upper y-axis for index percentage changes
        {
          type: "value",
          scale: false,
          min: indexYAxisMin,
          max: indexYAxisMax,
          gridIndex: 0,
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
        // Lower y-axis for stock percentage changes
        {
          type: "value",
          scale: false,
          min: stockYAxisMin,
          max: stockYAxisMax,
          gridIndex: 1,
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
          min: maxVolume > 0 ? -maxVolume * 1.2 : undefined,
          max: maxVolume > 0 ? maxVolume * 1.2 : undefined,
          axisLabel: {
            show: false,
            fontSize: 9,
            color: "#858585",
            formatter: (value: number) => {
              const absValue = Math.abs(value);
              if (absValue >= 1000000000) return `${(absValue / 1000000000).toFixed(1)}B`;
              if (absValue >= 1000000) return `${(absValue / 1000000).toFixed(1)}M`;
              if (absValue >= 1000) return `${(absValue / 1000).toFixed(1)}K`;
              return absValue.toFixed(0);
            },
          },
          axisLine: {
            show: false,
          },
          splitLine: {
            show: true,
            lineStyle: { color: "#333", type: "dashed" },
          },
        },
      ],
      series: [...indexSeries, ...stockSeries],
    };
  }, [positions, stockTimeseriesData, indexTimeseriesData, currentPrices, previousCloses, fullTradingTimes, BENCHMARK_INDICES, selectedStocks, t]);

  if (loading) {
    return (
      <div className="stock-comparison-chart">
        <div className="chart-loading">{t("app.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stock-comparison-chart">
        <div className="chart-error">{error}</div>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="stock-comparison-chart">
        <div className="chart-empty">{t("portfolio.noPositions")}</div>
      </div>
    );
  }

  const hasData = stockTimeseriesData.size > 0 || currentPrices.size > 0;

  return (
    <div className="stock-comparison-chart">
      <div className="chart-header">
        <h3>{t("portfolio.stockComparisonChart") || "Stock Comparison Chart"}</h3>
        <div className="chart-stats">
          <div className="stat-item">
            <span className="stat-label">{t("portfolio.positions")}</span>
            <span className="stat-value">{positions.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t("portfolio.withData")}</span>
            <span className="stat-value">
              {stockTimeseriesData.size > 0 ? `${stockTimeseriesData.size} (${t("portfolio.historical")})` : `${currentPrices.size} (${t("portfolio.realtime")})`}
            </span>
          </div>
        </div>
      </div>
      <div className="chart-content-wrapper">
        <div className="chart-stock-list">
          <div className="stock-list-header">
            <span>{t("portfolio.positions")}</span>
          </div>
          <div className="stock-list-content">
            {positions.map((position) => {
              const currentPrice = currentPrices.get(position.symbol);
              const previousClose = previousCloses.get(position.symbol);
              const changePercent = previousClose && currentPrice 
                ? ((currentPrice / previousClose) - 1) * 100 
                : 0;
              const isSelected = selectedStocks.has(position.symbol);
              
              return (
                <div
                  key={position.symbol}
                  className={`chart-stock-item ${isSelected ? "selected" : ""}`}
                  onClick={(e) => {
                    // Handle checkbox click
                    if ((e.target as HTMLElement).closest('.stock-checkbox')) {
                      e.stopPropagation();
                      setSelectedStocks(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(position.symbol)) {
                          newSet.delete(position.symbol);
                        } else {
                          newSet.add(position.symbol);
                        }
                        return newSet;
                      });
                    } else {
                      // Handle stock select
                      if (_onStockSelect) {
                        _onStockSelect(position.symbol, position.name);
                      }
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    className="stock-checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedStocks(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(position.symbol)) {
                          newSet.delete(position.symbol);
                        } else {
                          newSet.add(position.symbol);
                        }
                        return newSet;
                      });
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="chart-stock-symbol">{position.symbol}</div>
                  <div className="chart-stock-name">{position.name}</div>
                  {currentPrice && (
                    <div className="chart-stock-price-info">
                      <div className={`chart-stock-price ${changePercent >= 0 ? "up" : "down"}`}>
                        ¥{currentPrice.toFixed(2)}
                      </div>
                      <div className={`chart-stock-change ${changePercent >= 0 ? "up" : "down"}`}>
                        {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="chart-main-content">
          {hasData ? (
            <div className="chart-chart-container">
              <ReactECharts
                option={chartOption}
                style={{ height: "100%", width: "100%" }}
                opts={{ renderer: "canvas" }}
                notMerge={true}
                lazyUpdate={false}
              />
            </div>
          ) : (
            <div className="chart-no-data">{t("portfolio.noTimeseriesData")}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockComparisonChart;
