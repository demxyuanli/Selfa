import React, { useState, useEffect, useRef, useCallback } from "react";
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
type AnalysisTab = "timeseries" | "kline" | "klinechip" | "prediction" | "compare";

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
  const [, setLoading] = useState(false);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<AnalysisTab>("timeseries");
  const [upperHeight, setUpperHeight] = useState(40);
  const [isVResizing, setIsVResizing] = useState(false);
  
  // Table panel widths
  const [tsTableWidth, setTsTableWidth] = useState(160);
  const [klTableWidth, setKlTableWidth] = useState(200);
  const [resizingPanel, setResizingPanel] = useState<"ts" | "kl" | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    const fetchTimeSeriesData = async () => {
      try {
        const tsData = await invoke("get_time_series", { symbol: tab.symbol });
        setTimeSeriesData(tsData as StockData[]);
      } catch (err) {
        console.error("Error fetching time series data:", err);
      }
    };

    if (tab.symbol) {
      fetchTimeSeriesData();
    }
  }, [tab.symbol]);

  useEffect(() => {
    const fetchKLineData = async () => {
      setLoading(true);
      try {
        const klData = await invoke("get_stock_history", {
          symbol: tab.symbol,
          period: klinePeriod,
        });
        setKlineData(klData as StockData[]);
      } catch (err) {
        console.error("Error fetching K-line data:", err);
      } finally {
        setLoading(false);
      }
    };

    if (tab.symbol) {
      fetchKLineData();
    }
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

  const renderAnalysisContent = () => {
    switch (activeAnalysisTab) {
      case "timeseries":
        return (
          <StockAnalysis
            timeSeriesData={timeSeriesData}
            klineData={klineData}
            analysisType="timeseries"
          />
        );
      case "kline":
        return (
          <KLineTechnicalAnalysis klineData={klineData} />
        );
      case "klinechip":
        return (
          <KLineChipAnalysis klineData={klineData} />
        );
      case "prediction":
        return (
          <PredictionAnalysis klineData={klineData} />
        );
      case "compare":
        return (
          <CompareAnalysis currentSymbol={tab.symbol} currentData={klineData} />
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
            onClick={() => setActiveAnalysisTab("timeseries")}
          >
            <span className="tab-icon">📈</span>
            <span className="tab-label">{t("analysis.timeSeries")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "kline" ? "active" : ""}`}
            onClick={() => setActiveAnalysisTab("kline")}
          >
            <span className="tab-icon">📊</span>
            <span className="tab-label">{t("analysis.klineAnalysis")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "klinechip" ? "active" : ""}`}
            onClick={() => setActiveAnalysisTab("klinechip")}
          >
            <span className="tab-icon">📈</span>
            <span className="tab-label">{t("analysis.klineChipAnalysis")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "prediction" ? "active" : ""}`}
            onClick={() => setActiveAnalysisTab("prediction")}
          >
            <span className="tab-icon">🔮</span>
            <span className="tab-label">{t("analysis.prediction")}</span>
          </button>
          <button
            className={`analysis-tab ${activeAnalysisTab === "compare" ? "active" : ""}`}
            onClick={() => setActiveAnalysisTab("compare")}
          >
            <span className="tab-icon">⚖️</span>
            <span className="tab-label">{t("analysis.compare")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockTab;
