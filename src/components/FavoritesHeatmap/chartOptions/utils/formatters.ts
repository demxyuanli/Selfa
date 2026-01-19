export const formatLargeNumber = (
  value: number,
  t: (key: string, params?: any) => string
): string => {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(1)}${t("common.hundredMillion")}`;
  }
  return `${(value / 10000).toFixed(0)}${t("common.tenThousand")}`;
};

export const formatChangePercent = (changePercent: number): string => {
  return changePercent >= 0 ? `+${changePercent.toFixed(1)}%` : `${changePercent.toFixed(1)}%`;
};

export const getShortName = (displayName: string, maxLength: number = 6): string => {
  if (!displayName) return "";
  return displayName.length > maxLength ? displayName.substring(0, maxLength) + "..." : displayName;
};
