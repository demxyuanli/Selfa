import React, { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import "./ChartDialog.css";

interface ChartDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  chartOption: any;
}

const ChartDialog: React.FC<ChartDialogProps> = ({ isOpen, onClose, title, chartOption }) => {
  const { t } = useTranslation();
  const chartRef = useRef<ReactECharts>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (chartRef.current) {
        try {
          const instance = chartRef.current.getEchartsInstance();
          if (instance) {
            instance.dispose();
          }
        } catch (error) {
          // Ignore errors during cleanup
        }
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="chart-dialog-overlay" onClick={onClose}>
      <div className="chart-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="chart-dialog-header">
          <h2>{title}</h2>
          <button className="chart-dialog-close" onClick={onClose} title={t("chart.close")}>
            ×
          </button>
        </div>
        <div className="chart-dialog-content">
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
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ChartDialog;
