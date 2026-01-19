import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PortfolioPosition, PortfolioTransaction } from "../types";

export function usePortfolio() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    try {
      const positionsData: Array<[number, string, string, number, number, number | null]> = await invoke("get_portfolio_positions");
      const shouldUpdatePrices = false;

      const positionsWithPrices = await Promise.all(
        positionsData.map(async ([id, symbol, name, quantity, avgCost, currentPrice]) => {
          let price = currentPrice || avgCost;
          let change_percent: number | undefined = undefined;

          try {
            try {
              const quote = await invoke<any>("get_stock_quote", { symbol });
              if (quote && quote.price && quote.price > 0) {
                price = quote.price;
              } else if (quote && quote.previous_close && quote.previous_close > 0) {
                price = quote.previous_close;
              }
              if (quote && quote.change_percent !== undefined) {
                change_percent = quote.change_percent;
              }
            } catch (quoteErr) {
              console.debug("Failed to get quote for", symbol, quoteErr);
            }

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
                console.debug("Failed to get time series for", symbol, timeSeriesErr);
              }
            }

            if (shouldUpdatePrices && price && price > 0) {
              await invoke("update_portfolio_position_price", { symbol, currentPrice: price });
            }
          } catch (err) {
            console.debug("Failed to fetch price for", symbol, err);
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
            currentPrice: price,
            marketValue,
            profit,
            profitPercent,
            change_percent,
          } as PortfolioPosition;
        })
      );

      setPositions(positionsWithPrices);

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
        } as PortfolioTransaction)
      );

      setTransactions(loadedTransactions);
    } catch (err) {
      console.error("Error loading portfolio:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPrices = useCallback(async () => {
    if (positions.length === 0) return;

    setLoading(true);
    try {
      await Promise.all(
        positions.map(async (position) => {
          try {
            let newPrice: number | null = null;
            try {
              const quote = await invoke<any>("get_stock_quote", { symbol: position.symbol });
              if (quote && quote.price && quote.price > 0) {
                newPrice = quote.price;
              } else if (quote && quote.previous_close && quote.previous_close > 0) {
                newPrice = quote.previous_close;
              }
            } catch (quoteErr) {
              console.debug("Failed to get quote for", position.symbol, quoteErr);
            }

            if (!newPrice || newPrice <= 0) {
              try {
                const timeSeriesData = await invoke<any[]>("get_time_series", { symbol: position.symbol });
                if (timeSeriesData && timeSeriesData.length > 0) {
                  const latestData = timeSeriesData[timeSeriesData.length - 1];
                  if (latestData.close && latestData.close > 0) {
                    newPrice = latestData.close;
                  }
                }
              } catch (timeSeriesErr) {
                console.debug("Failed to get time series for", position.symbol, timeSeriesErr);
              }
            }

            if (newPrice && newPrice > 0) {
              await invoke("update_portfolio_position_price", { symbol: position.symbol, currentPrice: newPrice });

              let change_percent: number | undefined = undefined;
              try {
                const quote = await invoke<any>("get_stock_quote", { symbol: position.symbol });
                if (quote && quote.change_percent !== undefined) {
                  change_percent = quote.change_percent;
                }
              } catch (quoteErr) {
                console.debug("Failed to get quote for change_percent", position.symbol, quoteErr);
              }

              setPositions((prev) =>
                prev.map((p) =>
                  p.id === position.id
                    ? {
                        ...p,
                        currentPrice: newPrice!,
                        marketValue: p.quantity * newPrice!,
                        profit: (newPrice! - p.avgCost) * p.quantity,
                        profitPercent: p.avgCost > 0 ? ((newPrice! - p.avgCost) / p.avgCost) * 100 : 0,
                        change_percent: change_percent !== undefined ? change_percent : p.change_percent,
                      }
                    : p
                )
              );
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
  }, [positions]);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  return {
    positions,
    transactions,
    loading,
    loadPortfolio,
    refreshPrices,
    setPositions,
    setTransactions,
  };
}
