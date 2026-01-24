import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useAlert } from "../../contexts/AlertContext";
import Icon from "../Icon";
import { PortfolioTransaction, PortfolioPosition, GroupedTransaction } from "./types";

interface TransactionsTableProps {
  transactions: PortfolioTransaction[];
  positions: PortfolioPosition[];
  groupedTransactions: GroupedTransaction[];
  transactionSymbols: string[];
  selectedTransactionSymbol: string | null;
  onSymbolSelect: (symbol: string | null) => void;
  onReload: () => void;
}

const TransactionsTable: React.FC<TransactionsTableProps> = ({
  transactions,
  positions,
  groupedTransactions,
  transactionSymbols,
  selectedTransactionSymbol,
  onSymbolSelect,
  onReload,
}) => {
  const { t } = useTranslation();
  const { showAlert, showConfirm } = useAlert();
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<string>("");

  const handleDeleteTransaction = async (id: number) => {
    const ok = await showConfirm(t("portfolio.confirmDelete"));
    if (!ok) return;
    try {
      await invoke("delete_portfolio_transaction", { id });
      await onReload();
    } catch (err) {
      console.error("Error deleting transaction:", err);
      showAlert(t("portfolio.deleteError"));
    }
  };

  const filteredTransactions = selectedTransactionSymbol
    ? transactions.filter((transaction) => transaction.symbol === selectedTransactionSymbol)
    : transactions;

  const handleQuantityUpdate = async (transactionId: number, newQuantity: number, oldQuantity: number) => {
    if (newQuantity > 0 && newQuantity !== oldQuantity) {
      try {
        await invoke("update_portfolio_transaction", {
          id: transactionId,
          quantity: newQuantity,
        });
        await onReload();
      } catch (err) {
        console.error("Error updating transaction:", err);
        showAlert(t("portfolio.updateError") + ": " + (err instanceof Error ? err.message : String(err)));
      }
    }
    setEditingTransactionId(null);
    setEditingQuantity("");
  };

  return (
    <div className="portfolio-transactions">
      <div className="section-header">
        <span>{t("portfolio.transactions")}</span>
        {transactionSymbols.length > 0 && (
          <div className="transaction-filter-cards">
            <button
              className={`filter-card ${selectedTransactionSymbol === null ? "active" : ""}`}
              onClick={() => onSymbolSelect(null)}
              title={t("portfolio.showAll")}
            >
              {t("portfolio.all")}
            </button>
            {transactionSymbols.map((symbol) => {
              const group = groupedTransactions.find((g) => g.symbol === symbol);
              const position = positions.find((p) => p.symbol === symbol);
              return (
                <button
                  key={symbol}
                  className={`filter-card ${selectedTransactionSymbol === symbol ? "active" : ""}`}
                  onClick={() => onSymbolSelect(symbol)}
                  title={position ? `${position.name} (${symbol})` : symbol}
                >
                  <span className="filter-card-symbol">{symbol}</span>
                  {group && <span className="filter-card-count">{group.transactions.length}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="transactions-table">
        <table>
          <thead>
            <tr>
              <th>{t("portfolio.symbol")}</th>
              <th>{t("portfolio.name")}</th>
              <th>{t("portfolio.transactionType")}</th>
              <th>{t("portfolio.quantity")}</th>
              <th>{t("portfolio.price")}</th>
              <th>{t("portfolio.amount")}</th>
              <th>{t("portfolio.commission")}</th>
              <th>{t("portfolio.transactionDate")}</th>
              <th>{t("portfolio.notes")}</th>
              <th>{t("portfolio.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty-cell">
                  {selectedTransactionSymbol
                    ? t("portfolio.noTransactionsForSymbol", { symbol: selectedTransactionSymbol })
                    : t("portfolio.noTransactions")}
                </td>
              </tr>
            ) : (
              groupedTransactions.map((group) => (
                <React.Fragment key={group.symbol}>
                  {group.transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>{transaction.symbol}</td>
                      <td className="transaction-name">{transaction.name || "-"}</td>
                      <td className={transaction.transactionType === "buy" ? "positive" : "negative"}>
                        {transaction.transactionType === "buy" ? t("portfolio.buy") : t("portfolio.sell")}
                      </td>
                      <td
                        className="editable-quantity"
                        onClick={(e) => {
                          if (editingTransactionId !== transaction.id) {
                            e.stopPropagation();
                            setEditingTransactionId(transaction.id);
                            setEditingQuantity(transaction.quantity.toString());
                          }
                        }}
                      >
                        {editingTransactionId === transaction.id ? (
                          <input
                            type="number"
                            value={editingQuantity}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "" || /^\d+$/.test(val)) {
                                setEditingQuantity(val);
                              }
                            }}
                            onBlur={() => {
                              setEditingTransactionId(null);
                              setEditingQuantity("");
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const newQuantity = parseInt(editingQuantity) || 0;
                                handleQuantityUpdate(transaction.id, newQuantity, transaction.quantity);
                              } else if (e.key === "Escape") {
                                setEditingTransactionId(null);
                                setEditingQuantity("");
                              }
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            className="quantity-input"
                          />
                        ) : (
                          <span className="quantity-display">{transaction.quantity}</span>
                        )}
                      </td>
                      <td>{t("common.currencySymbol")}{transaction.price.toFixed(2)}</td>
                      <td>{t("common.currencySymbol")}{transaction.amount.toFixed(2)}</td>
                      <td>{t("common.currencySymbol")}{transaction.commission.toFixed(2)}</td>
                      <td>{transaction.transactionDate}</td>
                      <td>{transaction.notes || "-"}</td>
                      <td>
                        <button
                          onClick={() => handleDeleteTransaction(transaction.id)}
                          className="delete-btn"
                          title={t("portfolio.delete")}
                        >
                          <Icon name="delete" size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="subtotal-row">
                    <td colSpan={2} className="subtotal-label">
                      {t("portfolio.subtotal")} ({group.symbol})
                    </td>
                    <td className="subtotal-value">
                      <div className="subtotal-item">
                        <span className="subtotal-label-small">{t("portfolio.buy")}:</span> {group.subtotal.buyQuantity}
                      </div>
                      <div className="subtotal-item">
                        <span className="subtotal-label-small">{t("portfolio.sell")}:</span> {group.subtotal.sellQuantity}
                      </div>
                      <div className="subtotal-item">
                        <span className="subtotal-label-small">{t("portfolio.net")}:</span>{" "}
                        <span className={group.subtotal.netQuantity >= 0 ? "positive" : "negative"}>{group.subtotal.netQuantity}</span>
                      </div>
                      {(() => {
                        const position = positions.find((p) => p.symbol === group.symbol);
                        if (position) {
                          const matches = position.quantity === group.subtotal.netQuantity;
                          return (
                            <div className={`subtotal-item ${matches ? "" : "mismatch"}`}>
                              <span className="subtotal-label-small">{t("portfolio.positions")}:</span> {position.quantity}{" "}
                              {matches ? "✓" : `⚠ (${t("portfolio.mismatch")})`}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </td>
                    <td className="subtotal-value">-</td>
                    <td className="subtotal-value">
                      <div className="subtotal-item">
                        <span className="subtotal-label-small">{t("portfolio.buy")}:</span> {t("common.currencySymbol")}{group.subtotal.buyAmount.toFixed(2)}
                      </div>
                      <div className="subtotal-item">
                        <span className="subtotal-label-small">{t("portfolio.sell")}:</span> {t("common.currencySymbol")}{group.subtotal.sellAmount.toFixed(2)}
                      </div>
                      <div className="subtotal-item">
                        <span className="subtotal-label-small">{t("portfolio.net")}:</span>{" "}
                        <span className={group.subtotal.netAmount >= 0 ? "positive" : "negative"}>{t("common.currencySymbol")}{group.subtotal.netAmount.toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="subtotal-value">{t("common.currencySymbol")}{group.subtotal.totalCommission.toFixed(2)}</td>
                    <td colSpan={3}>-</td>
                  </tr>
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransactionsTable;
