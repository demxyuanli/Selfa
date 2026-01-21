import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import ChartDialog from "./ChartDialog";
import PortfolioHeader from "./PortfolioManagement/PortfolioHeader";
import PositionsTable from "./PortfolioManagement/PositionsTable";
import TransactionsTable from "./PortfolioManagement/TransactionsTable";
import TransfersTable from "./PortfolioManagement/TransfersTable";
import PortfolioChart from "./PortfolioManagement/PortfolioChart";
import AddTransactionDialog from "./PortfolioManagement/dialogs/AddTransactionDialog";
import AddTransferDialog from "./PortfolioManagement/dialogs/AddTransferDialog";
import { usePortfolio } from "./PortfolioManagement/hooks/usePortfolio";
import { calculatePortfolioStats, groupTransactionsBySymbol, getTransactionSymbols, CapitalTransfer } from "./PortfolioManagement/utils/portfolioCalculations";
import { generatePortfolioChartOption } from "./PortfolioManagement/chartOptions/portfolioChartOption";
import "./StockAnalysis.css";
import "./PortfolioManagement.css";

const PortfolioManagement: React.FC = () => {
  const { t } = useTranslation();
  const { positions, transactions, loadPortfolio, refreshPrices } = usePortfolio();
  const [selectedTransactionSymbol, setSelectedTransactionSymbol] = useState<string | null>(null);
  const [showAddTransactionDialog, setShowAddTransactionDialog] = useState(false);
  const [showAddTransferDialog, setShowAddTransferDialog] = useState(false);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  const [capitalTransfers, setCapitalTransfers] = useState<CapitalTransfer[]>([]);
  const [initialBalance, setInitialBalance] = useState<number | null>(null);

  const loadCapitalTransfers = React.useCallback(async () => {
    try {
      const transfers = await invoke<Array<[number, string, number, string, string | null]>>("get_capital_transfers");
      const formattedTransfers: CapitalTransfer[] = transfers.map(([id, transferType, amount, transferDate, notes]) => ({
        id,
        transferType: transferType as "deposit" | "withdraw",
        amount,
        transferDate,
        notes: notes || undefined,
      }));
      setCapitalTransfers(formattedTransfers);
    } catch (err) {
      console.error("Failed to load capital transfers:", err);
    }
  }, []);

  const loadInitialBalance = React.useCallback(async () => {
    try {
      const balance = await invoke<number | null>("get_initial_balance");
      setInitialBalance(balance);
    } catch (err) {
      console.error("Failed to load initial balance:", err);
    }
  }, []);

  useEffect(() => {
    loadCapitalTransfers();
    loadInitialBalance();
  }, [loadCapitalTransfers, loadInitialBalance]);

  const portfolioStats = useMemo(() => calculatePortfolioStats(positions, transactions, capitalTransfers, initialBalance), [positions, transactions, capitalTransfers, initialBalance]);

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
        initialBalance={initialBalance}
        onAddTransaction={() => setShowAddTransactionDialog(true)}
        onAddTransfer={() => setShowAddTransferDialog(true)}
        onSetInitialBalance={loadInitialBalance}
        onRefresh={async () => {
          await refreshPrices();
          await loadCapitalTransfers();
          await loadInitialBalance();
        }}
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

        <TransfersTable transfers={capitalTransfers} onReload={loadCapitalTransfers} />

        <PortfolioChart positions={positions} onZoom={() => setIsChartDialogOpen(true)} />
      </div>

      <AddTransactionDialog isOpen={showAddTransactionDialog} onClose={() => setShowAddTransactionDialog(false)} onAdd={loadPortfolio} />
      <AddTransferDialog isOpen={showAddTransferDialog} onClose={() => setShowAddTransferDialog(false)} onAdd={loadCapitalTransfers} />

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
