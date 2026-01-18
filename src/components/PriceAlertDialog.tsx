import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import "./PriceAlertDialog.css";

interface PriceAlertInfo {
  id: number;
  symbol: string;
  threshold_price: number;
  direction: string;
  enabled: boolean;
  triggered: boolean;
}

interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
}

interface PriceAlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  symbol?: string;
  currentPrice?: number;
}

const PriceAlertDialog: React.FC<PriceAlertDialogProps> = ({
  isOpen,
  onClose,
  symbol,
  currentPrice,
}) => {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<PriceAlertInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingAlert, setEditingAlert] = useState<PriceAlertInfo | null>(null);
  const [formData, setFormData] = useState({
    symbol: symbol || "",
    threshold_price: currentPrice || 0,
    direction: "above",
    enabled: true,
  });
  const [favoriteStocks, setFavoriteStocks] = useState<StockInfo[]>([]);
  const [searchResults, setSearchResults] = useState<StockInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadAlerts();
      loadFavoriteStocks();
      if (symbol) {
        setFormData({
          ...formData,
          symbol: symbol,
          threshold_price: currentPrice || 0,
        });
      }
    }
  }, [isOpen, symbol, currentPrice]);

  const loadFavoriteStocks = async () => {
    try {
      const stocks: StockInfo[] = await invoke("get_stocks_by_group", {
        groupName: null,
      });
      setFavoriteStocks(stocks);
    } catch (err) {
      console.error("Error loading favorite stocks:", err);
    }
  };

  const searchStocks = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setSearching(true);
    try {
      const results: StockInfo[] = await invoke("search_stocks", {
        query: query,
      });
      setSearchResults(results.slice(0, 10));
      setShowDropdown(true);
    } catch (err) {
      console.error("Search error:", err);
      setSearchResults([]);
      setShowDropdown(false);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!formData.symbol || !!symbol || !!editingAlert) {
      setShowDropdown(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      searchStocks(formData.symbol);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [formData.symbol, symbol, editingAlert, searchStocks]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const alertsData: PriceAlertInfo[] = await invoke("get_price_alerts", {
        symbol: symbol || null,
      });
      setAlerts(alertsData);
    } catch (err) {
      console.error("Error loading alerts:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAlert = async () => {
    if (!formData.symbol || formData.threshold_price <= 0) {
      return;
    }

    try {
      await invoke("create_price_alert", {
        symbol: formData.symbol,
        thresholdPrice: formData.threshold_price,
        direction: formData.direction,
      });
      setFormData({
        symbol: symbol || "",
        threshold_price: currentPrice || 0,
        direction: "above",
        enabled: true,
      });
      await loadAlerts();
    } catch (err) {
      console.error("Error creating alert:", err);
    }
  };

  const handleUpdateAlert = async () => {
    if (!editingAlert) return;

    try {
      await invoke("update_price_alert", {
        alertId: editingAlert.id,
        thresholdPrice: formData.threshold_price > 0 ? formData.threshold_price : null,
        direction: formData.direction !== editingAlert.direction ? formData.direction : null,
        enabled: formData.enabled !== editingAlert.enabled ? formData.enabled : null,
      });
      setEditingAlert(null);
      setFormData({
        symbol: symbol || "",
        threshold_price: currentPrice || 0,
        direction: "above",
        enabled: true,
      });
      await loadAlerts();
    } catch (err) {
      console.error("Error updating alert:", err);
    }
  };

  const handleDeleteAlert = async (alertId: number) => {
    if (!confirm(t("priceAlert.confirmDelete"))) {
      return;
    }

    try {
      await invoke("delete_price_alert", { alertId });
      await loadAlerts();
    } catch (err) {
      console.error("Error deleting alert:", err);
    }
  };

  const handleToggleEnabled = async (alert: PriceAlertInfo) => {
    try {
      await invoke("update_price_alert", {
        alertId: alert.id,
        thresholdPrice: null,
        direction: null,
        enabled: !alert.enabled,
      });
      await loadAlerts();
    } catch (err) {
      console.error("Error toggling alert:", err);
    }
  };

  const handleResetTriggered = async (alertId: number) => {
    try {
      await invoke("reset_price_alert", { alertId });
      await loadAlerts();
    } catch (err) {
      console.error("Error resetting alert:", err);
    }
  };

  const handleEdit = (alert: PriceAlertInfo) => {
    setEditingAlert(alert);
    setFormData({
      symbol: alert.symbol,
      threshold_price: alert.threshold_price,
      direction: alert.direction,
      enabled: alert.enabled,
    });
  };

  const handleCancelEdit = () => {
    setEditingAlert(null);
    setFormData({
      symbol: symbol || "",
      threshold_price: currentPrice || 0,
      direction: "above",
      enabled: true,
    });
    setShowDropdown(false);
  };

  const handleSelectStock = (stock: StockInfo) => {
    setFormData({
      ...formData,
      symbol: stock.symbol,
    });
    setShowDropdown(false);
    setSearchResults([]);
  };

  const getDropdownOptions = (): StockInfo[] => {
    if (searchResults.length > 0) {
      return searchResults;
    }
    if (formData.symbol.trim()) {
      return favoriteStocks.filter(
        (stock) =>
          stock.symbol.toLowerCase().includes(formData.symbol.toLowerCase()) ||
          stock.name.toLowerCase().includes(formData.symbol.toLowerCase())
      ).slice(0, 10);
    }
    return favoriteStocks.slice(0, 10);
  };

  if (!isOpen) return null;

  return (
    <div className="price-alert-dialog-overlay" onClick={onClose}>
      <div className="price-alert-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="price-alert-dialog-header">
          <h2>{t("priceAlert.title")}</h2>
          <button className="price-alert-dialog-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="price-alert-dialog-content">
          <div className="price-alert-form">
            <div className="price-alert-form-row">
              <label>
                {t("stock.symbol")}:
                <div className="price-alert-symbol-input-container">
                  <input
                    ref={inputRef}
                    type="text"
                    value={formData.symbol}
                    onChange={(e) => {
                      setFormData({ ...formData, symbol: e.target.value.toUpperCase() });
                      setShowDropdown(true);
                    }}
                    onFocus={() => {
                      if (formData.symbol.trim()) {
                        setShowDropdown(true);
                      }
                    }}
                    disabled={!!symbol || !!editingAlert}
                    placeholder={t("priceAlert.symbolPlaceholder")}
                  />
                  {searching && <div className="price-alert-search-spinner"></div>}
                  {showDropdown && !symbol && !editingAlert && (
                    <div ref={dropdownRef} className="price-alert-dropdown">
                      {getDropdownOptions().length === 0 ? (
                        <div className="price-alert-dropdown-empty">
                          {t("priceAlert.noStocksFound")}
                        </div>
                      ) : (
                        getDropdownOptions().map((stock) => (
                          <div
                            key={stock.symbol}
                            className="price-alert-dropdown-item"
                            onClick={() => handleSelectStock(stock)}
                          >
                            <div className="price-alert-dropdown-symbol">{stock.symbol}</div>
                            <div className="price-alert-dropdown-name">{stock.name}</div>
                            <div className="price-alert-dropdown-exchange">{stock.exchange}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </label>
            </div>
            <div className="price-alert-form-row">
              <label>
                {t("priceAlert.thresholdPrice")}:
                <input
                  type="number"
                  step="0.01"
                  value={formData.threshold_price || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      threshold_price: parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder={t("priceAlert.pricePlaceholder")}
                />
              </label>
            </div>
            <div className="price-alert-form-row">
              <label>
                {t("priceAlert.direction")}:
                <select
                  value={formData.direction}
                  onChange={(e) =>
                    setFormData({ ...formData, direction: e.target.value })
                  }
                >
                  <option value="above">{t("priceAlert.above")}</option>
                  <option value="below">{t("priceAlert.below")}</option>
                </select>
              </label>
            </div>
            {editingAlert && (
              <div className="price-alert-form-row">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) =>
                      setFormData({ ...formData, enabled: e.target.checked })
                    }
                  />
                  {t("priceAlert.enabled")}
                </label>
              </div>
            )}
            <div className="price-alert-form-actions">
              {editingAlert ? (
                <>
                  <button
                    className="price-alert-button price-alert-button-primary"
                    onClick={handleUpdateAlert}
                  >
                    {t("priceAlert.update")}
                  </button>
                  <button
                    className="price-alert-button"
                    onClick={handleCancelEdit}
                  >
                    {t("priceAlert.cancel")}
                  </button>
                </>
              ) : (
                <button
                  className="price-alert-button price-alert-button-primary"
                  onClick={handleCreateAlert}
                  disabled={!formData.symbol || formData.threshold_price <= 0}
                >
                  {t("priceAlert.create")}
                </button>
              )}
            </div>
          </div>

          <div className="price-alert-list">
            <h3>{t("priceAlert.existingAlerts")}</h3>
            {loading ? (
              <div className="price-alert-loading">{t("app.loading")}</div>
            ) : alerts.length === 0 ? (
              <div className="price-alert-empty">{t("priceAlert.noAlerts")}</div>
            ) : (
              <table className="price-alert-table">
                <thead>
                  <tr>
                    <th>{t("stock.symbol")}</th>
                    <th>{t("priceAlert.thresholdPrice")}</th>
                    <th>{t("priceAlert.direction")}</th>
                    <th>{t("priceAlert.status")}</th>
                    <th>{t("priceAlert.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => (
                    <tr
                      key={alert.id}
                      className={
                        alert.triggered ? "price-alert-triggered" : ""
                      }
                    >
                      <td>{alert.symbol}</td>
                      <td>{alert.threshold_price.toFixed(2)}</td>
                      <td>
                        {alert.direction === "above"
                          ? t("priceAlert.above")
                          : t("priceAlert.below")}
                      </td>
                      <td>
                        <span
                          className={
                            alert.triggered
                              ? "price-alert-status-triggered"
                              : alert.enabled
                              ? "price-alert-status-active"
                              : "price-alert-status-disabled"
                          }
                        >
                          {alert.triggered
                            ? t("priceAlert.triggered")
                            : alert.enabled
                            ? t("priceAlert.active")
                            : t("priceAlert.disabled")}
                        </span>
                      </td>
                      <td>
                        <div className="price-alert-actions">
                          <button
                            className="price-alert-action-btn"
                            onClick={() => handleToggleEnabled(alert)}
                            title={
                              alert.enabled
                                ? t("priceAlert.disable")
                                : t("priceAlert.enable")
                            }
                          >
                            {alert.enabled ? "⏸" : "▶"}
                          </button>
                          {!editingAlert && (
                            <button
                              className="price-alert-action-btn"
                              onClick={() => handleEdit(alert)}
                              title={t("priceAlert.edit")}
                            >
                              ✏️
                            </button>
                          )}
                          {alert.triggered && (
                            <button
                              className="price-alert-action-btn"
                              onClick={() => handleResetTriggered(alert.id)}
                              title={t("priceAlert.reset")}
                            >
                              🔄
                            </button>
                          )}
                          <button
                            className="price-alert-action-btn price-alert-action-delete"
                            onClick={() => handleDeleteAlert(alert.id)}
                            title={t("priceAlert.delete")}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="price-alert-dialog-footer">
          <button className="price-alert-button" onClick={onClose}>
            {t("settings.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PriceAlertDialog;
