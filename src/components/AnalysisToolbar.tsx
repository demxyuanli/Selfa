import React from "react";
import { useTranslation } from "react-i18next";
import "./AnalysisToolbar.css";

const AnalysisToolbar: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="analysis-toolbar">
      <button className="tool-btn">{t("analysis.indicators")}</button>
      <button className="tool-btn">{t("analysis.trend")}</button>
      <button className="tool-btn">{t("analysis.volume")}</button>
      <button className="tool-btn">{t("analysis.compare")}</button>
    </div>
  );
};

export default AnalysisToolbar;
