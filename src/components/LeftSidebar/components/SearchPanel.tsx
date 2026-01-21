import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../../Icon";
import { StockInfo } from "../types";

interface SearchPanelProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults: StockInfo[];
  searching: boolean;
  searchError: string | null;
  onStockClick: (stock: StockInfo) => void;
  onAddToFavorites: (stock: StockInfo) => void;
  onRemoveFromFavorites?: (stock: StockInfo) => void;
  favoriteStocks: StockInfo[];
  onToggle: () => void;
  onFilter?: (marketFilter: string | null, sectorFilter: string | null) => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({
  searchQuery,
  onSearchChange,
  searchResults,
  searching,
  searchError,
  onStockClick,
  onAddToFavorites,
  onRemoveFromFavorites,
  favoriteStocks,
  onToggle,
  onFilter,
}) => {
  const { t } = useTranslation();
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("");
  const [showFilter, setShowFilter] = useState(false);
  
  const isStockAdded = (stock: StockInfo): boolean => {
    if (!favoriteStocks || !Array.isArray(favoriteStocks)) {
      return false;
    }
    return favoriteStocks.some(s => s.symbol === stock.symbol);
  };

  const handleApplyFilter = () => {
    if (onFilter) {
      onFilter(
        marketFilter === "all" ? null : marketFilter,
        sectorFilter.trim() || null
      );
    }
  };

  return (
    <>
      <div className="sidebar-header">
        <span>{t("sidebar.searchStock")}</span>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={() => setShowFilter(!showFilter)}
            className="filter-btn"
            title={t("sidebar.filter") || "Filter"}
            style={{ padding: "4px 8px", fontSize: "11px" }}
          >
            <Icon name="settings" size={12} />
          </button>
          <button onClick={onToggle} className="toggle-btn">
            <Icon name="chevronLeft" size={14} />
          </button>
        </div>
      </div>
      <div className="panel-content">
        {showFilter && (
          <div className="filter-panel" style={{ padding: "8px", borderBottom: "1px solid #3e3e42", marginBottom: "8px" }}>
            <div style={{ marginBottom: "8px" }}>
              <label style={{ fontSize: "11px", color: "#858585", display: "block", marginBottom: "4px" }}>
                {t("sidebar.market") || "Market"}
              </label>
              <select
                value={marketFilter}
                onChange={(e) => setMarketFilter(e.target.value)}
                style={{ width: "100%", padding: "4px", fontSize: "11px", background: "#2d2d30", color: "#ccc", border: "1px solid #3e3e42" }}
              >
                <option value="all">{t("sidebar.allMarkets") || "All Markets"}</option>
                <option value="sh">{t("sidebar.shanghai") || "Shanghai"}</option>
                <option value="sz">{t("sidebar.shenzhen") || "Shenzhen"}</option>
              </select>
            </div>
            <div style={{ marginBottom: "8px" }}>
              <label style={{ fontSize: "11px", color: "#858585", display: "block", marginBottom: "4px" }}>
                {t("sidebar.sector") || "Sector"} ({t("sidebar.optional") || "Optional"})
              </label>
              <input
                type="text"
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                placeholder={t("sidebar.sectorPlaceholder") || "Enter sector code (e.g., BK0477)"}
                style={{ width: "100%", padding: "4px", fontSize: "11px", background: "#2d2d30", color: "#ccc", border: "1px solid #3e3e42" }}
              />
            </div>
            <button
              onClick={handleApplyFilter}
              style={{ width: "100%", padding: "6px", fontSize: "11px", background: "#007acc", color: "#fff", border: "none", borderRadius: "2px", cursor: "pointer" }}
            >
              {t("sidebar.applyFilter") || "Apply Filter"}
            </button>
          </div>
        )}
        <div className="search-box">
          <input
            type="text"
            className="search-input"
            placeholder={t("sidebar.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoFocus
          />
          {searching && <div className="search-spinner"></div>}
        </div>
        {searchError && <div className="search-error">{searchError}</div>}
        <div className="search-results-list">
          {searchResults.map((stock) => (
            <div key={stock.symbol} className="search-result-item">
              <div className="result-content" onClick={() => onStockClick(stock)}>
                <div className="stock-header">
                  <span className="stock-symbol">{stock.symbol}</span>
                  <span
                    className={`result-name ${
                      (stock as any).quote && (stock as any).quote.change_percent > 0 ? 'price-up' :
                      (stock as any).quote && (stock as any).quote.change_percent < 0 ? 'price-down' : ''
                    }`}
                  >
                    {stock.name}
                  </span>
                  {(stock as any).quote && (
                    <>
                      <span className="stock-price">{(stock as any).quote.price.toFixed(2)}</span>
                      <span
                        className={`stock-change ${
                          (stock as any).quote.change_percent > 0 ? 'price-up' :
                          (stock as any).quote.change_percent < 0 ? 'price-down' : ''
                        }`}
                      >
                        {(stock as any).quote.change_percent > 0 ? '+' : ''}{(stock as any).quote.change_percent.toFixed(2)}%
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                className="add-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isStockAdded(stock) && onRemoveFromFavorites) {
                    onRemoveFromFavorites(stock);
                  } else {
                    onAddToFavorites(stock);
                  }
                }}
                title={isStockAdded(stock) ? t("sidebar.removeFromFavorites") || "Remove from favorites" : t("sidebar.addToFavorites")}
              >
                {isStockAdded(stock) ? "−" : "+"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default SearchPanel;
