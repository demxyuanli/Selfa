import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useAlert } from "../../../contexts/AlertContext";

interface SetInitialBalanceDialogProps {
  isOpen: boolean;
  currentBalance: number | null;
  onClose: () => void;
  onSet: () => void;
}

const SetInitialBalanceDialog: React.FC<SetInitialBalanceDialogProps> = ({
  isOpen,
  currentBalance,
  onClose,
  onSet,
}) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const [balance, setBalance] = useState("");
  const [settingBalance, setSettingBalance] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setBalance(currentBalance !== null ? currentBalance.toFixed(2) : "");
    }
  }, [isOpen, currentBalance]);

  const handleClose = () => {
    setBalance("");
    onClose();
  };

  const handleSetBalance = async () => {
    const bal = parseFloat(balance);
    if (!balance || isNaN(bal) || bal < 0) {
      showAlert(t("portfolio.invalidInput") || "Invalid input");
      return;
    }

    setSettingBalance(true);
    try {
      await invoke("set_initial_balance", { balance: bal });
      onSet();
      handleClose();
    } catch (err) {
      console.error("Error setting initial balance:", err);
      showAlert(t("portfolio.setError") + ": " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSettingBalance(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={() => !settingBalance && handleClose()}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">{t("portfolio.setInitialBalance") || "Set Initial Balance"}</div>
        <div className="dialog-body">
          <div className="form-group">
            <label>{t("portfolio.initialBalance") || "Initial Balance"}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={balance}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^\d*\.?\d*$/.test(val)) {
                  setBalance(val);
                }
              }}
              placeholder="0.00"
              autoFocus
            />
            {currentBalance !== null && (
              <div style={{ marginTop: "8px", fontSize: "12px", color: "#888" }}>
                {t("portfolio.currentInitialBalance") || "Current"}: ¥{currentBalance.toFixed(2)}
              </div>
            )}
          </div>
          <div style={{ marginTop: "12px", fontSize: "12px", color: "#666" }}>
            {t("portfolio.initialBalanceHint") || "Set the initial balance to correct the calculated balance for historical transactions."}
          </div>
        </div>
        <div className="dialog-footer">
          <button onClick={handleClose} className="dialog-btn" disabled={settingBalance}>
            {t("common.cancel")}
          </button>
          <button onClick={handleSetBalance} className="dialog-btn primary" disabled={settingBalance}>
            {settingBalance ? t("app.loading") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SetInitialBalanceDialog;
