# OmniBasket AI 🧺🤖

> **Autonomous Thematic Stock Baskets, 24/7 Smart DCA, & x402 Micropayment Sentinel on BNB Smart Chain**  
> *Built for the **BNB Hack: Tokenized Stocks Edition (with Binance Web3 Wallet)***  
> *Target Tracks: **Main Hackathon Track** ($20,000) & **BNB Agent Studio Dedicated Track** ($2,000)*

---

## 🌟 Executive Summary

**OmniBasket AI** is an autonomous portfolio creation, DCA, and 24/7 dynamic rebalancing agent built natively on **BNB Smart Chain (BSC Mainnet, Chain ID: 56)**.

In traditional finance, equity markets close at 4:00 PM EST on Fridays, freezing trading for 64 continuous weekend hours. **OmniBasket AI bridges TradFi market hours and Web3's 24/7 liquidity**. Powered by the **Binance Web3 Wallet Extension**, **PancakeSwap V2 On-Chain Routing**, and **Fail-Closed Pre-Transaction EVM Simulation**, users manage tokenized stock baskets (`NVDA`, `AAPL`, `MSFT`, `TSLA`) via natural language prompts with verified on-chain execution, pre-flight revert protection against current chain state, and non-bypassable slippage protection.

Additionally, OmniBasket AI incorporates an **ERC-8004 on-chain agent identity** and an **x402 (HTTP 402 Payment Required) micropayment protocol** to consume and monetize proprietary institutional RWA alpha signals on BSC.

---

## 💎 Official Binance Web3 API Integration Matrix

All integrated endpoints strictly follow the official BNB Chain Hackathon specifications:

| Module | Exact Endpoint / Package | Purpose in OmniBasket AI |
|:---|:---|:---|
| **RWA Data** | `GET /api/v1/rwa/token/list` | Discover verified bStocks catalog & active BSC contract addresses |
| **RWA Data** | `GET /api/v1/rwa/token/price` | Pull live on-chain spot prices for tokenized US equities |
| **RWA Data** | `GET /api/v1/rwa/underlying/market-data` | Retrieve TradFi Friday close to compute 24/7 weekend spreads |
| **RWA Data** | `GET /api/v1/rwa/underlying/info` | Ingest corporate metadata, CUSIP, and attestation proof |
| **Trading API** | `GET /api/v1/dex/aggregator/quote` | Fetch optimal swap routes on BSC and obtain 30s `quoteId` |
| **Trading API** | `GET /api/v1/dex/aggregator/swap` | Generate unsigned EVM swap payload (`to`, `data`, `value`) |
| **Trading API** | `GET /api/v1/dex/aggregator/approve-transaction` | Construct conditional ERC-20 approval transaction |
| **Transaction API** | `POST /api/v1/transaction/simulate` | Pre-flight EVM execution simulation to guarantee zero gas waste |
| **Portfolio API** | `GET /api/v1/address/portfolio/overview` | Post-trade holdings, portfolio PnL, and allocation drift sync |
| **Agentic Wallet** | `@binance/agentic-wallet (baw)` | Keyless MPC autonomous execution, daily quotas & guardrails |
| **Agentic Protocol** | `x402 / B402 Protocol` | Autonomous micro-payments for pre-trade sentiment verification |

---

## 🚀 Key Features

### 1. 🗣️ Conversational Strategy Agent & Dual AI Engine
* Parse complex multi-asset investment theses from natural language (e.g. *"Build an AI chips basket with 60% Nvidia and 40% Microsoft"* or *"Allocate $50 into Tech Giants"*).
* **OpenRouter AI Integration**: Powers deep conversational portfolio rebalancing and strategy explanations.
* **Graceful Local Fallback (`omnibasket-neuro`)**: If `OPENROUTER_API_KEY` is omitted, the platform seamlessly uses its built-in deterministic financial reasoning engine with zero downtime or degraded functionality.

### 2. 🔐 Binance Web3 Wallet Extension (Primary Production Flow)
* **True User-Owned Non-Custodial Architecture**: Public users connect their own **Binance Web3 Wallet** (or compatible EIP-1193 injected provider) directly in the browser.
* **Zero Server-Side Keys Required**: Production and Railway deployments require **ZERO Binance API keys or secret keys** on the server.
* **Pre-Broadcast Account & Chain Validation**: Immediately prior to dispatching `eth_sendTransaction`, the client re-verifies that the active wallet is strictly on **BNB Smart Chain Mainnet (Chain ID 56)** and that the signer matches the connected address.

### 3. 🛡️ Meaningful Minimum Output & 0.5% Hard Slippage Protection
* **Zero Minimum Outputs Banned**: Executable calldata strictly forbids zero `amountOutMinWei`. Any attempt to construct a swap with zero or negative minimum output throws an unhandled execution error.
* **Live AMM Quote Verification**: Fresh on-chain quotes are fetched directly from the PancakeSwap V2 Router (`getAmountsOut`) on BSC Mainnet.
* **0.5% Maximum Slippage Bound**: Slippage tolerance is strictly bounded to a maximum of **0.5% (50 basis points)**. Quotes with wider slippage or missing liquidity pools fail closed.
* **Transparent Confirmation UI**: The user is presented with expected output, guaranteed minimum output, quote source, timestamp, and slippage percentage prior to signing.

### 4. 🧪 Fail-Closed Pre-Transaction EVM Simulation Gate
* **Simulation-First Execution**: Every transaction dry-runs against current BSC Mainnet state via Viem before being presented for signing.
* **Pre-Flight Revert Protection**: Potential reverts (unsupported assets, slippage breaches, router errors, unverified allowances) are caught and blocked upfront against current chain conditions.
* **Realistic Risk Disclosure**: Pre-transaction simulation verifies execution against current chain state rather than offering an absolute guarantee of zero gas loss; if on-chain state, pool reserves, or base balances shift between simulation and block inclusion, transactions can still revert and consume gas.
* **Safe Sequential Approval Flow for Zero-Allowance Wallets**:
  1. Calldata is generated for exact-amount token approval (no unlimited allowances).
  2. Approval transaction is simulated on BSC state.
  3. User signs approval transaction in Binance Web3 Wallet.
  4. Platform awaits confirmed on-chain transaction receipt (`status === 'CONFIRMED'`).
  5. A fresh on-chain swap quote and calldata are constructed and re-simulated against the confirmed on-chain allowance.
  6. User signs the final swap transaction only after swap simulation returns `SUCCESS`.

### 5. 🎯 Exact ERC-20 Approvals (No Unlimited Allowances)
* **Unlimited Approvals Eliminated**: Dangerous `uint256.max` approvals are strictly disallowed.
* Token approval calldata specifies the **exact token input amount** required for the specific swap, leaving zero excess allowance exposed on-chain.

### 6. 🗺️ Verified On-Chain Route & Asset Registry
* **Direct & Hop Routing on BSC PancakeSwap V2**:
  - `NVDA`, `AAPL`, `MSFT` route directly via high-liquidity `USDT` pairs.
  - `TSLA` routes via verified two-hop liquidity: `USDT -> WBNB -> TSLA`.
* **Fail-Closed Unroutable Asset Guard**: Tokens lacking public AMM liquidity pools on BSC PancakeSwap V2 (e.g., `USDY`, `GOOG`, `MAG7X`, `AI`) are rejected upfront with descriptive error messages, preventing failed transactions.

### 7. 🕒 24/7 Weekend Sentinel & Drift Engine
* Real-time sync with Wall Street trading clocks (NYSE/NASDAQ 9:30 AM – 4:00 PM EST).
* Monitors portfolio weight drift (> 5.0% threshold) while TradFi equity exchanges are closed.
* Calculates target rebalancing routes to capitalize on off-hours market movements.

### 8. 🤖 BNB Agent Studio Worker & x402 Micropayment Protocol ($2,000 Track)
* **ERC-8004 Standardized Agent Identity** (`OmniBasket Sentinel AI v1.0` on BSC).
* **x402 (HTTP 402) Paywalled RWA Feed**: Micro-monetizes premium institutional momentum signals for 0.01 USDT via EIP-3009 signing.
* Automated 5-step trace: `CHALLENGE 402` → `PREVIEW` → `EIP-3009 SIGN` → `REPLAY` → `UNLOCKED`.

---

## 🏛️ System Architecture

```
                                  USER PROMPT / INTENT
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                             OmniBasket AI Interface                                 │
│                 (Neo-Brutalist Cyberpunk UI · WrapStation Styling)                  │
└──────────────────┬───────────────────────────────────────────────┬──────────────────┘
                   │                                               │
                   ▼                                               ▼
┌───────────────────────────────────────┐       ┌─────────────────────────────────────┐
│        Conversational Parser          │       │       24/7 Weekend Sentinel         │
│  (OpenRouter or Built-in Neuro Model) │       │     (Weight Drift > 5% Engine)      │
└──────────────────┬────────────────────┘       └──────────────────┬──────────────────┘
                   │                                               │
                   └───────────────────────┬───────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                 BSC Route Discovery & Quoting Engine (PancakeSwap V2)               │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  • Checks asset tradability on BSC DEX (rejects unroutable assets upfront)          │
│  • Queries live on-chain `getAmountsOut` across candidate paths (Direct / WBNB hop) │
│  • Enforces 0.5% maximum slippage protection cap                                    │
│  • Derives nonzero `amountOutMinWei` (zero minimum output strictly forbidden)       │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                 Fail-Closed Pre-Transaction EVM Simulation Gate                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  • Dry-runs unsigned calldata against BSC Mainnet state via Viem                    │
│  • Sequential approval: simulates exact approval -> polls receipt -> re-simulates   │
│  • Any revert immediately blocks broadcast against current BSC chain state         │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                  Binance Web3 Wallet Extension (Client-Side Signing)                │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  • Re-checks active chain (must be BSC #56) and active account before signing       │
│  • User approves exact ERC-20 allowance (no uint256.max)                            │
│  • User signs and broadcasts swap via `eth_sendTransaction`                         │
│  • Frontend polls and confirms on-chain transaction receipt                         │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            BNB Smart Chain (Mainnet #56)                            │
│        PancakeSwap V2 Router (0x10ED43C718714eb63d5aA57B78B54704E256024E)           │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

> [!NOTE]
> **About Binance Agentic Wallet (`baw`) Mode:**  
> In OmniBasket AI, visitors can connect their own keyless Binance Agentic Wallet via Binance mobile app QR code pairing (modeled on the Promptfolio architecture). Sessions are strictly isolated per user with `HttpOnly` cookie-only authentication, post-authorization session rotation, and durable AES-256-GCM encrypted storage. App-level guardrails enforce a $50,000 daily spend ceiling, 0.5% maximum slippage protection, and AutoReject policy on BSC Mainnet (#56). If the Binance pairing gateway is offline or unreachable, the platform fails closed honestly without fabricating synthetic pairing states, allowing users to seamlessly use the self-custody Extension Wallet.

---

## 📋 Verified BSC Mainnet Contract Registry

All token contracts used in OmniBasket AI are live on **BNB Smart Chain (Chain ID: 56)**:

| Asset Ticker | Underlying Asset | Status on BSC DEX | Contract Address (BSC Mainnet) | Liquidity Route |
|:---|:---|:---|:---|:---|
| **USDT** | Tether USD (Base) | Active (BEP-20) | `0x55d398326f99059fF775485246999027B3197955` | Base Asset |
| **WBNB** | Wrapped BNB | Active (BEP-20) | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` | Intermediary Hop |
| **NVDA** | NVIDIA Corporation | **Tradable** | `0xa9ee28c80f960b889dfbd1902055218cba016f75` | Direct (`USDT -> NVDA`) |
| **AAPL** | Apple Inc. | **Tradable** | `0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4` | Direct (`USDT -> AAPL`) |
| **MSFT** | Microsoft Corporation | **Tradable** | `0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3` | Direct (`USDT -> MSFT`) |
| **TSLA** | Tesla Inc. | **Tradable** | `0x2494b603319d4d9f9715c9f4496d9e0364b59d93` | Two-Hop (`USDT -> WBNB -> TSLA`) |
| **USDY** | Ondo US Dollar Yield | *Off-DEX (RFQ)* | `0x608593d17a2decbbc4399e4185be4922f97ed32e` | Rejected on AMM (Fail-closed) |
| **GOOG** | Alphabet Inc. | *No AMM Pool* | `0x817f1f6780f99bcaac394a59cb0261962df5da8b` | Rejected on AMM (Fail-closed) |
| **MAG7X**| Magnificent 7 Basket | *No AMM Pool* | `0x50436ec45316a98e72b03ead5752e8543f11ec09` | Rejected on AMM (Fail-closed) |
| **AI** | Artificial Superintelligence | *No AMM Pool* | `0x0DA694Da30e99BE1651B33633dE42fae025b3310` | Rejected on AMM (Fail-closed) |

---

## 🛠️ Project Setup & Local Run

### Prerequisites
* Node.js v18+
* Binance Web3 Wallet Chrome Extension installed in browser

### Environment Variables
Production deployments require **ZERO Binance API keys**. Only `OPENROUTER_API_KEY` is optional for external AI model reasoning:

```bash
# 1. Clone repository
git clone https://github.com/EAZITECH1/omnibasket-ai.git
cd omnibasket-ai

# 2. Install dependencies
npm install

# 3. Configure environment variables (.env)
cp .env.example .env
# Optional: Set OPENROUTER_API_KEY=your_key (falls back to omnibasket-neuro if omitted)

# 4. Run verification test suite
npm test

# 5. Build and launch
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser and click **Connect Wallet** to connect your Binance Web3 Wallet on BSC Mainnet.

---

## 🔗 Verified On-Chain Transactions (BSC Mainnet #56)

All agent operations are verified on BNB Smart Chain Mainnet:

| Action | Leg | Amount | Status | BscScan Explorer Link |
|:---|:---|:---|:---|:---|
| **DEX Market Swap** | `USDT` $\rightarrow$ `NVDA` | 5.00 USDT $\rightarrow$ 0.02163 NVDA | `FINISHED` | [`0x75f946b7...`](https://bscscan.com/tx/0x75f946b7b33d7cfae12eae946f5ae9b01df1a0dabf1f22a1eb1ca5bf4ea462b4) |
| **DEX Market Swap** | `USDT` $\rightarrow$ `WBNB` | 5.50 USDT $\rightarrow$ 0.007377 WBNB | `FINISHED` | [`0xef424e91...`](https://bscscan.com/tx/0xef424e91e3249be77b7d5fd156df7cdd248fb8c9bfff98f9fd1c95e2cc20cc0e) |
| **DEX Market Swap** | `WBNB` $\rightarrow$ `USDT` | 0.007377 WBNB $\rightarrow$ 5.5030 USDT | `FINISHED` | [`0xcd4566a4...`](https://bscscan.com/tx/0xcd4566a4d1f204b13f524d70a6c7e7329dd48d47c2fb5512d6c2bc8671341461) |
| **x402 Micropayment** | `USDT` | 0.0100 USDT (EIP-3009) | `FINISHED` | Verified in x402 sentinel trace |

---

## 📄 Documentation Links

* [**Developer Experience (DevEx) Report**](DEVEX_REPORT.md) — Comprehensive technical feedback log covering onboarding, API latency, schema quirks, and platform suggestions (Worth **25%** of hackathon evaluation).
* [**ERC-8004 Identity Card**](src/agent/agentIdentity.js) — Autonomous Agent Standard declaration.

---

## 🏆 Hackathon Track Alignment

* **Main Track ($20,000)**: Tokenized Stocks Edition with Binance Web3 Wallet. Full-featured, production-ready portfolio engine solving the 24/7 weekend liquidity challenge on BSC with live quotes, fail-closed simulation, 0.5% slippage protection, exact approvals, and extension signing.
* **BNB Agent Studio Dedicated Bounty ($2,000)**: Autonomous agent daemon with ERC-8004 identity, 24/7 market monitoring, automated weight drift rebalancing, and live x402 micropayment paywall integration.

---

## 📜 License
MIT License. Built with ❤️ for the BNB Chain & Binance Web3 ecosystem.
