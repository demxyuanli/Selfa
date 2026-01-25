import React from "react";
import { useTranslation } from "react-i18next";
import "./StockAnalysis.css";

export interface ChipParams {
  lookbackPeriod: string; // "6m", "1y", "2y", "3y"
  decayFactor: number; // For Fixed: 0.8-0.99, For Dynamic: 0.5-2.0 (decay coefficient A)
  priceBins: number; // 50 to 200
  decayMethod: "fixed" | "dynamic"; // Decay method: fixed or dynamic (kengerlwl)
  distributionType: "uniform" | "triangular"; // Distribution type: uniform or triangular
}

interface ChipParamsPanelProps {
  params: ChipParams;
  onChange: (params: ChipParams) => void;
}

const ChipParamsPanel: React.FC<ChipParamsPanelProps> = ({ params, onChange }) => {
  const { t } = useTranslation();

  const handleDecayMethodChange = (method: "fixed" | "dynamic") => {
    onChange({ 
      ...params, 
      decayMethod: method,
      // Adjust default decay factor based on method
      decayFactor: method === "fixed" ? 0.97 : 1.0
    });
  };

  const handleDistributionTypeChange = (type: "uniform" | "triangular") => {
    onChange({ ...params, distributionType: type });
  };

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
          <label>{t("chip.decayMethod")}</label>
          <div className="period-selector">
            <button
              className={`period-btn ${params.decayMethod === "fixed" ? "active" : ""}`}
              onClick={() => handleDecayMethodChange("fixed")}
            >
              {t("chip.decayMethodFixed")}
            </button>
            <button
              className={`period-btn ${params.decayMethod === "dynamic" ? "active" : ""}`}
              onClick={() => handleDecayMethodChange("dynamic")}
            >
              {t("chip.decayMethodDynamic")}
            </button>
          </div>
          <div className="param-desc">{t("chip.decayMethodDesc")}</div>
        </div>

        {params.decayMethod === "dynamic" && (
          <div className="param-group">
            <label>{t("chip.distributionType")}</label>
            <div className="period-selector">
              <button
                className={`period-btn ${params.distributionType === "uniform" ? "active" : ""}`}
                onClick={() => handleDistributionTypeChange("uniform")}
              >
                {t("chip.distributionUniform")}
              </button>
              <button
                className={`period-btn ${params.distributionType === "triangular" ? "active" : ""}`}
                onClick={() => handleDistributionTypeChange("triangular")}
              >
                {t("chip.distributionTriangular")}
              </button>
            </div>
            <div className="param-desc">{t("chip.distributionTypeDesc")}</div>
          </div>
        )}

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
            <label>{params.decayMethod === "fixed" ? t("chip.decayFactor") : t("chip.decayCoefficient")}</label>
            <span className="param-value">{params.decayFactor.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={params.decayMethod === "fixed" ? "0.8" : "0.5"}
            max={params.decayMethod === "fixed" ? "0.99" : "2.0"}
            step="0.01"
            value={params.decayFactor}
            onChange={handleDecayChange}
            className="param-slider"
          />
          <div className="param-desc">
            {params.decayMethod === "fixed" 
              ? t("chip.decayFactorDesc")
              : t("chip.decayCoefficientDesc")
            }
          </div>
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
