import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useAlert } from "../../../contexts/AlertContext";
import { StockInfo, PortfolioPosition } from "../types";
import { useStockSearch } from "../hooks/useStockSearch";
import StockSearchPanel from "./StockSearchPanel";
import QuantityInput from "./QuantityInput";
import PriceInput from "./PriceInput";
import { parseQuantity, parsePrice } from "../utils/formValidation";

interface AddPositionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (position: PortfolioPosition) => void;
}

const AddPositionDialog: React.FC<AddPositionDialogProps> = ({ isOpen, onClose, onAdd }) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");

  const { loadFavoriteStocks } = useStockSearch();

  useEffect(() => {
    if (isOpen) {
      loadFavoriteStocks();
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
    onClose();
  };

  const handleAdd = async () => {
    const qty = parseQuantity(quantity);
    const prc = parsePrice(price);

    if (!selectedSymbol || !selectedName || qty <= 0 || prc <= 0) {
      showAlert(t("portfolio.invalidInput"));
      return;
    }

    try {
      const currentPrice = prc;
      const id = await invoke<number>("add_portfolio_position", {
        symbol: selectedSymbol,
        name: selectedName,
        quantity: qty,
        avgCost: prc,
        currentPrice: currentPrice,
      });

      const marketValue = qty * currentPrice;
      const profit = (currentPrice - prc) * qty;
      const profitPercent = prc > 0 ? ((currentPrice - prc) / prc) * 100 : 0;

      const newPosition: PortfolioPosition = {
        id,
        symbol: selectedSymbol,
        name: selectedName,
        quantity: qty,
        avgCost: prc,
        currentPrice,
        marketValue,
        profit,
        profitPercent,
      };

      onAdd(newPosition);
      handleClose();
    } catch (err) {
      console.error("Error adding position:", err);
      showAlert(t("portfolio.addError"));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={handleClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">{t("portfolio.addPosition")}</div>
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
            <div className="form-group">
              <label>{t("portfolio.name")}</label>
              <input
                type="text"
                value={selectedName}
                onChange={(e) => setSelectedName(e.target.value)}
                placeholder={t("portfolio.namePlaceholder")}
                className="form-input"
              />
            </div>
            <QuantityInput value={quantity} onChange={setQuantity} />
            <PriceInput value={price} onChange={setPrice} label={t("portfolio.avgCost")} />
          </div>
        </div>
        <div className="dialog-footer">
          <button onClick={handleAdd} className="dialog-btn primary">
            {t("portfolio.add")}
          </button>
          <button onClick={handleClose} className="dialog-btn">
            {t("settings.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddPositionDialog;
