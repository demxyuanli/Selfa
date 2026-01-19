import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import StockChart from "./StockChart";
import TechnicalAnalysis from "./TechnicalAnalysis";
import "./StockDetail.css";

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap?: number;
  high: number;
  low: number;
  open: number;
  previous_close: number;
}

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockDetailProps {
  stock: StockQuote;
}

const StockDetail: React.FC<StockDetailProps> = ({ stock }) => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState("1y");
  const [history, setHistory] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const data: StockData[] = await invoke("get_stock_history", {
          symbol: stock.symbol,
          period: period,
        });
        setHistory(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setHistory([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [stock.symbol, period]);

  const formatNumber = (num: number) => {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
    return num.toFixed(2);
  };

  const changeClass = stock.change >= 0 ? "positive" : "negative";

  return (
    <div className="stock-detail">
      <div className="stock-header">
        <div>
          <h2 className={changeClass}>{stock.name}</h2>
          <p className="stock-symbol">{stock.symbol}</p>
        </div>
        <div className="stock-price">
          <div className={`price-value ${changeClass}`}>
            ${stock.price.toFixed(2)}
          </div>
          <div className={`price-change ${changeClass}`}>
            {stock.change >= 0 ? "+" : ""}
            {stock.change.toFixed(2)} ({stock.change_percent >= 0 ? "+" : ""}
            {stock.change_percent.toFixed(2)}%)
          </div>
        </div>
      </div>

      <div className="stock-stats">
        <div className="stat-item">
          <span className="stat-label">{t("stock.open")}</span>
          <span className="stat-value">${stock.open.toFixed(2)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("stock.high")}</span>
          <span className="stat-value">${stock.high.toFixed(2)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("stock.low")}</span>
          <span className="stat-value">${stock.low.toFixed(2)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("stock.previousClose")}</span>
          <span className="stat-value">${stock.previous_close.toFixed(2)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("stock.volume")}</span>
          <span className="stat-value">{formatNumber(stock.volume)}</span>
        </div>
        {stock.market_cap && (
          <div className="stat-item">
            <span className="stat-label">{t("stock.marketCap")}</span>
            <span className="stat-value">${formatNumber(stock.market_cap)}</span>
          </div>
        )}
      </div>

      <div className="period-selector">
        <label>{t("stock.selectPeriod")}:</label>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          {Object.entries({
            "1d": t("stock.periods.1d"),
            "5d": t("stock.periods.5d"),
            "1mo": t("stock.periods.1mo"),
            "3mo": t("stock.periods.3mo"),
            "6mo": t("stock.periods.6mo"),
            "1y": t("stock.periods.1y"),
            "2y": t("stock.periods.2y"),
            "5y": t("stock.periods.5y"),
          }).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error-message">{t("app.error")}: {error}</div>}
      {loading && <div className="loading-message">{t("app.loading")}</div>}
      {!loading && !error && history.length > 0 && (
        <>
          <StockChart data={history} />
          <TechnicalAnalysis data={history} />
        </>
      )}
    </div>
  );
};

export default StockDetail;

