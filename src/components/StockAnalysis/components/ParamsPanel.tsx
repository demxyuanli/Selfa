import React from "react";
import { useTranslation } from "react-i18next";
import { TimeSeriesParams, KLineParams } from "../types";

interface ParamsPanelProps {
  analysisType: "timeseries" | "kline";
  tsParams: TimeSeriesParams;
  klParams: KLineParams;
  onTsParamsChange: (params: TimeSeriesParams) => void;
  onKlParamsChange: (params: KLineParams) => void;
}

const ParamsPanel: React.FC<ParamsPanelProps> = ({
  analysisType,
  tsParams,
  klParams,
  onTsParamsChange,
  onKlParamsChange,
}) => {
  const { t } = useTranslation();

  return (
    <div className="analysis-column params-column">
      <div className="column-header">{t("analysis.params")}</div>
      <div className="params-content">
        {analysisType === "timeseries" ? (
          <>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.ma")}</label>
              <div className="param-inputs">
                <div className="param-item">
                  <span className="param-item-label">{t("analysis.period")}</span>
                  <input
                    type="number"
                    value={tsParams.maPeriod}
                    onChange={(e) => onTsParamsChange({ ...tsParams, maPeriod: parseInt(e.target.value) || 5 })}
                    min="2"
                    max="30"
                  />
                </div>
              </div>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("stock.volume")}</label>
              <div className="param-inputs">
                <div className="param-item">
                  <span className="param-item-label">{t("analysis.multiplier")}</span>
                  <input
                    type="number"
                    value={tsParams.volumeMultiplier}
                    onChange={(e) => onTsParamsChange({ ...tsParams, volumeMultiplier: parseFloat(e.target.value) || 2 })}
                    min="1"
                    max="5"
                    step="0.5"
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.macd")}</label>
              <div className="param-inputs">
                <div className="param-item">
                  <span className="param-item-label">{t("analysis.fast")}</span>
                  <input
                    type="number"
                    value={klParams.macdFast}
                    onChange={(e) => onKlParamsChange({ ...klParams, macdFast: parseInt(e.target.value) || 12 })}
                    min="5"
                    max="20"
                  />
                </div>
                <div className="param-item">
                  <span className="param-item-label">{t("analysis.slow")}</span>
                  <input
                    type="number"
                    value={klParams.macdSlow}
                    onChange={(e) => onKlParamsChange({ ...klParams, macdSlow: parseInt(e.target.value) || 26 })}
                    min="15"
                    max="40"
                  />
                </div>
                <div className="param-item">
                  <span className="param-item-label">{t("analysis.macdSignal")}</span>
                  <input
                    type="number"
                    value={klParams.macdSignal}
                    onChange={(e) => onKlParamsChange({ ...klParams, macdSignal: parseInt(e.target.value) || 9 })}
                    min="5"
                    max="15"
                  />
                </div>
              </div>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.rsi")}</label>
              <div className="param-inputs">
                <div className="param-item">
                  <span className="param-item-label">{t("analysis.period")}</span>
                  <input
                    type="number"
                    value={klParams.rsiPeriod}
                    onChange={(e) => onKlParamsChange({ ...klParams, rsiPeriod: parseInt(e.target.value) || 14 })}
                    min="5"
                    max="30"
                  />
                </div>
              </div>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.kdj")}</label>
              <div className="param-inputs">
                <div className="param-item">
                  <span className="param-item-label">{t("analysis.period")}</span>
                  <input
                    type="number"
                    value={klParams.kdjPeriod}
                    onChange={(e) => onKlParamsChange({ ...klParams, kdjPeriod: parseInt(e.target.value) || 9 })}
                    min="5"
                    max="20"
                  />
                </div>
              </div>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.bollingerBands")}</label>
              <div className="param-inputs">
                <div className="param-item">
                  <span className="param-item-label">{t("analysis.period")}</span>
                  <input
                    type="number"
                    value={klParams.bbPeriod}
                    onChange={(e) => onKlParamsChange({ ...klParams, bbPeriod: parseInt(e.target.value) || 20 })}
                    min="10"
                    max="30"
                  />
                </div>
              </div>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.atr")}</label>
              <div className="param-inputs">
                <div className="param-item">
                  <span className="param-item-label">{t("analysis.period")}</span>
                  <input
                    type="number"
                    value={klParams.atrPeriod}
                    onChange={(e) => onKlParamsChange({ ...klParams, atrPeriod: parseInt(e.target.value) || 14 })}
                    min="5"
                    max="30"
                  />
                </div>
              </div>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.trend")}</label>
              <div className="param-inputs">
                <div className="param-item">
                  <span className="param-item-label">{t("analysis.days")}</span>
                  <input
                    type="number"
                    value={klParams.trendDays}
                    onChange={(e) => onKlParamsChange({ ...klParams, trendDays: parseInt(e.target.value) || 20 })}
                    min="5"
                    max="60"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ParamsPanel;
