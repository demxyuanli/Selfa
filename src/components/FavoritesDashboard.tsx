import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import PortfolioTimeseriesCard from "./PortfolioTimeseriesCard";
import Icon from "./Icon";
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

      setStocks(
        stocksData.map(([stock, quote]) => ({
          stock,
          quote,
        }))
      );

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

  // Independent async refresh functions for each data type
  const refreshStocks = useCallback(async () => {
    try {
      const stocksData = await invoke<Array<[StockInfo, StockQuote | null]>>("get_all_favorites_quotes");
      setStocks(
        stocksData.map(([stock, quote]) => ({
          stock,
          quote,
        }))
      );
    } catch (err) {
      console.debug("Failed to refresh stocks:", err);
    }
  }, []);

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
            <h3>{t("favorites.title")}</h3>
            {stocks.length === 0 ? (
              <div className="stocks-empty">{t("favorites.empty")}</div>
            ) : (
              <div className="stocks-table-container">
                <table className="stocks-table">
                  <thead>
                    <tr>
                      <th>{t("common.symbol")}</th>
                      <th>{t("common.name")}</th>
                      <th>{t("common.price")}</th>
                      <th>{t("common.change")}</th>
                      <th>{t("common.changePercent")}</th>
                      <th>{t("common.volume")}</th>
                      <th>{t("portfolio.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stocks.map(({ stock, quote }) => (
                      <tr
                        key={stock.symbol}
                        className={`stock-row ${quote ? (quote.change_percent > 0 ? "up" : quote.change_percent < 0 ? "down" : "") : ""}`}
                      >
                        <td className="stock-symbol" onClick={() => handleStockClick(stock)}>{stock.symbol}</td>
                        <td 
                          className={`stock-name ${
                            quote ? (quote.change_percent > 0 ? "up" : quote.change_percent < 0 ? "down" : "") : ""
                          }`}
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
                            <td className="stock-price" onClick={() => handleStockClick(stock)}>{quote.price.toFixed(2)}</td>
                            <td className={`stock-change ${quote.change > 0 ? "up" : quote.change < 0 ? "down" : ""}`} onClick={() => handleStockClick(stock)}>
                              {quote.change > 0 ? "+" : ""}
                              {quote.change.toFixed(2)}
                            </td>
                            <td className={`stock-change-percent ${quote.change_percent > 0 ? "up" : quote.change_percent < 0 ? "down" : ""}`} onClick={() => handleStockClick(stock)}>
                              {quote.change_percent > 0 ? "+" : ""}
                              {quote.change_percent.toFixed(2)}%
                            </td>
                            <td className="stock-volume" onClick={() => handleStockClick(stock)}>{(quote.volume / 10000).toFixed(0)}{t("common.tenThousand")}</td>
                            <td className="stock-actions" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditStock(stock);
                                }}
                                className="edit-btn"
                                title={t("portfolio.edit")}
                                style={{
                                  padding: "2px 6px",
                                  fontSize: "12px",
                                  background: "var(--bg-secondary)",
                                  border: "1px solid var(--border-color)",
                                  borderRadius: "3px",
                                  cursor: "pointer",
                                  color: "var(--text-primary)",
                                }}
                              >
                                <Icon name="edit" size={14} />
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td colSpan={4} className="stock-no-data" onClick={() => handleStockClick(stock)}>
                              {t("common.noData")}
                            </td>
                            <td className="stock-actions" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditStock(stock);
                                }}
                                className="edit-btn"
                                title={t("portfolio.edit")}
                                style={{
                                  padding: "2px 6px",
                                  fontSize: "12px",
                                  background: "var(--bg-secondary)",
                                  border: "1px solid var(--border-color)",
                                  borderRadius: "3px",
                                  cursor: "pointer",
                                  color: "var(--text-primary)",
                                }}
                              >
                                <Icon name="edit" size={14} />
                              </button>
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

        {expandedCard === "portfolio" && positions.length > 0 && (
          <div className="data-table-section">
                <h3>{t("portfolio.title")}</h3>
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
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => (
                    <tr
                      key={position.id}
                      className={`portfolio-row ${position.profit >= 0 ? "up" : "down"}`}
                      onClick={() => handleStockClick({ symbol: position.symbol, name: position.name, exchange: "" })}
                    >
                      <td className="portfolio-symbol">{position.symbol}</td>
                      <td className="portfolio-name">{position.name}</td>
                      <td className="portfolio-quantity">{position.quantity}</td>
                      <td className="portfolio-avg-cost">{position.avgCost.toFixed(2)}</td>
                      <td className="portfolio-price">{position.currentPrice.toFixed(2)}</td>
                      <td className="portfolio-market-value">{position.marketValue.toFixed(2)}</td>
                      <td className={`portfolio-profit ${position.profit >= 0 ? "up" : "down"}`}>
                        {position.profit >= 0 ? "+" : ""}{position.profit.toFixed(2)}
                      </td>
                      <td className={`portfolio-profit-percent ${position.profitPercent >= 0 ? "up" : "down"}`}>
                        {position.profitPercent >= 0 ? "+" : ""}{position.profitPercent.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
    </div>
  );
};

export default FavoritesDashboard;
