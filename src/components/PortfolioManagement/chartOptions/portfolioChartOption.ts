import { PortfolioPosition } from "../types";

export interface PortfolioChartOptionParams {
  positions: PortfolioPosition[];
  t: (key: string) => string;
}

export function generatePortfolioChartOption(params: PortfolioChartOptionParams): any {
  const { positions, t } = params;

  if (positions.length === 0) return {};

  const totalValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0);

  return {
    tooltip: {
      trigger: "item",
      formatter: (params: any) => {
        const pos = positions[params.dataIndex];
        const percentage = totalValue > 0 ? (pos.marketValue / totalValue * 100) : 0;
        return `${pos.name} (${pos.symbol})<br/>
                ${t("portfolio.chartTooltipMarketValue")}: ¥${pos.marketValue.toFixed(2)}<br/>
                ${t("portfolio.chartTooltipPercentage")}: ${percentage.toFixed(2)}%<br/>
                ${t("portfolio.chartTooltipCost")}: ¥${(pos.avgCost * pos.quantity).toFixed(2)}<br/>
                ${t("portfolio.chartTooltipProfit")}: ${pos.profitPercent >= 0 ? "+" : ""}${pos.profitPercent.toFixed(2)}%<br/>
                ${t("portfolio.chartTooltipPosition")}: ${pos.quantity}${t("portfolio.chartTooltipShares")}`;
      },
      backgroundColor: "rgba(37, 37, 38, 0.95)",
      borderColor: "#555",
      textStyle: { color: "#ccc" },
    },
    legend: {
      data: positions.map((p) => p.symbol),
      textStyle: { color: "#858585", fontSize: 10 },
      top: 0,
      type: "scroll",
    },
    series: [
      {
        name: t("portfolio.portfolio"),
        type: "pie",
        radius: ["40%", "70%"],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: "#1e1e1e",
          borderWidth: 2,
        },
        label: {
          show: true,
          formatter: (params: any) => {
            const percentage = params.percent || 0;
            return `${params.name}\n${percentage.toFixed(1)}%`;
          },
          fontSize: 10,
          color: "#ccc",
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 12,
            fontWeight: "bold",
          },
        },
        data: positions.map((pos) => ({
          value: pos.marketValue,
          name: pos.symbol,
          itemStyle: {
            color: pos.profitPercent >= 0 ? "#ff0000" : "#00ff00",
          },
        })),
      },
    ],
  };
}
