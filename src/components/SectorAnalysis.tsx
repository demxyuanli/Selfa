import React from 'react';
import SectorPanel from './SectorPanel';
import './SectorAnalysis.css';

interface SectorAnalysisProps {
  symbol: string;
  stockName?: string;
}

const SectorAnalysis: React.FC<SectorAnalysisProps> = ({ symbol, stockName }) => {
  return (
    <div className="sector-analysis">
      <SectorPanel symbol={symbol} stockName={stockName} />
    </div>
  );
};

export default SectorAnalysis;
