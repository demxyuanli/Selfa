import React from "react";
import { useTranslation } from "react-i18next";
import { PortfolioStats } from "./types";

interface PortfolioHeaderProps {
  stats: PortfolioStats;
  onAddTransaction: () => void;
  onRefresh: () => void;
}

const PortfolioHeader: React.FC<PortfolioHeaderProps> = ({
  stats,
  onAddTransaction,
  onRefresh,
}) => {
  const { t } = useTranslation();

  return (
    <div className="portfolio-header">
      <div className="portfolio-stats">
        <div className="stat-item">
          <span className="stat-label">{t("portfolio.totalValue")}:</span>
          <span className="stat-value">¥{stats.totalValue.toFixed(2)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("portfolio.totalCost")}:</span>
          <span className="stat-value">¥{stats.totalCost.toFixed(2)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("portfolio.totalProfit")}:</span>
          <span className={`stat-value ${stats.totalProfit >= 0 ? "positive" : "negative"}`}>
            {stats.totalProfit >= 0 ? "+" : ""}¥{stats.totalProfit.toFixed(2)} ({stats.totalProfitPercent.toFixed(2)}%)
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("portfolio.positionCount")}:</span>
          <span className="stat-value">{stats.positionCount}</span>
        </div>
      </div>
      <div className="portfolio-actions">
        <button onClick={onAddTransaction} className="portfolio-btn primary">
          {t("portfolio.addTransaction")}
        </button>
        <button onClick={onRefresh} className="portfolio-btn">
          {t("common.refresh")}
        </button>
      </div>
    </div>
  );
};

export default PortfolioHeader;
