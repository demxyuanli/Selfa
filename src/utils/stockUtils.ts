// Utility functions for stock operations

export interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
}

// Known market index symbols (not sector/industry indices)
const MARKET_INDEX_SYMBOLS = new Set([
  "000001", // Shanghai Composite Index
  "399001", // Shenzhen Component Index
  "000688", // STAR 50 Index
  "399006", // ChiNext Index
  "000300", // CSI 300 Index
  "000016", // SSE 50 Index
  "399005", // SME Price Index
]);

/**
 * Check if a stock symbol is a sector/industry/concept index or market index
 * Based on East Money API conventions:
 * - BK prefix: sector/industry/concept indices (e.g., BK0477)
 * - secid format "90.BK####": sector/industry/concept indices
 * - secid format "2.####": concept/industry sector indices (other market category)
 * - exchange "BK": sector/industry/concept indices
 * - Known market index symbols: market indices (e.g., 000001, 399001)
 * 
 * @param symbol Stock symbol to check (can be code like "BK0477" or secid like "90.BK0477" or "2.932094")
 * @param exchange Optional exchange field (if provided, "BK" indicates sector index)
 * @returns true if the symbol is an index (sector/industry/concept or market index)
 */
export function isIndexStock(symbol: string, exchange?: string): boolean {
  if (!symbol) return false;
  
  // Check exchange field first (most reliable)
  // East Money API sets exchange to "BK" for sector/industry/concept indices
  if (exchange === "BK") {
    return true;
  }
  
  // Check if symbol contains secid format
  // Format: "市场代码.证券代码"
  if (symbol.includes(".")) {
    const parts = symbol.split(".");
    if (parts.length === 2) {
      const marketCode = parts[0];
      const code = parts[1];
      
      // Market code 90 = sector/block market (BK indices)
      if (marketCode === "90" && code.startsWith("BK")) {
        return true;
      }
      
      // Market code 2 = other market category (concept/industry sector indices)
      // These are typically concept or industry sector indices, not regular stocks
      if (marketCode === "2") {
        return true;
      }
    }
  }
  
  // Check if it's a sector/block code (BK prefix)
  // East Money uses BK prefix for sector/industry/concept indices
  if (symbol.startsWith("BK")) {
    return true;
  }
  
  // Check if it's a known market index (not sector/industry/concept)
  if (MARKET_INDEX_SYMBOLS.has(symbol)) {
    return true;
  }
  
  return false;
}

/**
 * Normalize symbol to a canonical form for comparison
 * Converts secid formats to standard code format
 * @param symbol Symbol to normalize
 * @returns Normalized symbol code
 */
function normalizeSymbol(symbol: string): string {
  if (!symbol) return symbol;
  
  // If it's a secid format (contains dot), extract the code part
  if (symbol.includes(".")) {
    const parts = symbol.split(".");
    if (parts.length === 2) {
      return parts[1]; // Return the code part
    }
  }
  
  return symbol;
}

/**
 * Filter stocks to separate regular stocks and indices
 * Removes duplicates based on normalized symbol and name
 * @param stocks Array of stocks with quotes
 * @returns Object with regularStocks and indices arrays (deduplicated)
 */
export function separateStocksAndIndices<T extends { stock: StockInfo }>(
  stocks: T[]
): { regularStocks: T[]; indices: T[] } {
  const regularStocks: T[] = [];
  const indices: T[] = [];
  const seenIndices = new Set<string>();
  const seenStocks = new Set<string>();
  
  for (const stock of stocks) {
    const normalizedSymbol = normalizeSymbol(stock.stock.symbol);
    if (isIndexStock(stock.stock.symbol, stock.stock.exchange)) {
      // Check for duplicates in indices (by symbol or by name if symbol is different)
      // First check by normalized symbol
      if (!seenIndices.has(normalizedSymbol)) {
        // Also check if there's already an index with the same name
        const hasDuplicateName = indices.some(idx => 
          idx.stock.name === stock.stock.name && 
          normalizeSymbol(idx.stock.symbol) !== normalizedSymbol
        );
        
        if (!hasDuplicateName) {
          seenIndices.add(normalizedSymbol);
          indices.push(stock);
        }
      }
    } else {
      // Check for duplicates in regular stocks
      if (!seenStocks.has(normalizedSymbol)) {
        seenStocks.add(normalizedSymbol);
        regularStocks.push(stock);
      }
    }
  }
  
  return { regularStocks, indices };
}
