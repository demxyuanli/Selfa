import React from "react";
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

const TimeSeriesTable: React.FC<TimeSeriesTableProps> = ({ data }) => {
  return (
    <div className="time-series-table">
      <div className="table-header">Time Series Data</div>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Price</th>
            <th>Volume</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(-20).reverse().map((row, idx) => {
            const timeStr = row.date.includes(" ") ? row.date.split(" ")[1] : row.date;
            return (
              <tr key={idx}>
                <td>{timeStr}</td>
                <td>{row.close.toFixed(2)}</td>
                <td>{(row.volume / 10000).toFixed(2)}万</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TimeSeriesTable;
