/**
 * Portfolio Rebalancing & Drift Calculator
 * Calculates weight drift and generates multi-leg swap recommendations
 * respecting the $5 minimum order threshold on BSC.
 */

export function calculateDrift(currentHoldings, targetAllocations, totalPortfolioValueUsd) {
  if (!totalPortfolioValueUsd || totalPortfolioValueUsd <= 0) {
    // If empty portfolio, full allocation needed
    return targetAllocations.map(target => ({
      ticker: target.ticker,
      targetWeight: target.weight,
      currentWeight: 0,
      driftPercent: -target.weight,
      currentValueUsd: 0,
      targetValueUsd: 0,
      status: 'NEEDS_BUY'
    }));
  }

  return targetAllocations.map(target => {
    const holding = currentHoldings.find(h => h.ticker === target.ticker) || { valueUsd: 0 };
    const currentWeight = (holding.valueUsd / totalPortfolioValueUsd) * 100;
    const driftPercent = currentWeight - target.weight;
    const targetValueUsd = (totalPortfolioValueUsd * target.weight) / 100;

    let status = 'BALANCED';
    if (driftPercent > 5) status = 'OVERWEIGHT (SELL DELTA)';
    else if (driftPercent < -5) status = 'UNDERWEIGHT (BUY DELTA)';

    return {
      ticker: target.ticker,
      targetWeight: target.weight,
      currentWeight: parseFloat(currentWeight.toFixed(2)),
      driftPercent: parseFloat(driftPercent.toFixed(2)),
      currentValueUsd: parseFloat(holding.valueUsd.toFixed(2)),
      targetValueUsd: parseFloat(targetValueUsd.toFixed(2)),
      deltaUsd: parseFloat((targetValueUsd - holding.valueUsd).toFixed(2)),
      status
    };
  });
}

/**
 * Plans a DCA or Rebalance order into a target basket
 * @param {number} depositAmountUsd - Amount to allocate
 * @param {Array} targetAllocations - Array of { ticker, weight }
 * @returns {Object} plan - Array of planned swap orders with validity checks
 */
export function generateAllocationPlan(depositAmountUsd, targetAllocations) {
  const MIN_ORDER_USD = 5.0;

  const orders = targetAllocations.map(item => {
    const allocatedUsd = (depositAmountUsd * item.weight) / 100;
    const meetsMinimum = allocatedUsd >= MIN_ORDER_USD;

    return {
      ticker: item.ticker,
      weight: item.weight,
      allocatedUsd: parseFloat(allocatedUsd.toFixed(2)),
      meetsMinimum,
      warning: meetsMinimum ? null : `Below Binance $5.00 min order (allocated: $${allocatedUsd.toFixed(2)})`
    };
  });

  const allValid = orders.every(o => o.meetsMinimum);

  return {
    totalDepositUsd: depositAmountUsd,
    allValid,
    minOrderFloor: MIN_ORDER_USD,
    orders
  };
}
