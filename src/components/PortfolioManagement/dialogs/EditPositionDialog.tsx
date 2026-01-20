import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useAlert } from "../../../contexts/AlertContext";
import { PortfolioPosition } from "../types";
import { parseQuantity, parsePrice } from "../utils/formValidation";

interface EditPositionDialogProps {
  isOpen: boolean;
  position: PortfolioPosition | null;
  onClose: () => void;
  onUpdate: () => void;
}

const EditPositionDialog: React.FC<EditPositionDialogProps> = ({ isOpen, position, onClose, onUpdate }) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const [quantity, setQuantity] = useState(position ? position.quantity.toString() : "");
  const [price, setPrice] = useState(position ? position.avgCost.toFixed(2) : "");

  React.useEffect(() => {
    if (position) {
      setQuantity(position.quantity.toString());
      setPrice(position.avgCost.toFixed(2));
    }
  }, [position]);

  const handleUpdate = async () => {
    if (!position) return;

    const qty = parseQuantity(quantity);
    const prc = parsePrice(price);

    if (qty <= 0 || prc <= 0) {
      showAlert(t("portfolio.invalidInput"));
      return;
    }

    try {
      await invoke("update_portfolio_position", {
        id: position.id,
        quantity: qty,
        avgCost: prc,
      });

      onUpdate();
      onClose();
      setQuantity("");
      setPrice("");
    } catch (err) {
      console.error("Error updating position:", err);
      showAlert(t("portfolio.addError"));
    }
  };

  if (!isOpen || !position) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">{t("portfolio.editPosition")}</div>
        <div className="dialog-body">
          <div className="form-group">
            <label>{t("portfolio.symbol")}</label>
            <input type="text" value={position.symbol} className="form-input" disabled />
          </div>
          <div className="form-group">
            <label>{t("portfolio.name")}</label>
            <input type="text" value={position.name} className="form-input" disabled />
          </div>
          <div className="form-group">
            <label>{t("portfolio.quantity")}</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={t("portfolio.quantityPlaceholder")}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>{t("portfolio.avgCost")}</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={t("portfolio.pricePlaceholder")}
              className="form-input"
            />
          </div>
        </div>
        <div className="dialog-footer">
          <button onClick={onClose} className="dialog-btn">
            {t("common.cancel")}
          </button>
          <button onClick={handleUpdate} className="dialog-btn primary">
            {t("portfolio.update")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditPositionDialog;
