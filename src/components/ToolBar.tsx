import React from "react";
import { useTranslation } from "react-i18next";
import "./ToolBar.css";

const ToolBar: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="tool-bar">
      <div className="tool-group">
        <button className="tool-button" title={t("tool.refresh")}>
          RF
        </button>
        <button className="tool-button" title={t("tool.add")}>
          +
        </button>
        <button className="tool-button" title={t("tool.delete")}>
          −
        </button>
      </div>
      <div className="tool-group">
        <button className="tool-button" title={t("tool.export")}>
          EX
        </button>
        <button className="tool-button" title={t("tool.settings")}>
          ST
        </button>
      </div>
    </div>
  );
};

export default ToolBar;
