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
  type_: string;
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

interface OptimizationResult {
  params: string;
  total_return_pct: number;
  max_drawdown_pct: number;
  win_rate: number;
  sharpe_ratio: number;
}

type StrategyType = 
  | { type: "MaCross", params: { fast: number; slow: number } }
  | { type: "Rsi", params: { period: number; overbought: number; oversold: number } }
  | { type: "Macd", params: { fast: number; slow: number; signal: number } }
  | { type: "Kdj", params: { period: number; k_period: number; d_period: number; overbought: number; oversold: number } }
  | { type: "Bollinger", params: { period: number; multiplier: number } }
  | { type: "Turtle", params: { entry_period: number; exit_period: number } };

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

  // Mode Selection
  const [mode, setMode] = useState<"backtest" | "optimization">("backtest");

  // Strategy Selection
  const [selectedStrategy, setSelectedStrategy] = useState<string>("MaCross");

  // Strategy Params
  const [maParams, setMaParams] = useState({ fast: backtestDefaults.maFast, slow: backtestDefaults.maSlow });
  const [rsiParams, setRsiParams] = useState({ period: 14, overbought: backtestDefaults.rsiOverbought, oversold: backtestDefaults.rsiOversold });
  const [macdParams, setMacdParams] = useState({ fast: 12, slow: 26, signal: 9 });
  const [kdjParams, setKdjParams] = useState({ period: 9, k_period: 3, d_period: 3, overbought: 80, oversold: 20 });
  const [bbParams, setBbParams] = useState({ period: 20, multiplier: 2.0 });
  const [turtleParams, setTurtleParams] = useState({ entry_period: 20, exit_period: 10 });

  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [optimizationResults, setOptimizationResults] = useState<OptimizationResult[]>([]);
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

  const getStrategyConfig = () => {
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
      case "Turtle":
        strategy = { type: "Turtle", params: turtleParams };
        break;
      default:
        throw new Error("Invalid strategy");
    }
    return {
      initial_capital: initialCapital,
      commission_rate: commissionRate,
      strategy,
      stop_loss_pct: stopLossPercent === "" ? null : Number(stopLossPercent),
      take_profit_pct: takeProfitPercent === "" ? null : Number(takeProfitPercent),
      position_size_pct: positionSizePercent,
    };
  };

  const runBacktest = async () => {
    if (klineData.length < 50) {
      showAlert(t("analysis.insufficientData"));
      return;
    }

    setIsRunning(true);
    setBacktestResult(null);

    try {
      const config = getStrategyConfig();
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

  const runOptimization = async () => {
    if (klineData.length < 50) {
      showAlert(t("analysis.insufficientData"));
      return;
    }

    setIsRunning(true);
    setOptimizationResults([]);

    try {
      const config = getStrategyConfig();
      const results: OptimizationResult[] = await invoke("run_optimization_command", {
        data: klineData,
        config,
      });

      setOptimizationResults(results);
    } catch (error) {
      console.error("Optimization error:", error);
      showAlert(t("analysis.optimizationError") + ": " + error);
    } finally {
      setIsRunning(false);
    }
  };

  const chartOption = useMemo(() => {
    if (!backtestResult || klineData.length === 0) return {};

    const dates = backtestResult.equity_curve.map(p => p.date.split(" ")[0]);
    const equityValues = backtestResult.equity_curve.map(p => p.equity);
    const closes = klineData.slice(klineData.length - dates.length).map(d => d.close);

    const dateToTrade = new Map<string, { type_: string; reason: string }>();
    for (const tr of backtestResult.trades) {
      const d = tr.date.split(" ")[0];
      dateToTrade.set(d, { type_: tr.type_, reason: tr.reason });
    }

    const positionByIndex: number[] = new Array(dates.length).fill(0);
    const positionAreas: Array<[{ xAxis: number }, { xAxis: number }]> = [];
    const positionValues: number[] = new Array(dates.length).fill(0);
    let buyIdx: number | null = null;
    let holdings = 0;

    for (const tr of backtestResult.trades) {
      const idx = dates.indexOf(tr.date.split(" ")[0]);
      if (idx < 0) continue;
      if (tr.type_ === "buy") {
        buyIdx = idx;
        holdings += tr.quantity;
      } else if (tr.type_ === "sell" && buyIdx !== null) {
        for (let i = buyIdx; i <= idx; i++) positionByIndex[i] = 1;
        positionAreas.push([{ xAxis: buyIdx }, { xAxis: idx }]);
        buyIdx = null;
        holdings = 0;
      }
    }
    if (buyIdx !== null) {
      for (let i = buyIdx; i < dates.length; i++) positionByIndex[i] = 1;
      positionAreas.push([{ xAxis: buyIdx }, { xAxis: dates.length - 1 }]);
    }

    holdings = 0;
    const tradesByDate = new Map<string, Trade[]>();
    for (const tr of backtestResult.trades) {
      const d = tr.date.split(" ")[0];
      if (!tradesByDate.has(d)) tradesByDate.set(d, []);
      tradesByDate.get(d)!.push(tr);
    }
    for (let i = 0; i < dates.length; i++) {
      const dayTrades = tradesByDate.get(dates[i]) ?? [];
      for (const tr of dayTrades) {
        if (tr.type_ === "buy") holdings += tr.quantity;
        else if (tr.type_ === "sell") holdings = 0;
      }
      positionValues[i] = holdings * closes[i];
    }

    const buyPoints = backtestResult.trades
      .filter(t => t.type_ === "buy")
      .map(t => {
        const index = dates.indexOf(t.date.split(" ")[0]);
        return index >= 0 ? [index, t.price] : null;
      })
      .filter((p): p is number[] => p !== null);

    const sellPoints = backtestResult.trades
      .filter(t => t.type_ === "sell")
      .map(t => {
        const index = dates.indexOf(t.date.split(" ")[0]);
        return index >= 0 ? [index, t.price] : null;
      })
      .filter((p): p is number[] => p !== null);

    const fmt = (params: Array<{ axisValue: string; value: number; seriesName?: string }>) => {
      const p = params[0];
      if (!p) return "";
      const dateStr = String(p.axisValue);
      const priceVal = params.find(x => x.seriesName === t("analysis.price"))?.value;
      const equityVal = params.find(x => x.seriesName === t("analysis.equityCurve"))?.value;
      const trade = dateToTrade.get(dateStr);
      const dataIdx = dates.indexOf(dateStr);
      const pos = dataIdx >= 0 ? positionByIndex[dataIdx] : 0;
      const action = trade ? (trade.type_ === "buy" ? t("analysis.buySignals") : t("analysis.sellSignals")) : t("analysis.hold");
      const posStr = pos ? t("analysis.inPosition") : t("analysis.flat");
      let s = `<div style="font-weight:bold">${dateStr}</div>`;
      if (typeof priceVal === "number") s += `<div>${t("analysis.price")}: ${priceVal.toFixed(2)}</div>`;
      if (typeof equityVal === "number") s += `<div>${t("analysis.equity")}: ${equityVal.toFixed(2)}</div>`;
      const posVal = dataIdx >= 0 ? positionValues[dataIdx] : 0;
      if (posVal > 0) s += `<div>${t("analysis.positionValue")}: ${posVal.toFixed(2)}</div>`;
      s += `<div>${action} | ${posStr}</div>`;
      if (trade?.reason) s += `<div style="color:#aaa">${t("analysis.reason")}: ${trade.reason}</div>`;
      return s;
    };

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", snap: true },
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#555",
        textStyle: { color: "#ccc" },
        formatter: fmt,
      },
      legend: {
        data: [t("analysis.price"), t("analysis.equityCurve"), t("analysis.positionValue"), t("analysis.buySignals"), t("analysis.sellSignals")],
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
          markArea: positionAreas.length > 0 ? {
            silent: true,
            itemStyle: { color: "rgba(34, 197, 94, 0.12)" },
            data: positionAreas,
          } : undefined,
        },
        {
          name: t("analysis.equityCurve"),
          type: "line",
          yAxisIndex: 1,
          data: equityValues,
          lineStyle: { color: "#22c55e", width: 2 },
          itemStyle: { color: "#22c55e" },
          symbol: "none",
        },
        {
          name: t("analysis.positionValue"),
          type: "line",
          yAxisIndex: 1,
          data: positionValues,
          lineStyle: { color: "#f97316", width: 1.5 },
          itemStyle: { color: "#f97316" },
          symbol: "none",
        },
        {
          name: t("analysis.buySignals"),
          type: "scatter",
          yAxisIndex: 0,
          data: buyPoints,
          symbol: "triangle",
          symbolSize: 14,
          symbolRotate: 0,
          itemStyle: { color: "#22c55e" },
          label: { show: true, formatter: t("analysis.buySignals"), position: "top", color: "#22c55e", fontSize: 10 },
        },
        {
          name: t("analysis.sellSignals"),
          type: "scatter",
          yAxisIndex: 0,
          data: sellPoints,
          symbol: "triangle",
          symbolSize: 14,
          symbolRotate: 180,
          itemStyle: { color: "#ef4444" },
          label: { show: true, formatter: t("analysis.sellSignals"), position: "bottom", color: "#ef4444", fontSize: 10 },
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
            <div className="backtest-params-content">
              {/* 1. Mode & Run */}
              <div className="backtest-section">
                <div className="backtest-section-title">{t("analysis.sectionMode")}</div>
                <div className="backtest-mode-selector">
                  <button
                    className={`param-btn ${mode === "backtest" ? "primary" : ""}`}
                    onClick={() => setMode("backtest")}
                  >
                    {t("analysis.backtest")}
                  </button>
                  <button
                    className={`param-btn ${mode === "optimization" ? "primary" : ""}`}
                    onClick={() => setMode("optimization")}
                  >
                    {t("analysis.optimization")}
                  </button>
                </div>
                <div className="backtest-run-row">
                  {mode === "backtest" ? (
                    <button onClick={runBacktest} disabled={isRunning} className="param-btn primary">
                      {isRunning ? t("analysis.running") : t("analysis.runBacktest")}
                    </button>
                  ) : (
                    <button onClick={runOptimization} disabled={isRunning} className="param-btn primary">
                      {isRunning ? t("analysis.running") : t("analysis.runOptimization")}
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Capital */}
              <div className="backtest-section">
                <div className="backtest-section-title">{t("analysis.sectionCapital")}</div>
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
                  <label className="param-section-label">{t("analysis.positionSize")}</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      value={positionSizePercent}
                      onChange={(e) => setPositionSizePercent(parseFloat(e.target.value) || 100)}
                      className="param-input"
                    />
                    <span className="unit">%</span>
                  </div>
                </div>
              </div>

              {/* 3. Strategy */}
              <div className="backtest-section">
                <div className="backtest-section-title">{t("analysis.sectionStrategy")}</div>
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
                    <option value="Turtle">{t("analysis.turtleStrategy") || "Turtle Strategy"}</option>
                  </select>
                </div>
                <div className="backtest-strategy-params">
                  {selectedStrategy === "MaCross" && (
                    <div className="backtest-param-row">
                      <div className="param-section">
                        <label className="param-section-label">{t("analysis.maFast")}</label>
                        <input type="number" value={maParams.fast} onChange={(e) => setMaParams({ ...maParams, fast: parseInt(e.target.value) || 5 })} className="param-input" />
                      </div>
                      <div className="param-section">
                        <label className="param-section-label">{t("analysis.maSlow")}</label>
                        <input type="number" value={maParams.slow} onChange={(e) => setMaParams({ ...maParams, slow: parseInt(e.target.value) || 20 })} className="param-input" />
                      </div>
                    </div>
                  )}
                  {selectedStrategy === "Rsi" && (
                    <>
                      <div className="param-section">
                        <label className="param-section-label">{t("analysis.rsiPeriod")}</label>
                        <input type="number" value={rsiParams.period} onChange={(e) => setRsiParams({ ...rsiParams, period: parseInt(e.target.value) || 14 })} className="param-input" />
                      </div>
                      <div className="backtest-param-row">
                        <div className="param-section">
                          <label className="param-section-label">{t("analysis.rsiOversold")}</label>
                          <input type="number" value={rsiParams.oversold} onChange={(e) => setRsiParams({ ...rsiParams, oversold: parseInt(e.target.value) || 30 })} className="param-input" />
                        </div>
                        <div className="param-section">
                          <label className="param-section-label">{t("analysis.rsiOverbought")}</label>
                          <input type="number" value={rsiParams.overbought} onChange={(e) => setRsiParams({ ...rsiParams, overbought: parseInt(e.target.value) || 70 })} className="param-input" />
                        </div>
                      </div>
                    </>
                  )}
                  {selectedStrategy === "Macd" && (
                    <div className="backtest-param-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                      <div className="param-section">
                        <label className="param-section-label">{t("analysis.macdFast")}</label>
                        <input type="number" value={macdParams.fast} onChange={(e) => setMacdParams({ ...macdParams, fast: parseInt(e.target.value) || 12 })} className="param-input" />
                      </div>
                      <div className="param-section">
                        <label className="param-section-label">{t("analysis.macdSlow")}</label>
                        <input type="number" value={macdParams.slow} onChange={(e) => setMacdParams({ ...macdParams, slow: parseInt(e.target.value) || 26 })} className="param-input" />
                      </div>
                      <div className="param-section">
                        <label className="param-section-label">{t("analysis.macdSignal")}</label>
                        <input type="number" value={macdParams.signal} onChange={(e) => setMacdParams({ ...macdParams, signal: parseInt(e.target.value) || 9 })} className="param-input" />
                      </div>
                    </div>
                  )}
                  {selectedStrategy === "Kdj" && (
                    <div className="backtest-param-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                      <div className="param-section">
                        <label className="param-section-label">{t("analysis.kdjPeriod")}</label>
                        <input type="number" value={kdjParams.period} onChange={(e) => setKdjParams({ ...kdjParams, period: parseInt(e.target.value) || 9 })} className="param-input" />
                      </div>
                      <div className="param-section">
                        <label className="param-section-label">K {t("analysis.period")}</label>
                        <input type="number" value={kdjParams.k_period} onChange={(e) => setKdjParams({ ...kdjParams, k_period: parseInt(e.target.value) || 3 })} className="param-input" />
                      </div>
                      <div className="param-section">
                        <label className="param-section-label">D {t("analysis.period")}</label>
                        <input type="number" value={kdjParams.d_period} onChange={(e) => setKdjParams({ ...kdjParams, d_period: parseInt(e.target.value) || 3 })} className="param-input" />
                      </div>
                    </div>
                  )}
                  {selectedStrategy === "Bollinger" && (
                    <div className="backtest-param-row">
                      <div className="param-section">
                        <label className="param-section-label">{t("analysis.period")}</label>
                        <input type="number" value={bbParams.period} onChange={(e) => setBbParams({ ...bbParams, period: parseInt(e.target.value) || 20 })} className="param-input" />
                      </div>
                      <div className="param-section">
                        <label className="param-section-label">{t("analysis.stdDev") || "Std Dev"}</label>
                        <input type="number" step="0.1" value={bbParams.multiplier} onChange={(e) => setBbParams({ ...bbParams, multiplier: parseFloat(e.target.value) || 2.0 })} className="param-input" />
                      </div>
                    </div>
                  )}
                  {selectedStrategy === "Turtle" && (
                    <div className="backtest-param-row">
                      <div className="param-section">
                        <label className="param-section-label">{t("analysis.entryPeriod") || "Entry Period"}</label>
                        <input type="number" value={turtleParams.entry_period} onChange={(e) => setTurtleParams({ ...turtleParams, entry_period: parseInt(e.target.value) || 20 })} className="param-input" />
                      </div>
                      <div className="param-section">
                        <label className="param-section-label">{t("analysis.exitPeriod") || "Exit Period"}</label>
                        <input type="number" value={turtleParams.exit_period} onChange={(e) => setTurtleParams({ ...turtleParams, exit_period: parseInt(e.target.value) || 10 })} className="param-input" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Risk (Optional) */}
              <div className="backtest-section">
                <div className="backtest-section-title">{t("analysis.sectionRisk")}</div>
                <div className="backtest-param-row">
                  <div className="param-section">
                    <label className="param-section-label">{t("analysis.stopLoss")}</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        value={stopLossPercent}
                        onChange={(e) => setStopLossPercent(e.target.value === "" ? "" : parseFloat(e.target.value))}
                        className="param-input"
                        placeholder="—"
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
                        placeholder="—"
                      />
                      <span className="unit">%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Results */}
            {mode === "backtest" && backtestResult && (
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
                        {(backtestResult.total_return_pct ?? 0).toFixed(2)}%
                      </span>
                    </div>
                     <div className="result-cell">
                      <span className="label">{t("analysis.winRate")}</span>
                      <span className="value">{(backtestResult.win_rate ?? 0).toFixed(2)}%</span>
                    </div>
                     <div className="result-cell">
                      <span className="label">{t("analysis.profitFactor")}</span>
                      <span className="value">{(backtestResult.profit_factor === Infinity || backtestResult.profit_factor === null) ? "∞" : (backtestResult.profit_factor ?? 0).toFixed(2)}</span>
                    </div>
                     <div className="result-cell">
                      <span className="label">{t("analysis.maxDrawdown")}</span>
                      <span className="value negative">{(backtestResult.max_drawdown_pct ?? 0).toFixed(2)}%</span>
                    </div>
                    <div className="result-cell">
                      <span className="label">{t("analysis.sharpeRatio") || "Sharpe"}</span>
                      <span className="value">{(backtestResult.sharpe_ratio ?? 0).toFixed(2)}</span>
                    </div>
                     <div className="result-cell">
                      <span className="label">{t("analysis.sortinoRatio") || "Sortino"}</span>
                      <span className="value">{(backtestResult.sortino_ratio ?? 0).toFixed(2)}</span>
                    </div>
                     <div className="result-cell">
                      <span className="label">{t("analysis.totalTrades")}</span>
                      <span className="value">{backtestResult.total_trades}</span>
                    </div>
                 </div>
              </div>
            )}
            {/* Optimization Results */}
            {mode === "optimization" && optimizationResults.length > 0 && (
              <div className="backtest-results">
                <div className="result-title">{t("analysis.optimizationResults") || "Optimization Results (Top 20)"}</div>
                <div className="optimization-list" style={{ maxHeight: "400px", overflowY: "auto" }}>
                  {optimizationResults.map((res, index) => (
                    <div key={index} className="result-item" style={{ marginBottom: "8px", padding: "8px", background: "#333", borderRadius: "4px" }}>
                      <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px" }}>{res.params}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontSize: "12px" }}>
                        <div>Return: <span className={res.total_return_pct >= 0 ? "positive" : "negative"}>{(res.total_return_pct ?? 0).toFixed(2)}%</span></div>
                        <div>Sharpe: {(res.sharpe_ratio ?? 0).toFixed(2)}</div>
                        <div>Drawdown: <span className="negative">{(res.max_drawdown_pct ?? 0).toFixed(2)}%</span></div>
                        <div>Win Rate: {(res.win_rate ?? 0).toFixed(1)}%</div>
                      </div>
                    </div>
                  ))}
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
             {mode === "optimization" ? (
               <div className="no-data" style={{display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px", color: "#aaa"}}>
                 <p>{t("analysis.optimizationHint") || "Select a strategy and click 'Run Optimization' to find the best parameters."}</p>
                 <p>{t("analysis.optimizationDesc") || "The system will test various parameter combinations and show the top performing sets based on Sharpe Ratio."}</p>
               </div>
             ) : Object.keys(chartOption).length === 0 ? (
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
