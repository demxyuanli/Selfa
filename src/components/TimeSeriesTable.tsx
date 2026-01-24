import React, { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import "./TimeSeriesTable.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TimeSeriesTableProps {
  data: StockData[];
  quote?: any;
}

const TimeSeriesTable: React.FC<TimeSeriesTableProps> = ({ data, quote }) => {
  const { t } = useTranslation();
  const [columnWidths, setColumnWidths] = useState({
    time: 42,
    price: 52,
    volume: 40,
  });
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const getPriceColor = (currentPrice: number, previousPrice: number | null): string => {
    if (previousPrice === null) return "var(--text-primary)";
    if (currentPrice > previousPrice) return "#ff0000";
    if (currentPrice < previousPrice) return "#00ff00";
    return "var(--text-primary)";
  };

  const formatVolume = (vol: number): string => {
    if (vol >= 100000000) return (vol / 100000000).toFixed(1);
    if (vol >= 10000) return (vol / 10000).toFixed(0);
    return vol.toString();
  };

  const formatTime = (dateStr: string): string => {
    const timeStr = dateStr.includes(" ") ? dateStr.split(" ")[1] : dateStr;
    const parts = timeStr.split(":");
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
    return timeStr;
  };

  const handleMouseDown = useCallback((e: React.MouseEvent, column: string) => {
    e.preventDefault();
    setResizingColumn(column);
    startXRef.current = e.clientX;
    startWidthRef.current = columnWidths[column as keyof typeof columnWidths];
  }, [columnWidths]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingColumn) return;
    const diff = e.clientX - startXRef.current;
    const newWidth = Math.max(30, startWidthRef.current + diff);
    setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
  }, [resizingColumn]);

  const handleMouseUp = useCallback(() => {
    setResizingColumn(null);
  }, []);

  React.useEffect(() => {
    if (resizingColumn) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingColumn, handleMouseMove, handleMouseUp]);

  const reversedData = data.slice(-100).reverse();
  const previousClose = quote?.previous_close || null;

  const columns = [
    { key: "time", label: t("analysis.time") },
    { key: "price", label: t("analysis.price") },
    { key: "volume", label: t("analysis.vol") },
  ];

  return (
    <div className="time-series-table">
      <div className="table-scroll">
        <table style={{ minWidth: Object.values(columnWidths).reduce((a, b) => a + b, 0) }}>
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={col.key}
                  style={{ width: columnWidths[col.key as keyof typeof columnWidths] }}
                >
                  {col.label}
                  {idx < columns.length - 1 && (
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleMouseDown(e, col.key)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reversedData.map((row, idx) => {
              const prevPrice = idx === 0 ? previousClose : reversedData[idx - 1].close;
              const priceColor = getPriceColor(row.close, prevPrice);
              
              return (
                <tr key={idx}>
                  <td className="time-cell">{formatTime(row.date)}</td>
                  <td className="price-cell" style={{ color: priceColor }}>{row.close.toFixed(2)}</td>
                  <td className="vol-cell" style={{ color: priceColor }}>{formatVolume(row.volume)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TimeSeriesTable;
