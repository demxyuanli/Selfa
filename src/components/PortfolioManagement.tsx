import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import ChartDialog from "./ChartDialog";
import "./StockAnalysis.css";
import "./PortfolioManagement.css";

interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
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

interface PortfolioTransaction {
  id: number;
  symbol: string;
  transactionType: "buy" | "sell";
  quantity: number;
  price: number;
  amount: number;
  commission: number;
  transactionDate: string;
  notes?: string;
}

const PortfolioManagement: React.FC = () => {
  const { t } = useTranslation();
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  const [showAddPositionDialog, setShowAddPositionDialog] = useState(false);
  const [showAddTransactionDialog, setShowAddTransactionDialog] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [quantity, setQuantity] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [commission, setCommission] = useState(0);
  const [transactionNotes, setTransactionNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQueryTransaction, setSearchQueryTransaction] = useState("");
  const [searchResultsTransaction, setSearchResultsTransaction] = useState<StockInfo[]>([]);
  const [searchingTransaction, setSearchingTransaction] = useState(false);
  const [showDropdownTransaction, setShowDropdownTransaction] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputTransactionRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownTransactionRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReactECharts>(null);

  // Refresh prices for all positions
  const refreshPrices = async () => {
    if (positions.length === 0) return;

    setLoading(true);
    try {
      // Update current prices for all positions
      await Promise.all(
        positions.map(async (position) => {
          try {
            const quote = await invoke<any>("get_stock_quote", { symbol: position.symbol });
            // Use current price if available, otherwise use previous close price
            const newPrice = quote.price || quote.previous_close;
            
            // Only update if we got a valid price
            if (newPrice && newPrice > 0) {
              // Update price in database
              await invoke("update_portfolio_position_price", { symbol: position.symbol, currentPrice: newPrice });

              // Update local state with correct profit calculation
              setPositions(prev => prev.map(p =>
                p.id === position.id
                  ? {
                      ...p,
                      currentPrice: newPrice,
                      marketValue: p.quantity * newPrice,
                      profit: (newPrice - p.avgCost) * p.quantity,
                      profitPercent: p.avgCost > 0
                        ? ((newPrice - p.avgCost) / p.avgCost) * 100
                        : 0
                    }
                  : p
              ));
            }
          } catch (err) {
            console.debug("Failed to refresh price for", position.symbol, err);
          }
        })
      );
    } catch (err) {
      console.error("Error refreshing prices:", err);
    } finally {
      setLoading(false);
    }
  };

  // Load portfolio data
  const loadPortfolio = async () => {
    setLoading(true);
    try {
      // Load positions from database
      const positionsData: Array<[number, string, string, number, number, number | null]> =
        await invoke("get_portfolio_positions");

      // For performance, only update prices for positions that haven't been updated recently
      // or when explicitly requested via refresh button
      const shouldUpdatePrices = false; // Set to true only when refresh button is clicked

      const positionsWithPrices = await Promise.all(
        positionsData.map(async ([id, symbol, name, quantity, avgCost, currentPrice]) => {
          let price = currentPrice || avgCost;

          // Only fetch current price when explicitly refreshing or when we don't have a stored price
          if (shouldUpdatePrices || !currentPrice) {
            try {
              const quote = await invoke<any>("get_stock_quote", { symbol });
              // Use current price if available, otherwise use previous close price
              price = quote.price || quote.previous_close || avgCost;

              // Update price in database only when we fetched new data
              if (shouldUpdatePrices) {
                await invoke("update_portfolio_position_price", { symbol, currentPrice: price });
              }
            } catch (err) {
              // Use stored price if fetch fails
              console.debug("Failed to fetch price for", symbol, err);
            }
          }

          // Ensure price is valid (use avgCost as fallback)
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
            currentPrice: price,
            marketValue,
            profit,
            profitPercent,
          } as PortfolioPosition;
        })
      );

      setPositions(positionsWithPrices);

      // Load transactions from database
      const transactionsData: Array<[number, string, string, number, number, number, number, string, string | null]> =
        await invoke("get_portfolio_transactions", { symbol: null });

      const loadedTransactions = transactionsData.map(
        ([id, symbol, transactionType, quantity, price, amount, commission, transactionDate, notes]) => ({
          id,
          symbol,
          transactionType: transactionType as "buy" | "sell",
          quantity,
          price,
          amount,
          commission,
          transactionDate,
          notes: notes || undefined,
        } as PortfolioTransaction)
      );

      setTransactions(loadedTransactions);
    } catch (err) {
      console.error("Error loading portfolio:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortfolio();
  }, []);

  // Stock search for position dialog
  const searchStocks = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setSearching(true);
    try {
      const results: StockInfo[] = await invoke("search_stocks", {
        query: query,
      });
      setSearchResults(results);
      setShowDropdown(true);
    } catch (err) {
      console.error("Search error:", err);
      setSearchResults([]);
      setShowDropdown(false);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!searchQuery) {
      setShowDropdown(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      searchStocks(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchStocks]);

  // Stock search for transaction dialog
  const searchStocksTransaction = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResultsTransaction([]);
      setShowDropdownTransaction(false);
      return;
    }

    setSearchingTransaction(true);
    try {
      const results: StockInfo[] = await invoke("search_stocks", {
        query: query,
      });
      setSearchResultsTransaction(results);
      setShowDropdownTransaction(true);
    } catch (err) {
      console.error("Search error:", err);
      setSearchResultsTransaction([]);
      setShowDropdownTransaction(false);
    } finally {
      setSearchingTransaction(false);
    }
  }, []);

  useEffect(() => {
    if (!searchQueryTransaction) {
      setShowDropdownTransaction(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      searchStocksTransaction(searchQueryTransaction);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQueryTransaction, searchStocksTransaction]);

  // Handle click outside for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
         inputRef.current && !inputRef.current.contains(event.target as Node)) ||
        (dropdownTransactionRef.current && !dropdownTransactionRef.current.contains(event.target as Node) &&
         inputTransactionRef.current && !inputTransactionRef.current.contains(event.target as Node))
      ) {
        setShowDropdown(false);
        setShowDropdownTransaction(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Calculate portfolio statistics
  const portfolioStats = useMemo(() => {
    const totalCost = positions.reduce((sum, pos) => sum + pos.avgCost * pos.quantity, 0);
    const totalValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0);
    const totalProfit = positions.reduce((sum, pos) => sum + pos.profit, 0);
    const totalProfitPercent = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    return {
      totalCost,
      totalValue,
      totalProfit,
      totalProfitPercent,
      positionCount: positions.length,
    };
  }, [positions]);

  // Chart option for portfolio visualization
  const chartOption = useMemo(() => {
    if (positions.length === 0) return {};

    const totalValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0);

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          const pos = positions[params.dataIndex];
          const percentage = totalValue > 0 ? (pos.marketValue / totalValue * 100) : 0;
          return `${pos.name} (${pos.symbol})<br/>
                  市值: ¥${pos.marketValue.toFixed(2)}<br/>
                  占比: ${percentage.toFixed(2)}%<br/>
                  成本: ¥${(pos.avgCost * pos.quantity).toFixed(2)}<br/>
                  盈亏: ${pos.profitPercent >= 0 ? "+" : ""}${pos.profitPercent.toFixed(2)}%<br/>
                  持仓: ${pos.quantity}股`;
        },
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#555",
        textStyle: { color: "#ccc" },
      },
      legend: {
        data: positions.map((p) => p.symbol),
        textStyle: { color: "#858585", fontSize: 10 },
        top: 0,
        type: "scroll",
      },
      series: [
        {
          name: t("portfolio.portfolio"),
          type: "pie",
          radius: ["40%", "70%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: "#1e1e1e",
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: (params: any) => {
              // Use ECharts built-in percent calculation
              const percentage = params.percent || 0;
              return `${params.name}\n${percentage.toFixed(1)}%`;
            },
            fontSize: 10,
            color: "#ccc",
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 12,
              fontWeight: "bold",
            },
          },
          data: positions.map((pos) => ({
            value: pos.marketValue,
            name: pos.symbol,
            itemStyle: {
              color: pos.profitPercent >= 0 ? "#4caf50" : "#f44336",
            },
          })),
        },
      ],
    };
  }, [positions, t]);

  const handleStockSelect = (stock: StockInfo) => {
    setSelectedSymbol(stock.symbol);
    setSelectedName(stock.name);
    setSearchQuery(stock.symbol);
    setShowDropdown(false);
  };

  const handleStockSelectTransaction = (stock: StockInfo) => {
    setSelectedSymbol(stock.symbol);
    setSearchQueryTransaction(stock.symbol);
    setShowDropdownTransaction(false);
  };

  const handleAddPosition = async () => {
    const qty = quantity.trim() === "" ? 0 : parseInt(quantity) || 0;
    const prc = price.trim() === "" ? 0 : parseFloat(price) || 0;

    if (!selectedSymbol || !selectedName || qty <= 0 || prc <= 0) {
      alert(t("portfolio.invalidInput"));
      return;
    }

    try {
      console.log("Adding position:", { selectedSymbol, selectedName, qty, prc });

      // Use the entered price as current price initially (no network call to avoid blocking)
      const currentPrice = prc;

      console.log("Calling add_portfolio_position with:", {
        symbol: selectedSymbol,
        name: selectedName,
        qty,
        avg_cost: prc,
        current_price: currentPrice,
      });

      // Call backend API to add position
      const id = await invoke<number>("add_portfolio_position", {
        symbol: selectedSymbol,
        name: selectedName,
        quantity: qty,
        avgCost: prc,
        currentPrice: currentPrice,
      });

      console.log("Position added with ID:", id);

      // Calculate profit based on current price and average cost
      // Profit = (current price - average cost) * quantity
      // Profit percent = ((current price - average cost) / average cost) * 100
      const marketValue = qty * currentPrice;
      const profit = (currentPrice - prc) * qty;
      const profitPercent = prc > 0 ? ((currentPrice - prc) / prc) * 100 : 0;

      // Add the new position directly to the local state instead of reloading everything
      const newPosition: PortfolioPosition = {
        id,
        symbol: selectedSymbol,
        name: selectedName,
        quantity: qty,
        avgCost: prc,
        currentPrice,
        marketValue,
        profit,
        profitPercent,
      };

      setPositions(prev => [...prev, newPosition]);

      setShowAddPositionDialog(false);
      setSelectedSymbol("");
      setSelectedName("");
      setSearchQuery("");
      setQuantity("");
      setPrice("");
    } catch (err) {
      console.error("Error adding position:", err);
      alert(t("portfolio.addError"));
    }
  };

  const handleAddTransaction = async (type: "buy" | "sell") => {
    const qty = quantity.trim() === "" ? 0 : parseInt(quantity) || 0;
    const prc = price.trim() === "" ? 0 : parseFloat(price) || 0;

    if (!selectedSymbol || qty <= 0 || prc <= 0) {
      alert(t("portfolio.invalidInput"));
      return;
    }

    try {
      // Call backend API to add transaction
      const transactionDate = new Date().toISOString().split("T")[0];
      await invoke<number>("add_portfolio_transaction", {
        symbol: selectedSymbol,
        transactionType: type,
        quantity: qty,
        price: prc,
        commission,
        transactionDate,
        notes: transactionNotes || null,
      });
      
      // Reload portfolio to get updated positions and transactions
      await loadPortfolio();
      
      setShowAddTransactionDialog(false);
      setSelectedSymbol("");
      setSearchQueryTransaction("");
      setQuantity("");
      setPrice("");
      setCommission(0);
      setTransactionNotes("");
    } catch (err) {
      console.error("Error adding transaction:", err);
      alert(t("portfolio.addError"));
    }
  };

  const handleDeletePosition = async (id: number) => {
    if (confirm(t("portfolio.confirmDelete"))) {
      try {
        // Call backend API to delete position
        await invoke("delete_portfolio_position", { id });

        // Reload positions to get updated data
        await loadPortfolio();
      } catch (err) {
        console.error("Error deleting position:", err);
        alert(t("portfolio.deleteError"));
      }
    }
  };

  const handleDeleteTransaction = async (id: number) => {
    if (confirm(t("portfolio.confirmDelete"))) {
      try {
        // Call backend API to delete transaction
        await invoke("delete_portfolio_transaction", { id });

        // Reload portfolio to get updated data
        await loadPortfolio();
      } catch (err) {
        console.error("Error deleting transaction:", err);
        alert(t("portfolio.deleteError"));
      }
    }
  };

  return (
    <div className="portfolio-management">
      <div className="portfolio-header">
        <div className="portfolio-stats">
          <div className="stat-item">
            <span className="stat-label">{t("portfolio.totalValue")}:</span>
            <span className="stat-value">¥{portfolioStats.totalValue.toFixed(2)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t("portfolio.totalCost")}:</span>
            <span className="stat-value">¥{portfolioStats.totalCost.toFixed(2)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t("portfolio.totalProfit")}:</span>
            <span className={`stat-value ${portfolioStats.totalProfit >= 0 ? "positive" : "negative"}`}>
              {portfolioStats.totalProfit >= 0 ? "+" : ""}¥{portfolioStats.totalProfit.toFixed(2)} ({portfolioStats.totalProfitPercent.toFixed(2)}%)
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t("portfolio.positionCount")}:</span>
            <span className="stat-value">{portfolioStats.positionCount}</span>
          </div>
        </div>
        <div className="portfolio-actions">
          <button onClick={() => {
            setQuantity("");
            setPrice("");
            setSelectedSymbol("");
            setSelectedName("");
            setSearchQuery("");
            setShowAddPositionDialog(true);
          }} className="portfolio-btn primary">
            {t("portfolio.addPosition")}
          </button>
          <button onClick={() => {
            setQuantity("");
            setPrice("");
            setSelectedSymbol("");
            setSearchQueryTransaction("");
            setCommission(0);
            setTransactionNotes("");
            setShowAddTransactionDialog(true);
          }} className="portfolio-btn">
            {t("portfolio.addTransaction")}
          </button>
          <button onClick={refreshPrices} className="portfolio-btn">
            {t("common.refresh")}
          </button>
        </div>
      </div>

      <div className="portfolio-content">
        <div className="portfolio-positions">
          <div className="section-header">{t("portfolio.positions")}</div>
          <div className="positions-table">
            <table>
              <thead>
                <tr>
                  <th>{t("portfolio.symbol")}</th>
                  <th>{t("portfolio.name")}</th>
                  <th>{t("portfolio.quantity")}</th>
                  <th>{t("portfolio.avgCost")}</th>
                  <th>{t("portfolio.currentPrice")}</th>
                  <th>{t("portfolio.marketValue")}</th>
                  <th>{t("portfolio.profit")}</th>
                  <th>{t("portfolio.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-cell">{t("portfolio.noPositions")}</td>
                  </tr>
                ) : (
                  positions.map((position) => (
                    <tr key={position.id}>
                      <td>{position.symbol}</td>
                      <td>{position.name}</td>
                      <td>{position.quantity}</td>
                      <td>¥{position.avgCost.toFixed(2)}</td>
                      <td>¥{position.currentPrice.toFixed(2)}</td>
                      <td>¥{position.marketValue.toFixed(2)}</td>
                      <td className={position.profit >= 0 ? "positive" : "negative"}>
                        {position.profit >= 0 ? "+" : ""}¥{position.profit.toFixed(2)} ({position.profitPercent.toFixed(2)}%)
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeletePosition(position.id)}
                          className="delete-btn"
                          title={t("portfolio.delete")}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="portfolio-transactions">
          <div className="section-header">{t("portfolio.transactions")}</div>
          <div className="transactions-table">
            <table>
              <thead>
                <tr>
                  <th>{t("portfolio.symbol")}</th>
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
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="empty-cell">{t("portfolio.noTransactions")}</td>
                  </tr>
                ) : (
                  transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>{transaction.symbol}</td>
                      <td className={transaction.transactionType === "buy" ? "positive" : "negative"}>
                        {transaction.transactionType === "buy" ? t("portfolio.buy") : t("portfolio.sell")}
                      </td>
                      <td>{transaction.quantity}</td>
                      <td>¥{transaction.price.toFixed(2)}</td>
                      <td>¥{transaction.amount.toFixed(2)}</td>
                      <td>¥{transaction.commission.toFixed(2)}</td>
                      <td>{transaction.transactionDate}</td>
                      <td>{transaction.notes || "-"}</td>
                      <td>
                        <button
                          onClick={() => handleDeleteTransaction(transaction.id)}
                          className="delete-btn"
                          title={t("portfolio.delete")}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="portfolio-chart">
          <div className="section-header">
            {t("portfolio.portfolioDistribution")}
            <button
              className="chart-zoom-button-overlay"
              onClick={() => setIsChartDialogOpen(true)}
              title={t("chart.zoom")}
            >
              ZO
            </button>
          </div>
          <div className="chart-content">
            {Object.keys(chartOption).length === 0 ? (
              <div className="no-data">{t("portfolio.noData")}</div>
            ) : (
              <ReactECharts
                ref={chartRef}
                option={chartOption}
                style={{ height: "100%", width: "100%" }}
                opts={{ renderer: "canvas" }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Add Position Dialog */}
      {showAddPositionDialog && (
        <div
          className="dialog-overlay"
          onClick={() => {
            setShowAddPositionDialog(false);
            setSearchQuery("");
            setSelectedSymbol("");
            setSelectedName("");
            setQuantity("");
            setPrice("");
          }}
        >
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">{t("portfolio.addPosition")}</div>
            <div className="dialog-body">
              <div className="form-group">
                <label>{t("portfolio.symbol")}</label>
                <div className="search-input-wrapper">
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSelectedSymbol(e.target.value);
                    }}
                    placeholder={t("portfolio.symbolPlaceholder")}
                    className="form-input"
                  />
                  {searching && <span className="search-loading">...</span>}
                  {showDropdown && searchResults.length > 0 && (
                    <div ref={dropdownRef} className="search-dropdown">
                      {searchResults.map((stock) => (
                        <div
                          key={stock.symbol}
                          className="search-dropdown-item"
                          onClick={() => handleStockSelect(stock)}
                        >
                          <span className="search-symbol">{stock.symbol}</span>
                          <span className="search-name">{stock.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label>{t("portfolio.name")}</label>
                <input
                  type="text"
                  value={selectedName}
                  onChange={(e) => setSelectedName(e.target.value)}
                  placeholder={t("portfolio.namePlaceholder")}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>{t("portfolio.quantity")}</label>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d+$/.test(val)) {
                      setQuantity(val);
                    }
                  }}
                  placeholder={t("portfolio.quantityPlaceholder") || ""}
                />
              </div>
              <div className="form-group">
                <label>{t("portfolio.avgCost")}</label>
                <input
                  type="text"
                  value={price}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d*\.?\d*$/.test(val)) {
                      setPrice(val);
                    }
                  }}
                  placeholder={t("portfolio.pricePlaceholder") || ""}
                />
              </div>
            </div>
            <div className="dialog-footer">
              <button onClick={handleAddPosition} className="dialog-btn primary">
                {t("portfolio.add")}
              </button>
              <button
                onClick={() => {
                  setShowAddPositionDialog(false);
                  setSearchQuery("");
                  setSelectedSymbol("");
                  setSelectedName("");
                  setQuantity("");
                  setPrice("");
                }}
                className="dialog-btn"
              >
                {t("settings.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Dialog */}
      {showAddTransactionDialog && (
        <div
          className="dialog-overlay"
          onClick={() => {
            setShowAddTransactionDialog(false);
            setSearchQueryTransaction("");
            setSelectedSymbol("");
            setQuantity("");
            setPrice("");
            setCommission(0);
            setTransactionNotes("");
          }}
        >
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">{t("portfolio.addTransaction")}</div>
            <div className="dialog-body">
              <div className="form-group">
                <label>{t("portfolio.symbol")}</label>
                <div className="search-input-wrapper">
                  <input
                    ref={inputTransactionRef}
                    type="text"
                    value={searchQueryTransaction}
                    onChange={(e) => {
                      setSearchQueryTransaction(e.target.value);
                      setSelectedSymbol(e.target.value);
                    }}
                    placeholder={t("portfolio.symbolPlaceholder")}
                    className="form-input"
                  />
                  {searchingTransaction && <span className="search-loading">...</span>}
                  {showDropdownTransaction && searchResultsTransaction.length > 0 && (
                    <div ref={dropdownTransactionRef} className="search-dropdown">
                      {searchResultsTransaction.map((stock) => (
                        <div
                          key={stock.symbol}
                          className="search-dropdown-item"
                          onClick={() => handleStockSelectTransaction(stock)}
                        >
                          <span className="search-symbol">{stock.symbol}</span>
                          <span className="search-name">{stock.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label>{t("portfolio.transactionType")}</label>
                <select className="form-select">
                  <option value="buy">{t("portfolio.buy")}</option>
                  <option value="sell">{t("portfolio.sell")}</option>
                </select>
              </div>
              <div className="form-group">
                <label>{t("portfolio.quantity")}</label>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d+$/.test(val)) {
                      setQuantity(val);
                    }
                  }}
                  placeholder={t("portfolio.quantityPlaceholder") || ""}
                />
              </div>
              <div className="form-group">
                <label>{t("portfolio.price")}</label>
                <input
                  type="text"
                  value={price}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d*\.?\d*$/.test(val)) {
                      setPrice(val);
                    }
                  }}
                  placeholder={t("portfolio.pricePlaceholder") || ""}
                />
              </div>
              <div className="form-group">
                <label>{t("portfolio.commission")}</label>
                <input
                  type="number"
                  value={commission}
                  onChange={(e) => setCommission(parseFloat(e.target.value) || 0)}
                  min={0}
                  step={0.01}
                />
              </div>
              <div className="form-group">
                <label>{t("portfolio.notes")}</label>
                <textarea
                  value={transactionNotes}
                  onChange={(e) => setTransactionNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className="dialog-footer">
              <button
                onClick={() => handleAddTransaction("buy")}
                className="dialog-btn primary"
              >
                {t("portfolio.buy")}
              </button>
              <button
                onClick={() => handleAddTransaction("sell")}
                className="dialog-btn"
                style={{ backgroundColor: "#f44336" }}
              >
                {t("portfolio.sell")}
              </button>
              <button
                onClick={() => {
                  setShowAddTransactionDialog(false);
                  setSearchQueryTransaction("");
                  setSelectedSymbol("");
                  setQuantity("");
                  setPrice("");
                  setCommission(0);
                  setTransactionNotes("");
                }}
                className="dialog-btn"
              >
                {t("settings.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ChartDialog
        isOpen={isChartDialogOpen}
        onClose={() => setIsChartDialogOpen(false)}
        title={`${t("portfolio.portfolioDistribution")} - ${t("chart.title")}`}
        chartOption={chartOption}
      />
    </div>
  );
};

export default PortfolioManagement;
