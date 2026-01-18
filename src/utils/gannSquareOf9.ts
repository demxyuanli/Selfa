export interface GannSquareOf9Config {
  referencePrice: number;
  angles: number[];
  priceUnit?: number;
  cycles?: number;
}

export interface GannLevel {
  angle: number;
  type: "support" | "resistance";
  price: number;
  cycle?: number;
}

export interface GannSquareOf9Result {
  levels: GannLevel[];
  referencePrice: number;
}

/**
 * Calculate Gann Dynamic Square of 9 levels
 * Formula: Level = (sqrt(ReferencePrice) ± (Angle / 180))^2
 */
export function calculateGannSquareOf9(config: GannSquareOf9Config): GannSquareOf9Result {
  const {
    referencePrice,
    angles = [45, 90, 135, 180, 225, 270, 315, 360],
    priceUnit = 1.0,
    cycles = 1,
  } = config;

  const levels: GannLevel[] = [];

  // Scale the reference price if needed
  const scaledPrice = referencePrice / priceUnit;
  const sqrtPrice = Math.sqrt(scaledPrice);

  // Calculate levels for each cycle
  for (let cycle = 0; cycle < cycles; cycle++) {
    const cycleOffset = cycle * 2; // Each 360° cycle adds 2 to sqrt

    for (const angle of angles) {
      const increment = angle / 180.0;

      // Resistance levels (above reference)
      const resistanceSqrt = sqrtPrice + increment + cycleOffset;
      const resistancePrice = Math.pow(resistanceSqrt, 2) * priceUnit;
      
      // Support levels (below reference)
      const supportSqrt = sqrtPrice - increment - cycleOffset;
      const supportPrice = supportSqrt > 0 ? Math.pow(supportSqrt, 2) * priceUnit : 0;

      if (supportPrice > 0) {
        levels.push({
          angle,
          type: "support",
          price: supportPrice,
          cycle: cycles > 1 ? cycle + 1 : undefined,
        });
      }

      levels.push({
        angle,
        type: "resistance",
        price: resistancePrice,
        cycle: cycles > 1 ? cycle + 1 : undefined,
      });
    }
  }

  // Sort levels by price
  levels.sort((a, b) => a.price - b.price);

  return {
    levels,
    referencePrice,
  };
}

/**
 * Find the closest Gann level to a given price
 */
export function findClosestGannLevel(
  levels: GannLevel[],
  price: number
): GannLevel | null {
  if (levels.length === 0) return null;

  let closest = levels[0];
  let minDistance = Math.abs(levels[0].price - price);

  for (const level of levels) {
    const distance = Math.abs(level.price - price);
    if (distance < minDistance) {
      minDistance = distance;
      closest = level;
    }
  }

  return closest;
}

/**
 * Get Gann levels within a price range
 */
export function getGannLevelsInRange(
  levels: GannLevel[],
  minPrice: number,
  maxPrice: number
): GannLevel[] {
  return levels.filter(
    (level) => level.price >= minPrice && level.price <= maxPrice
  );
}

/**
 * Calculate reference price from different modes
 */
export function calculateReferencePrice(
  mode: "current" | "swingLow" | "swingHigh" | "average" | "custom",
  data: Array<{ high: number; low: number; close: number }>,
  customPrice?: number
): number {
  if (mode === "custom" && customPrice !== undefined && customPrice > 0) {
    return customPrice;
  }

  if (data.length === 0) return 1;

  let price = 1;
  
  switch (mode) {
    case "current":
      price = data[data.length - 1].close;
      break;

    case "swingLow": {
      const recentPeriod = Math.min(20, data.length);
      const lows = data.slice(-recentPeriod).map((d) => d.low);
      price = Math.min(...lows);
      break;
    }

    case "swingHigh": {
      const recentPeriod = Math.min(20, data.length);
      const highs = data.slice(-recentPeriod).map((d) => d.high);
      price = Math.max(...highs);
      break;
    }

    case "average": {
      const recentPeriod = Math.min(20, data.length);
      const closes = data.slice(-recentPeriod).map((d) => d.close);
      price = closes.reduce((sum, val) => sum + val, 0) / closes.length;
      break;
    }

    default:
      price = data[data.length - 1].close;
  }

  // Ensure price is positive
  return Math.max(price, 0.01);
}
