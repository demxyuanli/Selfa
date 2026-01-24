import React, { useState, useMemo, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useAlert } from "../contexts/AlertContext";
import ReactECharts from "echarts-for-react";
import ChartDialog from "./ChartDialog";
import { getDefaultCommissionRate, getBacktestParams } from "../utils/settings";
import "./StockAnalysis.css";
import "./BacktestAnalysis.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BacktestAnalysisProps {
  klineData: StockData[];
}

interface Trade {
  date: string;
  price: number;
  type: "buy" | "sell";
  quantity: number;
  profit?: number;
  reason: string;
}

interface EquityPoint {
  date: string;
  equity: number;
  drawdown_pct: number;
}

interface BacktestResult {
  total_return: number;
  total_return_pct: number;
  max_drawdown: number;
  max_drawdown_pct: number;
  win_rate: number;
  profit_factor: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  trades: Trade[];
  equity_curve: EquityPoint[];
  next_signal?: string;
}

type StrategyType = 
  | { type: "MaCross", params: { fast: number; slow: number } }
  | { type: "Rsi", params: { period: number; overbought: number; oversold: number } }
  | { type: "Macd", params: { fast: number; slow: number; signal: number } }
  | { type: "Kdj", params: { period: number; k_period: number; d_period: number; overbought: number; oversold: number } }
  | { type: "Bollinger", params: { period: number; multiplier: number } };

const BacktestAnalysis: React.FC<BacktestAnalysisProps> = ({ klineData }) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const backtestDefaults = getBacktestParams();
  
  // Basic Config
  const [initialCapital, setInitialCapital] = useState(backtestDefaults.initialCapital);
  const [commissionRate, setCommissionRate] = useState(getDefaultCommissionRate());
  const [positionSizePercent, setPositionSizePercent] = useState(backtestDefaults.positionSizePercent);
  const [stopLossPercent, setStopLossPercent] = useState<number | "">(backtestDefaults.stopLossPercent || "");
  const [takeProfitPercent, setTakeProfitPercent] = useState<number | "">(backtestDefaults.takeProfitPercent || "");

  // Strategy Selection
  const [selectedStrategy, setSelectedStrategy] = useState<string>("MaCross");

  // Strategy Params
  const [maParams, setMaParams] = useState({ fast: backtestDefaults.maFast, slow: backtestDefaults.maSlow });
  const [rsiParams, setRsiParams] = useState({ period: 14, overbought: backtestDefaults.rsiOverbought, oversold: backtestDefaults.rsiOversold });
  const [macdParams, setMacdParams] = useState({ fast: 12, slow: 26, signal: 9 });
  const [kdjParams, setKdjParams] = useState({ period: 9, k_period: 3, d_period: 3, overbought: 80, oversold: 20 });
  const [bbParams, setBbParams] = useState({ period: 20, multiplier: 2.0 });

  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  const chartRef = useRef<ReactECharts>(null);

  useEffect(() => {
    setCommissionRate(getDefaultCommissionRate());
    const defaults = getBacktestParams();
    setInitialCapital(defaults.initialCapital);
    setMaParams({ fast: defaults.maFast, slow: defaults.maSlow });
    setRsiParams({ period: 14, overbought: defaults.rsiOverbought, oversold: defaults.rsiOversold });
    setStopLossPercent(defaults.stopLossPercent || "");
    setTakeProfitPercent(defaults.takeProfitPercent || "");
    setPositionSizePercent(defaults.positionSizePercent);
  }, []);

  const runBacktest = async () => {
    if (klineData.length < 50) {
      showAlert(t("analysis.insufficientData"));
      return;
    }

    setIsRunning(true);
    setBacktestResult(null);

    try {
      let strategy: StrategyType;
      switch (selectedStrategy) {
        case "MaCross":
          strategy = { type: "MaCross", params: maParams };
          break;
        case "Rsi":
          strategy = { type: "Rsi", params: rsiParams };
          break;
        case "Macd":
          strategy = { type: "Macd", params: macdParams };
          break;
        case "Kdj":
          strategy = { type: "Kdj", params: kdjParams };
          break;
        case "Bollinger":
          strategy = { type: "Bollinger", params: bbParams };
          break;
        default:
          throw new Error("Invalid strategy");
      }

      const config = {
        initial_capital: initialCapital,
        commission_rate: commissionRate,
        strategy,
        stop_loss_pct: stopLossPercent === "" ? null : Number(stopLossPercent),
        take_profit_pct: takeProfitPercent === "" ? null : Number(takeProfitPercent),
        position_size_pct: positionSizePercent,
      };

      const result: BacktestResult = await invoke("run_backtest_command", {
        data: klineData,
        config,
      });

      setBacktestResult(result);
    } catch (error) {
      console.error("Backtest error:", error);
      showAlert(t("analysis.backtestError") + ": " + error);
    } finally {
      setIsRunning(false);
    }
  };

  const chartOption = useMemo(() => {
    if (!backtestResult || klineData.length === 0) return {};

    const dates = backtestResult.equity_curve.map(p => p.date.split(" ")[0]);
    const equityValues = backtestResult.equity_curve.map(p => p.equity);
    const closes = klineData.slice(klineData.length - dates.length).map(d => d.close); // Align data length

    const buyPoints = backtestResult.trades
      .filter(t => t.type === "buy")
      .map(t => {
        const index = dates.indexOf(t.date.split(" ")[0]);
        return index >= 0 ? [index, t.price] : null;
      })
      .filter(p => p !== null);

    const sellPoints = backtestResult.trades
      .filter(t => t.type === "sell")
      .map(t => {
        const index = dates.indexOf(t.date.split(" ")[0]);
        return index >= 0 ? [index, t.price] : null;
      })
      .filter(p => p !== null);

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", snap: true },
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#555",
        textStyle: { color: "#ccc" },
      },
      legend: {
        data: [t("analysis.price"), t("analysis.equityCurve"), t("analysis.buySignals"), t("analysis.sellSignals")],
        textStyle: { color: "#858585", fontSize: 10 },
        top: "2%",
        left: "center",
      },
      grid: {
        left: "3%",
        right: "4%",
        top: "15%",
        bottom: "8%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: { color: "#858585", fontSize: 9 },
        axisPointer: { snap: true },
      },
      yAxis: [
        {
          type: "value",
          name: t("analysis.price"),
          scale: true,
          axisLabel: { color: "#858585", fontSize: 9 },
          splitLine: { lineStyle: { color: "rgba(133, 133, 133, 0.15)" } },
        },
        {
          type: "value",
          name: t("analysis.equity"),
          scale: true,
          axisLabel: { color: "#858585", fontSize: 9 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: t("analysis.price"),
          type: "line",
          data: closes,
          lineStyle: { color: "#007acc", width: 1 },
          itemStyle: { color: "#007acc" },
          symbol: "none",
        },
        {
          name: t("analysis.equityCurve"),
          type: "line",
          yAxisIndex: 1,
          data: equityValues,
          lineStyle: { color: "#00ff00", width: 1 },
          itemStyle: { color: "#00ff00" },
          symbol: "none",
        },
        {
          name: t("analysis.buySignals"),
          type: "scatter",
          data: buyPoints,
          symbolSize: 8,
          itemStyle: { color: "#e74c3c" }, // Red for buy (CN style) or use standard
          // Using standard colors: Green for Buy, Red for Sell? 
          // Or CN: Red for Up (Buy), Green for Down (Sell). 
          // Let's stick to standard global for now: Green Buy, Red Sell.
          // Wait, selfa uses CN style? 
          // Previous code used Green (#00ff00) for buy signals?
          // Let's check previous implementation. 
          // "itemStyle: { color: "#00ff00" }" was Buy.
        },
        {
          name: t("analysis.sellSignals"),
          type: "scatter",
          data: sellPoints,
          symbolSize: 8,
          itemStyle: { color: "#ff0000" },
        },
      ],
    };
  }, [backtestResult, klineData, t]);

  return (
    <div className="backtest-analysis">
      <div className="analysis-columns">
        <div className="analysis-column params-column">
          <div className="column-header">{t("analysis.backtest")}</div>
          <div className="params-content">
            
            {/* Basic Settings */}
            <div className="param-section">
              <label className="param-section-label">{t("analysis.initialCapital")}</label>
              <input
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(parseFloat(e.target.value) || 100000)}
                className="param-input"
              />
            </div>
            
            <div className="param-section">
              <label className="param-section-label">{t("analysis.strategy")}</label>
              <select
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value)}
                className="param-select"
              >
                <option value="MaCross">{t("analysis.maCross")}</option>
                <option value="Rsi">{t("analysis.rsiStrategy")}</option>
                <option value="Macd">{t("analysis.macd")}</option>
                <option value="Kdj">{t("analysis.oscillatorKDJ")}</option>
                <option value="Bollinger">{t("analysis.overlayBollinger")}</option>
              </select>
            </div>

            {/* Strategy Specific Params */}
            {selectedStrategy === "MaCross" && (
              <>
                <div className="param-section">
                  <label className="param-section-label">{t("analysis.maFast")}</label>
                  <input type="number" value={maParams.fast} onChange={(e) => setMaParams({...maParams, fast: parseInt(e.target.value)||5})} className="param-input" />
                </div>
                <div className="param-section">
                  <label className="param-section-label">{t("analysis.maSlow")}</label>
                  <input type="number" value={maParams.slow} onChange={(e) => setMaParams({...maParams, slow: parseInt(e.target.value)||20})} className="param-input" />
                </div>
              </>
            )}

            {selectedStrategy === "Rsi" && (
              <>
                <div className="param-section">
                  <label className="param-section-label">{t("analysis.rsiPeriod")}</label>
                  <input type="number" value={rsiParams.period} onChange={(e) => setRsiParams({...rsiParams, period: parseInt(e.target.value)||14})} className="param-input" />
                </div>
                <div className="param-section">
                  <label className="param-section-label">{t("analysis.rsiOversold")}</label>
                  <input type="number" value={rsiParams.oversold} onChange={(e) => setRsiParams({...rsiParams, oversold: parseInt(e.target.value)||30})} className="param-input" />
                </div>
                <div className="param-section">
                  <label className="param-section-label">{t("analysis.rsiOverbought")}</label>
                  <input type="number" value={rsiParams.overbought} onChange={(e) => setRsiParams({...rsiParams, overbought: parseInt(e.target.value)||70})} className="param-input" />
                </div>
              </>
            )}

            {selectedStrategy === "Macd" && (
              <>
                 <div className="param-section">
                  <label className="param-section-label">{t("analysis.macdFast")}</label>
                  <input type="number" value={macdParams.fast} onChange={(e) => setMacdParams({...macdParams, fast: parseInt(e.target.value)||12})} className="param-input" />
                </div>
                <div className="param-section">
                  <label className="param-section-label">{t("analysis.macdSlow")}</label>
                  <input type="number" value={macdParams.slow} onChange={(e) => setMacdParams({...macdParams, slow: parseInt(e.target.value)||26})} className="param-input" />
                </div>
                 <div className="param-section">
                  <label className="param-section-label">{t("analysis.macdSignal")}</label>
                  <input type="number" value={macdParams.signal} onChange={(e) => setMacdParams({...macdParams, signal: parseInt(e.target.value)||9})} className="param-input" />
                </div>
              </>
            )}

             {selectedStrategy === "Kdj" && (
              <>
                 <div className="param-section">
                  <label className="param-section-label">{t("analysis.kdjPeriod")}</label>
                  <input type="number" value={kdjParams.period} onChange={(e) => setKdjParams({...kdjParams, period: parseInt(e.target.value)||9})} className="param-input" />
                </div>
                 <div className="param-section">
                  <label className="param-section-label">K {t("analysis.period")}</label>
                  <input type="number" value={kdjParams.k_period} onChange={(e) => setKdjParams({...kdjParams, k_period: parseInt(e.target.value)||3})} className="param-input" />
                </div>
                 <div className="param-section">
                  <label className="param-section-label">D {t("analysis.period")}</label>
                  <input type="number" value={kdjParams.d_period} onChange={(e) => setKdjParams({...kdjParams, d_period: parseInt(e.target.value)||3})} className="param-input" />
                </div>
              </>
            )}

            {selectedStrategy === "Bollinger" && (
              <>
                 <div className="param-section">
                  <label className="param-section-label">{t("analysis.period")}</label>
                  <input type="number" value={bbParams.period} onChange={(e) => setBbParams({...bbParams, period: parseInt(e.target.value)||20})} className="param-input" />
                </div>
                 <div className="param-section">
                  <label className="param-section-label">{t("analysis.stdDev") || "Std Dev"}</label>
                  <input type="number" step="0.1" value={bbParams.multiplier} onChange={(e) => setBbParams({...bbParams, multiplier: parseFloat(e.target.value)||2.0})} className="param-input" />
                </div>
              </>
            )}

            {/* Risk Management */}
            <div className="param-section">
              <label className="param-section-label">{t("analysis.stopLoss")}</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  value={stopLossPercent}
                  onChange={(e) => setStopLossPercent(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  className="param-input"
                  placeholder="Optional"
                />
                <span className="unit">%</span>
              </div>
            </div>
             <div className="param-section">
              <label className="param-section-label">{t("analysis.takeProfit")}</label>
               <div className="input-with-unit">
                <input
                  type="number"
                  value={takeProfitPercent}
                  onChange={(e) => setTakeProfitPercent(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  className="param-input"
                  placeholder="Optional"
                />
                <span className="unit">%</span>
              </div>
            </div>

            <div className="param-section">
              <button onClick={runBacktest} disabled={isRunning} className="param-btn primary">
                {isRunning ? t("analysis.running") : t("analysis.runBacktest")}
              </button>
            </div>

            {/* Results */}
            {backtestResult && (
              <div className="backtest-results">
                 <div className="result-title">{t("analysis.backtestResults")}</div>
                 
                 {backtestResult.next_signal && (
                   <div className="result-item" style={{ marginBottom: "10px", padding: "5px", background: "#333", borderRadius: "4px" }}>
                     <span className="result-label">{t("analysis.nextSignal") || "Next Signal"}:</span>
                     <span className={`result-value ${backtestResult.next_signal === "buy" ? "positive" : backtestResult.next_signal === "sell" ? "negative" : ""}`}>
                       {backtestResult.next_signal.toUpperCase()}
                     </span>
                   </div>
                 )}

                 <div className="result-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div className="result-cell">
                      <span className="label">{t("analysis.totalReturn")}</span>
                      <span className={`value ${backtestResult.total_return >= 0 ? "positive" : "negative"}`}>
                        {backtestResult.total_return_pct.toFixed(2)}%
                      </span>
                    </div>
                     <div className="result-cell">
                      <span className="label">{t("analysis.winRate")}</span>
                      <span className="value">{backtestResult.win_rate.toFixed(2)}%</span>
                    </div>
                     <div className="result-cell">
                      <span className="label">{t("analysis.profitFactor")}</span>
                      <span className="value">{backtestResult.profit_factor === Infinity ? "∞" : backtestResult.profit_factor.toFixed(2)}</span>
                    </div>
                     <div className="result-cell">
                      <span className="label">{t("analysis.maxDrawdown")}</span>
                      <span className="value negative">{backtestResult.max_drawdown_pct.toFixed(2)}%</span>
                    </div>
                    <div className="result-cell">
                      <span className="label">{t("analysis.sharpeRatio") || "Sharpe"}</span>
                      <span className="value">{backtestResult.sharpe_ratio.toFixed(2)}</span>
                    </div>
                     <div className="result-cell">
                      <span className="label">{t("analysis.sortinoRatio") || "Sortino"}</span>
                      <span className="value">{backtestResult.sortino_ratio.toFixed(2)}</span>
                    </div>
                     <div className="result-cell">
                      <span className="label">{t("analysis.totalTrades")}</span>
                      <span className="value">{backtestResult.total_trades}</span>
                    </div>
                 </div>
              </div>
            )}
          </div>
        </div>

        <div className="column-divider" />
        
        <div className="analysis-column chart-column">
           <div className="column-header">
            <span>{t("analysis.chart")}</span>
            <button className="chart-zoom-button" onClick={() => setIsChartDialogOpen(true)}>
              {t("chart.zoomAbbr")}
            </button>
          </div>
          <div className="chart-content">
             {Object.keys(chartOption).length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <ReactECharts
                ref={chartRef}
                option={chartOption}
                style={{ height: "100%", width: "100%" }}
                opts={{ renderer: "canvas" }}
              />
            )}
          </div>
        </div>
      </div>
       <ChartDialog
        isOpen={isChartDialogOpen}
        onClose={() => setIsChartDialogOpen(false)}
        title={`${t("analysis.backtest")} - ${t("chart.title")}`}
        chartOption={chartOption}
      />
    </div>
  );
};

export default BacktestAnalysis;
