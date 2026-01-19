import React from "react";
import { useTranslation } from "react-i18next";
import { AnalysisResult } from "../types";

interface ResultsPanelProps {
  results: AnalysisResult[];
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({ results }) => {
  const { t } = useTranslation();

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "bullish": return "#2ecc71";
      case "bearish": return "#e74c3c";
      default: return "#f39c12";
    }
  };

  return (
    <div className="analysis-column results-column">
      <div className="column-header">{t("analysis.results")}</div>
      <div className="results-content">
        {results.length === 0 ? (
          <div className="no-data">{t("analysis.noData")}</div>
        ) : (
          <div className="results-list">
            {results.map((result) => (
              <div key={result.key} className="result-card">
                <div className="result-header">
                  <span className="result-title">{t(result.titleKey)}</span>
                  <span className="result-signal" style={{ backgroundColor: getSignalColor(result.signal) }}>
                    {t(`analysis.${result.signal}`)}
                  </span>
                </div>
                <div className="result-desc">
                  {(() => {
                    let desc = t(result.descKey);
                    if (result.descParams) {
                      Object.keys(result.descParams).forEach(key => {
                        desc = desc.replace(`{${key}}`, String(result.descParams[key]));
                      });
                    }
                    return desc;
                  })()}
                </div>
                {result.extraKey && (
                  <div className="result-extra">{t(result.extraKey)}</div>
                )}
                <div className="confidence-bar">
                  <span className="confidence-text">{t("analysis.confidence")}: {result.confidence.toFixed(0)}%</span>
                  <div className="confidence-track">
                    <div className="confidence-fill" style={{ width: `${result.confidence}%`, backgroundColor: getSignalColor(result.signal) }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultsPanel;
