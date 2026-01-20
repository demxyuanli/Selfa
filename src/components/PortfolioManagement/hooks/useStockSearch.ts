import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StockInfo } from "../types";

export function useStockSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [favoriteStocks, setFavoriteStocks] = useState<StockInfo[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadFavoriteStocks = useCallback(async () => {
    try {
      const stocks: StockInfo[] = await invoke("get_stocks_by_group", { groupName: null });
      setFavoriteStocks(stocks);
    } catch (err) {
      console.error("Error loading favorite stocks:", err);
      setFavoriteStocks([]);
    }
  }, []);

  const searchStocks = useCallback(
    async (query: string) => {
      const queryLower = query.trim().toLowerCase();

      if (!queryLower) {
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }

      const matchedFavorites = favoriteStocks.filter(
        (stock) => stock.symbol.toLowerCase().includes(queryLower) || stock.name.toLowerCase().includes(queryLower)
      );

      if (matchedFavorites.length > 0) {
        setSearchResults(matchedFavorites);
        setShowDropdown(true);
        setSearching(false);
      } else {
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
      }
    },
    [favoriteStocks]
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchStocks(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchStocks]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
         inputRef.current && !inputRef.current.contains(event.target as Node))
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    searching,
    showDropdown,
    setShowDropdown,
    favoriteStocks,
    loadFavoriteStocks,
    inputRef,
    dropdownRef,
  };
}
