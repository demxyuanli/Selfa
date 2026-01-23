import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import TimeSeriesChart from "./TimeSeriesChart";
import KLineChart from "./KLineChart";
import Icon from "./Icon";
import { useTradingHoursTimeseriesRefresh } from "../hooks/useTradingHoursTimeseriesRefresh";
import "./RightSidebar.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type RightPanel = "timeSeries" | "dailyK";
type KLinePeriod = "1d" | "5d" | "1w" | "1mo" | "1y";

interface RightSidebarProps {
  visible: boolean;
  onToggle: () => void;
}

interface StockQuote {
  previous_close: number;
}

const RightSidebar: React.FC<RightSidebarProps> = ({ visible, onToggle }) => {
  const { t } = useTranslation();
  const [activePanel, setActivePanel] = useState<RightPanel>("timeSeries");
  const [klinePeriod, setKlinePeriod] = useState<KLinePeriod>("1d");
  const [shTimeSeries, setShTimeSeries] = useState<StockData[]>([]);
  const [szTimeSeries, setSzTimeSeries] = useState<StockData[]>([]);
  const [cyTimeSeries, setCyTimeSeries] = useState<StockData[]>([]);
  const [shQuote, setShQuote] = useState<StockQuote | null>(null);
  const [szQuote, setSzQuote] = useState<StockQuote | null>(null);
  const [cyQuote, setCyQuote] = useState<StockQuote | null>(null);
  const [shKLine, setShKLine] = useState<StockData[]>([]);
  const [szKLine, setSzKLine] = useState<StockData[]>([]);
  const [cyKLine, setCyKLine] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTimeSeriesData = useCallback(async () => {
    try {
      const [shTS, szTS, cyTS, shQ, szQ, cyQ] = await Promise.all([
        invoke("get_time_series", { symbol: "000001" }),
        invoke("get_time_series", { symbol: "399001" }),
        invoke("get_time_series", { symbol: "399006" }),
        invoke("get_stock_quote", { symbol: "000001" }),
        invoke("get_stock_quote", { symbol: "399001" }),
        invoke("get_stock_quote", { symbol: "399006" }),
      ]);
      const newShData = shTS as StockData[];
      const newSzData = szTS as StockData[];
      const newCyData = cyTS as StockData[];
      
      setShTimeSeries((prev) => (JSON.stringify(newShData) !== JSON.stringify(prev) ? newShData : prev));
      setSzTimeSeries((prev) => (JSON.stringify(newSzData) !== JSON.stringify(prev) ? newSzData : prev));
      setCyTimeSeries((prev) => (JSON.stringify(newCyData) !== JSON.stringify(prev) ? newCyData : prev));
      
      setShQuote(shQ as StockQuote);
      setSzQuote(szQ as StockQuote);
      setCyQuote(cyQ as StockQuote);
    } catch (err) {
      console.error("Error fetching time series data:", err);
    }
  }, []);

  useEffect(() => {
    if (!visible || activePanel !== "timeSeries") return;
    setLoading(true);
    fetchTimeSeriesData().finally(() => setLoading(false));
  }, [visible, activePanel, fetchTimeSeriesData]);

  useTradingHoursTimeseriesRefresh(fetchTimeSeriesData, {
    enabled: visible && activePanel === "timeSeries",
    intervalInMs: 15000,
  });

  useEffect(() => {
    if (!visible || activePanel !== "dailyK") {
      return;
    }
    
    const fetchKLineData = async () => {
      setLoading(true);
      try {
        const period = klinePeriod;
        const [shKL, szKL, cyKL] = await Promise.all([
          invoke("get_stock_history", { symbol: "000001", period }),
          invoke("get_stock_history", { symbol: "399001", period }),
          invoke("get_stock_history", { symbol: "399006", period }),
        ]);
        setShKLine(shKL as StockData[]);
        setSzKLine(szKL as StockData[]);
        setCyKLine(cyKL as StockData[]);
      } catch (err) {
        console.error("Error fetching K-line data:", err);
        setShKLine([]);
        setSzKLine([]);
        setCyKLine([]);
      } finally {
        setLoading(false);
      }
    };

    fetchKLineData();
  }, [activePanel, klinePeriod, visible]);

  return (
    <>
      <div className={`right-sidebar ${visible ? "expanded" : "collapsed"}`}>
        {visible && (
          <div className="sidebar-expanded-content">
            <div className="sidebar-header">
              <button onClick={onToggle} className="toggle-btn">
                <Icon name="chevronRight" size={14} />
              </button>
              <span>{t("sidebar.indices")}</span>
            </div>
            <div className="sidebar-content">
          {activePanel === "timeSeries" && (
            <div className="sidebar-panel">
              <div className="index-chart-container">
                <div className="index-chart-item">
                  <div className="index-chart-label">{t("index.shanghai")}</div>
                  {loading ? (
                    <div className="index-loading">Loading...</div>
                  ) : (
                    <TimeSeriesChart key="sh" data={shTimeSeries} quote={shQuote} compact={true} />
                  )}
                </div>
                <div className="index-chart-item">
                  <div className="index-chart-label">{t("index.shenzhen")}</div>
                  {loading ? (
                    <div className="index-loading">Loading...</div>
                  ) : (
                    <TimeSeriesChart key="sz" data={szTimeSeries} quote={szQuote} compact={true} />
                  )}
                </div>
                <div className="index-chart-item">
                  <div className="index-chart-label">{t("index.chuangye")}</div>
                  {loading ? (
                    <div className="index-loading">Loading...</div>
                  ) : (
                    <TimeSeriesChart key="cy" data={cyTimeSeries} quote={cyQuote} compact={true} />
                  )}
                </div>
              </div>
            </div>
          )}
          {activePanel === "dailyK" && (
            <div className="sidebar-panel">
              <div className="kline-period-selector">
                <button
                  className={`period-btn ${klinePeriod === "1d" ? "active" : ""}`}
                  onClick={() => setKlinePeriod("1d")}
                >
                  {t("kline.1d")}
                </button>
                <button
                  className={`period-btn ${klinePeriod === "5d" ? "active" : ""}`}
                  onClick={() => setKlinePeriod("5d")}
                >
                  {t("kline.5d")}
                </button>
                <button
                  className={`period-btn ${klinePeriod === "1w" ? "active" : ""}`}
                  onClick={() => setKlinePeriod("1w")}
                >
                  {t("kline.1w")}
                </button>
                <button
                  className={`period-btn ${klinePeriod === "1mo" ? "active" : ""}`}
                  onClick={() => setKlinePeriod("1mo")}
                >
                  {t("kline.1mo")}
                </button>
                <button
                  className={`period-btn ${klinePeriod === "1y" ? "active" : ""}`}
                  onClick={() => setKlinePeriod("1y")}
                >
                  {t("kline.1y")}
                </button>
              </div>
              <div className="index-chart-container">
                <div className="index-chart-item">
                  <div className="index-chart-label">{t("index.shanghai")}</div>
                  {loading ? (
                    <div className="index-loading">Loading...</div>
                  ) : shKLine.length === 0 ? (
                    <div className="index-loading">No data</div>
                  ) : (
                    <KLineChart data={shKLine} compact={true} />
                  )}
                </div>
                <div className="index-chart-item">
                  <div className="index-chart-label">{t("index.shenzhen")}</div>
                  {loading ? (
                    <div className="index-loading">Loading...</div>
                  ) : szKLine.length === 0 ? (
                    <div className="index-loading">No data</div>
                  ) : (
                    <KLineChart data={szKLine} compact={true} />
                  )}
                </div>
                <div className="index-chart-item">
                  <div className="index-chart-label">{t("index.chuangye")}</div>
                  {loading ? (
                    <div className="index-loading">Loading...</div>
                  ) : cyKLine.length === 0 ? (
                    <div className="index-loading">No data</div>
                  ) : (
                    <KLineChart data={cyKLine} compact={true} />
                  )}
                </div>
              </div>
            </div>
          )}
            </div>
          </div>
        )}
        <div className="sidebar-icons-bar">
          <button
            className={`sidebar-icon ${activePanel === "timeSeries" ? "active" : ""}`}
            onClick={() => {
              setActivePanel("timeSeries");
              if (!visible) onToggle();
            }}
            title={t("index.timeSeries")}
          >
            <Icon name="timeSeries" size={16} filled={activePanel === "timeSeries"} />
          </button>
          <button
            className={`sidebar-icon ${activePanel === "dailyK" ? "active" : ""}`}
            onClick={() => {
              setActivePanel("dailyK");
              if (!visible) onToggle();
            }}
            title={t("index.dailyK")}
          >
            <Icon name="kline" size={16} filled={activePanel === "dailyK"} />
          </button>
        </div>
      </div>
    </>
  );
};

export default RightSidebar;
