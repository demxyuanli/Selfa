import { HeatmapType } from "../types";

export interface ColorConfig {
  colorRange: [number, number];
  colorPalette: string[];
  legendText: [string, string];
}

export const createColorConfig = (
  heatmapType: HeatmapType,
  minValue: number,
  maxValue: number,
  t: (key: string, params?: any) => string
): ColorConfig => {
  if (heatmapType === "changePercent") {
    const colorRange: [number, number] = [minValue, maxValue];
    let colorPalette: string[];
    
    if (minValue < 0 && maxValue > 0) {
      const greenPalette = [
        "#00ff00",
        "#00cc00",
        "#009900",
      ];
      const redPalette = [
        "#ff6666",
        "#ff3333",
        "#ff0000",
        "#cc0000",
      ];
      colorPalette = [...greenPalette, ...redPalette];
    } else if (maxValue > 0) {
      colorPalette = [
        "#ff6666",
        "#ff3333",
        "#ff0000",
        "#cc0000"
      ];
    } else {
      colorPalette = [
        "#00ff00",
        "#00cc00",
        "#047857",
        "#065f46"
      ];
    }
    
    return {
      colorRange,
      colorPalette,
      legendText: [t("heatmap.down"), t("heatmap.up")],
    };
  } else {
    const colorRange: [number, number] = [minValue, maxValue];
    let colorPalette: string[];
    let legendText: [string, string];
    
    if (heatmapType === "marketCap") {
      colorPalette = ["#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb"];
      legendText = [t("heatmap.low"), t("heatmap.high")];
    } else {
      colorPalette = ["#ffcccc", "#ff9999", "#ff6666", "#ff3333", "#ff0000", "#cc0000"];
      legendText = [t("heatmap.low"), t("heatmap.high")];
    }
    
    return {
      colorRange,
      colorPalette,
      legendText,
    };
  }
};

export const createColorFunction = (
  colorRange: [number, number],
  colorPalette: string[],
  colorValueKey: string
): ((params: any) => string) => {
  const range = colorRange;
  const palette = colorPalette;
  const isChangePercent = colorValueKey === "changePercent";
  
  return (params: any) => {
    const data = params.data;
    const colorValue = data.visualMapValue;
    if (colorValue === undefined || colorValue === null || isNaN(colorValue)) {
      return "#9ca3af";
    }
    
    if (isChangePercent && range[0] < 0 && range[1] > 0) {
      const numericValue = Number(colorValue) || 0;
      if (numericValue < 0) {
        const negativeRange = Math.abs(range[0]);
        if (negativeRange === 0) return palette[0] || "#9ca3af";
        const normalizedValue = Math.abs(numericValue) / negativeRange;
        const greenPalette = palette.slice(0, Math.floor(palette.length / 2));
        if (greenPalette.length === 0) return "#00ff00";
        const colorIndex = Math.max(0, Math.min(Math.floor(normalizedValue * (greenPalette.length - 1)), greenPalette.length - 1));
        return greenPalette[colorIndex] || greenPalette[0] || "#00ff00";
      } else if (numericValue > 0) {
        const positiveRange = range[1];
        if (positiveRange === 0) return palette[palette.length - 1] || "#9ca3af";
        const normalizedValue = numericValue / positiveRange;
        const redPalette = palette.slice(Math.floor(palette.length / 2));
        if (redPalette.length === 0) return "#ff6666";
        const colorIndex = Math.max(0, Math.min(Math.floor(normalizedValue * (redPalette.length - 1)), redPalette.length - 1));
        return redPalette[colorIndex] || redPalette[0] || "#ff6666";
      } else {
        return "#eab308";
      }
    }
    
    const rangeSize = range[1] - range[0];
    if (rangeSize === 0 || !isFinite(rangeSize)) {
      return palette[0] || "#9ca3af";
    }
    const normalizedValue = Math.max(0, Math.min(1, (colorValue - range[0]) / rangeSize));
    const colorIndex = Math.max(0, Math.min(Math.floor(normalizedValue * (palette.length - 1)), palette.length - 1));
    return palette[colorIndex] || palette[0] || "#9ca3af";
  };
};
