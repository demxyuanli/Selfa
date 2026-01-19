import React, { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import ChartDialog from "./ChartDialog";
import PortfolioHeader from "./PortfolioManagement/PortfolioHeader";
import PositionsTable from "./PortfolioManagement/PositionsTable";
import TransactionsTable from "./PortfolioManagement/TransactionsTable";
import PortfolioChart from "./PortfolioManagement/PortfolioChart";
import AddPositionDialog from "./PortfolioManagement/dialogs/AddPositionDialog";
import EditPositionDialog from "./PortfolioManagement/dialogs/EditPositionDialog";
import AddTransactionDialog from "./PortfolioManagement/dialogs/AddTransactionDialog";
import { usePortfolio } from "./PortfolioManagement/hooks/usePortfolio";
import { calculatePortfolioStats, groupTransactionsBySymbol, getTransactionSymbols } from "./PortfolioManagement/utils/portfolioCalculations";
import { generatePortfolioChartOption } from "./PortfolioManagement/chartOptions/portfolioChartOption";
import { PortfolioPosition } from "./PortfolioManagement/types";
import "./StockAnalysis.css";
import "./PortfolioManagement.css";

const PortfolioManagement: React.FC = () => {
  const { t } = useTranslation();
  const { positions, transactions, loadPortfolio, refreshPrices, setPositions } = usePortfolio();
  const [selectedTransactionSymbol, setSelectedTransactionSymbol] = useState<string | null>(null);
  const [showAddPositionDialog, setShowAddPositionDialog] = useState(false);
  const [showAddTransactionDialog, setShowAddTransactionDialog] = useState(false);
  const [showEditPositionDialog, setShowEditPositionDialog] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null);
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

  const handleAddPosition = (newPosition: PortfolioPosition) => {
    setPositions((prev) => [...prev, newPosition]);
  };

  const handleEditPosition = (position: PortfolioPosition) => {
    setEditingPosition(position);
    setShowEditPositionDialog(true);
  };

  const handleDeletePosition = async (id: number) => {
    if (confirm(t("portfolio.confirmDelete"))) {
      try {
        await invoke("delete_portfolio_position", { id });
        await loadPortfolio();
      } catch (err) {
        console.error("Error deleting position:", err);
        alert(t("portfolio.deleteError"));
      }
    }
  };

  const handleRecalculate = async () => {
    if (confirm(t("portfolio.recalculateConfirm"))) {
      try {
        await invoke("recalculate_all_positions_from_transactions");
        await loadPortfolio();
        alert(t("portfolio.recalculateSuccess"));
      } catch (err) {
        console.error("Error recalculating positions:", err);
        alert(t("portfolio.recalculateError") + ": " + (err instanceof Error ? err.message : String(err)));
      }
    }
  };

  return (
    <div className="portfolio-management">
      <PortfolioHeader
        stats={portfolioStats}
        onAddPosition={() => setShowAddPositionDialog(true)}
        onAddTransaction={() => setShowAddTransactionDialog(true)}
        onRefresh={refreshPrices}
        onRecalculate={handleRecalculate}
      />

      <div className="portfolio-content">
        <PositionsTable positions={positions} onEdit={handleEditPosition} onDelete={handleDeletePosition} />

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

      <AddPositionDialog isOpen={showAddPositionDialog} onClose={() => setShowAddPositionDialog(false)} onAdd={handleAddPosition} />

      <EditPositionDialog
        isOpen={showEditPositionDialog}
        position={editingPosition}
        onClose={() => {
          setShowEditPositionDialog(false);
          setEditingPosition(null);
        }}
        onUpdate={loadPortfolio}
      />

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
