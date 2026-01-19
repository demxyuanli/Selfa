import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StockInfo, StockQuote, StockWithTags, TagInfo, GroupData } from "../types";

export const useSidebarData = (ungroupedGroup: string) => {
  const [allStocks, setAllStocks] = useState<StockWithTags[]>([]);
  const [groupsData, setGroupsData] = useState<GroupData[]>([]);
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [tagStocks, setTagStocks] = useState<StockWithTags[]>([]);

  const loadTags = useCallback(async () => {
    try {
      const tags: TagInfo[] = await invoke("get_all_tags");
      setAllTags(tags);
    } catch (err) {
      console.error("Error loading tags:", err);
    }
  }, []);

  const loadAllStocks = useCallback(async () => {
    try {
      const stocksWithQuotes: Array<[StockInfo, StockQuote | null]> = await invoke("get_all_favorites_quotes");
      const stocksWithTagsAndQuotes: StockWithTags[] = await Promise.all(
        stocksWithQuotes.map(async ([stock, quote]) => {
          try {
            const tags: TagInfo[] = await invoke("get_stock_tags", { symbol: stock.symbol });
            return { ...stock, tags, quote };
          } catch {
            return { ...stock, tags: [], quote };
          }
        })
      );
      setAllStocks(stocksWithTagsAndQuotes);
    } catch (err) {
      console.error("Error loading stocks:", err);
      try {
        const stocks: StockInfo[] = await invoke("get_stocks_by_group", { groupName: null });
        const stocksWithTags: StockWithTags[] = await Promise.all(
          stocks.map(async (stock) => {
            try {
              const tags: TagInfo[] = await invoke("get_stock_tags", { symbol: stock.symbol });
              return { ...stock, tags };
            } catch {
              return { ...stock, tags: [] };
            }
          })
        );
        setAllStocks(stocksWithTags);
      } catch (fallbackErr) {
        console.error("Error loading stocks (fallback):", fallbackErr);
      }
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const groupList: string[] = await invoke("get_stock_groups");
      const allGroupNames = [ungroupedGroup, ...groupList];

      const stocksWithQuotes: Array<[StockInfo, StockQuote | null]> = await invoke("get_all_favorites_quotes");
      const quotesMap = new Map<string, StockQuote | null>();
      stocksWithQuotes.forEach(([stock, quote]) => {
        quotesMap.set(stock.symbol, quote);
      });

      const newGroupsData: GroupData[] = await Promise.all(
        allGroupNames.map(async (groupName) => {
          const stocks: StockInfo[] = await invoke("get_stocks_by_group", { groupName });
          const stocksWithTags: StockWithTags[] = await Promise.all(
            stocks.map(async (stock) => {
              try {
                const tags: TagInfo[] = await invoke("get_stock_tags", { symbol: stock.symbol });
                const quote = quotesMap.get(stock.symbol);
                return { ...stock, tags, quote };
              } catch {
                const quote = quotesMap.get(stock.symbol);
                return { ...stock, tags: [], quote };
              }
            })
          );
          return { name: groupName, stocks: stocksWithTags, expanded: false, quotes: quotesMap };
        })
      );

      setGroupsData(newGroupsData);
    } catch (err) {
      console.error("Error loading groups:", err);
      try {
        const groupList: string[] = await invoke("get_stock_groups");
        const allGroupNames = [ungroupedGroup, ...groupList];

        const newGroupsData: GroupData[] = await Promise.all(
          allGroupNames.map(async (groupName) => {
            const stocks: StockInfo[] = await invoke("get_stocks_by_group", { groupName });
            const stocksWithTags: StockWithTags[] = await Promise.all(
              stocks.map(async (stock) => {
                try {
                  const tags: TagInfo[] = await invoke("get_stock_tags", { symbol: stock.symbol });
                  return { ...stock, tags };
                } catch {
                  return { ...stock, tags: [] };
                }
              })
            );
            return { name: groupName, stocks: stocksWithTags, expanded: false };
          })
        );

        setGroupsData(newGroupsData);
      } catch (fallbackErr) {
        console.error("Error loading groups (fallback):", fallbackErr);
      }
    }
  }, [ungroupedGroup]);

  const loadStocksByTag = useCallback(async (tagId: number) => {
    try {
      const stocks: StockInfo[] = await invoke("get_stocks_by_tag", { tagId });

      const stocksWithQuotes: Array<[StockInfo, StockQuote | null]> = await invoke("get_all_favorites_quotes");
      const quotesMap = new Map<string, StockQuote | null>();
      stocksWithQuotes.forEach(([stock, quote]) => {
        quotesMap.set(stock.symbol, quote);
      });

      const stocksWithQuotesFiltered = stocks.map(stock => ({
        ...stock,
        tags: [],
        quote: quotesMap.get(stock.symbol) || null
      }));

      setTagStocks(stocksWithQuotesFiltered);
    } catch (err) {
      console.error("Error loading stocks by tag:", err);
      setTagStocks([]);
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadTags();
    loadAllStocks();
    loadGroups();
  }, [loadTags, loadAllStocks, loadGroups]);

  useEffect(() => {
    loadTags();
    loadAllStocks();
    loadGroups();
  }, [loadTags, loadAllStocks, loadGroups]);

  return {
    allStocks,
    setAllStocks,
    groupsData,
    setGroupsData,
    allTags,
    tagStocks,
    loadTags,
    loadAllStocks,
    loadGroups,
    loadStocksByTag,
    refreshAll,
  };
};
