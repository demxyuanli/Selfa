import React, { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TargetPattern {
  dates: string[];
  closes: number[];
}

interface SimilarityResult {
  match_date: string;
  similarity_score: number;
  pattern_dates: string[];
  pattern_closes: number[];
  future_data: StockData[];
}

interface SimilarityPredictionResponse {
  target_pattern: TargetPattern;
  matches: SimilarityResult[];
}

interface SimilarityPredictionProps {
  symbol: string;
  currentData?: StockData[];
}

function normalizePct(closes: number[]): number[] {
  if (closes.length === 0) return [];
  const first = closes[0];
  if (first === 0) return closes.map(() => 0);
  return closes.map((c) => ((c - first) / first) * 100);
}

const SimilarityPrediction: React.FC<SimilarityPredictionProps> = ({ symbol }) => {
  const { t } = useTranslation();
  const [response, setResponse] = useState<SimilarityPredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookback, setLookback] = useState(60);
  const [horizon, setHorizon] = useState(20);
  const [topN, setTopN] = useState(8);

  const fetchPrediction = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke<SimilarityPredictionResponse>("get_similarity_prediction", {
        symbol,
        period: "daily",
        lookbackWindow: lookback,
        forecastHorizon: horizon,
        topN,
      });
      setResponse(res);
    } catch (err) {
      console.error("Error fetching similarity prediction:", err);
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, lookback, horizon, topN]);

  useEffect(() => {
    fetchPrediction();
  }, [symbol]);

  const matches = response?.matches ?? [];
  const target = response?.target_pattern;

  const overlayData = useMemo(() => {
    if (!target?.closes?.length) return null;
    const targetNorm = normalizePct(target.closes);
    const labels = target.dates.map((d) => (d.length > 10 ? d.slice(0, 10) : d));
    const datasets: any[] = [
      {
        label: t("similarity.targetLabel"),
        data: targetNorm,
        borderColor: "rgb(255, 99, 132)",
        backgroundColor: "rgba(255, 99, 132, 0.1)",
        borderWidth: 3,
        pointRadius: 0,
        tension: 0.4,
        fill: { target: "origin", above: "rgba(255,99,132,0.08)", below: "rgba(255,99,132,0.08)" },
      },
    ];
    matches.forEach((m, idx) => {
      if (!m.pattern_closes?.length) return;
      const norm = normalizePct(m.pattern_closes);
      const alpha = Math.max(0.15, 1 - idx * 0.12);
      datasets.push({
        label: `${m.match_date} (${(m.similarity_score * 100).toFixed(1)}%)`,
        data: norm,
        borderColor: `rgba(54, 162, 235, ${alpha})`,
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.4,
        borderDash: [4, 2],
      });
    });
    return { labels, datasets };
  }, [target, matches, t]);

  const fanData = useMemo(() => {
    if (matches.length === 0) return null;
    const labels = [...Array(horizon).keys()].map((i) => `+${i + 1}${t("time.daysShort")}`);
    const series = matches.map((m) => {
      const start = m.future_data[0]?.open ?? m.future_data[0]?.close ?? 1;
      return m.future_data.map((d) => ((d.close - start) / start) * 100);
    });
    const mean: number[] = [];
    for (let i = 0; i < horizon; i++) {
      let s = 0;
      let c = 0;
      series.forEach((row) => {
        if (row[i] != null) {
          s += row[i];
          c += 1;
        }
      });
      mean.push(c > 0 ? s / c : 0);
    }
    const datasets: any[] = [
      {
        label: t("similarity.meanLabel"),
        data: mean,
        borderColor: "rgb(255, 159, 64)",
        backgroundColor: "rgba(255, 159, 64, 0.15)",
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.4,
        fill: { target: "origin", above: "rgba(255,159,64,0.1)", below: "rgba(255,159,64,0.1)" },
      },
    ];
    matches.forEach((m, idx) => {
      const start = m.future_data[0]?.open ?? m.future_data[0]?.close ?? 1;
      const data = m.future_data.map((d) => ((d.close - start) / start) * 100);
      const alpha = Math.max(0.2, 1 - idx * 0.12);
      datasets.push({
        label: `${m.match_date} (${(m.similarity_score * 100).toFixed(1)}%)`,
        data,
        borderColor: `rgba(54, 162, 235, ${alpha})`,
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.4,
        borderDash: [3, 2],
      });
    });
    return { labels, datasets };
  }, [matches, horizon, t]);

  const tableRows = useMemo(() => {
    return matches.map((m) => {
      const start = m.future_data[0]?.open ?? m.future_data[0]?.close ?? 1;
      const end = m.future_data[m.future_data.length - 1]?.close ?? start;
      const ret = ((end - start) / start) * 100;
      return { match_date: m.match_date, score: m.similarity_score * 100, futureReturn: ret };
    });
  }, [matches]);

  const stats = useMemo(() => {
    if (tableRows.length === 0) return null;
    const returns = tableRows.map((r) => r.futureReturn);
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const sorted = [...returns].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const wins = returns.filter((r) => r > 0).length;
    const winRate = (wins / returns.length) * 100;
    const minReturn = Math.min(...returns);
    const maxReturn = Math.max(...returns);
    return { avg, median, winRate, minReturn, maxReturn };
  }, [tableRows]);

  const currentPrice = target?.closes?.length
    ? target.closes[target.closes.length - 1]
    : null;

  const priceRange = useMemo(() => {
    if (currentPrice == null || !stats) return null;
    const low = currentPrice * (1 + stats.minReturn / 100);
    const high = currentPrice * (1 + stats.maxReturn / 100);
    return { low, high };
  }, [currentPrice, stats]);

  const chartOptionsBase = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 8, bottom: 8, left: 8, right: 8 } },
      plugins: {
        legend: { position: "top" as const, labels: { boxWidth: 10, font: { size: 10 } } },
        tooltip: {
          callbacks: {
            label: (ctx: { dataset?: { label?: string }; raw?: unknown }) =>
              `${ctx.dataset?.label ?? ""}: ${Number(ctx.raw ?? 0).toFixed(2)}%`,
          },
        },
      },
    }),
    []
  );

  const chartOptions = (yTitle: string) => ({
    ...chartOptionsBase,
    scales: {
      y: { title: { display: true, text: yTitle } },
    },
  });

  return (
    <div
      className="similarity-prediction"
      style={{
        height: "100%",
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        overflow: "auto",
      }}
    >
      <div
        className="controls"
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          background: "#333",
          padding: "10px",
          borderRadius: "8px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <label style={{ color: "#ccc", fontSize: "12px" }}>{t("similarity.lookback")}:</label>
          <input
            type="number"
            value={lookback}
            onChange={(e) => setLookback(Number(e.target.value))}
            style={{
              width: "56px",
              background: "#444",
              border: "1px solid #555",
              color: "white",
              padding: "2px 6px",
              borderRadius: "4px",
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <label style={{ color: "#ccc", fontSize: "12px" }}>{t("similarity.horizon")}:</label>
          <input
            type="number"
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            style={{
              width: "56px",
              background: "#444",
              border: "1px solid #555",
              color: "white",
              padding: "2px 6px",
              borderRadius: "4px",
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <label style={{ color: "#ccc", fontSize: "12px" }}>Top N:</label>
          <input
            type="number"
            min={1}
            max={20}
            value={topN}
            onChange={(e) => setTopN(Math.max(1, Math.min(20, Number(e.target.value))))}
            style={{
              width: "48px",
              background: "#444",
              border: "1px solid #555",
              color: "white",
              padding: "2px 6px",
              borderRadius: "4px",
            }}
          />
        </div>
        <button
          onClick={fetchPrediction}
          disabled={loading}
          style={{
            padding: "4px 12px",
            background: "#2196f3",
            border: "none",
            borderRadius: "4px",
            color: "white",
            cursor: "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? t("app.loading") : t("similarity.refresh")}
        </button>
      </div>

      {!response && !loading && (
        <div className="no-data" style={{ padding: "20px", color: "#888" }}>
          {t("similarity.noData")}
        </div>
      )}

      {response && (
        <>
          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                flex: "2 1 520px",
                minWidth: "360px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#ddd" }}>
                  {t("similarity.overlayTitle")}
                </div>
                <div style={{ minHeight: "240px", position: "relative" }}>
                  {overlayData && overlayData.datasets.length > 0 ? (
                    <Line data={overlayData} options={chartOptions(t("similarity.percentChange"))} />
                  ) : (
                    <div style={{ padding: "20px", color: "#666" }}>{t("similarity.noData")}</div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#ddd" }}>
                  {t("similarity.fanTitle")}
                </div>
                <div style={{ minHeight: "240px", position: "relative" }}>
                  {fanData && fanData.datasets.length > 0 ? (
                    <Line data={fanData} options={chartOptions(t("similarity.percentChange"))} />
                  ) : (
                    <div style={{ padding: "20px", color: "#666" }}>{t("similarity.noData")}</div>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                flex: "1 1 380px",
                minWidth: "320px",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#ddd" }}>
                {t("similarity.tableTitle")}
              </div>
              <div
                style={{
                  background: "#252526",
                  borderRadius: "6px",
                  overflow: "auto",
                  fontSize: "12px",
                  flex: 1,
                  minHeight: "360px",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#333" }}>
                      <th style={{ padding: "8px 10px", textAlign: "left", color: "#ccc" }}>
                        {t("similarity.matchDate")}
                      </th>
                      <th style={{ padding: "8px 10px", textAlign: "right", color: "#ccc" }}>
                        {t("similarity.score")} %
                      </th>
                      <th style={{ padding: "8px 10px", textAlign: "right", color: "#ccc" }}>
                        {t("similarity.futureReturn")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((r, i) => (
                      <tr
                        key={r.match_date}
                        style={{
                          borderTop: "1px solid #333",
                          background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.03)",
                        }}
                      >
                        <td style={{ padding: "6px 10px", color: "#e0e0e0" }}>{r.match_date}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right", color: "#9cdcfe" }}>
                          {r.score.toFixed(1)}
                        </td>
                        <td
                          style={{
                            padding: "6px 10px",
                            textAlign: "right",
                            color: r.futureReturn >= 0 ? "#4ec9b0" : "#f48771",
                          }}
                        >
                          {(r.futureReturn >= 0 ? "+" : "") + r.futureReturn.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {stats && tableRows.length > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: "1px solid #555", background: "#2d2d30" }}>
                        <td style={{ padding: "8px 10px", color: "#888" }}>
                          {t("similarity.avgReturn")} / {t("similarity.medianReturn")} /{" "}
                          {t("similarity.winRate")}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }} />
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#ccc" }}>
                          {stats.avg.toFixed(2)}% / {stats.median.toFixed(2)}% / {stats.winRate.toFixed(0)}%
                        </td>
                      </tr>
                      <tr style={{ borderTop: "1px solid #444", background: "#2d2d30" }}>
                        <td style={{ padding: "8px 10px", color: "#9cdcfe" }}>
                          {t("similarity.predictedRange")}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }} />
                        <td
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                            color:
                              stats.minReturn >= 0 ? "#4ec9b0" : stats.maxReturn <= 0 ? "#f48771" : "#dcdcaa",
                          }}
                        >
                          {(stats.minReturn >= 0 ? "+" : "") + stats.minReturn.toFixed(2)}% ~{" "}
                          {(stats.maxReturn >= 0 ? "+" : "") + stats.maxReturn.toFixed(2)}%
                        </td>
                      </tr>
                      {priceRange && currentPrice != null && (
                        <tr style={{ borderTop: "1px solid #444", background: "#2d2d30" }}>
                          <td style={{ padding: "8px 10px", color: "#9cdcfe" }}>
                            {t("similarity.priceRange")} ({t("similarity.refCurrentPrice")}{" "}
                            {currentPrice.toFixed(2)})
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right" }} />
                          <td style={{ padding: "8px 10px", textAlign: "right", color: "#dcdcaa" }}>
                            {priceRange.low.toFixed(2)} ~ {priceRange.high.toFixed(2)}
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      <div
        className="explanation"
        style={{
          padding: "10px",
          background: "#252526",
          borderRadius: "6px",
          fontSize: "12px",
          color: "#aaa",
        }}
      >
        {t("similarity.explanation")}
      </div>
    </div>
  );
};

export default SimilarityPrediction;
