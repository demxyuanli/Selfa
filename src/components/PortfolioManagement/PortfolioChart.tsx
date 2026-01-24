import React, { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import { PortfolioPosition } from "./types";
import { generatePortfolioChartOption } from "./chartOptions/portfolioChartOption";

interface PortfolioChartProps {
  positions: PortfolioPosition[];
  onZoom: () => void;
}

const PortfolioChart: React.FC<PortfolioChartProps> = ({ positions, onZoom }) => {
  const { t } = useTranslation();
  const chartRef = useRef<ReactECharts>(null);

  const chartOption = generatePortfolioChartOption({ positions, t });

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
    <div className="portfolio-chart">
      <div className="section-header">
        {t("portfolio.portfolioDistribution")}
        <button className="chart-zoom-button" onClick={onZoom} title={t("chart.zoom")}>
          {t("chart.zoomAbbr")}
        </button>
      </div>
      <div className="chart-content">
        {Object.keys(chartOption).length === 0 ? (
          <div className="no-data">{t("portfolio.noPositions")}</div>
        ) : (
          <ReactECharts ref={chartRef} option={chartOption} style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
        )}
      </div>
    </div>
  );
};

export default PortfolioChart;
