import React, { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import { stockDataManager } from "../services/StockDataManager";
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
  positions?: PortfolioPosition[];
  timeSeriesData?: Map<string, StockData[]>;
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

const INDEX_SYMBOLS = ["000001", "399001", "000688"];

// Index price range validation
const INDEX_PRICE_RANGES = {
  "000001": { min: 2500, max: 5000 }, // Shanghai Index
  "399001": { min: 7000, max: 15000 }, // Shenzhen Index
  "000688": { min: 500, max: 2000 }, // STAR Index
} as const;

const isValidIndexPrice = (symbol: string, price: number): boolean => {
  const range = INDEX_PRICE_RANGES[symbol as keyof typeof INDEX_PRICE_RANGES];
  if (!range) return price > 0 && isFinite(price);
  return price >= range.min && price <= range.max;
};

// Get reference price for index with fallback logic
const getIndexReferencePrice = (
  symbol: string,
  previousClose: number | undefined,
  firstDataPointPrice: number,
  indexName: string
): number => {
  // Priority 1: Use previous_close if valid
  if (previousClose && previousClose > 0 && isFinite(previousClose) && isValidIndexPrice(symbol, previousClose)) {
    // Check if previous_close and first data point are close (should be similar)
    const tolerance = symbol === "000688" ? 0.3 : 0.2;
    const priceDiff = Math.abs(firstDataPointPrice - previousClose) / Math.max(previousClose, firstDataPointPrice);
    if (priceDiff <= tolerance) {
      return previousClose;
    } else {
      console.warn(`${indexName} (${symbol}): Reference price (${previousClose.toFixed(2)}) differs significantly from first data point (${firstDataPointPrice.toFixed(2)}), diff: ${(priceDiff * 100).toFixed(2)}%. Using first data point as reference.`);
    }
  }
  
  // Priority 2: Use first data point if valid
  if (isValidIndexPrice(symbol, firstDataPointPrice)) {
    if (!previousClose || previousClose <= 0 || !isFinite(previousClose)) {
      console.warn(`${indexName} (${symbol}): previous_close not available, using first data point (${firstDataPointPrice.toFixed(2)}) as reference`);
    }
    return firstDataPointPrice;
  }
  
  // Fallback: return first data point even if invalid (will be skipped later)
  return firstDataPointPrice;
};

// Process time series data into time-indexed map
const processTimeSeriesData = (data: StockData[]): Map<string, { price: number; volume: number }> => {
  const dataMap = new Map<string, { price: number; volume: number }>();
  data.forEach((d) => {
    if (!d.close || d.close <= 0 || !isFinite(d.close)) {
      return; // Skip invalid data points
    }
    const dateStr = d.date;
    let timeStr = dateStr.includes(" ") ? dateStr.split(" ")[1] : dateStr;
    if (timeStr.includes(":")) {
      const parts = timeStr.split(":");
      if (parts.length >= 2) {
        timeStr = `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
      }
    }
    dataMap.set(timeStr, { price: d.close, volume: d.volume || 0 });
  });
  return dataMap;
};

// Process index data and generate chart series
interface ProcessedIndexData {
  normalizedPrices: (number | null)[];
  originalPricesMap: Map<number, number>;
  buyVolumeData: (number | null)[];
  sellVolumeData: (number | null)[];
  maxVolume: number;
  validPrices: number[];
}

const processIndexData = (
  index: { symbol: string; name: string },
  data: StockData[],
  referencePrice: number,
  fullTradingTimes: string[]
): ProcessedIndexData | null => {
  // Process time series data
  const dataMap = processTimeSeriesData(data);
  
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
    if (dataMap.size > 0) {
      const availableTimes = Array.from(dataMap.keys()).slice(0, 10);
      console.debug(`No matching time found for ${index.name}. Available times:`, availableTimes);
    }
    return null;
  }

  // Calculate normalized percentage changes
  const calculateNormalizedChange = (price: number): number => {
    if (!referencePrice || referencePrice <= 0 || !isFinite(referencePrice)) return 0;
    if (!price || price <= 0 || !isFinite(price)) return 0;
    const change = ((price / referencePrice) - 1) * 100;
    if (!isFinite(change)) return 0;
    
    // Clamp extreme values to prevent chart overflow
    const maxChange = index.symbol === "000688" ? 12 : 10;
    return Math.max(-maxChange, Math.min(maxChange, change));
  };

  // Generate normalized prices array
  const originalPricesMap = new Map<number, number>();
  const volumeDataMap = new Map<number, { volume: number; isBuy: boolean }>();
  let lastPrice: number | null = null;
  let previousPrice: number | null = null;
  
  const normalizedPrices: (number | null)[] = fullTradingTimes.map((time, idx) => {
    if (idx < firstValidIndex || idx > lastValidIndex) {
      return null;
    }

    const dataPoint = dataMap.get(time);
    if (dataPoint && dataPoint.price > 0 && isFinite(dataPoint.price)) {
      previousPrice = lastPrice;
      lastPrice = dataPoint.price;
      originalPricesMap.set(idx, dataPoint.price);
      
      const isBuy = previousPrice === null || dataPoint.price >= previousPrice;
      volumeDataMap.set(idx, { volume: dataPoint.volume || 0, isBuy });
      
      const normalizedChange = calculateNormalizedChange(dataPoint.price);
      return isFinite(normalizedChange) ? normalizedChange : null;
    }

    // Fill 13:00 with last morning price for continuity
    if (lastPrice !== null && lastPrice > 0 && isFinite(lastPrice) && time === "13:00" && idx > 0 && idx <= lastValidIndex) {
      originalPricesMap.set(idx, lastPrice);
      volumeDataMap.set(idx, { volume: 0, isBuy: true });
      const normalizedChange = calculateNormalizedChange(lastPrice);
      return isFinite(normalizedChange) ? normalizedChange : null;
    }

    return null;
  });

  const validPrices = normalizedPrices.filter((p): p is number => p !== null && isFinite(p));
  if (validPrices.length === 0) return null;

  // Prepare volume data
  const buyVolumeData: (number | null)[] = [];
  const sellVolumeData: (number | null)[] = [];
  let maxVolume = 0;
  
  normalizedPrices.forEach((price, idx) => {
    const volumeInfo = volumeDataMap.get(idx);
    if (price !== null && volumeInfo && volumeInfo.volume > 0) {
      maxVolume = Math.max(maxVolume, volumeInfo.volume);
      if (volumeInfo.isBuy) {
        buyVolumeData.push(volumeInfo.volume);
        sellVolumeData.push(null);
      } else {
        buyVolumeData.push(null);
        sellVolumeData.push(-volumeInfo.volume);
      }
    } else {
      buyVolumeData.push(null);
      sellVolumeData.push(null);
    }
  });

  return {
    normalizedPrices,
    originalPricesMap,
    buyVolumeData,
    sellVolumeData,
    maxVolume,
    validPrices,
  };
};

const StockComparisonChart: React.FC<StockComparisonChartProps> = ({ 
  onStockSelect: _onStockSelect,
  positions: externalPositions,
  timeSeriesData: externalTimeSeries
}) => {
  const { t } = useTranslation();
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [stockTimeseriesData, setStockTimeseriesData] = useState<Map<string, StockData[]>>(new Map());
  const [indexTimeseriesData, setIndexTimeseriesData] = useState<Map<string, StockData[]>>(new Map());
  const [currentPrices, setCurrentPrices] = useState<Map<string, number>>(new Map());
  const [previousCloses, setPreviousCloses] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [baselineSymbol, setBaselineSymbol] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set());
  const fullTradingTimes = useMemo(() => generateFullTradingTimes(), []);

  // Define benchmark indices - memoized to prevent infinite loops
  const BENCHMARK_INDICES = useMemo(() => [
    { symbol: "000001", name: t("portfolio.shanghaiIndex") || "Shanghai Index" },
    { symbol: "399001", name: t("portfolio.shenzhenIndex") || "Shenzhen Index" },
    { symbol: "000688", name: t("portfolio.starIndex") || "STAR Index" }
  ], [t]);

  const loadData = useCallback(async () => {
    // Only show loading if we don't have external data to rely on initially
    if (!externalPositions && positions.length === 0) {
      setLoading(true);
    }
    setError(null);
    
    try {
      let positionsSource: Array<{id: number, symbol: string, name: string, quantity: number, avgCost: number, currentPrice: number | null}> = [];

      if (externalPositions) {
        positionsSource = externalPositions.map(p => ({
          id: p.id,
          symbol: p.symbol,
          name: p.name,
          quantity: p.quantity,
          avgCost: p.avgCost,
          currentPrice: p.currentPrice
        }));
      } else {
        const rawData = await invoke<Array<[number, string, string, number, number, number | null]>>("get_portfolio_positions");
        positionsSource = rawData.map(([id, symbol, name, quantity, avgCost, currentPrice]) => ({
          id, symbol, name, quantity, avgCost, currentPrice
        }));
      }

      // Fetch all stock data bundles using stockDataManager
      const symbols = positionsSource.map(p => p.symbol);
      const stockDataBundles = await stockDataManager.getBatchStockData(symbols);
      
      // Also fetch index data bundles
      const indexDataBundles = await stockDataManager.getBatchStockData(INDEX_SYMBOLS);

      const positionsWithPrices = positionsSource.map((pos) => {
        const { id, symbol, name, quantity, avgCost, currentPrice } = pos;
        const bundle = stockDataBundles.get(symbol);
        
        let price = currentPrice || avgCost || 0;
        let previousClose: number | undefined = undefined;
        
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

      // Extract stock timeseries data from bundles
      const stockTimeseriesMap = new Map<string, StockData[]>();
      
      // Pre-fill from external if available
      if (externalTimeSeries) {
        externalTimeSeries.forEach((data, symbol) => {
          stockTimeseriesMap.set(symbol, data);
        });
      }

      positionsWithPrices.forEach((position) => {
        if (stockTimeseriesMap.has(position.symbol)) return;
        
        const bundle = stockDataBundles.get(position.symbol);
        if (bundle?.time_series && bundle.time_series.length > 0) {
          stockTimeseriesMap.set(position.symbol, bundle.time_series);
        }
      });
      setStockTimeseriesData(stockTimeseriesMap);

      // Extract index timeseries data from bundles
      const indexTimeseriesMap = new Map<string, StockData[]>();
      INDEX_SYMBOLS.forEach((symbol) => {
        const bundle = indexDataBundles.get(symbol);
        if (bundle?.time_series && bundle.time_series.length > 0) {
          indexTimeseriesMap.set(symbol, bundle.time_series);
        }
        
        // Get previous close for indices
        if (bundle?.quote) {
          const quoteName = bundle.quote.name || "";
          const isCorrectIndex = (() => {
            if (symbol === "000001") return quoteName.includes("上证") || quoteName.includes("指数");
            if (symbol === "399001") return quoteName.includes("深证") || quoteName.includes("指数");
            if (symbol === "000688") return quoteName.includes("科创") || quoteName.includes("指数");
            return true;
          })();

          // Validate and set previous_close
          if (bundle.quote.previous_close && isValidIndexPrice(symbol, bundle.quote.previous_close) && isCorrectIndex) {
            previousClosesMap.set(symbol, bundle.quote.previous_close);
            console.debug(`Index ${symbol} previous close: ${bundle.quote.previous_close.toFixed(2)}`);
          } else if (bundle.quote.price && isValidIndexPrice(symbol, bundle.quote.price) && isCorrectIndex) {
            // Fallback to current price if valid
            console.warn(`Using current price ${bundle.quote.price.toFixed(2)} as reference for ${symbol}`);
            previousClosesMap.set(symbol, bundle.quote.price);
          } else {
            if (!isCorrectIndex) {
              console.warn(`Index ${symbol} quote name mismatch: expected index but got "${quoteName}". Quote:`, bundle.quote);
            } else {
              console.warn(`Index ${symbol} has invalid previous_close. Quote:`, bundle.quote);
            }
          }
        }
      });
      setIndexTimeseriesData(indexTimeseriesMap);
      setPreviousCloses(previousClosesMap);
    } catch (err) {
      console.error("Error loading data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [externalPositions, externalTimeSeries]);

  useEffect(() => {
    loadData();
    
    // Set up periodic refresh (every 30 seconds to match cache TTL)
    const refreshInterval = setInterval(() => {
      loadData();
    }, 30000);
    
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

    // Upper area: Process index data and generate series
    BENCHMARK_INDICES.forEach((index, indexIdx) => {
      const data = indexTimeseriesData.get(index.symbol);
      if (!data || data.length === 0) {
        console.debug(`No data for ${index.name} (${index.symbol})`);
        return;
      }

      // Get first valid data point and validate
      const firstDataPoint = data.find(d => d.close && d.close > 0 && isFinite(d.close));
      if (!firstDataPoint) {
        console.warn(`Skipping ${index.name} (${index.symbol}): no valid time series data`);
        return;
      }
      
      const firstPrice = firstDataPoint.close;
      if (!isValidIndexPrice(index.symbol, firstPrice)) {
        console.warn(`Skipping ${index.name} (${index.symbol}): time series data price (${firstPrice.toFixed(2)}) is out of valid range. This might be wrong data (e.g., stock instead of index).`);
        return;
      }

      // Get reference price with fallback logic
      const previousClose = previousCloses.get(index.symbol);
      const referencePrice = getIndexReferencePrice(index.symbol, previousClose, firstPrice, index.name);

      // Process index data
      const processedData = processIndexData(index, data, referencePrice, fullTradingTimes);
      if (!processedData) {
        return;
      }

      const { normalizedPrices, originalPricesMap, buyVolumeData, sellVolumeData, maxVolume: indexMaxVolume, validPrices } = processedData;

      // Filter out extreme outliers before adding to allIndexPrices
      const filteredPrices = validPrices.filter(p => p >= -50 && p <= 50);
      if (filteredPrices.length === 0) return;
      
      allIndexPrices.push(...filteredPrices);
      legendData.push(index.name);
      originalPriceMap.set(index.name, originalPricesMap);
      maxVolume = Math.max(maxVolume, indexMaxVolume);

      // Add index line with area style
      const indexColor = INDEX_COLORS[indexIdx % INDEX_COLORS.length];
      indexSeries.push({
        name: index.name,
        type: "line",
        data: normalizedPrices,
        symbol: "none",
        lineStyle: {
          color: indexColor,
          width: 2,
          opacity: 0.8,
        },
        areaStyle: {
          color: indexColor,
          opacity: 0.1,
        },
        smooth: false,
        connectNulls: true,
        xAxisIndex: 0,
        yAxisIndex: 0,
        z: 10,
      });

      // Add volume bars (skip for STAR Index)
      if (indexMaxVolume > 0 && index.symbol !== "000688") {
        indexSeries.push({
          name: `${index.name} Buy`,
          type: "bar",
          data: buyVolumeData,
          barWidth: "60%",
          barCategoryGap: "5%",
          itemStyle: { color: "#ff3333", opacity: 0.7 },
          xAxisIndex: 0,
          yAxisIndex: 2,
          silent: true,
          z: 1,
        });

        indexSeries.push({
          name: `${index.name} Sell`,
          type: "bar",
          data: sellVolumeData,
          barWidth: "60%",
          barCategoryGap: "5%",
          itemStyle: { color: "#33ff33", opacity: 0.7 },
          xAxisIndex: 0,
          yAxisIndex: 2,
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
    // Filter out any invalid values before calculating range
    const validIndexPrices = allIndexPrices.filter(p => isFinite(p) && p >= -50 && p <= 50);
    const indexMinPrice = validIndexPrices.length > 0 ? Math.min(...validIndexPrices) : -5;
    const indexMaxPrice = validIndexPrices.length > 0 ? Math.max(...validIndexPrices) : 5;
    const indexPriceRange = indexMaxPrice - indexMinPrice;
    // Ensure reasonable Y-axis range (at least ±1%, max ±50%)
    const indexYAxisMin = Math.max(-50, indexMinPrice - Math.max(indexPriceRange * 0.1, 1));
    const indexYAxisMax = Math.min(50, indexMaxPrice + Math.max(indexPriceRange * 0.1, 1));

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
            color: (value: number) => {
              if (value > 0) return "#ff3333";
              if (value < 0) return "#33ff33";
              return "#858585";
            },
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
            color: (value: number) => {
              if (value > 0) return "#ff3333";
              if (value < 0) return "#33ff33";
              return "#858585";
            },
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
      <div className="chart-controls" style={{ padding: "0 12px 8px", display: "flex", alignItems: "center", gap: "8px" }}>
        <label style={{ fontSize: "12px", color: "#858585" }}>{t("portfolio.baseline") || "Baseline"}: </label>
        <select 
          value={baselineSymbol} 
          onChange={(e) => setBaselineSymbol(e.target.value)}
          style={{ 
            backgroundColor: "#252526", 
            color: "#ccc", 
            border: "1px solid #3e3e42", 
            borderRadius: "3px",
            padding: "2px 4px",
            fontSize: "12px"
          }}
        >
          <option value="">{t("portfolio.none") || "None"}</option>
          <optgroup label={t("sidebar.indices") || "Indices"}>
            {BENCHMARK_INDICES.map(i => <option key={i.symbol} value={i.symbol}>{i.name}</option>)}
          </optgroup>
          <optgroup label={t("portfolio.positions") || "Positions"}>
            {positions.map(p => <option key={p.symbol} value={p.symbol}>{p.name}</option>)}
          </optgroup>
        </select>
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
