import React, { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import ReactECharts from "echarts-for-react";
import ChartDialog from "./ChartDialog";
import "./StockAnalysis.css";
import "./AIAgentAnalysis.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface AIAnalysisResult {
  analysis: string;
  prediction: {
    price: number;
    confidence: number;
    trend: "bullish" | "bearish" | "neutral";
    reasoning: string;
  };
  risk_assessment: {
    level: "low" | "medium" | "high";
    factors: string[];
  };
  recommendations: string[];
  technical_summary: {
    indicators: Array<{
      name: string;
      value: number;
      signal: "buy" | "sell" | "hold";
    }>;
    overall_signal: "buy" | "sell" | "hold";
  };
  price_targets: Array<{
    period: string;
    target: number;
    probability: number;
  }>;
}

interface AIAgentAnalysisProps {
  klineData: StockData[];
  intradayData: StockData[];
  symbol: string;
  quote?: any;
}

const AIAgentAnalysis: React.FC<AIAgentAnalysisProps> = ({ klineData, intradayData, symbol, quote }) => {
  const { t } = useTranslation();
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  const chartRef = useRef<ReactECharts>(null);
  const [apiKey, setApiKey] = useState<string>("");
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [model, setModel] = useState<string>("gemini:gemini-2.5-flash");
  const [useLocalFallback, setUseLocalFallback] = useState(false);

  // Get display name for selected model
  const getModelDisplayName = (modelValue: string): string => {
    const modelMap: Record<string, string> = {
      "groq:llama-3.1-70b-versatile": "Groq Llama 3.1 70B",
      "groq:mixtral-8x7b-32768": "Groq Mixtral 8x7B",
      "grok:grok-4": "Grok 4",
      "gemini:gemini-3-flash-preview": "Gemini 3 Flash Preview",
      "gemini:gemini-2.5-flash": "Gemini 2.5 Flash",
      "gemini:gemini-1.5-flash": "Gemini 1.5 Flash",
      "gemini:gemini-1.5-pro": "Gemini 1.5 Pro",
      "huggingface:mistralai/Mistral-7B-Instruct-v0.2": "HF Mistral",
      "gpt-4o-mini": "GPT-4o Mini",
      "gpt-4o": "GPT-4o",
      "gpt-3.5-turbo": "GPT-3.5 Turbo",
      "claude-3-haiku": "Claude 3 Haiku",
      "claude-3-sonnet": "Claude 3 Sonnet",
    };
    return modelMap[modelValue] || modelValue;
  };

  const getProviderFromModel = (modelValue: string): string => {
    if (modelValue.startsWith("gpt")) return "openai";
    if (modelValue.startsWith("claude")) return "anthropic";
    if (modelValue.startsWith("groq") || modelValue.startsWith("llama") || modelValue.startsWith("mixtral")) return "groq";
    if (modelValue.startsWith("grok")) return "xai";
    if (modelValue.startsWith("gemini")) return "gemini";
    if (modelValue.startsWith("huggingface") || modelValue.includes("/")) return "huggingface";
    return "unknown";
  };

  useEffect(() => {
    if (klineData.length > 0) {
      const savedApiKey = localStorage.getItem("ai_api_key") || "";
      setApiKey(savedApiKey);
      
      const savedApiKeys = localStorage.getItem("ai_api_keys");
      if (savedApiKeys) {
        try {
          const keys = JSON.parse(savedApiKeys);
          setApiKeys(keys);
        } catch (e) {
          console.error("Failed to parse saved API keys:", e);
        }
      }
    }
  }, [klineData]);

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;
    
    const handleResize = () => {
      if (!isMounted) return;
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      resizeTimer = setTimeout(() => {
        if (!isMounted || !chartRef.current) return;
        try {
          const instance = chartRef.current.getEchartsInstance();
          if (instance && typeof instance.isDisposed === 'function' && !instance.isDisposed()) {
            instance.resize();
          }
        } catch (error) {
          // Ignore errors during resize
        }
      }, 100);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      isMounted = false;
      if (resizeTimer) {
        clearTimeout(resizeTimer);
        resizeTimer = null;
      }
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Separate effect for cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup ECharts instance on unmount
      // Use setTimeout to ensure cleanup happens after React's unmount cycle
      setTimeout(() => {
        if (chartRef.current) {
          try {
            const instance = chartRef.current.getEchartsInstance();
            if (instance && typeof instance.dispose === 'function' && typeof instance.isDisposed === 'function' && !instance.isDisposed()) {
              instance.dispose();
            }
          } catch (error) {
            // Ignore errors during cleanup - ResizeObserver may already be disconnected
            // This is a known issue with echarts-for-react when component unmounts
          }
        }
      }, 0);
    };
  }, []);

  const generateAIAnalysis = async () => {
    if (klineData.length < 20) {
      setError(t("aiAgent.insufficientData"));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (typeof window !== "undefined" && !(window as any).__TAURI__) {
        console.warn("Warning: Not running in Tauri environment. Some features may not work.");
      }
      
      const provider = getProviderFromModel(model);
      const providerKey = apiKeys[provider] || apiKey || "";
      
      const apiKeysMap: Record<string, string> = {};
      Object.keys(apiKeys).forEach(key => {
        if (apiKeys[key]) {
          apiKeysMap[key] = apiKeys[key];
        }
      });
      if (providerKey && !apiKeysMap[provider]) {
        apiKeysMap[provider] = providerKey;
      }
      
      const result: AIAnalysisResult = await invoke("ai_analyze_stock_with_keys", {
        symbol,
        data: klineData,
        intradayData: intradayData.length > 0 ? intradayData.slice(-480) : null,
        quote: quote || null,
        apiKey: providerKey || null,
        apiKeys: Object.keys(apiKeysMap).length > 0 ? apiKeysMap : null,
        model,
        useLocalFallback,
      });
      setAnalysisResult(result);
    } catch (err: any) {
      console.error("Error generating AI analysis:", err);
      const errorMsg = err?.toString() || err?.message || t("aiAgent.error");
      
      if (errorMsg.includes("Failed to fetch") || errorMsg.includes("ERR_CONNECTION_REFUSED")) {
        setError(t("aiAgent.connectionError"));
      } else if (errorMsg.includes("IPC")) {
        setError(t("aiAgent.ipcError"));
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    localStorage.setItem("ai_api_key", key);
  };

  const handleProviderApiKeyChange = (provider: string, key: string) => {
    const newApiKeys = { ...apiKeys, [provider]: key };
    setApiKeys(newApiKeys);
    localStorage.setItem("ai_api_keys", JSON.stringify(newApiKeys));
  };

  const getCurrentProviderKey = (): string => {
    const provider = getProviderFromModel(model);
    return apiKeys[provider] || apiKey || "";
  };

  const chartOption = useMemo(() => {
    if (klineData.length === 0 || !analysisResult) {
      return {};
    }

    const dates = klineData.map((d) => {
      const dateStr = d.date;
      if (dateStr.includes(" ")) {
        return dateStr.split(" ")[0];
      }
      return dateStr;
    });

    const closes = klineData.map((d) => d.close);
    const lastPrice = closes[closes.length - 1];
    const predictedPrice = analysisResult.prediction.price;

    // Add prediction point
    const futureDate = dates[dates.length - 1];
    const allDates = [...dates, futureDate];
    const priceData = [...closes, predictedPrice];

    return {
      backgroundColor: "transparent",
      grid: {
        left: "8%",
        right: "3%",
        top: "22%",
        bottom: "10%",
      },
      xAxis: {
        type: "category",
        data: allDates,
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
      graphic: [
        {
          type: "text",
          left: "center",
          top: "3%",
          style: {
            text: `${t("aiAgent.aiAnalysis")} - ${symbol}`,
            fontSize: 10,
            fontWeight: "bold",
            fill: "#858585",
          },
        },
      ],
      series: [
        {
          name: t("stock.price"),
          type: "line",
          data: priceData,
          symbol: "none",
          lineStyle: {
            color: "#007acc",
            width: 2,
          },
          markPoint: {
            data: [
              {
                name: t("analysis.currentPrice"),
                coord: [dates.length - 1, lastPrice],
                symbol: "circle",
                symbolSize: 8,
                itemStyle: { color: "#007acc" },
                label: {
                  show: true,
                  position: "top",
                  formatter: `${t("analysis.currentPrice")}\n${lastPrice.toFixed(2)}`,
                  fontSize: 9,
                  color: "#007acc",
                },
              },
              {
                name: t("aiAgent.predictedPrice"),
                coord: [dates.length, predictedPrice],
                symbol: "circle",
                symbolSize: 10,
                itemStyle: {
                  color: analysisResult.prediction.trend === "bullish" ? "#00ff00" :
                         analysisResult.prediction.trend === "bearish" ? "#ff0000" : "#ff9800",
                },
                label: {
                  show: true,
                  position: "top",
                  formatter: `${t("aiAgent.predictedPrice")}\n${predictedPrice.toFixed(2)}`,
                  fontSize: 9,
                  color: analysisResult.prediction.trend === "bullish" ? "#00ff00" :
                         analysisResult.prediction.trend === "bearish" ? "#ff0000" : "#ff9800",
                },
              },
            ],
          },
          markLine: {
            data: [
              {
                xAxis: dates.length - 1,
                lineStyle: {
                  color: "#ff9800",
                  type: "dashed",
                  width: 2,
                },
                label: {
                  show: true,
                  position: "insideEndTop",
                  formatter: t("aiAgent.predictionPoint"),
                  fontSize: 9,
                  color: "#ff9800",
                },
              },
            ],
          },
        },
      ],
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
      },
    };
  }, [klineData, analysisResult, symbol, t]);

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "bullish": return "#00ff00";
      case "bearish": return "#ff0000";
      default: return "#858585";
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "low": return "#00ff00";
      case "medium": return "#ff9800";
      case "high": return "#ff0000";
      default: return "#858585";
    }
  };

  return (
    <div className="ai-agent-analysis">
      <div className="analysis-columns">
        {/* Left Column: Configuration */}
        <div className="analysis-column params-column">
          <div className="column-header">{t("aiAgent.configuration")}</div>
          <div className="params-content">
            <div className="param-section">
              <label className="param-section-label">{t("aiAgent.apiSettings")}</label>
              <div className="param-inputs">
                <div className="param-item">
                  <span className="param-item-label">{t("aiAgent.model")}</span>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="param-select"
                    title={getModelDisplayName(model)}
                  >
                    <optgroup label={t("aiAgent.freeModels")}>
                      <option value="groq:llama-3.1-70b-versatile">Groq Llama 3.1 70B {t("aiAgent.modelFree")}</option>
                      <option value="groq:mixtral-8x7b-32768">Groq Mixtral 8x7B {t("aiAgent.modelFree")}</option>
                      <option value="gemini:gemini-3-flash-preview">Google Gemini 3 Flash Preview {t("aiAgent.modelFree")}</option>
                      <option value="gemini:gemini-2.5-flash">Google Gemini 2.5 Flash {t("aiAgent.modelFree")} {t("aiAgent.modelRecommended")}</option>
                      <option value="gemini:gemini-1.5-flash">Google Gemini 1.5 Flash {t("aiAgent.modelFree")}</option>
                      <option value="gemini:gemini-1.5-pro">Google Gemini 1.5 Pro {t("aiAgent.modelFree")}</option>
                      <option value="huggingface:mistralai/Mistral-7B-Instruct-v0.2">Hugging Face Mistral {t("aiAgent.modelFree")}</option>
                    </optgroup>
                    <optgroup label={t("aiAgent.paidModels")}>
                      <option value="grok:grok-4">Grok 4</option>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                      <option value="claude-3-haiku">Claude 3 Haiku</option>
                      <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                    </optgroup>
                  </select>
                </div>
                <div className="param-item">
                  <span className="param-item-label">
                    {getProviderFromModel(model) === "openai" && "OpenAI API Key"}
                    {getProviderFromModel(model) === "anthropic" && "Anthropic API Key"}
                    {getProviderFromModel(model) === "groq" && "Groq API Key"}
                    {getProviderFromModel(model) === "xai" && "X.AI API Key"}
                    {getProviderFromModel(model) === "gemini" && "Gemini API Key"}
                    {getProviderFromModel(model) === "huggingface" && "HuggingFace API Key"}
                    {getProviderFromModel(model) === "unknown" && t("aiAgent.apiKey")}
                  </span>
                  <input
                    type="password"
                    value={getCurrentProviderKey()}
                    onChange={(e) => {
                      const provider = getProviderFromModel(model);
                      if (provider !== "unknown") {
                        handleProviderApiKeyChange(provider, e.target.value);
                      } else {
                        handleApiKeyChange(e.target.value);
                      }
                    }}
                    placeholder={t("aiAgent.apiKeyPlaceholder")}
                    className="param-input"
                  />
                </div>
                <div className="param-item" style={{ marginTop: "4px" }}>
                  <div className="api-info">
                    <small>{t("aiAgent.freeApiInfo")}</small>
                  </div>
                </div>
                <div className="param-item">
                  <label className="param-checkbox">
                    <input
                      type="checkbox"
                      checked={useLocalFallback}
                      onChange={(e) => setUseLocalFallback(e.target.checked)}
                    />
                    <span>{t("aiAgent.useLocalFallback")}</span>
                  </label>
                </div>
              </div>
            </div>
            <button
              className="generate-btn"
              onClick={generateAIAnalysis}
              disabled={loading || klineData.length < 20}
            >
              {loading ? t("app.loading") : t("aiAgent.generateAnalysis")}
            </button>
            {error && (
              <div className="error-message">{error}</div>
            )}
          </div>
        </div>

        <div className="column-divider" />

        {/* Middle Column: Analysis Results */}
        <div className="analysis-column results-column">
          <div className="column-header">{t("aiAgent.analysisResults")}</div>
          <div className="results-content">
            {loading ? (
              <div className="no-data">{t("app.loading")}</div>
            ) : analysisResult ? (
              <div className="ai-results">
                {/* Prediction Summary */}
                <div className="ai-result-card prediction-card">
                  <div className="card-header">
                    <span className="card-title">{t("aiAgent.prediction")}</span>
                    <span
                      className="trend-badge"
                      style={{ backgroundColor: getTrendColor(analysisResult.prediction.trend) }}
                    >
                      {t(`aiAgent.${analysisResult.prediction.trend}`)}
                    </span>
                  </div>
                  <div className="prediction-price">
                    {t("aiAgent.predictedPrice")}: {analysisResult.prediction.price.toFixed(2)}
                  </div>
                  <div className="prediction-confidence">
                    {t("analysis.confidence")}: {analysisResult.prediction.confidence.toFixed(0)}%
                    <div className="confidence-bar-mini">
                      <div
                        className="confidence-fill-mini"
                        style={{
                          width: `${analysisResult.prediction.confidence}%`,
                          backgroundColor: getTrendColor(analysisResult.prediction.trend),
                        }}
                      />
                    </div>
                  </div>
                  <div className="prediction-reasoning">
                    <strong>{t("aiAgent.reasoning")}:</strong>
                    <p>{analysisResult.prediction.reasoning}</p>
                  </div>
                </div>

                {/* Risk Assessment */}
                <div className="ai-result-card risk-card">
                  <div className="card-header">
                    <span className="card-title">{t("aiAgent.riskAssessment")}</span>
                    <span
                      className="risk-badge"
                      style={{ backgroundColor: getRiskColor(analysisResult.risk_assessment.level) }}
                    >
                      {t(`aiAgent.risk${analysisResult.risk_assessment.level.charAt(0).toUpperCase() + analysisResult.risk_assessment.level.slice(1)}`)}
                    </span>
                  </div>
                  <ul className="risk-factors">
                    {analysisResult.risk_assessment.factors.map((factor, idx) => (
                      <li key={idx}>{factor}</li>
                    ))}
                  </ul>
                </div>

                {/* Recommendations */}
                <div className="ai-result-card recommendations-card">
                  <div className="card-header">
                    <span className="card-title">{t("aiAgent.recommendations")}</span>
                  </div>
                  <ul className="recommendations-list">
                    {analysisResult.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>

                {/* Technical Summary */}
                <div className="ai-result-card technical-card">
                  <div className="card-header">
                    <span className="card-title">{t("aiAgent.technicalSummary")}</span>
                    <span
                      className="signal-badge"
                      style={{ backgroundColor: getTrendColor(analysisResult.technical_summary.overall_signal === "buy" ? "bullish" : analysisResult.technical_summary.overall_signal === "sell" ? "bearish" : "neutral") }}
                    >
                      {t(`analysis.${analysisResult.technical_summary.overall_signal}`)}
                    </span>
                  </div>
                  <div className="indicators-list">
                    {analysisResult.technical_summary.indicators.map((ind, idx) => (
                      <div key={idx} className="indicator-item">
                        <span className="indicator-name">{ind.name}:</span>
                        <span className="indicator-value">{ind.value.toFixed(2)}</span>
                        <span
                          className="indicator-signal"
                          style={{ color: getTrendColor(ind.signal === "buy" ? "bullish" : ind.signal === "sell" ? "bearish" : "neutral") }}
                        >
                          {t(`analysis.${ind.signal}`)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Price Targets */}
                {analysisResult.price_targets.length > 0 && (
                  <div className="ai-result-card targets-card">
                    <div className="card-header">
                      <span className="card-title">{t("aiAgent.priceTargets")}</span>
                    </div>
                    <div className="targets-list">
                      {analysisResult.price_targets.map((target, idx) => (
                        <div key={idx} className="target-item">
                          <span className="target-period">{target.period}:</span>
                          <span className="target-price">{target.target.toFixed(2)}</span>
                          <span className="target-probability">({target.probability.toFixed(0)}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Analysis */}
                <div className="ai-result-card analysis-card">
                  <div className="card-header">
                    <span className="card-title">{t("aiAgent.fullAnalysis")}</span>
                  </div>
                  <div className="analysis-text">
                    {analysisResult.analysis.split("\n").map((paragraph, idx) => (
                      <p key={idx}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-data">{t("aiAgent.noAnalysis")}</div>
            )}
          </div>
        </div>

        <div className="column-divider" />

        {/* Right Column: Chart */}
        <div className="analysis-column chart-column">
          <div className="column-header">
            <span>{t("analysis.chart")}</span>
            <button
              className="chart-zoom-button"
              onClick={() => setIsChartDialogOpen(true)}
              title={t("chart.zoom")}
            >
              ZO
            </button>
          </div>
          <div className="chart-content">
            {loading ? (
              <div className="no-data">{t("app.loading")}</div>
            ) : Object.keys(chartOption).length === 0 ? (
              <div className="no-data">{t("analysis.noData")}</div>
            ) : (
              <ReactECharts
                ref={chartRef}
                option={chartOption}
                style={{ height: "100%", width: "100%" }}
                opts={{ renderer: "canvas" }}
                notMerge={true}
                lazyUpdate={true}
              />
            )}
          </div>
        </div>
      </div>
      <ChartDialog
        isOpen={isChartDialogOpen}
        onClose={() => setIsChartDialogOpen(false)}
        title={`${t("aiAgent.aiAnalysis")} - ${t("chart.title")}`}
        chartOption={chartOption}
      />
    </div>
  );
};

export default AIAgentAnalysis;
