import React, { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import Icon from "./Icon";
import { ChipMetricsDetail } from "../utils/chipDistribution";
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
}

const ChartDialog: React.FC<ChartDialogProps> = ({ isOpen, onClose, title, chartOption, onEvents, chipMetrics }) => {
  const { t } = useTranslation();
  const chartRef = useRef<ReactECharts>(null);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        try {
          const instance = chartRef.current.getEchartsInstance();
          if (instance) instance.dispose();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  if (!isOpen) return null;

  const hasChip = !!chipMetrics;

  return (
    <div className="chart-dialog-overlay" onClick={onClose}>
      <div className="chart-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="chart-dialog-header">
          <h2>{title}</h2>
          <button className="chart-dialog-close" onClick={onClose} title={t("chart.close")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className={`chart-dialog-content ${hasChip ? "chart-dialog-content-with-chip" : ""}`}>
          <div className="chart-dialog-chart">
            {Object.keys(chartOption).length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <ReactECharts
                ref={chartRef}
                option={chartOption}
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
      </div>
    </div>
  );
};

export default ChartDialog;
