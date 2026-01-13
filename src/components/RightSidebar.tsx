import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import TimeSeriesChart from "./TimeSeriesChart";
import KLineChart from "./KLineChart";
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

interface RightSidebarProps {
  visible: boolean;
  onToggle: () => void;
}

const RightSidebar: React.FC<RightSidebarProps> = ({ visible, onToggle }) => {
  const { t } = useTranslation();
  const [activePanel, setActivePanel] = useState<RightPanel>("timeSeries");
  const [shTimeSeries, setShTimeSeries] = useState<StockData[]>([]);
  const [szTimeSeries, setSzTimeSeries] = useState<StockData[]>([]);
  const [cyTimeSeries, setCyTimeSeries] = useState<StockData[]>([]);
  const [shKLine, setShKLine] = useState<StockData[]>([]);
  const [szKLine, setSzKLine] = useState<StockData[]>([]);
  const [cyKLine, setCyKLine] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [shTS, szTS, cyTS, shKL, szKL, cyKL] = await Promise.all([
          invoke("get_time_series", { symbol: "000001" }),
          invoke("get_time_series", { symbol: "399001" }),
          invoke("get_time_series", { symbol: "399006" }),
          invoke("get_stock_history", { symbol: "000001", period: "1mo" }),
          invoke("get_stock_history", { symbol: "399001", period: "1mo" }),
          invoke("get_stock_history", { symbol: "399006", period: "1mo" }),
        ]);
        setShTimeSeries(shTS as StockData[]);
        setSzTimeSeries(szTS as StockData[]);
        setCyTimeSeries(cyTS as StockData[]);
        setShKLine(shKL as StockData[]);
        setSzKLine(szKL as StockData[]);
        setCyKLine(cyKL as StockData[]);
      } catch (err) {
        console.error("Error fetching index data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <div className={`right-sidebar ${visible ? "expanded" : "collapsed"}`}>
        <div className="sidebar-icons-bar">
          <button
            className={`sidebar-icon ${activePanel === "timeSeries" ? "active" : ""}`}
            onClick={() => {
              setActivePanel("timeSeries");
              if (!visible) onToggle();
            }}
            title={t("index.timeSeries")}
          >
            📈
          </button>
          <button
            className={`sidebar-icon ${activePanel === "dailyK" ? "active" : ""}`}
            onClick={() => {
              setActivePanel("dailyK");
              if (!visible) onToggle();
            }}
            title={t("index.dailyK")}
          >
            📊
          </button>
        </div>
        {visible && (
          <div className="sidebar-expanded-content">
            <div className="sidebar-header">
              <button onClick={onToggle} className="toggle-btn">▶</button>
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
                    <TimeSeriesChart data={shTimeSeries} />
                  )}
                </div>
                <div className="index-chart-item">
                  <div className="index-chart-label">{t("index.shenzhen")}</div>
                  {loading ? (
                    <div className="index-loading">Loading...</div>
                  ) : (
                    <TimeSeriesChart data={szTimeSeries} />
                  )}
                </div>
                <div className="index-chart-item">
                  <div className="index-chart-label">{t("index.chuangye")}</div>
                  {loading ? (
                    <div className="index-loading">Loading...</div>
                  ) : (
                    <TimeSeriesChart data={cyTimeSeries} />
                  )}
                </div>
              </div>
            </div>
          )}
          {activePanel === "dailyK" && (
            <div className="sidebar-panel">
              <div className="index-chart-container">
                <div className="index-chart-item">
                  <div className="index-chart-label">{t("index.shanghai")}</div>
                  {loading ? (
                    <div className="index-loading">Loading...</div>
                  ) : (
                    <KLineChart data={shKLine} />
                  )}
                </div>
                <div className="index-chart-item">
                  <div className="index-chart-label">{t("index.shenzhen")}</div>
                  {loading ? (
                    <div className="index-loading">Loading...</div>
                  ) : (
                    <KLineChart data={szKLine} />
                  )}
                </div>
                <div className="index-chart-item">
                  <div className="index-chart-label">{t("index.chuangye")}</div>
                  {loading ? (
                    <div className="index-loading">Loading...</div>
                  ) : (
                    <KLineChart data={cyKLine} />
                  )}
                </div>
              </div>
            </div>
          )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default RightSidebar;
