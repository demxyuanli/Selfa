import React from "react";
import { useTranslation } from "react-i18next";
import "./AnalysisToolbar.css";

interface AnalysisToolbarProps {
  onPredictionClick?: () => void;
  onAnalysisClick?: () => void;
  predictionActive?: boolean;
  analysisActive?: boolean;
}

const AnalysisToolbar: React.FC<AnalysisToolbarProps> = ({
  onPredictionClick,
  onAnalysisClick,
  predictionActive = false,
  analysisActive = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className="analysis-toolbar">
      <button
        className={`tool-btn primary ${analysisActive ? "active" : ""}`}
        onClick={onAnalysisClick}
        title="Open comprehensive stock analysis"
      >
        📊 Analysis
      </button>
      <button
        className={`tool-btn ${predictionActive ? "active" : ""}`}
        onClick={onPredictionClick}
      >
        {t("analysis.prediction")}
      </button>
      <button className="tool-btn">{t("analysis.indicators")}</button>
      <button className="tool-btn">{t("analysis.trend")}</button>
      <button className="tool-btn">{t("analysis.volume")}</button>
      <button className="tool-btn">{t("analysis.compare")}</button>
    </div>
  );
};

export default AnalysisToolbar;
