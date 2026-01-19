export interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
}

export interface PortfolioPosition {
  id: number;
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  profit: number;
  profitPercent: number;
  change_percent?: number;
}

export interface PortfolioTransaction {
  id: number;
  symbol: string;
  name?: string;
  transactionType: "buy" | "sell";
  quantity: number;
  price: number;
  amount: number;
  commission: number;
  transactionDate: string;
  notes?: string;
}

export interface PortfolioStats {
  totalCost: number;
  totalValue: number;
  totalProfit: number;
  totalProfitPercent: number;
  positionCount: number;
}

export interface GroupedTransaction {
  symbol: string;
  name?: string;
  transactions: PortfolioTransaction[];
  totalBuy: number;
  totalSell: number;
  netQuantity: number;
  subtotal: {
    buyQuantity: number;
    sellQuantity: number;
    netQuantity: number;
    buyAmount: number;
    sellAmount: number;
    netAmount: number;
    totalCommission: number;
  };
}
