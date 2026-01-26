import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import "./HelpDialog.css";

interface HelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type HelpCategory = "introduction" | "interface" | "shortcuts" | "indicators" | "analysis" | "portfolio" | "about";

const HelpDialog: React.FC<HelpDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory>("introduction");

  if (!isOpen) return null;

  const renderIntroduction = () => (
    <div className="help-section">
      <h3>{t("help.introduction")}</h3>
      <p>{t("help.introDesc")}</p>
      
      <h4>{t("help.mainFeatures")}</h4>
      <ul>
        <li>{t("help.feature1")}</li>
        <li>{t("help.feature2")}</li>
        <li>{t("help.feature3")}</li>
        <li>{t("help.feature4")}</li>
        <li>{t("help.feature5")}</li>
        <li>{t("help.feature6")}</li>
      </ul>

      <h4>{t("help.gettingStarted")}</h4>
      <p style={{ whiteSpace: "pre-line" }}>{t("help.gettingStartedDesc")}</p>
    </div>
  );

  const renderInterface = () => (
    <div className="help-section">
      <h3>{t("help.interface")}</h3>
      
      <h4>{t("help.interfaceSidebar")}</h4>
      <p>{t("help.interfaceSidebarDesc")}</p>

      <h4>{t("help.interfaceWorkspace")}</h4>
      <p>{t("help.interfaceWorkspaceDesc")}</p>

      <h4>{t("help.interfaceToolbar")}</h4>
      <p>{t("help.interfaceToolbarDesc")}</p>

      <h4>{t("help.interfaceRightPanel")}</h4>
      <p style={{ whiteSpace: "pre-line" }}>{t("help.interfaceRightPanelDesc")}</p>
    </div>
  );

  const renderShortcuts = () => (
    <div className="help-section">
      <h3>{t("help.shortcuts")}</h3>
      <table className="shortcut-table">
        <thead>
          <tr>
            <th>{t("help.action")}</th>
            <th>{t("help.key")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t("help.refreshData")}</td>
            <td><span className="shortcut-key">F5</span></td>
          </tr>
          <tr>
            <td>{t("help.toggleFullscreen")}</td>
            <td><span className="shortcut-key">F11</span></td>
          </tr>
          <tr>
            <td>{t("help.searchStock")}</td>
            <td><span className="shortcut-key">Ctrl</span> + <span className="shortcut-key">F</span></td>
          </tr>
          <tr>
            <td>{t("help.switchTab")}</td>
            <td><span className="shortcut-key">Ctrl</span> + <span className="shortcut-key">Tab</span></td>
          </tr>
          <tr>
            <td>{t("help.closeTab")}</td>
            <td><span className="shortcut-key">Ctrl</span> + <span className="shortcut-key">W</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const renderIndicators = () => (
    <div className="help-section">
      <h3>{t("help.indicators")}</h3>
      
      <h4>{t("help.maTitle")}</h4>
      <p style={{ whiteSpace: "pre-line" }}>{t("help.maDetail")}</p>

      <h4>{t("help.macdTitle")}</h4>
      <p style={{ whiteSpace: "pre-line" }}>{t("help.macdDetail")}</p>

      <h4>{t("help.rsiTitle")}</h4>
      <p style={{ whiteSpace: "pre-line" }}>{t("help.rsiDetail")}</p>

      <h4>{t("help.kdjTitle")}</h4>
      <p style={{ whiteSpace: "pre-line" }}>{t("help.kdjDetail")}</p>

      <h4>{t("help.bollingerTitle")}</h4>
      <p style={{ whiteSpace: "pre-line" }}>{t("help.bollingerDetail")}</p>
      
      <h4>{t("help.chipTitle")}</h4>
      <p style={{ whiteSpace: "pre-line" }}>{t("help.chipDetail")}</p>
    </div>
  );

  const renderAnalysis = () => (
    <div className="help-section">
      <h3>{t("help.analysis")}</h3>
      
      <h4>{t("help.aiPredictionTitle")}</h4>
      <p style={{ whiteSpace: "pre-line" }}>{t("help.aiPredictionDetail")}</p>

      <h4>{t("help.similarityTitle")}</h4>
      <p style={{ whiteSpace: "pre-line" }}>{t("help.similarityDetail")}</p>

      <h4>{t("help.backtestTitle")}</h4>
      <p style={{ whiteSpace: "pre-line" }}>{t("help.backtestDetail")}</p>
    </div>
  );

  const renderPortfolio = () => (
    <div className="help-section">
      <h3>{t("help.portfolioTitle")}</h3>
      <p style={{ whiteSpace: "pre-line" }}>{t("help.portfolioDetail")}</p>
    </div>
  );

  const renderAbout = () => (
    <div className="help-section">
      <h3>{t("menu.helpAbout")}</h3>
      <p><strong>Stock Analyzer</strong> v0.4.0</p>
      <p>{t("help.aboutDesc")}</p>
      <p>Built with Tauri, React, and Rust.</p>
    </div>
  );

  return (
    <div className="help-dialog-overlay" onClick={onClose}>
      <div className="help-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="help-dialog-header">
          <h2>{t("menu.helpDocumentation")}</h2>
          <button className="help-dialog-close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="help-dialog-body">
          <div className="help-sidebar">
            <div
              className={`help-category-item ${selectedCategory === "introduction" ? "active" : ""}`}
              onClick={() => setSelectedCategory("introduction")}
            >
              {t("help.introduction")}
            </div>
            <div
              className={`help-category-item ${selectedCategory === "interface" ? "active" : ""}`}
              onClick={() => setSelectedCategory("interface")}
            >
              {t("help.interface")}
            </div>
            <div
              className={`help-category-item ${selectedCategory === "indicators" ? "active" : ""}`}
              onClick={() => setSelectedCategory("indicators")}
            >
              {t("help.indicators")}
            </div>
            <div
              className={`help-category-item ${selectedCategory === "analysis" ? "active" : ""}`}
              onClick={() => setSelectedCategory("analysis")}
            >
              {t("help.analysis")}
            </div>
            <div
              className={`help-category-item ${selectedCategory === "portfolio" ? "active" : ""}`}
              onClick={() => setSelectedCategory("portfolio")}
            >
              {t("help.portfolio")}
            </div>
            <div
              className={`help-category-item ${selectedCategory === "shortcuts" ? "active" : ""}`}
              onClick={() => setSelectedCategory("shortcuts")}
            >
              {t("help.shortcuts")}
            </div>
            <div
              className={`help-category-item ${selectedCategory === "about" ? "active" : ""}`}
              onClick={() => setSelectedCategory("about")}
            >
              {t("help.about")}
            </div>
          </div>
          <div className="help-content">
            {selectedCategory === "introduction" && renderIntroduction()}
            {selectedCategory === "interface" && renderInterface()}
            {selectedCategory === "shortcuts" && renderShortcuts()}
            {selectedCategory === "indicators" && renderIndicators()}
            {selectedCategory === "analysis" && renderAnalysis()}
            {selectedCategory === "portfolio" && renderPortfolio()}
            {selectedCategory === "about" && renderAbout()}
          </div>
        </div>
        <div className="help-dialog-footer">
          <button className="help-button" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpDialog;
