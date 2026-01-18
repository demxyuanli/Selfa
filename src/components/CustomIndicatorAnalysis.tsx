import React, { useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import ChartDialog from "./ChartDialog";
import "./StockAnalysis.css";
import "./CustomIndicatorAnalysis.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CustomIndicatorAnalysisProps {
  klineData: StockData[];
}

interface CustomIndicator {
  id: string;
  name: string;
  formula: string;
  color: string;
  lineWidth: number;
}

const CustomIndicatorAnalysis: React.FC<CustomIndicatorAnalysisProps> = ({ klineData }) => {
  const { t } = useTranslation();
  const [indicators, setIndicators] = useState<CustomIndicator[]>([]);
  const [editingIndicator, setEditingIndicator] = useState<CustomIndicator | null>(null);
  const [formula, setFormula] = useState("");
  const [indicatorName, setIndicatorName] = useState("");
  const [indicatorColor, setIndicatorColor] = useState("#007acc");
  const [lineWidth, setLineWidth] = useState(1);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  const chartRef = useRef<ReactECharts>(null);

  // Evaluate custom indicator formula
  const evaluateIndicator = (formula: string, data: StockData[], index: number): number | null => {
    if (!formula.trim()) return null;

    try {
      // Replace common functions and variables
      const processedFormula = formula
        .replace(/CLOSE/gi, `data[${index}].close`)
        .replace(/OPEN/gi, `data[${index}].open`)
        .replace(/HIGH/gi, `data[${index}].high`)
        .replace(/LOW/gi, `data[${index}].low`)
        .replace(/VOLUME/gi, `data[${index}].volume`)
        .replace(/MA\(([^,]+),(\d+)\)/gi, (match, col, period) => {
          const periodNum = parseInt(period);
          if (index < periodNum - 1) return "null";
          const values: number[] = [];
          for (let i = index - periodNum + 1; i <= index; i++) {
            let val: number;
            if (col.trim().toUpperCase() === "CLOSE") val = data[i].close;
            else if (col.trim().toUpperCase() === "OPEN") val = data[i].open;
            else if (col.trim().toUpperCase() === "HIGH") val = data[i].high;
            else if (col.trim().toUpperCase() === "LOW") val = data[i].low;
            else if (col.trim().toUpperCase() === "VOLUME") val = data[i].volume;
            else return "null";
            values.push(val);
          }
          const sum = values.reduce((a, b) => a + b, 0);
          return (sum / periodNum).toString();
        })
        .replace(/EMA\(([^,]+),(\d+)\)/gi, (match, col, period) => {
          const periodNum = parseInt(period);
          if (index < periodNum - 1) return "null";
          const k = 2 / (periodNum + 1);
          let ema = 0;
          for (let i = 0; i < periodNum; i++) {
            let val: number;
            if (col.trim().toUpperCase() === "CLOSE") val = data[index - periodNum + 1 + i].close;
            else if (col.trim().toUpperCase() === "OPEN") val = data[index - periodNum + 1 + i].open;
            else if (col.trim().toUpperCase() === "HIGH") val = data[index - periodNum + 1 + i].high;
            else if (col.trim().toUpperCase() === "LOW") val = data[index - periodNum + 1 + i].low;
            else return "null";
            if (i === 0) ema = val;
            else ema = val * k + ema * (1 - k);
          }
          return ema.toString();
        })
        .replace(/REF\(([^,]+),(\d+)\)/gi, (match, col, shift) => {
          const shiftNum = parseInt(shift);
          if (index < shiftNum) return "null";
          if (col.trim().toUpperCase() === "CLOSE") return data[index - shiftNum].close.toString();
          else if (col.trim().toUpperCase() === "OPEN") return data[index - shiftNum].open.toString();
          else if (col.trim().toUpperCase() === "HIGH") return data[index - shiftNum].high.toString();
          else if (col.trim().toUpperCase() === "LOW") return data[index - shiftNum].low.toString();
          else if (col.trim().toUpperCase() === "VOLUME") return data[index - shiftNum].volume.toString();
          return "null";
        });

      // Evaluate the formula
      const result = new Function("data", "index", `return ${processedFormula}`)(data, index);
      return typeof result === "number" && isFinite(result) ? result : null;
    } catch (error) {
      console.error("Error evaluating indicator:", error);
      return null;
    }
  };

  // Calculate indicator values
  const calculateIndicator = (indicator: CustomIndicator): (number | null)[] => {
    return klineData.map((_, index) => evaluateIndicator(indicator.formula, klineData, index));
  };

  const handleAddIndicator = () => {
    if (!indicatorName.trim() || !formula.trim()) return;

    const newIndicator: CustomIndicator = {
      id: `indicator-${Date.now()}`,
      name: indicatorName,
      formula: formula,
      color: indicatorColor,
      lineWidth: lineWidth,
    };

    setIndicators([...indicators, newIndicator]);
    setIndicatorName("");
    setFormula("");
    setIndicatorColor("#007acc");
    setLineWidth(1);
  };

  const handleEditIndicator = (indicator: CustomIndicator) => {
    setEditingIndicator(indicator);
    setIndicatorName(indicator.name);
    setFormula(indicator.formula);
    setIndicatorColor(indicator.color);
    setLineWidth(indicator.lineWidth);
  };

  const handleUpdateIndicator = () => {
    if (!editingIndicator || !indicatorName.trim() || !formula.trim()) return;

    setIndicators(
      indicators.map((ind) =>
        ind.id === editingIndicator.id
          ? {
              ...ind,
              name: indicatorName,
              formula: formula,
              color: indicatorColor,
              lineWidth: lineWidth,
            }
          : ind
      )
    );
    setEditingIndicator(null);
    setIndicatorName("");
    setFormula("");
    setIndicatorColor("#007acc");
    setLineWidth(1);
  };

  const handleDeleteIndicator = (id: string) => {
    setIndicators(indicators.filter((ind) => ind.id !== id));
  };

  const chartOption = useMemo(() => {
    if (klineData.length === 0) return {};

    const dates = klineData.map((d) => {
      const dateStr = d.date;
      return dateStr.includes(" ") ? dateStr.split(" ")[0] : dateStr;
    });

    const closes = klineData.map((d) => d.close);
    const opens = klineData.map((d) => d.open);
    const highs = klineData.map((d) => d.high);
    const lows = klineData.map((d) => d.low);
    const volumes = klineData.map((d) => d.volume);

    const series: any[] = [
      {
        name: "Price",
        type: "line",
        data: closes,
        smooth: true,
        lineStyle: { color: "#007acc", width: 2 },
        itemStyle: { color: "#007acc" },
      },
    ];

    // Add custom indicators
    indicators.forEach((indicator) => {
      const values = calculateIndicator(indicator);
      series.push({
        name: indicator.name,
        type: "line",
        data: values,
        smooth: true,
        lineStyle: { color: indicator.color, width: indicator.lineWidth },
        itemStyle: { color: indicator.color },
      });
    });

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#555",
        textStyle: { color: "#ccc" },
      },
      legend: {
        data: ["Price", ...indicators.map((ind) => ind.name)],
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
      yAxis: {
        type: "value",
        axisLabel: { color: "#858585", fontSize: 9 },
        splitLine: { lineStyle: { color: "rgba(133, 133, 133, 0.15)" } },
      },
      series: series,
    };
  }, [klineData, indicators]);

  return (
    <div className="custom-indicator-analysis">
      <div className="analysis-columns">
        <div className="analysis-column params-column">
          <div className="column-header">{t("analysis.customIndicator")}</div>
          <div className="params-content">
            <div className="param-section">
              <label className="param-section-label">{t("analysis.indicatorName")}</label>
              <input
                type="text"
                value={indicatorName}
                onChange={(e) => setIndicatorName(e.target.value)}
                placeholder={t("analysis.indicatorNamePlaceholder")}
                className="param-input"
              />
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.indicatorFormula")}</label>
              <textarea
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="例如: MA(CLOSE, 20) 或 EMA(CLOSE, 12)"
                className="param-textarea"
                rows={4}
              />
              <div className="formula-help">
                <div className="help-title">{t("analysis.availableFunctions")}:</div>
                <div className="help-item">MA(COL, N) - {t("analysis.maDesc")}</div>
                <div className="help-item">EMA(COL, N) - {t("analysis.emaDesc")}</div>
                <div className="help-item">REF(COL, N) - {t("analysis.refDesc")}</div>
                <div className="help-title">{t("analysis.availableColumns")}:</div>
                <div className="help-item">CLOSE, OPEN, HIGH, LOW, VOLUME</div>
              </div>
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.color")}</label>
              <input
                type="color"
                value={indicatorColor}
                onChange={(e) => setIndicatorColor(e.target.value)}
                className="param-color"
              />
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.lineWidth")}</label>
              <input
                type="number"
                value={lineWidth}
                onChange={(e) => setLineWidth(parseInt(e.target.value) || 1)}
                min={1}
                max={5}
                className="param-input"
              />
            </div>
            <div className="param-section">
              {editingIndicator ? (
                <button onClick={handleUpdateIndicator} className="param-btn primary">
                  {t("analysis.updateIndicator")}
                </button>
              ) : (
                <button onClick={handleAddIndicator} className="param-btn primary">
                  {t("analysis.addIndicator")}
                </button>
              )}
            </div>
            <div className="param-section">
              <label className="param-section-label">{t("analysis.savedIndicators")}</label>
              <div className="indicators-list">
                {indicators.map((indicator) => (
                  <div key={indicator.id} className="indicator-item">
                    <div className="indicator-info">
                      <span className="indicator-name" style={{ color: indicator.color }}>
                        {indicator.name}
                      </span>
                      <span className="indicator-formula">{indicator.formula}</span>
                    </div>
                    <div className="indicator-actions">
                      <button
                        onClick={() => handleEditIndicator(indicator)}
                        className="indicator-btn"
                        title={t("analysis.edit")}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteIndicator(indicator.id)}
                        className="indicator-btn"
                        title={t("analysis.delete")}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
        title={`${t("analysis.customIndicator")} - ${t("chart.title")}`}
        chartOption={chartOption}
      />
    </div>
  );
};

export default CustomIndicatorAnalysis;
