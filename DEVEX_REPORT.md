# Developer Experience (DevEx) Report

**Project**: OmniBasket AI  
**Track**: BNB Hack: Tokenized Stocks Edition (with Binance Web3 Wallet)  
**Author**: OmniBasket AI Team  

---

## 1. Onboarding & First API Call

* **Time from Opening Docs to First Successful Call**: ~10 minutes.
* **First Endpoint Called**: `GET /bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai`
* **Observations**:
  * The public REST API for RWA token details returned immediately without requiring an API key for general reads.
  * Over 458 tokenized equities and ETFs are active on BSC (`chainId: 56`), including Google (`GOOGon`), Apple (`AAPLon`), Nvidia (`NVDAon`), and themed tokens (`MAG7Xon`, `AIon`).

---

## 2. Tooling & CLI Feedback (`baw`)

* **CLI Installed**: `@binance/agentic-wallet` (`baw`) v1.10.0.
* **Installation Experience**:
  * Seamless installation via `npm install -g @binance/agentic-wallet`.
  * Command routing is structured well across `auth`, `wallet`, `market-order`, `limit-order`, and `x402-payment`.

---

## 3. Edge Cases & API Pitfalls Discovered

* **Authentication & Path Prefixing**:
  * The API uses HMAC-SHA256 signature with `ISO 8601` timestamp.
  * Critical detail: The signed `requestPath` strictly requires the `/build` prefix (e.g. `/build/api/v1/dex/aggregator/...`), otherwise it fails with `40102 Invalid signature`.
* **Minimum Order Size on Tokenized Stocks**:
  * Calling the DEX aggregator quote endpoint with amounts below \$5 returned `code: 40375`, `"Minimum order amount is 5 USD."`
  * *Integration rule*: Any automated DCA or rebalance order must enforce a floor of $\ge \$5.00$ before requesting quotes.
* **Live DEX Aggregator Routing**:
  * Tested live quote for swapping USDT to Ondo USDY on BSC mainnet. The API routed across PancakeSwap V4, Topaz, and Uniswap V4, returning full multi-hop split percentages, estimated gas, and exact `approveTarget` spender address.
* **Dual Execution Modes (RFQ vs. AMM/SWAP)**:
  * From reading `llms-full.txt`: Tokenized stocks fall into three distinct types with different execution pipelines:
    1. **Ondo tokens (`type=1`)**: Always routed via 3-vendor RFQ (InchFusion + CowSwap + PcsXRfq). Requires signing `rfq.typedDataToSign` (EIP-712) and submitting via `/api/v1/dex/aggregator/order/submit`.
    2. **BStock tokens (`type=3`)**: Mixed route offering LiquidMesh (SWAP) and PcsXRfq (RFQ).
    3. **xStock tokens (`type=2`)**: Regular AMM liquidity pools (PancakeSwap on BSC), returning `executionMode=SWAP`.
* **Stock Split & Multiplier Nuance**:
  * A tokenized stock does not necessarily equal exactly 1 underlying share.
  * The API returns a `multiplier` field (e.g., `1.013664...` for dividend adjustments, or `5.0/10.0` for stock splits).
  * Formula required for accurate pricing:
    $$\text{Reference Price} = \frac{\text{Token Price}}{\text{Multiplier}}$$


* **Pre-Transaction Simulation API Schema (`/dex/pre-transaction/simulate`)**:
  * The documentation for pre-transaction simulation mentions `evmParams`. However, passing `{ evmParams: { from, to, data, value } }` or `{ evmParams: [...] }` returns error `code 50000: evmParams is required for EVM chains`.
  * *Discovered working schema*: The API expects `evmTx` at the top level alongside `binanceChainId`:
    ```json
    {
      "binanceChainId": "56",
      "evmTx": {
        "from": "0x...",
        "to": "0x...",
        "data": "0x...",
        "value": "0"
      }
    }
    ```
* **Real On-Chain State Execution in Sandbox**:
  * Binance Web3's simulation endpoint actually spins up a real EVM execution frame on the latest BSC block.
  * When simulating swap calldata from an unfunded wallet, it returned `failReason: "execution reverted: BEP20: transfer amount exceeds balance"`. This proves it is genuinely evaluating bytecode and state rather than returning a mocked success stub, saving users from broadcast reverts and lost gas.
* **CLI Market Order Execution & Error Handling (`baw market-order swap`)**:
  * Running `baw market-order swap --binanceChainId 56 --fromTokenQty 5 --fromToken 0x55d3... --toToken 0x... --json` outputs structured machine-readable JSON.
  * When balance is insufficient, it exits with code 1 and cleanly returns:
    ```json
    {
      "success": false,
      "error": {
        "code": 30003001,
        "name": "ORDER_API_ERROR",
        "message": "The transaction failed because your USDT balance is insufficient to cover this trade. Please top up your USDT balance and retry."
      }
    }
    ```
  * This error structure allowed us to build robust safety fallbacks into OmniBasket AI that guide the user to top up before retrying.

* **x402 (HTTP 402 Payment Required) Protocol via `baw x402-payment`**:
  * Testing `baw x402-payment preview --paymentRequirements '<json>' --json` on BSC (`eip155:56`) with USDT auto-detected the `eip3009` transfer method and returned a unique `paymentId`.
  * The CLI automatically computed the human-readable amount, equivalent USD value at live token prices, and identified `needApproveFirst: false`, enabling instant 1-step micropayments.
  * In autonomous agent loops, when a downstream AI data or alpha feed throws `HTTP 402`, the agent can programmatically preview and sign micropayments via `baw x402-payment sign`, attaching `PAYMENT-SIGNATURE` to unlock paywalled data streams without human intervention.
* **ERC-8004 Autonomous Agent Identity on BNB Chain**:
  * Designed an ERC-8004 compliant on-chain identity for OmniBasket Sentinel (`0x03A4...5283`).
  * The sentinel autonomous worker executes periodic market watcher cycles, polls drift, tests simulation guardrails, and manages portfolio health 24/7 across weekend NYSE closures.

---

## 4. Recommendations for Platform Improvements

1. **Clarify Simulation Endpoint Docs**: Update the developer documentation for `/api/v1/dex/pre-transaction/simulate` to explicitly specify the `evmTx` object format instead of ambiguous `evmParams` examples.
2. **Expose Sandbox Overrides for Simulation**: For agent testing, allow an optional `stateOverride` parameter (similar to `eth_call` state overrides) to test swap execution paths without needing mainnet funds in the developer's agent wallet.
3. **Multi-Leg Basket Atomicity**: Adding a native batched swap endpoint or multi-call router in the DEX aggregator would enable atomic basket rebalancing in a single on-chain transaction rather than $N$ separate swaps.
4. **x402 CLI Local Mock/Test Flag**: Add a `--dry-run` or `--mock-sign` flag to `baw x402-payment sign` for testnet/development environments where developer wallets are not yet funded on mainnet.
