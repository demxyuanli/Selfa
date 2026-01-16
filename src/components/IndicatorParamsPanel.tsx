// Indicator Parameters Panel Component

import React from "react";
import { useTranslation } from "react-i18next";
import { IndicatorType, OscillatorType } from "../utils/chartConfigGenerator";

interface IndicatorParamsPanelProps {
  overlayIndicator: IndicatorType;
  oscillatorType: OscillatorType;
  showSignals: boolean;
  onOverlayIndicatorChange: (value: IndicatorType) => void;
  onOscillatorTypeChange: (value: OscillatorType) => void;
  onShowSignalsChange: (value: boolean) => void;
}

const IndicatorParamsPanel: React.FC<IndicatorParamsPanelProps> = ({
  overlayIndicator,
  oscillatorType,
  showSignals,
  onOverlayIndicatorChange,
  onOscillatorTypeChange,
  onShowSignalsChange,
}) => {
  const { t } = useTranslation();

  return (
    <div className="analysis-column params-column">
      <div className="column-header">{t("analysis.params")}</div>
      <div className="params-content">
        <div className="param-section">
          <label className="param-section-label">{t("analysis.overlayIndicator")}</label>
          <div className="param-inputs">
            <select
              value={overlayIndicator}
              onChange={(e) => onOverlayIndicatorChange(e.target.value as IndicatorType)}
              className="param-select"
            >
              <option value="none">{t("analysis.overlayNone")}</option>
              <option value="sma">{t("analysis.overlaySMA")}</option>
              <option value="ema">{t("analysis.overlayEMA")}</option>
              <option value="bollinger">{t("analysis.overlayBollinger")}</option>
              <option value="vwap">{t("analysis.overlayVWAP")}</option>
            </select>
          </div>
        </div>
        <div className="param-section">
          <label className="param-section-label">{t("analysis.oscillator")}</label>
          <div className="param-inputs">
            <select
              value={oscillatorType}
              onChange={(e) => onOscillatorTypeChange(e.target.value as OscillatorType)}
              className="param-select"
            >
              <option value="none">{t("analysis.oscillatorNone")}</option>
              <option value="rsi">{t("analysis.oscillatorRSI")}</option>
              <option value="macd">{t("analysis.oscillatorMACD")}</option>
              <option value="kdj">{t("analysis.oscillatorKDJ")}</option>
              <option value="momentum">{t("analysis.oscillatorMomentum")}</option>
              <option value="cci">{t("analysis.oscillatorCCI")}</option>
              <option value="adx">{t("analysis.oscillatorADX")}</option>
              <option value="dmi">{t("analysis.oscillatorDMI")}</option>
              <option value="stochrsi">{t("analysis.oscillatorStochRSI")}</option>
              <option value="bbpercent">{t("analysis.oscillatorBBPercent")}</option>
            </select>
          </div>
        </div>
        <div className="param-section">
          <label className="param-section-label">{t("analysis.tradingSignals")}</label>
          <div className="param-inputs">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showSignals}
                onChange={(e) => onShowSignalsChange(e.target.checked)}
              />
              <span>{t("analysis.showSignals")}</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndicatorParamsPanel;
