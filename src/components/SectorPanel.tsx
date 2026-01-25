import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import './SectorPanel.css';

interface SectorInfo {
  code: string;
  name: string;
  sector_type: string;
  change_percent: number;
  secid?: string; // Original secid format (e.g., "2.932094", "90.BK0145")
}

interface StockData {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

interface SectorPanelProps {
  symbol: string;
  stockName?: string;
}

const SectorPanel: React.FC<SectorPanelProps> = ({ symbol, stockName }) => {
  const { t } = useTranslation();
  const [sectors, setSectors] = useState<SectorInfo[]>([]);
  const [selectedSector, setSelectedSector] = useState<SectorInfo | null>(null);
  const [stockData, setStockData] = useState<StockData[]>([]);
  const [sectorData, setSectorData] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(false);
  const [sectorsLoading, setSectorsLoading] = useState(false);
  const [period, setPeriod] = useState<'intraday' | 'daily'>('daily');

  // Fetch Sectors
  useEffect(() => {
    const fetchSectors = async () => {
      setSectorsLoading(true);
      try {
        const res = await invoke<SectorInfo[]>('get_stock_sectors', { symbol });
        setSectors(res);
        // Auto-select first industry if available
        const industry = res.find(s => s.sector_type === 'Industry');
        if (industry) {
             setSelectedSector(industry);
        } else if (res.length > 0) {
             setSelectedSector(res[0]);
        }
      } catch (e) {
        console.error("Failed to fetch sectors", e);
      } finally {
        setSectorsLoading(false);
      }
    };
    if (symbol) fetchSectors();
  }, [symbol]);

  // Fetch Data
  useEffect(() => {
    if (!selectedSector || !symbol) return;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        let sData: StockData[] = [];
        let secData: StockData[] = [];

        if (period === 'intraday') {
            // Intraday (1m)
            sData = await invoke('get_intraday_time_series', { symbol });
            // Use secid if available, otherwise use code
            const sectorSymbol = selectedSector.secid || selectedSector.code;
            secData = await invoke('get_intraday_time_series', { symbol: sectorSymbol });
        } else {
            // Daily (1 Year)
            sData = await invoke('get_stock_history', { symbol, period: '1y' });
            // Use secid if available, otherwise use code
            const sectorSymbol = selectedSector.secid || selectedSector.code;
            secData = await invoke('get_stock_history', { symbol: sectorSymbol, period: '1y' });
        }
        
        // Validate data
        if (!sData || !Array.isArray(sData) || sData.length === 0) {
          console.warn(`No stock data returned for ${symbol}`);
          setStockData([]);
        } else {
          setStockData(sData);
        }
        
        if (!secData || !Array.isArray(secData) || secData.length === 0) {
          console.warn(`No sector data returned for ${selectedSector.secid || selectedSector.code}`);
          setSectorData([]);
        } else {
          setSectorData(secData);
        }
      } catch (e) {
        console.error("Failed to fetch comparison data", e);
        setStockData([]);
        setSectorData([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [selectedSector, symbol, period]);

  // Chart Logic
  const chartOption = useMemo(() => {
    if (!stockData.length || !sectorData.length) return {};

    // Align data by date/time
    const stockMap = new Map<string, StockData>();
    const sectorMap = new Map<string, StockData>();
    stockData.forEach(d => stockMap.set(d.date, d));
    sectorData.forEach(d => sectorMap.set(d.date, d));

    // Get all unique dates sorted
    const allDates = Array.from(new Set([...stockData.map(d => d.date), ...sectorData.map(d => d.date)])).sort();

    const dates: string[] = [];
    const seriesStock: any[] = [];
    const seriesSector: any[] = [];
    const seriesDeviation: number[] = [];
    
    // Optimized divergence/convergence analysis algorithms
    const calculateTrends = (stockValues: number[], sectorValues: number[], deviations: number[]) => {
      const trends: Array<{ 
        type: 'divergence' | 'convergence', 
        start: number, 
        end: number,
        strength: number,
        correlation: number
      }> = [];
      
      if (stockValues.length < 2 || sectorValues.length < 2 || deviations.length < 2) return trends;
      
      // Get optimal window size based on data frequency
      const getOptimalWindowSize = (dataLength: number, period: 'intraday' | 'daily') => {
        if (period === 'intraday') {
          const windowSize = Math.min(20, Math.max(5, Math.floor(dataLength / 4)));
          const minTrendLength = Math.max(3, Math.floor(windowSize / 3));
          return { windowSize, minTrendLength };
        } else {
          const windowSize = Math.min(30, Math.max(10, Math.floor(dataLength / 3)));
          const minTrendLength = Math.max(5, Math.floor(windowSize / 2));
          return { windowSize, minTrendLength };
        }
      };
      
      const { windowSize, minTrendLength } = getOptimalWindowSize(stockValues.length, period);
      
      // Calculate adaptive thresholds based on data characteristics
      const calculateAdaptiveThresholds = (deviations: number[], period: 'intraday' | 'daily') => {
        if (deviations.length === 0) {
          return {
            deviationThreshold: period === 'intraday' ? 0.1 : 0.5,
            rsiThresholdHigh: period === 'intraday' ? 15 : 25,
            rsiThresholdLow: period === 'intraday' ? 10 : 20
          };
        }
        
        const mean = deviations.reduce((a, b) => a + b, 0) / deviations.length;
        const variance = deviations.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / deviations.length;
        const stdDev = Math.sqrt(variance);
        
        const baseThreshold = period === 'intraday' ? 0.1 : 0.5;
        const deviationThreshold = baseThreshold * (1 + Math.min(stdDev / 10, 2)); // Cap multiplier at 3x
        
        const rsiThresholdHigh = period === 'intraday' ? 15 : 25;
        const rsiThresholdLow = period === 'intraday' ? 10 : 20;
        
        return {
          deviationThreshold,
          rsiThresholdHigh,
          rsiThresholdLow
        };
      };
      
      const thresholds = calculateAdaptiveThresholds(deviations, period);
      
      // Calculate rolling correlation coefficient with caching
      const correlationCache = new Map<string, number>();
      const calculateRollingCorrelation = (startIdx: number, endIdx: number): number => {
        const cacheKey = `${startIdx}-${endIdx}`;
        if (correlationCache.has(cacheKey)) {
          return correlationCache.get(cacheKey)!;
        }
        
        const stockSlice = stockValues.slice(startIdx, endIdx + 1);
        const sectorSlice = sectorValues.slice(startIdx, endIdx + 1);
        
        if (stockSlice.length < 2) {
          correlationCache.set(cacheKey, 0);
          return 0;
        }
        
        const stockMean = stockSlice.reduce((a, b) => a + b, 0) / stockSlice.length;
        const sectorMean = sectorSlice.reduce((a, b) => a + b, 0) / sectorSlice.length;
        
        let numerator = 0;
        let stockVariance = 0;
        let sectorVariance = 0;
        
        for (let i = 0; i < stockSlice.length; i++) {
          const stockDiff = stockSlice[i] - stockMean;
          const sectorDiff = sectorSlice[i] - sectorMean;
          numerator += stockDiff * sectorDiff;
          stockVariance += stockDiff * stockDiff;
          sectorVariance += sectorDiff * sectorDiff;
        }
        
        const denominator = Math.sqrt(stockVariance * sectorVariance);
        const correlation = denominator > 0 ? numerator / denominator : 0;
        correlationCache.set(cacheKey, correlation);
        return correlation;
      };
      
      // Fixed RSI calculation using proper averaging
      const calculateRSI = (values: number[], period: number): number => {
        if (values.length < 2) return 50;
        
        const actualPeriod = Math.min(period, values.length - 1);
        let sumGains = 0;
        let sumLosses = 0;
        
        for (let i = values.length - actualPeriod; i < values.length; i++) {
          const change = values[i] - values[i - 1];
          if (change > 0) {
            sumGains += change;
          } else {
            sumLosses += Math.abs(change);
          }
        }
        
        const avgGain = sumGains / actualPeriod;
        const avgLoss = sumLosses / actualPeriod;
        
        if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
        
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
      };
      
      // Improved trend strength calculation considering continuity and acceleration
      const calculateTrendStrength = (deviations: number[], start: number, end: number): number => {
        if (end <= start) return 0;
        
        // Base strength: change from start to end
        const baseStrength = Math.abs(deviations[end] - deviations[start]);
        
        // Continuity: how consistent is the trend direction
        let continuity = 0;
        const direction = deviations[end] > deviations[start] ? 1 : -1;
        for (let i = start + 1; i <= end; i++) {
          const stepDirection = deviations[i] > deviations[i - 1] ? 1 : -1;
          if (stepDirection === direction) continuity++;
        }
        const continuityFactor = continuity / (end - start);
        
        // Acceleration: is the trend accelerating
        const midPoint = Math.floor((start + end) / 2);
        if (midPoint > start && midPoint < end) {
          const firstHalfChange = Math.abs(deviations[midPoint] - deviations[start]);
          const secondHalfChange = Math.abs(deviations[end] - deviations[midPoint]);
          const accelerationFactor = secondHalfChange > firstHalfChange ? 1.2 : 1.0;
          return baseStrength * (0.5 + continuityFactor * 0.3) * accelerationFactor;
        }
        
        return baseStrength * (0.5 + continuityFactor * 0.3);
      };
      
      // Trend scoring system instead of hard AND conditions
      const calculateTrendScore = (
        devChange: number,
        correlationChange: number,
        rsiDiff: number,
        thresholds: { deviationThreshold: number; rsiThresholdHigh: number; rsiThresholdLow: number }
      ): { divergenceScore: number; convergenceScore: number } => {
        let divergenceScore = 0;
        let convergenceScore = 0;
        
        // Deviation change score (0-0.4)
        if (devChange > thresholds.deviationThreshold) {
          divergenceScore += 0.4;
        } else if (devChange < -thresholds.deviationThreshold) {
          convergenceScore += 0.4;
        }
        
        // Correlation change score (0-0.3)
        if (correlationChange < -0.1) {
          divergenceScore += 0.3;
        } else if (correlationChange > 0.1) {
          convergenceScore += 0.3;
        }
        
        // RSI difference score (0-0.3)
        if (rsiDiff > thresholds.rsiThresholdHigh) {
          divergenceScore += 0.3;
        } else if (rsiDiff < thresholds.rsiThresholdLow) {
          convergenceScore += 0.3;
        }
        
        return { divergenceScore, convergenceScore };
      };
      
      let currentTrend: 'divergence' | 'convergence' | null = null;
      let trendStart = 0;
      let prevCorrelation: number | null = null;
      
      for (let i = windowSize; i < deviations.length; i++) {
        const windowStart = Math.max(0, i - windowSize);
        const windowEnd = i;
        
        // Calculate rolling correlation
        const correlation = calculateRollingCorrelation(windowStart, windowEnd);
        
        // Calculate correlation change (handle boundary conditions)
        let correlationChange = 0;
        if (prevCorrelation !== null && i > windowSize) {
          const prevWindowStart = Math.max(0, windowStart - 1);
          const prevCorrelationValue = calculateRollingCorrelation(prevWindowStart, windowEnd - 1);
          correlationChange = correlation - prevCorrelationValue;
        }
        prevCorrelation = correlation;
        
        // Calculate RSI for stock and sector
        const stockRSI = calculateRSI(stockValues.slice(windowStart, windowEnd + 1), Math.min(14, windowSize));
        const sectorRSI = calculateRSI(sectorValues.slice(windowStart, windowEnd + 1), Math.min(14, windowSize));
        const rsiDiff = Math.abs(stockRSI - sectorRSI);
        
        // Calculate deviation change rate
        const prevDevAbs = Math.abs(deviations[i - 1]);
        const currDevAbs = Math.abs(deviations[i]);
        const devChange = currDevAbs - prevDevAbs;
        
        // Use scoring system to determine trends
        const { divergenceScore, convergenceScore } = calculateTrendScore(
          devChange,
          correlationChange,
          rsiDiff,
          thresholds
        );
        
        const isDiverging = divergenceScore > 0.6; // At least 2 conditions met
        const isConverging = convergenceScore > 0.6;
        
        if (isDiverging && currentTrend !== 'divergence') {
          if (currentTrend === 'convergence' && trendStart < i - 1) {
            const trendCorr = calculateRollingCorrelation(trendStart, i - 1);
            const trendStrength = calculateTrendStrength(deviations, trendStart, i - 1);
            if (i - trendStart >= minTrendLength) {
              trends.push({ 
                type: 'convergence', 
                start: trendStart, 
                end: i - 1,
                strength: trendStrength,
                correlation: trendCorr
              });
            }
          }
          currentTrend = 'divergence';
          trendStart = i - windowSize;
        } else if (isConverging && currentTrend !== 'convergence') {
          if (currentTrend === 'divergence' && trendStart < i - 1) {
            const trendCorr = calculateRollingCorrelation(trendStart, i - 1);
            const trendStrength = calculateTrendStrength(deviations, trendStart, i - 1);
            if (i - trendStart >= minTrendLength) {
              trends.push({ 
                type: 'divergence', 
                start: trendStart, 
                end: i - 1,
                strength: trendStrength,
                correlation: trendCorr
              });
            }
          }
          currentTrend = 'convergence';
          trendStart = i - windowSize;
        }
      }
      
      // Add final trend
      if (currentTrend !== null && trendStart < deviations.length - minTrendLength) {
        const trendCorr = calculateRollingCorrelation(trendStart, deviations.length - 1);
        const trendStrength = calculateTrendStrength(deviations, trendStart, deviations.length - 1);
        trends.push({ 
          type: currentTrend, 
          start: trendStart, 
          end: deviations.length - 1,
          strength: trendStrength,
          correlation: trendCorr
        });
      }
      
      return trends;
    };

    if (period === 'intraday') {
      // Intraday: use line chart with % change
      let stockBase = 0;
      let sectorBase = 0;

      // Find first valid values
      for (const date of allDates) {
        if (stockBase === 0 && stockMap.has(date)) stockBase = stockMap.get(date)!.close;
        if (sectorBase === 0 && sectorMap.has(date)) sectorBase = sectorMap.get(date)!.close;
        if (stockBase !== 0 && sectorBase !== 0) break;
      }

      allDates.forEach(date => {
        if (stockMap.has(date) && sectorMap.has(date)) {
          // Extract time only (HH:MM) for intraday chart
          let timeStr = date;
          if (date.includes(' ')) {
            const timePart = date.split(' ')[1];
            timeStr = timePart.split(':').slice(0, 2).join(':');
          } else if (date.includes(':')) {
            timeStr = date.split(':').slice(0, 2).join(':');
          }
          dates.push(timeStr);
          const sVal = stockMap.get(date)!.close;
          const secVal = sectorMap.get(date)!.close;
          
          const sPct = ((sVal - stockBase) / stockBase) * 100;
          const secPct = ((secVal - sectorBase) / sectorBase) * 100;
          
          seriesStock.push(parseFloat(sPct.toFixed(2)));
          seriesSector.push(parseFloat(secPct.toFixed(2)));
          seriesDeviation.push(parseFloat((sPct - secPct).toFixed(2)));
        }
      });

      // Calculate trends using advanced algorithm
      const trends = calculateTrends(seriesStock, seriesSector, seriesDeviation);
      
      // Create markArea data for trends - format: [[startPoint, endPoint], ...]
      // Only add markArea if we have valid trends and data points
      // Color intensity based on trend strength and correlation
      const markAreaData = trends.length > 0 && dates.length > 0
        ? trends
            .filter(trend => trend.start >= 0 && trend.end < dates.length && trend.start <= trend.end)
            .map(trend => {
              // Calculate opacity based on strength and correlation
              // Improved normalization: use adaptive strength factor based on deviation range
              const maxDeviation = Math.max(...seriesDeviation.map(Math.abs));
              const normalizedStrength = maxDeviation > 0 
                ? Math.min(1, trend.strength / Math.max(maxDeviation * 0.5, 1))
                : Math.min(1, trend.strength / 10);
              
              const correlationFactor = trend.type === 'divergence' 
                ? 1 - Math.max(0, trend.correlation) // Lower correlation = stronger divergence
                : Math.max(0, trend.correlation); // Higher correlation = stronger convergence
              
              // Improved opacity range: 0.15 to 0.4 for better visibility
              const opacity = 0.15 + (normalizedStrength * correlationFactor * 0.25);
              
              return [
                {
                  xAxis: trend.start,
                  itemStyle: {
                    color: trend.type === 'divergence' 
                      ? `rgba(255, 0, 0, ${opacity})` 
                      : `rgba(0, 255, 0, ${opacity})`
                  }
                },
                { xAxis: trend.end }
              ];
            })
        : [];

      return {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' }
        },
        legend: {
          data: [stockName || symbol, selectedSector?.name || t('analysis.sector'), t('analysis.deviation')],
          top: 0,
          textStyle: {
            fontSize: 11
          },
          itemGap: 10
        },
        grid: [
          { left: '10%', right: '10%', top: '10%', height: '55%' },
          { left: '10%', right: '10%', top: '70%', height: '20%' }
        ],
        xAxis: [
          { 
            type: 'category', 
            data: dates, 
            gridIndex: 0,
            axisLabel: {
              interval: 0,
              formatter: (value: string, _index: number) => {
                // Only show labels at 30-minute intervals (minutes are 00 or 30)
                const parts = value.split(':');
                if (parts.length >= 2) {
                  const minutes = parseInt(parts[1], 10);
                  if (minutes === 0 || minutes === 30) {
                    return value;
                  }
                }
                return '';
              }
            }
          },
          { type: 'category', data: dates, gridIndex: 1, show: false }
        ],
        yAxis: [
          { type: 'value', name: t('analysis.changePercentLabel'), gridIndex: 0 },
          { type: 'value', name: t('analysis.deviation'), gridIndex: 1 }
        ],
        dataZoom: [
          { type: 'inside', xAxisIndex: [0, 1] },
          { type: 'slider', xAxisIndex: [0, 1] }
        ],
        series: [
          {
            name: stockName || symbol,
            type: 'line',
            data: seriesStock,
            showSymbol: false,
            xAxisIndex: 0,
            yAxisIndex: 0,
            markArea: markAreaData.length > 0 ? {
              data: markAreaData,
              itemStyle: {
                borderWidth: 0
              }
            } : undefined
          },
          {
            name: selectedSector?.name || t('analysis.sector'),
            type: 'line',
            data: seriesSector,
            showSymbol: false,
            xAxisIndex: 0,
            yAxisIndex: 0
          },
          {
            name: t('analysis.deviation'),
            type: 'bar',
            data: seriesDeviation,
            xAxisIndex: 1,
            yAxisIndex: 1,
            itemStyle: {
              color: (params: any) => params.value > 0 ? '#ff0000' : '#00ff00'
            }
          }
        ]
      };
    } else {
      // Daily: use candlestick chart with % change for comparison
      // Align sector data starting from stock's first date
      const stockDates = stockData.map(d => d.date).sort();
      let lastSectorData: StockData | null = null;
      
      // Find base values (first valid data point)
      let stockBase = 0;
      let sectorBase = 0;
      
      for (const date of stockDates) {
        if (stockMap.has(date) && stockBase === 0) {
          stockBase = stockMap.get(date)!.close;
        }
        if (sectorMap.has(date) && sectorBase === 0) {
          sectorBase = sectorMap.get(date)!.close;
        }
        if (stockBase !== 0 && sectorBase !== 0) break;
      }
      
      stockDates.forEach(date => {
        if (stockMap.has(date)) {
          const sData = stockMap.get(date)!;
          
          // Use sector data if available, otherwise use forward fill with last valid sector data
          let secData: StockData;
          if (sectorMap.has(date)) {
            secData = sectorMap.get(date)!;
            lastSectorData = secData;
          } else if (lastSectorData) {
            // Forward fill: use last valid sector data
            secData = lastSectorData;
          } else {
            // Skip if no sector data available yet
            return;
          }
          
          // Calculate % change from base for candlestick (open, close, low, high)
          const sOpenPct = ((sData.open - stockBase) / stockBase) * 100;
          const sClosePct = ((sData.close - stockBase) / stockBase) * 100;
          const sLowPct = ((sData.low - stockBase) / stockBase) * 100;
          const sHighPct = ((sData.high - stockBase) / stockBase) * 100;
          
          const secOpenPct = ((secData.open - sectorBase) / sectorBase) * 100;
          const secClosePct = ((secData.close - sectorBase) / sectorBase) * 100;
          const secLowPct = ((secData.low - sectorBase) / sectorBase) * 100;
          const secHighPct = ((secData.high - sectorBase) / sectorBase) * 100;
          
          // Candlestick data format: [open, close, low, high] in % change
          seriesStock.push([
            parseFloat(sOpenPct.toFixed(2)),
            parseFloat(sClosePct.toFixed(2)),
            parseFloat(sLowPct.toFixed(2)),
            parseFloat(sHighPct.toFixed(2))
          ]);
          seriesSector.push([
            parseFloat(secOpenPct.toFixed(2)),
            parseFloat(secClosePct.toFixed(2)),
            parseFloat(secLowPct.toFixed(2)),
            parseFloat(secHighPct.toFixed(2))
          ]);
          
          dates.push(date);
          
          // Calculate deviation based on daily change percentage
          const sChange = ((sData.close - sData.open) / sData.open) * 100;
          const secChange = ((secData.close - secData.open) / secData.open) * 100;
          seriesDeviation.push(parseFloat((sChange - secChange).toFixed(2)));
        }
      });

      // Calculate trends for daily chart using advanced algorithm
      const trends = calculateTrends(seriesStock.map((d: any) => d[1]), seriesSector.map((d: any) => d[1]), seriesDeviation);
      
      // Create markArea data for trends - format: [[startPoint, endPoint], ...]
      // Only add markArea if we have valid trends and data points
      // Color intensity based on trend strength and correlation
      const markAreaData = trends.length > 0 && dates.length > 0
        ? trends
            .filter(trend => trend.start >= 0 && trend.end < dates.length && trend.start <= trend.end)
            .map(trend => {
              // Calculate opacity based on strength and correlation
              // Improved normalization: use adaptive strength factor based on deviation range
              const maxDeviation = Math.max(...seriesDeviation.map(Math.abs));
              const normalizedStrength = maxDeviation > 0 
                ? Math.min(1, trend.strength / Math.max(maxDeviation * 0.5, 1))
                : Math.min(1, trend.strength / 10);
              
              const correlationFactor = trend.type === 'divergence' 
                ? 1 - Math.max(0, trend.correlation) // Lower correlation = stronger divergence
                : Math.max(0, trend.correlation); // Higher correlation = stronger convergence
              
              // Improved opacity range: 0.15 to 0.4 for better visibility
              const opacity = 0.15 + (normalizedStrength * correlationFactor * 0.25);
              
              return [
                {
                  xAxis: trend.start,
                  itemStyle: {
                    color: trend.type === 'divergence' 
                      ? `rgba(255, 0, 0, ${opacity})` 
                      : `rgba(0, 255, 0, ${opacity})`
                  }
                },
                { xAxis: trend.end }
              ];
            })
        : [];

      return {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' }
        },
        legend: {
          data: [stockName || symbol, selectedSector?.name || t('analysis.sector'), t('analysis.deviation')],
          top: 0,
          textStyle: {
            fontSize: 11
          },
          itemGap: 10
        },
        grid: [
          { left: '10%', right: '10%', top: '10%', height: '55%' },
          { left: '10%', right: '10%', top: '70%', height: '20%' }
        ],
        xAxis: [
          { type: 'category', data: dates, gridIndex: 0 },
          { type: 'category', data: dates, gridIndex: 1, show: false }
        ],
        yAxis: [
          { type: 'value', name: t('analysis.changePercentLabel'), gridIndex: 0 },
          { type: 'value', name: t('analysis.deviationPercent'), gridIndex: 1 }
        ],
        dataZoom: [
          { type: 'inside', xAxisIndex: [0, 1] },
          { type: 'slider', xAxisIndex: [0, 1] }
        ],
        series: [
          {
            name: stockName || symbol,
            type: 'candlestick',
            data: seriesStock,
            xAxisIndex: 0,
            yAxisIndex: 0,
            itemStyle: {
              // Stock: Use bright/vivid colors (正色)
              color: '#ff0000', // Bright red for up
              color0: '#00ff00', // Bright green for down
              borderColor: '#cc0000', // Darker red border
              borderColor0: '#00cc00' // Darker green border
            },
            markArea: markAreaData.length > 0 ? {
              data: markAreaData,
              itemStyle: {
                borderWidth: 0
              }
            } : undefined
          },
          {
            name: selectedSector?.name || t('analysis.sector'),
            type: 'candlestick',
            data: seriesSector,
            xAxisIndex: 0,
            yAxisIndex: 0,
            itemStyle: {
              // Sector: Use light/pale colors (浅色)
              color: '#ff9999', // Light red for up
              color0: '#99ff99', // Light green for down
              borderColor: '#ff6666', // Lighter red border
              borderColor0: '#66ff66' // Lighter green border
            }
          },
          {
            name: t('analysis.deviation'),
            type: 'bar',
            data: seriesDeviation,
            xAxisIndex: 1,
            yAxisIndex: 1,
            itemStyle: {
              color: (params: any) => params.value > 0 ? '#ff0000' : '#00ff00'
            }
          }
        ]
      };
    }
  }, [stockData, sectorData, stockName, symbol, selectedSector, period, t]);

  return (
    <div className="sector-panel">
      <div className="sector-controls">
        <div className="sector-chips">
          {sectorsLoading && <span className="loading-text">{t('app.loading')}</span>}
          {!sectorsLoading && sectors.length === 0 && <span className="empty-text">{t('analysis.noSectorsFound')}</span>}
          {sectors.map(s => (
            <div 
              key={s.code} 
              className={`sector-chip ${selectedSector?.code === s.code ? 'selected' : ''}`}
              onClick={() => setSelectedSector(s)}
            >
              <span className="name">{s.name}</span>
              <span className={`change ${s.change_percent >= 0 ? 'up' : 'down'}`}>
                {s.change_percent >= 0 ? '+' : ''}{s.change_percent}%
              </span>
            </div>
          ))}
        </div>
        <div className="period-toggle">
          <button className={period === 'intraday' ? 'active' : ''} onClick={() => setPeriod('intraday')}>{t('stock.intraday')}</button>
          <button className={period === 'daily' ? 'active' : ''} onClick={() => setPeriod('daily')}>{t('stock.daily')}</button>
        </div>
      </div>

      {selectedSector && stockData.length > 0 && sectorData.length > 0 && (
        <div className="chart-container">
          {loading ? (
            <div className="loading">{t('app.loading')}</div>
          ) : (
            <ReactECharts 
              key={`${symbol}-${selectedSector.code}-${period}`}
              option={chartOption} 
              style={{ height: '100%', width: '100%' }}
              theme="dark"
              opts={{ renderer: 'canvas' }}
            />
          )}
        </div>
      )}
      {selectedSector && (!stockData.length || !sectorData.length) && !loading && (
        <div className="no-data-message">
          {t('analysis.noSectorsFound')}
        </div>
      )}
    </div>
  );
};

export default SectorPanel;
