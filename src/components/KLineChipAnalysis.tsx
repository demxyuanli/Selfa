import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import ReactECharts from "echarts-for-react";
import ChartDialog from "./ChartDialog";
import IndicatorParamsPanel from "./IndicatorParamsPanel";
import ChipParamsPanel, { ChipParams } from "./ChipParamsPanel";
import AnalysisResultsPanel from "./AnalysisResultsPanel";
import { StockData } from "../utils/technicalIndicators";
import { calculateChipDistribution, computeChipMetrics, ChipPrediction } from "../utils/chipDistribution";
import { generateChartConfig, IndicatorType, OscillatorType, IndicatorParams } from "../utils/chartConfigGenerator";
import "./StockAnalysis.css";
import "./KLineTechnicalAnalysis.css";

interface KLineChipAnalysisProps {
  klineData: StockData[];
  symbol?: string;
}

const KLineChipAnalysis: React.FC<KLineChipAnalysisProps> = ({ klineData, symbol }) => {
  const { t } = useTranslation();
  const [overlayIndicator, setOverlayIndicator] = useState<IndicatorType>("sma");
  const [oscillatorType, setOscillatorType] = useState<OscillatorType>("rsi");
  const [selectedDateIndex, setSelectedDateIndex] = useState<number | null>(null);
  const [isFixed, setIsFixed] = useState(false);
  const [fixedDateIndex, setFixedDateIndex] = useState<number | null>(null);
  const [chipHistoryData, setChipHistoryData] = useState<StockData[]>([]);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const chartRef = useRef<ReactECharts>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Chip Parameters
  const [chipParams, setChipParams] = useState<ChipParams>({
    lookbackPeriod: "1y",
    decayFactor: 0.97,
    priceBins: 100,
    decayMethod: "fixed",
    distributionType: "triangular",
  });

  // Dynamic parameters for indicators
  const [indicatorParams, setIndicatorParams] = useState<IndicatorParams>({
    rsiPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    kdjPeriod: 9,
    momentumPeriod: 10,
    cciPeriod: 20,
    adxPeriod: 14,
    stochRsiRsiPeriod: 14,
    stochRsiStochPeriod: 14,
    stochRsiKPeriod: 3,
    stochRsiDPeriod: 3,
    bbPercentPeriod: 20,
  });
  const [showSignals, setShowSignals] = useState(true);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  
  // Prediction parameters
  const [predictionEnabled, setPredictionEnabled] = useState(false);
  const [predictionMethod, setPredictionMethod] = useState("ensemble");
  const [predictionPeriod, setPredictionPeriod] = useState(10);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [pricePrediction, setPricePrediction] = useState<ChipPrediction | null>(null);

  // Fetch longer history data for chip distribution calculation
  useEffect(() => {
    const fetchChipHistoryData = async () => {
      if (!symbol) return;
      
      try {
        // Fetch history data based on selected lookback period
        const historyData = await invoke("get_stock_history", {
          symbol: symbol,
          period: chipParams.lookbackPeriod,
        });
        setChipHistoryData(historyData as StockData[]);
      } catch (err) {
        console.error("Error fetching chip history data:", err);
        // Fallback to current klineData if history fetch fails
        setChipHistoryData(klineData);
      }
    };

    fetchChipHistoryData();
  }, [symbol, klineData, chipParams.lookbackPeriod]);

  // Use longer history data for chip distribution if available, otherwise use klineData
  const chipCalculationData = useMemo(() => {
    return chipHistoryData.length > klineData.length ? chipHistoryData : klineData;
  }, [chipHistoryData, klineData]);

  // Calculate chip distribution using the best available data and custom params
  const chipData = useMemo(() => {
    if (chipCalculationData.length < 20) return null;
    return calculateChipDistribution(
      chipCalculationData, 
      chipParams.priceBins, 
      chipParams.decayFactor,
      t
    );
  }, [chipCalculationData, chipParams.priceBins, chipParams.decayFactor, t]);

  // Compute chip metrics for the selected day (or last day) to match the chip chart
  const selectedDayChipMetrics = useMemo(() => {
    if (!chipData?.dailyDistributions?.length) return null;
    const dists = chipData.dailyDistributions;
    const datePart = (s: string) => ((s || "").split(" ")[0] || s).trim();
    let displayDateIndex = dists.length - 1;
    // Use fixed index if available, otherwise use selectedDateIndex
    const activeIndex = isFixed && fixedDateIndex != null ? fixedDateIndex : selectedDateIndex;
    if (activeIndex != null && activeIndex >= 0 && activeIndex < klineData.length) {
      const key = datePart(klineData[activeIndex].date || "");
      const i = dists.findIndex((d) => datePart(d.date || "") === key);
      if (i >= 0) {
        displayDateIndex = i;
      } else if (chipCalculationData.length === klineData.length && activeIndex < dists.length) {
        displayDateIndex = activeIndex;
      } else if (chipCalculationData.length > klineData.length) {
        const start = chipCalculationData.findIndex((d) => datePart(d.date || "") === datePart(klineData[0].date || ""));
        if (start >= 0 && start + activeIndex < dists.length) {
          displayDateIndex = start + activeIndex;
        }
      }
    }
    const dayDist = dists[displayDateIndex];
    const dayPrice =
      (chipCalculationData && displayDateIndex < chipCalculationData.length
        ? chipCalculationData[displayDateIndex].close
        : undefined) ??
      (activeIndex != null && activeIndex < klineData.length ? klineData[activeIndex].close : undefined) ??
      chipData.currentPrice;
    const metrics = computeChipMetrics(
      chipData.priceLevels,
      dayDist.chipAmounts,
      dayPrice,
      chipData.minPrice,
      chipData.maxPrice,
      t
    );
    // Merge price prediction if available
    if (pricePrediction) {
      return { ...metrics, prediction: pricePrediction };
    }
    return metrics;
  }, [chipData, chipCalculationData, klineData, selectedDateIndex, isFixed, fixedDateIndex, pricePrediction]);

  // Generate price prediction using prediction API
  useEffect(() => {
    const generatePricePrediction = async () => {
      if (!predictionEnabled || chipCalculationData.length < 20) {
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

  // Generate chart configuration
  const chartOption = useMemo(() => {
    return generateChartConfig({
      klineData,
      overlayIndicator,
      oscillatorType,
      showSignals,
      chipData,
      indicatorParams,
      selectedDateIndex: isFixed && fixedDateIndex != null ? fixedDateIndex : selectedDateIndex,
      chipCalculationData,
      t,
    });
  }, [klineData, overlayIndicator, oscillatorType, showSignals, chipData, indicatorParams, selectedDateIndex, isFixed, fixedDateIndex, chipCalculationData, t]);

  const chipSeriesNames = useMemo(() => [
    t("analysis.chipDistribution"),
    t("analysis.avgCost"),
    t("stock.price"),
    t("analysis.chipSupport"),
    t("analysis.chipResistance"),
  ], [t]);

  // Handle fix/unfix position
  const handleFixPosition = useCallback(() => {
    if (selectedDateIndex != null && selectedDateIndex >= 0 && selectedDateIndex < klineData.length) {
      setIsFixed(true);
      setFixedDateIndex(selectedDateIndex);
    }
  }, [selectedDateIndex, klineData.length]);

  const handleUnfixPosition = useCallback(() => {
    setIsFixed(false);
    setFixedDateIndex(null);
    setSelectedDateIndex(null);
  }, []);

  const handleToggleFix = useCallback(() => {
    if (isFixed) {
      setIsFixed(false);
      setFixedDateIndex(null);
      setSelectedDateIndex(null);
    } else {
      if (selectedDateIndex != null && selectedDateIndex >= 0 && selectedDateIndex < klineData.length) {
        setIsFixed(true);
        setFixedDateIndex(selectedDateIndex);
      }
    }
  }, [isFixed, selectedDateIndex, klineData.length]);

  // Keyboard shortcut: Space to toggle fix
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        handleToggleFix();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleToggleFix]);

  // Handle context menu
  const handleChartEvents = useMemo(() => ({
    contextmenu: (params: any, event: MouseEvent) => {
      event.preventDefault();
      
      // Only show context menu if not over a chip-related series
      if (params.componentType === 'series' && params.seriesName && chipSeriesNames.includes(params.seriesName)) {
        return;
      }
      
      setContextMenuPosition({ x: event.clientX, y: event.clientY });
      setContextMenuVisible(true);
    },
    mousemove: (params: any) => {
      // If fixed, don't update on mouse move
      if (isFixed) return;
      
      // Only process mousemove if it's over a series and not a chip-related series
      if (params.componentType === 'series' && params.seriesName && chipSeriesNames.includes(params.seriesName)) return;
      if (params.dataIndex != null && params.dataIndex >= 0 && params.dataIndex < klineData.length) {
        setSelectedDateIndex(params.dataIndex);
      }
    },
    updateAxisPointer: (params: any) => {
      // If fixed, don't update on axis pointer update
      if (isFixed) return;
      
      // Only process updateAxisPointer if it's over a series and not a chip-related series
      if (params && params.currTrigger !== "none" && params.componentType === 'series' && params.seriesName && chipSeriesNames.includes(params.seriesName)) return;
      if (params && params.currTrigger !== "none") {
        let dataIndex = params.dataIndex;
        // Attempt to find dataIndex from axesInfo if not directly available
        if (dataIndex == null && params.axesInfo) {
          const arr = Array.isArray(params.axesInfo) ? params.axesInfo : Object.values(params.axesInfo as object || {});
          const xInfo = arr.find((a: any) => a && a.axisDim === "x" && (a.axisIndex === 0 || a.axisIndex === 1 || a.axisIndex === 2) && a.dataIndex != null);
          if (xInfo) dataIndex = xInfo.dataIndex;
        }
        
        // Set selectedDateIndex only if a valid dataIndex is found
        if (dataIndex != null && dataIndex >= 0 && dataIndex < klineData.length) {
          setSelectedDateIndex(dataIndex);
        } else if (dataIndex == null) {
          // If no valid dataIndex, clear selected state
          setSelectedDateIndex(null);
        }
      }
    },
    globalout: () => {
      // Only clear selected state when mouse leaves if not fixed
      if (!isFixed) {
        setSelectedDateIndex(null);
      }
    },
  }), [chipSeriesNames, klineData.length, isFixed, fixedDateIndex]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuVisible && chartContainerRef.current && !chartContainerRef.current.contains(e.target as Node)) {
        setContextMenuVisible(false);
      }
    };

    if (contextMenuVisible) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [contextMenuVisible]);

  // Handle window resize to resize chart
  useEffect(() => {
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

  return (
    <div className="kline-technical-analysis">
      <div className="analysis-columns">
        {/* Left Column: Parameters */}
        <div className="analysis-column params-column">
          <IndicatorParamsPanel
            overlayIndicator={overlayIndicator}
            oscillatorType={oscillatorType}
            showSignals={showSignals}
            onOverlayIndicatorChange={setOverlayIndicator}
            onOscillatorTypeChange={setOscillatorType}
            onShowSignalsChange={setShowSignals}
          />
          <ChipParamsPanel
            params={chipParams}
            onChange={setChipParams}
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

        <div className="column-divider" />

        {/* Middle Column: Results */}
        <AnalysisResultsPanel
          overlayIndicator={overlayIndicator}
          oscillatorType={oscillatorType}
          showSignals={showSignals}
          indicatorParams={indicatorParams}
          chipData={chipData}
          selectedDayChipMetrics={selectedDayChipMetrics}
          onIndicatorParamsChange={setIndicatorParams}
        />

        <div className="column-divider" />

        {/* Right Column: Chart */}
        <div className="analysis-column chart-column">
          <div className="column-header">
            <span>{t("analysis.chart")}</span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                className={`chart-lock-button ${isFixed ? "active" : ""}`}
                onClick={handleToggleFix}
                title={`${isFixed ? t("chart.unlockPosition") : t("chart.lockPosition")} (Space)`}
                style={{
                  padding: "4px 8px",
                  fontSize: "12px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  background: isFixed ? "#e3f2fd" : "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span style={{ fontSize: "14px" }}>{isFixed ? "🔒" : "🔓"}</span>
                <span>{isFixed ? t("chart.locked") : t("chart.unlocked")}</span>
              </button>
              <button
                className="chart-zoom-button"
                onClick={() => setIsChartDialogOpen(true)}
                title={t("chart.zoom")}
              >
                {t("chart.zoomAbbr")}
              </button>
            </div>
          </div>
          <div className="chart-content" ref={chartContainerRef} style={{ position: "relative" }}>
            {Object.keys(chartOption).length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <>
                <ReactECharts
                  ref={chartRef}
                  option={chartOption}
                  style={{ height: "100%", width: "100%" }}
                  opts={{ renderer: "canvas" }}
                  onEvents={handleChartEvents}
                />
                {contextMenuVisible && (
                  <div
                    style={{
                      position: "fixed",
                      left: `${contextMenuPosition.x}px`,
                      top: `${contextMenuPosition.y}px`,
                      background: "white",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                      zIndex: 1000,
                      minWidth: "150px",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isFixed ? (
                      <div
                        style={{
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontSize: "13px",
                        }}
                        onClick={() => {
                          handleUnfixPosition();
                          setContextMenuVisible(false);
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                      >
                        {t("chart.unlockPosition")}
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: "8px 12px",
                          cursor: selectedDateIndex != null ? "pointer" : "not-allowed",
                          fontSize: "13px",
                          opacity: selectedDateIndex != null ? 1 : 0.5,
                        }}
                        onClick={() => {
                          if (selectedDateIndex != null) {
                            handleFixPosition();
                            setContextMenuVisible(false);
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (selectedDateIndex != null) {
                            e.currentTarget.style.background = "#f5f5f5";
                          }
                        }}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                      >
                        {t("chart.lockPosition")}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <ChartDialog
        isOpen={isChartDialogOpen}
        onClose={() => setIsChartDialogOpen(false)}
        title={`${t("analysis.klineChipAnalysis")} - ${t("chart.title")}`}
        chartOption={chartOption}
        onEvents={handleChartEvents}
        chipMetrics={selectedDayChipMetrics}
        showFullFeatures={true}
        overlayIndicator={overlayIndicator}
        oscillatorType={oscillatorType}
        showSignals={showSignals}
        indicatorParams={indicatorParams}
        chipParams={chipParams}
        chipData={chipData}
        selectedDayChipMetrics={selectedDayChipMetrics}
        chipCalculationData={chipCalculationData}
        symbol={symbol}
        onOverlayIndicatorChange={setOverlayIndicator}
        onOscillatorTypeChange={setOscillatorType}
        onShowSignalsChange={setShowSignals}
        onChipParamsChange={setChipParams}
        onIndicatorParamsChange={setIndicatorParams}
        isFixed={isFixed}
        onToggleFix={handleToggleFix}
      />
    </div>
  );
};

export default KLineChipAnalysis;
