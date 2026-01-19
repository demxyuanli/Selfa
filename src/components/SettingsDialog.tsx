import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_SETTINGS, type AppSettings } from "../utils/settings";
import Icon from "./Icon";
import "./SettingsDialog.css";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsCategory = "general" | "commonParams" | "technicalIndicators" | "backtest" | "analysis";

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<SettingsCategory>("general");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (isOpen) {
      const savedSettings = localStorage.getItem("appSettings");
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          const loadedSettings = {
            ...DEFAULT_SETTINGS,
            ...parsed,
            technicalIndicators: {
              ...DEFAULT_SETTINGS.technicalIndicators,
              ...parsed.technicalIndicators,
            },
            backtest: {
              ...DEFAULT_SETTINGS.backtest,
              ...parsed.backtest,
            },
            analysis: {
              ...DEFAULT_SETTINGS.analysis,
              ...parsed.analysis,
            },
            chipDistribution: {
              ...DEFAULT_SETTINGS.chipDistribution,
              ...parsed.chipDistribution,
            },
          };
          setSettings(loadedSettings);
          // Apply font settings when dialog opens
          const root = document.documentElement;
          root.style.setProperty("--font-family", loadedSettings.fontFamily);
          root.style.setProperty("--font-size", `${loadedSettings.fontSize}px`);
          root.style.setProperty("--number-font-family", loadedSettings.numberFontFamily);
        } catch (e) {
          console.error("Failed to load settings:", e);
        }
      } else {
        // Apply default font settings when dialog opens
        const root = document.documentElement;
        root.style.setProperty("--font-family", DEFAULT_SETTINGS.fontFamily);
        root.style.setProperty("--font-size", `${DEFAULT_SETTINGS.fontSize}px`);
        root.style.setProperty("--number-font-family", DEFAULT_SETTINGS.numberFontFamily);
      }
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem("appSettings", JSON.stringify(settings));
    // Apply theme
    const root = document.documentElement;
    if (settings.theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.setAttribute("data-theme", "dark");
    }
    // Apply font settings
    root.style.setProperty("--font-family", settings.fontFamily);
    root.style.setProperty("--font-size", `${settings.fontSize}px`);
    root.style.setProperty("--number-font-family", settings.numberFontFamily);
    // Dispatch custom event for same-window updates
    window.dispatchEvent(new Event("settingsChanged"));
    onClose();
  };

  if (!isOpen) return null;

  const renderGeneralSettings = () => (
    <>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.autoRefresh")}</span>
          <div className="settings-input-group">
            <input
              type="checkbox"
              checked={settings.autoRefresh}
              onChange={(e) =>
                setSettings({ ...settings, autoRefresh: e.target.checked })
              }
            />
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.refreshInterval")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="1"
              max="60"
              value={settings.refreshInterval}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  refreshInterval: parseInt(e.target.value) || 5,
                })
              }
              disabled={!settings.autoRefresh}
            />
            <span>{t("settings.seconds")}</span>
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.theme")}:</span>
          <div className="settings-input-group">
            <select
              value={settings.theme}
              onChange={(e) => {
                const newTheme = e.target.value;
                setSettings({ ...settings, theme: newTheme });
                // Apply theme immediately for preview
                const root = document.documentElement;
                if (newTheme === "light") {
                  root.setAttribute("data-theme", "light");
                } else {
                  root.setAttribute("data-theme", "dark");
                }
              }}
            >
              <option value="dark">{t("settings.themeDark")}</option>
              <option value="light">{t("settings.themeLight")}</option>
            </select>
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.fontFamily")}:</span>
          <div className="settings-input-group">
            <select
              value={settings.fontFamily}
              onChange={(e) => {
                const newFontFamily = e.target.value;
                setSettings({ ...settings, fontFamily: newFontFamily });
                // Apply font immediately for preview
                document.documentElement.style.setProperty("--font-family", newFontFamily);
              }}
            >
              <option value="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif">
                {t("settings.fontSystem")}
              </option>
              <option value="'Consolas', 'Monaco', 'Courier New', monospace">
                {t("settings.fontMonospace")}
              </option>
              <option value="'Microsoft YaHei', '微软雅黑', 'SimHei', '黑体', sans-serif">
                {t("settings.fontChinese")}
              </option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="Georgia, serif">Georgia</option>
            </select>
          </div>
        </label>
        <div className="settings-description">
          {t("settings.fontFamilyDesc")}
        </div>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.fontSize")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="10"
              max="20"
              step="1"
              value={settings.fontSize}
              onChange={(e) => {
                const newFontSize = parseInt(e.target.value) || 13;
                setSettings({ ...settings, fontSize: newFontSize });
                // Apply font size immediately for preview
                document.documentElement.style.setProperty("--font-size", `${newFontSize}px`);
              }}
            />
            <span className="settings-unit">px</span>
          </div>
        </label>
        <div className="settings-description">
          {t("settings.fontSizeDesc")}
        </div>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.numberFontFamily")}:</span>
          <div className="settings-input-group">
            <select
              value={settings.numberFontFamily}
              onChange={(e) => {
                const newNumberFontFamily = e.target.value;
                setSettings({ ...settings, numberFontFamily: newNumberFontFamily });
                // Apply number font immediately for preview
                document.documentElement.style.setProperty("--number-font-family", newNumberFontFamily);
              }}
            >
              <option value="'Consolas', 'Monaco', 'Courier New', 'Roboto Mono', 'Source Code Pro', monospace">
                {t("settings.numberFontMonospace")}
              </option>
              <option value="'DIN', 'Arial', sans-serif">
                {t("settings.numberFontDIN")}
              </option>
              <option value="'Roboto Mono', 'Consolas', monospace">
                {t("settings.numberFontRobotoMono")}
              </option>
              <option value="'Source Code Pro', 'Consolas', monospace">
                {t("settings.numberFontSourceCode")}
              </option>
              <option value="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif">
                {t("settings.numberFontSystem")}
              </option>
            </select>
          </div>
        </label>
        <div className="settings-description">
          {t("settings.numberFontFamilyDesc")}
        </div>
      </div>
    </>
  );

  const renderCommonParamsSettings = () => (
    <>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.defaultCommissionRate")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="0"
              max="1"
              step="0.0001"
              value={settings.defaultCommissionRate}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultCommissionRate: parseFloat(e.target.value) || 0,
                })
              }
            />
            <span className="settings-unit">({t("settings.rate")})</span>
          </div>
        </label>
        <div className="settings-description">
          {t("settings.defaultCommissionRateDesc")}
        </div>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.defaultCommission")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="0"
              step="0.01"
              value={settings.defaultCommission}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultCommission: parseFloat(e.target.value) || 0,
                })
              }
            />
            <span className="settings-unit">¥</span>
          </div>
        </label>
        <div className="settings-description">
          {t("settings.defaultCommissionDesc")}
        </div>
      </div>
    </>
  );

  const renderTechnicalIndicatorsSettings = () => (
    <>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.rsiPeriod")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="5"
              max="30"
              value={settings.technicalIndicators.rsiPeriod}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  technicalIndicators: {
                    ...settings.technicalIndicators,
                    rsiPeriod: parseInt(e.target.value) || 14,
                  },
                })
              }
            />
          </div>
        </label>
        <div className="settings-description">
          {t("settings.rsiPeriodDesc")}
        </div>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.macdFast")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="5"
              max="20"
              value={settings.technicalIndicators.macdFast}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  technicalIndicators: {
                    ...settings.technicalIndicators,
                    macdFast: parseInt(e.target.value) || 12,
                  },
                })
              }
            />
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.macdSlow")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="15"
              max="40"
              value={settings.technicalIndicators.macdSlow}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  technicalIndicators: {
                    ...settings.technicalIndicators,
                    macdSlow: parseInt(e.target.value) || 26,
                  },
                })
              }
            />
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.macdSignal")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="5"
              max="15"
              value={settings.technicalIndicators.macdSignal}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  technicalIndicators: {
                    ...settings.technicalIndicators,
                    macdSignal: parseInt(e.target.value) || 9,
                  },
                })
              }
            />
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.kdjPeriod")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="5"
              max="20"
              value={settings.technicalIndicators.kdjPeriod}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  technicalIndicators: {
                    ...settings.technicalIndicators,
                    kdjPeriod: parseInt(e.target.value) || 9,
                  },
                })
              }
            />
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.bbPeriod")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="10"
              max="30"
              value={settings.technicalIndicators.bbPeriod}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  technicalIndicators: {
                    ...settings.technicalIndicators,
                    bbPeriod: parseInt(e.target.value) || 20,
                  },
                })
              }
            />
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.atrPeriod")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="5"
              max="30"
              value={settings.technicalIndicators.atrPeriod}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  technicalIndicators: {
                    ...settings.technicalIndicators,
                    atrPeriod: parseInt(e.target.value) || 14,
                  },
                })
              }
            />
          </div>
        </label>
      </div>
    </>
  );

  const renderBacktestSettings = () => (
    <>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.initialCapital")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="1000"
              step="1000"
              value={settings.backtest.initialCapital}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  backtest: {
                    ...settings.backtest,
                    initialCapital: parseInt(e.target.value) || 100000,
                  },
                })
              }
            />
            <span className="settings-unit">¥</span>
          </div>
        </label>
        <div className="settings-description">
          {t("settings.initialCapitalDesc")}
        </div>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.rsiOverbought")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="50"
              max="90"
              value={settings.backtest.rsiOverbought}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  backtest: {
                    ...settings.backtest,
                    rsiOverbought: parseInt(e.target.value) || 70,
                  },
                })
              }
            />
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.rsiOversold")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="10"
              max="50"
              value={settings.backtest.rsiOversold}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  backtest: {
                    ...settings.backtest,
                    rsiOversold: parseInt(e.target.value) || 30,
                  },
                })
              }
            />
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.stopLossPercent")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="1"
              max="20"
              step="0.5"
              value={settings.backtest.stopLossPercent}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  backtest: {
                    ...settings.backtest,
                    stopLossPercent: parseFloat(e.target.value) || 5,
                  },
                })
              }
            />
            <span className="settings-unit">%</span>
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.takeProfitPercent")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="1"
              max="50"
              step="0.5"
              value={settings.backtest.takeProfitPercent}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  backtest: {
                    ...settings.backtest,
                    takeProfitPercent: parseFloat(e.target.value) || 10,
                  },
                })
              }
            />
            <span className="settings-unit">%</span>
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.positionSizePercent")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="10"
              max="100"
              step="5"
              value={settings.backtest.positionSizePercent}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  backtest: {
                    ...settings.backtest,
                    positionSizePercent: parseInt(e.target.value) || 100,
                  },
                })
              }
            />
            <span className="settings-unit">%</span>
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.volumeMultiplier")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="1"
              max="5"
              step="0.1"
              value={settings.backtest.volumeMultiplier}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  backtest: {
                    ...settings.backtest,
                    volumeMultiplier: parseFloat(e.target.value) || 1.2,
                  },
                })
              }
            />
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.maFast")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="3"
              max="20"
              value={settings.backtest.maFast}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  backtest: {
                    ...settings.backtest,
                    maFast: parseInt(e.target.value) || 5,
                  },
                })
              }
            />
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.maSlow")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="10"
              max="60"
              value={settings.backtest.maSlow}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  backtest: {
                    ...settings.backtest,
                    maSlow: parseInt(e.target.value) || 20,
                  },
                })
              }
            />
          </div>
        </label>
      </div>
    </>
  );

  const renderAnalysisSettings = () => (
    <>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.priceChangeThreshold")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="0.5"
              max="10"
              step="0.1"
              value={settings.analysis.priceChangeThreshold}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  analysis: {
                    ...settings.analysis,
                    priceChangeThreshold: parseFloat(e.target.value) || 2.0,
                  },
                })
              }
            />
            <span className="settings-unit">%</span>
          </div>
        </label>
        <div className="settings-description">
          {t("settings.priceChangeThresholdDesc")}
        </div>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.analysisVolumeMultiplier")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="1"
              max="5"
              step="0.1"
              value={settings.analysis.volumeMultiplier}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  analysis: {
                    ...settings.analysis,
                    volumeMultiplier: parseFloat(e.target.value) || 2.0,
                  },
                })
              }
            />
          </div>
        </label>
        <div className="settings-description">
          {t("settings.analysisVolumeMultiplierDesc")}
        </div>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.maPeriod")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="3"
              max="30"
              value={settings.analysis.maPeriod}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  analysis: {
                    ...settings.analysis,
                    maPeriod: parseInt(e.target.value) || 5,
                  },
                })
              }
            />
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.trendDays")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="5"
              max="60"
              value={settings.analysis.trendDays}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  analysis: {
                    ...settings.analysis,
                    trendDays: parseInt(e.target.value) || 20,
                  },
                })
              }
            />
          </div>
        </label>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.chipPriceBins")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="20"
              max="100"
              value={settings.chipDistribution.priceBins}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  chipDistribution: {
                    ...settings.chipDistribution,
                    priceBins: parseInt(e.target.value) || 60,
                  },
                })
              }
            />
          </div>
        </label>
        <div className="settings-description">
          {t("settings.chipPriceBinsDesc")}
        </div>
      </div>
      <div className="settings-section">
        <label className="settings-label">
          <span>{t("settings.chipDecayFactor")}:</span>
          <div className="settings-input-group">
            <input
              type="number"
              min="0.8"
              max="0.99"
              step="0.01"
              value={settings.chipDistribution.decayFactor}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  chipDistribution: {
                    ...settings.chipDistribution,
                    decayFactor: parseFloat(e.target.value) || 0.95,
                  },
                })
              }
            />
          </div>
        </label>
        <div className="settings-description">
          {t("settings.chipDecayFactorDesc")}
        </div>
      </div>
    </>
  );

  return (
    <div className="settings-dialog-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-dialog-header">
          <h2>{t("settings.title")}</h2>
          <button className="settings-dialog-close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="settings-dialog-body">
          <div className="settings-sidebar">
            <div
              className={`settings-category-item ${selectedCategory === "general" ? "active" : ""}`}
              onClick={() => setSelectedCategory("general")}
            >
              {t("settings.categoryGeneral")}
            </div>
            <div
              className={`settings-category-item ${selectedCategory === "commonParams" ? "active" : ""}`}
              onClick={() => setSelectedCategory("commonParams")}
            >
              {t("settings.commonParams")}
            </div>
            <div
              className={`settings-category-item ${selectedCategory === "technicalIndicators" ? "active" : ""}`}
              onClick={() => setSelectedCategory("technicalIndicators")}
            >
              {t("settings.technicalIndicators")}
            </div>
            <div
              className={`settings-category-item ${selectedCategory === "backtest" ? "active" : ""}`}
              onClick={() => setSelectedCategory("backtest")}
            >
              {t("settings.backtest")}
            </div>
            <div
              className={`settings-category-item ${selectedCategory === "analysis" ? "active" : ""}`}
              onClick={() => setSelectedCategory("analysis")}
            >
              {t("settings.analysis")}
            </div>
          </div>
          <div className="settings-content">
            <div className="settings-content-inner">
              {selectedCategory === "general" && renderGeneralSettings()}
              {selectedCategory === "commonParams" && renderCommonParamsSettings()}
              {selectedCategory === "technicalIndicators" && renderTechnicalIndicatorsSettings()}
              {selectedCategory === "backtest" && renderBacktestSettings()}
              {selectedCategory === "analysis" && renderAnalysisSettings()}
            </div>
          </div>
        </div>
        <div className="settings-dialog-footer">
          <button className="settings-button settings-button-primary" onClick={handleSave}>
            {t("settings.save")}
          </button>
          <button className="settings-button" onClick={onClose}>
            {t("settings.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;
