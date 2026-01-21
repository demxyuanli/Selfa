import { PortfolioPosition, PortfolioTransaction, PortfolioStats, GroupedTransaction } from "../types";

export interface CapitalTransfer {
  id: number;
  transferType: "deposit" | "withdraw";
  amount: number;
  transferDate: string;
  notes?: string;
}

export function calculatePortfolioStats(
  positions: PortfolioPosition[], 
  transactions: PortfolioTransaction[] = [],
  capitalTransfers: CapitalTransfer[] = [],
  initialBalanceOverride?: number | null
): PortfolioStats {
  const totalCost = positions.reduce((sum, pos) => sum + pos.avgCost * pos.quantity, 0);
  const totalValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0);
  const totalProfit = positions.reduce((sum, pos) => sum + pos.profit, 0);
  const totalProfitPercent = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

  // Calculate initial capital: use override if provided, otherwise sum of all capital transfers (deposit - withdraw)
  const initialCapital = initialBalanceOverride !== null && initialBalanceOverride !== undefined
    ? initialBalanceOverride
    : capitalTransfers.reduce((sum, transfer) => {
        if (transfer.transferType === "deposit") {
          return sum + transfer.amount;
        } else {
          return sum - transfer.amount;
        }
      }, 0);

  // Calculate total sell proceeds: sum of all sell transactions (amount - commission)
  const totalSellProceeds = transactions
    .filter(t => t.transactionType === "sell")
    .reduce((sum, t) => sum + t.amount - t.commission, 0);

  // Available balance = initial capital - total cost of current positions + sell proceeds
  const availableBalance = initialCapital - totalCost + totalSellProceeds;

  // Position value = current market value of all positions
  const positionValue = totalValue;

  // Floating profit = current market value - total cost
  const floatingProfit = totalValue - totalCost;
  const floatingProfitPercent = totalCost > 0 ? (floatingProfit / totalCost) * 100 : 0;

  return {
    totalCost,
    totalValue,
    totalProfit,
    totalProfitPercent,
    positionCount: positions.length,
    initialCapital,
    availableBalance,
    positionValue,
    floatingProfit,
    floatingProfitPercent,
  };
}

export function groupTransactionsBySymbol(transactions: PortfolioTransaction[]): GroupedTransaction[] {
  if (transactions.length === 0) return [];

  const sorted = [...transactions].sort((a, b) => {
    if (a.symbol !== b.symbol) {
      return a.symbol.localeCompare(b.symbol);
    }
    return a.transactionDate.localeCompare(b.transactionDate);
  });

  const groups: GroupedTransaction[] = [];
  let currentGroup: GroupedTransaction | null = null;

  for (const transaction of sorted) {
    if (!currentGroup || currentGroup.symbol !== transaction.symbol) {
      if (currentGroup) {
        groups.push(currentGroup);
      }
      currentGroup = {
        symbol: transaction.symbol,
        name: transaction.name,
        transactions: [],
        totalBuy: 0,
        totalSell: 0,
        netQuantity: 0,
        subtotal: {
          buyQuantity: 0,
          sellQuantity: 0,
          netQuantity: 0,
          buyAmount: 0,
          sellAmount: 0,
          netAmount: 0,
          totalCommission: 0,
        },
      };
    }

    currentGroup.transactions.push(transaction);

    if (transaction.transactionType === "buy") {
      currentGroup.subtotal.buyQuantity += transaction.quantity;
      currentGroup.subtotal.buyAmount += transaction.amount;
      currentGroup.totalBuy += transaction.quantity;
    } else {
      currentGroup.subtotal.sellQuantity += transaction.quantity;
      currentGroup.subtotal.sellAmount += transaction.amount;
      currentGroup.totalSell += transaction.quantity;
    }
    currentGroup.subtotal.totalCommission += transaction.commission;
  }

  if (currentGroup) {
    groups.push(currentGroup);
  }

  for (const group of groups) {
    group.subtotal.netQuantity = group.subtotal.buyQuantity - group.subtotal.sellQuantity;
    group.subtotal.netAmount = group.subtotal.buyAmount - group.subtotal.sellAmount;
    group.netQuantity = group.totalBuy - group.totalSell;
  }

  return groups;
}

export function getTransactionSymbols(transactions: PortfolioTransaction[]): string[] {
  const symbols = new Set<string>();
  transactions.forEach((transaction) => {
    symbols.add(transaction.symbol);
  });
  return Array.from(symbols).sort();
}
