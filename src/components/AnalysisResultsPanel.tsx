// Analysis Results Panel Component

import React from "react";
import { useTranslation } from "react-i18next";
import { IndicatorType, OscillatorType, IndicatorParams } from "../utils/chartConfigGenerator";
import { ChipDistributionResult } from "../utils/chipDistribution";

interface AnalysisResultsPanelProps {
  overlayIndicator: IndicatorType;
  oscillatorType: OscillatorType;
  showSignals: boolean;
  indicatorParams: IndicatorParams;
  chipData: ChipDistributionResult | null;
  onIndicatorParamsChange: (params: IndicatorParams) => void;
}

const AnalysisResultsPanel: React.FC<AnalysisResultsPanelProps> = ({
  overlayIndicator,
  oscillatorType,
  showSignals,
  indicatorParams,
  chipData,
  onIndicatorParamsChange,
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
          {oscillatorType !== "none" && (
            <>
              {/* Dynamic Parameter Controls */}
              <div className="param-section">
                <label className="param-section-label">{t("analysis.indicatorParams")}</label>
                <div className="param-inputs">
                  {oscillatorType === "rsi" && (
                    <div className="param-row">
                      <label>RSI {t("analysis.period")}</label>
                      <input
                        type="number"
                        value={indicatorParams.rsiPeriod}
                        onChange={(e) => onIndicatorParamsChange({ ...indicatorParams, rsiPeriod: parseInt(e.target.value) || 14 })}
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
                          onChange={(e) => onIndicatorParamsChange({ ...indicatorParams, macdFast: parseInt(e.target.value) || 12 })}
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
                          onChange={(e) => onIndicatorParamsChange({ ...indicatorParams, macdSlow: parseInt(e.target.value) || 26 })}
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
                          onChange={(e) => onIndicatorParamsChange({ ...indicatorParams, macdSignal: parseInt(e.target.value) || 9 })}
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
                        onChange={(e) => onIndicatorParamsChange({ ...indicatorParams, kdjPeriod: parseInt(e.target.value) || 9 })}
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
                        onChange={(e) => onIndicatorParamsChange({ ...indicatorParams, momentumPeriod: parseInt(e.target.value) || 10 })}
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
                        onChange={(e) => onIndicatorParamsChange({ ...indicatorParams, cciPeriod: parseInt(e.target.value) || 20 })}
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
                        onChange={(e) => onIndicatorParamsChange({ ...indicatorParams, adxPeriod: parseInt(e.target.value) || 14 })}
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
                          onChange={(e) => onIndicatorParamsChange({ ...indicatorParams, stochRsiRsiPeriod: parseInt(e.target.value) || 14 })}
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
                          onChange={(e) => onIndicatorParamsChange({ ...indicatorParams, stochRsiStochPeriod: parseInt(e.target.value) || 14 })}
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
                        onChange={(e) => onIndicatorParamsChange({ ...indicatorParams, bbPercentPeriod: parseInt(e.target.value) || 20 })}
                        min="2"
                        max="50"
                        className="param-input"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Indicator Description */}
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
          {chipData && (
            <div className="summary-card result-card">
              <div className="result-header">
                <span className="result-title">{t("analysis.chipDistribution")}</span>
                <span 
                  className="result-signal" 
                  style={{ 
                    backgroundColor: chipData.profitRatio > 70 ? "#2ecc71" : 
                                   chipData.profitRatio < 30 ? "#e74c3c" : "#f39c12" 
                  }}
                >
                  {chipData.profitRatio > 70 ? t("analysis.bullish") : 
                   chipData.profitRatio < 30 ? t("analysis.bearish") : t("analysis.neutral")}
                </span>
              </div>
              <div className="result-desc">
                {t("analysis.chipDistributionDesc")
                  .replace("{avgCost}", chipData.avgCost.toFixed(2))
                  .replace("{profitRatio}", chipData.profitRatio.toFixed(1))
                  .replace("{concentration}", chipData.concentration.toFixed(1))
                  .replace("{peakCount}", chipData.peakCount.toString())
                  .replace("{position}", t(`analysis.chipPosition${chipData.position.charAt(0).toUpperCase() + chipData.position.slice(1)}`))}
              </div>
              <div className="result-desc" style={{ marginTop: "4px", fontSize: "10px", color: "#858585" }}>
                {chipData.isSinglePeak ? t("analysis.chipSinglePeak") : t("analysis.chipMultiPeak")}
                {chipData.mainPeaks.length > 0 && (
                  <span> - {t("analysis.chipMainPeaks")}: {chipData.mainPeaks.map((p: { price: number; amount: number }) => p.price.toFixed(2)).join(", ")}</span>
                )}
              </div>
              {chipData.position === "low" && chipData.isSinglePeak && chipData.concentration < 15 && (
                <div className="result-extra" style={{ color: "#2ecc71", fontWeight: "bold" }}>
                  {t("analysis.chipLowSinglePeak")}
                </div>
              )}
              {chipData.position === "low" && chipData.isMultiPeak && chipData.concentration < 20 && (
                <div className="result-extra" style={{ color: "#2ecc71" }}>
                  {t("analysis.chipLowMultiPeak")}
                </div>
              )}
              {chipData.position === "high" && chipData.isSinglePeak && chipData.concentration < 18 && (
                <div className="result-extra" style={{ color: "#f39c12" }}>
                  {t("analysis.chipHighSinglePeak")}
                </div>
              )}
              {chipData.position === "high" && chipData.concentration > 20 && (
                <div className="result-extra" style={{ color: "#e74c3c", fontWeight: "bold" }}>
                  {t("analysis.chipHighScattered")}
                </div>
              )}
              {chipData.concentration < 10 && (
                <div className="result-extra" style={{ color: "#2ecc71" }}>
                  {t("analysis.chipHighlyConcentrated")}
                </div>
              )}
              {chipData.concentration >= 20 && chipData.concentration < 30 && (
                <div className="result-extra">{t("analysis.chipModerateConcentration")}</div>
              )}
              {chipData.concentration >= 30 && (
                <div className="result-extra" style={{ color: "#e74c3c" }}>
                  {t("analysis.chipScattered")}
                </div>
              )}
              <div className="confidence-bar">
                <span className="confidence-text">
                  {t("analysis.confidence")}: {Math.abs(chipData.profitRatio - 50) * 2}%
                </span>
                <div className="confidence-track">
                  <div 
                    className="confidence-fill" 
                    style={{ 
                      width: `${Math.abs(chipData.profitRatio - 50) * 2}%`, 
                      backgroundColor: chipData.profitRatio > 70 ? "#2ecc71" : 
                                     chipData.profitRatio < 30 ? "#e74c3c" : "#f39c12"
                    }} 
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalysisResultsPanel;
