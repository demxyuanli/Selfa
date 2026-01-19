import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import ChartDialog from "./ChartDialog";
import { getTechnicalIndicatorParams } from "../utils/settings";
import IndicatorParamsPanel from "./KLineTechnicalAnalysis/IndicatorParamsPanel";
import ResultsPanel from "./KLineTechnicalAnalysis/ResultsPanel";
import { generateChartOption } from "./KLineTechnicalAnalysis/chartOptions/generateChartOption";
import { StockData, IndicatorType, OscillatorType, IndicatorParams, GannConfig } from "./KLineTechnicalAnalysis/types";
import "./StockAnalysis.css";
import "./KLineTechnicalAnalysis.css";

interface KLineTechnicalAnalysisProps {
  klineData: StockData[];
}

const KLineTechnicalAnalysis: React.FC<KLineTechnicalAnalysisProps> = ({ klineData }) => {
  const { t } = useTranslation();
  const [overlayIndicator, setOverlayIndicator] = useState<IndicatorType>("sma");
  const [oscillatorType, setOscillatorType] = useState<OscillatorType>("rsi");

  const indicatorDefaults = getTechnicalIndicatorParams();

  const [indicatorParams, setIndicatorParams] = useState<IndicatorParams>({
    rsiPeriod: indicatorDefaults.rsiPeriod,
    macdFast: indicatorDefaults.macdFast,
    macdSlow: indicatorDefaults.macdSlow,
    macdSignal: indicatorDefaults.macdSignal,
    kdjPeriod: indicatorDefaults.kdjPeriod,
    momentumPeriod: indicatorDefaults.momentumPeriod,
    cciPeriod: indicatorDefaults.cciPeriod,
    adxPeriod: indicatorDefaults.adxPeriod,
    stochRsiRsiPeriod: indicatorDefaults.stochRsiRsiPeriod,
    stochRsiStochPeriod: indicatorDefaults.stochRsiStochPeriod,
    stochRsiKPeriod: indicatorDefaults.stochRsiKPeriod,
    stochRsiDPeriod: indicatorDefaults.stochRsiDPeriod,
    bbPercentPeriod: indicatorDefaults.bbPercentPeriod,
  });

  const [showGann, setShowGann] = useState(false);
  const [gannConfig, setGannConfig] = useState<GannConfig>({
    referenceMode: "current",
    customReferencePrice: 0,
    angles: [45, 90, 135, 180, 225, 270, 315, 360],
    cycles: 1,
    showSupport: true,
    showResistance: true,
    showMajorAngles: true,
  });

  const [showSignals, setShowSignals] = useState(true);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  const [selectedDateIndex, setSelectedDateIndex] = useState<number | null>(null);
  const chartRef = useRef<ReactECharts>(null);

  const chartOption = useMemo(() => {
    return generateChartOption({
      klineData,
      overlayIndicator,
      oscillatorType,
      showSignals,
      showGann,
      indicatorParams,
      gannConfig,
      t,
    });
  }, [klineData, overlayIndicator, oscillatorType, showSignals, showGann, indicatorParams, gannConfig, t]);

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

  const handleChartEvents = {
    click: (params: any) => {
      if (params.componentType === "series" || params.componentType === "xAxis") {
        const dataIndex = params.dataIndex;
        if (dataIndex !== null && dataIndex !== undefined && dataIndex >= 0 && dataIndex < klineData.length) {
          setSelectedDateIndex(dataIndex);
        }
      }
    },
    mousemove: (params: any) => {
      if (params.componentType === "series" || params.componentType === "xAxis") {
        const dataIndex = params.dataIndex;
        if (dataIndex !== null && dataIndex !== undefined && dataIndex >= 0 && dataIndex < klineData.length) {
          setSelectedDateIndex(dataIndex);
        }
      }
    },
  };

  return (
    <div className="kline-technical-analysis">
      <div className="analysis-columns">
        <IndicatorParamsPanel
          overlayIndicator={overlayIndicator}
          oscillatorType={oscillatorType}
          showSignals={showSignals}
          showGann={showGann}
          onOverlayIndicatorChange={setOverlayIndicator}
          onOscillatorTypeChange={setOscillatorType}
          onShowSignalsChange={setShowSignals}
          onShowGannChange={setShowGann}
        />

        <div className="column-divider" />

        <ResultsPanel
          overlayIndicator={overlayIndicator}
          oscillatorType={oscillatorType}
          showSignals={showSignals}
          showGann={showGann}
          indicatorParams={indicatorParams}
          gannConfig={gannConfig}
          onIndicatorParamsChange={setIndicatorParams}
          onGannConfigChange={setGannConfig}
        />

        <div className="column-divider" />

        <div className="analysis-column chart-column">
          <div className="column-header">
            <span>{t("analysis.chart")}</span>
          </div>
          {selectedDateIndex !== null && selectedDateIndex >= 0 && selectedDateIndex < klineData.length && (
            <div style={{ padding: "4px 12px", fontSize: "11px", color: "#858585", borderBottom: "1px solid #3e3e42" }}>
              <strong style={{ color: "#007acc" }}>{t("analysis.selectedDate")}:</strong> {klineData[selectedDateIndex].date} | O: {klineData[selectedDateIndex].open.toFixed(2)} | H: {klineData[selectedDateIndex].high.toFixed(2)} | L: {klineData[selectedDateIndex].low.toFixed(2)} | C: {klineData[selectedDateIndex].close.toFixed(2)} | V: {(klineData[selectedDateIndex].volume / 10000).toFixed(2)}{t("common.tenThousand")}
            </div>
          )}
          <div className="chart-content" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: "1 1 60%", minHeight: 0, position: "relative" }}>
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
                  <ReactECharts ref={chartRef} option={chartOption} style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} onEvents={handleChartEvents} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <ChartDialog isOpen={isChartDialogOpen} onClose={() => setIsChartDialogOpen(false)} title={`${t("analysis.klineAnalysis")} - ${t("chart.title")}`} chartOption={chartOption} />
    </div>
  );
};

export default KLineTechnicalAnalysis;
