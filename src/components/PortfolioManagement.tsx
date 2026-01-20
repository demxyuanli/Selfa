import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ChartDialog from "./ChartDialog";
import PortfolioHeader from "./PortfolioManagement/PortfolioHeader";
import PositionsTable from "./PortfolioManagement/PositionsTable";
import TransactionsTable from "./PortfolioManagement/TransactionsTable";
import PortfolioChart from "./PortfolioManagement/PortfolioChart";
import AddTransactionDialog from "./PortfolioManagement/dialogs/AddTransactionDialog";
import { usePortfolio } from "./PortfolioManagement/hooks/usePortfolio";
import { calculatePortfolioStats, groupTransactionsBySymbol, getTransactionSymbols } from "./PortfolioManagement/utils/portfolioCalculations";
import { generatePortfolioChartOption } from "./PortfolioManagement/chartOptions/portfolioChartOption";
import "./StockAnalysis.css";
import "./PortfolioManagement.css";

const PortfolioManagement: React.FC = () => {
  const { t } = useTranslation();
  const { positions, transactions, loadPortfolio, refreshPrices } = usePortfolio();
  const [selectedTransactionSymbol, setSelectedTransactionSymbol] = useState<string | null>(null);
  const [showAddTransactionDialog, setShowAddTransactionDialog] = useState(false);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);

  const portfolioStats = useMemo(() => calculatePortfolioStats(positions), [positions]);

  const transactionSymbols = useMemo(() => getTransactionSymbols(transactions), [transactions]);

  const filteredTransactions = useMemo(() => {
    if (!selectedTransactionSymbol) {
      return transactions;
    }
    return transactions.filter((transaction) => transaction.symbol === selectedTransactionSymbol);
  }, [transactions, selectedTransactionSymbol]);

  const groupedTransactions = useMemo(() => groupTransactionsBySymbol(filteredTransactions), [filteredTransactions]);

  const chartOption = useMemo(() => generatePortfolioChartOption({ positions, t }), [positions, t]);


  return (
    <div className="portfolio-management">
      <PortfolioHeader
        stats={portfolioStats}
        onAddTransaction={() => setShowAddTransactionDialog(true)}
        onRefresh={refreshPrices}
      />

      <div className="portfolio-content">
        <PositionsTable positions={positions} />

        <TransactionsTable
          transactions={transactions}
          positions={positions}
          groupedTransactions={groupedTransactions}
          transactionSymbols={transactionSymbols}
          selectedTransactionSymbol={selectedTransactionSymbol}
          onSymbolSelect={setSelectedTransactionSymbol}
          onReload={loadPortfolio}
        />

        <PortfolioChart positions={positions} onZoom={() => setIsChartDialogOpen(true)} />
      </div>

      <AddTransactionDialog isOpen={showAddTransactionDialog} onClose={() => setShowAddTransactionDialog(false)} onAdd={loadPortfolio} />

      <ChartDialog
        isOpen={isChartDialogOpen}
        onClose={() => setIsChartDialogOpen(false)}
        title={`${t("portfolio.portfolioDistribution")} - ${t("chart.title")}`}
        chartOption={chartOption}
      />
    </div>
  );
};

export default PortfolioManagement;
