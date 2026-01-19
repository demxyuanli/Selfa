import React from "react";
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
  onToggle: () => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({
  searchQuery,
  onSearchChange,
  searchResults,
  searching,
  searchError,
  onStockClick,
  onAddToFavorites,
  onToggle,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="sidebar-header">
        <span>{t("sidebar.searchStock")}</span>
        <button onClick={onToggle} className="toggle-btn">
          <Icon name="chevronLeft" size={14} />
        </button>
      </div>
      <div className="panel-content">
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
                onClick={() => onAddToFavorites(stock)}
                title={t("sidebar.addToFavorites")}
              >
                +
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default SearchPanel;
