import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import ReactECharts from "echarts-for-react";
import ChartDialog from "./ChartDialog";
import IndicatorParamsPanel from "./IndicatorParamsPanel";
import AnalysisResultsPanel from "./AnalysisResultsPanel";
import { StockData } from "../utils/technicalIndicators";
import { calculateChipDistribution } from "../utils/chipDistribution";
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
        // Fetch 1 year of daily data for more accurate chip distribution
        const historyData = await invoke("get_stock_history", {
          symbol: symbol,
          period: "1y",
        });
        setChipHistoryData(historyData as StockData[]);
      } catch (err) {
        console.error("Error fetching chip history data:", err);
        // Fallback to current klineData if history fetch fails
        setChipHistoryData(klineData);
      }
    };

    fetchChipHistoryData();
  }, [symbol, klineData]);

  // Use longer history data for chip distribution if available, otherwise use klineData
  const chipCalculationData = useMemo(() => {
    return chipHistoryData.length > klineData.length ? chipHistoryData : klineData;
  }, [chipHistoryData, klineData]);

  // Calculate chip distribution using the best available data
  const chipData = useMemo(() => {
    if (chipCalculationData.length < 20) return null;
    return calculateChipDistribution(chipCalculationData);
  }, [chipCalculationData]);

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

  // Handle mouse move on chart to update chip distribution
  const handleChartEvents = {
    mousemove: (params: any) => {
      // Handle mouse move on any component (series, xAxis, etc.)
      if (params.dataIndex !== null && params.dataIndex !== undefined && params.dataIndex >= 0 && params.dataIndex < klineData.length) {
        setSelectedDateIndex(params.dataIndex);
      }
    },
    // Listen to tooltip update events for better responsiveness
    updateAxisPointer: (params: any) => {
      if (params && params.currTrigger !== "none") {
        const dataIndex = params.dataIndex;
        if (dataIndex !== null && dataIndex !== undefined && dataIndex >= 0 && dataIndex < klineData.length) {
          setSelectedDateIndex(dataIndex);
        }
      }
    },
    // Also listen to global chart mouse move for better responsiveness
    globalout: () => {
      // Keep the last selected date when mouse leaves chart area
      // Optionally reset to last date: setSelectedDateIndex(klineData.length - 1);
    },
  };

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
        <IndicatorParamsPanel
          overlayIndicator={overlayIndicator}
          oscillatorType={oscillatorType}
          showSignals={showSignals}
          onOverlayIndicatorChange={setOverlayIndicator}
          onOscillatorTypeChange={setOscillatorType}
          onShowSignalsChange={setShowSignals}
        />

        <div className="column-divider" />

        {/* Middle Column: Results */}
        <AnalysisResultsPanel
          overlayIndicator={overlayIndicator}
          oscillatorType={oscillatorType}
          showSignals={showSignals}
          indicatorParams={indicatorParams}
          chipData={chipData}
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
      />
    </div>
  );
};

export default KLineChipAnalysis;
