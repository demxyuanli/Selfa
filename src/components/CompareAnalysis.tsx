import React, { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import ChartDialog from "./ChartDialog";
import Icon from "./Icon";
import "./StockAnalysis.css";
import "./CompareAnalysis.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CompareAnalysisProps {
  currentSymbol: string;
  currentData: StockData[];
  currentName?: string;
}

interface CompareStock {
  symbol: string;
  name: string;
  data: StockData[];
}

const CompareAnalysis: React.FC<CompareAnalysisProps> = ({ currentSymbol, currentData, currentName }) => {
  const { t } = useTranslation();
  const [compareStocks, setCompareStocks] = useState<CompareStock[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ symbol: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [normalizeMode, setNormalizeMode] = useState<"price" | "percent">("percent");
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  const chartRef = useRef<ReactECharts>(null);

  useEffect(() => {
    if (currentData.length > 0 && currentSymbol) {
      // If currentName is not provided, try to get it from search results or fetch from API
      const getName = async () => {
        if (currentName) {
          return currentName;
        }
        // Try to fetch stock name from API if not provided
        try {
          const results: Array<{ symbol: string; name: string }> = await invoke("search_stocks", {
            query: currentSymbol,
          });
          const found = results.find(r => r.symbol === currentSymbol);
          return found?.name || currentSymbol;
        } catch {
          return currentSymbol;
        }
      };

      getName().then(name => {
        setCompareStocks([{
          symbol: currentSymbol,
          name: name || currentSymbol,
          data: currentData,
        }]);
      });
    }
  }, [currentSymbol, currentData, currentName]);

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

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const results: Array<{ symbol: string; name: string }> = await invoke("search_stocks", {
        query: searchQuery,
      });
      setSearchResults(results.slice(0, 10));
    } catch (err) {
      console.error("Error searching stocks:", err);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStock = async (symbol: string, name: string) => {
    if (compareStocks.find(s => s.symbol === symbol)) {
      return;
    }

    setLoading(true);
    try {
      const history: StockData[] = await invoke("get_stock_history", {
        symbol: symbol,
        period: "1mo",
      });
      
      if (history.length > 0) {
        setCompareStocks([...compareStocks, { symbol, name, data: history }]);
      }
      setSearchQuery("");
      setSearchResults([]);
    } catch (err) {
      console.error("Error loading stock:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveStock = (symbol: string) => {
    setCompareStocks(compareStocks.filter(s => s.symbol !== symbol));
  };

  const chartOption = useMemo(() => {
    if (compareStocks.length === 0) {
      return {};
    }

    const series: any[] = [];
    
    // Find the shortest data length (the stock with shortest history)
    const minLength = Math.min(...compareStocks.map(stock => stock.data.length));
    if (minLength === 0) {
      return {};
    }
    
    // Find the stock with shortest history to determine the starting date
    const shortestStock = compareStocks.find(stock => stock.data.length === minLength) || compareStocks[0];
    const shortestStartDate = shortestStock.data[0].date.includes(" ") 
      ? shortestStock.data[0].date.split(" ")[0] 
      : shortestStock.data[0].date;
    
    // Align all stocks from the shortest stock's starting date
    const alignedStocks = compareStocks.map(stock => {
      // Find the index where this stock's date matches or is closest to the shortest start date
      let startIdx = 0;
      for (let i = 0; i < stock.data.length; i++) {
        const stockDate = stock.data[i].date.includes(" ") 
          ? stock.data[i].date.split(" ")[0] 
          : stock.data[i].date;
        if (stockDate >= shortestStartDate) {
          startIdx = i;
          break;
        }
      }
      
      // Take exactly minLength data points from startIdx to ensure all have same length
      // If not enough data available, take from startIdx to end
      const endIdx = Math.min(startIdx + minLength, stock.data.length);
      
      return {
        ...stock,
        alignedData: stock.data.slice(startIdx, endIdx),
      };
    });
    
    // Ensure all aligned stocks have exactly the same length
    // Use the minimum available length to ensure all stocks can provide that many data points
    const alignedMinLength = Math.min(...alignedStocks.map(s => s.alignedData.length));
    const finalAlignedStocks = alignedStocks.map(stock => ({
      ...stock,
      alignedData: stock.alignedData.slice(0, alignedMinLength), // Take the first alignedMinLength points from aligned start
    }));

    // Extract dates from aligned data (all should have same length now)
    const dates = finalAlignedStocks[0].alignedData.map(d => {
      const dateStr = d.date;
      return dateStr.includes(" ") ? dateStr.split(" ")[0] : dateStr;
    });

    finalAlignedStocks.forEach((stock, idx) => {
      const closes = stock.alignedData.map(d => d.close);
      const firstClose = closes[0];
      
      let data: number[];
      if (normalizeMode === "percent") {
        data = closes.map(c => ((c - firstClose) / firstClose) * 100);
      } else {
        data = closes;
      }

      const colors = ["#007acc", "#00ff00", "#ff9800", "#9c27b0", "#ff0000", "#00bcd4"];
      series.push({
        name: `${stock.symbol} ${stock.name}`,
        type: "line",
        data: data,
        symbol: "none",
        lineStyle: {
          color: colors[idx % colors.length],
          width: 1.5,
        },
        smooth: true,
      });
    });

    // Find best and worst performers using aligned data
    let bestStock = finalAlignedStocks[0];
    let worstStock = finalAlignedStocks[0];
    if (normalizeMode === "percent") {
      finalAlignedStocks.forEach((stock) => {
        const closes = stock.alignedData.map(d => d.close);
        const firstClose = closes[0];
        const lastClose = closes[closes.length - 1];
        const change = ((lastClose - firstClose) / firstClose) * 100;
        const bestCloses = bestStock.alignedData.map(d => d.close);
        const bestFirstClose = bestCloses[0];
        const bestLastClose = bestCloses[bestCloses.length - 1];
        const bestChange = ((bestLastClose - bestFirstClose) / bestFirstClose) * 100;
        const worstCloses = worstStock.alignedData.map(d => d.close);
        const worstFirstClose = worstCloses[0];
        const worstLastClose = worstCloses[worstCloses.length - 1];
        const worstChange = ((worstLastClose - worstFirstClose) / worstFirstClose) * 100;
        if (change > bestChange) bestStock = stock;
        if (change < worstChange) worstStock = stock;
      });
    }

    return {
      backgroundColor: "transparent",
      grid: {
        left: "8%",
        right: "3%",
        top: "16%",
        bottom: "10%",
      },
      graphic: [
        {
          type: "text",
          left: "center",
          top: "1%",
          style: {
            text: `${t("analysis.comparisonMode")}: ${normalizeMode === "percent" ? t("analysis.normalizePercent") : t("analysis.normalizePrice")} | ${t("analysis.comparedStocks")}: ${compareStocks.length}`,
            fontSize: 10,
            fontWeight: "bold",
            fill: "#858585",
          },
        },
      ],
      xAxis: {
        type: "category",
        data: dates,
        scale: true,
        boundaryGap: false,
        axisLabel: {
          color: "#858585",
          fontSize: 9,
        },
        splitLine: {
          show: false,
        },
        axisPointer: {
          snap: true,
        },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisPointer: {
          snap: true,
        },
        axisLabel: {
          color: "#858585",
          fontSize: 9,
          formatter: normalizeMode === "percent" ? (value: number) => `${value.toFixed(1)}%` : undefined,
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: "rgba(133, 133, 133, 0.15)",
            type: "dashed",
            width: 1,
          },
        },
      },
      series: series.map((s, idx) => {
        const stock = finalAlignedStocks[idx];
        const isBest = stock.symbol === bestStock.symbol && normalizeMode === "percent";
        const isWorst = stock.symbol === worstStock.symbol && normalizeMode === "percent";
        return {
          ...s,
          markPoint: isBest || isWorst ? {
            data: [
              {
                name: isBest ? t("analysis.best") : t("analysis.worst"),
                coord: [dates.length - 1, s.data[s.data.length - 1]],
                symbol: "pin",
                symbolSize: 30,
                itemStyle: {
                  color: isBest ? "#00ff00" : "#ff0000",
                },
                label: {
                  show: true,
                  formatter: isBest ? t("analysis.best") : t("analysis.worst"),
                  fontSize: 9,
                  color: isBest ? "#00ff00" : "#ff0000",
                },
              },
            ],
          } : undefined,
        };
      }),
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          snap: true,
        },
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#555",
        borderWidth: 1,
        textStyle: {
          color: "#ccc",
          fontSize: 10,
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return "";
          const param = params[0];
          let result = `<div style="margin-bottom: 4px;"><strong>${param.axisValue}</strong></div>`;
          
          params.forEach((p: any) => {
            if (p.value !== null && p.value !== undefined) {
              const value = typeof p.value === "number" 
                ? (normalizeMode === "percent" ? `${p.value.toFixed(2)}%` : p.value.toFixed(2))
                : p.value;
              result += `<div style="margin: 2px 0;">
                <span style="display:inline-block;width:8px;height:8px;background:${p.color};border-radius:50%;margin-right:4px;"></span>
                ${p.seriesName}: <strong>${value}</strong>
              </div>`;
            }
          });
          
          // Add comparison info
          if (normalizeMode === "percent" && params.length > 1) {
            const values = params.map((p: any) => p.value).filter((v: any) => v != null);
            if (values.length > 1) {
              const maxVal = Math.max(...values);
              const minVal = Math.min(...values);
              const diff = maxVal - minVal;
              result += `<div style="margin-top: 6px;padding-top: 6px;border-top: 1px solid #555;">
                <div>${t("analysis.difference")}: ${diff.toFixed(2)}%</div>
                <div>${t("analysis.best")}: ${maxVal.toFixed(2)}% | ${t("analysis.worst")}: ${minVal.toFixed(2)}%</div>
              </div>`;
            }
          }
          
          return result;
        },
      },
      legend: {
        data: finalAlignedStocks.map(s => `${s.symbol} ${s.name}`),
        textStyle: {
          color: "#858585",
          fontSize: 8,
        },
        itemWidth: 8,
        itemHeight: 8,
        top: 0,
      },
    };
  }, [compareStocks, normalizeMode, t]);

  const calculateStats = (data: StockData[]) => {
    if (data.length === 0) return null;
    
    const closes = data.map(d => d.close);
    const firstClose = closes[0];
    const lastClose = closes[closes.length - 1];
    const change = ((lastClose - firstClose) / firstClose) * 100;
    const maxClose = Math.max(...closes);
    const minClose = Math.min(...closes);
    const volatility = Math.sqrt(
      closes.slice(1).reduce((sum, c, i) => {
        const ret = (c - closes[i]) / closes[i];
        return sum + ret * ret;
      }, 0) / (closes.length - 1)
    ) * 100;

    return {
      change: change.toFixed(2),
      max: maxClose.toFixed(2),
      min: minClose.toFixed(2),
      volatility: volatility.toFixed(2),
    };
  };

  return (
    <div className="compare-analysis">
      <div className="analysis-columns">
        {/* Left Column: Stock Selection */}
        <div className="analysis-column params-column">
          <div className="column-header">{t("analysis.compare")}</div>
          <div className="params-content">
            <div className="param-section">
              <label className="param-section-label">{t("analysis.compareSearch")}</label>
              <div className="search-box">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder={t("app.search")}
                  className="search-input"
                />
                <button onClick={handleSearch} disabled={loading} className="search-btn">
                  {loading ? "..." : t("sidebar.search")}
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults.map((result) => (
                    <div
                      key={result.symbol}
                      className="search-result-item"
                      onClick={() => handleAddStock(result.symbol, result.name)}
                    >
                      <span className="result-symbol">{result.symbol}</span>
                      <span className="result-name">{result.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.compareNormalize")}</label>
              <div className="param-inputs">
                <div className="param-item">
                  <select
                    value={normalizeMode}
                    onChange={(e) => setNormalizeMode(e.target.value as "price" | "percent")}
                    className="param-select"
                  >
                    <option value="percent">{t("analysis.normalizePercent")}</option>
                    <option value="price">{t("analysis.normalizePrice")}</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.comparedStocks")}</label>
              <div className="stock-list">
                {compareStocks.map((stock) => (
                  <div key={stock.symbol} className="stock-item">
                    <div className="stock-label-wrapper">
                      <span className="stock-label">{stock.symbol}</span>
                      {stock.name && <span className="stock-name-label">{stock.name}</span>}
                    </div>
                    {compareStocks.length > 1 && (
                      <button
                        className="remove-btn"
                        onClick={() => handleRemoveStock(stock.symbol)}
                      >
                        <Icon name="delete" size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="column-divider" />

        {/* Middle Column: Statistics (40% fixed) */}
        <div className="analysis-column results-column">
          <div className="column-header">{t("analysis.statistics")}</div>
          <div className="results-content">
            {compareStocks.length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <div className="compare-stats-list">
                {compareStocks.map((stock) => {
                  const stats = calculateStats(stock.data);
                  if (!stats) return null;
                  
                  return (
                    <div key={stock.symbol} className="compare-stats-card">
                      <div className="stats-header">
                        <span className="stats-symbol">{stock.symbol}</span>
                        {stock.name && <span className="stats-name">{stock.name}</span>}
                      </div>
                      <div className="stats-row">
                        <span className="stats-label">{t("analysis.change")}:</span>
                        <span className={`stats-value ${parseFloat(stats.change) >= 0 ? "positive" : "negative"}`}>
                          {parseFloat(stats.change) >= 0 ? "+" : ""}{stats.change}%
                        </span>
                      </div>
                      <div className="stats-row">
                        <span className="stats-label">{t("analysis.high")}:</span>
                        <span className="stats-value">{stats.max}</span>
                      </div>
                      <div className="stats-row">
                        <span className="stats-label">{t("analysis.low")}:</span>
                        <span className="stats-value">{stats.min}</span>
                      </div>
                      <div className="stats-row">
                        <span className="stats-label">{t("analysis.volatility")}:</span>
                        <span className="stats-value">{stats.volatility}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="column-divider" />

        {/* Right Column: Chart */}
        <div className="analysis-column chart-column">
          <div className="column-header">
            <span>{t("analysis.chart")}</span>
          </div>
          <div className="chart-content">
            {Object.keys(chartOption).length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <>
                <button
                  className="chart-zoom-button-overlay"
                  onClick={() => setIsChartDialogOpen(true)}
                  title={t("chart.zoom")}
                >
                  ZO
                </button>
                <ReactECharts
                  ref={chartRef}
                  option={chartOption}
                  style={{ height: "100%", width: "100%" }}
                  opts={{ renderer: "canvas" }}
                />
              </>
            )}
          </div>
        </div>
      </div>
      <ChartDialog
        isOpen={isChartDialogOpen}
        onClose={() => setIsChartDialogOpen(false)}
        title={`${t("analysis.compare")} - ${t("chart.title")}`}
        chartOption={chartOption}
      />
    </div>
  );
};

export default CompareAnalysis;
