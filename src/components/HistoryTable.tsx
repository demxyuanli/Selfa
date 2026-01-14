import React, { useState, useRef, useCallback } from "react";
import "./HistoryTable.css";

interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HistoryTableProps {
  data: StockData[];
}

const HistoryTable: React.FC<HistoryTableProps> = ({ data }) => {
  const [columnWidths, setColumnWidths] = useState({
    date: 38,
    open: 48,
    high: 48,
    low: 48,
    close: 48,
    volume: 36,
  });
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const getPriceColor = (close: number, open: number): string => {
    if (close > open) return "#f44336";
    if (close < open) return "#4caf50";
    return "var(--text-primary)";
  };

  const formatDate = (dateStr: string): string => {
    const datePart = dateStr.split(" ")[0];
    const parts = datePart.split("-");
    if (parts.length >= 3) return `${parts[1]}-${parts[2]}`;
    return dateStr;
  };

  const formatVolume = (vol: number): string => {
    if (vol >= 100000000) return (vol / 100000000).toFixed(1);
    if (vol >= 10000) return (vol / 10000).toFixed(0);
    return vol.toString();
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

  const columns = [
    { key: "date", label: "Date" },
    { key: "open", label: "O" },
    { key: "high", label: "H" },
    { key: "low", label: "L" },
    { key: "close", label: "C" },
    { key: "volume", label: "Vol" },
  ];

  return (
    <div className="history-table">
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
            {data.slice(-100).reverse().map((row, idx) => {
              const priceColor = getPriceColor(row.close, row.open);
              return (
                <tr key={idx}>
                  <td className="date-cell">{formatDate(row.date)}</td>
                  <td style={{ color: priceColor }}>{row.open.toFixed(2)}</td>
                  <td style={{ color: priceColor }}>{row.high.toFixed(2)}</td>
                  <td style={{ color: priceColor }}>{row.low.toFixed(2)}</td>
                  <td className="close-cell" style={{ color: priceColor }}>{row.close.toFixed(2)}</td>
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

export default HistoryTable;
