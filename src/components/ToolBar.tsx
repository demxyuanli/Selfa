import React from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import "./ToolBar.css";

const ToolBar: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="tool-bar">
      <div className="tool-group">
        <button className="tool-button" title={t("tool.refresh")}>
          <Icon name="refresh" size={14} />
        </button>
        <button className="tool-button" title={t("tool.add")}>
          <Icon name="add" size={14} />
        </button>
        <button className="tool-button" title={t("tool.delete")}>
          <Icon name="delete" size={14} />
        </button>
      </div>
      <div className="tool-group">
        <button className="tool-button" title={t("tool.export")}>
          <Icon name="export" size={14} />
        </button>
        <button className="tool-button" title={t("tool.settings")}>
          <Icon name="settings" size={14} />
        </button>
      </div>
    </div>
  );
};

export default ToolBar;
