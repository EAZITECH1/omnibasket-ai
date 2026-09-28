# OmniBasket AI 🧺🤖

> **Autonomous Thematic Stock Baskets & 24/7 Smart DCA on BNB Smart Chain**  
> Built for the *BNB Hack: Tokenized Stocks Edition (with Binance Web3 Wallet)*

---

## 🌟 Overview

**OmniBasket AI** is an intelligent portfolio agent on BNB Smart Chain that allows users to create, DCA into, and dynamically rebalance tokenized stock baskets (using Ondo & bStocks) in plain English.

- **450+ Tokenized Equities & ETFs on BSC**: Instant access to tech equities (AAPL, NVDA, GOOG), thematic indices (MAG7X, AI), and yield-bearing cash buffers (Ondo USDY).
- **Autonomous 24/7 Rebalancing**: Monitors portfolio drift even when Wall Street is closed for the weekend.
- **Deep Binance Web3 Integration**: Powered by Binance Web3 RWA & Trading APIs and the `@binance/agentic-wallet` CLI (`baw`).

---

## 🚀 Quick Start

### 1. Test BSC Tokenized Stock Feed
```bash
node src/test-tokens.js
```

### 2. Connect Binance Agentic Wallet CLI
```bash
baw --help
```

---

## 📂 Repository Structure

- `src/test-tokens.js`: Live query script retrieving 458 tokenized stocks on BSC.
- `DEVEX_REPORT.md`: Continuous developer feedback log for the hackathon submission (25% of total score).
