// Analysis Results Panel Component

import React from "react";
import { useTranslation } from "react-i18next";
import { IndicatorType, OscillatorType, IndicatorParams } from "../utils/chartConfigGenerator";
import { ChipDistributionResult, ChipMetricsDetail } from "../utils/chipDistribution";

interface AnalysisResultsPanelProps {
  overlayIndicator: IndicatorType;
  oscillatorType: OscillatorType;
  showSignals: boolean;
  indicatorParams: IndicatorParams;
  chipData: ChipDistributionResult | null;
  selectedDayChipMetrics?: ChipMetricsDetail | null;
  onIndicatorParamsChange: (params: IndicatorParams) => void;
}

const MORPHOLOGY_KEYS: Record<string, string> = {
  low_single_dense: "chipMorphologyLowSingleDense",
  bottom_converging: "chipMorphologyBottomConverging",
  high_single_dense: "chipMorphologyHighSingleDense",
  multi_peak: "chipMorphologyMultiPeak",
  scattered: "chipMorphologyScattered",
};

const AnalysisResultsPanel: React.FC<AnalysisResultsPanelProps> = ({
  overlayIndicator,
  oscillatorType,
  showSignals,
  indicatorParams,
  chipData,
  selectedDayChipMetrics = null,
  onIndicatorParamsChange,
}) => {
  const { t } = useTranslation();
  const m = selectedDayChipMetrics ?? chipData;

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "strong_buy": return "#00ff00"; // Bright Green
      case "buy": return "#2ecc71"; // Green
      case "strong_sell": return "#ff0000"; // Bright Red
      case "sell": return "#e74c3c"; // Red
      default: return "#f39c12"; // Yellow/Orange
    }
  };

  return (
    <div className="analysis-column results-column">
      <div className="column-header">{t("analysis.results")}</div>
      <div className="results-content">
        {m?.prediction && (
          <div className="result-card prediction-card" style={{ background: "rgba(33, 33, 33, 0.5)", border: "1px solid #444" }}>
            <div className="result-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{t("chip.prediction")}</span>
              <span style={{ 
                color: getSignalColor(m.prediction.signal),
                fontWeight: "bold",
                fontSize: "14px",
                border: `1px solid ${getSignalColor(m.prediction.signal)}`,
                padding: "2px 6px",
                borderRadius: "4px"
              }}>
                {t(`signal.${m.prediction.signal}`)}
              </span>
            </div>
            
            <div className="prediction-score-container" style={{ margin: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                <span>{t("chip.predictionScore")}: {m.prediction.score}</span>
                <span>{t("chip.confidence")}: {m.prediction.confidence}%</span>
              </div>
              <div className="score-bar-bg" style={{ height: "6px", background: "#333", borderRadius: "3px", overflow: "hidden" }}>
                <div 
                  className="score-bar-fill" 
                  style={{ 
                    height: "100%", 
                    width: `${Math.abs(m.prediction.score)}%`,
                    background: m.prediction.score > 0 ? "#2ecc71" : "#e74c3c",
                    marginLeft: m.prediction.score > 0 ? "50%" : `${50 + m.prediction.score}%`,
                    transition: "all 0.3s ease"
                  }} 
                />
              </div>
            </div>

            {m.prediction.reasoning.length > 0 && (
              <div className="prediction-reasons" style={{ fontSize: "11px", color: "#ccc", marginTop: "8px" }}>
                <div style={{ fontWeight: "bold", marginBottom: "4px", color: "#888" }}>{t("chip.reasoning")}:</div>
                <ul style={{ paddingLeft: "16px", margin: 0 }}>
                  {m.prediction.reasoning.map((r, i) => (
                    <li key={i} style={{ marginBottom: "2px" }}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="prediction-targets" style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginTop: "10px", borderTop: "1px solid #333", paddingTop: "8px" }}>
              {m.prediction.targetPrice && (
                <span style={{ color: "#2ecc71" }}>
                  {t("chip.targetPrice")}: {m.prediction.targetPrice.toFixed(2)}
                </span>
              )}
              {m.prediction.stopLossPrice && (
                <span style={{ color: "#e74c3c" }}>
                  {t("chip.stopLossPrice")}: {m.prediction.stopLossPrice.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        )}

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
                      <label>{t("settings.rsiPeriod")}</label>
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
                        <label>{t("settings.macdFast")}</label>
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
                        <label>{t("settings.macdSlow")}</label>
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
                        <label>{t("settings.macdSignal")}</label>
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
                      <label>{t("settings.kdjPeriod")}</label>
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
                      <label>{t("settings.momentumPeriod")}</label>
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
                      <label>{t("settings.cciPeriod")}</label>
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
                      <label>{t("settings.adxPeriod")}</label>
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
                        <label>{t("settings.rsiPeriod")}</label>
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
                        <label>{t("settings.stochPeriod")}</label>
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
                      <label>{t("settings.bbPeriod")}</label>
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
          {chipData && m && (
            <div className="summary-card result-card">
              <div className="result-header">
                <span className="result-title">{t("analysis.chipDistribution")}</span>
                <span 
                  className="result-signal" 
                  style={{ 
                    backgroundColor: m.profitRatio > 70 ? "#2ecc71" : 
                                   m.profitRatio < 30 ? "#e74c3c" : "#f39c12" 
                  }}
                >
                  {m.profitRatio > 70 ? t("analysis.bullish") : 
                   m.profitRatio < 30 ? t("analysis.bearish") : t("analysis.neutral")}
                </span>
              </div>
              <div className="result-desc">
                {t("analysis.chipDistributionDesc")
                  .replace("{avgCost}", m.avgCost.toFixed(2))
                  .replace("{profitRatio}", m.profitRatio.toFixed(1))
                  .replace("{concentration}", String(("concentration" in m && (m as ChipDistributionResult).concentration != null ? (m as ChipDistributionResult).concentration : m.concentration90).toFixed(1)))
                  .replace("{peakCount}", String(m.peakCount))
                  .replace("{position}", t(`analysis.chipPosition${m.position.charAt(0).toUpperCase() + m.position.slice(1)}`))}
              </div>
              <div className="result-desc" style={{ marginTop: "4px", fontSize: "10px", color: "#858585" }}>
                {m.peakCount === 1 ? t("analysis.chipSinglePeak") : t("analysis.chipMultiPeak")}
                {m.mainPeaks.length > 0 && (
                  <span> - {t("analysis.chipMainPeaks")}: {m.mainPeaks.map((p: { price: number; amount: number }) => p.price.toFixed(2)).join(", ")}</span>
                )}
              </div>

              <div className="chip-metrics-detail" style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #333", fontSize: "11px" }}>
                <div style={{ fontWeight: "bold", marginBottom: "6px" }}>{t("analysis.chipMorphology")} | {t("analysis.chipRange90")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px" }}>
                  <span>{t("analysis.profitChip")}: {m.profitRatio.toFixed(1)}%</span>
                  <span>{t("analysis.chipTrappedRatio")}: {m.trappedRatio.toFixed(1)}%</span>
                  <span>{t("analysis.chipConcentration90")}: {m.concentration90.toFixed(1)}%</span>
                  <span>{t("analysis.chipConcentration70")}: {m.concentration70.toFixed(1)}%</span>
                  <span>{t("analysis.chipRange90")}: [{m.range90Low.toFixed(2)}, {m.range90High.toFixed(2)}]</span>
                  <span>{t("analysis.chipDeviation")}: {m.chipDeviation.toFixed(2)}%</span>
                  {m.avgCostProfit != null && <span>{t("analysis.chipAvgCostProfit")}: {m.avgCostProfit.toFixed(2)}</span>}
                  {m.avgCostTrapped != null && <span>{t("analysis.chipAvgCostTrapped")}: {m.avgCostTrapped.toFixed(2)}</span>}
                  {m.supportLevel != null && <span>{t("analysis.chipSupport")}: {m.supportLevel.toFixed(2)}</span>}
                  {m.resistanceLevel != null && <span>{t("analysis.chipResistance")}: {m.resistanceLevel.toFixed(2)}</span>}
                </div>
                <div style={{ marginTop: "4px" }}>
                  {t("analysis.chipMorphology")}: {t("analysis." + (MORPHOLOGY_KEYS[m.morphology] || m.morphology))}
                </div>
                {m.chipInterpretation && (
                  <div style={{ marginTop: "4px", color: "#f39c12" }}>
                    {t("analysis.chipTacticsLabel")}: {t("analysis." + m.chipInterpretation)}
                  </div>
                )}
              </div>

              {m.position === "low" && m.peakCount === 1 && m.concentration90 < 15 && (
                <div className="result-extra" style={{ color: "#2ecc71", fontWeight: "bold" }}>
                  {t("analysis.chipLowSinglePeak")}
                </div>
              )}
              {m.position === "low" && m.peakCount >= 2 && m.concentration90 < 20 && (
                <div className="result-extra" style={{ color: "#2ecc71" }}>
                  {t("analysis.chipLowMultiPeak")}
                </div>
              )}
              {m.position === "high" && m.peakCount === 1 && m.concentration90 < 18 && (
                <div className="result-extra" style={{ color: "#f39c12" }}>
                  {t("analysis.chipHighSinglePeak")}
                </div>
              )}
              {m.position === "high" && m.concentration90 > 20 && (
                <div className="result-extra" style={{ color: "#e74c3c", fontWeight: "bold" }}>
                  {t("analysis.chipHighScattered")}
                </div>
              )}
              {m.concentration90 < 12 && (
                <div className="result-extra" style={{ color: "#2ecc71" }}>
                  {t("analysis.chipHighlyConcentrated")}
                </div>
              )}
              {m.concentration90 >= 15 && m.concentration90 < 25 && (
                <div className="result-extra">{t("analysis.chipModerateConcentration")}</div>
              )}
              {m.concentration90 > 25 && (
                <div className="result-extra" style={{ color: "#e74c3c" }}>
                  {t("analysis.chipScattered")}
                </div>
              )}
              <div className="confidence-bar">
                <span className="confidence-text">
                  {t("analysis.confidence")}: {Math.abs(m.profitRatio - 50) * 2}%
                </span>
                <div className="confidence-track">
                  <div 
                    className="confidence-fill" 
                    style={{ 
                      width: `${Math.abs(m.profitRatio - 50) * 2}%`, 
                      backgroundColor: m.profitRatio > 70 ? "#2ecc71" : 
                                     m.profitRatio < 30 ? "#e74c3c" : "#f39c12"
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
