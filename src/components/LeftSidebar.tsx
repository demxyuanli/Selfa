import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import "./LeftSidebar.css";

interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
}

interface LeftSidebarProps {
  visible: boolean;
  onToggle: () => void;
  onStockSelect: (symbol: string, name: string) => void;
}

type LeftPanel = "toolbar" | "search" | "groups" | "favorites";

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  visible,
  onToggle,
  onStockSelect,
}) => {
  const { t } = useTranslation();
  const [activePanel, setActivePanel] = useState<LeftPanel>("toolbar");
  const [groups] = useState<string[]>(["Default", "自选股", "关注"]);
  const [selectedGroup, setSelectedGroup] = useState("Default");
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchStocks = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setError(null);
      return;
    }

    setSearching(true);
    setError(null);
    try {
      const results: StockInfo[] = await invoke("search_stocks", {
        query: query,
      });
      setSearchResults(results);
      if (results.length === 0) {
        setError("No results found");
      }
    } catch (err) {
      console.error("Search error:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchStocks(searchQuery);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchStocks]);

  const handleAddToFavorites = (stock: StockInfo) => {
    console.log("Add to favorites:", stock);
    setStocks([...stocks, stock]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleStockClick = (stock: StockInfo) => {
    onStockSelect(stock.symbol, stock.name);
  };

  return (
    <>
      <div className={`left-sidebar ${visible ? "expanded" : "collapsed"}`}>
        <div className="sidebar-icons-bar">
          <button
            className={`sidebar-icon ${activePanel === "toolbar" ? "active" : ""}`}
            onClick={() => {
              setActivePanel("toolbar");
              if (!visible) onToggle();
            }}
            title={t("sidebar.toolbar")}
          >
            ⚙
          </button>
          <button
            className={`sidebar-icon ${activePanel === "search" ? "active" : ""}`}
            onClick={() => {
              setActivePanel("search");
              if (!visible) onToggle();
            }}
            title={t("sidebar.search")}
          >
            🔍
          </button>
          <button
            className={`sidebar-icon ${activePanel === "groups" ? "active" : ""}`}
            onClick={() => {
              setActivePanel("groups");
              if (!visible) onToggle();
            }}
            title={t("sidebar.groups")}
          >
            📁
          </button>
          <button
            className={`sidebar-icon ${activePanel === "favorites" ? "active" : ""}`}
            onClick={() => {
              setActivePanel("favorites");
              if (!visible) onToggle();
            }}
            title={t("sidebar.favorites")}
          >
            ⭐
          </button>
        </div>
        {visible && (
          <div className="sidebar-expanded-content">
            <div className="sidebar-header">
              <span>{t("sidebar.stockGroups")}</span>
              <button onClick={onToggle} className="toggle-btn">◀</button>
            </div>
            <div className="sidebar-content">
          {activePanel === "toolbar" && (
            <div className="sidebar-panel">
              <div className="sidebar-toolbar">
                <button className="toolbar-btn" title={t("tool.add")}>+</button>
                <button className="toolbar-btn" title={t("tool.delete")}>−</button>
                <button className="toolbar-btn" title={t("tool.refresh")}>↻</button>
              </div>
            </div>
          )}
          {activePanel === "search" && (
            <div className="sidebar-panel">
              <div className="sidebar-search">
                <div className="search-input-container">
                  <input
                    type="text"
                    className="search-input"
                    placeholder={t("app.search")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searching && <div className="search-spinner"></div>}
                </div>
                {error && <div className="search-error">{error}</div>}
              </div>
              {searchResults.length > 0 && (
                <div className="search-results-list">
                  {searchResults.map((stock) => (
                    <div key={stock.symbol} className="search-result-item">
                      <div
                        className="result-content"
                        onClick={() => handleStockClick(stock)}
                      >
                        <div className="result-symbol">{stock.symbol}</div>
                        <div className="result-name">{stock.name}</div>
                      </div>
                      <button
                        className="add-favorite-btn"
                        onClick={() => handleAddToFavorites(stock)}
                        title="Add to favorites"
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {activePanel === "groups" && (
            <div className="sidebar-panel">
              <div className="stock-groups">
                {groups.map((group) => (
                  <div
                    key={group}
                    className={`group-item ${selectedGroup === group ? "active" : ""}`}
                    onClick={() => setSelectedGroup(group)}
                  >
                    {group}
                  </div>
                ))}
              </div>
            </div>
          )}
          {activePanel === "favorites" && (
            <div className="sidebar-panel">
              <div className="stock-list">
                {stocks.length === 0 ? (
                  <div className="empty-message">{t("sidebar.noFavorites")}</div>
                ) : (
                  stocks.map((stock) => (
                    <div
                      key={stock.symbol}
                      className="stock-item"
                      onClick={() => handleStockClick(stock)}
                    >
                      <div className="stock-symbol">{stock.symbol}</div>
                      <div className="stock-name">{stock.name}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default LeftSidebar;
