import { StockWithQuote } from "../types";

export const getRadarOption = (stocksWithQuotes: StockWithQuote[], t: (key: string, params?: any) => string) => {
  if (stocksWithQuotes.length === 0) return {};

  const selectedStocks = stocksWithQuotes.slice(0, 5);
  const maxMarketCap = Math.max(...stocksWithQuotes.map(s => s.quote.market_cap || 0), 1);
  const maxVolume = Math.max(...stocksWithQuotes.map(s => s.quote.volume || 0), 1);
  const maxTurnover = Math.max(...stocksWithQuotes.map(s => s.quote.turnover || 0), 1);
  const maxPE = Math.max(...stocksWithQuotes.map(s => s.quote.pe_ratio || 0), 1);

  const normalize = (value: number, max: number) => Math.min(100, (value / max) * 100);

  const indicator = [
    { name: t("stock.marketCap"), max: 100 },
    { name: t("stock.changePercent"), max: 100 },
    { name: t("stock.volume"), max: 100 },
    { name: t("heatmap.turnover"), max: 100 },
    { name: "PE", max: 100 },
  ];

  const seriesData = selectedStocks.map(s => ({
    name: s.stock.symbol,
    value: [
      normalize(s.quote.market_cap || 0, maxMarketCap),
      Math.abs(s.quote.change_percent || 0) * 10,
      normalize(s.quote.volume || 0, maxVolume),
      normalize(s.quote.turnover || 0, maxTurnover),
      normalize(s.quote.pe_ratio || 0, maxPE),
    ],
  }));

  return {
    title: {
      text: t("heatmap.multiDimensionRadar"),
      subtext: t("heatmap.radarSubtext"),
      left: "center",
      top: "2%",
      textStyle: { fontSize: 16, fontWeight: "bold" },
      subtextStyle: { fontSize: 11, color: "#858585" },
    },
    tooltip: {
      formatter: (params: any) => {
        const data = Array.isArray(params) ? params[0] : params;
        const stock = selectedStocks.find(s => s.stock.symbol === data.name);
        if (!stock) return "";
        return `
          <div style="padding: 8px;">
            <div style="font-weight: bold; margin-bottom: 4px;"><strong>${stock.stock.symbol}</strong> ${stock.stock.name}</div>
            <div style="border-top: 1px solid #555; padding-top: 4px; margin-top: 4px;">
              <div>${t("stock.marketCap")}: ${stock.quote.market_cap ? (stock.quote.market_cap >= 100000000 ? `${(stock.quote.market_cap / 100000000).toFixed(1)}${t("common.hundredMillion")}` : `${(stock.quote.market_cap / 10000).toFixed(0)}${t("common.tenThousand")}`) : 'N/A'}</div>
              <div>${t("stock.changePercent")}: ${(stock.quote.change_percent || 0).toFixed(2)}%</div>
              <div>${t("stock.volume")}: ${stock.quote.volume ? (stock.quote.volume >= 100000000 ? `${(stock.quote.volume / 100000000).toFixed(1)}${t("common.hundredMillion")}${t("common.shares")}` : `${(stock.quote.volume / 10000).toFixed(0)}${t("common.tenThousand")}${t("common.shares")}`) : 'N/A'}</div>
              <div>${t("heatmap.turnover")}: ${stock.quote.turnover ? (stock.quote.turnover >= 100000000 ? `${(stock.quote.turnover / 100000000).toFixed(1)}${t("common.hundredMillion")}` : `${(stock.quote.turnover / 10000).toFixed(0)}${t("common.tenThousand")}`) : 'N/A'}</div>
              <div>PE: ${stock.quote.pe_ratio ? stock.quote.pe_ratio.toFixed(2) : 'N/A'}</div>
            </div>
          </div>
        `;
      },
    },
    legend: {
      data: selectedStocks.map(s => s.stock.symbol),
      bottom: "5%",
      textStyle: { fontSize: 10 },
    },
    radar: {
      indicator,
      center: ["50%", "50%"],
      radius: "60%",
      name: {
        textStyle: { fontSize: 11 },
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: ["rgba(133, 133, 133, 0.05)", "rgba(133, 133, 133, 0.1)"],
        },
      },
    },
    series: [{
      type: "radar",
      data: seriesData,
      areaStyle: {
        opacity: 0.3,
      },
    }],
  };
};
