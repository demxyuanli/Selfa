import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../../Icon";
import { StockInfo } from "../types";
import { useStockSearch } from "../hooks/useStockSearch";

interface StockSearchPanelProps {
  onStockSelect: (stock: StockInfo) => void;
}

const StockSearchPanel: React.FC<StockSearchPanelProps> = ({ onStockSelect }) => {
  const { t } = useTranslation();
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    searching,
    showDropdown,
    favoriteStocks,
    loadFavoriteStocks,
    inputRef,
    dropdownRef,
  } = useStockSearch();
  const [showFavorites, setShowFavorites] = useState(true);

  useEffect(() => {
    loadFavoriteStocks();
  }, [loadFavoriteStocks]);

  const handleStockSelect = (stock: StockInfo) => {
    onStockSelect(stock);
    setSearchQuery("");
  };

  const filteredFavorites = favoriteStocks.filter(
    (stock) =>
      !searchQuery.trim() ||
      stock.symbol.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
      stock.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  return (
    <div className="dialog-left-panel">
      <div className="panel-header">
        <label>{t("portfolio.searchStock")}</label>
      </div>
      <div className="search-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("portfolio.searchPlaceholder")}
          className="form-input"
        />
        {searching && <span className="search-loading">...</span>}
      </div>
      {showDropdown && searchQuery.trim() && searchResults.length > 0 && (
        <div ref={dropdownRef} className="search-dropdown-left">
          {searchResults.map((stock) => {
            const isFavorite = favoriteStocks.some((f) => f.symbol === stock.symbol);
            return (
              <div
                key={stock.symbol}
                className={`search-dropdown-item ${isFavorite ? "favorite-item" : ""}`}
                onClick={() => handleStockSelect(stock)}
              >
                <span className="search-symbol">{stock.symbol}</span>
                <span className="search-name">{stock.name}</span>
                {isFavorite && (
                  <span className="favorite-badge">
                    <Icon name="star" size={12} filled={true} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="favorites-list-section">
        <div className="favorites-list-header" onClick={() => setShowFavorites(!showFavorites)}>
          <label>{t("sidebar.favorites")} ({favoriteStocks.length})</label>
          <Icon name={showFavorites ? "chevronDown" : "chevronUp"} size={14} />
        </div>
        {showFavorites && (
          <div className="favorites-list">
            {filteredFavorites.length > 0 ? (
              filteredFavorites.map((stock) => (
                <div
                  key={stock.symbol}
                  className="favorite-list-item"
                  onClick={() => handleStockSelect(stock)}
                >
                  <span className="search-symbol">{stock.symbol}</span>
                  <span className="search-name">{stock.name}</span>
                  <span className="favorite-badge">
                    <Icon name="star" size={12} filled={true} />
                  </span>
                </div>
              ))
            ) : (
              <div className="favorites-empty">
                {searchQuery.trim() 
                  ? t("sidebar.noStocksWithTag") || "No matching stocks"
                  : t("sidebar.noFavorites") || "No favorites"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StockSearchPanel;
