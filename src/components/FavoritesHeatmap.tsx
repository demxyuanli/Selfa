import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import "./FavoritesHeatmap.css";

// Import and use treemap chart
import { use } from "echarts/core";
import { TreemapChart } from "echarts/charts";
import { TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

use([TreemapChart, TooltipComponent, VisualMapComponent, CanvasRenderer]);

interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
}

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap?: number;
  pe_ratio?: number;
  turnover?: number;
  high: number;
  low: number;
  open: number;
  previous_close: number;
}

type HeatmapType = "marketCap" | "changePercent" | "peRatio" | "turnover";

const FavoritesHeatmap: React.FC = () => {
  const { t } = useTranslation();
  const [stocks, setStocks] = useState<Array<{ stock: StockInfo; quote: StockQuote | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heatmapType, setHeatmapType] = useState<HeatmapType>("changePercent");
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

  const getChartOption = () => {
    if (stocks.length === 0) {
      return {};
    }

    const stocksWithQuotes = stocks.filter((s) => s.quote !== null);
    if (stocksWithQuotes.length === 0) {
      return {};
    }

    // Debug: Log market cap data
    if (heatmapType === "marketCap") {
      console.log("Market Cap Debug:", stocksWithQuotes.map(s => ({
        symbol: s.stock.symbol,
        market_cap: s.quote?.market_cap,
        hasMarketCap: !!s.quote?.market_cap && s.quote.market_cap > 0
      })));
    }

    // Prepare treemap data based on selected type
    let treemapData: Array<any>;
    let colorValues: number[];
    let minValue: number;
    let maxValue: number;
    let colorValueKey: string;
    let labelFormatter: (data: any) => string;

    switch (heatmapType) {
      case "marketCap": {
        // Size: market cap, Color: market cap rank (higher = lighter red)
        // Filter out stocks without valid market cap data
        const validStocks = stocksWithQuotes.filter(s => {
          const marketCap = s.quote!.market_cap;
          // Check if market cap exists and is a valid positive number
          return marketCap !== null && marketCap !== undefined && Number(marketCap) > 0;
        });

        // Debug logging
        console.log("Market Cap Analysis:", {
          totalStocks: stocksWithQuotes.length,
          validStocks: validStocks.length,
          sampleData: stocksWithQuotes.slice(0, 3).map(s => ({
            symbol: s.stock.symbol,
            market_cap: s.quote!.market_cap,
            type: typeof s.quote!.market_cap
          }))
        });

        if (validStocks.length === 0) {
          // No valid market cap data - return empty option to show "no data" message
          console.warn("No valid market cap data found for any stocks");
          return {};
        }

        const sorted = [...validStocks].sort((a, b) => {
          const capA = Number(a.quote!.market_cap!) || 0;
          const capB = Number(b.quote!.market_cap!) || 0;
          return capB - capA;
        });
        treemapData = sorted.map((stock, index) => {
          const marketCap = Number(stock.quote!.market_cap!) || 0;
          // Ensure value is a valid positive number for treemap
          const treemapValue = marketCap > 0 ? marketCap : 1;
          return {
            name: stock.stock.symbol,
            value: treemapValue,
            rank: validStocks.length - index,
            changePercent: stock.quote!.change_percent ?? 0,
            price: stock.quote!.price ?? 0,
            change: stock.quote!.change ?? 0,
            volume: stock.quote!.volume ?? 0,
            turnover: stock.quote!.turnover ?? 0,
            marketCap: marketCap,
            fullName: stock.stock.name,
          };
        });
        
        // Debug: Log treemap data
        console.log("Treemap Data Sample:", treemapData.slice(0, 3));
        colorValues = treemapData.map(d => d.rank);
        minValue = 1;
        maxValue = validStocks.length;
        colorValueKey = "rank";
        labelFormatter = (params: any) => {
          if (!params) return "";
          const data = params.data || params;
          if (!data || typeof data !== "object") return "";
          const displayName = (data.fullName || data.name || "").toString();
          if (!displayName) return "";
          const shortName = displayName.length > 6 ? displayName.substring(0, 6) + "..." : displayName;
          const marketCap = Number(data.marketCap) || 0;
          if (!isFinite(marketCap) || marketCap <= 0) return shortName;
          // Format market cap: convert to 亿 (hundred million) or 万 (ten thousand)
          const marketCapText = marketCap >= 100000000
            ? `${(marketCap / 100000000).toFixed(1)}亿`
            : `${(marketCap / 10000).toFixed(0)}万`;
          return `${shortName}\n${marketCapText}`;
        };
        break;
      }

      case "changePercent": {
        // Size: absolute change percent with enhanced scaling (涨跌幅绝对值), Color: change percent (red = positive, green = negative)
        // Sort by absolute change percent for display
        const sorted = [...stocksWithQuotes].sort((a, b) => {
          const changeA = Math.abs(a.quote!.change_percent ?? 0);
          const changeB = Math.abs(b.quote!.change_percent ?? 0);
          return changeB - changeA; // Sort by absolute change percent descending
        });
        colorValues = sorted.map((s) => s.quote!.change_percent);
        minValue = Math.min(...colorValues);
        maxValue = Math.max(...colorValues);
        colorValueKey = "changePercent";

        // Calculate size values with enhanced scaling
        const absChanges = sorted.map(s => Math.abs(s.quote!.change_percent ?? 0));
        const maxAbsChange = Math.max(...absChanges);

        treemapData = sorted.map((stock) => {
          const changePct = stock.quote!.change_percent ?? 0;
          const absChange = Math.abs(changePct);

          // Enhanced size scaling: use a combination of linear and exponential scaling
          // to make small changes more visible while maintaining large change dominance
          let sizeValue: number;
          if (maxAbsChange === 0) {
            sizeValue = 1; // All zero changes
          } else if (absChange === 0) {
            sizeValue = 0.5; // Zero change gets minimum size
          } else {
            // Use square root scaling for better visual distribution
            // This makes small changes more visible while preserving large change dominance
            const normalized = absChange / maxAbsChange;
            sizeValue = Math.sqrt(normalized) * maxAbsChange + 0.1; // Add minimum size
          }

          // Ensure minimum size for visibility
          sizeValue = Math.max(sizeValue, 0.1);

          const marketCap = stock.quote!.market_cap || stock.quote!.price * 1000000;
          return {
            name: stock.stock.symbol,
            value: sizeValue,
            changePercent: changePct,
            absChange: absChange,
            price: stock.quote!.price ?? 0,
            change: stock.quote!.change ?? 0,
            volume: stock.quote!.volume ?? 0,
            turnover: stock.quote!.turnover ?? 0,
            marketCap,
            fullName: stock.stock.name,
          };
        });
        labelFormatter = (params: any) => {
          if (!params) return "";
          const data = params.data || params;
          if (!data || typeof data !== "object") return "";
          const displayName = (data.fullName || data.name || "").toString();
          if (!displayName) return "";
          const shortName = displayName.length > 6 ? displayName.substring(0, 6) + "..." : displayName;
          const changePercent = Number(data.changePercent) || 0;
          if (!isFinite(changePercent)) return shortName;
          const changeText = changePercent >= 0 ? `+${changePercent.toFixed(1)}%` : `${changePercent.toFixed(1)}%`;
          return `${shortName}\n${changeText}`;
        };
        break;
      }

      case "peRatio": {
        // Size: PE ratio, Color: PE ratio rank (higher PE = lighter red)
        const validPE = stocksWithQuotes.filter(s => s.quote!.pe_ratio && s.quote!.pe_ratio > 0);
        if (validPE.length === 0) {
          return {};
        }
        const sorted = [...validPE].sort((a, b) => {
          const peA = a.quote!.pe_ratio || 0;
          const peB = b.quote!.pe_ratio || 0;
          return peB - peA; // Sort by PE ratio descending
        });
        treemapData = sorted.map((stock, index) => {
          const peRatio = stock.quote!.pe_ratio ?? 0;
          const marketCap = stock.quote!.market_cap || stock.quote!.price * 1000000;
          return {
            name: stock.stock.symbol,
            value: peRatio || 0.01, // Use PE ratio for size, minimum 0.01 to ensure visibility
            rank: validPE.length - index,
            peRatio: peRatio,
            changePercent: stock.quote!.change_percent ?? 0,
            price: stock.quote!.price ?? 0,
            change: stock.quote!.change ?? 0,
            volume: stock.quote!.volume ?? 0,
            turnover: stock.quote!.turnover ?? 0,
            marketCap,
            fullName: stock.stock.name,
          };
        });
        colorValues = treemapData.map(d => d.rank);
        minValue = 1;
        maxValue = validPE.length;
        colorValueKey = "rank";
        labelFormatter = (params: any) => {
          if (!params) return "";
          const data = params.data || params;
          if (!data || typeof data !== "object") return "";
          const displayName = (data.fullName || data.name || "").toString();
          if (!displayName) return "";
          const shortName = displayName.length > 6 ? displayName.substring(0, 6) + "..." : displayName;
          const peRatio = Number(data.peRatio) || 0;
          if (!isFinite(peRatio) || peRatio <= 0) return shortName;
          return `${shortName}\nPE:${peRatio.toFixed(1)}`;
        };
        break;
      }

      case "turnover": {
        // Size: turnover (交易额), Color: turnover rank (higher = lighter red)
        const validTurnover = stocksWithQuotes.filter(s => s.quote!.turnover && s.quote!.turnover > 0);
        if (validTurnover.length === 0) {
          return {};
        }
        const sorted = [...validTurnover].sort((a, b) => {
          const turnA = a.quote!.turnover || 0;
          const turnB = b.quote!.turnover || 0;
          return turnB - turnA; // Sort by turnover descending
        });
        treemapData = sorted.map((stock, index) => {
          const turnover = stock.quote!.turnover ?? 0;
          const marketCap = stock.quote!.market_cap || stock.quote!.price * 1000000;
          return {
            name: stock.stock.symbol,
            value: turnover || 0.01, // Use turnover for size, minimum 0.01 to ensure visibility
            rank: validTurnover.length - index,
            turnover: turnover,
            changePercent: stock.quote!.change_percent ?? 0,
            price: stock.quote!.price ?? 0,
            change: stock.quote!.change ?? 0,
            volume: stock.quote!.volume ?? 0,
            marketCap,
            fullName: stock.stock.name,
          };
        });
        colorValues = treemapData.map(d => d.rank);
        minValue = 1;
        maxValue = validTurnover.length;
        colorValueKey = "rank";
        labelFormatter = (params: any) => {
          if (!params) return "";
          const data = params.data || params;
          if (!data || typeof data !== "object") return "";
          const displayName = (data.fullName || data.name || "").toString();
          if (!displayName) return "";
          const shortName = displayName.length > 6 ? displayName.substring(0, 6) + "..." : displayName;
          const turnover = Number(data.turnover) || 0;
          if (!isFinite(turnover) || turnover <= 0) return shortName;
          // Format turnover: convert to 亿 (hundred million) or 万 (ten thousand)
          const turnoverText = turnover >= 100000000
            ? `${(turnover / 100000000).toFixed(1)}亿`
            : `${(turnover / 10000).toFixed(0)}万`;
          return `${shortName}\n${turnoverText}`;
        };
        break;
      }
    }

    // Determine color range based on type
    let colorRange: [number, number];
    let colorPalette: string[];
    let legendText: [string, string];

    if (heatmapType === "changePercent") {
      // For change percent: red = positive (上涨), green = negative (下跌)
      // Use red for positive (浅红-深红), green for negative (浅绿-深绿)
      colorRange = [minValue, maxValue];
      if (minValue < 0 && maxValue > 0) {
        // Both positive and negative values: green (浅绿-深绿) -> red (浅红-深红)
        // Map negative values to green, positive values to red
        colorPalette = [
          "#10b981", // Medium green (浅绿, for negative values near 0)
          "#059669", // Dark green (中绿)
          "#047857", // Deep green (深绿, most negative)
        ];
        // For positive values, use red palette
        const redPalette = [
          "#fca5a5", // Light red (浅红, for positive values near 0)
          "#ef4444", // Medium red (中红)
          "#dc2626", // Dark red (深红)
          "#b91c1c", // Deep red (最深红, most positive)
        ];
        // Store both palettes for split mapping
        colorPalette = [...colorPalette, ...redPalette];
      } else if (maxValue > 0) {
        // All positive: 浅红 -> 深红
        colorPalette = [
          "#fca5a5", // Light red (浅红)
          "#ef4444", // Medium red (中红)
          "#dc2626", // Dark red (深红)
          "#b91c1c"  // Deep red (最深红)
        ];
      } else {
        // All negative: 浅绿 -> 深绿
        colorPalette = [
          "#10b981", // Medium green (浅绿)
          "#059669", // Dark green (中绿)
          "#047857", // Deep green (深绿)
          "#065f46"  // Deeper green (最深绿)
        ];
      }
      legendText = ["下跌", "上涨"];
    } else {
      // For rankings: higher rank (1) = lighter, lower rank (N) = darker
      // Reverse the mapping: high value = light, low value = dark
      colorRange = [minValue, maxValue];
      if (heatmapType === "marketCap") {
        // Market cap: light blue to dark blue (浅蓝 -> 深蓝)
        colorPalette = ["#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb"];  // Light to dark blue
        legendText = ["低", "高"];
      } else {
        // PE ratio and turnover: light red to dark red (浅红 -> 深红)
        colorPalette = ["#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626"];  // Light to dark red
        legendText = heatmapType === "peRatio" ? ["低", "高"] : ["低", "高"];
      }
    }

    return {
      tooltip: {
        formatter: (params: any) => {
          if (!params) return "";
          // Handle both array and single object
          const param = Array.isArray(params) ? params[0] : params;
          const data = param?.data || param || {};
          const marketCap = data.marketCap ?? 0;
          const volume = data.volume ?? 0;
          const marketCapText = marketCap >= 100000000
            ? `${(marketCap / 100000000).toFixed(1)}亿`
            : `${(marketCap / 10000).toFixed(0)}万`;
          const volumeText = volume >= 100000000
            ? `${(volume / 100000000).toFixed(1)}亿`
            : `${(volume / 10000).toFixed(0)}万`;
          const turnover = data.turnover ?? 0;
          const turnoverText = turnover >= 100000000
            ? `${(turnover / 100000000).toFixed(1)}亿`
            : turnover > 0
            ? `${(turnover / 10000).toFixed(0)}万`
            : "N/A";

          const changePercent = data.changePercent ?? 0;
          const change = data.change ?? 0;
          const price = data.price ?? 0;
          let tooltipContent = `
            <div style="padding: 8px;">
              <div><strong>${data.name}</strong> ${data.fullName || ''}</div>
              <div>当前价格: ¥${price.toFixed(2)}</div>
              <div>涨跌幅: ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%</div>
              <div>涨跌额: ${change >= 0 ? '+' : ''}${change.toFixed(2)}</div>
              <div>总市值: ¥${marketCapText}</div>
              <div>成交量: ${volumeText}股</div>
          `;

          if (heatmapType === "marketCap" && data.rank) {
            tooltipContent += `<div>市值排名: #${data.rank}</div>`;
          }
          if (heatmapType === "peRatio" && data.peRatio) {
            const peRatio = data.peRatio ?? 0;
            tooltipContent += `<div>市盈率: ${peRatio.toFixed(2)}</div>`;
            if (data.rank) {
              tooltipContent += `<div>PE排名: #${data.rank}</div>`;
            }
          }
          if (heatmapType === "turnover" && data.turnover) {
            tooltipContent += `<div>交易额: ¥${turnoverText}</div>`;
            if (data.rank) {
              tooltipContent += `<div>交易额排名: #${data.rank}</div>`;
            }
          }

          tooltipContent += `</div>`;
          return tooltipContent;
        },
      },
      visualMap: {
        show: true,
        min: colorRange[0],
        max: colorRange[1],
        calculable: false,
        orient: "horizontal",
        left: "center",
        bottom: "2%",
        itemWidth: 12,
        itemHeight: 120,
        text: legendText,
        textStyle: {
          color: "var(--text-primary)",
        },
        inRange: {
          color: colorPalette,
        },
        // Remove dimension for treemap - color mapping is handled manually in itemStyle.color
        // dimension: "visualMapValue",
      },
      series: [
        {
          name: "自选股热力图",
          type: "treemap",
          data: treemapData.map((item, idx) => {
            let visualMapValue: number;
            if (colorValueKey === "changePercent") {
              // Ensure changePercent is converted to number for proper comparison
              visualMapValue = Number(item.changePercent) || 0;
            } else {
              visualMapValue = item.rank || (treemapData.length - idx);
            }
            const mappedItem = {
              ...item,
              value: item.value || item.marketCap,
              visualMapValue: visualMapValue,
            };
            return mappedItem;
          }),
          leafDepth: 1,
          roam: false,
          nodeClick: false,
          breadcrumb: {
            show: false,
          },
          levels: [
            {
              itemStyle: {
                borderColor: "var(--border-color)",
                borderWidth: 1,
                gapWidth: 1,
                color: (() => {
                  // Capture colorRange and colorPalette in closure
                  const range = colorRange;
                  const palette = colorPalette;
                  const isChangePercent = colorValueKey === "changePercent";
                  return (params: any) => {
                    const data = params.data;
                    const colorValue = data.visualMapValue;
                    if (colorValue === undefined || colorValue === null || isNaN(colorValue)) {
                      return "#9ca3af"; // Gray fallback
                    }
                    
                    // Special handling for change percent: split mapping for positive and negative
                    if (isChangePercent && range[0] < 0 && range[1] > 0) {
                      // Convert colorValue to number for proper comparison
                      const numericValue = Number(colorValue) || 0;
                      // Split mapping: negative -> green, positive -> red (红涨绿跌)
                      // Fix: Correct color mapping - Negative (下跌) should be green, Positive (上涨) should be red
                      if (numericValue < 0) {
                        // Negative values (下跌): use GREEN palette (first half) for correct display
                        const negativeRange = Math.abs(range[0]);
                        if (negativeRange === 0) return palette[0] || "#9ca3af";
                        const normalizedValue = Math.abs(numericValue) / negativeRange;
                        const greenPalette = palette.slice(0, Math.floor(palette.length / 2));
                        if (greenPalette.length === 0) return "#10b981";
                        const colorIndex = Math.max(0, Math.min(Math.floor(normalizedValue * (greenPalette.length - 1)), greenPalette.length - 1));
                        return greenPalette[colorIndex] || greenPalette[0] || "#10b981";
                      } else if (numericValue > 0) {
                        // Positive values (上涨): use RED palette (second half) for correct display
                        const positiveRange = range[1];
                        if (positiveRange === 0) return palette[palette.length - 1] || "#9ca3af";
                        const normalizedValue = numericValue / positiveRange;
                        const redPalette = palette.slice(Math.floor(palette.length / 2));
                        if (redPalette.length === 0) return "#fca5a5";
                        const colorIndex = Math.max(0, Math.min(Math.floor(normalizedValue * (redPalette.length - 1)), redPalette.length - 1));
                        return redPalette[colorIndex] || redPalette[0] || "#fca5a5";
                      } else {
                        // Zero change: use yellow
                        return "#eab308";
                      }
                    }
                    
                    // Default linear mapping for other types
                    const rangeSize = range[1] - range[0];
                    if (rangeSize === 0 || !isFinite(rangeSize)) {
                      return palette[0] || "#9ca3af";
                    }
                    const normalizedValue = Math.max(0, Math.min(1, (colorValue - range[0]) / rangeSize));
                    const colorIndex = Math.max(0, Math.min(Math.floor(normalizedValue * (palette.length - 1)), palette.length - 1));
                    return palette[colorIndex] || palette[0] || "#9ca3af";
                  };
                })(),
              },
              upperLabel: {
                show: false,
              },
            },
            {
              itemStyle: {
                borderColor: "var(--border-color)",
                borderWidth: 1,
                gapWidth: 1,
                color: (() => {
                  // Capture colorRange and colorPalette in closure
                  const range = colorRange;
                  const palette = colorPalette;
                  const isChangePercent = colorValueKey === "changePercent";
                  return (params: any) => {
                    const data = params.data;
                    const colorValue = data.visualMapValue;
                    if (colorValue === undefined || colorValue === null || isNaN(colorValue)) {
                      return "#9ca3af"; // Gray fallback
                    }
                    
                    // Special handling for change percent: split mapping for positive and negative
                    if (isChangePercent && range[0] < 0 && range[1] > 0) {
                      // Convert colorValue to number for proper comparison
                      const numericValue = Number(colorValue) || 0;
                      // Split mapping: negative -> green, positive -> red (红涨绿跌)
                      // Fix: Correct color mapping - Negative (下跌) should be green, Positive (上涨) should be red
                      if (numericValue < 0) {
                        // Negative values (下跌): use GREEN palette (first half) for correct display
                        const negativeRange = Math.abs(range[0]);
                        if (negativeRange === 0) return palette[0] || "#9ca3af";
                        const normalizedValue = Math.abs(numericValue) / negativeRange;
                        const greenPalette = palette.slice(0, Math.floor(palette.length / 2));
                        if (greenPalette.length === 0) return "#10b981";
                        const colorIndex = Math.max(0, Math.min(Math.floor(normalizedValue * (greenPalette.length - 1)), greenPalette.length - 1));
                        return greenPalette[colorIndex] || greenPalette[0] || "#10b981";
                      } else if (numericValue > 0) {
                        // Positive values (上涨): use RED palette (second half) for correct display
                        const positiveRange = range[1];
                        if (positiveRange === 0) return palette[palette.length - 1] || "#9ca3af";
                        const normalizedValue = numericValue / positiveRange;
                        const redPalette = palette.slice(Math.floor(palette.length / 2));
                        if (redPalette.length === 0) return "#fca5a5";
                        const colorIndex = Math.max(0, Math.min(Math.floor(normalizedValue * (redPalette.length - 1)), redPalette.length - 1));
                        return redPalette[colorIndex] || redPalette[0] || "#fca5a5";
                      } else {
                        // Zero change: use yellow
                        return "#eab308";
                      }
                    }
                    
                    // Default linear mapping for other types
                    const rangeSize = range[1] - range[0];
                    if (rangeSize === 0 || !isFinite(rangeSize)) {
                      return palette[0] || "#9ca3af";
                    }
                    const normalizedValue = Math.max(0, Math.min(1, (colorValue - range[0]) / rangeSize));
                    const colorIndex = Math.max(0, Math.min(Math.floor(normalizedValue * (palette.length - 1)), palette.length - 1));
                    return palette[colorIndex] || palette[0] || "#9ca3af";
                  };
                })(),
              },
              label: {
                show: (params: any) => {
                  // Only show label if rectangle is large enough to avoid overlapping
                  const width = params.rect.width || 0;
                  const height = params.rect.height || 0;
                  const minWidth = 60; // Minimum width to show label
                  const minHeight = 50; // Minimum height to show label (for two-line label)
                  return width >= minWidth && height >= minHeight;
                },
                formatter: labelFormatter,
                fontSize: (params: any) => {
                  // Dynamic font size based on rectangle size
                  const area = params.rect.width * params.rect.height;
                  const minSize = 9;
                  const maxSize = 13;
                  // Ensure readable font size for two-line labels
                  return Math.max(minSize, Math.min(maxSize, Math.sqrt(area) / 8));
                },
                color: "#000000",
                textBorderWidth: 0,
                fontWeight: 500,
                lineHeight: 20, // Increased line height for better spacing between lines
                padding: [4, 2], // [vertical, horizontal] padding
                overflow: "truncate",
                align: "center",
                verticalAlign: "middle",
              },
              upperLabel: {
                show: false,
              },
            },
          ],
          emphasis: {
            focus: "ancestor",
            itemStyle: {
              borderColor: "var(--accent-color)",
              borderWidth: 2,
              shadowBlur: 8,
              shadowColor: "rgba(0, 0, 0, 0.3)",
            },
            label: {
              fontSize: (params: any) => {
                const area = params.rect.width * params.rect.height;
                return Math.max(12, Math.min(18, Math.sqrt(area) / 6));
              },
              fontWeight: "bold",
              color: "#000000",
              textBorderWidth: 0,
            },
          },
        },
      ],
    };
  };

  const getSummary = () => {
    if (stocks.length === 0) {
      return {
        total: 0,
        withQuote: 0,
        upCount: 0,
        downCount: 0,
        flatCount: 0,
        totalChange: 0,
        avgChange: 0,
        maxGain: { symbol: "", name: "", change: 0 },
        maxLoss: { symbol: "", name: "", change: 0 },
      };
    }

    const stocksWithQuotes = stocks.filter((s) => s.quote !== null);
    const upCount = stocksWithQuotes.filter((s) => s.quote!.change_percent > 0).length;
    const downCount = stocksWithQuotes.filter((s) => s.quote!.change_percent < 0).length;
    const flatCount = stocksWithQuotes.filter((s) => s.quote!.change_percent === 0).length;
    const totalChange = stocksWithQuotes.reduce((sum, s) => sum + s.quote!.change_percent, 0);
    const avgChange = stocksWithQuotes.length > 0 ? totalChange / stocksWithQuotes.length : 0;

    const maxGain = stocksWithQuotes.reduce(
      (max, s) => (s.quote!.change_percent > max.change ? { symbol: s.stock.symbol, name: s.stock.name, change: s.quote!.change_percent } : max),
      { symbol: "", name: "", change: -Infinity }
    );

    const maxLoss = stocksWithQuotes.reduce(
      (min, s) => (s.quote!.change_percent < min.change ? { symbol: s.stock.symbol, name: s.stock.name, change: s.quote!.change_percent } : min),
      { symbol: "", name: "", change: Infinity }
    );

    return {
      total: stocks.length,
      withQuote: stocksWithQuotes.length,
      upCount,
      downCount,
      flatCount,
      totalChange,
      avgChange,
      maxGain,
      maxLoss,
    };
  };

  const summary = getSummary();

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
            <span className="summary-label">涨跌对比:</span>
            <div className="summary-bar-container">
              <div className="summary-bar">
                <div 
                  className="summary-bar-up" 
                  style={{ 
                    width: `${(summary.upCount / summary.withQuote) * 100}%` 
                  }}
                  title={`上涨: ${summary.upCount}家`}
                />
                <div 
                  className="summary-bar-down" 
                  style={{ 
                    width: `${(summary.downCount / summary.withQuote) * 100}%` 
                  }}
                  title={`下跌: ${summary.downCount}家`}
                />
                {summary.flatCount > 0 && (
                  <div 
                    className="summary-bar-flat" 
                    style={{ 
                      width: `${(summary.flatCount / summary.withQuote) * 100}%` 
                    }}
                    title={`平盘: ${summary.flatCount}家`}
                  />
                )}
              </div>
              <div className="summary-bar-label">
                <span className="bar-label-item up-label">涨 {summary.upCount}</span>
                <span className="bar-label-item down-label">跌 {summary.downCount}</span>
                {summary.flatCount > 0 && (
                  <span className="bar-label-item flat-label">平 {summary.flatCount}</span>
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
          <div className="type-selector-header">热力图类型</div>
          <button
            className={`type-btn ${heatmapType === "marketCap" ? "active" : ""}`}
            onClick={() => setHeatmapType("marketCap")}
            title="市值排名"
          >
            市值排名
          </button>
          <button
            className={`type-btn ${heatmapType === "changePercent" ? "active" : ""}`}
            onClick={() => setHeatmapType("changePercent")}
            title="涨跌幅"
          >
            涨跌幅
          </button>
          <button
            className={`type-btn ${heatmapType === "peRatio" ? "active" : ""}`}
            onClick={() => setHeatmapType("peRatio")}
            title="市盈率排名"
          >
            市盈率排名
          </button>
          <button
            className={`type-btn ${heatmapType === "turnover" ? "active" : ""}`}
            onClick={() => setHeatmapType("turnover")}
            title="交易额排名"
          >
            交易额排名
          </button>
        </div>

        <div className="heatmap-chart-container">
          <div className="heatmap-legend">
            <div className="legend-item">
              <span className="legend-label">方块大小:</span>
              <span className="legend-value">
                {heatmapType === "marketCap" ? "按市值大小" :
                 heatmapType === "changePercent" ? "按涨跌幅大小 (平方根缩放)" :
                 heatmapType === "peRatio" ? "按市盈率大小" :
                 "按交易额大小"}
              </span>
            </div>
            <div className="legend-item">
              <span className="legend-label">颜色:</span>
              <span className="legend-value">
                {heatmapType === "marketCap" ? "市值排名 (蓝=高, 浅=低)" :
                 heatmapType === "changePercent" ? "涨跌幅 (绿=跌, 黄=平, 红=涨)" :
                 heatmapType === "peRatio" ? "市盈率排名 (红=高, 浅=低)" :
                 "交易额排名 (红=高, 浅=低)"}
              </span>
            </div>
          </div>

          <div className="heatmap-chart">
        {Object.keys(getChartOption()).length > 0 ? (
          <ReactECharts
            ref={chartRef}
            option={getChartOption()}
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