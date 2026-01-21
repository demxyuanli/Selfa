import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useAlert } from "../../../contexts/AlertContext";

interface AddTransferDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: () => void;
}

const AddTransferDialog: React.FC<AddTransferDialogProps> = ({ isOpen, onClose, onAdd }) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const [transferType, setTransferType] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [notes, setNotes] = useState("");
  const [addingTransfer, setAddingTransfer] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const today = new Date().toISOString().split("T")[0];
      setTransferDate(today);
      setAmount("");
      setNotes("");
      setTransferType("deposit");
    }
  }, [isOpen]);

  const handleClose = () => {
    setTransferType("deposit");
    setAmount("");
    setTransferDate("");
    setNotes("");
    onClose();
  };

  const handleAddTransfer = async () => {
    const amt = parseFloat(amount);
    if (!amount || amt <= 0 || !transferDate) {
      showAlert(t("portfolio.invalidInput"));
      return;
    }

    setAddingTransfer(true);
    try {
      await invoke<number>("add_capital_transfer", {
        transferType,
        amount: amt,
        transferDate,
        notes: notes || null,
      });

      onAdd();
      handleClose();
    } catch (err) {
      console.error("Error adding transfer:", err);
      showAlert(t("portfolio.addError") + ": " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAddingTransfer(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={() => !addingTransfer && handleClose()}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">{t("portfolio.addTransfer") || "Add Transfer"}</div>
        <div className="dialog-body">
          <div className="form-group">
            <label>{t("portfolio.transferType") || "Type"}</label>
            <div className="transfer-type-buttons">
              <button
                type="button"
                className={`transfer-type-btn ${transferType === "deposit" ? "active positive" : ""}`}
                onClick={() => setTransferType("deposit")}
              >
                {t("portfolio.deposit") || "Deposit"}
              </button>
              <button
                type="button"
                className={`transfer-type-btn ${transferType === "withdraw" ? "active negative" : ""}`}
                onClick={() => setTransferType("withdraw")}
              >
                {t("portfolio.withdraw") || "Withdraw"}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>{t("portfolio.amount")}</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^\d*\.?\d*$/.test(val)) {
                  setAmount(val);
                }
              }}
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>{t("portfolio.transferDate") || "Date"}</label>
            <input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>{t("portfolio.notes")}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("portfolio.notesPlaceholder") || "Optional notes"}
              rows={3}
            />
          </div>
        </div>
        <div className="dialog-footer">
          <button onClick={handleClose} className="dialog-btn" disabled={addingTransfer}>
            {t("common.cancel")}
          </button>
          <button onClick={handleAddTransfer} className="dialog-btn primary" disabled={addingTransfer}>
            {addingTransfer ? t("app.loading") : t("portfolio.add")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddTransferDialog;
