import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import ReactECharts from "echarts-for-react";
import ChartDialog from "./ChartDialog";
import IndicatorParamsPanel from "./IndicatorParamsPanel";
import ChipParamsPanel, { ChipParams } from "./ChipParamsPanel";
import AnalysisResultsPanel from "./AnalysisResultsPanel";
import { StockData } from "../utils/technicalIndicators";
import { calculateChipDistribution, computeChipMetrics } from "../utils/chipDistribution";
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
  const [chipHistoryData, setChipHistoryData] = useState<StockData[]>([]);
  const chartRef = useRef<ReactECharts>(null);

  // Chip Parameters
  const [chipParams, setChipParams] = useState<ChipParams>({
    lookbackPeriod: "1y",
    decayFactor: 0.97,
    priceBins: 100,
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
      chipParams.decayFactor
    );
  }, [chipCalculationData, chipParams.priceBins, chipParams.decayFactor]);

  // Compute chip metrics for the selected day (or last day) to match the chip chart
  const selectedDayChipMetrics = useMemo(() => {
    if (!chipData?.dailyDistributions?.length) return null;
    const dists = chipData.dailyDistributions;
    let displayDateIndex = dists.length - 1;
    if (selectedDateIndex != null && selectedDateIndex >= 0 && selectedDateIndex < klineData.length) {
      const key = (klineData[selectedDateIndex].date || "").split(" ")[0] || klineData[selectedDateIndex].date;
      const i = dists.findIndex((d) => ((d.date || "").split(" ")[0] || d.date) === key);
      if (i >= 0) displayDateIndex = i;
      else if (chipCalculationData.length === klineData.length && selectedDateIndex < dists.length) {
        displayDateIndex = selectedDateIndex;
      }
    }
    const dayDist = dists[displayDateIndex];
    const dayPrice =
      (chipCalculationData && displayDateIndex < chipCalculationData.length
        ? chipCalculationData[displayDateIndex].close
        : undefined) ??
      (selectedDateIndex != null && selectedDateIndex < klineData.length ? klineData[selectedDateIndex].close : undefined) ??
      chipData.currentPrice;
    return computeChipMetrics(
      chipData.priceLevels,
      dayDist.chipAmounts,
      dayPrice,
      chipData.minPrice,
      chipData.maxPrice
    );
  }, [chipData, chipCalculationData, klineData, selectedDateIndex]);

  // Generate chart configuration
  const chartOption = useMemo(() => {
    return generateChartConfig({
      klineData,
      overlayIndicator,
      oscillatorType,
      showSignals,
      chipData,
      indicatorParams,
      selectedDateIndex,
      chipCalculationData,
      t,
    });
  }, [klineData, overlayIndicator, oscillatorType, showSignals, chipData, indicatorParams, selectedDateIndex, chipCalculationData, t]);

  const chipSeriesNames = useMemo(() => [
    t("analysis.chipDistribution"),
    t("analysis.avgCost"),
    t("stock.price"),
    t("analysis.chipSupport"),
    t("analysis.chipResistance"),
  ], [t]);

  const handleChartEvents = useMemo(() => ({
    mousemove: (params: any) => {
      if (params.seriesName && chipSeriesNames.includes(params.seriesName)) return;
      if (params.dataIndex != null && params.dataIndex >= 0 && params.dataIndex < klineData.length) {
        setSelectedDateIndex(params.dataIndex);
      }
    },
    updateAxisPointer: (params: any) => {
      if (params && params.currTrigger !== "none" && params.seriesName && chipSeriesNames.includes(params.seriesName)) return;
      if (params && params.currTrigger !== "none") {
        let dataIndex = params.dataIndex;
        if (dataIndex == null && params.axesInfo) {
          const arr = Array.isArray(params.axesInfo) ? params.axesInfo : Object.values(params.axesInfo as object || {});
          const xInfo = arr.find((a: any) => a && a.axisDim === "x" && (a.axisIndex === 0 || a.axisIndex === 1 || a.axisIndex === 2) && a.dataIndex != null);
          if (xInfo) dataIndex = xInfo.dataIndex;
        }
        if (dataIndex != null && dataIndex >= 0 && dataIndex < klineData.length) {
          setSelectedDateIndex(dataIndex);
        }
      }
    },
    globalout: () => {},
  }), [chipSeriesNames, klineData.length]);

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
          </div>
          <div className="chart-content">
            {Object.keys(chartOption).length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <>
                <button
                  className="chart-zoom-button-overlay"
                  onClick={() => setIsChartDialogOpen(true)}
                  title={t("chart.zoom")}
                >
                  ZO
                </button>
                <ReactECharts
                  ref={chartRef}
                  option={chartOption}
                  style={{ height: "100%", width: "100%" }}
                  opts={{ renderer: "canvas" }}
                  onEvents={handleChartEvents}
                />
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
      />
    </div>
  );
};

export default KLineChipAnalysis;
