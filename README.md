# OmniBasket AI 🧺🤖

> **Autonomous Thematic Stock Baskets, 24/7 Smart DCA, & x402 Micropayment Sentinel on BNB Smart Chain**  
> *Built for the **BNB Hack: Tokenized Stocks Edition (with Binance Web3 Wallet)***  
> *Target Tracks: **Main Hackathon Track** ($20,000) & **BNB Agent Studio Dedicated Track** ($2,000)*

---

## 🌟 Executive Summary

**OmniBasket AI** is an autonomous portfolio creation, DCA, and 24/7 dynamic rebalancing agent built natively on **BNB Smart Chain (BSC Mainnet, Chain ID: 56)**.

In traditional finance, stock markets close strictly at 4:00 PM EST on Fridays, freezing equities for 64 continuous weekend hours. **OmniBasket AI bridges the gap between TradFi market hours and Web3's 24/7 liquidity**. Powered by the **Binance Web3 DEX Aggregator**, **Binance Agentic Wallet (`baw`) CLI**, and **Pre-Transaction Simulation API**, users can manage tokenized stock baskets (`bStocks`, `Ondo`, `xStocks`) using conversational prompts with automated drift protection and verifiable simulation safety.

Additionally, OmniBasket AI incorporates an **ERC-8004 on-chain agent identity** and an **x402 (HTTP 402 Payment Required) micropayment protocol** to consume and monetize proprietary institutional RWA alpha signals on BSC.

---

## 🚀 Key Features

### 1. 🗣️ Conversational Strategy Agent
* Parse complex multi-asset investment theses from plain English (e.g. *"Build an AI chips basket with 50% Nvidia, 30% Microsoft, and 20% Google"* or *"Create a defensive yield portfolio with Ondo USDY and Apple"*).
* Pre-configured institutional presets: **AI Supercycle**, **Defensive Yield (5.1% APY)**, and **Magnificent 7 Composite**.

### 2. 🛡️ Live Pre-Transaction Simulation Guardrail
* Integrates `POST /build/api/v1/dex/pre-transaction/simulate` from Binance Web3 API.
* Runs EVM sandbox dry-runs against the latest BSC block before any order broadcast.
* Validates calldata, DEX liquidity routes, and catches reverts (e.g., token balance limits) with **\$0 gas lost**.

### 3. ⚡ Multi-Leg DEX Aggregator Execution via Binance Agentic Wallet (`baw`)
* Direct integration with `@binance/agentic-wallet` CLI (`baw market-order swap`).
* Slices multi-leg allocations across BSC DEX liquidity providers (LiquidMesh, PancakeSwap V4, etc.).
* Strict enforcement of the **\$5.00 minimum order floor** and **0.5% maximum slippage bounds**.

### 4. 🕒 24/7 Weekend Sentinel & Drift Engine
* Real-time sync with Wall Street trading clocks (NYSE/NASDAQ 9:30 AM – 4:00 PM EST).
* Monitors portfolio weight drift (> 5.0% threshold) while TradFi exchanges are closed.
* Autonomously calculates target rebalancing routes to capitalize on off-hours market movements.

### 5. 🤖 BNB Agent Studio Worker & x402 Micropayment Protocol ($2,000 Track)
* **ERC-8004 Standardized Agent Identity** (`OmniBasket Sentinel AI v1.0` on BSC).
* **x402 (HTTP 402) Paywalled RWA Feed**: Micro-monetizes premium institutional momentum signals for 0.01 USDT via `baw x402-payment preview` and EIP-3009 signing.
* Automated 5-step trace: `CHALLENGE 402` → `BAW PREVIEW` → `EIP-3009 SIGN` → `REPLAY` → `UNLOCKED`.

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
│     (Strategy & Allocation Sizer)     │       │     (Weight Drift > 5% Engine)      │
└──────────────────┬────────────────────┘       └──────────────────┬──────────────────┘
                   │                                               │
                   └───────────────────────┬───────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           Binance Web3 API & SDK Suite                              │
├───────────────────────────────────┬─────────────────────────────────────────────────┤
│  DEX Aggregator Quote             │  `GET /build/api/v1/dex/aggregator/quote`       │
│  Calldata & Swap Constructor      │  `GET /build/api/v1/dex/aggregator/swap`        │
│  Pre-Transaction Simulation       │  `POST /build/api/v1/dex/pre-transaction/sim`   │
└───────────────────────────────────┴─────────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                     Binance Agentic Wallet (`baw`) & x402 Engine                    │
├───────────────────────────────────┬─────────────────────────────────────────────────┤
│  Market Order Execution           │  `baw market-order swap --binanceChainId 56`    │
│  x402 Micropayment Preview        │  `baw x402-payment preview --json`              │
│  EIP-3009 Header Signer           │  `baw x402-payment sign --selectedIndex 1`      │
│  Agent Identity Card              │  ERC-8004 Autonomous Agent Spec (BSC)           │
└───────────────────────────────────┴─────────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            BNB Smart Chain (Mainnet #56)                            │
│           LiquidMesh · PancakeSwap V4 · Ondo RFQ · bStocks · xStocks                │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Verified BSC Mainnet Contract Registry

All token contracts used in OmniBasket AI are live on **BNB Smart Chain (Chain ID: 56)**:

| Asset Ticker | Underlying Asset | Token Standard | Contract Address (BSC Mainnet) |
|:---|:---|:---|:---|
| **USDT** | Tether USD (Quote Base) | BEP-20 | `0x55d398326f99059fF775485246999027B3197955` |
| **USDY** | Ondo US Dollar Yield (5.1% APY) | RWA / RFQ | `0x608593d17a2decbbc4399e4185be4922f97ed32e` |
| **NVDAon** | NVIDIA Corporation | bStock / LiquidMesh | `0xa9ee28c80f960b889dfbd1902055218cba016f75` |
| **AAPLon** | Apple Inc. | bStock / LiquidMesh | `0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4` |
| **MSFTon** | Microsoft Corporation | bStock / LiquidMesh | `0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3` |
| **GOOGon** | Alphabet Inc. | bStock / LiquidMesh | `0x817f1f6780f99bcaac394a59cb0261962df5da8b` |
| **TSLAon** | Tesla Inc. | bStock / LiquidMesh | `0x2494b603319d4d9f9715c9f4496d9e0364b59d93` |
| **MAG7Xon** | Magnificent 7 Composite | xStock / AMM | `0x50436ec45316a98e72b03ead5752e8543f11ec09` |

---

## 🛠️ Project Setup & Local Run

### Prerequisites
* Node.js v18+
* `@binance/agentic-wallet` CLI installed globally:
  ```bash
  npm install -g @binance/agentic-wallet
  ```

### Installation
```bash
# 1. Clone repository
git clone https://github.com/your-username/omnibasket-ai.git
cd omnibasket-ai

# 2. Install dependencies
npm install

# 3. Configure environment variables (.env)
cp .env.example .env
# Fill in BINANCE_WEB3_API_KEY and BINANCE_WEB3_SECRET_KEY

# 4. Build and run
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Verification Suite

OmniBasket AI includes standalone diagnostic scripts to verify every subsystem:

```bash
# 1. Verify Binance Web3 API Authentication & RWA Token List
node --env-file=.env src/test-auth.js

# 2. Test Multi-Leg Live Quote Aggregator on BSC
node --env-file=.env src/test-quote.js

# 3. Test Pre-Transaction Simulation Endpoint
node --env-file=.env src/test-simulate-payloads.js

# 4. Run Autonomous Background Agent Sentinel Cycle
node src/agent/autonomousWorker.js

# 5. Test Live x402 Micropayment Unlock Flow
curl -s -X POST http://localhost:3000/api/agent/x402-demo
```

---

## 📄 Documentation Links

* [**Developer Experience (DevEx) Report**](DEVEX_REPORT.md) — Comprehensive technical feedback log covering onboarding, API latency, schema quirks, and platform suggestions (Worth **25%** of hackathon evaluation).
* [**ERC-8004 Identity Card**](src/agent/agentIdentity.js) — Autonomous Agent Standard declaration.

---

## 🏆 Hackathon Track Alignment

* **Main Track ($20,000)**: Tokenized Stocks Edition with Binance Web3 Wallet. Full-featured, production-ready portfolio engine solving the 24/7 weekend liquidity challenge on BSC with live quotes, simulation, and execution.
* **BNB Agent Studio Dedicated Bounty ($2,000)**: Autonomous agent daemon with ERC-8004 identity, 24/7 market monitoring, automated weight drift rebalancing, and live x402 micropayment paywall integration via `baw`.

---

## 📜 License
MIT License. Built with ❤️ for the BNB Chain & Binance Web3 ecosystem.
