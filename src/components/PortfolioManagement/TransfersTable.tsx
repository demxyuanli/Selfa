import React from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useAlert } from "../../contexts/AlertContext";
import Icon from "../Icon";
import { CapitalTransfer } from "./utils/portfolioCalculations";

interface TransfersTableProps {
  transfers: CapitalTransfer[];
  onReload: () => void;
}

const TransfersTable: React.FC<TransfersTableProps> = ({ transfers, onReload }) => {
  const { t } = useTranslation();
  const { showAlert, showConfirm } = useAlert();

  const handleDelete = async (id: number) => {
    const ok = await showConfirm(t("portfolio.confirmDelete"));
    if (!ok) return;
    try {
      await invoke("delete_capital_transfer", { id });
      await onReload();
    } catch (err) {
      console.error("Error deleting transfer:", err);
      showAlert(t("portfolio.deleteError") + ": " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const totalDeposits = transfers.filter(t => t.transferType === "deposit").reduce((sum, t) => sum + t.amount, 0);
  const totalWithdraws = transfers.filter(t => t.transferType === "withdraw").reduce((sum, t) => sum + t.amount, 0);
  const netCapital = totalDeposits - totalWithdraws;

  return (
    <div className="portfolio-transfers">
      <div className="section-header">
        <span>{t("portfolio.capitalTransfers") || "Capital Transfers"}</span>
        <div className="transfer-summary">
          <span className="summary-item">
            <span className="summary-label">{t("portfolio.totalDeposits") || "Total Deposits"}:</span>
            <span className="summary-value positive">¥{totalDeposits.toFixed(2)}</span>
          </span>
          <span className="summary-item">
            <span className="summary-label">{t("portfolio.totalWithdraws") || "Total Withdraws"}:</span>
            <span className="summary-value negative">¥{totalWithdraws.toFixed(2)}</span>
          </span>
          <span className="summary-item">
            <span className="summary-label">{t("portfolio.netCapital") || "Net Capital"}:</span>
            <span className={`summary-value ${netCapital >= 0 ? "positive" : "negative"}`}>
              ¥{netCapital.toFixed(2)}
            </span>
          </span>
        </div>
      </div>
      <div className="transfers-table">
        <table>
          <thead>
            <tr>
              <th>{t("portfolio.transferType") || "Type"}</th>
              <th>{t("portfolio.amount")}</th>
              <th>{t("portfolio.transferDate") || "Date"}</th>
              <th>{t("portfolio.notes")}</th>
              <th>{t("portfolio.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {transfers.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-cell">
                  {t("portfolio.noTransfers") || "No transfers"}
                </td>
              </tr>
            ) : (
              transfers.map((transfer) => (
                <tr key={transfer.id}>
                  <td className={transfer.transferType === "deposit" ? "positive" : "negative"}>
                    {transfer.transferType === "deposit" 
                      ? (t("portfolio.deposit") || "Deposit")
                      : (t("portfolio.withdraw") || "Withdraw")}
                  </td>
                  <td className={transfer.transferType === "deposit" ? "positive" : "negative"}>
                    {transfer.transferType === "deposit" ? "+" : "-"}¥{transfer.amount.toFixed(2)}
                  </td>
                  <td>{transfer.transferDate}</td>
                  <td>{transfer.notes || "-"}</td>
                  <td>
                    <button
                      onClick={() => handleDelete(transfer.id)}
                      className="delete-btn"
                      title={t("portfolio.delete")}
                    >
                      <Icon name="delete" size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransfersTable;
