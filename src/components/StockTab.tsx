import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTradingHoursTimeseriesRefresh } from "../hooks/useTradingHoursTimeseriesRefresh";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import TimeSeriesChart from "./TimeSeriesChart";
import KLineChart from "./KLineChart";
import TimeSeriesTable from "./TimeSeriesTable";
import HistoryTable from "./HistoryTable";
import StockAnalysis from "./StockAnalysis";
import KLineTechnicalAnalysis from "./KLineTechnicalAnalysis";
import KLineChipAnalysis from "./KLineChipAnalysis";
import PredictionAnalysis from "./PredictionAnalysis";
import CompareAnalysis from "./CompareAnalysis";
import AIAgentAnalysis from "./AIAgentAnalysis";
import CustomIndicatorAnalysis from "./CustomIndicatorAnalysis";
import BacktestAnalysis from "./BacktestAnalysis";
import LSTMPredictionAnalysis from "./LSTMPredictionAnalysis";
import IntradayPredictionAnalysis from "./IntradayPredictionAnalysis";
import SimilarityPrediction from "./SimilarityPrediction";
import StockComments from "./StockComments";
import Icon from "./Icon";
import "./StockTab.css";

interface StockTab {
  id: string;
  symbol: string;
  name: string;
  quote: any;
}

interface StockTabProps {
  tab: StockTab;
}

type KLinePeriod = "1d" | "1w" | "1mo" | "1y";
type AnalysisTab = "timeseries" | "kline" | "klinechip" | "prediction" | "compare" | "aiagent" | "customIndicator" | "backtest" | "lstm" | "comments" | "similarity" | "intradayPrediction";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const StockTab: React.FC<StockTabProps> = ({ tab }) => {
  const { t } = useTranslation();
  const [timeSeriesData, setTimeSeriesData] = useState<StockData[]>([]);
  const [klineData, setKlineData] = useState<StockData[]>([]);
  const [klinePeriod, setKlinePeriod] = useState<KLinePeriod>("1d");
  const [loading, setLoading] = useState(false);
  const [timeSeriesLoading, setTimeSeriesLoading] = useState(false);
  const [chartRendering, setChartRendering] = useState(false);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<AnalysisTab>("timeseries");
  const [upperHeight, setUpperHeight] = useState(40);
  const [isVResizing, setIsVResizing] = useState(false);
  
  // Table panel widths
  const [tsTableWidth, setTsTableWidth] = useState(160);
  const [klTableWidth, setKlTableWidth] = useState(200);
  const [resizingPanel, setResizingPanel] = useState<"ts" | "kl" | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const chartRenderingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTimeSeriesData = useCallback(async () => {
    if (!tab.symbol) return;
    setTimeSeriesLoading(true);
    try {
      const tsData = await invoke("get_time_series", { symbol: tab.symbol });
      setTimeSeriesData(tsData as StockData[]);
    } catch (err) {
      console.error("Error fetching time series data:", err);
    } finally {
      setTimeSeriesLoading(false);
    }
  }, [tab.symbol]);

  useEffect(() => {
    if (tab.symbol) fetchTimeSeriesData();
  }, [tab.symbol, fetchTimeSeriesData]);

  useTradingHoursTimeseriesRefresh(fetchTimeSeriesData, {
    enabled: !!tab.symbol,
    intervalInMs: 15000,
  });

  useEffect(() => {
    const fetchKLineData = async () => {
      setLoading(true);
      setChartRendering(true);
      try {
        const klData = await invoke("get_stock_history", {
          symbol: tab.symbol,
          period: klinePeriod,
        });
        setKlineData(klData as StockData[]);
        // Delay hiding rendering indicator to allow chart to render
        if (chartRenderingTimeoutRef.current) {
          clearTimeout(chartRenderingTimeoutRef.current);
        }
        chartRenderingTimeoutRef.current = setTimeout(() => {
          setChartRendering(false);
        }, 300);
      } catch (err) {
        console.error("Error fetching K-line data:", err);
        setChartRendering(false);
      } finally {
        setLoading(false);
      }
    };

    if (tab.symbol) {
      fetchKLineData();
    }

    return () => {
      if (chartRenderingTimeoutRef.current) {
        clearTimeout(chartRenderingTimeoutRef.current);
      }
    };
  }, [tab.symbol, klinePeriod]);

  // Vertical resize handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isVResizing) return;
      
      const container = document.querySelector(".stock-tab") as HTMLElement;
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      const newHeight = ((e.clientY - containerRect.top) / containerRect.height) * 100;
      
      if (newHeight >= 30 && newHeight <= 75) {
        setUpperHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsVResizing(false);
    };

    if (isVResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isVResizing]);

  // Panel resize handlers
  const handlePanelResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingPanel) return;
    const diff = startXRef.current - e.clientX;
    const newWidth = Math.max(100, Math.min(400, startWidthRef.current + diff));
    
    if (resizingPanel === "ts") {
      setTsTableWidth(newWidth);
    } else {
      setKlTableWidth(newWidth);
    }
  }, [resizingPanel]);

  const handlePanelResizeUp = useCallback(() => {
    setResizingPanel(null);
  }, []);

  useEffect(() => {
    if (resizingPanel) {
      document.addEventListener("mousemove", handlePanelResizeMove);
      document.addEventListener("mouseup", handlePanelResizeUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handlePanelResizeMove);
      document.removeEventListener("mouseup", handlePanelResizeUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingPanel, handlePanelResizeMove, handlePanelResizeUp]);

  const handleVResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsVResizing(true);
  };

  const handlePanelResizerMouseDown = (e: React.MouseEvent, panel: "ts" | "kl") => {
    e.preventDefault();
    setResizingPanel(panel);
    startXRef.current = e.clientX;
    startWidthRef.current = panel === "ts" ? tsTableWidth : klTableWidth;
  };

  // Handle analysis tab change with rendering indicator
  const handleAnalysisTabChange = (tab: AnalysisTab) => {
    setActiveAnalysisTab(tab);
    // Show rendering indicator when switching to a tab that needs chart rendering
    const needsChart = tab === "kline" || tab === "klinechip" || tab === "prediction" || tab === "compare" || tab === "aiagent";
    if (needsChart && klineData.length > 0) {
      setChartRendering(true);
      if (chartRenderingTimeoutRef.current) {
        clearTimeout(chartRenderingTimeoutRef.current);
      }
      chartRenderingTimeoutRef.current = setTimeout(() => {
        setChartRendering(false);
      }, 300);
    }
  };

  // Check if current tab needs data and if it's available
  const isDataReady = () => {
    switch (activeAnalysisTab) {
      case "timeseries":
        return timeSeriesData.length > 0;
      case "intradayPrediction":
        return timeSeriesData.length > 0;
      case "kline":
      case "klinechip":
      case "prediction":
      case "compare":
      case "aiagent":
        return klineData.length > 0;
      default:
        return true;
    }
  };

  const isTabLoading = () => {
    switch (activeAnalysisTab) {
      case "timeseries":
        return timeSeriesLoading;
      case "intradayPrediction":
        return timeSeriesLoading;
      case "kline":
      case "klinechip":
      case "prediction":
      case "compare":
      case "aiagent":
      case "customIndicator":
      case "backtest":
      case "lstm":
        return loading;
      default:
        return false;
    }
  };

  const renderAnalysisContent = () => {
    const isLoading = isTabLoading() || chartRendering;
    const dataReady = isDataReady();

    if (isLoading || !dataReady) {
      return (
        <div className="chart-loading-overlay">
          <div className="loading-spinner">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
          </div>
          <div className="loading-text">{t("analysis.loadingChart")}</div>
        </div>
      );
    }

    switch (activeAnalysisTab) {
      case "timeseries":
        return (
          <StockAnalysis
            timeSeriesData={timeSeriesData}
            klineData={klineData}
            analysisType="timeseries"
          />
        );
      case "intradayPrediction":
        return (
          <IntradayPredictionAnalysis klineData={timeSeriesData} />
        );
      case "kline":
        return (
          <KLineTechnicalAnalysis klineData={klineData} />
        );
      case "klinechip":
        return (
          <KLineChipAnalysis klineData={klineData} symbol={tab.symbol} />
        );
      case "prediction":
        return (
          <PredictionAnalysis klineData={klineData} />
        );
      case "compare":
        return (
          <CompareAnalysis currentSymbol={tab.symbol} currentData={klineData} currentName={tab.name} />
        );
      case "aiagent":
        return (
          <AIAgentAnalysis klineData={klineData} symbol={tab.symbol} quote={tab.quote} />
        );
      case "customIndicator":
        return (
          <CustomIndicatorAnalysis klineData={klineData} />
        );
      case "backtest":
        return (
          <BacktestAnalysis klineData={klineData} />
        );
      case "lstm":
        return (
          <LSTMPredictionAnalysis klineData={klineData} />
        );
      case "similarity":
        return (
          <SimilarityPrediction symbol={tab.symbol} currentData={klineData} />
        );
      case "comments":
        return (
          <StockComments symbol={tab.symbol} quote={tab.quote} />
        );
      default:
        return null;
    }
  };

  return (
    <div className="stock-tab">
      {/* Upper Section: Time Series + K-Line side by side */}
      <div className="tab-upper-section" style={{ height: `${upperHeight}%` }}>
        {/* Left Group: Time Series Chart | Today's Data Table */}
        <div className="data-group timeseries-group">
          <div className="group-header">
            <span className="group-title">{t("index.timeSeries")}</span>
          </div>
          <div className="group-content">
            <div className="chart-panel">
              <TimeSeriesChart data={timeSeriesData} quote={tab.quote} />
            </div>
            <div
              className={`panel-resizer ${resizingPanel === "ts" ? "active" : ""}`}
              onMouseDown={(e) => handlePanelResizerMouseDown(e, "ts")}
            />
            <div className="table-panel" style={{ width: tsTableWidth }}>
              <TimeSeriesTable data={timeSeriesData} quote={tab.quote} />
            </div>
          </div>
        </div>

        {/* Main Divider */}
        <div className="main-divider" />

        {/* Right Group: K-Line Chart | History Data Table */}
        <div className="data-group kline-group">
          <div className="group-header">
            <span className="group-title">{t("index.dailyK")}</span>
            <div className="kline-period-btns">
              <button
                className={`mini-period-btn ${klinePeriod === "1d" ? "active" : ""}`}
                onClick={() => setKlinePeriod("1d")}
              >
                {t("kline.1d")}
              </button>
              <button
                className={`mini-period-btn ${klinePeriod === "1w" ? "active" : ""}`}
                onClick={() => setKlinePeriod("1w")}
              >
                {t("kline.1w")}
              </button>
              <button
                className={`mini-period-btn ${klinePeriod === "1mo" ? "active" : ""}`}
                onClick={() => setKlinePeriod("1mo")}
              >
                {t("kline.1mo")}
              </button>
              <button
                className={`mini-period-btn ${klinePeriod === "1y" ? "active" : ""}`}
                onClick={() => setKlinePeriod("1y")}
              >
                {t("kline.1y")}
              </button>
            </div>
          </div>
          <div className="group-content">
            <div className="chart-panel">
              <KLineChart data={klineData} />
            </div>
            <div
              className={`panel-resizer ${resizingPanel === "kl" ? "active" : ""}`}
              onMouseDown={(e) => handlePanelResizerMouseDown(e, "kl")}
            />
            <div className="table-panel" style={{ width: klTableWidth }}>
              <HistoryTable data={klineData} />
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal Resizer */}
      <div
        className={`h-resizer ${isVResizing ? "active" : ""}`}
        onMouseDown={handleVResizerMouseDown}
      />

      {/* Lower Section: Analysis & Prediction */}
      <div className="tab-lower-section" style={{ height: `${100 - upperHeight}%` }}>
        <div className="analysis-content">
          {renderAnalysisContent()}
        </div>
        {/* Bottom Tabs */}
        <div className="analysis-tabs-bar">
          <button
            className={`analysis-tab ${activeAnalysisTab === "timeseries" ? "active" : ""}`}
            onClick={() => handleAnalysisTabChange("timeseries")}
          >
            <Icon name="timeSeries" size={14} />
            <span className="tab-label">{t("analysis.timeSeries")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "intradayPrediction" ? "active" : ""}`}
            onClick={() => handleAnalysisTabChange("intradayPrediction")}
          >
            <Icon name="prediction" size={14} />
            <span className="tab-label">{t("analysis.intradayPrediction")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "kline" ? "active" : ""}`}
            onClick={() => handleAnalysisTabChange("kline")}
          >
            <Icon name="kline" size={14} />
            <span className="tab-label">{t("analysis.klineAnalysis")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "klinechip" ? "active" : ""}`}
            onClick={() => handleAnalysisTabChange("klinechip")}
          >
            <Icon name="chartBar" size={14} />
            <span className="tab-label">{t("analysis.klineChipAnalysis")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "prediction" ? "active" : ""}`}
            onClick={() => handleAnalysisTabChange("prediction")}
          >
            <Icon name="prediction" size={14} />
            <span className="tab-label">{t("analysis.prediction")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "compare" ? "active" : ""}`}
            onClick={() => handleAnalysisTabChange("compare")}
          >
            <Icon name="chart" size={14} />
            <span className="tab-label">{t("analysis.compare")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "aiagent" ? "active" : ""}`}
            onClick={() => handleAnalysisTabChange("aiagent")}
          >
            <Icon name="sparkles" size={14} />
            <span className="tab-label">{t("analysis.aiAgent")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "customIndicator" ? "active" : ""}`}
            onClick={() => handleAnalysisTabChange("customIndicator")}
          >
            <Icon name="chart" size={14} />
            <span className="tab-label">{t("analysis.customIndicator")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "backtest" ? "active" : ""}`}
            onClick={() => handleAnalysisTabChange("backtest")}
          >
            <Icon name="play" size={14} />
            <span className="tab-label">{t("analysis.backtest")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "lstm" ? "active" : ""}`}
            onClick={() => handleAnalysisTabChange("lstm")}
          >
            <Icon name="prediction" size={14} />
            <span className="tab-label">{t("analysis.lstm")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "similarity" ? "active" : ""}`}
            onClick={() => handleAnalysisTabChange("similarity")}
          >
            <Icon name="history" size={14} />
            <span className="tab-label">{t("analysis.similarity")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "comments" ? "active" : ""}`}
            onClick={() => handleAnalysisTabChange("comments")}
          >
            <Icon name="comment" size={14} />
            <span className="tab-label">{t("analysis.comments")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockTab;
