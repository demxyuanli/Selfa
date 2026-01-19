import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import "./FavoritesHeatmap.css";

// Import and use all chart types
import { use } from "echarts/core";
import { 
  TreemapChart, 
  ScatterChart, 
  BarChart, 
  LineChart, 
  RadarChart,
  BoxplotChart,
  PieChart,
  HeatmapChart
} from "echarts/charts";
import { TooltipComponent, VisualMapComponent, LegendComponent, GridComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

use([
  TreemapChart, 
  ScatterChart, 
  BarChart, 
  LineChart, 
  RadarChart,
  BoxplotChart,
  PieChart,
  HeatmapChart,
  TooltipComponent, 
  VisualMapComponent, 
  LegendComponent,
  GridComponent,
  CanvasRenderer
]);

import { StockInfo, StockQuote, HeatmapType, ChartViewType } from "./FavoritesHeatmap/types";
import { getChartOption } from "./FavoritesHeatmap/chartOptions";
import { getSummary } from "./FavoritesHeatmap/utils/summary";

const FavoritesHeatmap: React.FC = () => {
  const { t } = useTranslation();
  const [stocks, setStocks] = useState<Array<{ stock: StockInfo; quote: StockQuote | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heatmapType, setHeatmapType] = useState<HeatmapType>("changePercent");
  const [chartViewType, setChartViewType] = useState<ChartViewType>("treemap");
  const chartRef = useRef<ReactECharts>(null);

  useEffect(() => {
    loadFavoritesQuotes();
    
    // Cleanup function to dispose chart instance when component unmounts
    return () => {
      if (chartRef.current) {
        try {
          const chartInstance = chartRef.current.getEchartsInstance();
          if (chartInstance) {
            chartInstance.dispose();
          }
        } catch (error) {
          // Ignore errors during cleanup
          console.debug("Error disposing chart:", error);
        }
      }
    };
  }, []);

  const loadFavoritesQuotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data: Array<[StockInfo, StockQuote | null]> = await invoke("get_all_favorites_quotes");
      setStocks(
        data.map(([stock, quote]) => ({
          stock,
          quote,
        }))
      );
    } catch (err) {
      console.error("Error loading favorites quotes:", err);
      setError(err instanceof Error ? err.message : "Failed to load favorites quotes");
    } finally {
      setLoading(false);
    }
  };

  const getChartOptionValue = () => {
    if (stocks.length === 0) {
      return {};
    }

    const stocksWithQuotes = stocks.filter((s): s is { stock: StockInfo; quote: StockQuote } => s.quote !== null);
    if (stocksWithQuotes.length === 0) {
      return {};
    }

    return getChartOption(stocksWithQuotes, chartViewType, heatmapType, t);
  };

  const summary = getSummary(stocks);
  const chartOption = getChartOptionValue();

  if (loading) {
    return (
      <div className="favorites-heatmap">
        <div className="heatmap-loading">{t("app.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="favorites-heatmap">
        <div className="heatmap-error">{error}</div>
        <button onClick={loadFavoritesQuotes} className="refresh-button">
          {t("common.refresh")}
        </button>
      </div>
    );
  }

  return (
    <div className="favorites-heatmap">
      <div className="heatmap-header">
        <h2>{t("favorites.heatmap")}</h2>
        <button onClick={loadFavoritesQuotes} className="refresh-button" title={t("common.refresh")}>
          {t("common.refresh")}
        </button>
      </div>

      <div className="heatmap-summary">
        <div className="summary-item">
          <span className="summary-label">{t("favorites.total")}:</span>
          <span className="summary-value">{summary.total}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">{t("favorites.withQuote")}:</span>
          <span className="summary-value">{summary.withQuote}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">{t("favorites.upCount")}:</span>
          <span className="summary-value up">{summary.upCount}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">{t("favorites.downCount")}:</span>
          <span className="summary-value down">{summary.downCount}</span>
        </div>
        {summary.withQuote > 0 && (
          <div className="summary-item summary-bar-item">
            <span className="summary-label">{t("heatmap.changeComparison")}:</span>
            <div className="summary-bar-container">
              <div className="summary-bar">
                <div 
                  className="summary-bar-up" 
                  style={{ 
                    width: `${(summary.upCount / summary.withQuote) * 100}%` 
                  }}
                  title={t("heatmap.upCountLabel", { count: summary.upCount })}
                />
                <div 
                  className="summary-bar-down" 
                  style={{ 
                    width: `${(summary.downCount / summary.withQuote) * 100}%` 
                  }}
                  title={t("heatmap.downCountLabel", { count: summary.downCount })}
                />
                {summary.flatCount > 0 && (
                  <div 
                    className="summary-bar-flat" 
                    style={{ 
                      width: `${(summary.flatCount / summary.withQuote) * 100}%` 
                    }}
                    title={t("heatmap.flatCountLabel", { count: summary.flatCount })}
                  />
                )}
              </div>
              <div className="summary-bar-label">
                <span className="bar-label-item up-label">{t("heatmap.upLabel")} {summary.upCount}</span>
                <span className="bar-label-item down-label">{t("heatmap.downLabel")} {summary.downCount}</span>
                {summary.flatCount > 0 && (
                  <span className="bar-label-item flat-label">{t("heatmap.flatLabel")} {summary.flatCount}</span>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="summary-item">
          <span className="summary-label">{t("favorites.flatCount")}:</span>
          <span className="summary-value">{summary.flatCount}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">{t("favorites.avgChange")}:</span>
          <span className={`summary-value ${summary.avgChange >= 0 ? "up" : "down"}`}>
            {summary.avgChange.toFixed(2)}%
          </span>
        </div>
        {summary.maxGain.symbol && (
          <div className="summary-item">
            <span className="summary-label">{t("favorites.maxGain")}:</span>
            <span className="summary-value up">
              {summary.maxGain.symbol} {summary.maxGain.change.toFixed(2)}%
            </span>
          </div>
        )}
        {summary.maxLoss.symbol && (
          <div className="summary-item">
            <span className="summary-label">{t("favorites.maxLoss")}:</span>
            <span className="summary-value down">
              {summary.maxLoss.symbol} {summary.maxLoss.change.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      <div className="heatmap-content-wrapper">
        <div className="heatmap-type-selector">
          <div className="type-selector-header">{t("heatmap.chartType")}</div>
          <div className="type-selector-group">
            <div className="selector-group-label">{t("heatmap.viewType")}:</div>
            <button
              className={`type-btn ${chartViewType === "treemap" ? "active" : ""}`}
              onClick={() => setChartViewType("treemap")}
              title={t("heatmap.treemap")}
            >
              {t("heatmap.treemap")}
            </button>
            <button
              className={`type-btn ${chartViewType === "scatter" ? "active" : ""}`}
              onClick={() => setChartViewType("scatter")}
              title={t("heatmap.scatter")}
            >
              {t("heatmap.scatter")}
            </button>
            <button
              className={`type-btn ${chartViewType === "bar" ? "active" : ""}`}
              onClick={() => setChartViewType("bar")}
              title={t("heatmap.bar")}
            >
              {t("heatmap.bar")}
            </button>
            <button
              className={`type-btn ${chartViewType === "radar" ? "active" : ""}`}
              onClick={() => setChartViewType("radar")}
              title={t("heatmap.radar")}
            >
              {t("heatmap.radar")}
            </button>
            <button
              className={`type-btn ${chartViewType === "boxplot" ? "active" : ""}`}
              onClick={() => setChartViewType("boxplot")}
              title={t("heatmap.boxplot")}
            >
              {t("heatmap.boxplot")}
            </button>
            <button
              className={`type-btn ${chartViewType === "matrix" ? "active" : ""}`}
              onClick={() => setChartViewType("matrix")}
              title={t("heatmap.matrix")}
            >
              {t("heatmap.matrix")}
            </button>
            <button
              className={`type-btn ${chartViewType === "pie" ? "active" : ""}`}
              onClick={() => setChartViewType("pie")}
              title={t("heatmap.pie")}
            >
              {t("heatmap.pie")}
            </button>
            <button
              className={`type-btn ${chartViewType === "bubble" ? "active" : ""}`}
              onClick={() => setChartViewType("bubble")}
              title={t("heatmap.bubble")}
            >
              {t("heatmap.bubble")}
            </button>
            <button
              className={`type-btn ${chartViewType === "line" ? "active" : ""}`}
              onClick={() => setChartViewType("line")}
              title={t("heatmap.line")}
            >
              {t("heatmap.line")}
            </button>
          </div>
          {(chartViewType === "treemap" || chartViewType === "bar") && (
            <>
              <div className="selector-group-label">{t("heatmap.dataType")}:</div>
              <button
                className={`type-btn ${heatmapType === "marketCap" ? "active" : ""}`}
                onClick={() => setHeatmapType("marketCap")}
                title={t("heatmap.marketCapRank")}
              >
                {t("heatmap.marketCapRank")}
              </button>
              <button
                className={`type-btn ${heatmapType === "changePercent" ? "active" : ""}`}
                onClick={() => setHeatmapType("changePercent")}
                title={t("stock.changePercent")}
              >
                {t("stock.changePercent")}
              </button>
              <button
                className={`type-btn ${heatmapType === "peRatio" ? "active" : ""}`}
                onClick={() => setHeatmapType("peRatio")}
                title={t("heatmap.peRatioRank")}
              >
                {t("heatmap.peRatioRank")}
              </button>
              <button
                className={`type-btn ${heatmapType === "turnover" ? "active" : ""}`}
                onClick={() => setHeatmapType("turnover")}
                title={t("heatmap.turnoverRank")}
              >
                {t("heatmap.turnoverRank")}
              </button>
            </>
          )}
        </div>

        <div className="heatmap-chart-container">
          {chartViewType === "treemap" && (
            <div className="heatmap-legend">
              <div className="legend-item">
                <span className="legend-label">{t("heatmap.sizeLabel")}:</span>
                <span className="legend-value">
                  {heatmapType === "marketCap" ? t("heatmap.byMarketCapSize") :
                   heatmapType === "changePercent" ? t("heatmap.byChangePercentSize") :
                   heatmapType === "peRatio" ? t("heatmap.byPeRatioSize") :
                   t("heatmap.byTurnoverSize")}
                </span>
              </div>
              <div className="legend-item">
                <span className="legend-label">{t("heatmap.colorLabel")}:</span>
                <span className="legend-value">
                  {heatmapType === "marketCap" ? t("heatmap.marketCapRankColor") :
                   heatmapType === "changePercent" ? t("heatmap.changePercentColor") :
                   heatmapType === "peRatio" ? t("heatmap.peRatioRankColor") :
                   t("heatmap.turnoverRankColor")}
                </span>
              </div>
            </div>
          )}

          <div className="heatmap-chart">
        {Object.keys(chartOption).length > 0 ? (
          <ReactECharts
            ref={chartRef}
            option={chartOption}
            style={{ height: "100%", width: "100%" }}
            opts={{ renderer: "canvas" }}
            notMerge={true}
            lazyUpdate={true}
            onChartReady={(chart) => {
              // Chart is ready, ensure proper initialization
              if (chart) {
                chart.resize();
              }
            }}
          />
        ) : (
          <div className="no-data">{t("analysis.noData")}</div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FavoritesHeatmap;
