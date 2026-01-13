import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import "./StockSearch.css";

interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
}

interface StockSearchProps {
  onSelect: (symbol: string, name: string) => void;
  loading?: boolean;
}

const StockSearch: React.FC<StockSearchProps> = ({ onSelect, loading }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchStocks = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    setSearching(true);
    setError(null);
    try {
      const stocks: StockInfo[] = await invoke("search_stocks", {
        query: searchQuery,
      });
      setResults(stocks);
      if (stocks.length === 0) {
        setError("No results found");
      }
    } catch (err) {
      console.error("Search error:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchStocks(query);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [query, searchStocks]);

  return (
    <div className="stock-search">
      <div className="search-input-container">
        <input
          type="text"
          className="search-input"
          placeholder={t("app.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
        />
        {searching && <div className="search-spinner"></div>}
      </div>
      {error && <div className="search-error">{error}</div>}
      <div className="search-results">
        {results.map((stock) => (
          <div
            key={stock.symbol}
            className="search-result-item"
            onClick={() => {
              onSelect(stock.symbol, stock.name);
              setQuery("");
              setResults([]);
              setError(null);
            }}
          >
            <div className="result-symbol">{stock.symbol}</div>
            <div className="result-name">{stock.name}</div>
            <div className="result-exchange">{stock.exchange}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockSearch;

