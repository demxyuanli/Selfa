import React, { useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import ChartDialog from "./ChartDialog";
import Icon from "./Icon";
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

interface IndicatorAnalysis {
  indicatorId: string;
  currentValue: number | null;
  previousValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  trend: "up" | "down" | "neutral";
  signal: "buy" | "sell" | "hold";
  signalStrength: number;
  description: string;
}

interface PresetModel {
  id: string;
  nameKey: string;
  categoryId: "trend" | "momentum";
  formulaTemplate: string;
  defaultParams: Record<string, number>;
  descriptionKey: string;
}

const PRESET_MODELS: PresetModel[] = [
  {
    id: "sma",
    nameKey: "analysis.presetModels.sma.name",
    categoryId: "trend",
    formulaTemplate: "MA(CLOSE, {period})",
    defaultParams: { period: 20 },
    descriptionKey: "analysis.presetModels.sma.description",
  },
  {
    id: "ema",
    nameKey: "analysis.presetModels.ema.name",
    categoryId: "trend",
    formulaTemplate: "EMA(CLOSE, {period})",
    defaultParams: { period: 12 },
    descriptionKey: "analysis.presetModels.ema.description",
  },
  {
    id: "macd",
    nameKey: "analysis.presetModels.macd.name",
    categoryId: "momentum",
    formulaTemplate: "EMA(CLOSE, {fast}) - EMA(CLOSE, {slow})",
    defaultParams: { fast: 12, slow: 26 },
    descriptionKey: "analysis.presetModels.macd.description",
  },
  {
    id: "sma5",
    nameKey: "analysis.presetModels.sma5.name",
    categoryId: "trend",
    formulaTemplate: "MA(CLOSE, {period})",
    defaultParams: { period: 5 },
    descriptionKey: "analysis.presetModels.sma5.description",
  },
  {
    id: "sma10",
    nameKey: "analysis.presetModels.sma10.name",
    categoryId: "trend",
    formulaTemplate: "MA(CLOSE, {period})",
    defaultParams: { period: 10 },
    descriptionKey: "analysis.presetModels.sma10.description",
  },
  {
    id: "ema26",
    nameKey: "analysis.presetModels.ema26.name",
    categoryId: "trend",
    formulaTemplate: "EMA(CLOSE, {period})",
    defaultParams: { period: 26 },
    descriptionKey: "analysis.presetModels.ema26.description",
  },
  {
    id: "triple_ma",
    nameKey: "analysis.presetModels.triple_ma.name",
    categoryId: "trend",
    formulaTemplate: "(MA(CLOSE, {fast}) + MA(CLOSE, {medium}) + MA(CLOSE, {slow})) / 3",
    defaultParams: { fast: 5, medium: 10, slow: 20 },
    descriptionKey: "analysis.presetModels.triple_ma.description",
  },
  {
    id: "price_change",
    nameKey: "analysis.presetModels.price_change.name",
    categoryId: "momentum",
    formulaTemplate: "((CLOSE - REF(CLOSE, {period})) / REF(CLOSE, {period})) * 100",
    defaultParams: { period: 1 },
    descriptionKey: "analysis.presetModels.price_change.description",
  },
  {
    id: "ema_cross",
    nameKey: "analysis.presetModels.ema_cross.name",
    categoryId: "trend",
    formulaTemplate: "EMA(CLOSE, {fast}) - EMA(CLOSE, {slow})",
    defaultParams: { fast: 12, slow: 26 },
    descriptionKey: "analysis.presetModels.ema_cross.description",
  },
];

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
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [presetParams, setPresetParams] = useState<Record<string, number>>({});

  // Evaluate custom indicator formula
  const evaluateIndicator = (formula: string, data: StockData[], index: number): number | null => {
    if (!formula.trim()) return null;

    let processedFormula: string = "";
    try {
      // Replace common functions and variables
      processedFormula = formula
        .replace(/CLOSE/gi, `data[${index}].close`)
        .replace(/OPEN/gi, `data[${index}].open`)
        .replace(/HIGH/gi, `data[${index}].high`)
        .replace(/LOW/gi, `data[${index}].low`)
        .replace(/VOLUME/gi, `data[${index}].volume`)
        .replace(/MA\(([^,]+),(\d+)\)/gi, (_match, col, period) => {
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
        .replace(/EMA\(([^,]+),(\d+)\)/gi, (_match, col, period) => {
          const periodNum = parseInt(period);
          if (index < periodNum - 1) return "null";
          const k = 2 / (periodNum + 1);
          // Calculate EMA from the start up to current index
          let ema = 0;
          let startIdx = Math.max(0, index - periodNum + 1);
          // Initialize with first value (SMA of first periodNum values)
          let firstVal: number;
          if (col.trim().toUpperCase() === "CLOSE") firstVal = data[startIdx].close;
          else if (col.trim().toUpperCase() === "OPEN") firstVal = data[startIdx].open;
          else if (col.trim().toUpperCase() === "HIGH") firstVal = data[startIdx].high;
          else if (col.trim().toUpperCase() === "LOW") firstVal = data[startIdx].low;
          else return "null";
          
          ema = firstVal;
          // Apply EMA calculation from startIdx+1 to index
          for (let i = startIdx + 1; i <= index; i++) {
            let val: number;
            if (col.trim().toUpperCase() === "CLOSE") val = data[i].close;
            else if (col.trim().toUpperCase() === "OPEN") val = data[i].open;
            else if (col.trim().toUpperCase() === "HIGH") val = data[i].high;
            else if (col.trim().toUpperCase() === "LOW") val = data[i].low;
            else return "null";
            ema = val * k + ema * (1 - k);
          }
          return ema.toString();
        })
        .replace(/REF\(([^,]+),(\d+)\)/gi, (_match, col, shift) => {
          const shiftNum = parseInt(shift);
          if (index < shiftNum) return "null";
          if (col.trim().toUpperCase() === "CLOSE") return data[index - shiftNum].close.toString();
          else if (col.trim().toUpperCase() === "OPEN") return data[index - shiftNum].open.toString();
          else if (col.trim().toUpperCase() === "HIGH") return data[index - shiftNum].high.toString();
          else if (col.trim().toUpperCase() === "LOW") return data[index - shiftNum].low.toString();
          else if (col.trim().toUpperCase() === "VOLUME") return data[index - shiftNum].volume.toString();
          return "null";
        });

      // Check if formula contains "null" which would cause evaluation issues
      if (processedFormula.includes("null")) {
        return null;
      }

      // Evaluate the formula
      const result = new Function("data", "index", `return ${processedFormula}`)(data, index);
      return typeof result === "number" && isFinite(result) ? result : null;
    } catch (error) {
      console.error("Error evaluating indicator:", error, "Formula:", formula, "Processed:", processedFormula || "(not processed)");
      return null;
    }
  };

  // Calculate indicator values
  const calculateIndicator = (indicator: CustomIndicator): (number | null)[] => {
    return klineData.map((_, index) => evaluateIndicator(indicator.formula, klineData, index));
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = PRESET_MODELS.find(p => p.id === presetId);
    if (preset) {
      setIndicatorName(t(preset.nameKey));
      setPresetParams({ ...preset.defaultParams });
      // Generate formula with default params
      let generatedFormula = preset.formulaTemplate;
      Object.keys(preset.defaultParams).forEach(key => {
        generatedFormula = generatedFormula.replace(`{${key}}`, preset.defaultParams[key].toString());
      });
      setFormula(generatedFormula);
    }
  };

  const handleParamChange = (paramKey: string, value: number) => {
    const newParams = { ...presetParams, [paramKey]: value };
    setPresetParams(newParams);
    
    // Update formula with new params
    if (selectedPreset) {
      const preset = PRESET_MODELS.find(p => p.id === selectedPreset);
      if (preset) {
        let generatedFormula = preset.formulaTemplate;
        Object.keys(newParams).forEach(key => {
          generatedFormula = generatedFormula.replace(`{${key}}`, newParams[key].toString());
        });
        setFormula(generatedFormula);
      }
    }
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
    setSelectedPreset("");
    setPresetParams({});
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

  // Analyze indicator values
  const analyzeIndicators = useMemo((): IndicatorAnalysis[] => {
    if (indicators.length === 0 || klineData.length === 0) return [];

    return indicators.map((indicator) => {
      const values = calculateIndicator(indicator);
      const validValues = values.filter((v): v is number => v !== null && isFinite(v));
      
      // Filter out values at the beginning that are null due to insufficient data
      // Keep only the last valid values for analysis
      const lastValidValues = validValues.slice(Math.max(0, validValues.length - 50));
      
      if (lastValidValues.length === 0) {
        // Check data availability
        const minRequiredData = indicator.formula.match(/MA\([^,]+,(\d+)\)/gi)?.map(m => {
          const match = m.match(/(\d+)/);
          return match ? parseInt(match[1]) : 0;
        }).reduce((a, b) => Math.max(a, b), 0) || 0;
        
        const emaRequired = indicator.formula.match(/EMA\([^,]+,(\d+)\)/gi)?.map(m => {
          const match = m.match(/(\d+)/);
          return match ? parseInt(match[1]) : 0;
        }).reduce((a, b) => Math.max(a, b), 0) || 0;
        
        const requiredData = Math.max(minRequiredData, emaRequired);
        
        let errorMsg = t("analysis.noData");
        if (requiredData > klineData.length) {
          errorMsg = t("analysis.insufficientDataForIndicator", { required: requiredData, available: klineData.length });
        }
        
        return {
          indicatorId: indicator.id,
          currentValue: null,
          previousValue: null,
          minValue: null,
          maxValue: null,
          trend: "neutral",
          signal: "hold",
          signalStrength: 0,
          description: errorMsg,
        };
      }

      const currentValue = lastValidValues[lastValidValues.length - 1];
      const previousValue = lastValidValues.length > 1 ? lastValidValues[lastValidValues.length - 2] : null;
      const minValue = Math.min(...lastValidValues);
      const maxValue = Math.max(...lastValidValues);
      
      // Determine trend
      let trend: "up" | "down" | "neutral" = "neutral";
      if (previousValue !== null) {
        const changePercent = ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
        if (changePercent > 1) trend = "up";
        else if (changePercent < -1) trend = "down";
      }

      // Determine signal based on indicator position and trend
      let signal: "buy" | "sell" | "hold" = "hold";
      let signalStrength = 0;
      let description = "";

      if (maxValue !== minValue) {
        const positionPercent = ((currentValue - minValue) / (maxValue - minValue)) * 100;
        
        if (positionPercent < 20 && trend === "up") {
          signal = "buy";
          signalStrength = 7;
          description = t("analysis.indicatorLowBullish");
        } else if (positionPercent > 80 && trend === "down") {
          signal = "sell";
          signalStrength = -7;
          description = t("analysis.indicatorHighBearish");
        } else if (positionPercent < 30 && trend === "up") {
          signal = "buy";
          signalStrength = 5;
          description = t("analysis.indicatorLowRising");
        } else if (positionPercent > 70 && trend === "down") {
          signal = "sell";
          signalStrength = -5;
          description = t("analysis.indicatorHighFalling");
        } else if (trend === "up") {
          signal = "buy";
          signalStrength = 3;
          description = t("analysis.indicatorRising");
        } else if (trend === "down") {
          signal = "sell";
          signalStrength = -3;
          description = t("analysis.indicatorFalling");
        } else {
          description = t("analysis.indicatorNeutral");
        }
      }

      return {
        indicatorId: indicator.id,
        currentValue,
        previousValue,
        minValue,
        maxValue,
        trend,
        signal,
        signalStrength,
        description,
      };
    });
  }, [indicators, klineData, t]);

  const chartOption = useMemo(() => {
    if (klineData.length === 0) return {};

    const dates = klineData.map((d) => {
      const dateStr = d.date;
      return dateStr.includes(" ") ? dateStr.split(" ")[0] : dateStr;
    });

    const closes = klineData.map((d) => d.close);

    const series: any[] = [
      {
        name: t("analysis.price"),
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
        axisPointer: {
          type: "cross",
          snap: true,
        },
        backgroundColor: "rgba(37, 37, 38, 0.95)",
        borderColor: "#555",
        textStyle: { color: "#ccc" },
      },
      legend: {
        data: [t("analysis.price"), ...indicators.map((ind) => ind.name)],
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
        axisPointer: {
          snap: true,
        },
      },
      yAxis: {
        type: "value",
        axisPointer: {
          snap: true,
        },
        axisLabel: { color: "#858585", fontSize: 9 },
        splitLine: { lineStyle: { color: "rgba(133, 133, 133, 0.15)" } },
      },
      series: series,
    };
  }, [klineData, indicators, t]);

  return (
    <div className="custom-indicator-analysis">
      <div className="analysis-columns">
        <div className="analysis-column params-column">
          <div className="column-header">{t("analysis.customIndicator")}</div>
          <div className="params-content">
            <div className="param-section">
              <label className="param-section-label">{t("analysis.presetModel")}</label>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="param-select"
              >
                <option value="">{t("analysis.selectPreset")}</option>
                {Object.entries(
                  PRESET_MODELS.reduce((acc, model) => {
                    const categoryKey = model.categoryId === "trend" ? "categoryTrend" : "categoryMomentum";
                    if (!acc[categoryKey]) acc[categoryKey] = [];
                    acc[categoryKey].push(model);
                    return acc;
                  }, {} as Record<string, PresetModel[]>)
                ).map(([categoryKey, models]) => (
                  <optgroup key={categoryKey} label={t(`analysis.${categoryKey}`)}>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {t(model.nameKey)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selectedPreset && (
                <div className="preset-description">
                  {t(PRESET_MODELS.find(p => p.id === selectedPreset)?.descriptionKey || "")}
                </div>
              )}
            </div>
            {selectedPreset && Object.keys(presetParams).length > 0 && (
              <div className="param-section">
                <label className="param-section-label">{t("analysis.parameters")}</label>
                {Object.keys(presetParams).map((key) => (
                  <div key={key} className="param-item">
                    <label className="param-item-label">{key}:</label>
                    <input
                      type="number"
                      value={presetParams[key]}
                      onChange={(e) => handleParamChange(key, parseInt(e.target.value) || 0)}
                      min={1}
                      max={200}
                      className="param-input"
                    />
                  </div>
                ))}
              </div>
            )}
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
                placeholder={t("customIndicator.formulaPlaceholder")}
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
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteIndicator(indicator.id)}
                        className="indicator-btn"
                        title={t("analysis.delete")}
                      >
                        <Icon name="delete" size={14} />
                        <Icon name="delete" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="column-divider" />
        <div className="analysis-column results-column">
          <div className="column-header">{t("analysis.results")}</div>
          <div className="results-content">
            {analyzeIndicators.length === 0 ? (
              <div className="no-data">{t("analysis.noIndicators")}</div>
            ) : (
              <div className="results-list">
                {analyzeIndicators.map((analysis) => {
                  const indicator = indicators.find((ind) => ind.id === analysis.indicatorId);
                  if (!indicator) return null;

                  const getSignalColor = (signal: string) => {
                    if (signal === "buy") return "#00ff00";
                    if (signal === "sell") return "#ff0000";
                    return "#858585";
                  };

                  return (
                    <div key={analysis.indicatorId} className="result-card">
                      <div className="result-header">
                        <span className="result-title" style={{ color: indicator.color }}>
                          {indicator.name}
                        </span>
                        <span
                          className="result-signal"
                          style={{ backgroundColor: getSignalColor(analysis.signal) }}
                        >
                          {t(`analysis.${analysis.signal}`)}
                        </span>
                      </div>
                      <div className="result-desc">
                        {analysis.description}
                      </div>
                      <div className="indicator-stats">
                        {analysis.currentValue !== null && (
                          <div className="stat-row">
                            <span className="stat-label">{t("analysis.currentValue")}:</span>
                            <span className="stat-value">{analysis.currentValue.toFixed(2)}</span>
                          </div>
                        )}
                        {analysis.previousValue !== null && (
                          <div className="stat-row">
                            <span className="stat-label">{t("analysis.previousValue")}:</span>
                            <span className="stat-value">{analysis.previousValue.toFixed(2)}</span>
                            {analysis.currentValue !== null && (
                              <span
                                className={`stat-change ${
                                  analysis.currentValue >= analysis.previousValue ? "positive" : "negative"
                                }`}
                              >
                                {analysis.currentValue >= analysis.previousValue ? "+" : ""}
                                {(
                                  ((analysis.currentValue - analysis.previousValue) /
                                    Math.abs(analysis.previousValue)) *
                                  100
                                ).toFixed(2)}
                                %
                              </span>
                            )}
                          </div>
                        )}
                        {analysis.minValue !== null && analysis.maxValue !== null && (
                          <div className="stat-row">
                            <span className="stat-label">{t("analysis.range")}:</span>
                            <span className="stat-value">
                              {analysis.minValue.toFixed(2)} - {analysis.maxValue.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="confidence-bar">
                        <span className="confidence-text">
                          {t("analysis.signalStrength")}: {Math.abs(analysis.signalStrength)}
                        </span>
                        <div className="confidence-track">
                          <div
                            className="confidence-fill"
                            style={{
                              width: `${Math.abs(analysis.signalStrength) * 10}%`,
                              backgroundColor: getSignalColor(analysis.signal),
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="column-divider" />
        <div className="analysis-column chart-column">
          <div className="column-header">
            <span>{t("analysis.chart")}</span>
            <button
              className="chart-zoom-button"
              onClick={() => setIsChartDialogOpen(true)}
              title={t("chart.zoom")}
            >
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
        title={`${t("analysis.customIndicator")} - ${t("chart.title")}`}
        chartOption={chartOption}
      />
    </div>
  );
};

export default CustomIndicatorAnalysis;
