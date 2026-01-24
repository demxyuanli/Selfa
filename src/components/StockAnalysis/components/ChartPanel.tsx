import React, { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";

interface ChartPanelProps {
  chartOption: any;
  onZoom: () => void;
}

const ChartPanel: React.FC<ChartPanelProps> = ({ chartOption, onZoom }) => {
  const { t } = useTranslation();
  const chartRef = useRef<ReactECharts>(null);

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
    <div className="analysis-column chart-column">
      <div className="column-header">
        <span>{t("analysis.chart")}</span>
        <button
          className="chart-zoom-button"
          onClick={onZoom}
          title={t("chart.zoom")}
        >
          {t("chart.zoomAbbr")}
        </button>
      </div>
      <div className="chart-content">
        {Object.keys(chartOption).length > 0 ? (
          <ReactECharts ref={chartRef} option={chartOption} style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
        ) : (
          <div className="no-data">{t("analysis.noData")}</div>
        )}
      </div>
    </div>
  );
};

export default ChartPanel;
