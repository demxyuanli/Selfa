import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useAlert } from "../contexts/AlertContext";
import { stockDataManager } from "../services/StockDataManager";
import { useTradingHoursTimeseriesRefresh } from "../hooks/useTradingHoursTimeseriesRefresh";
import { separateStocksAndIndices } from "../utils/stockUtils";
import Icon from "./Icon";
import AddTransactionDialog from "./PortfolioManagement/dialogs/AddTransactionDialog";
import PriceAlertDialog from "./PriceAlertDialog";
import TimeSeriesThumbnail from "./TimeSeriesThumbnail";
import StockComparisonChart from "./StockComparisonChart";
import "./FavoritesDashboard.css";

interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
}

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap?: number;
  high: number;
  low: number;
  open: number;
  previous_close: number;
}

interface PriceAlertInfo {
  id: number;
  symbol: string;
  threshold_price: number;
  direction: string;
  enabled: boolean;
  triggered: boolean;
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
}

interface FavoritesDashboardProps {
  onStockSelect?: (symbol: string, name: string) => void;
}

const FavoritesDashboard: React.FC<FavoritesDashboardProps> = ({ onStockSelect }) => {
  const { t } = useTranslation();
  const { showAlert, showConfirm } = useAlert();
  const [stocks, setStocks] = useState<Array<{ stock: StockInfo; quote: StockQuote | null }>>([]);
  const [alerts, setAlerts] = useState<PriceAlertInfo[]>([]);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>("stocks");
  const [editingStock, setEditingStock] = useState<{ symbol: string; name: string } | null>(null);
  const [customNames, setCustomNames] = useState<Map<string, string>>(new Map());
  const [showAddStock, setShowAddStock] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showAddTransactionDialog, setShowAddTransactionDialog] = useState(false);
  const [transactions, setTransactions] = useState<Array<{
    id: number;
    symbol: string;
    name?: string;
    transactionType: "buy" | "sell";
    quantity: number;
    price: number;
    amount: number;
    commission: number;
    transactionDate: string;
    notes?: string;
  }>>([]);
  const [expandedPositionSymbol, setExpandedPositionSymbol] = useState<string | null>(null);
  const [showPriceAlertDialog, setShowPriceAlertDialog] = useState(false);
  const [priceAlertSymbol, setPriceAlertSymbol] = useState<string>("");
  const [priceAlertCurrentPrice, setPriceAlertCurrentPrice] = useState<number>(0);
  const [triggeredAlertSymbols, setTriggeredAlertSymbols] = useState<Set<string>>(new Set());
  const [timeSeriesDataMap, setTimeSeriesDataMap] = useState<Map<string, Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>>>(new Map());
  const [columnWidths, setColumnWidths] = useState<Map<number, number>>(new Map());
  const [resizingColumn, setResizingColumn] = useState<number | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);
  const [sortField, setSortField] = useState<"changePercent" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [activeTab, setActiveTab] = useState<"stocks" | "indices">("stocks");

  // Load intraday time series data for stocks using stockDataManager
  // Incremental update: only update changed time series data
  const loadTimeSeriesData = useCallback(async (symbols: string[], forceRefresh = false) => {
    if (symbols.length === 0) {
      return;
    }
    try {
      // Clear cache if force refresh
      if (forceRefresh) {
        for (const symbol of symbols) {
          stockDataManager.clearCache(symbol);
        }
      }
      // Use stockDataManager to get intraday data
      const bundles = await stockDataManager.getBatchStockData(symbols, forceRefresh);
      const missingSymbols: string[] = [];
      
      setTimeSeriesDataMap(prev => {
        const newMap = new Map(prev);
        let hasChanges = false;
        
        for (const [symbol, bundle] of bundles.entries()) {
          if (bundle?.intraday && bundle.intraday.length > 0) {
            const oldData = prev.get(symbol);
            // Only update if data changed (compare last data point)
            if (!oldData || oldData.length === 0) {
              newMap.set(symbol, bundle.intraday);
              hasChanges = true;
            } else {
              const oldLast = oldData[oldData.length - 1];
              const newLast = bundle.intraday[bundle.intraday.length - 1];
              // Update if last data point changed or length changed significantly
              if (
                oldLast.date !== newLast.date ||
                oldLast.close !== newLast.close ||
                Math.abs(oldData.length - bundle.intraday.length) > 1
              ) {
                newMap.set(symbol, bundle.intraday);
                hasChanges = true;
              } else {
                // Keep old reference to avoid re-render
                newMap.set(symbol, oldData);
              }
            }
            console.debug(`Loaded intraday data for ${symbol}:`, {
              count: bundle.intraday.length,
              first: bundle.intraday[0],
              last: bundle.intraday[bundle.intraday.length - 1]
            });
          } else if (!bundle || !bundle.quote) {
            missingSymbols.push(symbol);
          }
        }
        
        // Only return new map if there were changes
        return hasChanges ? newMap : prev;
      });
      
      // Retry missing symbols individually
      if (missingSymbols.length > 0) {
        for (const symbol of missingSymbols) {
          try {
            const bundle = await stockDataManager.getStockData(symbol, true);
            if (bundle?.intraday && bundle.intraday.length > 0) {
              setTimeSeriesDataMap(prev => {
                const oldData = prev.get(symbol);
                // Only update if changed
                if (!oldData || oldData.length === 0) {
                  const newMap = new Map(prev);
                  newMap.set(symbol, bundle.intraday);
                  return newMap;
                }
                const oldLast = oldData[oldData.length - 1];
                const newLast = bundle.intraday[bundle.intraday.length - 1];
                if (
                  oldLast.date !== newLast.date ||
                  oldLast.close !== newLast.close ||
                  Math.abs(oldData.length - bundle.intraday.length) > 1
                ) {
                  const newMap = new Map(prev);
                  newMap.set(symbol, bundle.intraday);
                  return newMap;
                }
                return prev; // No change
              });
            }
          } catch (err) {
            console.debug(`Failed to retry intraday data for ${symbol}:`, err);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load batch intraday time series:", err);
    }
  }, []);

  // Load initial data (only once on mount)
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stocksData, alertsData, positionsData] = await Promise.all([
        invoke<Array<[StockInfo, StockQuote | null]>>("get_all_favorites_quotes"),
        invoke<PriceAlertInfo[]>("get_price_alerts", { symbol: null }),
        invoke<Array<[number, string, string, number, number, number | null]>>("get_portfolio_positions"),
      ]);

      const updatedStocks = stocksData.map(([stock, quote]) => ({
        stock,
        quote,
      }));
      setStocks(updatedStocks);
      
      // Set loading to false first to show stock list immediately
      setLoading(false);
      
      // Load intraday time series data asynchronously after UI is displayed (delayed loading)
      // This improves perceived performance by showing stock list first
      const symbols = updatedStocks.map(({ stock }) => stock.symbol);
      // Use setTimeout to defer loading after UI render
      setTimeout(() => {
        loadTimeSeriesData(symbols);
      }, 100);

      const activeAlerts = alertsData.filter((alert) => alert.enabled);
      setAlerts(activeAlerts);
      
      const triggered = alertsData.filter((alert) => alert.triggered).map((alert) => alert.symbol);
      setTriggeredAlertSymbols(new Set(triggered));

      // Fetch all stock data bundles using stockDataManager
      const positionSymbols = positionsData.map(([_, symbol]) => symbol);
      const stockBundles = await stockDataManager.getBatchStockData(positionSymbols);
      
      const positionsWithPrices = positionsData.map(([id, symbol, name, quantity, avgCost, currentPrice]) => {
        const bundle = stockBundles.get(symbol);
        let price = currentPrice || avgCost;
        
        // Get price from bundle
        if (bundle?.quote) {
          if (bundle.quote.price && bundle.quote.price > 0) {
            price = bundle.quote.price;
          } else if (bundle.quote.previous_close && bundle.quote.previous_close > 0) {
            price = bundle.quote.previous_close;
          }
        }
        
        // Fallback to time series if quote doesn't have valid data
        if ((!price || price === avgCost || price <= 0) && bundle?.time_series && bundle.time_series.length > 0) {
          const latestData = bundle.time_series[bundle.time_series.length - 1];
          if (latestData.close && latestData.close > 0) {
            price = latestData.close;
          }
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
        } as PortfolioPosition;
      });
      setPositions(positionsWithPrices);
    } catch (err) {
      console.error("Error loading initial data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
      setLoading(false);
    }
    // Note: loading is set to false earlier after stocks are loaded for better UX
  }, [loadTimeSeriesData]);

  // Independent async refresh functions for each data type
  // Incremental update: only update changed quotes without re-rendering entire list
  const refreshStocks = useCallback(async () => {
    try {
      const stocksData = await invoke<Array<[StockInfo, StockQuote | null]>>("get_all_favorites_quotes");
      const newStocksMap = new Map<string, { stock: StockInfo; quote: StockQuote | null }>();
      
      // Build map of new data
      stocksData.forEach(([stock, quote]) => {
        newStocksMap.set(stock.symbol, { stock, quote });
      });

      // Incremental update: only update changed items
      setStocks(prevStocks => {
        const updatedStocks = prevStocks.map(item => {
          const newData = newStocksMap.get(item.stock.symbol);
          if (!newData) {
            // Stock removed, keep old data (will be filtered out if needed)
            return item;
          }
          
          // Check if quote changed
          const oldQuote = item.quote;
          const newQuote = newData.quote;
          
          if (oldQuote === null && newQuote === null) {
            return item; // No change
          }
          if (oldQuote === null || newQuote === null) {
            return newData; // Quote status changed
          }
          
          // Compare quote values
          if (
            oldQuote.price !== newQuote.price ||
            oldQuote.change !== newQuote.change ||
            oldQuote.change_percent !== newQuote.change_percent ||
            oldQuote.volume !== newQuote.volume ||
            oldQuote.high !== newQuote.high ||
            oldQuote.low !== newQuote.low ||
            oldQuote.open !== newQuote.open ||
            oldQuote.previous_close !== newQuote.previous_close
          ) {
            return newData; // Quote changed
          }
          
          // Check if stock info changed
          if (
            item.stock.name !== newData.stock.name ||
            item.stock.exchange !== newData.stock.exchange
          ) {
            return newData; // Stock info changed
          }
          
          return item; // No change, keep old reference
        });

        // Add new stocks that weren't in previous list
        const existingSymbols = new Set(prevStocks.map(s => s.stock.symbol));
        const newStocks = Array.from(newStocksMap.values()).filter(
          item => !existingSymbols.has(item.stock.symbol)
        );
        
        if (newStocks.length > 0) {
          return [...updatedStocks, ...newStocks];
        }
        
        return updatedStocks;
      });

      // Load time series data for all stocks (async, non-blocking)
      const symbols = Array.from(newStocksMap.keys());
      loadTimeSeriesData(symbols);
    } catch (err) {
      console.debug("Failed to refresh stocks:", err);
    }
  }, [loadTimeSeriesData]);

  const forceRefreshIntradayData = useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    try {
      const symbols = stocks.map(({ stock }) => stock.symbol);
      if (symbols.length === 0) {
        return;
      }
      
      // Clear cache for all symbols
      for (const symbol of symbols) {
        stockDataManager.clearCache(symbol);
      }
      
      // Force fetch intraday data directly using get_batch_intraday_time_series
      const intradayDataMap = await invoke<Record<string, Array<{
        date: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }>>>("get_batch_intraday_time_series", {
        symbols,
        forceRefresh: true,
      });
      
      // Update time series data map
      setTimeSeriesDataMap(prev => {
        const newMap = new Map(prev);
        let hasChanges = false;
        
        for (const [symbol, intradayData] of Object.entries(intradayDataMap)) {
          if (intradayData && intradayData.length > 0) {
            // Always update on force refresh
            newMap.set(symbol, intradayData);
            hasChanges = true;
            console.debug(`Force refreshed intraday data for ${symbol}:`, {
              count: intradayData.length,
              first: intradayData[0],
              last: intradayData[intradayData.length - 1]
            });
          }
        }
        
        return hasChanges ? newMap : prev;
      });
      
      showAlert(t("favorites.intradayRefreshSuccess") || "Intraday data refreshed successfully");
    } catch (err) {
      console.error("Failed to force refresh intraday data:", err);
      showAlert(t("favorites.intradayRefreshError") || "Failed to refresh intraday data");
    }
  }, [stocks, showAlert, t]);

  const refreshAlerts = useCallback(async () => {
    try {
      const alertsData = await invoke<PriceAlertInfo[]>("get_price_alerts", { symbol: null });
      const activeAlerts = alertsData.filter((alert) => alert.enabled);
      setAlerts(activeAlerts);
      
      const triggered = alertsData.filter((alert) => alert.triggered).map((alert) => alert.symbol);
      setTriggeredAlertSymbols(new Set(triggered));
    } catch (err) {
      console.debug("Failed to refresh alerts:", err);
    }
  }, []);

  const checkPriceAlerts = useCallback(async () => {
    try {
      const triggeredAlerts = await invoke<Array<{
        id: number;
        symbol: string;
        threshold_price: number;
        direction: string;
        enabled: boolean;
        triggered: boolean;
      }>>("check_price_alerts");
      
      if (triggeredAlerts && triggeredAlerts.length > 0) {
        const newTriggeredSymbols = new Set<string>();
        triggeredAlerts.forEach(alert => {
          newTriggeredSymbols.add(alert.symbol);
          const direction = alert.direction === "above" ? t("priceAlert.above") : t("priceAlert.below");
          const message = `${alert.symbol} ${t("priceAlert.triggered")}: ${direction} ${alert.threshold_price.toFixed(2)}`;
          showAlert(message);
        });
        setTriggeredAlertSymbols(newTriggeredSymbols);
        await refreshAlerts();
      }
    } catch (err) {
      console.error("Error checking price alerts:", err);
    }
  }, [t, refreshAlerts]);

  const handleResetTriggered = useCallback(async (alertId: number) => {
    try {
      await invoke("reset_price_alert", { alertId });
      await refreshAlerts();
      showAlert(t("priceAlert.resetSuccess"));
    } catch (err) {
      console.error("Error resetting alert:", err);
      showAlert(t("priceAlert.resetError"));
    }
  }, [refreshAlerts, showAlert, t]);

  const handleRemoveAlertsForSymbol = useCallback(async (symbol: string) => {
    const ok = await showConfirm(t("priceAlert.confirmRemoveAlertsForSymbol"));
    if (!ok) return;
    const toRemove = alerts.filter((a) => a.symbol === symbol);
    try {
      for (const a of toRemove) {
        await invoke("delete_price_alert", { alertId: a.id });
      }
      await refreshAlerts();
      showAlert(t("priceAlert.removeSuccess"));
    } catch (err) {
      console.error("Error removing alerts:", err);
      showAlert(err instanceof Error ? err.message : String(err));
    }
  }, [alerts, refreshAlerts, showAlert, showConfirm, t]);

  const refreshPositions = useCallback(async () => {
    try {
      const positionsData = await invoke<Array<[number, string, string, number, number, number | null]>>("get_portfolio_positions");
      
      // Fetch all stock data bundles using stockDataManager
      const positionSymbols = positionsData.map(([_, symbol]) => symbol);
      const stockBundles = await stockDataManager.getBatchStockData(positionSymbols);
      
      const positionsWithPrices = positionsData.map(([id, symbol, name, quantity, avgCost, currentPrice]) => {
        const bundle = stockBundles.get(symbol);
        let price = currentPrice || avgCost;
        
        // Get price from bundle
        if (bundle?.quote) {
          if (bundle.quote.price && bundle.quote.price > 0) {
            price = bundle.quote.price;
          } else if (bundle.quote.previous_close && bundle.quote.previous_close > 0) {
            price = bundle.quote.previous_close;
          }
        }
        
        // Fallback to time series if quote doesn't have valid data
        if ((!price || price === avgCost || price <= 0) && bundle?.time_series && bundle.time_series.length > 0) {
          const latestData = bundle.time_series[bundle.time_series.length - 1];
          if (latestData.close && latestData.close > 0) {
            price = latestData.close;
          }
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
        } as PortfolioPosition;
      });
      
      // Incremental update: only update changed positions
      setPositions(prevPositions => {
        const positionsMap = new Map(prevPositions.map(p => [p.id, p]));
        let hasChanges = false;
        
        const updatedPositions = positionsWithPrices.map(newPos => {
          const oldPos = positionsMap.get(newPos.id);
          if (!oldPos) {
            hasChanges = true;
            return newPos; // New position
          }
          
          // Compare key fields
          if (
            oldPos.currentPrice !== newPos.currentPrice ||
            oldPos.quantity !== newPos.quantity ||
            oldPos.avgCost !== newPos.avgCost ||
            oldPos.name !== newPos.name
          ) {
            hasChanges = true;
            return newPos; // Position changed
          }
          
          return oldPos; // No change, keep old reference
        });
        
        // Check for removed positions
        const newIds = new Set(positionsWithPrices.map(p => p.id));
        const removed = prevPositions.filter(p => !newIds.has(p.id));
        if (removed.length > 0) {
          hasChanges = true;
        }
        
        return hasChanges ? updatedPositions : prevPositions;
      });
      
      // Load transactions (only if position expanded)
      if (expandedPositionSymbol) {
        const transactionsData: Array<[number, string, string, number, number, number, number, string, string | null]> = await invoke("get_portfolio_transactions", { symbol: null });
        const symbolToNameMap = new Map<string, string>();
        positionsWithPrices.forEach((position) => {
          symbolToNameMap.set(position.symbol, position.name);
        });
        const loadedTransactions = transactionsData.map(
          ([id, symbol, transactionType, quantity, price, amount, commission, transactionDate, notes]) => ({
            id,
            symbol,
            name: symbolToNameMap.get(symbol),
            transactionType: transactionType as "buy" | "sell",
            quantity,
            price,
            amount,
            commission,
            transactionDate,
            notes: notes || undefined,
          })
        );
        setTransactions(loadedTransactions);
      }
      
      // Refresh indices data for portfolio stocks in background
      if (positionsWithPrices.length > 0) {
        invoke("refresh_indices_data_for_portfolio").catch((err) => {
          console.debug("Failed to refresh indices data:", err);
        });
      }
    } catch (err) {
      console.debug("Failed to refresh positions:", err);
    }
  }, [expandedPositionSymbol]);

  // Manual refresh function (for refresh button)
  const loadFavoritesAndAlerts = useCallback(async () => {
    await Promise.all([refreshStocks(), refreshAlerts(), refreshPositions()]);
  }, [refreshStocks, refreshAlerts, refreshPositions]);

  const refreshStocksAndPositions = useCallback(async () => {
    await refreshStocks();
    await refreshPositions();
  }, [refreshStocks, refreshPositions]);

  useTradingHoursTimeseriesRefresh(refreshStocksAndPositions, {
    enabled: true,
  });

  // Load initial data on mount
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Column resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, columnIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnIndex);
    resizeStartX.current = e.clientX;
    const currentWidth = columnWidths.get(columnIndex);
    if (currentWidth) {
      resizeStartWidth.current = currentWidth;
    } else {
      resizeStartWidth.current = 120;
    }
  }, [columnWidths]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (resizingColumn === null) return;
    const diff = e.clientX - resizeStartX.current;
    const currentWidth = columnWidths.get(resizingColumn) || 120;
    const newWidth = Math.max(60, currentWidth + diff);
    setColumnWidths((prev) => {
      const newMap = new Map(prev);
      newMap.set(resizingColumn, newWidth);
      return newMap;
    });
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = newWidth;
  }, [resizingColumn, columnWidths]);

  const handleResizeEnd = useCallback(() => {
    setResizingColumn(null);
  }, []);

  useEffect(() => {
    if (resizingColumn !== null) {
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
      return () => {
        document.removeEventListener("mousemove", handleResizeMove);
        document.removeEventListener("mouseup", handleResizeEnd);
      };
    }
  }, [resizingColumn, handleResizeMove, handleResizeEnd]);

  // Stocks and positions use useTradingHoursTimeseriesRefresh (9:00-11:30, 13:00-15:30)
  useEffect(() => {
    const alertsInterval = setInterval(refreshAlerts, 60000);
    const alertsCheckInterval = setInterval(checkPriceAlerts, 60000);
    checkPriceAlerts();
    const handlePriceAlertChanged = () => { refreshAlerts(); };
    window.addEventListener("priceAlertChanged", handlePriceAlertChanged);
    return () => {
      clearInterval(alertsInterval);
      clearInterval(alertsCheckInterval);
      window.removeEventListener("priceAlertChanged", handlePriceAlertChanged);
    };
  }, [refreshAlerts, checkPriceAlerts]);

  // Load custom names from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("favorites_custom_names");
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, string>;
        setCustomNames(new Map(Object.entries(parsed)));
      }
    } catch (err) {
      console.error("Error loading custom names:", err);
    }
  }, []);

  const saveCustomNames = (names: Map<string, string>) => {
    try {
      const obj = Object.fromEntries(names);
      localStorage.setItem("favorites_custom_names", JSON.stringify(obj));
      setCustomNames(names);
    } catch (err) {
      console.error("Error saving custom names:", err);
    }
  };

  const handleEditStock = (stock: StockInfo) => {
    const customName = customNames.get(stock.symbol) || stock.name;
    setEditingStock({ symbol: stock.symbol, name: customName });
  };

  const handleSaveStockName = () => {
    if (!editingStock) return;
    const newNames = new Map(customNames);
    if (editingStock.name.trim()) {
      newNames.set(editingStock.symbol, editingStock.name.trim());
    } else {
      newNames.delete(editingStock.symbol);
    }
    saveCustomNames(newNames);
    setEditingStock(null);
  };

  const getDisplayName = (stock: StockInfo) => {
    return customNames.get(stock.symbol) || stock.name;
  };

  const handleStockClick = (stock: StockInfo) => {
    if (onStockSelect) {
      onStockSelect(stock.symbol, stock.name);
    }
  };

  const searchStocks = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    try {
      const results: StockInfo[] = await invoke("search_stocks", { query });
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError("No results found");
      }
    } catch (err) {
      console.error("Search error:", err);
      setSearchError(err instanceof Error ? err.message : String(err));
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => searchStocks(searchQuery), 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchStocks]);

  const handleAddStock = async (stock: StockInfo) => {
    try {
      await invoke("add_stock_to_group", { stock, groupName: null });
      await refreshStocks();
      setShowAddStock(false);
      setSearchQuery("");
      setSearchResults([]);
      setSearchError(null);
    } catch (err) {
      console.error("Error adding stock:", err);
      showAlert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRemoveStock = async (symbol: string, name: string) => {
    const ok = await showConfirm(t("sidebar.confirmDeleteStock", { symbol: `${symbol} (${name})` }));
    if (!ok) return;
    try {
      await invoke("remove_stock", { symbol });
      await refreshStocks();
    } catch (err) {
      console.error("Error removing stock:", err);
      showAlert(err instanceof Error ? err.message : String(err));
    }
  };



  const getAlertStatus = (alert: PriceAlertInfo, currentPrice?: number) => {
    if (!currentPrice) return null;
    if (alert.triggered) return "triggered";
    if (alert.direction === "above") {
      return currentPrice >= alert.threshold_price ? "near" : "active";
    } else {
      return currentPrice <= alert.threshold_price ? "near" : "active";
    }
  };

  const stocksWithQuotes = stocks.filter((s) => s.quote !== null) as Array<{
    stock: StockInfo;
    quote: StockQuote;
  }>;

  const triggeredAlerts = alerts.filter((alert) => alert.triggered);
  const activeAlerts = alerts.filter((alert) => !alert.triggered);

  const upCount = stocksWithQuotes.filter((s) => s.quote.change_percent > 0).length;
  const downCount = stocksWithQuotes.filter((s) => s.quote.change_percent < 0).length;

  const totalMarketValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const totalCost = positions.reduce((sum, p) => sum + p.quantity * p.avgCost, 0);
  const totalProfit = positions.reduce((sum, p) => sum + p.profit, 0);
  const totalProfitPercent = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

  const handleSortChangePercent = useCallback(() => {
    if (sortField === "changePercent") {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField("changePercent");
      setSortDirection("desc");
    }
  }, [sortField, sortDirection]);

  const positionSymbols = useMemo(() => {
    return new Set(positions.map(p => p.symbol));
  }, [positions]);

  const { regularStocks, indices } = useMemo(() => {
    return separateStocksAndIndices(stocks);
  }, [stocks]);

  const sortedStocks = useMemo(() => {
    const stocksToSort = activeTab === "stocks" ? regularStocks : indices;
    if (!sortField) {
      return stocksToSort;
    }
    const sorted = [...stocksToSort].sort((a, b) => {
      if (sortField === "changePercent") {
        const aValue = a.quote?.change_percent ?? -Infinity;
        const bValue = b.quote?.change_percent ?? -Infinity;
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }
      return 0;
    });
    return sorted;
  }, [regularStocks, indices, activeTab, sortField, sortDirection]);

  if (loading) {
    return (
      <div className="favorites-dashboard">
        <div className="dashboard-loading">{t("app.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="favorites-dashboard">
        <div className="dashboard-error">{error}</div>
        <button onClick={loadFavoritesAndAlerts} className="refresh-button">
          {t("common.refresh")}
        </button>
      </div>
    );
  }

  const toggleCard = (cardType: string) => {
    setExpandedCard(expandedCard === cardType ? null : cardType);
  };

  return (
    <div className="favorites-dashboard">
      <div className="dashboard-header">
        <h2>{t("favorites.dashboard")}</h2>
        <button onClick={loadFavoritesAndAlerts} className="refresh-button" title={t("common.refresh")}>
          {t("common.refresh")}
        </button>
      </div>

      <div className="dashboard-cards">
        <div className={`dashboard-card ${expandedCard === "stocks" ? "active" : ""}`} onClick={() => toggleCard("stocks")}>
          <div className="card-header">
            <h3>{t("favorites.title")}</h3>
            <div className="card-stats">
              <div className="stat-item">
                <span className="stat-label">{t("favorites.total")}</span>
                <span className="stat-value">{regularStocks.length + indices.length}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">{t("favorites.upCount")}</span>
                <span className="stat-value up">{upCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">{t("favorites.downCount")}</span>
                <span className="stat-value down">{downCount}</span>
              </div>
            </div>
            <button
              className="force-refresh-button"
              onClick={forceRefreshIntradayData}
              title={t("favorites.forceRefreshIntraday") || "Force refresh intraday data"}
            >
              <Icon name="refresh" />
            </button>
          </div>
        </div>

        {positions.length > 0 && (
          <>
            <div className={`dashboard-card ${expandedCard === "portfolio" ? "active" : ""}`} onClick={() => toggleCard("portfolio")}>
              <div className="card-header">
                <h3>{t("portfolio.title")}</h3>
                <div className="card-stats">
                  <div className="stat-item">
                    <span className="stat-label">{t("portfolio.positions")}</span>
                    <span className="stat-value">{positions.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">{t("portfolio.totalValue")}</span>
                    <span className="stat-value">{totalMarketValue.toFixed(2)}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">{t("portfolio.totalProfit")}</span>
                    <span className={`stat-value ${totalProfit >= 0 ? "up" : "down"}`}>
                      {totalProfit >= 0 ? "+" : ""}{totalProfit.toFixed(2)}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">{t("portfolio.totalProfitPercent")}</span>
                    <span className={`stat-value ${totalProfitPercent >= 0 ? "up" : "down"}`}>
                      {totalProfitPercent >= 0 ? "+" : ""}{totalProfitPercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className={`dashboard-card ${expandedCard === "realtime" ? "active" : ""}`} onClick={() => toggleCard("realtime")}>
              <div className="card-header">
                <h3>{t("portfolio.realtimeTrading") || "Real-time Trading"}</h3>
                <div className="card-stats">
                  <div className="stat-item">
                    <span className="stat-label">{t("portfolio.positions")}</span>
                    <span className="stat-value">{positions.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <div className={`dashboard-card ${expandedCard === "alerts" ? "active" : ""}`} onClick={() => toggleCard("alerts")}>
          <div className="card-header">
            <h3>{t("priceAlert.title")}</h3>
            <div className="card-stats">
              <div className="stat-item">
                <span className="stat-label">{t("priceAlert.triggered")}</span>
                <span className="stat-value">{triggeredAlerts.length}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">{t("priceAlert.active")}</span>
                <span className="stat-value">{activeAlerts.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-data-table">
        {expandedCard === "stocks" && (
          <div className="data-table-section">
            <div className="section-header">
              <div className="section-header-tabs">
                <button
                  className={`tab-button ${activeTab === "stocks" ? "active" : ""}`}
                  onClick={() => setActiveTab("stocks")}
                >
                  {t("favorites.stocks") || "Stocks"} ({regularStocks.length})
                </button>
                {indices.length > 0 && (
                  <button
                    className={`tab-button ${activeTab === "indices" ? "active" : ""}`}
                    onClick={() => setActiveTab("indices")}
                  >
                    {t("favorites.indices") || "Indices"} ({indices.length})
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowAddStock(!showAddStock)}
                className="add-stock-button"
                title={t("favorites.addStock") || "Add Stock"}
              >
                <Icon name="add" size={16} />
                <span>{t("favorites.addStock") || "Add Stock"}</span>
              </button>
            </div>
            {showAddStock && (
              <div className="add-stock-panel">
                <div className="search-input-container">
                  <Icon name="search" size={16} />
                  <input
                    type="text"
                    className="search-input"
                    placeholder={t("sidebar.searchPlaceholder") || "Search stocks..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {searching && <div className="search-spinner"></div>}
                  <button
                    onClick={() => {
                      setShowAddStock(false);
                      setSearchQuery("");
                      setSearchResults([]);
                      setSearchError(null);
                    }}
                    className="close-search-btn"
                    title={t("common.close") || "Close"}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
                {searchError && <div className="search-error">{searchError}</div>}
                {searchResults.length > 0 && (
                  <div className="search-results-dropdown">
                    {searchResults.map((stock) => {
                      const isAlreadyAdded = stocks.some((s) => s.stock.symbol === stock.symbol);
                      return (
                        <div
                          key={stock.symbol}
                          className={`search-result-item ${isAlreadyAdded ? "already-added" : ""}`}
                          onClick={() => !isAlreadyAdded && handleAddStock(stock)}
                        >
                          <div className="result-content">
                            <span className="result-symbol">{stock.symbol}</span>
                            <span className="result-name">{stock.name}</span>
                            <span className="result-exchange">{stock.exchange}</span>
                          </div>
                          {isAlreadyAdded ? (
                            <span className="already-added-label">{t("favorites.alreadyAdded") || "Added"}</span>
                          ) : (
                            <button
                              className="add-result-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddStock(stock);
                              }}
                              title={t("sidebar.addToFavorites") || "Add to favorites"}
                            >
                              <Icon name="add" size={16} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {(activeTab === "stocks" && regularStocks.length === 0) || (activeTab === "indices" && indices.length === 0) ? (
              <div className="stocks-empty">
                {activeTab === "stocks" 
                  ? t("favorites.empty") 
                  : (t("favorites.noIndices") || "No indices")}
              </div>
            ) : (
              <div className="stocks-table-container">
                <table className="stocks-table">
                  <thead>
                    <tr>
                      <th style={{ width: 100, minWidth: 100, maxWidth: 100 }}>
                        {t("common.symbol")}
                      </th>
                      <th style={{ width: 100, minWidth: 100, maxWidth: 100 }}>
                        {t("common.name")}
                      </th>
                      <th style={{ width: 100, minWidth: 100, maxWidth: 100 }}>
                        {t("common.price")}
                      </th>
                      <th style={{ width: 100, minWidth: 100, maxWidth: 100 }}>
                        {t("common.change")}
                      </th>
                      <th 
                        style={{ width: 100, minWidth: 100, maxWidth: 100, cursor: "pointer" }}
                        onClick={handleSortChangePercent}
                        className={sortField === "changePercent" ? "sortable sorted" : "sortable"}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          {t("common.changePercent")}
                          {sortField === "changePercent" ? (
                            <Icon 
                              name={sortDirection === "asc" ? "arrowUp" : "arrowDown"} 
                              size={12} 
                              primaryFill="var(--accent-color)"
                            />
                          ) : (
                            <Icon name="chevronUp" size={12} primaryFill="var(--text-secondary)" />
                          )}
                        </div>
                      </th>
                      <th style={{ width: 100, minWidth: 100, maxWidth: 100 }}>
                        {t("common.volume")}
                      </th>
                      <th style={{ width: 120, minWidth: 120, maxWidth: 120, position: "relative" }}>
                        {t("chart.timeSeries")}
                      </th>
                      <th style={{ width: columnWidths.get(7), minWidth: 60, position: "relative" }}>
                        {t("portfolio.actions")}
                        <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 7)} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStocks.map(({ stock, quote }) => {
                      const hasTriggeredAlert = triggeredAlertSymbols.has(stock.symbol);
                      return (
                        <tr
                          key={stock.symbol}
                          className={`stock-row ${quote ? (quote.change_percent > 0 ? "up" : quote.change_percent < 0 ? "down" : "") : ""} ${hasTriggeredAlert ? "alert-triggered" : ""}`}
                        >
                          <td className="stock-symbol" style={{ width: 100, minWidth: 100, maxWidth: 100 }} onClick={() => handleStockClick(stock)}>
                            {stock.symbol}
                            {positionSymbols.has(stock.symbol) && <span className="position-indicator" title={t("portfolio.positions")}>★</span>}
                            {hasTriggeredAlert && <span className="alert-indicator" title={t("priceAlert.triggered")}>⚠</span>}
                          </td>
                        <td 
                          className={`stock-name ${
                            quote ? (quote.change_percent > 0 ? "up" : quote.change_percent < 0 ? "down" : "") : ""
                          }`}
                          style={{ width: 100, minWidth: 100, maxWidth: 100 }}
                          onClick={() => handleStockClick(stock)}
                        >
                          {editingStock?.symbol === stock.symbol ? (
                            <input
                              type="text"
                              value={editingStock.name}
                              onChange={(e) => setEditingStock({ ...editingStock, name: e.target.value })}
                              onBlur={handleSaveStockName}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleSaveStockName();
                                } else if (e.key === "Escape") {
                                  setEditingStock(null);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: "100%",
                                padding: "2px 4px",
                                fontSize: "13px",
                                border: "1px solid var(--accent-color)",
                                borderRadius: "3px",
                                background: "var(--bg-primary)",
                                color: "var(--text-primary)",
                              }}
                              autoFocus
                            />
                          ) : (
                            getDisplayName(stock)
                          )}
                        </td>
                        {quote ? (
                          <>
                            <td className="stock-price" style={{ width: 100, minWidth: 100, maxWidth: 100 }} onClick={() => handleStockClick(stock)}>{quote.price.toFixed(2)}</td>
                            <td className={`stock-change ${quote.change > 0 ? "up" : quote.change < 0 ? "down" : ""}`} style={{ width: 100, minWidth: 100, maxWidth: 100 }} onClick={() => handleStockClick(stock)}>
                              {quote.change > 0 ? "+" : ""}
                              {quote.change.toFixed(2)}
                            </td>
                            <td className={`stock-change-percent ${quote.change_percent > 0 ? "up" : quote.change_percent < 0 ? "down" : ""}`} style={{ width: 100, minWidth: 100, maxWidth: 100 }} onClick={() => handleStockClick(stock)}>
                              {quote.change_percent > 0 ? "+" : ""}
                              {quote.change_percent.toFixed(2)}%
                            </td>
                            <td className="stock-volume" style={{ width: 100, minWidth: 100, maxWidth: 100 }} onClick={() => handleStockClick(stock)}>{(quote.volume / 10000).toFixed(0)}{t("common.tenThousand")}</td>
                            <td className="stock-chart" style={{ width: 120, minWidth: 120, maxWidth: 120 }} onClick={(e) => e.stopPropagation()}>
                              {timeSeriesDataMap.has(stock.symbol) ? (
                                <TimeSeriesThumbnail data={timeSeriesDataMap.get(stock.symbol)!} height={40} />
                              ) : (
                                <div style={{ width: "100%", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "10px" }}>-</div>
                              )}
                            </td>
                            <td className="stock-actions" style={{ width: columnWidths.get(7), minWidth: 60 }} onClick={(e) => e.stopPropagation()}>
                              <div className="action-buttons">
                                {alerts.some((a) => a.symbol === stock.symbol) ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveAlertsForSymbol(stock.symbol);
                                    }}
                                    className="action-btn"
                                    title={t("priceAlert.removeAlert")}
                                  >
                                    <Icon name="close" size={14} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPriceAlertSymbol(stock.symbol);
                                      setPriceAlertCurrentPrice(quote?.price ?? 0);
                                      setShowPriceAlertDialog(true);
                                    }}
                                    className="action-btn"
                                    title={t("priceAlert.addAlert")}
                                  >
                                    <Icon name="warning" size={14} />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditStock(stock);
                                  }}
                                  className="action-btn edit-btn"
                                  title={t("portfolio.edit")}
                                >
                                  <Icon name="edit" size={14} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveStock(stock.symbol, getDisplayName(stock));
                                  }}
                                  className="action-btn delete-btn"
                                  title={t("common.delete") || "Delete"}
                                >
                                  <Icon name="delete" size={14} />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td colSpan={3} className="stock-no-data" onClick={() => handleStockClick(stock)}>
                              {t("common.noData")}
                            </td>
                            <td className="stock-chart" style={{ width: 120, minWidth: 120, maxWidth: 120 }} onClick={(e) => e.stopPropagation()}>
                              {timeSeriesDataMap.has(stock.symbol) ? (
                                <TimeSeriesThumbnail data={timeSeriesDataMap.get(stock.symbol)!} height={40} />
                              ) : (
                                <div style={{ width: "100%", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "10px" }}>-</div>
                              )}
                            </td>
                            <td className="stock-actions" style={{ width: columnWidths.get(7), minWidth: 60 }} onClick={(e) => e.stopPropagation()}>
                              <div className="action-buttons">
                                {alerts.some((a) => a.symbol === stock.symbol) ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveAlertsForSymbol(stock.symbol);
                                    }}
                                    className="action-btn"
                                    title={t("priceAlert.removeAlert")}
                                  >
                                    <Icon name="close" size={14} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPriceAlertSymbol(stock.symbol);
                                      setPriceAlertCurrentPrice(0);
                                      setShowPriceAlertDialog(true);
                                    }}
                                    className="action-btn"
                                    title={t("priceAlert.addAlert")}
                                  >
                                    <Icon name="warning" size={14} />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditStock(stock);
                                  }}
                                  className="action-btn edit-btn"
                                  title={t("portfolio.edit")}
                                >
                                  <Icon name="edit" size={14} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveStock(stock.symbol, getDisplayName(stock));
                                  }}
                                  className="action-btn delete-btn"
                                  title={t("common.delete") || "Delete"}
                                >
                                  <Icon name="delete" size={14} />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {expandedCard === "portfolio" && (
          <div className="data-table-section">
            <div className="section-header">
              <h3>{t("portfolio.title")}</h3>
              <div className="header-actions">
                <button
                  onClick={() => setShowAddTransactionDialog(true)}
                  className="add-stock-button"
                  title={t("portfolio.addTransaction") || "Add Transaction"}
                >
                  <Icon name="add" size={16} />
                  <span>{t("portfolio.addTransaction") || "Add Transaction"}</span>
                </button>
              </div>
            </div>
            {positions.length === 0 ? (
              <div className="stocks-empty">{t("portfolio.noPositions") || "No positions"}</div>
            ) : (
              <div className="portfolio-split-container">
                <div className="portfolio-table-container portfolio-positions-section">
                  <table className="portfolio-table">
                    <thead>
                      <tr>
                        <th>{t("common.symbol")}</th>
                        <th>{t("common.name")}</th>
                        <th>{t("portfolio.quantity")}</th>
                        <th>{t("portfolio.avgCost")}</th>
                        <th>{t("common.price")}</th>
                        <th>{t("portfolio.marketValue")}</th>
                        <th>{t("portfolio.profit")}</th>
                        <th>{t("portfolio.profitPercent")}</th>
                        <th>{t("portfolio.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((position) => {
                        const isExpanded = expandedPositionSymbol === position.symbol;
                        const hasTriggeredAlert = triggeredAlertSymbols.has(position.symbol);
                        return (
                          <tr
                            key={position.id}
                            className={`portfolio-row ${position.profit >= 0 ? "up" : "down"} ${hasTriggeredAlert ? "alert-triggered" : ""}`}
                          >
                            <td className="portfolio-symbol" onClick={() => handleStockClick({ symbol: position.symbol, name: position.name, exchange: "" })}>
                              {position.symbol}
                              {hasTriggeredAlert && <span className="alert-indicator" title={t("priceAlert.triggered")}>⚠</span>}
                            </td>
                            <td className="portfolio-name" onClick={() => handleStockClick({ symbol: position.symbol, name: position.name, exchange: "" })}>{position.name}</td>
                            <td className="portfolio-quantity" onClick={() => handleStockClick({ symbol: position.symbol, name: position.name, exchange: "" })}>{position.quantity}</td>
                            <td className="portfolio-avg-cost" onClick={() => handleStockClick({ symbol: position.symbol, name: position.name, exchange: "" })}>{position.avgCost.toFixed(2)}</td>
                            <td className="portfolio-price" onClick={() => handleStockClick({ symbol: position.symbol, name: position.name, exchange: "" })}>{position.currentPrice.toFixed(2)}</td>
                            <td className="portfolio-market-value" onClick={() => handleStockClick({ symbol: position.symbol, name: position.name, exchange: "" })}>{position.marketValue.toFixed(2)}</td>
                            <td className={`portfolio-profit ${position.profit >= 0 ? "up" : "down"}`} onClick={() => handleStockClick({ symbol: position.symbol, name: position.name, exchange: "" })}>
                              {position.profit >= 0 ? "+" : ""}{position.profit.toFixed(2)}
                            </td>
                            <td className={`portfolio-profit-percent ${position.profitPercent >= 0 ? "up" : "down"}`} onClick={() => handleStockClick({ symbol: position.symbol, name: position.name, exchange: "" })}>
                              {position.profitPercent >= 0 ? "+" : ""}{position.profitPercent.toFixed(2)}%
                            </td>
                            <td className="portfolio-actions" onClick={(e) => e.stopPropagation()}>
                              <div className="action-buttons">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedPositionSymbol(isExpanded ? null : position.symbol);
                                  }}
                                  className="action-btn"
                                  title={t("portfolio.showTransactions")}
                                >
                                  <Icon name={isExpanded ? "chevronUp" : "chevronDown"} size={14} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPriceAlertSymbol(position.symbol);
                                    setPriceAlertCurrentPrice(position.currentPrice);
                                    setShowPriceAlertDialog(true);
                                  }}
                                  className="action-btn"
                                  title={t("priceAlert.title")}
                                >
                                  <Icon name="bell" size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {expandedPositionSymbol && (
                  <div className="portfolio-transaction-details portfolio-transactions-section">
                    <div className="transaction-detail-header">
                      <span>{t("portfolio.transactions")} ({expandedPositionSymbol})</span>
                    </div>
                    <div className="portfolio-table-container">
                      <table className="portfolio-table transaction-detail-table">
                        <thead>
                          <tr>
                            <th>{t("portfolio.transactionType")}</th>
                            <th>{t("portfolio.quantity")}</th>
                            <th>{t("portfolio.price")}</th>
                            <th>{t("portfolio.amount")}</th>
                            <th>{t("portfolio.commission")}</th>
                            <th>{t("portfolio.transactionDate")}</th>
                            <th>{t("portfolio.notes")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactions
                            .filter((t) => t.symbol === expandedPositionSymbol)
                            .map((transaction) => (
                              <tr key={transaction.id}>
                                <td className={transaction.transactionType === "buy" ? "positive" : "negative"}>
                                  {transaction.transactionType === "buy" ? t("portfolio.buy") : t("portfolio.sell")}
                                </td>
                                <td>{transaction.quantity}</td>
                                <td>{t("common.currencySymbol")}{transaction.price.toFixed(2)}</td>
                                <td>{t("common.currencySymbol")}{transaction.amount.toFixed(2)}</td>
                                <td>{t("common.currencySymbol")}{transaction.commission.toFixed(2)}</td>
                                <td>{transaction.transactionDate}</td>
                                <td>{transaction.notes || "-"}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}


        {expandedCard === "alerts" && (
          <div className="data-table-section">
            <h3>{t("priceAlert.title")}</h3>
            {triggeredAlerts.length > 0 && (
              <div className="alerts-group triggered-alerts">
                <h4 className="alerts-group-title triggered">
                  {t("priceAlert.triggered")} ({triggeredAlerts.length})
                </h4>
                <div className="alerts-list">
                  {triggeredAlerts.map((alert) => {
                    const stock = stocksWithQuotes.find((s) => s.stock.symbol === alert.symbol);
                    const currentPrice = stock?.quote.price;
                    return (
                      <div key={alert.id} className="alert-item triggered">
                        <div className="alert-stock">
                          <span className="alert-symbol">{alert.symbol}</span>
                          <span 
                            className={`alert-name ${
                              stock?.quote ? (stock.quote.change_percent > 0 ? "up" : stock.quote.change_percent < 0 ? "down" : "") : ""
                            }`}
                          >
                            {stock?.stock.name || ""}
                          </span>
                        </div>
                        <div className="alert-details">
                          <span className="alert-direction">
                            {alert.direction === "above" ? "≥" : "≤"} {alert.threshold_price.toFixed(2)}
                          </span>
                          {currentPrice && (
                            <span className="alert-current-price">{t("priceAlert.current")}: {currentPrice.toFixed(2)}</span>
                          )}
                        </div>
                        <div className="alert-actions">
                          <button
                            className="alert-action-btn"
                            onClick={() => handleResetTriggered(alert.id)}
                            title={t("priceAlert.reset") || "Reset"}
                          >
                            <Icon name="refresh" size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeAlerts.length > 0 && (
              <div className="alerts-group active-alerts">
                <h4 className="alerts-group-title active">
                  {t("priceAlert.active")} ({activeAlerts.length})
                </h4>
                <div className="alerts-list">
                  {activeAlerts.map((alert) => {
                    const stock = stocksWithQuotes.find((s) => s.stock.symbol === alert.symbol);
                    const currentPrice = stock?.quote.price;
                    const status = getAlertStatus(alert, currentPrice);
                    const distance = currentPrice
                      ? alert.direction === "above"
                        ? ((currentPrice - alert.threshold_price) / alert.threshold_price) * 100
                        : ((alert.threshold_price - currentPrice) / alert.threshold_price) * 100
                      : null;

                    return (
                      <div key={alert.id} className={`alert-item ${status || ""}`}>
                        <div className="alert-stock">
                          <span className="alert-symbol">{alert.symbol}</span>
                          <span 
                            className={`alert-name ${
                              stock?.quote ? (stock.quote.change_percent > 0 ? "up" : stock.quote.change_percent < 0 ? "down" : "") : ""
                            }`}
                          >
                            {stock?.stock.name || ""}
                          </span>
                        </div>
                        <div className="alert-details">
                          <span className="alert-direction">
                            {alert.direction === "above" ? "≥" : "≤"} {alert.threshold_price.toFixed(2)}
                          </span>
                          {currentPrice && distance !== null && (
                            <span className={`alert-distance ${distance < 2 ? "near" : ""}`}>
                              {distance < 0 ? t("priceAlert.triggered") : `${t("priceAlert.distance")}: ${distance.toFixed(1)}%`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {alerts.length === 0 && (
              <div className="alerts-empty">{t("priceAlert.noAlerts")}</div>
            )}
          </div>
        )}

        {expandedCard === "realtime" && positions.length > 0 && (
          <div className="data-table-section">
            <StockComparisonChart 
              onStockSelect={onStockSelect} 
              positions={positions}
            />
          </div>
        )}

        {!expandedCard && (
          <div className="data-table-empty">
            <div className="empty-message">{t("dashboard.selectCard")}</div>
          </div>
        )}
      </div>

      <AddTransactionDialog
        isOpen={showAddTransactionDialog}
        onClose={() => setShowAddTransactionDialog(false)}
        onAdd={refreshPositions}
      />

      <PriceAlertDialog
        isOpen={showPriceAlertDialog}
        onClose={() => {
          setShowPriceAlertDialog(false);
          setPriceAlertSymbol("");
          setPriceAlertCurrentPrice(0);
        }}
        symbol={priceAlertSymbol}
        currentPrice={priceAlertCurrentPrice}
        onAlertChanged={refreshAlerts}
      />
    </div>
  );
};

export default FavoritesDashboard;
