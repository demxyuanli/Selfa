import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import "./SettingsDialog.css";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState({
    autoRefresh: false,
    refreshInterval: 5,
    theme: "dark",
  });

  useEffect(() => {
    if (isOpen) {
      const savedSettings = localStorage.getItem("appSettings");
      if (savedSettings) {
        try {
          setSettings({ ...settings, ...JSON.parse(savedSettings) });
        } catch (e) {
          console.error("Failed to load settings:", e);
        }
      }
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem("appSettings", JSON.stringify(settings));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="settings-dialog-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-dialog-header">
          <h2>{t("settings.title")}</h2>
          <button className="settings-dialog-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="settings-dialog-content">
          <div className="settings-section">
            <label className="settings-label">
              <input
                type="checkbox"
                checked={settings.autoRefresh}
                onChange={(e) =>
                  setSettings({ ...settings, autoRefresh: e.target.checked })
                }
              />
              <span>{t("settings.autoRefresh")}</span>
            </label>
          </div>
          <div className="settings-section">
            <label className="settings-label">
              {t("settings.refreshInterval")}:
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
            </label>
          </div>
          <div className="settings-section">
            <label className="settings-label">
              {t("settings.theme")}:
              <select
                value={settings.theme}
                onChange={(e) =>
                  setSettings({ ...settings, theme: e.target.value })
                }
              >
                <option value="dark">{t("settings.themeDark")}</option>
                <option value="light">{t("settings.themeLight")}</option>
              </select>
            </label>
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
