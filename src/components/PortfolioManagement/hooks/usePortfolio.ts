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
    await loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  return {
    positions,
    transactions,
    loading,
    loadPortfolio,
    refreshPrices,
  };
}
