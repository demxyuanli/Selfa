import { StockData } from "./technicalIndicators";
import { calculateSMA } from "./technicalIndicators";

export interface TradingSignal {
  date: string;
  type: "golden" | "death";
  price: number;
}

export function detectSignals(klineData: StockData[], showSignals: boolean): TradingSignal[] {
  if (!showSignals || klineData.length < 20) return [];
  
  const closes = klineData.map(d => d.close);
  const ma5 = calculateSMA(closes, 5).filter(v => v !== null) as number[];
  const ma10 = calculateSMA(closes, 10).filter(v => v !== null) as number[];
  
  const signals: TradingSignal[] = [];
  
  for (let i = 1; i < ma5.length && i < ma10.length; i++) {
    const idx5 = closes.length - ma5.length + i;
    const idx10 = closes.length - ma10.length + i;
    if (idx5 >= 0 && idx10 >= 0 && idx5 < klineData.length && idx10 < klineData.length) {
      const prev5 = ma5[i - 1];
      const curr5 = ma5[i];
      const prev10 = ma10[i - 1];
      const curr10 = ma10[i];
      
      if (prev5 < prev10 && curr5 > curr10) {
        signals.push({ date: klineData[idx5].date, type: "golden", price: closes[idx5] });
      } else if (prev5 > prev10 && curr5 < curr10) {
        signals.push({ date: klineData[idx5].date, type: "death", price: closes[idx5] });
      }
    }
  }
  
  return signals;
}
