import { invoke } from "@tauri-apps/api/core";

// 9:00-11:30, 13:00-15:30 (morning 540-690 min, afternoon 780-930 min)
export function isTradingHours(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  if (day === 0 || day === 6) return false; // Weekend

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // Morning: 8:30-12:05 (510-725), Afternoon: 12:55-16:05 (775-965)
  // Covers pre-market (9:15), lunch buffer, and post-market (15:05-15:30)
  return (totalMinutes >= 510 && totalMinutes <= 725) || (totalMinutes >= 775 && totalMinutes <= 965);
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap?: number;
  pe_ratio?: number;
  turnover?: number;
  high: number;
  low: number;
  open: number;
  previous_close: number;
}

export interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockDataBundle {
  symbol: string;
  quote: StockQuote | null;
  time_series: StockData[];
  intraday: StockData[];
}

class StockDataManager {
  private cache: Map<string, { data: StockDataBundle; timestamp: number }> = new Map();
  private pendingRequests: Map<string, Promise<StockDataBundle>> = new Map();
  private readonly CACHE_TTL = 10000; // 10 seconds

  async getStockData(symbol: string, forceRefresh = false): Promise<StockDataBundle> {
    // Check cache first
    if (!forceRefresh) {
      const cached = this.cache.get(symbol);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }
    }

    // Check if there's already a pending request for this symbol
    const pending = this.pendingRequests.get(symbol);
    if (pending) {
      return pending;
    }

    // Create new request
    const request = invoke<StockDataBundle>("get_stock_data_bundle", { symbol })
      .then((data) => {
        if (data.quote || data.time_series.length > 0 || data.intraday.length > 0) {
          this.cache.set(symbol, { data, timestamp: Date.now() });
        }
        this.pendingRequests.delete(symbol);
        return data;
      })
      .catch((error) => {
        this.pendingRequests.delete(symbol);
        throw error;
      });

    this.pendingRequests.set(symbol, request);
    return request;
  }

  async getBatchStockData(symbols: string[], forceRefresh = false): Promise<Map<string, StockDataBundle>> {
    const result = new Map<string, StockDataBundle>();
    const needFetch: string[] = [];

    // Check cache for all symbols
    for (const symbol of symbols) {
      if (!forceRefresh) {
        const cached = this.cache.get(symbol);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
          const data = cached.data;
          if (data.quote || data.time_series.length > 0 || data.intraday.length > 0) {
            result.set(symbol, data);
            continue;
          }
        }
      }
      needFetch.push(symbol);
    }

    // Fetch missing data
    if (needFetch.length > 0) {
      try {
        const fetched = await invoke<Record<string, StockDataBundle>>("get_batch_stock_data_bundle", {
          symbols: needFetch,
        });

        const incompleteSymbols: string[] = [];
        for (const [symbol, data] of Object.entries(fetched)) {
          if (data.quote || data.time_series.length > 0 || data.intraday.length > 0) {
            this.cache.set(symbol, { data, timestamp: Date.now() });
            result.set(symbol, data);
          } else {
            incompleteSymbols.push(symbol);
          }
        }

        // Retry incomplete data individually
        for (const symbol of incompleteSymbols) {
          try {
            const data = await this.getStockData(symbol, true);
            if (data.quote || data.time_series.length > 0 || data.intraday.length > 0) {
              result.set(symbol, data);
            }
          } catch (err) {
            console.error(`Failed to fetch data for ${symbol}:`, err);
          }
        }
      } catch (error) {
        console.error("Failed to fetch batch stock data:", error);
        // Fallback to individual requests for failed symbols
        for (const symbol of needFetch) {
          if (!result.has(symbol)) {
            try {
              const data = await this.getStockData(symbol, forceRefresh);
              if (data.quote || data.time_series.length > 0 || data.intraday.length > 0) {
                result.set(symbol, data);
              }
            } catch (err) {
              console.error(`Failed to fetch data for ${symbol}:`, err);
            }
          }
        }
      }
    }

    return result;
  }

  getCachedData(symbol: string): StockDataBundle | null {
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  clearCache(symbol?: string): void {
    if (symbol) {
      this.cache.delete(symbol);
    } else {
      this.cache.clear();
    }
  }

  // Helper methods to extract specific data from bundle
  getQuote(symbol: string): StockQuote | null {
    const bundle = this.getCachedData(symbol);
    return bundle?.quote || null;
  }

  getTimeSeries(symbol: string): StockData[] {
    const bundle = this.getCachedData(symbol);
    return bundle?.time_series || [];
  }

  getIntraday(symbol: string): StockData[] {
    const bundle = this.getCachedData(symbol);
    return bundle?.intraday || [];
  }

  getCurrentPrice(symbol: string): number | null {
    const quote = this.getQuote(symbol);
    return quote?.price || null;
  }

  getPreviousClose(symbol: string): number | null {
    const quote = this.getQuote(symbol);
    return quote?.previous_close || null;
  }

  getChangePercent(symbol: string): number | null {
    const quote = this.getQuote(symbol);
    return quote?.change_percent || null;
  }
}

export const stockDataManager = new StockDataManager();
