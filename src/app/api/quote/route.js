export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { BSC_RWA_TOKENS } from '../../../services/tokens.js';
import { getBscSwapQuote, MAX_SLIPPAGE_PERCENT } from '../../../services/bscRouter.js';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    // If batch allocation is requested
    if (body.allocations && Array.isArray(body.allocations)) {
      const totalInvestment = Number(body.totalInvestment || body.depositAmount || 25);
      const results = {};
      const fromToken = BSC_RWA_TOKENS.USDT.contractAddress;

      for (const alloc of body.allocations) {
        const targetToken = BSC_RWA_TOKENS[alloc.ticker];
        if (!targetToken) continue;

        const targetUsd = (totalInvestment * alloc.weight) / 100;
        if (targetToken.tradableOnBscDEX === false) {
          results[alloc.ticker] = {
            success: false,
            ticker: alloc.ticker,
            symbol: targetToken.symbol,
            tradable: false,
            error: targetToken.untradableReason || 'No verified AMM pool on BSC Mainnet'
          };
          continue;
        }

        const amountInWei = BigInt(Math.floor(targetUsd * 1e18));
        try {
          const quote = await getBscSwapQuote({
            fromTokenAddress: fromToken,
            toTokenAddress: targetToken.contractAddress,
            amountInWei: amountInWei > 0n ? amountInWei : 10000000000000000000n, // fallback to $10 for pricing
            maxSlippagePercent: 0.5
          });

          if (quote.success) {
            const outTokens = Number(quote.expectedAmountOutWei) / 1e18;
            const unitPrice = outTokens > 0 ? (targetUsd / outTokens) : 0;
            results[alloc.ticker] = {
              success: true,
              tradable: true,
              ticker: alloc.ticker,
              symbol: targetToken.symbol,
              contractAddress: targetToken.contractAddress,
              fromAmountUsd: targetUsd,
              toAmountTokens: parseFloat(outTokens.toFixed(6)),
              amountOutMinTokens: parseFloat((Number(quote.amountOutMinWei) / 1e18).toFixed(6)),
              unitPriceUsd: parseFloat(unitPrice.toFixed(2)),
              vendor: 'PancakeSwap V2 AMM (BSC #56)',
              routePath: quote.path,
              estimatedGas: '250000'
            };
          } else {
            results[alloc.ticker] = {
              success: false,
              ticker: alloc.ticker,
              symbol: targetToken.symbol,
              tradable: false,
              error: quote.error
            };
          }
        } catch (err) {
          results[alloc.ticker] = {
            success: false,
            ticker: alloc.ticker,
            error: err.message
          };
        }
      }

      return Response.json({ success: true, quotes: results });
    }

    const ticker = body.ticker || body.toTicker;
    const amountUsd = body.amountUsd !== undefined ? body.amountUsd : (body.fromAmount !== undefined ? body.fromAmount : 10);
    const slippagePercent = body.slippagePercent !== undefined ? body.slippagePercent : (body.maxSlippagePercent || 0.5);

    const targetToken = BSC_RWA_TOKENS[ticker];
    if (!targetToken) {
      return Response.json({ success: false, error: `Unknown token ticker: ${ticker}` }, { status: 400 });
    }

    if (targetToken.tradableOnBscDEX === false) {
      return Response.json({
        success: false,
        ticker,
        tradable: false,
        tradableOnBscDEX: false,
        error: targetToken.untradableReason || 'Asset has no active liquidity pool on BSC AMM.'
      }, { status: 400 });
    }

    const fromToken = BSC_RWA_TOKENS.USDT.contractAddress;
    const toToken = targetToken.contractAddress;
    const effectiveAmountUsd = Math.max(5, Number(amountUsd));
    const amountInWei = BigInt(Math.floor(effectiveAmountUsd * 1e18));

    const boundedSlippage = Math.min(Math.max(Number(slippagePercent) || 0.5, 0.01), MAX_SLIPPAGE_PERCENT);

    const quote = await getBscSwapQuote({
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      amountInWei,
      maxSlippagePercent: boundedSlippage
    });

    if (!quote.success) {
      return Response.json({
        success: false,
        ticker,
        error: quote.error || 'Failed to obtain fresh on-chain quote.'
      }, { status: 400 });
    }

    const toAmountTokens = Number(quote.expectedAmountOutWei) / 1e18;
    const unitPrice = toAmountTokens > 0 ? (effectiveAmountUsd / toAmountTokens) : 0;

    return Response.json({
      success: true,
      ticker,
      tradableOnBscDEX: true,
      tradable: true,
      symbol: targetToken.symbol,
      contractAddress: toToken,
      fromAmountUsd: effectiveAmountUsd,
      toAmountTokens: parseFloat(toAmountTokens.toFixed(6)),
      amountOutMinTokens: parseFloat((Number(quote.amountOutMinWei) / 1e18).toFixed(6)),
      unitPriceUsd: parseFloat(unitPrice.toFixed(2)),
      slippagePercent: boundedSlippage,
      slippageBps: Math.round(boundedSlippage * 100),
      vendor: quote.quoteSource,
      routePath: quote.path,
      estimatedGas: '250000',
      quotedAt: quote.quotedAt
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
