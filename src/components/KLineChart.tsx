import React, { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import "./KLineChart.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface KLineChartProps {
  data: StockData[];
  compact?: boolean; // For sidebar charts
}

const calculateMA = (data: StockData[], period: number): number[] => {
  const closes = data.map((d) => d.close);
  const ma: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      ma.push(NaN);
    } else {
      const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      ma.push(sum / period);
    }
  }
  return ma;
};

const KLineChart: React.FC<KLineChartProps> = ({ data, compact = false }) => {
  const { t } = useTranslation();
  const chartRef = useRef<any>(null);
  const option = useMemo(() => {
    if (!data || data.length === 0) {
      return {};
    }

    const dates = data.map((d) => {
      const dateStr = d.date;
      if (dateStr.includes(" ")) {
        return dateStr.split(" ")[0];
      }
      return dateStr;
    });

    const candlestickData = data.map((d) => [d.open, d.close, d.low, d.high]);
    const volumes = data.map((d, i) => [
      i,
      d.volume,
      d.close >= d.open ? 1 : -1,
    ]);

    const ma5 = calculateMA(data, 5);
    const ma10 = calculateMA(data, 10);
    const ma20 = calculateMA(data, 20);
    const ma60 = calculateMA(data, 60);

    return {
      backgroundColor: "#1e1e1e",
      axisPointer: {
        link: [{ xAxisIndex: [0, 1] }],
        snap: true,
        label: {
          backgroundColor: "#777",
        },
      },
      grid: [
        {
          left: "5%",
          right: "3%",
          top: "15%",
          height: "60%",
        },
        {
          left: "5%",
          right: "3%",
          top: "80%",
          height: "15%",
        },
      ],
      xAxis: [
        {
          type: "category",
          data: dates,
          scale: true,
          boundaryGap: false,
          splitLine: { show: false },
          min: "dataMin",
          max: "dataMax",
          axisLabel: {
            color: "#858585",
            fontSize: 9,
          },
          axisLine: {
            onZero: false,
            lineStyle: {
              color: "#3e3e42",
            },
          },
          axisPointer: {
            snap: true,
          },
        },
        {
          type: "category",
          gridIndex: 1,
          data: dates,
          scale: true,
          boundaryGap: false,
          axisLine: { onZero: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          min: "dataMin",
          max: "dataMax",
          axisPointer: {
            snap: true,
          },
        },
      ],
      yAxis: [
        {
          scale: true,
          axisPointer: {
            snap: true,
          },
          splitArea: {
            show: true,
            areaStyle: {
              color: ["rgba(62, 62, 66, 0.1)", "rgba(62, 62, 66, 0.05)"],
            },
          },
          axisLabel: {
            color: "#858585",
            fontSize: compact ? 7 : 9,
            formatter: (value: number) => {
              if (compact) {
                return value.toFixed(0);
              }
              return value.toFixed(2);
            },
          },
          axisLine: {
            lineStyle: {
              color: "#3e3e42",
            },
          },
          splitLine: {
            show: true,
            lineStyle: {
              color: "#3e3e42",
              opacity: 0.5,
            },
          },
        },
        {
          scale: true,
          gridIndex: 1,
          splitNumber: 2,
          axisPointer: {
            snap: true,
          },
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: [0, 1],
          start: 50,
          end: 100,
        },
        {
          show: true,
          xAxisIndex: [0, 1],
          type: "slider",
          top: "95%",
          start: 50,
          end: 100,
          height: 15,
          handleStyle: {
            color: "#007acc",
          },
          dataBackground: {
            areaStyle: {
              color: "rgba(0, 122, 204, 0.2)",
            },
            lineStyle: {
              color: "#007acc",
            },
          },
          selectedDataBackground: {
            areaStyle: {
              color: "rgba(0, 122, 204, 0.4)",
            },
            lineStyle: {
              color: "#007acc",
            },
          },
          borderColor: "#3e3e42",
        },
      ],
      series: [
        {
          name: t("chart.kline"),
          type: "candlestick",
          data: candlestickData,
          itemStyle: {
            color: "#ff0000",
            color0: "#00ff00",
            borderColor: "#ff0000",
            borderColor0: "#00ff00",
          },
          emphasis: {
            itemStyle: {
              color: "#ef5350",
              color0: "#66bb6a",
              borderColor: "#ef5350",
              borderColor0: "#66bb6a",
            },
          },
        },
        {
          name: t("analysis.ma5"),
          type: "line",
          data: ma5,
          smooth: false,
          symbol: "none",
          lineStyle: {
            color: "#ffff00",
            width: 1,
          },
          itemStyle: {
            color: "#ffff00",
          },
        },
        {
          name: t("analysis.ma10"),
          type: "line",
          data: ma10,
          smooth: false,
          symbol: "none",
          lineStyle: {
            color: "#00ffff",
            width: 1,
          },
          itemStyle: {
            color: "#00ffff",
          },
        },
        {
          name: t("analysis.ma20"),
          type: "line",
          data: ma20,
          smooth: false,
          symbol: "none",
          lineStyle: {
            color: "#ff00ff",
            width: 1,
          },
          itemStyle: {
            color: "#ff00ff",
          },
        },
        {
          name: t("analysis.ma60"),
          type: "line",
          data: ma60,
          smooth: false,
          symbol: "none",
          lineStyle: {
            color: "#00ff00",
            width: 1,
          },
          itemStyle: {
            color: "#00ff00",
          },
        },
        {
          name: t("chart.volume"),
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes,
          itemStyle: {
            color: (params: any) => {
              const index = params.dataIndex;
              if (index < 0 || index >= data.length) {
                return "rgba(133, 133, 133, 0.6)";
              }
              const stockData = data[index];
              if (index === 0) {
                return "rgba(133, 133, 133, 0.6)";
              }
              const prevData = data[index - 1];
              return stockData.close >= prevData.close ? "#ff0000" : "#00ff00";
            },
          },
        },
      ],
      legend: {
        data: [t("chart.kline"), t("analysis.ma5"), t("analysis.ma10"), t("analysis.ma20"), t("analysis.ma60")],
          textStyle: {
            color: "#cccccc",
            fontSize: compact ? 5 : 6,
          },
        itemWidth: 8,
        itemHeight: 8,
        top: 0,
        left: "center",
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          snap: true,
          link: [{ xAxisIndex: [0, 1] }],
        },
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#3e3e42",
        borderWidth: 1,
        textStyle: {
          color: "#cccccc",
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return "";
          const param = params[0];
          const dataIndex = param.dataIndex;
          const stockData = data[dataIndex];
          if (!stockData) return "";

          let html = `
            <div style="padding: 4px 0;">
              <div><strong>${stockData.date}</strong></div>
              <div>${t("chart.open")}: <span style="color: #cccccc;">${stockData.open.toFixed(2)}</span></div>
              <div>${t("chart.close")}: <span style="color: ${stockData.close >= stockData.open ? "#ff0000" : "#00ff00"};">${stockData.close.toFixed(2)}</span></div>
              <div>${t("chart.high")}: <span style="color: #cccccc;">${stockData.high.toFixed(2)}</span></div>
              <div>${t("chart.low")}: <span style="color: #cccccc;">${stockData.low.toFixed(2)}</span></div>
              <div>${t("chart.volume")}: <span style="color: #cccccc;">${compact ? Math.round(stockData.volume / 100000000) : (stockData.volume / 10000).toFixed(2) + t("common.tenThousand")}</span></div>
          `;

          const ma5Name = t("analysis.ma5");
          const ma10Name = t("analysis.ma10");
          const ma20Name = t("analysis.ma20");
          const ma60Name = t("analysis.ma60");

          params.forEach((p: any) => {
            if (p.seriesName === ma5Name && !isNaN(p.value)) {
              html += `<div>${ma5Name}: <span style="color: #ffff00;">${p.value.toFixed(2)}</span></div>`;
            } else if (p.seriesName === ma10Name && !isNaN(p.value)) {
              html += `<div>${ma10Name}: <span style="color: #00ffff;">${p.value.toFixed(2)}</span></div>`;
            } else if (p.seriesName === ma20Name && !isNaN(p.value)) {
              html += `<div>${ma20Name}: <span style="color: #ff00ff;">${p.value.toFixed(2)}</span></div>`;
            } else if (p.seriesName === ma60Name && !isNaN(p.value)) {
              html += `<div>${ma60Name}: <span style="color: #00ff00;">${p.value.toFixed(2)}</span></div>`;
            }
          });

          html += `</div>`;
          return html;
        },
      },
    };
  }, [data, t]);

  if (!data || data.length === 0) {
    return (
      <div className="kline-chart">
        <div className="chart-empty">{t("chart.noKlineData")}</div>
      </div>
    );
  }

  return (
    <div className="kline-chart">
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "canvas" }}
        onEvents={{
          mousemove: (params: any) => {
            if (chartRef.current && data.length > 0 && params.offsetX !== undefined) {
              const echartsInstance = chartRef.current.getEchartsInstance();
              if (echartsInstance) {
                try {
                  const coord = echartsInstance.convertFromPixel({ xAxisIndex: 0 }, [params.offsetX, params.offsetY]);
                  if (coord && coord[0] !== undefined) {
                    const nearestIndex = Math.round(coord[0]);
                    if (nearestIndex >= 0 && nearestIndex < data.length) {
                      echartsInstance.dispatchAction({
                        type: "showTip",
                        x: params.offsetX,
                        y: params.offsetY,
                        dataIndex: nearestIndex,
                      });
                    }
                  }
                } catch (e) {
                  // Fallback to default behavior if conversion fails
                }
              }
            }
          },
        }}
      />
    </div>
  );
};

export default KLineChart;
