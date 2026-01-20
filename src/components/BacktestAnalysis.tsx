import React, { useState, useMemo, useRef, useEffect } from "react";
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
}

interface BacktestResult {
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  totalReturnPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  equityCurve: Array<{ date: string; value: number }>;
  trades: Trade[];
}

type StrategyType = "ma_cross" | "rsi" | "macd_rsi" | "custom";

const BacktestAnalysis: React.FC<BacktestAnalysisProps> = ({ klineData }) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const backtestDefaults = getBacktestParams();
  const [strategyType, setStrategyType] = useState<StrategyType>("ma_cross");
  const [initialCapital, setInitialCapital] = useState(backtestDefaults.initialCapital);
  const [commissionRate, setCommissionRate] = useState(getDefaultCommissionRate());

  useEffect(() => {
    setCommissionRate(getDefaultCommissionRate());
    const defaults = getBacktestParams();
    setInitialCapital(defaults.initialCapital);
    setMaFast(defaults.maFast);
    setMaSlow(defaults.maSlow);
    setRsiOverbought(defaults.rsiOverbought);
    setRsiOversold(defaults.rsiOversold);
    setStopLossPercent(defaults.stopLossPercent);
    setTakeProfitPercent(defaults.takeProfitPercent);
    setPositionSizePercent(defaults.positionSizePercent);
    setVolumeMultiplier(defaults.volumeMultiplier);
  }, []);
  const [maFast, setMaFast] = useState(backtestDefaults.maFast);
  const [maSlow, setMaSlow] = useState(backtestDefaults.maSlow);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiOverbought, setRsiOverbought] = useState(backtestDefaults.rsiOverbought);
  const [rsiOversold, setRsiOversold] = useState(backtestDefaults.rsiOversold);
  const [stopLossPercent, setStopLossPercent] = useState(backtestDefaults.stopLossPercent);
  const [takeProfitPercent, setTakeProfitPercent] = useState(backtestDefaults.takeProfitPercent);
  const [positionSizePercent, setPositionSizePercent] = useState(backtestDefaults.positionSizePercent);
  const [useVolumeConfirmation, setUseVolumeConfirmation] = useState(true);
  const [volumeMultiplier, setVolumeMultiplier] = useState(backtestDefaults.volumeMultiplier);
  const [_customBuyCondition, _setCustomBuyCondition] = useState("");
  const [_customSellCondition, _setCustomSellCondition] = useState("");
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  const chartRef = useRef<ReactECharts>(null);

  // Calculate SMA
  const calculateSMA = (data: number[], period: number): (number | null)[] => {
    const result: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else {
        const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
      }
    }
    return result;
  };

  // Calculate RSI
  const calculateRSI = (closes: number[], period: number): (number | null)[] => {
    const result: (number | null)[] = [];
    for (let i = 0; i < period; i++) {
      result.push(null);
    }

    let gains = 0;
    let losses = 0;

    for (let i = 1; i < period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    for (let i = period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains = (gains * (period - 1) + change) / period;
      else losses = (losses * (period - 1) + Math.abs(change)) / period;

      if (losses === 0) {
        result.push(100);
      } else {
        const rs = gains / losses;
        result.push(100 - (100 / (1 + rs)));
      }
    }

    return result;
  };

  // Calculate EMA
  const calculateEMA = (data: number[], period: number): (number | null)[] => {
    const result: (number | null)[] = [];
    const multiplier = 2 / (period + 1);
    
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else if (i === period - 1) {
        const sum = data.slice(0, period).reduce((a, b) => a + b, 0);
        result.push(sum / period);
      } else {
        const ema = (data[i] - result[i - 1]!) * multiplier + result[i - 1]!;
        result.push(ema);
      }
    }
    
    return result;
  };

  // Calculate MACD
  const calculateMACD = (closes: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) => {
    const ema12 = calculateEMA(closes, fastPeriod);
    const ema26 = calculateEMA(closes, slowPeriod);
    
    const macdLine: (number | null)[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (ema12[i] !== null && ema26[i] !== null) {
        macdLine.push(ema12[i]! - ema26[i]!);
      } else {
        macdLine.push(null);
      }
    }
    
    const macdValues = macdLine.filter((v): v is number => v !== null);
    const signalLine = calculateEMA(macdValues, signalPeriod);
    
    return { macdLine, signalLine };
  };

  // Calculate average volume
  const calculateAvgVolume = (volumes: number[], period: number): number[] => {
    const result: number[] = [];
    for (let i = 0; i < volumes.length; i++) {
      if (i < period - 1) {
        result.push(volumes[i]);
      } else {
        const sum = volumes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
      }
    }
    return result;
  };

  // Run backtest
  const runBacktest = () => {
    if (klineData.length < 50) {
      showAlert(t("analysis.insufficientData"));
      return;
    }

    setIsRunning(true);
    setTimeout(() => {
      try {
        const closes = klineData.map((d) => d.close);
        const dates = klineData.map((d) => d.date);
        const volumes = klineData.map((d) => d.volume);
        let positions: number = 0;
        let entryPrice: number = 0;
        let cash: number = initialCapital;
        let equity = initialCapital;
        const trades: Trade[] = [];
        const equityCurve: Array<{ date: string; value: number }> = [];

        let fastMA: (number | null)[] = [];
        let slowMA: (number | null)[] = [];
        let rsi: (number | null)[] = [];
        let macd: { macdLine: (number | null)[]; signalLine: (number | null)[] } | null = null;
        let avgVolumes: number[] = [];

        if (strategyType === "ma_cross") {
          fastMA = calculateSMA(closes, maFast);
          slowMA = calculateSMA(closes, maSlow);
        } else if (strategyType === "rsi") {
          rsi = calculateRSI(closes, rsiPeriod);
        } else if (strategyType === "macd_rsi") {
          rsi = calculateRSI(closes, rsiPeriod);
          macd = calculateMACD(closes);
        }

        if (useVolumeConfirmation) {
          avgVolumes = calculateAvgVolume(volumes, 20);
        }

        for (let i = 1; i < klineData.length; i++) {
          const currentPrice = closes[i];
          const currentVolume = volumes[i];
          const avgVolume = avgVolumes[i] || currentVolume;
          const volumeConfirm = !useVolumeConfirmation || currentVolume >= avgVolume * volumeMultiplier;
          
          let buySignal = false;
          let sellSignal = false;

          // Check stop loss and take profit
          if (positions > 0 && entryPrice > 0) {
            const priceChange = ((currentPrice - entryPrice) / entryPrice) * 100;
            if (priceChange <= -stopLossPercent) {
              sellSignal = true;
            } else if (priceChange >= takeProfitPercent) {
              sellSignal = true;
            }
          }

          // Determine signals based on strategy
          if (!sellSignal && strategyType === "ma_cross") {
            if (i > 0 && fastMA[i] !== null && slowMA[i] !== null && fastMA[i - 1] !== null && slowMA[i - 1] !== null) {
              const fastCrossAbove = fastMA[i]! > slowMA[i]! && fastMA[i - 1]! <= slowMA[i - 1]!;
              const fastCrossBelow = fastMA[i]! < slowMA[i]! && fastMA[i - 1]! >= slowMA[i - 1]!;
              buySignal = fastCrossAbove && positions === 0 && volumeConfirm;
              sellSignal = sellSignal || (fastCrossBelow && positions > 0);
            }
          } else if (!sellSignal && strategyType === "rsi") {
            if (i > 0 && rsi[i] !== null && rsi[i - 1] !== null) {
              const rsiValue = rsi[i]!;
              const prevRsiValue = rsi[i - 1]!;
              // Improved RSI strategy: consider RSI trend and middle zone
              const rsiRising = rsiValue > prevRsiValue;
              const rsiFalling = rsiValue < prevRsiValue;
              
              // Buy: RSI oversold and starting to rise, or RSI crossing above 30 from below
              buySignal = (rsiValue < rsiOversold && rsiRising && positions === 0) ||
                         (rsiValue >= 30 && prevRsiValue < 30 && positions === 0);
              buySignal = buySignal && volumeConfirm;
              
              // Sell: RSI overbought and starting to fall, or RSI crossing below 70 from above
              sellSignal = sellSignal || (rsiValue > rsiOverbought && rsiFalling && positions > 0) ||
                          (rsiValue <= 70 && prevRsiValue > 70 && positions > 0);
            }
          } else if (!sellSignal && strategyType === "macd_rsi") {
            if (macd && i > 0 && rsi[i] !== null && rsi[i - 1] !== null && 
                macd.macdLine[i] !== null && macd.signalLine[i] !== null &&
                macd.macdLine[i - 1] !== null && macd.signalLine[i - 1] !== null) {
              const rsiValue = rsi[i]!;
              const macdValue = macd.macdLine[i]!;
              const signalValue = macd.signalLine[i]!;
              const prevMacd = macd.macdLine[i - 1]!;
              const prevSignal = macd.signalLine[i - 1]!;
              
              // MACD golden cross (MACD crosses above signal)
              const macdGoldenCross = macdValue > signalValue && prevMacd <= prevSignal;
              // MACD death cross (MACD crosses below signal)
              const macdDeathCross = macdValue < signalValue && prevMacd >= prevSignal;
              
              // Buy: MACD golden cross + RSI not overbought
              buySignal = macdGoldenCross && rsiValue < rsiOverbought && positions === 0 && volumeConfirm;
              
              // Sell: MACD death cross + RSI not oversold, or RSI overbought
              sellSignal = sellSignal || (macdDeathCross && rsiValue > rsiOversold && positions > 0) ||
                          (rsiValue > rsiOverbought && positions > 0);
            }
          }

          // Execute trades
          if (buySignal && cash > 0) {
            const availableCash = cash * (positionSizePercent / 100);
            const quantity = Math.floor(availableCash / (currentPrice * (1 + commissionRate)));
            if (quantity > 0) {
              const cost = quantity * currentPrice * (1 + commissionRate);
              cash -= cost;
              positions += quantity;
              entryPrice = currentPrice;
              trades.push({ date: dates[i], price: currentPrice, type: "buy", quantity });
            }
          }

          if (sellSignal && positions > 0) {
            const proceeds = positions * currentPrice * (1 - commissionRate);
            cash += proceeds;
            trades.push({ 
              date: dates[i], 
              price: currentPrice, 
              type: "sell", 
              quantity: positions 
            });
            positions = 0;
            entryPrice = 0;
          }

          // Update equity
          equity = cash + positions * currentPrice;
          equityCurve.push({ date: dates[i], value: equity });
        }

        // Calculate final metrics
        const finalCapital = equity;
        const totalReturn = finalCapital - initialCapital;
        const totalReturnPercent = (totalReturn / initialCapital) * 100;

        // Calculate max drawdown
        let maxDrawdown = 0;
        let maxDrawdownPercent = 0;
        let peak = initialCapital;
        for (const point of equityCurve) {
          if (point.value > peak) peak = point.value;
          const drawdown = peak - point.value;
          const drawdownPercent = (drawdown / peak) * 100;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
          if (drawdownPercent > maxDrawdownPercent) maxDrawdownPercent = drawdownPercent;
        }

        // Calculate trade statistics
        const buyTrades = trades.filter((t) => t.type === "buy");
        const sellTrades = trades.filter((t) => t.type === "sell");
        let winningTrades = 0;
        let losingTrades = 0;
        let totalWin = 0;
        let totalLoss = 0;

        for (let i = 0; i < Math.min(buyTrades.length, sellTrades.length); i++) {
          const buyTrade = buyTrades[i];
          const sellTrade = sellTrades[i];
          const profit = (sellTrade.price - buyTrade.price) * buyTrade.quantity;
          if (profit > 0) {
            winningTrades++;
            totalWin += profit;
          } else {
            losingTrades++;
            totalLoss += Math.abs(profit);
          }
        }

        const totalTrades = winningTrades + losingTrades;
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
        const avgWin = winningTrades > 0 ? totalWin / winningTrades : 0;
        const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;
        const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0;

        setBacktestResult({
          initialCapital,
          finalCapital,
          totalReturn,
          totalReturnPercent,
          maxDrawdown,
          maxDrawdownPercent,
          totalTrades,
          winningTrades,
          losingTrades,
          winRate,
          avgWin,
          avgLoss,
          profitFactor,
          equityCurve,
          trades,
        });
      } catch (error) {
        console.error("Backtest error:", error);
        showAlert(t("analysis.backtestError"));
      } finally {
        setIsRunning(false);
      }
    }, 100);
  };

  const chartOption = useMemo(() => {
    if (!backtestResult || klineData.length === 0) return {};

    // Sort klineData by date (old to new, left to right)
    const sortedKlineData = [...klineData].sort((a, b) => {
      const dateA = a.date.includes(" ") ? a.date.split(" ")[0] : a.date;
      const dateB = b.date.includes(" ") ? b.date.split(" ")[0] : b.date;
      return dateA.localeCompare(dateB);
    });

    const dates = sortedKlineData.map((d) => {
      const dateStr = d.date;
      return dateStr.includes(" ") ? dateStr.split(" ")[0] : dateStr;
    });

    const closes = sortedKlineData.map((d) => d.close);
    
    // Create a map of date to equity value for efficient lookup
    const equityMap = new Map<string, number>();
    backtestResult.equityCurve.forEach((p) => {
      const dateKey = p.date.includes(" ") ? p.date.split(" ")[0] : p.date;
      equityMap.set(dateKey, p.value);
    });
    
    // Map equity values to match sorted dates (keep null to maintain index alignment)
    const equityValues = dates.map((date) => {
      return equityMap.get(date) ?? null;
    });
    const buyPoints = backtestResult.trades
      .filter((t) => t.type === "buy")
      .map((t) => {
        const index = dates.findIndex((d) => d === t.date.split(" ")[0]);
        return index >= 0 ? [index, t.price] : null;
      })
      .filter((p) => p !== null) as number[][];

    const sellPoints = backtestResult.trades
      .filter((t) => t.type === "sell")
      .map((t) => {
        const index = dates.findIndex((d) => d === t.date.split(" ")[0]);
        return index >= 0 ? [index, t.price] : null;
      })
      .filter((p) => p !== null) as number[][];

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#555",
        textStyle: { color: "#ccc" },
      },
      legend: {
        data: [t("analysis.price"), t("analysis.equityCurve")],
        textStyle: { color: "#858585", fontSize: 10 },
        top: 0,
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "3%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: { color: "#858585", fontSize: 9 },
      },
      yAxis: [
        {
          type: "value",
          name: t("analysis.price"),
          axisLabel: { color: "#858585", fontSize: 9 },
          splitLine: { lineStyle: { color: "rgba(133, 133, 133, 0.15)" } },
        },
        {
          type: "value",
          name: t("analysis.equity"),
          axisLabel: { color: "#858585", fontSize: 9 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: t("analysis.price"),
          type: "line",
          data: closes,
          lineStyle: { color: "#007acc", width: 2 },
          itemStyle: { color: "#007acc" },
        },
        {
          name: t("analysis.equityCurve"),
          type: "line",
          yAxisIndex: 1,
          data: equityValues,
          lineStyle: { color: "#00ff00", width: 2 },
          itemStyle: { color: "#00ff00" },
        },
        {
          name: t("analysis.buySignals"),
          type: "scatter",
          data: buyPoints,
          symbolSize: 10,
          itemStyle: { color: "#00ff00" },
        },
        {
          name: t("analysis.sellSignals"),
          type: "scatter",
          data: sellPoints,
          symbolSize: 10,
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
            <div className="param-section">
              <label className="param-section-label">{t("analysis.initialCapital")}</label>
              <input
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(parseFloat(e.target.value) || 100000)}
                className="param-input"
                min={1000}
                step={10000}
              />
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.commissionRate")}</label>
              <input
                type="number"
                value={commissionRate}
                onChange={(e) => setCommissionRate(parseFloat(e.target.value) || 0.001)}
                className="param-input"
                min={0}
                max={0.01}
                step={0.0001}
              />
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.strategy")}</label>
              <select
                value={strategyType}
                onChange={(e) => setStrategyType(e.target.value as StrategyType)}
                className="param-select"
              >
                <option value="ma_cross">{t("analysis.maCross")}</option>
                <option value="rsi">{t("analysis.rsiStrategy")}</option>
                <option value="macd_rsi">{t("analysis.macdRsiComposite")}</option>
                <option value="custom">{t("analysis.customStrategy")}</option>
              </select>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.stopLoss")}</label>
              <input
                type="number"
                value={stopLossPercent}
                onChange={(e) => setStopLossPercent(parseFloat(e.target.value) || 5)}
                className="param-input"
                min={0}
                max={20}
                step={0.5}
              />
              <span className="param-unit">%</span>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.takeProfit")}</label>
              <input
                type="number"
                value={takeProfitPercent}
                onChange={(e) => setTakeProfitPercent(parseFloat(e.target.value) || 10)}
                className="param-input"
                min={0}
                max={50}
                step={1}
              />
              <span className="param-unit">%</span>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.positionSize")}</label>
              <input
                type="number"
                value={positionSizePercent}
                onChange={(e) => setPositionSizePercent(parseFloat(e.target.value) || 100)}
                className="param-input"
                min={10}
                max={100}
                step={10}
              />
              <span className="param-unit">%</span>
            </div>
            <div className="param-section">
              <label className="param-section-label">
                <input
                  type="checkbox"
                  checked={useVolumeConfirmation}
                  onChange={(e) => setUseVolumeConfirmation(e.target.checked)}
                  className="param-checkbox"
                />
                {t("analysis.useVolumeConfirmation")}
              </label>
            </div>
            {useVolumeConfirmation && (
              <div className="param-section">
                <label className="param-section-label">{t("analysis.volumeMultiplier")}</label>
                <input
                  type="number"
                  value={volumeMultiplier}
                  onChange={(e) => setVolumeMultiplier(parseFloat(e.target.value) || 1.2)}
                  className="param-input"
                  min={1.0}
                  max={3.0}
                  step={0.1}
                />
              </div>
            )}
            {strategyType === "ma_cross" && (
              <>
                <div className="param-section">
                  <label className="param-section-label">{t("analysis.maFast")}</label>
                  <input
                    type="number"
                    value={maFast}
                    onChange={(e) => setMaFast(parseInt(e.target.value) || 5)}
                    className="param-input"
                    min={1}
                    max={100}
                  />
                </div>
                <div className="param-section">
                  <label className="param-section-label">{t("analysis.maSlow")}</label>
                  <input
                    type="number"
                    value={maSlow}
                    onChange={(e) => setMaSlow(parseInt(e.target.value) || 20)}
                    className="param-input"
                    min={1}
                    max={200}
                  />
                </div>
              </>
            )}
            {strategyType === "rsi" && (
              <>
                <div className="param-section">
                  <label className="param-section-label">{t("analysis.rsiPeriod")}</label>
                  <input
                    type="number"
                    value={rsiPeriod}
                    onChange={(e) => setRsiPeriod(parseInt(e.target.value) || 14)}
                    className="param-input"
                    min={1}
                    max={50}
                  />
                </div>
                <div className="param-section">
                  <label className="param-section-label">{t("analysis.rsiOversold")}</label>
                  <input
                    type="number"
                    value={rsiOversold}
                    onChange={(e) => setRsiOversold(parseInt(e.target.value) || 30)}
                    className="param-input"
                    min={0}
                    max={50}
                  />
                </div>
                <div className="param-section">
                  <label className="param-section-label">{t("analysis.rsiOverbought")}</label>
                  <input
                    type="number"
                    value={rsiOverbought}
                    onChange={(e) => setRsiOverbought(parseInt(e.target.value) || 70)}
                    className="param-input"
                    min={50}
                    max={100}
                  />
                </div>
              </>
            )}
            <div className="param-section">
              <button
                onClick={runBacktest}
                disabled={isRunning}
                className="param-btn primary"
              >
                {isRunning ? t("analysis.running") : t("analysis.runBacktest")}
              </button>
            </div>
            {backtestResult && (
              <div className="param-section">
                <div className="backtest-results">
                  <div className="result-title">{t("analysis.backtestResults")}</div>
                  <div className="result-item">
                    <span className="result-label">{t("analysis.totalReturn")}:</span>
                    <span className={`result-value ${backtestResult.totalReturn >= 0 ? "positive" : "negative"}`}>
                      {backtestResult.totalReturnPercent.toFixed(2)}%
                    </span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">{t("analysis.maxDrawdown")}:</span>
                    <span className="result-value negative">
                      {backtestResult.maxDrawdownPercent.toFixed(2)}%
                    </span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">{t("analysis.winRate")}:</span>
                    <span className="result-value">{backtestResult.winRate.toFixed(2)}%</span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">{t("analysis.totalTrades")}:</span>
                    <span className="result-value">{backtestResult.totalTrades}</span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">{t("analysis.profitFactor")}:</span>
                    <span className="result-value">
                      {backtestResult.profitFactor === Infinity ? "∞" : backtestResult.profitFactor.toFixed(2)}
                    </span>
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
            <button
              className="chart-zoom-button-overlay"
              onClick={() => setIsChartDialogOpen(true)}
              title={t("chart.zoom")}
            >
              ZO
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
