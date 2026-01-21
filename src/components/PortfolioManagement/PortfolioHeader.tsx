import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { PortfolioStats } from "./types";
import SetInitialBalanceDialog from "./dialogs/SetInitialBalanceDialog";

interface PortfolioHeaderProps {
  stats: PortfolioStats;
  initialBalance: number | null;
  onAddTransaction: () => void;
  onAddTransfer: () => void;
  onSetInitialBalance: () => void;
  onRefresh: () => void;
}

const PortfolioHeader: React.FC<PortfolioHeaderProps> = ({
  stats,
  initialBalance,
  onAddTransaction,
  onAddTransfer,
  onSetInitialBalance,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [showSetBalanceDialog, setShowSetBalanceDialog] = useState(false);

  return (
    <div className="portfolio-header">
      <div className="portfolio-stats">
        <div className="stat-item">
          <span className="stat-label">{t("portfolio.initialCapital")}:</span>
          <span className="stat-value">
            ¥{stats.initialCapital.toFixed(2)}
            <button
              onClick={() => setShowSetBalanceDialog(true)}
              className="edit-balance-btn"
              title={t("portfolio.setInitialBalance") || "Set Initial Balance"}
            >
              ✎
            </button>
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("portfolio.totalValue")}:</span>
          <span className="stat-value">¥{stats.totalValue.toFixed(2)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("portfolio.totalCost")}:</span>
          <span className="stat-value">¥{stats.totalCost.toFixed(2)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("portfolio.availableBalance")}:</span>
          <span className="stat-value">¥{stats.availableBalance.toFixed(2)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("portfolio.positionValue") || "Position Value"}:</span>
          <span className="stat-value">¥{stats.positionValue.toFixed(2)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("portfolio.floatingProfit")}:</span>
          <span className={`stat-value ${stats.floatingProfit >= 0 ? "positive" : "negative"}`}>
            {stats.floatingProfit >= 0 ? "+" : ""}¥{stats.floatingProfit.toFixed(2)} ({stats.floatingProfitPercent >= 0 ? "+" : ""}{stats.floatingProfitPercent.toFixed(2)}%)
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("portfolio.totalProfit")}:</span>
          <span className={`stat-value ${stats.totalProfit >= 0 ? "positive" : "negative"}`}>
            {stats.totalProfit >= 0 ? "+" : ""}¥{stats.totalProfit.toFixed(2)} ({stats.totalProfitPercent >= 0 ? "+" : ""}{stats.totalProfitPercent.toFixed(2)}%)
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t("portfolio.positionCount")}:</span>
          <span className="stat-value">{stats.positionCount}</span>
        </div>
      </div>
      <div className="portfolio-actions">
        <button onClick={onAddTransfer} className="portfolio-btn">
          {t("portfolio.addTransfer") || "Add Transfer"}
        </button>
        <button onClick={onAddTransaction} className="portfolio-btn primary">
          {t("portfolio.addTransaction")}
        </button>
        <button onClick={onRefresh} className="portfolio-btn">
          {t("common.refresh")}
        </button>
      </div>
      <SetInitialBalanceDialog
        isOpen={showSetBalanceDialog}
        currentBalance={initialBalance}
        onClose={() => setShowSetBalanceDialog(false)}
        onSet={onSetInitialBalance}
      />
    </div>
  );
};

export default PortfolioHeader;
