import { StockWithQuote, HeatmapType } from "../types";
import { prepareTreemapData } from "./dataPreparers";
import { createLabelFormatter } from "./labelFormatters";
import { createColorConfig, createColorFunction } from "./colorMapper";
import { createTooltipFormatter } from "./tooltipFormatter";

export const getTreemapOption = (
  stocksWithQuotes: StockWithQuote[],
  heatmapType: HeatmapType,
  t: (key: string, params?: any) => string
) => {
  if (heatmapType === "marketCap") {
    console.log("Market Cap Debug:", stocksWithQuotes.map(s => ({
      symbol: s.stock.symbol,
      market_cap: s.quote?.market_cap,
      hasMarketCap: !!s.quote?.market_cap && s.quote.market_cap > 0
    })));
  }

  const dataConfig = prepareTreemapData(stocksWithQuotes, heatmapType);
  if (!dataConfig) {
    return {};
  }

  const { treemapData, minValue, maxValue, colorValueKey } = dataConfig;
  const labelFormatter = createLabelFormatter(heatmapType, t);
  const colorConfig = createColorConfig(heatmapType, minValue, maxValue, t);
  const colorFunction = createColorFunction(colorConfig.colorRange, colorConfig.colorPalette, colorValueKey);
  const tooltipFormatter = createTooltipFormatter(heatmapType, t);

  return {
    tooltip: {
      formatter: tooltipFormatter,
    },
    visualMap: {
      show: true,
      min: colorConfig.colorRange[0],
      max: colorConfig.colorRange[1],
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: "2%",
      itemWidth: 12,
      itemHeight: 120,
      text: colorConfig.legendText,
      textStyle: {
        color: "var(--text-primary)",
      },
      inRange: {
        color: colorConfig.colorPalette,
      },
    },
    series: [
      {
        name: t("heatmap.favoritesHeatmap"),
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
              color: colorFunction,
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
              color: colorFunction,
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
