import React from "react";
import { useTranslation } from "react-i18next";
import { IndicatorType, OscillatorType, IndicatorParams, GannConfig } from "./types";

interface ResultsPanelProps {
  overlayIndicator: IndicatorType;
  oscillatorType: OscillatorType;
  showSignals: boolean;
  showGann: boolean;
  indicatorParams: IndicatorParams;
  gannConfig: GannConfig;
  onIndicatorParamsChange: (params: IndicatorParams) => void;
  onGannConfigChange: (config: GannConfig) => void;
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({
  overlayIndicator,
  oscillatorType,
  showSignals,
  showGann,
  indicatorParams,
  gannConfig,
  onIndicatorParamsChange,
  onGannConfigChange,
}) => {
  const { t } = useTranslation();

  return (
    <div className="analysis-column results-column">
      <div className="column-header">{t("analysis.results")}</div>
      <div className="results-content">
        <div className="indicator-summary">
          {overlayIndicator !== "none" && (
            <div className="summary-card">
              <div className="summary-title">{t("analysis.overlayIndicator")}: {overlayIndicator.toUpperCase()}</div>
              <div className="summary-desc">
                {overlayIndicator === "sma" && t("analysis.overlayDescSMA")}
                {overlayIndicator === "ema" && t("analysis.overlayDescEMA")}
                {overlayIndicator === "bollinger" && t("analysis.overlayDescBollinger")}
                {overlayIndicator === "vwap" && t("analysis.overlayDescVWAP")}
              </div>
            </div>
          )}
          
          {showGann && (
            <>
              <div className="summary-card">
                <div className="summary-title">{t("analysis.gannSquareOf9")}</div>
                <div className="summary-desc">{t("analysis.overlayDescGann")}</div>
              </div>
              
              <div className="param-section">
                <label className="param-section-label">{t("analysis.gannParams")}</label>
                <div className="param-inputs">
                  <div className="param-row">
                    <label>{t("analysis.gannReferenceMode")}</label>
                    <select
                      value={gannConfig.referenceMode}
                      onChange={(e) => onGannConfigChange({...gannConfig, referenceMode: e.target.value as typeof gannConfig.referenceMode})}
                      className="param-select"
                    >
                      <option value="current">{t("analysis.gannReferenceCurrent")}</option>
                      <option value="swingLow">{t("analysis.gannReferenceSwingLow")}</option>
                      <option value="swingHigh">{t("analysis.gannReferenceSwingHigh")}</option>
                      <option value="average">{t("analysis.gannReferenceAverage")}</option>
                      <option value="custom">{t("analysis.gannReferenceCustom")}</option>
                    </select>
                  </div>
                  {gannConfig.referenceMode === "custom" && (
                    <div className="param-row">
                      <label>{t("analysis.gannCustomPrice")}</label>
                      <input
                        type="number"
                        value={gannConfig.customReferencePrice}
                        onChange={(e) => onGannConfigChange({...gannConfig, customReferencePrice: parseFloat(e.target.value) || 0})}
                        step="0.01"
                        min="0"
                        className="param-input"
                      />
                    </div>
                  )}
                  <div className="param-row">
                    <label>{t("analysis.gannCycles")}</label>
                    <input
                      type="number"
                      value={gannConfig.cycles}
                      onChange={(e) => onGannConfigChange({...gannConfig, cycles: parseInt(e.target.value) || 1})}
                      min="1"
                      max="5"
                      className="param-input"
                    />
                  </div>
                  <div className="param-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={gannConfig.showMajorAngles}
                        onChange={(e) => onGannConfigChange({...gannConfig, showMajorAngles: e.target.checked})}
                      />
                      <span>{t("analysis.gannShowMajorAngles")}</span>
                    </label>
                  </div>
                  <div className="param-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={gannConfig.showSupport}
                        onChange={(e) => onGannConfigChange({...gannConfig, showSupport: e.target.checked})}
                      />
                      <span>{t("analysis.gannShowSupport")}</span>
                    </label>
                  </div>
                  <div className="param-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={gannConfig.showResistance}
                        onChange={(e) => onGannConfigChange({...gannConfig, showResistance: e.target.checked})}
                      />
                      <span>{t("analysis.gannShowResistance")}</span>
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}
          
          {oscillatorType !== "none" && (
            <>
              <div className="param-section">
                <label className="param-section-label">{t("analysis.indicatorParams")}</label>
                <div className="param-inputs">
                  {oscillatorType === "rsi" && (
                    <div className="param-row">
                      <label>RSI {t("analysis.period")}</label>
                      <input
                        type="number"
                        value={indicatorParams.rsiPeriod}
                        onChange={(e) => onIndicatorParamsChange({...indicatorParams, rsiPeriod: parseInt(e.target.value) || 14})}
                        min="2"
                        max="50"
                        className="param-input"
                      />
                    </div>
                  )}
                  {oscillatorType === "macd" && (
                    <>
                      <div className="param-row">
                        <label>MACD Fast</label>
                        <input
                          type="number"
                          value={indicatorParams.macdFast}
                          onChange={(e) => onIndicatorParamsChange({...indicatorParams, macdFast: parseInt(e.target.value) || 12})}
                          min="2"
                          max="50"
                          className="param-input"
                        />
                      </div>
                      <div className="param-row">
                        <label>MACD Slow</label>
                        <input
                          type="number"
                          value={indicatorParams.macdSlow}
                          onChange={(e) => onIndicatorParamsChange({...indicatorParams, macdSlow: parseInt(e.target.value) || 26})}
                          min="5"
                          max="100"
                          className="param-input"
                        />
                      </div>
                      <div className="param-row">
                        <label>MACD Signal</label>
                        <input
                          type="number"
                          value={indicatorParams.macdSignal}
                          onChange={(e) => onIndicatorParamsChange({...indicatorParams, macdSignal: parseInt(e.target.value) || 9})}
                          min="2"
                          max="50"
                          className="param-input"
                        />
                      </div>
                    </>
                  )}
                  {oscillatorType === "kdj" && (
                    <div className="param-row">
                      <label>KDJ {t("analysis.period")}</label>
                      <input
                        type="number"
                        value={indicatorParams.kdjPeriod}
                        onChange={(e) => onIndicatorParamsChange({...indicatorParams, kdjPeriod: parseInt(e.target.value) || 9})}
                        min="2"
                        max="50"
                        className="param-input"
                      />
                    </div>
                  )}
                  {oscillatorType === "momentum" && (
                    <div className="param-row">
                      <label>{t("analysis.period")}</label>
                      <input
                        type="number"
                        value={indicatorParams.momentumPeriod}
                        onChange={(e) => onIndicatorParamsChange({...indicatorParams, momentumPeriod: parseInt(e.target.value) || 10})}
                        min="2"
                        max="50"
                        className="param-input"
                      />
                    </div>
                  )}
                  {oscillatorType === "cci" && (
                    <div className="param-row">
                      <label>CCI {t("analysis.period")}</label>
                      <input
                        type="number"
                        value={indicatorParams.cciPeriod}
                        onChange={(e) => onIndicatorParamsChange({...indicatorParams, cciPeriod: parseInt(e.target.value) || 20})}
                        min="2"
                        max="50"
                        className="param-input"
                      />
                    </div>
                  )}
                  {oscillatorType === "adx" && (
                    <div className="param-row">
                      <label>ADX {t("analysis.period")}</label>
                      <input
                        type="number"
                        value={indicatorParams.adxPeriod}
                        onChange={(e) => onIndicatorParamsChange({...indicatorParams, adxPeriod: parseInt(e.target.value) || 14})}
                        min="2"
                        max="50"
                        className="param-input"
                      />
                    </div>
                  )}
                  {oscillatorType === "stochrsi" && (
                    <>
                      <div className="param-row">
                        <label>RSI {t("analysis.period")}</label>
                        <input
                          type="number"
                          value={indicatorParams.stochRsiRsiPeriod}
                          onChange={(e) => onIndicatorParamsChange({...indicatorParams, stochRsiRsiPeriod: parseInt(e.target.value) || 14})}
                          min="2"
                          max="50"
                          className="param-input"
                        />
                      </div>
                      <div className="param-row">
                        <label>Stoch {t("analysis.period")}</label>
                        <input
                          type="number"
                          value={indicatorParams.stochRsiStochPeriod}
                          onChange={(e) => onIndicatorParamsChange({...indicatorParams, stochRsiStochPeriod: parseInt(e.target.value) || 14})}
                          min="2"
                          max="50"
                          className="param-input"
                        />
                      </div>
                    </>
                  )}
                  {oscillatorType === "bbpercent" && (
                    <div className="param-row">
                      <label>BB {t("analysis.period")}</label>
                      <input
                        type="number"
                        value={indicatorParams.bbPercentPeriod}
                        onChange={(e) => onIndicatorParamsChange({...indicatorParams, bbPercentPeriod: parseInt(e.target.value) || 20})}
                        min="2"
                        max="50"
                        className="param-input"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="summary-card">
                <div className="summary-title">{t("analysis.oscillator")}: {oscillatorType.toUpperCase()}</div>
                <div className="summary-desc">
                  {oscillatorType === "rsi" && t("analysis.oscillatorDescRSI")}
                  {oscillatorType === "macd" && t("analysis.oscillatorDescMACD")}
                  {oscillatorType === "kdj" && t("analysis.oscillatorDescKDJ")}
                  {oscillatorType === "momentum" && t("analysis.oscillatorDescMomentum")}
                  {oscillatorType === "cci" && t("analysis.oscillatorDescCCI")}
                  {oscillatorType === "adx" && t("analysis.oscillatorDescADX")}
                  {oscillatorType === "dmi" && t("analysis.oscillatorDescDMI")}
                  {oscillatorType === "stochrsi" && t("analysis.oscillatorDescStochRSI")}
                  {oscillatorType === "bbpercent" && t("analysis.oscillatorDescBBPercent")}
                </div>
              </div>
            </>
          )}
          {showSignals && (
            <div className="summary-card">
              <div className="summary-title">{t("analysis.tradingSignals")}</div>
              <div className="summary-desc" dangerouslySetInnerHTML={{ __html: t("analysis.signalDesc") }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultsPanel;
