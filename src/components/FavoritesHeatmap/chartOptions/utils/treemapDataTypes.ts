export interface TreemapDataItem {
  name: string;
  value: number;
  rank?: number;
  changePercent: number;
  price: number;
  change: number;
  volume: number;
  turnover: number;
  marketCap: number;
  fullName: string;
  peRatio?: number;
  absChange?: number;
  visualMapValue?: number;
}

export interface TreemapDataConfig {
  treemapData: TreemapDataItem[];
  colorValues: number[];
  minValue: number;
  maxValue: number;
  colorValueKey: string;
}
