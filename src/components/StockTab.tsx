import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import AnalysisToolbar from "./AnalysisToolbar";
import TimeSeriesChart from "./TimeSeriesChart";
import KLineChart from "./KLineChart";
import TimeSeriesTable from "./TimeSeriesTable";
import HistoryTable from "./HistoryTable";
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

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const StockTab: React.FC<StockTabProps> = ({ tab }) => {
  const [timeSeriesData, setTimeSeriesData] = useState<StockData[]>([]);
  const [klineData, setKlineData] = useState<StockData[]>([]);
  const [, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [tsData, klData] = await Promise.all([
          invoke("get_time_series", { symbol: tab.symbol }),
          invoke("get_stock_history", { symbol: tab.symbol, period: "1y" }),
        ]);
        setTimeSeriesData(tsData as StockData[]);
        setKlineData(klData as StockData[]);
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    if (tab.symbol) {
      fetchData();
    }
  }, [tab.symbol]);

  return (
    <div className="stock-tab">
      <div className="tab-upper">
        <AnalysisToolbar />
        <div className="upper-content">
          <div className="chart-panel">
            <TimeSeriesChart data={timeSeriesData} quote={tab.quote} />
          </div>
          <div className="table-panel">
            <TimeSeriesTable data={timeSeriesData} quote={tab.quote} />
          </div>
        </div>
      </div>
      <div className="tab-lower">
        <div className="lower-content">
          <div className="chart-panel">
            <KLineChart data={klineData} />
          </div>
          <div className="table-panel">
            <HistoryTable data={klineData} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockTab;
