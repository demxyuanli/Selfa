import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import './ChipAnalysisPanel.css';

interface ChipAnalysisResult {
  date: string;
  price: number;
  peak_price: number;
  profit_ratio: number;
  lockup_ratio: number;
  concentration_90: number;
  concentration_70: number;
  average_cost: number;
  support_price?: number;
  resistance_price?: number;
}

interface ChipAnalysisPanelProps {
  symbol: string;
}

const ChipAnalysisPanel: React.FC<ChipAnalysisPanelProps> = ({ symbol }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<ChipAnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await invoke<ChipAnalysisResult[]>('get_chip_analysis', { symbol });
        setData(res);
      } catch (e: any) {
        console.error("Failed to fetch chip analysis", e);
        setError(typeof e === 'string' ? e : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    if (symbol) fetchData();
  }, [symbol]);

  const chartOption = useMemo(() => {
    if (!data.length) return {};

    const dates = data.map(d => d.date);
    const prices = data.map(d => d.price);
    const peaks = data.map(d => d.peak_price);
    const avgs = data.map(d => d.average_cost);
    const profits = data.map(d => parseFloat((d.profit_ratio * 100).toFixed(2)));
    const lockups = data.map(d => parseFloat((d.lockup_ratio * 100).toFixed(2)));
    const conc90 = data.map(d => parseFloat((d.concentration_90 * 100).toFixed(2)));
    
    // Filter out nulls for support/resistance to avoid gaps or wrong points
    const supports = data.map(d => d.support_price);
    const resistances = data.map(d => d.resistance_price);

    return {
      title: { text: t('Chip Distribution Analysis'), left: 'center', textStyle: { color: '#eee' } },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: {
        data: ['Price', 'Peak Price', 'Avg Cost', 'Support', 'Resistance', 'Profit %', 'Lockup %', 'Conc 90%'],
        bottom: 0,
        textStyle: { color: '#ccc' }
      },
      grid: [
        { left: '5%', right: '5%', height: '40%' },
        { left: '5%', right: '5%', top: '55%', height: '35%' }
      ],
      xAxis: [
        { type: 'category', data: dates, gridIndex: 0 },
        { type: 'category', data: dates, gridIndex: 1, show: false }
      ],
      yAxis: [
        { type: 'value', scale: true, name: 'Price', gridIndex: 0, splitLine: { show: false } },
        { type: 'value', name: 'Ratio %', gridIndex: 1, splitLine: { show: false } }
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1] },
        { type: 'slider', xAxisIndex: [0, 1] }
      ],
      series: [
        {
          name: 'Price',
          type: 'line',
          data: prices,
          itemStyle: { color: '#fff' },
          xAxisIndex: 0, yAxisIndex: 0
        },
        {
          name: 'Peak Price',
          type: 'line',
          data: peaks,
          itemStyle: { color: '#ff9800' },
          xAxisIndex: 0, yAxisIndex: 0
        },
        {
          name: 'Avg Cost',
          type: 'line',
          data: avgs,
          itemStyle: { color: '#2196f3' },
          xAxisIndex: 0, yAxisIndex: 0
        },
        {
          name: 'Support',
          type: 'scatter',
          symbol: 'triangle',
          symbolSize: 6,
          data: supports,
          itemStyle: { color: '#00e676' },
          xAxisIndex: 0, yAxisIndex: 0
        },
        {
          name: 'Resistance',
          type: 'scatter',
          symbol: 'triangle',
          symbolRotate: 180,
          symbolSize: 6,
          data: resistances,
          itemStyle: { color: '#ff1744' },
          xAxisIndex: 0, yAxisIndex: 0
        },
        {
          name: 'Profit %',
          type: 'line',
          data: profits,
          itemStyle: { color: '#f44336' },
          xAxisIndex: 1, yAxisIndex: 1
        },
        {
          name: 'Lockup %',
          type: 'line',
          data: lockups,
          itemStyle: { color: '#9e9e9e' },
          xAxisIndex: 1, yAxisIndex: 1
        },
        {
          name: 'Conc 90%',
          type: 'line',
          data: conc90,
          itemStyle: { color: '#4caf50' },
          xAxisIndex: 1, yAxisIndex: 1
        }
      ]
    };
  }, [data, t]);

  if (loading) return <div className="chip-panel loading">Analyzing Chip Distribution...</div>;
  if (error) return <div className="chip-panel error">Error: {error} (Check if backend is restarted)</div>;
  if (!data.length) return <div className="chip-panel error">No Chip Data Available (Backend may be restarting or no data)</div>;

  return (
    <div className="chip-panel">
      <ReactECharts option={chartOption} style={{ height: '500px', width: '100%' }} theme="dark" />
    </div>
  );
};

export default ChipAnalysisPanel;
