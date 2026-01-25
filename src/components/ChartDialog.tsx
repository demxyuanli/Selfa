import React, { useRef, useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import ReactECharts from "echarts-for-react";
import Icon from "./Icon";
import { ChipMetricsDetail, ChipDistributionResult, ChipPrediction } from "../utils/chipDistribution";
import { IndicatorType, OscillatorType, IndicatorParams } from "../utils/chartConfigGenerator";
import IndicatorParamsPanel from "./IndicatorParamsPanel";
import ChipParamsPanel, { ChipParams } from "./ChipParamsPanel";
import AnalysisResultsPanel from "./AnalysisResultsPanel";
import { StockData } from "../utils/technicalIndicators";
import "./ChartDialog.css";

const MORPHOLOGY_KEYS: Record<string, string> = {
  low_single_dense: "chipMorphologyLowSingleDense",
  bottom_converging: "chipMorphologyBottomConverging",
  high_single_dense: "chipMorphologyHighSingleDense",
  multi_peak: "chipMorphologyMultiPeak",
  scattered: "chipMorphologyScattered",
};

interface ChartDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  chartOption: any;
  onEvents?: Record<string, (params: any) => void>;
  chipMetrics?: ChipMetricsDetail | null;
  // Additional props for full functionality
  overlayIndicator?: IndicatorType;
  oscillatorType?: OscillatorType;
  showSignals?: boolean;
  indicatorParams?: IndicatorParams;
  chipParams?: ChipParams;
  chipData?: ChipDistributionResult | null;
  selectedDayChipMetrics?: ChipMetricsDetail | null;
  chipCalculationData?: StockData[]; // Data used for chip calculation and prediction
  symbol?: string; // Stock symbol for prediction
  onOverlayIndicatorChange?: (value: IndicatorType) => void;
  onOscillatorTypeChange?: (value: OscillatorType) => void;
  onShowSignalsChange?: (value: boolean) => void;
  onChipParamsChange?: (params: ChipParams) => void;
  onIndicatorParamsChange?: (params: IndicatorParams) => void;
  showFullFeatures?: boolean; // Whether to show parameter panels and results panel
}

const ChartDialog: React.FC<ChartDialogProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  chartOption, 
  onEvents, 
  chipMetrics,
  overlayIndicator,
  oscillatorType,
  showSignals,
  indicatorParams,
  chipParams,
  chipData,
  selectedDayChipMetrics,
  chipCalculationData,
  symbol,
  onOverlayIndicatorChange,
  onOscillatorTypeChange,
  onShowSignalsChange,
  onChipParamsChange,
  onIndicatorParamsChange,
  showFullFeatures = false,
}) => {
  const { t } = useTranslation();
  const chartRef = useRef<ReactECharts>(null);
  
  // Prediction state
  const [predictionEnabled, setPredictionEnabled] = useState(false);
  const [predictionMethod, setPredictionMethod] = useState("ensemble");
  const [predictionPeriod, setPredictionPeriod] = useState(10);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [pricePrediction, setPricePrediction] = useState<ChipPrediction | null>(null);
  
  // Merge prediction into selectedDayChipMetrics
  const metricsWithPrediction = useMemo(() => {
    if (!selectedDayChipMetrics) return selectedDayChipMetrics;
    if (pricePrediction) {
      return { ...selectedDayChipMetrics, prediction: pricePrediction };
    }
    return selectedDayChipMetrics;
  }, [selectedDayChipMetrics, pricePrediction]);
  
  // Generate price prediction using prediction API
  useEffect(() => {
    const generatePricePrediction = async () => {
      if (!predictionEnabled || !chipCalculationData || chipCalculationData.length < 20) {
        setPricePrediction(null);
        return;
      }

      setPredictionLoading(true);
      try {
        const config = {
          method: predictionMethod,
          period: predictionPeriod,
          monte_carlo_simulations: predictionMethod === "monte_carlo" ? 2000 : undefined,
        };

        const predictions = await invoke("predict_stock_price_with_config", {
          data: chipCalculationData,
          config: config,
        }) as Array<{
          date: string;
          predicted_price: number;
          confidence: number;
          signal: string;
          upper_bound: number;
          lower_bound: number;
          method: string;
        }>;

        if (predictions.length > 0) {
          const lastPred = predictions[predictions.length - 1];
          const currentPrice = chipCalculationData[chipCalculationData.length - 1].close;
          const priceChange = ((lastPred.predicted_price - currentPrice) / currentPrice) * 100;
          
          // Convert prediction result to ChipPrediction format
          const chipPrediction: ChipPrediction = {
            score: Math.max(-100, Math.min(100, priceChange * 10)), // Scale to -100 to 100
            signal: lastPred.signal === "buy" ? "buy" : 
                   lastPred.signal === "sell" ? "sell" : "hold",
            confidence: lastPred.confidence,
            reasoning: [
              `${t("analysis.predictionMethod")}: ${lastPred.method}`,
              `${t("analysis.predictedPrice")}: ${lastPred.predicted_price.toFixed(2)}`,
              `${t("analysis.priceChange")}: ${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(2)}%`,
              `${t("analysis.confidence")}: ${lastPred.confidence.toFixed(2)}%`,
            ],
            targetPrice: lastPred.upper_bound,
            stopLossPrice: lastPred.lower_bound,
          };
          setPricePrediction(chipPrediction);
        } else {
          setPricePrediction(null);
        }
      } catch (err) {
        console.error("Error generating price prediction:", err);
        setPricePrediction(null);
      } finally {
        setPredictionLoading(false);
      }
    };

    generatePricePrediction();
  }, [predictionEnabled, predictionMethod, predictionPeriod, chipCalculationData, t]);

  // Enhance chartOption to ensure crosshair snap functionality
  // Use shallow copy to preserve function references (like renderItem in custom series)
  const enhancedChartOption = useMemo(() => {
    if (!chartOption || Object.keys(chartOption).length === 0) {
      return chartOption;
    }

    // Create a shallow copy to preserve function references
    const enhanced = { ...chartOption };

    // Ensure axisPointer has snap enabled
    enhanced.axisPointer = {
      ...chartOption.axisPointer,
      snap: true,
      type: chartOption.axisPointer?.type || "cross",
    };

    // Ensure tooltip axisPointer has snap enabled (preserve formatter and other functions)
    if (chartOption.tooltip) {
      enhanced.tooltip = {
        ...chartOption.tooltip,
        axisPointer: {
          ...chartOption.tooltip.axisPointer,
          snap: true,
          type: chartOption.tooltip.axisPointer?.type || "cross",
        },
      };
    }

    // Ensure all xAxis have snap enabled (shallow copy each axis, preserve all properties)
    if (chartOption.xAxis) {
      if (Array.isArray(chartOption.xAxis)) {
        enhanced.xAxis = chartOption.xAxis.map((axis: any) => ({
          ...axis,
          axisPointer: {
            ...axis.axisPointer,
            snap: true,
          },
        }));
      } else {
        enhanced.xAxis = {
          ...chartOption.xAxis,
          axisPointer: {
            ...chartOption.xAxis.axisPointer,
            snap: true,
          },
        };
      }
    }

    // Ensure all yAxis have snap enabled (shallow copy each axis, preserve all properties)
    if (chartOption.yAxis) {
      if (Array.isArray(chartOption.yAxis)) {
        enhanced.yAxis = chartOption.yAxis.map((axis: any) => ({
          ...axis,
          axisPointer: {
            ...axis.axisPointer,
            snap: true,
          },
        }));
      } else {
        enhanced.yAxis = {
          ...chartOption.yAxis,
          axisPointer: {
            ...chartOption.yAxis.axisPointer,
            snap: true,
          },
        };
      }
    }

    // Preserve series array with all function references intact (renderItem, etc.)
    // Don't modify series, just keep the reference
    if (chartOption.series) {
      enhanced.series = chartOption.series;
    }

    return enhanced;
  }, [chartOption]);

  useEffect(() => {
    // Ensure the chart resizes when the dialog opens or chartOption changes
    if (isOpen && chartRef.current) {
      const instance = chartRef.current.getEchartsInstance();
      if (instance && !instance.isDisposed()) {
        instance.resize();
      }
    }
    // Also resize on initial mount or when chartOption changes to ensure it's rendered correctly
    // However, chartOption changing rapidly can cause performance issues, so we need a debounced resize for general changes.
    // Here, we focus on initial open/mount. Regular resize is handled by window.resize listener.
  }, [isOpen, chartOption]); // Re-run when dialog opens or chartOption changes

  useEffect(() => {
    // Add global resize listener for responsiveness
    let resizeTimer: number | null = null;
    const handleResize = () => {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      resizeTimer = setTimeout(() => {
        if (chartRef.current) {
          try {
            const instance = chartRef.current.getEchartsInstance();
            if (instance && !instance.isDisposed()) {
              instance.resize();
            }
          } catch (error) {
            // Ignore errors during resize
          }
        }
      }, 100);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  if (!isOpen) return null;

  const hasChip = !!chipMetrics;
  const hasFullFeatures = showFullFeatures && 
    overlayIndicator !== undefined && 
    oscillatorType !== undefined && 
    showSignals !== undefined &&
    indicatorParams !== undefined &&
    chipParams !== undefined &&
    chipData !== null &&
    onOverlayIndicatorChange &&
    onOscillatorTypeChange &&
    onShowSignalsChange &&
    onChipParamsChange &&
    onIndicatorParamsChange;

  return (
    <div className="chart-dialog-overlay" onClick={onClose}>
      <div className={`chart-dialog ${hasFullFeatures ? "chart-dialog-full-features" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="chart-dialog-header">
          <h2>{title}</h2>
          <button className="chart-dialog-close" onClick={onClose} title={t("chart.close")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {hasFullFeatures ? (
          <div className="chart-dialog-content-full">
            <div className="chart-dialog-analysis-columns">
              {/* Left Column: Parameters */}
              <div className="chart-dialog-analysis-column chart-dialog-params-column">
                <IndicatorParamsPanel
                  overlayIndicator={overlayIndicator!}
                  oscillatorType={oscillatorType!}
                  showSignals={showSignals!}
                  onOverlayIndicatorChange={onOverlayIndicatorChange!}
                  onOscillatorTypeChange={onOscillatorTypeChange!}
                  onShowSignalsChange={onShowSignalsChange!}
                />
                <ChipParamsPanel
                  params={chipParams!}
                  onChange={onChipParamsChange!}
                />
                
                {/* Prediction Parameters Panel */}
                <div className="analysis-panel chip-params-panel" style={{ marginTop: "12px" }}>
                  <div className="panel-header">
                    <span>{t("analysis.prediction")}</span>
                  </div>
                  <div className="panel-content">
                    <div className="param-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={predictionEnabled}
                          onChange={(e) => setPredictionEnabled(e.target.checked)}
                        />
                        <span>{t("analysis.enablePrediction")}</span>
                      </label>
                    </div>
                    
                    {predictionEnabled && (
                      <>
                        <div className="param-group">
                          <label>{t("analysis.predictionMethod")}</label>
                          <select
                            value={predictionMethod}
                            onChange={(e) => setPredictionMethod(e.target.value)}
                            className="param-select"
                          >
                            <option value="ensemble">{t("analysis.methodEnsemble")}</option>
                            <option value="monte_carlo">{t("analysis.methodMonteCarlo")}</option>
                            <option value="technical">{t("analysis.methodTechnical")}</option>
                            <option value="arima">{t("analysis.methodARIMA")}</option>
                            <option value="linear">{t("analysis.methodLinear")}</option>
                            <option value="ma">{t("analysis.methodMA")}</option>
                          </select>
                        </div>
                        
                        <div className="param-group">
                          <div className="param-header">
                            <label>{t("analysis.predictionPeriod")}</label>
                            <span className="param-value">{predictionPeriod}</span>
                          </div>
                          <input
                            type="range"
                            min="3"
                            max="30"
                            step="1"
                            value={predictionPeriod}
                            onChange={(e) => setPredictionPeriod(parseInt(e.target.value))}
                            className="param-slider"
                          />
                        </div>
                        
                        {predictionLoading && (
                          <div style={{ fontSize: "11px", color: "#858585", marginTop: "8px" }}>
                            {t("app.loading")}...
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="chart-dialog-column-divider" />

              {/* Middle Column: Results */}
              <div className="chart-dialog-analysis-column chart-dialog-results-column">
                <AnalysisResultsPanel
                  overlayIndicator={overlayIndicator!}
                  oscillatorType={oscillatorType!}
                  showSignals={showSignals!}
                  indicatorParams={indicatorParams!}
                  chipData={chipData!}
                  selectedDayChipMetrics={metricsWithPrediction}
                  onIndicatorParamsChange={onIndicatorParamsChange!}
                />
              </div>

              <div className="chart-dialog-column-divider" />

              {/* Right Column: Chart */}
              <div className="chart-dialog-analysis-column chart-dialog-chart-column">
                <div className="chart-dialog-chart">
                  {Object.keys(enhancedChartOption).length === 0 ? (
                    <div className="no-data">{t("analysis.noData")}</div>
                  ) : (
                    <ReactECharts
                      ref={chartRef}
                      option={enhancedChartOption}
                      style={{ height: "100%", width: "100%" }}
                      opts={{ renderer: "canvas" }}
                      notMerge={true}
                      lazyUpdate={true}
                      onEvents={onEvents}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className={`chart-dialog-content ${hasChip ? "chart-dialog-content-with-chip" : ""}`}>
            <div className="chart-dialog-chart">
              {Object.keys(enhancedChartOption).length === 0 ? (
                <div className="no-data">{t("analysis.noData")}</div>
              ) : (
                <ReactECharts
                  ref={chartRef}
                  option={enhancedChartOption}
                  style={{ height: "100%", width: "100%" }}
                  opts={{ renderer: "canvas" }}
                  notMerge={true}
                  lazyUpdate={true}
                  onEvents={onEvents}
                />
              )}
            </div>
            {hasChip && (
              <div className="chart-dialog-chip-panel">
                <div className="chart-dialog-chip-title">{t("analysis.chipDistribution")}</div>
                <div className="chart-dialog-chip-grid">
                  <span>{t("analysis.profitChip")}: {chipMetrics.profitRatio.toFixed(1)}%</span>
                  <span>{t("analysis.chipTrappedRatio")}: {chipMetrics.trappedRatio.toFixed(1)}%</span>
                  <span>{t("analysis.chipConcentration90")}: {chipMetrics.concentration90.toFixed(1)}%</span>
                  <span>{t("analysis.chipConcentration70")}: {chipMetrics.concentration70.toFixed(1)}%</span>
                  <span>{t("analysis.chipRange90")}: [{chipMetrics.range90Low.toFixed(2)}, {chipMetrics.range90High.toFixed(2)}]</span>
                  <span>{t("analysis.chipDeviation")}: {chipMetrics.chipDeviation.toFixed(2)}%</span>
                  {chipMetrics.avgCostProfit != null && <span>{t("analysis.chipAvgCostProfit")}: {chipMetrics.avgCostProfit.toFixed(2)}</span>}
                  {chipMetrics.avgCostTrapped != null && <span>{t("analysis.chipAvgCostTrapped")}: {chipMetrics.avgCostTrapped.toFixed(2)}</span>}
                  {chipMetrics.supportLevel != null && <span>{t("analysis.chipSupport")}: {chipMetrics.supportLevel.toFixed(2)}</span>}
                  {chipMetrics.resistanceLevel != null && <span>{t("analysis.chipResistance")}: {chipMetrics.resistanceLevel.toFixed(2)}</span>}
                </div>
                <div className="chart-dialog-chip-row">
                  {t("analysis.chipMorphology")}: {t("analysis." + (MORPHOLOGY_KEYS[chipMetrics.morphology] || chipMetrics.morphology))}
                </div>
                {chipMetrics.chipInterpretation && (
                  <div className="chart-dialog-chip-tactics">
                    {t("analysis.chipTacticsLabel")}: {t("analysis." + chipMetrics.chipInterpretation)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChartDialog;
