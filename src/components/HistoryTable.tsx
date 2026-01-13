import React from "react";
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
  return (
    <div className="history-table">
      <div className="table-header">History Data</div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Open</th>
            <th>High</th>
            <th>Low</th>
            <th>Close</th>
            <th>Volume</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(-50).reverse().map((row, idx) => (
            <tr key={idx}>
              <td>{row.date}</td>
              <td>{row.open.toFixed(2)}</td>
              <td>{row.high.toFixed(2)}</td>
              <td>{row.low.toFixed(2)}</td>
              <td>{row.close.toFixed(2)}</td>
              <td>{(row.volume / 10000).toFixed(2)}万</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default HistoryTable;
