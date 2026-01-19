export interface TechnicalIndicatorParams {
  rsiPeriod: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  kdjPeriod: number;
  bbPeriod: number;
  atrPeriod: number;
  cciPeriod: number;
  adxPeriod: number;
  stochRsiRsiPeriod: number;
  stochRsiStochPeriod: number;
  stochRsiKPeriod: number;
  stochRsiDPeriod: number;
  bbPercentPeriod: number;
  momentumPeriod: number;
  maPeriods: number[];
}

export interface BacktestParams {
  initialCapital: number;
  rsiOverbought: number;
  rsiOversold: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  positionSizePercent: number;
  volumeMultiplier: number;
  maFast: number;
  maSlow: number;
}

export interface AnalysisParams {
  priceChangeThreshold: number;
  volumeMultiplier: number;
  maPeriod: number;
  trendDays: number;
}

export interface ChipDistributionParams {
  priceBins: number;
  decayFactor: number;
}

export interface AppSettings {
  autoRefresh: boolean;
  refreshInterval: number;
  theme: string;
  fontFamily: string;
  fontSize: number;
  numberFontFamily: string;
  defaultCommissionRate: number;
  defaultCommission: number;
  technicalIndicators: TechnicalIndicatorParams;
  backtest: BacktestParams;
  analysis: AnalysisParams;
  chipDistribution: ChipDistributionParams;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoRefresh: false,
  refreshInterval: 5,
  theme: "dark",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontSize: 13,
  numberFontFamily: "'Consolas', 'Monaco', 'Courier New', 'Roboto Mono', 'Source Code Pro', monospace",
  defaultCommissionRate: 0.0003,
  defaultCommission: 5,
  technicalIndicators: {
    rsiPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    kdjPeriod: 9,
    bbPeriod: 20,
    atrPeriod: 14,
    cciPeriod: 20,
    adxPeriod: 14,
    stochRsiRsiPeriod: 14,
    stochRsiStochPeriod: 14,
    stochRsiKPeriod: 3,
    stochRsiDPeriod: 3,
    bbPercentPeriod: 20,
    momentumPeriod: 10,
    maPeriods: [5, 10, 20, 60],
  },
  backtest: {
    initialCapital: 100000,
    rsiOverbought: 70,
    rsiOversold: 30,
    stopLossPercent: 5,
    takeProfitPercent: 10,
    positionSizePercent: 100,
    volumeMultiplier: 1.2,
    maFast: 5,
    maSlow: 20,
  },
  analysis: {
    priceChangeThreshold: 2.0,
    volumeMultiplier: 2.0,
    maPeriod: 5,
    trendDays: 20,
  },
  chipDistribution: {
    priceBins: 60,
    decayFactor: 0.95,
  },
};

export function getSettings(): AppSettings {
  try {
    const savedSettings = localStorage.getItem("appSettings");
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return DEFAULT_SETTINGS;
}

export function getDefaultCommissionRate(): number {
  const settings = getSettings();
  return settings.defaultCommissionRate;
}

export function getDefaultCommission(): number {
  const settings = getSettings();
  return settings.defaultCommission;
}

export function getTechnicalIndicatorParams(): TechnicalIndicatorParams {
  const settings = getSettings();
  return settings.technicalIndicators;
}

export function getBacktestParams(): BacktestParams {
  const settings = getSettings();
  return settings.backtest;
}

export function getAnalysisParams(): AnalysisParams {
  const settings = getSettings();
  return settings.analysis;
}

export function getChipDistributionParams(): ChipDistributionParams {
  const settings = getSettings();
  return settings.chipDistribution;
}
