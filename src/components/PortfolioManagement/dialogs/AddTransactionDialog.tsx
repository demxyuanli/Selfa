import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useAlert } from "../../../contexts/AlertContext";
import { StockInfo } from "../types";
import { getDefaultCommission } from "../../../utils/settings";
import { useStockSearch } from "../hooks/useStockSearch";
import StockSearchPanel from "./StockSearchPanel";
import QuantityInput from "./QuantityInput";
import PriceInput from "./PriceInput";
import { parseQuantity, parsePrice } from "../utils/formValidation";

interface AddTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (symbol?: string) => void;
}

const AddTransactionDialog: React.FC<AddTransactionDialogProps> = ({ isOpen, onClose, onAdd }) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [commission, setCommission] = useState(getDefaultCommission());
  const [transactionNotes, setTransactionNotes] = useState("");
  const [addingTransaction, setAddingTransaction] = useState(false);

  const { loadFavoriteStocks } = useStockSearch();

  useEffect(() => {
    if (isOpen) {
      loadFavoriteStocks();
      setCommission(getDefaultCommission());
    }
  }, [isOpen, loadFavoriteStocks]);

  const handleStockSelect = (stock: StockInfo) => {
    setSelectedSymbol(stock.symbol);
    setSelectedName(stock.name);
  };

  const handleClose = () => {
    setSelectedSymbol("");
    setSelectedName("");
    setQuantity("");
    setPrice("");
    setCommission(getDefaultCommission());
    setTransactionNotes("");
    onClose();
  };

  const handleAddTransaction = async (type: "buy" | "sell") => {
    const qty = parseQuantity(quantity);
    const prc = parsePrice(price);

    if (!selectedSymbol || qty <= 0 || prc <= 0) {
      showAlert(t("portfolio.invalidInput"));
      return;
    }

    setAddingTransaction(true);
    try {
      const transactionDate = new Date().toISOString().split("T")[0];
      await invoke<number>("add_portfolio_transaction", {
        symbol: selectedSymbol,
        transactionType: type,
        quantity: qty,
        price: prc,
        commission,
        transactionDate,
        notes: transactionNotes || null,
        stockName: selectedName || null,
      });

      onAdd(selectedSymbol);
      handleClose();
    } catch (err) {
      console.error("Error adding transaction:", err);
      showAlert(t("portfolio.addError") + ": " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAddingTransaction(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={() => !addingTransaction && handleClose()}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">{t("portfolio.addTransaction")}</div>
        <div className="dialog-body dialog-body-split">
          <StockSearchPanel onStockSelect={handleStockSelect} />
          <div className="dialog-right-panel">
            <div className="form-group">
              <label>{t("portfolio.symbol")}</label>
              <input
                type="text"
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                placeholder={t("portfolio.symbolPlaceholder")}
                className="form-input"
              />
            </div>
            {selectedName && (
              <div className="form-group">
                <label>{t("portfolio.name")}</label>
                <input
                  type="text"
                  value={selectedName}
                  readOnly
                  className="form-input"
                  style={{ backgroundColor: "var(--bg-tertiary, #252526)", cursor: "not-allowed" }}
                />
              </div>
            )}
            <QuantityInput value={quantity} onChange={setQuantity} />
            <PriceInput value={price} onChange={setPrice} />
            <div className="form-group">
              <label>{t("portfolio.commission")}</label>
              <input
                type="number"
                value={commission}
                onChange={(e) => setCommission(parseFloat(e.target.value) || 0)}
                min={0}
                step={0.01}
              />
            </div>
            <div className="form-group">
              <label>{t("portfolio.notes")}</label>
              <textarea value={transactionNotes} onChange={(e) => setTransactionNotes(e.target.value)} rows={3} />
            </div>
          </div>
        </div>
        <div className="dialog-footer">
          <button onClick={() => handleAddTransaction("buy")} className="dialog-btn primary" disabled={addingTransaction}>
            {addingTransaction ? t("app.loading") : t("portfolio.buy")}
          </button>
          <button
            onClick={() => handleAddTransaction("sell")}
            className="dialog-btn"
            style={{ backgroundColor: "#ff0000" }}
            disabled={addingTransaction}
          >
            {addingTransaction ? t("app.loading") : t("portfolio.sell")}
          </button>
          <button onClick={handleClose} className="dialog-btn" disabled={addingTransaction}>
            {t("settings.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddTransactionDialog;
