import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { stockDataManager } from "../../../services/StockDataManager";
import { PortfolioPosition, PortfolioTransaction } from "../types";

export function usePortfolio() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    try {
      const positionsData: Array<[number, string, string, number, number, number | null]> = await invoke("get_portfolio_positions");

      // Fetch all stock data bundles using stockDataManager
      const positionSymbols = positionsData.map(([_, symbol]) => symbol);
      const stockBundles = await stockDataManager.getBatchStockData(positionSymbols);
      
      const positionsWithPrices = positionsData.map(([id, symbol, name, quantity, avgCost, currentPrice]) => {
        const bundle = stockBundles.get(symbol);
        let price = currentPrice || avgCost;
        let change_percent: number | undefined = undefined;

        // Get price from bundle
        if (bundle?.quote) {
          if (bundle.quote.price && bundle.quote.price > 0) {
            price = bundle.quote.price;
          } else if (bundle.quote.previous_close && bundle.quote.previous_close > 0) {
            price = bundle.quote.previous_close;
          }
          change_percent = bundle.quote.change_percent;
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
          currentPrice: price,
          marketValue,
          profit,
          profitPercent,
          change_percent,
        } as PortfolioPosition;
      });

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
