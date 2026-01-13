import React from "react";
import { useTranslation } from "react-i18next";
import "./StatusBar.css";

const StatusBar: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="status-bar">
      <div className="status-left">
        <span>{t("status.ready")}</span>
      </div>
      <div className="status-right">
        <span>{t("status.connection")}: OK</span>
      </div>
    </div>
  );
};

export default StatusBar;
