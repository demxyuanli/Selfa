import React from "react";
import { useTranslation } from "react-i18next";
import "./StockAnalysis.css";

export interface ChipParams {
  lookbackPeriod: string; // "6m", "1y", "2y", "3y"
  decayFactor: number; // 0.1 to 1.0
  priceBins: number; // 50 to 200
}

interface ChipParamsPanelProps {
  params: ChipParams;
  onChange: (params: ChipParams) => void;
}

const ChipParamsPanel: React.FC<ChipParamsPanelProps> = ({ params, onChange }) => {
  const { t } = useTranslation();

  const handleDecayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...params, decayFactor: parseFloat(e.target.value) });
  };

  const handleBinsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...params, priceBins: parseInt(e.target.value) });
  };

  const handlePeriodChange = (period: string) => {
    onChange({ ...params, lookbackPeriod: period });
  };

  return (
    <div className="analysis-panel chip-params-panel">
      <div className="panel-header">
        <span>{t("chip.params")}</span>
      </div>
      <div className="panel-content">
        <div className="param-group">
          <label>{t("chip.lookbackPeriod")}</label>
          <div className="period-selector">
            {["6m", "1y", "2y", "3y"].map((p) => (
              <button
                key={p}
                className={`period-btn ${params.lookbackPeriod === p ? "active" : ""}`}
                onClick={() => handlePeriodChange(p)}
              >
                {t(`period.${p}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="param-group">
          <div className="param-header">
            <label>{t("chip.decayFactor")}</label>
            <span className="param-value">{params.decayFactor.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.8"
            max="0.99"
            step="0.01"
            value={params.decayFactor}
            onChange={handleDecayChange}
            className="param-slider"
          />
          <div className="param-desc">{t("chip.decayFactorDesc")}</div>
        </div>

        <div className="param-group">
          <div className="param-header">
            <label>{t("chip.priceBins")}</label>
            <span className="param-value">{params.priceBins}</span>
          </div>
          <input
            type="range"
            min="50"
            max="200"
            step="10"
            value={params.priceBins}
            onChange={handleBinsChange}
            className="param-slider"
          />
          <div className="param-desc">{t("chip.priceBinsDesc")}</div>
        </div>
      </div>
    </div>
  );
};

export default ChipParamsPanel;
