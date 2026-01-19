import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import PortfolioTimeseriesCard from "./PortfolioTimeseriesCard";
import Icon from "./Icon";
import AddPositionDialog from "./PortfolioManagement/dialogs/AddPositionDialog";
import EditPositionDialog from "./PortfolioManagement/dialogs/EditPositionDialog";
import AddTransactionDialog from "./PortfolioManagement/dialogs/AddTransactionDialog";
import { groupTransactionsBySymbol, getTransactionSymbols } from "./PortfolioManagement/utils/portfolioCalculations";
import TimeSeriesThumbnail from "./TimeSeriesThumbnail";
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
  const [showAddPositionDialog, setShowAddPositionDialog] = useState(false);
  const [showEditPositionDialog, setShowEditPositionDialog] = useState(false);
  const [showAddTransactionDialog, setShowAddTransactionDialog] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null);
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
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<string>("");
  const [selectedTransactionSymbol, setSelectedTransactionSymbol] = useState<string | null>(null);
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
      
      // Load time series data for all stocks
      const symbols = updatedStocks.map(({ stock }) => stock.symbol);
      const newMap = new Map<string, Array<{
        date: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }>>();
      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const data = await invoke<any[]>("get_time_series", { symbol });
            if (data && data.length > 0) {
              newMap.set(symbol, data);
            }
          } catch (err) {
            console.debug("Failed to load time series for", symbol, err);
          }
        })
      );
      setTimeSeriesDataMap(newMap);

      const activeAlerts = alertsData.filter((alert) => alert.enabled);
      setAlerts(activeAlerts);

      const positionsWithPrices = await Promise.all(
        positionsData.map(async ([id, symbol, name, quantity, avgCost, currentPrice]) => {
          let price = currentPrice || avgCost;
          
          // Priority 1: Get real-time price from quote (f43 is the current market price)
          try {
            const quote = await invoke<any>("get_stock_quote", { symbol });
            if (quote && quote.price && quote.price > 0) {
              price = quote.price;
            } else if (quote && quote.previous_close && quote.previous_close > 0) {
              // Fallback to previous_close if price is not available
              price = quote.previous_close;
            }
          } catch (quoteErr) {
            console.debug("Failed to fetch quote for", symbol, quoteErr);
          }
          
          // Priority 2: Fallback to time series if quote doesn't have valid data
          if (!price || price === avgCost || price <= 0) {
            try {
              const timeSeriesData = await invoke<any[]>("get_time_series", { symbol });
              if (timeSeriesData && timeSeriesData.length > 0) {
                const latestData = timeSeriesData[timeSeriesData.length - 1];
                if (latestData.close && latestData.close > 0) {
                  price = latestData.close;
                }
              }
            } catch (timeSeriesErr) {
              console.debug("Failed to fetch time series for", symbol, timeSeriesErr);
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
        })
      );
      setPositions(positionsWithPrices);
    } catch (err) {
      console.error("Error loading initial data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load time series data for stocks
  const loadTimeSeriesData = useCallback(async (symbols: string[]) => {
    const newMap = new Map(timeSeriesDataMap);
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const data = await invoke<any[]>("get_time_series", { symbol });
          if (data && data.length > 0) {
            newMap.set(symbol, data);
          }
        } catch (err) {
          console.debug("Failed to load time series for", symbol, err);
        }
      })
    );
    setTimeSeriesDataMap(newMap);
  }, [timeSeriesDataMap]);

  // Independent async refresh functions for each data type
  const refreshStocks = useCallback(async () => {
    try {
      const stocksData = await invoke<Array<[StockInfo, StockQuote | null]>>("get_all_favorites_quotes");
      const updatedStocks = stocksData.map(([stock, quote]) => ({
        stock,
        quote,
      }));
      setStocks(updatedStocks);
      // Load time series data for all stocks
      const symbols = updatedStocks.map(({ stock }) => stock.symbol);
      loadTimeSeriesData(symbols);
    } catch (err) {
      console.debug("Failed to refresh stocks:", err);
    }
  }, [loadTimeSeriesData]);

  const refreshAlerts = useCallback(async () => {
    try {
      const alertsData = await invoke<PriceAlertInfo[]>("get_price_alerts", { symbol: null });
      const activeAlerts = alertsData.filter((alert) => alert.enabled);
      setAlerts(activeAlerts);
    } catch (err) {
      console.debug("Failed to refresh alerts:", err);
    }
  }, []);

  const refreshPositions = useCallback(async () => {
    try {
      const positionsData = await invoke<Array<[number, string, string, number, number, number | null]>>("get_portfolio_positions");
      const positionsWithPrices = await Promise.all(
        positionsData.map(async ([id, symbol, name, quantity, avgCost, currentPrice]) => {
          let price = currentPrice || avgCost;
          
          // Priority 1: Get real-time price from quote (f43 is the current market price)
          try {
            const quote = await invoke<any>("get_stock_quote", { symbol });
            if (quote && quote.price && quote.price > 0) {
              price = quote.price;
            } else if (quote && quote.previous_close && quote.previous_close > 0) {
              // Fallback to previous_close if price is not available
              price = quote.previous_close;
            }
          } catch (quoteErr) {
            console.debug("Failed to fetch quote for", symbol, quoteErr);
          }
          
          // Priority 2: Fallback to time series if quote doesn't have valid data
          if (!price || price === avgCost || price <= 0) {
            try {
              const timeSeriesData = await invoke<any[]>("get_time_series", { symbol });
              if (timeSeriesData && timeSeriesData.length > 0) {
                const latestData = timeSeriesData[timeSeriesData.length - 1];
                if (latestData.close && latestData.close > 0) {
                  price = latestData.close;
                }
              }
            } catch (timeSeriesErr) {
              console.debug("Failed to fetch time series for", symbol, timeSeriesErr);
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
        })
      );
      setPositions(positionsWithPrices);
      
      // Load transactions
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
    } catch (err) {
      console.debug("Failed to refresh positions:", err);
    }
  }, []);

  // Manual refresh function (for refresh button)
  const loadFavoritesAndAlerts = useCallback(async () => {
    await Promise.all([refreshStocks(), refreshAlerts(), refreshPositions()]);
  }, [refreshStocks, refreshAlerts, refreshPositions]);

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

  // Set up independent refresh intervals for each data type
  useEffect(() => {
    // Refresh stocks every 30 seconds
    const stocksInterval = setInterval(refreshStocks, 30000);
    
    // Refresh alerts every 60 seconds
    const alertsInterval = setInterval(refreshAlerts, 60000);
    
    // Refresh positions every 30 seconds
    const positionsInterval = setInterval(refreshPositions, 30000);
    
    return () => {
      clearInterval(stocksInterval);
      clearInterval(alertsInterval);
      clearInterval(positionsInterval);
    };
  }, [refreshStocks, refreshAlerts, refreshPositions]);

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
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRemoveStock = async (symbol: string, name: string) => {
    if (confirm(t("sidebar.confirmDeleteStock", { symbol: `${symbol} (${name})` }))) {
      try {
        await invoke("remove_stock", { symbol });
        await refreshStocks();
      } catch (err) {
        console.error("Error removing stock:", err);
        alert(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleAddPosition = (newPosition: PortfolioPosition) => {
    setPositions((prev) => [...prev, newPosition]);
    refreshPositions();
  };

  const handleEditPosition = (position: PortfolioPosition) => {
    setEditingPosition(position);
    setShowEditPositionDialog(true);
  };

  const handleDeletePosition = async (id: number) => {
    const confirmMsg = t("portfolio.confirmDelete") || "Are you sure you want to delete this position?";
    if (confirm(confirmMsg)) {
      try {
        await invoke("delete_portfolio_position", { id });
        await refreshPositions();
      } catch (err) {
        console.error("Error deleting position:", err);
        alert(t("portfolio.deleteError") || "Failed to delete position");
      }
    }
  };

  const handleUpdatePosition = async () => {
    await refreshPositions();
  };

  const handleQuantityUpdate = async (transactionId: number, newQuantity: number, oldQuantity: number) => {
    if (newQuantity > 0 && newQuantity !== oldQuantity) {
      try {
        await invoke("update_portfolio_transaction", {
          id: transactionId,
          quantity: newQuantity,
        });
        await refreshPositions();
      } catch (err) {
        console.error("Error updating transaction:", err);
        alert(t("portfolio.updateError") + ": " + (err instanceof Error ? err.message : String(err)));
      }
    }
    setEditingTransactionId(null);
    setEditingQuantity("");
  };

  const handleDeleteTransaction = async (id: number) => {
    const confirmMsg = t("portfolio.confirmDelete") || "Are you sure you want to delete this transaction?";
    if (confirm(confirmMsg)) {
      try {
        await invoke("delete_portfolio_transaction", { id });
        await refreshPositions();
      } catch (err) {
        console.error("Error deleting transaction:", err);
        alert(t("portfolio.deleteError") || "Failed to delete transaction");
      }
    }
  };

  const transactionSymbols = getTransactionSymbols(transactions);
  const groupedTransactions = groupTransactionsBySymbol(
    selectedTransactionSymbol
      ? transactions.filter((t) => t.symbol === selectedTransactionSymbol)
      : transactions
  );

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
                <span className="stat-value">{stocks.length}</span>
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
            <div className={`dashboard-card ${expandedCard === "transactions" ? "active" : ""}`} onClick={() => toggleCard("transactions")}>
              <div className="card-header">
                <h3>{t("portfolio.transactions")}</h3>
                <div className="card-stats">
                  <div className="stat-item">
                    <span className="stat-label">{t("portfolio.total")}</span>
                    <span className="stat-value">{transactions.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">{t("portfolio.symbols")}</span>
                    <span className="stat-value">{transactionSymbols.length}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className={`dashboard-card ${expandedCard === "timeseries" ? "active" : ""}`} onClick={() => toggleCard("timeseries")}>
              <div className="card-header">
                <h3>{t("portfolio.timeseriesChart")}</h3>
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
              <h3>{t("favorites.title")}</h3>
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
            {stocks.length === 0 ? (
              <div className="stocks-empty">{t("favorites.empty")}</div>
            ) : (
              <div className="stocks-table-container">
                <table className="stocks-table">
                  <thead>
                    <tr>
                      <th style={{ width: columnWidths.get(0), minWidth: 60, position: "relative" }}>
                        {t("common.symbol")}
                        <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 0)} />
                      </th>
                      <th style={{ width: columnWidths.get(1), minWidth: 60, position: "relative" }}>
                        {t("common.name")}
                        <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 1)} />
                      </th>
                      <th style={{ width: columnWidths.get(2), minWidth: 60, position: "relative" }}>
                        {t("common.price")}
                        <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 2)} />
                      </th>
                      <th style={{ width: columnWidths.get(3), minWidth: 60, position: "relative" }}>
                        {t("common.change")}
                        <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 3)} />
                      </th>
                      <th style={{ width: columnWidths.get(4), minWidth: 60, position: "relative" }}>
                        {t("common.changePercent")}
                        <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 4)} />
                      </th>
                      <th style={{ width: columnWidths.get(5), minWidth: 60, position: "relative" }}>
                        {t("common.volume")}
                        <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 5)} />
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
                    {stocks.map(({ stock, quote }) => (
                      <tr
                        key={stock.symbol}
                        className={`stock-row ${quote ? (quote.change_percent > 0 ? "up" : quote.change_percent < 0 ? "down" : "") : ""}`}
                      >
                        <td className="stock-symbol" style={{ width: columnWidths.get(0), minWidth: 60 }} onClick={() => handleStockClick(stock)}>{stock.symbol}</td>
                        <td 
                          className={`stock-name ${
                            quote ? (quote.change_percent > 0 ? "up" : quote.change_percent < 0 ? "down" : "") : ""
                          }`}
                          style={{ width: columnWidths.get(1), minWidth: 60 }}
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
                            <td className="stock-price" style={{ width: columnWidths.get(2), minWidth: 60 }} onClick={() => handleStockClick(stock)}>{quote.price.toFixed(2)}</td>
                            <td className={`stock-change ${quote.change > 0 ? "up" : quote.change < 0 ? "down" : ""}`} style={{ width: columnWidths.get(3), minWidth: 60 }} onClick={() => handleStockClick(stock)}>
                              {quote.change > 0 ? "+" : ""}
                              {quote.change.toFixed(2)}
                            </td>
                            <td className={`stock-change-percent ${quote.change_percent > 0 ? "up" : quote.change_percent < 0 ? "down" : ""}`} style={{ width: columnWidths.get(4), minWidth: 60 }} onClick={() => handleStockClick(stock)}>
                              {quote.change_percent > 0 ? "+" : ""}
                              {quote.change_percent.toFixed(2)}%
                            </td>
                            <td className="stock-volume" style={{ width: columnWidths.get(5), minWidth: 60 }} onClick={() => handleStockClick(stock)}>{(quote.volume / 10000).toFixed(0)}{t("common.tenThousand")}</td>
                            <td className="stock-chart" style={{ width: 120, minWidth: 120, maxWidth: 120 }} onClick={(e) => e.stopPropagation()}>
                              {timeSeriesDataMap.has(stock.symbol) ? (
                                <TimeSeriesThumbnail data={timeSeriesDataMap.get(stock.symbol)!} height={40} />
                              ) : (
                                <div style={{ width: "100%", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "10px" }}>-</div>
                              )}
                            </td>
                            <td className="stock-actions" style={{ width: columnWidths.get(7), minWidth: 60 }} onClick={(e) => e.stopPropagation()}>
                              <div className="action-buttons">
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
                    ))}
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
                  onClick={() => setShowAddPositionDialog(true)}
                  className="add-stock-button"
                  title={t("portfolio.addPosition") || "Add Position"}
                >
                  <Icon name="add" size={16} />
                  <span>{t("portfolio.addPosition") || "Add Position"}</span>
                </button>
                <button
                  onClick={() => setShowAddTransactionDialog(true)}
                  className="add-stock-button"
                  title={t("portfolio.addTransaction") || "Add Transaction"}
                  style={{ marginLeft: "8px" }}
                >
                  <Icon name="add" size={16} />
                  <span>{t("portfolio.addTransaction") || "Add Transaction"}</span>
                </button>
              </div>
            </div>
            {positions.length === 0 ? (
              <div className="stocks-empty">{t("portfolio.noPositions") || "No positions"}</div>
            ) : (
              <div className="portfolio-table-container">
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
                    {positions.map((position) => (
                      <tr
                        key={position.id}
                        className={`portfolio-row ${position.profit >= 0 ? "up" : "down"}`}
                      >
                        <td className="portfolio-symbol" onClick={() => handleStockClick({ symbol: position.symbol, name: position.name, exchange: "" })}>{position.symbol}</td>
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
                        <td className="stock-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="action-buttons">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditPosition(position);
                              }}
                              className="action-btn edit-btn"
                              title={t("portfolio.edit") || "Edit"}
                            >
                              <Icon name="edit" size={14} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePosition(position.id);
                              }}
                              className="action-btn delete-btn"
                              title={t("common.delete") || "Delete"}
                            >
                              <Icon name="delete" size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {expandedCard === "transactions" && (
          <div className="data-table-section">
            <div className="section-header">
              <h3>{t("portfolio.transactions")}</h3>
              <button
                onClick={() => setShowAddTransactionDialog(true)}
                className="add-stock-button"
                title={t("portfolio.addTransaction") || "Add Transaction"}
              >
                <Icon name="add" size={16} />
                <span>{t("portfolio.addTransaction") || "Add Transaction"}</span>
              </button>
            </div>
            {transactionSymbols.length > 0 && (
              <div className="transaction-filter-cards" style={{ marginBottom: "12px" }}>
                <button
                  className={`filter-card ${selectedTransactionSymbol === null ? "active" : ""}`}
                  onClick={() => setSelectedTransactionSymbol(null)}
                  title={t("portfolio.showAll") || "Show All"}
                >
                  {t("portfolio.all") || "All"}
                </button>
                {transactionSymbols.map((symbol) => {
                  const group = groupedTransactions.find((g) => g.symbol === symbol);
                  const position = positions.find((p) => p.symbol === symbol);
                  const stockName = position?.name || group?.name || symbol;
                  return (
                    <button
                      key={symbol}
                      className={`filter-card ${selectedTransactionSymbol === symbol ? "active" : ""}`}
                      onClick={() => setSelectedTransactionSymbol(symbol)}
                      title={`${stockName} (${symbol})`}
                    >
                      <span className="filter-card-name">{stockName}</span>
                      {group && <span className="filter-card-count">{group.transactions.length}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {transactions.length === 0 ? (
              <div className="stocks-empty">{t("portfolio.noTransactions") || "No transactions"}</div>
            ) : (
              <div className="portfolio-table-container">
                <table className="portfolio-table transactions-table">
                  <thead>
                    <tr>
                      <th>{t("portfolio.symbol")}</th>
                      <th>{t("portfolio.name")}</th>
                      <th>{t("portfolio.transactionType")}</th>
                      <th>{t("portfolio.quantity")}</th>
                      <th>{t("portfolio.price")}</th>
                      <th>{t("portfolio.amount")}</th>
                      <th>{t("portfolio.commission")}</th>
                      <th>{t("portfolio.transactionDate")}</th>
                      <th>{t("portfolio.notes")}</th>
                      <th>{t("portfolio.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedTransactions.map((group) => (
                      <React.Fragment key={group.symbol}>
                        {group.transactions.map((transaction) => (
                          <tr key={transaction.id}>
                            <td>{transaction.symbol}</td>
                            <td className="transaction-name">{transaction.name || "-"}</td>
                            <td className={transaction.transactionType === "buy" ? "positive" : "negative"}>
                              {transaction.transactionType === "buy" ? t("portfolio.buy") : t("portfolio.sell")}
                            </td>
                            <td
                              className="editable-quantity"
                              onClick={(e) => {
                                if (editingTransactionId !== transaction.id) {
                                  e.stopPropagation();
                                  setEditingTransactionId(transaction.id);
                                  setEditingQuantity(transaction.quantity.toString());
                                }
                              }}
                            >
                              {editingTransactionId === transaction.id ? (
                                <input
                                  type="number"
                                  value={editingQuantity}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "" || /^\d+$/.test(val)) {
                                      setEditingQuantity(val);
                                    }
                                  }}
                                  onBlur={async () => {
                                    const newQuantity = parseInt(editingQuantity) || 0;
                                    await handleQuantityUpdate(transaction.id, newQuantity, transaction.quantity);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.currentTarget.blur();
                                    } else if (e.key === "Escape") {
                                      setEditingTransactionId(null);
                                      setEditingQuantity("");
                                    }
                                  }}
                                  autoFocus
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
                                />
                              ) : (
                                <span className="quantity-display">{transaction.quantity}</span>
                              )}
                            </td>
                            <td>¥{transaction.price.toFixed(2)}</td>
                            <td>¥{transaction.amount.toFixed(2)}</td>
                            <td>¥{transaction.commission.toFixed(2)}</td>
                            <td>{transaction.transactionDate}</td>
                            <td>{transaction.notes || "-"}</td>
                            <td className="stock-actions" onClick={(e) => e.stopPropagation()}>
                              <div className="action-buttons">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteTransaction(transaction.id);
                                  }}
                                  className="action-btn delete-btn"
                                  title={t("common.delete") || "Delete"}
                                >
                                  <Icon name="delete" size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
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

        {expandedCard === "timeseries" && positions.length > 0 && (
          <div className="data-table-section">
            <PortfolioTimeseriesCard onStockSelect={onStockSelect} />
          </div>
        )}

        {!expandedCard && (
          <div className="data-table-empty">
            <div className="empty-message">{t("dashboard.selectCard")}</div>
          </div>
        )}
      </div>

      <AddPositionDialog
        isOpen={showAddPositionDialog}
        onClose={() => setShowAddPositionDialog(false)}
        onAdd={handleAddPosition}
      />

      <EditPositionDialog
        isOpen={showEditPositionDialog}
        position={editingPosition}
        onClose={() => {
          setShowEditPositionDialog(false);
          setEditingPosition(null);
        }}
        onUpdate={handleUpdatePosition}
      />

      <AddTransactionDialog
        isOpen={showAddTransactionDialog}
        onClose={() => setShowAddTransactionDialog(false)}
        onAdd={handleUpdatePosition}
      />
    </div>
  );
};

export default FavoritesDashboard;
