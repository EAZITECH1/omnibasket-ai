Title: Live Content

Description: Fetched live

Source: https://web3.binance.com/en/dev-docs/llms-full.txt

---

# Binance Web3 API

> Complete documentation for Large Language Models


---

## Document: Service-Restricted Countries & Regions

URL: /en/dev-docs/web3-api-prohibited-regions


# Service-Restricted Countries & Regions

## Prohibited List

The following countries and regions are restricted from accessing Binance Web3 API. IP checks are
enforced on both the Developer Portal and the API server side.

| Code   | Country / Region                                |
| ------ | ----------------------------------------------- |
| US     | United States                                   |
| GU     | Guam                                            |
| MP     | Northern Mariana Islands                        |
| PR     | Puerto Rico                                     |
| VI     | U.S. Virgin Islands                             |
| AS     | American Samoa                                  |
| UM     | U.S. Minor Outlying Islands                     |
| CA     | Canada                                          |
| NL     | Netherlands                                     |
| IR     | Iran                                            |
| CU     | Cuba                                            |
| KP     | North Korea                                     |
| UA-CR  | Crimea Region                                   |
| UA-DPR | Donetsk People's Republic                       |
| UA-LPR | Luhansk People's Republic                       |
| GB     | United Kingdom                                  |
| JP     | Japan (Local Exchange) — conditional, see below |

## Japan — Conditional Restriction

Japan is a **conditionally restricted** region. The restriction is lifted when **all** of the
following conditions are met:

| Condition       | Requirement                                                       |
| --------------- | ----------------------------------------------------------------- |
| Authentication  | User is authenticated via Binance account login                   |
| KYC             | User's KYC country/region is **not** in the prohibited list above |
| Server Location | Server IP is located in Japan                                     |

If any condition is not met, the Japan restriction applies. All other prohibited regions have no
exemption — both client IP and server location are checked against the list above.



---

## Document: Overview

URL: /en/dev-docs/introduction


# Overview

Binance Web3 API is a developer-oriented on-chain data and trading service platform, providing
unified RESTful APIs covering market data, trading aggregation, on-chain transaction simulation and
broadcasting, and DeFi data and transaction building.

## Architecture

```
Client
  │
  ▼
Gateway        ← Auth / Signature Verification / Rate Limiting
  │
  ├──→ Market API        Real-time prices, candlesticks, token analytics
  ├──→ Trading API       Cross-DEX aggregated quotes and swaps
  ├──→ Transaction API   On-chain transaction simulation and broadcasting
  ├──→ Wallet API        Wallet balance queries
  └──→ DeFi API          DeFi positions, protocols, investments & transaction building
```

## API Modules

| Module                                                    | Description                                          |
| --------------------------------------------------------- | ---------------------------------------------------- |
| [Market API](/products/market-api/introduction)           | Real-time prices, candlesticks, token analytics      |
| [Trading API](/products/trading-api/introduction)         | Cross-DEX aggregated quotes, swaps, approvals        |
| [Transaction API](/products/transaction-api/introduction) | On-chain transaction simulation and broadcasting     |
| [Wallet API](/products/wallet-api/introduction)           | Wallet balance queries across multiple chains        |
| [DeFi API](/products/defi-api/introduction)               | DeFi positions, protocols, investments & tx building |

## Unified Response Format

All endpoints return the `OCResult<T>` format:

```json
{
  "code": 0,
  "msg": "success",
  "data": {},
  "timestamp": 1713500000000,
  "success": true
}
```

- `code = 0` indicates success; non-zero values are error codes
- `data` contains business data, typed per endpoint
- `timestamp` is the server timestamp in milliseconds
- `success` is a convenience flag derived from `code == 0`



---

## Document: Authentication

URL: /en/dev-docs/authentication


# Authentication

import { Callout } from "zudoku/ui/Callout.js";

All Binance Web3 API endpoints are protected by **API Key authentication**. Each request must be
signed using your Secret Key, ensuring that only authorized clients with valid credentials can
access the platform.

---

## Step 1 — Obtain API Credentials

Visit the [**Developer Portal**](https://web3.binance.com/en/dev-portal/project) to create a project
and generate an **API Key** and **Secret Key**:

| Credential   | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| `API Key`    | Uniquely identifies your application (`X-OC-APIKEY` header)  |
| `Secret Key` | Used to sign requests (HMAC-SHA256 mode). Keep this private. |

---

## Step 2 — Understand Required Headers

Every authenticated request must include the following three headers:

| Header             | Required | Description                                                                                |
| ------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `X-OC-APIKEY`      | Yes      | Your API Key string                                                                        |
| `X-OC-TIMESTAMP`   | Yes      | Current UTC time in **ISO 8601** format with milliseconds, e.g. `2026-05-11T10:08:57.715Z` |
| `X-OC-SIGN`        | Yes      | Request signature (Base64-encoded), see [Step 3](#step-3--generate-the-signature)          |
| `X-OC-RECV-WINDOW` | No       | Allowed time deviation in milliseconds (default: `5000`, max: `60000`)                     |
| `X-OC-NONCE`       | No       | Unique request identifier for anti-replay; falls back to `X-OC-SIGN` if omitted            |

---

## Base URL & Required `/build` Prefix

All endpoints are served from the same host with a fixed **`/build` base path**:

```
Base URL = https://web3.binance.com/build
```

This means every request line on the HTTP wire starts with `/build/api/v1/...`, and **the
`requestPath` used in the signature (see Step 3) must also include the `/build` prefix** — exactly
as it appears on the wire.

<Callout type="caution">
  **Critical — the #1 cause of `40102 Invalid signature`:** omitting the
  `/build` prefix from the signed `requestPath`. A bare `/api/v1/...` in the
  signature string will fail signature verification even if the request itself
  is routed correctly. Always prefix the path with `/build` when building the
  pre-hash string.
</Callout>

| What                 | Value / Rule                                     |
| -------------------- | ------------------------------------------------ |
| Base URL             | `https://web3.binance.com/build`                 |
| Full request URL     | `https://web3.binance.com/build` + `/api/v1/...` |
| Signed `requestPath` | `/build/api/v1/...` (+ `?query` if present)      |
| `Host` header        | `web3.binance.com` (no path)                     |

A bare `https://web3.binance.com/api/v1/...` (without `/build`) is redirected to the `/build` prefix
at the edge — do not rely on that for signing. Always include `/build` explicitly in both the
request URL and the signed `requestPath`.

---

## Step 3 — Generate the Signature

### 3.1 Build the Pre-Hash String

Concatenate the following four components **without any separator**:

```
preHash = timestamp + method + requestPath + body
```

| Component     | Rule                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timestamp`   | Exact value of the `X-OC-TIMESTAMP` header (ISO 8601, e.g. `2026-05-11T10:08:57.715Z`)                                                                                                                                          |
| `method`      | HTTP method in **UPPERCASE** (e.g. `GET`, `POST`)                                                                                                                                                                               |
| `requestPath` | Full HTTP path **including the `/build` base-path prefix** plus query string, in **raw URL-encoded form**, e.g. `/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT`. See [Base URL](#base-url--required-build-prefix). |
| `body`        | Raw request body string for `POST`/`PUT`/`DELETE`; **empty string `""`** for `GET`/`HEAD`                                                                                                                                       |

<Callout type="caution">
  **Critical:** `requestPath` must use the exact raw-encoded form as sent on the
  HTTP wire — no percent-decoding, no query-parameter re-ordering, no parameter
  merging. It **must** start with the `/build` prefix; omitting it is the most
  common cause of `40102 Invalid signature`.
</Callout>

#### Example (GET request)

```
timestamp   = "2026-05-11T10:08:57.715Z"
method      = "GET"
requestPath = "/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT"
body        = ""

preHash = "2026-05-11T10:08:57.715ZGET/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT"
```

#### Example (POST request)

```
timestamp   = "2026-05-11T10:08:57.715Z"
method      = "POST"
requestPath = "/build/api/v1/dex/swap"
body        = '{"chainId":1,"fromToken":"0xEEEE...","toToken":"0xA0b8...","amount":"1000000000000000000"}'

preHash = "2026-05-11T10:08:57.715ZPOST/build/api/v1/dex/swap{\"chainId\":1,...}"
```

---

### 3.2 Sign with HMAC-SHA256 (Default)

Compute **HMAC-SHA256** over `preHash` using your `Secret Key`, then **Base64-encode** the result:

```
signature = Base64( HMAC-SHA256(preHash, secretKey) )
```

All strings are **UTF-8 encoded** before hashing.

#### JavaScript / Node.js

```js javascript
const crypto = require("crypto");

const timestamp = new Date().toISOString(); // e.g. "2026-05-11T10:08:57.715Z"
const method = "GET";
// NOTE: the path MUST include the /build base-path prefix — it is part of the signed requestPath.
const pathWithQuery =
  "/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT";
const body = ""; // empty for GET

const preHash = timestamp + method + pathWithQuery + body;
const signature = crypto
  .createHmac("sha256", secretKey)
  .update(preHash, "utf8")
  .digest("base64");
```

#### Python

```python python
import hmac, hashlib, base64
from datetime import datetime, timezone

now        = datetime.now(timezone.utc)
timestamp  = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
method     = "GET"
# NOTE: the path MUST include the /build base-path prefix — it is part of the signed requestPath.
path_query = "/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT"
body       = ""

pre_hash   = timestamp + method + path_query + body
signature  = base64.b64encode(
    hmac.new(secret_key.encode("utf-8"), pre_hash.encode("utf-8"), hashlib.sha256).digest()
).decode("utf-8")
```

#### Java

```java java
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

// pathWithQuery MUST include the /build base-path prefix — it is part of the signed requestPath.
String pathWithQuery = "/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT";
String preHash    = timestamp + method + pathWithQuery + body;
Mac mac           = Mac.getInstance("HmacSHA256");
mac.init(new SecretKeySpec(secretKey.getBytes("UTF-8"), "HmacSHA256"));
String signature  = Base64.getEncoder().encodeToString(
    mac.doFinal(preHash.getBytes("UTF-8"))
);
```

---

## Step 4 — Send the Request

Attach the three required headers to every authenticated request:

```http
GET /build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT HTTP/1.1
Host: web3.binance.com
X-OC-APIKEY:    your-api-key-here
X-OC-TIMESTAMP: 2026-05-11T10:08:57.715Z
X-OC-SIGN:      k3Y2mNpQr...base64sig...==
```

#### Complete JavaScript Example

```js javascript
const crypto = require("crypto");
const axios = require("axios");

const API_KEY = process.env.OC_API_KEY;
const SECRET_KEY = process.env.OC_SECRET_KEY;
// Base URL already includes the /build base-path prefix.
// Pass paths as /api/v1/... — the helper prepends /build for both the URL and the signature.
const BASE_URL = "https://web3.binance.com/build";
const BUILD_PREFIX = "/build";

async function get(path, params = {}) {
  // Use encodeURIComponent so spaces become %20 (not +), matching the raw wire encoding
  const queryStr = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const fullPath = queryStr ? `${path}?${queryStr}` : path;

  const timestamp = new Date().toISOString();
  // requestPath is the full path as sent on the wire — must include the /build prefix.
  const requestPath = BUILD_PREFIX + fullPath;
  const body = ""; // empty string for GET requests

  const preHash = timestamp + "GET" + requestPath + body;
  const signature = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(preHash, "utf8")
    .digest("base64");

  const resp = await axios.get(BASE_URL + fullPath, {
    headers: {
      "X-OC-APIKEY": API_KEY,
      "X-OC-TIMESTAMP": timestamp,
      "X-OC-SIGN": signature,
    },
  });
  return resp.data;
}

// Usage — pass the path WITHOUT /build; the helper prepends it for both URL and signature.
get("/api/v1/dex/aggregator/supported/chain", { binanceChainId: "56" }).then(
  console.log,
);
```

<Callout type="info">
  Whichever style you choose — passing `/build/...` paths explicitly, or letting
  a helper prepend `/build` — the key requirement is that the **signed
  `requestPath`** and the **request URL** both carry the `/build` prefix. Mixing
  the two (e.g. signing without `/build` but sending with it) will produce
  `40102 Invalid signature`.
</Callout>

---

## Timestamp & Anti-Replay

The gateway validates `X-OC-TIMESTAMP` on every authenticated request:

1. **Format**: Must be a valid ISO 8601 string (e.g. `2026-05-11T10:08:57.715Z`).
2. **Time window**: The request timestamp must be within `recv_window` milliseconds of server time.
   Default is **5 000 ms (5 s)**, configurable via `X-OC-RECV-WINDOW` (max **60 000 ms / 60 s**).
3. **Anti-replay**: Each nonce (`X-OC-NONCE` or the signature itself) is valid only once within the
   `2 × recv_window` time window. Replayed requests are rejected with error `40103`.

<Callout type="caution">
  Keep your system clock synchronized with an NTP server to avoid timestamp
  drift errors.
</Callout>

---

## Rate Limits

Authenticated requests are subject to four concurrent rate-limit dimensions:

| Dimension    | Default Limit   | Window | Response Header            |
| ------------ | --------------- | ------ | -------------------------- |
| Per IP       | 1 200 requests  | 60 s   | `X-OC-RateLimit-Limit`     |
| Per API Key  | 1 200 requests  | 60 s   | `X-OC-RateLimit-Remaining` |
| Per User     | 6 000 requests  | 60 s   | `X-OC-Used-Weight`         |
| Per Endpoint | 5 RPS (default) | 1 s    | `X-OC-Used-Weight`         |

When a limit is exceeded the gateway returns **HTTP 429** with a `Retry-After` header (in seconds).

---

## Error Codes

| HTTP Status | Error Code | Meaning                                  |
| ----------- | ---------- | ---------------------------------------- |
| 400         | `40001`    | Invalid request parameters               |
| 401         | `40101`    | API Key is missing, invalid, or disabled |
| 401         | `40102`    | Signature mismatch or missing            |
| 401         | `40103`    | Timestamp expired or request replayed    |
| 403         | `40104`    | API Key lacks required permission        |
| 429         | `42900`    | Rate limit exceeded                      |
| 500         | `50000`    | Internal server error                    |
| 503         | `50001`    | Service temporarily unavailable          |

All error responses follow the unified format:

```json
{
  "code": 40102,
  "msg": "Invalid signature",
  "data": null,
  "timestamp": 1715420937000
}
```

---

## Postman Quick Start

Add the following **Pre-request Script** to your Postman collection to auto-sign every request. In
your collection, set the base URL to `https://web3.binance.com/build` and configure every request
path as `/api/v1/...` — the script below prepends `/build` to the path when building the signature
so the signed `requestPath` matches what is sent on the wire.

```js javascript
// Binance Web3 API Gateway — Auto Sign Script
const apiKey = pm.variables.get("api_key");
const secretKey = pm.variables.get("secret_key");
if (!apiKey || !secretKey) {
  throw new Error("Set api_key and secret_key in Collection Variables first");
}

const timestamp = new Date().toISOString();
const method = pm.request.method.toUpperCase();
const url = pm.request.url;

const pathStr = "/" + (url.path || []).join("/");
const qParams = (url.query || []).filter((p) => !p.disabled && p.key);
const queryStr = qParams
  .map(
    (p) => encodeURIComponent(p.key) + "=" + encodeURIComponent(p.value || ""),
  )
  .join("&");
const pathWithQuery = queryStr ? pathStr + "?" + queryStr : pathStr;

// The signed requestPath MUST include the /build base-path prefix.
// Postman request paths are configured as /api/v1/... (without /build), so prepend it here.
const signedRequestPath = pathWithQuery.startsWith("/build")
  ? pathWithQuery
  : "/build" + pathWithQuery;

const body =
  method === "GET" || method === "HEAD"
    ? ""
    : pm.request.body
      ? pm.request.body.toString()
      : "";

const preHash = timestamp + method + signedRequestPath + body;
const signature = CryptoJS.enc.Base64.stringify(
  CryptoJS.HmacSHA256(preHash, secretKey),
);

pm.request.headers.upsert({ key: "X-OC-APIKEY", value: apiKey });
pm.request.headers.upsert({ key: "X-OC-TIMESTAMP", value: timestamp });
pm.request.headers.upsert({ key: "X-OC-SIGN", value: signature });
```

Set `api_key` and `secret_key` under **Collection → Variables** and every request will be signed
automatically.



---

## Document: SDKs & Tools

URL: /en/dev-docs/sdks-tools/overview


# SDKs & Tools

Build faster with official SDKs maintained by Binance.

import { Link, Typography, LanguageIcon } from "zudoku/components";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "zudoku/ui/Card";
import { ChevronRight, Github } from "lucide-react";

export const IconTile = ({ children, label }) => (
  <span
    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-muted"
    aria-label={label}
    title={label}
  >
    {children}
  </span>
);

export const REGISTRY_ICONS = {
  npm: "https://cdn.simpleicons.org/npm",
  PyPI: "https://cdn.simpleicons.org/pypi",
  Maven: "https://cdn.simpleicons.org/apachemaven",
};

export const CardLink = ({
  to,
  title,
  description,
  children,
  github,
  registry,
}) => (
  <div className="not-prose group relative rounded-xl">
    <Link
      to={to}
      className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={title}
    />
    <Card className="pointer-events-none flex h-full flex-col transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
      <CardHeader className="flex-1 pb-3">
        <div className="flex flex-wrap gap-2">{children}</div>
        <CardTitle className="mt-3 text-base">{title}</CardTitle>
        {description ? (
          <CardDescription className="mt-1">{description}</CardDescription>
        ) : null}
      </CardHeader>
      {(github || registry) && (
        <CardFooter className="pointer-events-auto flex items-center gap-3 overflow-hidden border-t px-4 py-3">
          {github && (
            <a
              href={github}
              target="_blank"
              rel="noopener noreferrer"
              title="View on GitHub"
              className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Github className="h-3.5 w-3.5" aria-hidden />
              Git
            </a>
          )}
          {registry && (
            <a
              href={registry.href}
              target="_blank"
              rel="noopener noreferrer"
              title={`View on ${registry.label}`}
              className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <img
                src={REGISTRY_ICONS[registry.label]}
                alt=""
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0"
                loading="lazy"
              />
              <span className="truncate">{registry.label}</span>
            </a>
          )}
        </CardFooter>
      )}
    </Card>
  </div>
);

---

## Official API Connectors

<div className="mt-1 text-sm text-muted-foreground">
  Production-ready client libraries maintained by Binance for popular languages.
  Each connector includes request signing helpers, typed models, and runnable
  examples.
</div>

<div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 not-prose">
  <CardLink
    to="/sdks-tools/connectors/javascript"
    title="JavaScript"
    description="Official JavaScript connector with request signing, typed models, and examples."
    github="https://github.com/binance/binance-web3-connector-js"
    registry={{ href: "https://www.npmjs.com/package/@binance-web3/wallet", label: "npm" }}
  >
    <IconTile label="JavaScript"><LanguageIcon language="javascript" /></IconTile>
    <IconTile label="TypeScript"><LanguageIcon language="typescript" /></IconTile>
  </CardLink>

<CardLink
  to="/sdks-tools/connectors/python"
  title="Python"
  description="Official Python connector with request signing, typed models, and examples."
  github="https://github.com/binance/binance-web3-connector-python"
  registry={{
    href: "https://pypi.org/project/binance-web3-wallet",
    label: "PyPI",
  }}
>
  <IconTile label="Python">
    <LanguageIcon language="python" />
  </IconTile>
</CardLink>

  <CardLink
    to="/sdks-tools/connectors/java"
    title="Java"
    description="Official Java connector with request signing, typed models, and examples."
    github="https://github.com/binance/binance-web3-connector-java"
    registry={{ href: "https://mvnrepository.com/artifact/io.github.binance/binance-web3-wallet", label: "Maven" }}
  >
    <IconTile label="Java">
      <LanguageIcon language="java" />
    </IconTile>
  </CardLink>
</div>



---

## Document: Agent Native

URL: /en/dev-docs/agent-native/overview


# Agent Native

import { Link } from "zudoku/components";
import { Card, CardHeader, CardTitle, CardDescription } from "zudoku/ui/Card";
import {
  Bot,
  FileText,
  Plug,
  ChevronRight,
  Terminal,
  Lightbulb,
  Users,
} from "lucide-react";

export const IconTile = ({ children, label }) => (
  <span
    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-transparent"
    aria-label={label}
    title={label}
  >
    {children}
  </span>
);

export const Badge = ({ children }) => (
  <span className="inline-flex items-center rounded-md border bg-transparent px-2 py-1 text-xs font-semibold text-foreground">
    {children}
  </span>
);

export const CardLink = ({
  to,
  title,
  description,
  children,
  badge,
  cta = "Learn more",
  disabled = false,
}) => (
  <div className="not-prose group relative rounded-xl">
    {!disabled && (
      <Link
        to={to}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={title}
      />
    )}
    <Card
      className={
        "pointer-events-none flex h-full flex-col bg-transparent transition-all " +
        (disabled
          ? "opacity-90"
          : "group-hover:-translate-y-0.5 group-hover:shadow-md")
      }
    >
      <CardHeader className="flex-1">
        <div className="flex items-center gap-2">
          {children}
          {badge && <Badge>{badge}</Badge>}
        </div>
        <CardTitle className="mt-3 text-base">{title}</CardTitle>
        <CardDescription className="mt-1">{description}</CardDescription>
        {cta && (
          <span
            className={
              "pointer-events-none mt-3 inline-flex items-center gap-1 text-xs font-medium " +
              (disabled ? "text-muted-foreground" : "text-primary")
            }
          >
            {cta} {!disabled && <ChevronRight className="h-3 w-3" />}
          </span>
        )}
      </CardHeader>
    </Card>
  </div>
);

export const ScenarioCard = ({ icon: Icon, title, description }) => (
  <div className="not-prose rounded-xl border bg-transparent p-4 transition-colors hover:border-primary/30 hover:bg-primary/5">
    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-transparent">
      <Icon className="h-5 w-5 text-muted-foreground" />
    </div>
    <h4 className="text-sm font-semibold">{title}</h4>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">
      {description}
    </p>
  </div>
);

<div className="not-prose -mt-2 mb-8 rounded-2xl border bg-[radial-gradient(circle_at_top_right,rgba(240,185,11,0.08),transparent_50%)] p-6">
  <div className="flex items-center gap-3 mb-3">
    <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border bg-primary/10">
      <Bot className="h-6 w-6 text-primary" />
    </div>
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
        Agent Native
      </p>
    </div>
  </div>
  <p className="text-sm leading-6 text-muted-foreground">
    Two complementary interfaces for AI tools, coding assistants, and autonomous
    agents. Discover, read, and interact with Binance Web3 API documentation
    programmatically.
  </p>
</div>

## Core Components

<div className="mt-1 text-sm text-muted-foreground">
  Choose the integration method that fits your use case. Each component serves a
  different purpose — use them individually or together.
</div>

<div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 not-prose">
  <CardLink
    to="/agent-native/llms-txt"
    title="llms.txt"
    description="A lightweight discovery protocol. AI tools fetch static files to understand what documentation is available and load full content."
    badge="Static files"
  >
    <IconTile label="llms.txt"><FileText className="h-5 w-5" aria-hidden /></IconTile>
  </CardLink>

  <CardLink
    to="#"
    title="MCP Server"
    description="Native integration for AI IDEs via Model Context Protocol. Search docs, generate code, and test API calls directly."
    cta="Coming soon"
    disabled
  >
    <IconTile label="MCP Server"><Plug className="h-5 w-5" aria-hidden /></IconTile>
  </CardLink>
</div>

---

## Quick Start

### Fetch documentation with llms.txt

```bash
# Summary — document titles, descriptions, and links
curl -s https://web3.binance.com/en/dev-docs/llms.txt

# Full content — complete documentation in a single file
curl -s https://web3.binance.com/en/dev-docs/llms-full.txt
```

The MCP Server quick start will be published once the interface is available.

---

## Who Is This For?

<div className="mt-1 text-sm text-muted-foreground">
  Whether you're building with AI IDEs or integrating documentation into agent
  pipelines, there's a tool for your workflow.
</div>

<div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 not-prose">
  <ScenarioCard
    icon={Terminal}
    title="AI IDE Users"
    description="Using Claude Code, Cursor, or Windsurf? The MCP Server will give you native tool integration — search docs and generate code without leaving your editor."
  />
  <ScenarioCard
    icon={Lightbulb}
    title="LLM Application Builders"
    description="Use llms.txt to inject up-to-date Binance Web3 API documentation into your prompts and agent context."
  />
  <ScenarioCard
    icon={Users}
    title="Prompt Engineers"
    description="Use llms.txt to feed complete Binance Web3 API documentation into any LLM. Perfect for building prompts with up-to-date API context."
  />
</div>

---

## How They Work Together

<div className="not-prose mt-4 rounded-xl border bg-transparent p-5 text-sm leading-7 font-mono">
  <div className="text-muted-foreground mb-2">AI Tool / Agent</div>
  <div className="ml-4 border-l-2 border-primary/30 pl-4 space-y-2">
    <div>
      <span className="text-primary font-semibold">llms.txt</span> → Quick
      discovery: "What docs exist?"
    </div>
    <div>
      <span className="text-primary font-semibold">MCP Server</span> → Native
      integration: "Search docs, generate code, test API"
    </div>
  </div>
</div>



---

## Document: MCP Server

URL: /en/dev-docs/agent-native/mcp-server


# MCP Server

import { Link } from "zudoku/components";
import { Plug, Hourglass, Terminal } from "lucide-react";

<div className="not-prose -mt-2 mb-8 rounded-2xl border bg-[radial-gradient(circle_at_top_right,rgba(240,185,11,0.08),transparent_50%)] p-6">
  <div className="flex items-center gap-3 mb-3">
    <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border bg-primary/10">
      <Plug className="h-6 w-6 text-primary" />
    </div>
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
        Coming soon
      </p>
      <h2 className="mt-1 text-lg font-semibold">MCP Server</h2>
    </div>
  </div>
  <p className="text-sm leading-6 text-muted-foreground">
    Native integration for AI IDEs via the Model Context Protocol. Search
    Binance Web3 API docs, generate code, and test API calls directly from your
    editor — without leaving the conversation.
  </p>
</div>

## What to expect

<div className="not-prose mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
  <div className="rounded-xl border bg-transparent p-4">
    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-transparent">
      <Terminal className="h-5 w-5 text-muted-foreground" />
    </div>
    <h4 className="text-sm font-semibold">Editor-native tools</h4>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">
      Drop the server URL into Claude Code, Cursor, or Windsurf and call docs /
      codegen tools as MCP actions.
    </p>
  </div>
  <div className="rounded-xl border bg-transparent p-4">
    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-transparent">
      <Hourglass className="h-5 w-5 text-muted-foreground" />
    </div>
    <h4 className="text-sm font-semibold">SSE transport</h4>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">
      Server-Sent Events transport with low latency, designed to plug into the
      same agent tools as llms.txt.
    </p>
  </div>
</div>

## In the meantime

While the MCP Server is being finalized, the static
**<Link to="/agent-native/llms-txt">llms.txt</Link>** files cover the discovery and full-content use
cases for any LLM-powered workflow.



---

## Document: /agent-native/llms-txt

URL: /en/dev-docs/agent-native/llms-txt


# llms.txt

[llms.txt](https://llmstxt.org/) is a proposed standard for making website content accessible to
large language models. Similar to `robots.txt` for web crawlers, `llms.txt` tells AI tools what
documentation is available and how to access it.

## Files

Binance Web3 API provides two llms.txt files:

| File            | URL                                                                                    | Description                                            |
| --------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `llms.txt`      | <a href={`/en/dev-docs/llms.txt`} target="\_blank">/en/dev-docs/llms.txt</a>           | Summary — document titles, descriptions, and links     |
| `llms-full.txt` | <a href={`/en/dev-docs/llms-full.txt`} target="\_blank">/en/dev-docs/llms-full.txt</a> | Full content — complete documentation in a single file |

## Format

### llms.txt (Summary)

The summary file contains a structured list of all documentation pages with titles, descriptions,
and URLs:

```
# Binance Web3 API

> On-chain data & trading services for developers.

## Market API

- [Introduction](/market-api/introduction): Market API overview
- [Get Price](/market-api/api-reference/get-price): Real-time token price

## Trading API

- [Introduction](/trading-api/introduction): DEX aggregator overview
- [Swap](/trading-api/api-reference/swap): Execute token swap
- [Quote](/trading-api/api-reference/quote): Get swap quote
- [Approve Transaction](/trading-api/api-reference/approve-transaction): Token approval

## Transaction API

- [Introduction](/transaction-api/introduction): Transaction broadcasting
- [Broadcast](/transaction-api/api-reference/broadcast-transactions): Submit signed tx
```

### llms-full.txt (Full Content)

The full file includes the complete markdown content of every documentation page, separated by
headers. This is useful for loading the entire documentation into an LLM's context window.

## Usage Examples

### Feed into any LLM

```bash
# Download and use as context
curl -s https://web3.binance.com/en/dev-docs/llms.txt

# Full documentation for comprehensive context
curl -s https://web3.binance.com/en/dev-docs/llms-full.txt
```

### Use with Claude

```
Please read https://web3.binance.com/en/dev-docs/llms.txt and help me
understand how to execute a token swap using the Binance Web3 Trading API.
```

### Use in a Python script

```python
import requests

# Fetch the documentation index
response = requests.get("https://web3.binance.com/en/dev-docs/llms.txt")
docs_index = response.text

# Feed into your LLM as context
messages = [
    {"role": "system", "content": f"Binance Web3 API docs:\n{docs_index}"},
    {"role": "user", "content": "How do I get a swap quote?"}
]
```

### Use with LangChain

```python
from langchain_community.document_loaders import WebBaseLoader

loader = WebBaseLoader("https://web3.binance.com/en/dev-docs/llms-full.txt")
docs = loader.load()
```

## When to Use llms.txt

- **llms.txt** — You want to quickly give an LLM awareness of all available documentation
- **llms-full.txt** — You want to load the entire documentation set into an LLM's context window



---

## Document: Python

URL: /en/dev-docs/sdks-tools/connectors/python


# Python

The official Python connector for the Binance Web3 Wallet API, designed for backend applications
running on Python.

The connector is published as the `binance-web3-wallet` PyPI package. It supports the Web3 Wallet
REST API and provides built-in request signing and typed request/response models.

For source code, issues, and release notes, see the
[binance-web3-connector-python](https://github.com/binance/binance-web3-connector-python) repository
on GitHub.

## Supported environments

- Python 3.9 or newer
- Backend Python applications and services

> This connector is intended for server-side usage only. Interactive or client-side Python
> environments are not supported.

## Typical use cases

- Backend services querying balances, transactions, and supported chains
- Building and submitting swap and transfer transactions
- Integrating Web3 Wallet market and pricing data into backend systems

## Key features

- Support for the Binance Web3 Wallet REST API
- Built-in request signing for authenticated endpoints
- Typed request and response models
- Consistent API design

## Getting started

Install the package:

```bash
pip install binance-web3-wallet
```

Create a client and send a request:

```python
from binance_sdk_web3_wallet.web3_wallet import Web3Wallet, ConfigurationRestAPI

configuration_rest_api = ConfigurationRestAPI(
    api_key=os.environ["BINANCE_API_KEY"],
    api_secret=os.environ["BINANCE_API_SECRET"],
)
client = Web3Wallet(config_rest_api=configuration_rest_api)

response = client.rest_api.get_supported_chains()
```

The example above uses HMAC-based authentication. Asymmetric key authentication using a private key
is also supported.

Refer to the package documentation for REST API examples.

## Notes and best practices

- Store API keys securely using environment variables or a secrets manager
- Monitor rate limits and endpoint weights when building high-throughput services



---

## Document: JavaScript

URL: /en/dev-docs/sdks-tools/connectors/javascript


# JavaScript

The official JavaScript connector for the Binance Web3 Wallet API, designed for backend applications
running on Node.js.

The connector is published as the `@binance-web3/wallet` npm package. It supports the Web3 Wallet
REST API and provides built-in request signing, connection management and TypeScript definitions.

For source code, issues, and release notes, see the
[binance-web3-connector-js](https://github.com/binance/binance-web3-connector-js) repository on
GitHub.

## Supported environments

- Node.js v22.12.0 or newer (LTS versions recommended)
- JavaScript and TypeScript backend applications

> This connector is intended for server-side usage only.  
> Browser environments are not supported at this time.

## Typical use cases

- Backend services querying balances, transactions, and supported chains
- Building and submitting swap and transfer transactions
- Integrating Web3 Wallet market and pricing data into backend systems

## Key features

- Support for the Binance Web3 Wallet REST API
- Built-in request signing for authenticated endpoints
- First-class TypeScript definitions
- Configurable timeouts, retries, and proxy support
- Consistent API design

## Getting started

Install the package:

```bash
npm install @binance-web3/wallet
```

Create a client and send a request:

```ts
import { Web3Wallet, Web3WalletRestAPI } from "@binance-web3/wallet";

const configurationRestAPI = {
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET,
};
const client = new Web3Wallet({ configurationRestAPI });

const response = await client.restAPI.getSupportedChains();
const data = await response.data();
```

The example above uses HMAC-based authentication. Asymmetric key authentication using a private key
is also supported.

Refer to the package documentation for REST API examples.

## Notes and best practices

- Store API keys securely using environment variables or a secrets manager
- Monitor rate limits and endpoint weights when building high-throughput services



---

## Document: Java

URL: /en/dev-docs/sdks-tools/connectors/java


# Java

The official Java connector for the Binance Web3 Wallet API, designed for backend applications and
services running on the JVM.

The connector provides an idiomatic Java interface to the Web3 Wallet REST API. It includes built-in
request signing and strongly typed request and response models to help you build reliable and
maintainable integrations.

For source code, issues, and release notes, see the
[binance-web3-connector-java](https://github.com/binance/binance-web3-connector-java) repository on
GitHub.

## Supported environments

- Java 11 or newer
- Backend Java applications and JVM-based services

> This connector is intended for server-side usage only.

## Typical use cases

- Backend services querying balances, transactions, and supported chains
- Building and submitting swap and transfer transactions
- Integrating Web3 Wallet market and pricing data into backend systems

## Key features

- Support for the Binance Web3 Wallet REST API
- Built-in request signing for authenticated endpoints
- Strongly typed request and response models
- Consistent and idiomatic Java API design

## Getting started

Add the dependency for the Web3 Wallet connector:

```xml
<dependency>
  <groupId>io.github.binance</groupId>
  <artifactId>binance-web3-wallet</artifactId>
  <version><!-- latest version --></version>
</dependency>
```

Create a client and send a request:

```java
import com.binance.connector.client.common.configuration.ClientConfiguration;
import com.binance.connector.client.common.configuration.SignatureConfiguration;
import com.binance.connector.client.web3_wallet.rest.Web3WalletRestApiUtil;
import com.binance.connector.client.web3_wallet.rest.api.Web3WalletRestApi;

public class Main {
    public static void main(String[] args) throws Exception {
        SignatureConfiguration signatureConfiguration = new SignatureConfiguration();
        signatureConfiguration.setApiKey(System.getenv("BINANCE_API_KEY"));
        signatureConfiguration.setSecretKey(System.getenv("BINANCE_API_SECRET"));

        ClientConfiguration clientConfiguration = Web3WalletRestApiUtil.getClientConfiguration();
        clientConfiguration.setSignatureConfiguration(signatureConfiguration);

        Web3WalletRestApi web3WalletApi = new Web3WalletRestApi(clientConfiguration);
        web3WalletApi.getSupportedChains();
    }
}
```

The example above uses HMAC-based authentication. Asymmetric key authentication using a private key
is also supported.

Refer to the package documentation for REST API examples.

## Notes and best practices

- Store API keys securely using environment variables or a secrets manager
- Monitor rate limits and endpoint weights when building high-throughput services



---

## Document: Market WebSocket

Real-time market data streaming over WebSocket

URL: /en/dev-docs/products/websocket-api/market-websocket


# Market WebSocket

Market WebSocket provides real-time on-chain market data push streams, including token prices,
transaction data, trade history, and candlestick data.

## Connection

Stream domain: `wss://web3-stream.binance.com/w3w/stream`

Before connecting,
[Get WebSocket Auth Token](/catalog/web3-wallet/api/rest-api/web-socket-api#get-web-socket-auth-token)
and append the token to the URL as a query parameter.

```
wss://web3-stream.binance.com/w3w/stream?token=xxx
```

## How to Subscribe

After connecting, send a JSON message to subscribe to a stream:

```json
{
  "method": "SUBSCRIBE",
  "params": ["<stream>"],
  "id": 1
}
```

## How to Unsubscribe

```json
{
  "method": "UNSUBSCRIBE",
  "params": ["<stream>"],
  "id": 1
}
```

## Response Format

All push messages share the following envelope:

```json
{
  "stream": "<stream>",
  "data": { ... }
}
```



---

## Document: Introduction

WebSocket Introduction

URL: /en/dev-docs/products/websocket-api/introduction


# Introduction

Binance Web3 API provides real-time data streaming over WebSocket. Connections are protected by an
API Key. Please apply for an API Key before connecting, and use the WebSocket Auth API to obtain a
token when establishing the connection.

## How to Connect

Stream domain: `wss://web3-stream.binance.com/w3w/stream`

Before connecting, please
[Get WebSocket Auth Token](/catalog/web3-wallet/api/rest-api/web-socket-api#get-web-socket-auth-token)
and append the token to the URL as a query parameter.

Example:

```
wss://web3-stream.binance.com/w3w/stream?token=xxx
```

## How to Subscribe

Once connected, you can subscribe or unsubscribe to streams.

**Subscription Parameters**

| Parameter | Type           | Required | Description                                                                                                         |
| --------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `id`      | int            | Yes      | Randomly generated at connection time; remains unchanged for the lifetime of the connection                         |
| `method`  | String         | Yes      | Accepted values: `SUBSCRIBE` / `UNSUBSCRIBE`                                                                        |
| `params`  | List\<String\> | Yes      | The streams to subscribe to. Stream definitions are provided in the WebSocket documentation for each feature module |

Example:

```json
{
  "id": 1,
  "method": "SUBSCRIBE",
  "params": [
    "w3w@onchainos@pub@price@CT_501@5UnvDYKxRxdDjPkMbFAWDJfcZaYgat3FzzzSsUUMpump"
  ]
}
```

**Response Parameters**

| Parameter | Type   | Required | Description                   |
| --------- | ------ | -------- | ----------------------------- |
| `stream`  | String | Yes      | Same as the subscribed stream |
| `data`    | Object | Yes      | Response data                 |

Example:

```json
{
  "stream": "w3w@onchainos@pub@price@CT_501@5UnvDYKxRxdDjPkMbFAWDJfcZaYgat3FzzzSsUUMpump",
  "data": {
    "p": "0.00001234",
    "t": 1700000000000
  }
}
```

## Notes

- Each connection is valid for no more than 24 hours. Please handle reconnection logic
  appropriately.
- The server sends a ping frame every 3 minutes. The client must reply with a pong frame within 10
  minutes, otherwise the server will close the connection. Unpaired pong frames are allowed (i.e.
  the client may send pong frames more frequently than once every 15 minutes to keep the connection
  alive).
- The WebSocket server accepts a maximum of 10 subscription messages per second.
- If a client exceeds this limit, the connection will be closed. IPs that are repeatedly
  disconnected may be blocked by the server.
- A single connection can subscribe to a maximum of 1024 streams.



---

## Document: Error Codes

WebSocket API error code reference

URL: /en/dev-docs/products/websocket-api/error-codes


# Error Codes

| Error Message                                                                                                                                                           | Description                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `{"code": 0, "msg": "Unknown property"}`                                                                                                                                | Invalid parameter applied in `SET_PROPERTY` or `GET_PROPERTY` |
| `{"code": 1, "msg": "Invalid value type: expected Boolean"}`                                                                                                            | Only accepts `true` or `false`                                |
| `{"code": 2, "msg": "Invalid request: property name must be a string"}`                                                                                                 | The provided property name is invalid                         |
| `{"code": 2, "msg": "Invalid request: request ID must be an unsigned integer"}`                                                                                         | Parameter `id` is missing or `id` value is an invalid type    |
| `{"code": 2, "msg": "Invalid request: unknown variant %s, expected one of SUBSCRIBE, UNSUBSCRIBE, LIST_SUBSCRIPTIONS, SET_PROPERTY, GET_PROPERTY at line 1 column 28"}` | Typo, or the provided value is not the expected type          |
| `{"code": 2, "msg": "Invalid request: too many parameters"}`                                                                                                            | Unnecessary parameters were provided in the data              |
| `{"code": 2, "msg": "Invalid request: property name must be a string"}`                                                                                                 | Property name was not provided                                |
| `{"code": 2, "msg": "Invalid request: missing field method at line 1 column 73"}`                                                                                       | `method` was not provided in the data                         |
| `{"code": 3, "msg": "Invalid JSON: expected value at line %s column %s"}`                                                                                               | JSON syntax error                                             |
| `{"code":-1121, "msg": "Invalid symbol or insufficient for one or more streams"}`                                                                                       | Stream Unauthorized                                           |



---

## Document: Supported Skills

URL: /en/dev-docs/products/wallet-skills/supported-skills


# Supported Skills

Binance Wallet Skills are published on
[binance-skills-hub](https://github.com/binance/binance-skills-hub/tree/main/skills/binance-web3),
including 10 read-only **Wallet Skills** and two **Agentic Wallet Skills** for on-chain trading.

## Overview

### Published Wallet Skills

| Skill                                 | Type | Status  | Wallet Required |
| ------------------------------------- | ---- | ------- | --------------- |
| **query-token-info**                  | Read | ✅ Live | No              |
| **query-token-audit**                 | Read | ✅ Live | No              |
| **query-address-info**                | Read | ✅ Live | No              |
| **crypto-market-rank**                | Read | ✅ Live | No              |
| **meme-rush**                         | Read | ✅ Live | No              |
| **trading-signal**                    | Read | ✅ Live | No              |
| **binance-trading-signal**            | Read | ✅ Live | No              |
| **binance-wallet-tracker**            | Read | ✅ Live | No              |
| **binance-leaderboard**               | Read | ✅ Live | No              |
| **binance-tokenized-securities-info** | Read | ✅ Live | No              |

### Agentic Wallet Skills

| Skill                           | Type         | Status  | Wallet Required |
| ------------------------------- | ------------ | ------- | --------------- |
| **binance-agentic-wallet**      | Read + Write | ✅ Live | Yes (write ops) |
| **binance-onchain-copy-trader** | Read + Write | ✅ Live | Yes             |

---

## Published Wallet Skills

### query-token-info

Comprehensive token research — from discovery to deep analysis in one place.

**Supported operations**

| Operation          | Description                                                                        |
| ------------------ | ---------------------------------------------------------------------------------- |
| Token search       | Search by name, symbol, or contract address — returns price, market cap, liquidity |
| Metadata           | Description, creator, audit status, social links                                   |
| Live market data   | Price changes across timeframes (5m/1h/4h/24h), buy/sell volume, holder analytics  |
| Candlestick charts | OHLCV data from 1s to 1-month intervals                                            |

**Supported chains:** BSC, Base, Solana

```
What's the price of BNB?
Show me the holder distribution for this token
Give me SOL's 4-hour candlestick data
```

---

### query-token-audit

Pre-trade security audit to identify risky contracts and malicious tokens.

**Supported operations**

| Operation             | Description                                                       |
| --------------------- | ----------------------------------------------------------------- |
| Risk scoring          | Returns LOW / MEDIUM / HIGH risk level (scale 1–5)                |
| Honeypot detection    | Identifies contracts that can be bought but not sold              |
| Tax analysis          | Returns buy/sell tax rates — flags anything above 10% as critical |
| Contract verification | Checks whether source code is publicly verified                   |

**Supported chains:** Ethereum, BSC, Base, Solana

> ⚠️ Audit results are for reference only. LOW risk is not a safety guarantee. Always do your own
> research.

```
Is this contract address safe?
Does this token have honeypot risk?
```

---

### query-address-info

Query all tokens held by a wallet address, with balances and valuations.

**Supported operations**

| Operation      | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| Holdings query | Returns all token balances, quantities, and contract addresses |
| Price data     | Current USD price and 24h change for each token                |
| Pagination     | Use offset parameter to page through large portfolios          |

**Supported chains:** BSC, Base, Solana

```
What tokens does this address hold?
What positions does 0xABC... have on BSC?
```

---

### crypto-market-rank

Multi-dimensional crypto market rankings covering social buzz, fund flows, Meme coins, and trader
performance.

**Supported operations**

| Operation           | Description                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Social buzz ranking | Ranked by community discussion volume, with sentiment analysis (positive/negative/neutral) |
| Unified rankings    | Trending tokens, top searched, Binance Alpha picks, tokenized stocks                       |
| Smart money inflow  | Top tokens by net buying from tracked smart wallets                                        |
| Meme token rank     | Top 100 Meme tokens from Pulse launchpad, scored by breakout potential                     |
| Trader PnL ranking  | Address-level realized P&L over 7d/30d/90d                                                 |

**Supported chains:** BSC, Base, Solana

```
Which tokens have the highest social buzz right now?
What are smart money wallets buying lately?
Show me the Binance Alpha picks ranking
```

---

### meme-rush

Real-time Meme token tracking + AI hot topic discovery, built for fast-paced Meme trading. Includes
two core features:

**Meme Rush — Launchpad token lifecycle tracking**

| Operation       | Description                                                                  |
| --------------- | ---------------------------------------------------------------------------- |
| New tokens      | Tracks newly launched tokens on the bonding curve                            |
| Migrating soon  | Monitors tokens near the end of the bonding curve, about to migrate to DEX   |
| Migrated tokens | Tokens that just completed migration — capture early liquidity opportunities |

**Topic Rush — AI hot topic discovery**

| Operation     | Description                                              |
| ------------- | -------------------------------------------------------- |
| Latest topics | Discover newest market hot topics with associated tokens |
| Rising topics | Topics gaining momentum (all-time high inflow $1k–$20k)  |

Each topic returns: topic name, AI summary, net inflow (total/1h), associated token list (with
market cap, liquidity, net inflow, holder count, etc.).

**Supported chains:** Solana (Pump.fun, Raydium, etc.), BSC (Four.meme, Flap, etc.)

```
What new Meme tokens launched on Solana recently?
Which Meme tokens are about to migrate to DEX?
What topics are trending right now?
What are the rising hot topics?
```

---

### trading-signal

Monitors on-chain smart money trading activity and outputs structured buy/sell signals for
reference.

**Supported operations**

| Operation        | Description                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Signal feed      | Buy/sell signals from smart money wallets on Solana and BSC                                                |
| Price comparison | Signal trigger price vs current price — gauge whether entry is still relevant                              |
| Signal quality   | Returns peak gain (maxGain) and smart money exit rate (exitRate)                                           |
| Token tags       | Labels tokens with Social Events, Launch Platform (e.g., Pumpfun), Sensitive Events (e.g., whale buy/sell) |
| Signal status    | Classifies signals as `active` / `timeout` / `completed`                                                   |

**Supported chains:** Solana, BSC

```
What are the latest smart money buy signals?
Are there any new on-chain signals on BNB Chain?
What was the peak gain after this signal triggered?
```

---

### binance-trading-signal

Builds on the same signal data, and adds the part `trading-signal` does not have: **signal
strategies you define yourself, and backtests to judge them**.

**Supported operations**

| Operation          | Description                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Strategy lifecycle | Create, update, enable/disable and delete your own signal strategies                     |
| Backtests          | Trigger or schedule a backtest; read hit rates by tier to compare strategies             |
| Indicator analysis | How a given indicator (KOL holdings, launch protocol, liquidity) affects outcomes        |
| Signal discovery   | The smart money feed, sortable by peak gain or multi-strategy hit, plus token buyability |
| Reports            | Daily signal report and monthly backtest review, BSC vs Solana                           |

**Supported chains:** Solana, BSC

> **Which of the two do you want?** `trading-signal` answers "what did smart money just buy" — one
> discrete event per result, nothing to configure. `binance-trading-signal` is for when you want the
> platform to watch for _your_ conditions and to have evidence about whether those conditions
> worked. Real-time push and the copy-trading scaffold both build on this one.

```
Create a signal strategy for tokens with liquidity above $50k and at least 3 smart money buyers
Backtest it over the last month and show the hit rate by tier
Does KOL holding actually improve the outcome?
```

---

### binance-wallet-tracker

Monitors what a set of wallets is doing — either your own private group or the public Smart Money /
KOL sets — and replays their behaviour after the fact.

**Supported operations**

| Operation        | Description                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Group management | Create and rename groups, batch-import addresses, update labels, manage a follow list                                                   |
| Discovery        | Consensus buys across a group, pioneer wallets, who bought a given token, similar wallets                                               |
| Evaluation       | Token risk level, group trading rhythm, token heat, follow-list quality                                                                 |
| Behaviour replay | Accumulation / distribution, sector rotation, anomalous large orders, round-trips, first-mover vs follower, wake-ups, bot-like patterns |
| Real-time push   | WebSocket stream of trade events at Smart Money, KOL, wallet and address level                                                          |

**Supported chains:** BSC, Solana, Base, Ethereum — and more. This list is a verified subset;
`baw wallet chains` returns the live set, so probe a chain before treating it as unsupported.

> The **smart-money signal** scope (`--smy`) behaves as a _state_ stream rather than an alert
> stream: one signal is pushed repeatedly as its fields fill in, so deduplicate by signal ID before
> counting anything. Address- and wallet-scope pushes are discrete trade events and do not need
> this.

```
Create a group and import these 20 addresses
Which tokens did my group buy in the last 4 hours?
Is this address an early buyer or a follower?
Push me trades from Smart Money wallets in real time
```

---

### binance-leaderboard

Ranks on-chain traders and scores individual wallets, so you can decide which addresses are worth
watching before you commit to following them.

**Supported operations**

| Operation         | Description                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Leaderboard query | Top traders ranked by PnL, win rate, volume, trade count, or token count                                   |
| Address analysis  | A 6-dimension score — win rate, stability, drawdown, tags, PnL, follow-friendliness — plus an AI archetype |
| Gem Hunter        | Find the wallets holding a given token                                                                     |
| Presets           | Save and reload filter conditions and Gem Hunter configs                                                   |

**Supported chains:** BSC, Solana, Base, Ethereum

> Single dimensions saturate. Over a short window many addresses tie at 100% win rate, so ranking on
> one dimension alone will not separate them — add your own secondary criteria.

```
Show me the top BSC traders by win rate this week
Analyze this wallet — is it worth following?
Which wallets hold this token?
```

---

### binance-tokenized-securities-info

Query real-time on-chain data and status for Ondo Finance tokenized US stocks.

**Supported operations**

| Operation          | Description                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Asset list         | All supported tokenized stocks with contract addresses                                            |
| Company info       | CEO, industry, concept tags, attestation report links                                             |
| Market status      | Whether the Ondo market is open/paused, and next open/close times                                 |
| Corporate actions  | Per-token halt status (splits, dividends, mergers, etc.)                                          |
| Live on-chain data | Token price, 24h change, holder count, supply, market cap, and fundamentals (P/E, dividend yield) |
| Candlestick data   | OHLC data from 1-minute to 1-day intervals                                                        |

**Supported chains:** Ethereum, BSC

> Note: Each token represents `multiplier` shares, not 1 share. To compare with the reference price:
> `referencePrice = tokenPrice ÷ sharesMultiplier`.

```
Is the Ondo market open right now?
What's the current price of the AAPL tokenized stock?
Which tokenized stocks are halted due to corporate actions?
```

---

## Agentic Wallet Skills

`binance-agentic-wallet` provides wallet management, token transfers, market swaps, limit orders,
prediction market trading, and DeFi.

→ See [Agentic Wallet Documentation](../agentic-wallet/introduction) for details.

`binance-onchain-copy-trader` is a **scaffold** rather than a capability: it wires the Skills above
into one runnable copy-trading pipeline (signal or address subscription → risk gates → order →
on-chain stop-loss and take-profit → reconciliation) and exposes every strategy decision as a hook.
It ships **no strategy of its own**, and it runs as a long-lived process rather than inside a single
conversation. Requires a CLI at or above the `requiredCliVersion` it declares.

→ See [On-Chain Copy Trading](../agentic-wallet/use-cases/copy-trading) for the walkthrough.

---

## Related

- [Binance Wallet Skills Overview](./introduction)



---

## Document: Binance Wallet Skills

URL: /en/dev-docs/products/wallet-skills/introduction


# Binance Wallet Skills

Binance Wallet Skills are composable AI modules for developers. They expose Binance Web3's on-chain
capabilities in a form that any LLM Agent or application can call directly.

## What Are Skills

Traditional APIs require developers to manually parse intent, call endpoints, and handle errors.
Skills wrap all of that into modules an AI can understand and invoke directly:

- Triggered by **natural language intent** — no API calls to write
- Each Skill is a standalone module — integrate individually or combine
- Compatible with Claude, ChatGPT, Copilot, and major AI Agent environments

## Published Wallet Skills (binance-web3)

12 Skills are currently published on
[binance-skills-hub](https://github.com/binance/binance-skills-hub/tree/main/skills/binance-web3):

| Skill                                 | Type         | Core Capability                                                                                                |
| ------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| **binance-agentic-wallet**            | Read + Write | Wallet management, token transfers, market swaps, limit orders (BSC/ETH/Base/Solana)                           |
| **binance-onchain-copy-trader**       | Read + Write | Copy-trading scaffold: subscription, risk gates, orders, on-chain SL/TP, strategy hooks (no strategy included) |
| **query-token-info**                  | Read         | Token search, metadata, live market data, candlestick charts                                                   |
| **query-token-audit**                 | Read         | Token security audit: risk scoring, honeypot detection, contract verification                                  |
| **query-address-info**                | Read         | Wallet address token holdings with prices and balances                                                         |
| **crypto-market-rank**                | Read         | Market rankings: social buzz, smart money inflow, Meme coins, trader PnL                                       |
| **meme-rush**                         | Read         | Meme token tracking (new/migrating/migrated) + AI narrative discovery                                          |
| **trading-signal**                    | Read         | On-chain smart money signals with signal status and peak gain data                                             |
| **binance-trading-signal**            | Read         | Signal strategies you define and backtest, plus the smart money feed and daily reports                         |
| **binance-wallet-tracker**            | Read         | Wallet and group monitoring, behaviour replay, real-time trade push over WebSocket                             |
| **binance-leaderboard**               | Read         | Trader rankings and a 6-dimension score for judging whether a wallet is worth following                        |
| **binance-tokenized-securities-info** | Read         | Tokenized securities (Ondo Finance) — live prices, market status, on-chain data                                |

→ [View full Skills list](./supported-skills)



---

## Document: Introduction

On-chain wallet balance and transaction queries across multiple chains and tokens

URL: /en/dev-docs/products/wallet-api/introduction


# Introduction

The Wallet API provides on-chain wallet data services, including supported chain queries, token
balance lookups across multiple chains, and on-chain transaction history.

## Feature Overview

| Feature                   | Endpoint                                                    | Method | Description                                   |
| ------------------------- | ----------------------------------------------------------- | ------ | --------------------------------------------- |
| Supported Chains          | `/api/v1/dex/balance/supported/chain`                       | GET    | Query supported blockchain networks           |
| All Token Balances        | `/api/v1/dex/balance/all-token-balances-by-address`         | GET    | Get all token balances for a wallet           |
| Token Balances by Address | `/api/v1/dex/balance/token-balances-by-address`             | POST   | Get balances for specific tokens              |
| Transaction History       | `/api/v1/dex/post-transaction/transactions-by-address`      | GET    | Get on-chain transaction history for a wallet |
| Transaction Detail        | `/api/v1/dex/post-transaction/transaction-detail-by-txhash` | GET    | Get full transaction detail by hash           |



---

## Document: Error Codes

Wallet API error code reference — complete list of business error codes, causes, and troubleshooting guidance.

URL: /en/dev-docs/products/wallet-api/error-codes


# Error Codes

## Response Format

All Wallet API responses — including errors — return **HTTP 200**. The business result is indicated
by the `code` field in the response body.

```json
{
  "code": 0,
  "msg": "success",
  "data": { ... },
  "timestamp": 1718000000000
}
```

A non-zero `code` always indicates an error. Check the `msg` field for a human-readable description.

---

## Success

| Code | Description       |
| ---- | ----------------- |
| `0`  | Request succeeded |

---

## Parameter Errors

| Code    | Message                             | Cause                                                                                                                                                                                               | Affected Endpoints |
| ------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `40001` | `Parameter [field] error: <reason>` | Request parameter failed validation — field format invalid, value out of range, required parameter missing, or unsupported enum value. The `msg` field includes the specific field name and reason. | All endpoints      |

**Common `40001` triggers:**

- `address` is blank or missing
- `pageSize` is out of range (must be `1 ≤ pageSize ≤ 100`)
- `tokenContractAddresses` list in `POST /token-balances-by-address` contains invalid entries (blank
  `binanceChainId` or `tokenContractAddress`)
- Required `@RequestParam` or `@RequestBody` field is absent

---

## Authentication & Authorization Errors

These codes are enforced by the API Gateway before the request reaches the Wallet API service.

| Code    | Message             | Cause                                                                                                 |
| ------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `40101` | `Invalid API Key`   | The `X-OC-APIKEY` header is missing, malformed, or the key has been deleted / disabled                |
| `40102` | `Signature error`   | The `X-OC-SIGN` value does not match the expected HMAC-SHA256 or Ed25519 signature                    |
| `40103` | `Timestamp expired` | The `X-OC-TIMESTAMP` is outside the allowed `recv_window` relative to server time (default ±5 000 ms) |
| `40104` | `Permission denied` | The API Key does not have the required permission for this endpoint                                   |

---

## Rate Limit Errors

| Code    | Message                                                                                  | Cause                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `42900` | `Request rate limit exceeded. Please refer to the API docs and reduce request frequency` | Per-IP, per-API-Key, per-user, or per-endpoint rate limit has been reached. Retry after the duration indicated in the `Retry-After` response header |

---

## Compliance Errors

### IP Compliance

| Code    | Message                                                | Cause                                                                                                                   |
| ------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `40301` | `Service not available in your region`                 | The client IP originates from a sanctioned jurisdiction (e.g. North Korea, Iran, Cuba, Syria, or OFAC-listed territory) |
| `40302` | `Proxy or VPN detected. Please use direct connection`  | A high-risk VPN or proxy was detected on the client connection                                                          |
| `40303` | `Unusual IP activity detected. Please contact support` | Anomalous IP activity such as frequent location switching or concurrent multi-region access                             |

---

## Server Errors

| Code    | Message                                               | Cause                                                                                                                                                  |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `50000` | `Internal server error, please retry later`           | An unexpected server-side error occurred (e.g. null pointer, serialization error). If the problem persists, contact support with the request timestamp |
| `50001` | `Service temporarily unavailable, please retry later` | An upstream balance data provider is unreachable or returned an error. Retry after a short delay                                                       |

---

## Error Code Reference by Endpoint

| Endpoint                                                        | Possible Error Codes      |
| --------------------------------------------------------------- | ------------------------- |
| `GET /api/v1/dex/balance/supported/chain`                       | `40001`, `50000`          |
| `GET /api/v1/dex/balance/all-token-balances-by-address`         | `40001`, `50000`, `50001` |
| `POST /api/v1/dex/balance/token-balances-by-address`            | `40001`, `50000`, `50001` |
| `GET /api/v1/dex/post-transaction/transactions-by-address`      | `40001`, `50000`, `50001` |
| `GET /api/v1/dex/post-transaction/transaction-detail-by-txhash` | `40001`, `50000`, `50001` |

---

## Troubleshooting Guide

| Symptom                    | Likely Code | Action                                                                                                                                |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Signature mismatch         | `40102`     | Verify pre-hash string: `timestamp + METHOD + requestPath + body`. Ensure `requestPath` includes the raw query string exactly as sent |
| Timestamp drift            | `40103`     | Sync your system clock with an NTP server. Use `X-OC-RECV-WINDOW` to extend tolerance (max 60 000 ms)                                 |
| pageSize out of range      | `40001`     | Keep `pageSize` within `[1, 100]`                                                                                                     |
| All retries return `50001` | `50001`     | The upstream balance service is degraded. Check the [status page](https://developers.binance.com) or contact support                  |



---

## Document: Introduction

On-chain transaction simulation and broadcasting

URL: /en/dev-docs/products/transaction-api/introduction


# Introduction

The Transaction API provides gas estimation, off-chain simulation, and signed transaction
broadcasting.

## Feature Overview

| Feature                 | Endpoint                                            | Method | Description                                   |
| ----------------------- | --------------------------------------------------- | ------ | --------------------------------------------- |
| Supported Chains        | `/api/v1/dex/pre-transaction/supported/chain`       | GET    | Query supported blockchain networks           |
| Get Gas Price           | `/api/v1/dex/pre-transaction/gas-price`             | GET    | Get current gas price for a chain             |
| Get Latest Block Height | `/api/v1/dex/pre-transaction/block-height`          | GET    | Get latest node block height for risk control |
| Get Gas Limit           | `/api/v1/dex/pre-transaction/gas-limit`             | POST   | Estimate gas limit for a transaction          |
| Simulate Transaction    | `/api/v1/dex/pre-transaction/simulate`              | POST   | Simulate transaction execution                |
| Broadcast Transaction   | `/api/v1/dex/pre-transaction/broadcast-transaction` | POST   | Broadcast a signed transaction on-chain       |
| Get Broadcast Orders    | `/api/v1/dex/post-transaction/orders`               | GET    | Query broadcast order status                  |



---

## Document: Error Codes

Transaction API error code reference — complete list of business error codes, causes, and troubleshooting guidance.

URL: /en/dev-docs/products/transaction-api/error-codes


# Error Codes

## Response Format

All Transaction API responses — including errors — return **HTTP 200**. The business result is
indicated by the `code` field in the response body.

```json
{
  "code": 0,
  "msg": "success",
  "data": { ... },
  "timestamp": 1718000000000
}
```

A non-zero `code` always indicates an error. Check the `msg` field for a human-readable description.

---

## Success

| Code | Description       |
| ---- | ----------------- |
| `0`  | Request succeeded |

---

## Parameter Errors

| Code    | Message                             | Cause                                                                                                                                                                                               | Affected Endpoints |
| ------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `40001` | `Parameter [field] error: <reason>` | Request parameter failed validation — field format invalid, value out of range, required parameter missing, or unsupported enum value. The `msg` field includes the specific field name and reason. | All endpoints      |

**Common `40001` triggers:**

- `binanceChainId` is blank or not on the supported-chain list
- `address` is blank or malformed
- Broadcast request is missing both `evmTx` and `solTx` (one is required)
- `evmTx.gasLimit` or `evmTx.gasPrice` is not a valid numeric string
- `limit` is outside the range `[1, 100]`
- Required `@RequestParam` or `@RequestBody` field is absent

---

## Authentication & Authorization Errors

These codes are enforced by the API Gateway before the request reaches the Transaction API service.

| Code    | Message             | Cause                                                                                                 |
| ------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `40101` | `Invalid API Key`   | The `X-OC-APIKEY` header is missing, malformed, or the key has been deleted / disabled                |
| `40102` | `Signature error`   | The `X-OC-SIGN` value does not match the expected HMAC-SHA256 or Ed25519 signature                    |
| `40103` | `Timestamp expired` | The `X-OC-TIMESTAMP` is outside the allowed `recv_window` relative to server time (default ±5 000 ms) |
| `40104` | `Permission denied` | The API Key does not have the required permission for this endpoint                                   |

---

## Rate Limit Errors

| Code    | Message                                                                                  | Cause                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `42900` | `Request rate limit exceeded. Please refer to the API docs and reduce request frequency` | Per-IP, per-API-Key, per-user, or per-endpoint rate limit has been reached. Retry after the duration indicated in the `Retry-After` response header |

---

## Compliance Errors

### IP Compliance

| Code    | Message                                                | Cause                                                                                                                   |
| ------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `40301` | `Service not available in your region`                 | The client IP originates from a sanctioned jurisdiction (e.g. North Korea, Iran, Cuba, Syria, or OFAC-listed territory) |
| `40302` | `Proxy or VPN detected. Please use direct connection`  | A high-risk VPN or proxy was detected on the client connection                                                          |
| `40303` | `Unusual IP activity detected. Please contact support` | Anomalous IP activity such as frequent location switching or concurrent multi-region access                             |

### KYT (Know Your Transaction)

KYT compliance checks are performed before broadcasting a transaction. All four codes may be
returned by `POST /broadcast-transaction`.

| Code    | Message                                                           | Cause                                                                                                                    |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `40311` | `Transaction rejected due to high-risk address`                   | The counterparty address has a risk score ≥ 70; transaction is blocked outright                                          |
| `40312` | `Address is on sanctions list`                                    | The address matches an OFAC or UN sanctions list entry                                                                   |
| `40313` | `Transaction rejected due to risky fund origin`                   | Upstream fund tracing (3–5 hops) links the transaction to a sanctioned address, gambling site, or dark-web entity        |
| `40314` | `Medium-risk address detected. Please confirm to proceed`         | Risk score is 40–69; the client must display a confirmation prompt and resubmit with the user's explicit acknowledgement |
| `40434` | `KYT verification failed. Transaction involves high-risk address` | Final KYT check failed immediately before broadcast; the transaction is blocked                                          |

---

## Transaction API Business Errors

### Chain Support

| Code    | Message                       | Cause                                                                                                                               | Affected Endpoints                                                |
| ------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `40411` | `This chain is not supported` | The supplied `binanceChainId` is not in the supported-chain whitelist, or the chain has been temporarily disabled via configuration | `/gas-price`, `/gas-limit`, `/simulate`, `/broadcast-transaction` |

### Broadcast

| Code    | Message                                                             | Cause                                                                                                                                                                              | Affected Endpoints       |
| ------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `40431` | `Transaction broadcast failed, please check gas settings and retry` | The `wallet-direct` RPC service rejected the transaction or returned no result. Common sub-causes: gas too low, nonce conflict, RPC node error, or malformed raw transaction bytes | `/broadcast-transaction` |

---

## Server Errors

| Code    | Message                                               | Cause                                                                                                                                                                              |
| ------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `50000` | `Internal server error, please retry later`           | An unexpected server-side error occurred (e.g. null pointer, serialization error, downstream service failure). If the problem persists, contact support with the request timestamp |
| `50001` | `Service temporarily unavailable, please retry later` | An upstream dependency (e.g. transaction history service, order service) is unreachable or returned an error. Retry after a short delay                                            |

---

## Error Code Reference by Endpoint

| Endpoint                                                 | Possible Error Codes                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/v1/dex/pre-transaction/supported/chain`        | `40001`, `50000`                                                                |
| `GET /api/v1/dex/pre-transaction/gas-price`              | `40001`, `40411`, `50000`                                                       |
| `POST /api/v1/dex/pre-transaction/gas-limit`             | `40001`, `40411`, `50000`                                                       |
| `POST /api/v1/dex/pre-transaction/simulate`              | `40001`, `40411`, `50000`                                                       |
| `POST /api/v1/dex/pre-transaction/broadcast-transaction` | `40001`, `40311`, `40312`, `40313`, `40314`, `40411`, `40431`, `40434`, `50000` |
| `GET /api/v1/dex/post-transaction/orders`                | `40001`, `50000`, `50001`                                                       |

---

## Troubleshooting Guide

| Symptom                    | Likely Code             | Action                                                                                                                                |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Signature mismatch         | `40102`                 | Verify pre-hash string: `timestamp + METHOD + requestPath + body`. Ensure `requestPath` includes the raw query string exactly as sent |
| Timestamp drift            | `40103`                 | Sync your system clock with an NTP server. Use `X-OC-RECV-WINDOW` to extend tolerance (max 60 000 ms)                                 |
| Broadcast rejected         | `40431`                 | Verify `gasLimit` and `gasPrice` are sufficient. Pre-call `/gas-price` and `/gas-limit` to get current estimates before broadcasting  |
| KYT high-risk block        | `40311`/`40312`/`40313` | The destination address is flagged. Review the address risk profile; transactions cannot proceed for sanctioned addresses             |
| KYT medium-risk prompt     | `40314`                 | Display a risk warning to the end user and resubmit with the user's explicit confirmation flag                                        |
| Chain not supported        | `40411`                 | Call `GET /api/v1/dex/pre-transaction/supported/chain` to retrieve the current chain whitelist                                        |
| All retries return `50001` | `50001`                 | The history or order service is degraded. Check the [status page](https://developers.binance.com) or contact support                  |



---

## Document: Supported Chains

Chains supported by the Binance Web3 Trading API for quote and swap building

URL: /en/dev-docs/products/trading-api/supported-chains


# Supported Chains

The Binance Web3 Trading API supports quote and swap building on the following **20** chains.

## Supported Chains

| #   | Chain               | Short Name | Chain ID | Router Contract                                |
| --- | ------------------- | ---------- | -------- | ---------------------------------------------- |
| 1   | **BNB Smart Chain** | BSC        | 56       | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 2   | Ethereum            | ETH        | 1        | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 3   | Arbitrum One        | ARB        | 42161    | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 4   | Base                | BASE       | 8453     | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 5   | Polygon             | POL        | 137      | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 6   | Optimism            | OP         | 10       | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 7   | Linea               | ETH        | 59144    | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 8   | Blast               | ETH        | 81457    | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 9   | Avalanche C-Chain   | AVAX       | 43114    | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 10  | Scroll              | ETH        | 534352   | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 11  | Mode                | ETH        | 34443    | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 12  | Metis Andromeda     | METIS      | 1088     | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 13  | Sonic               | S          | 146      | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 14  | Katana              | ETH        | 747474   | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 15  | Plasma              | ETH        | 9745     | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 16  | Monad               | MON        | 143      | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 17  | Solana              | SOL        | CT_501   | `BinAnceLh73MadMEF4zdi47Q3FN2kfMuQHG3fzuhhbs5` |
| 18  | Tron                | TRX        | CT_195   | `THWkPgWSFVNoWtKQzBvv7bg7xkSEYVmCBw`           |
| 19  | Robinhood           | Robinhood  | 4663     | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |
| 20  | Arc                 | ARC        | 5042     | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`   |

## Related Endpoint

| Endpoint                                     | Purpose                                          |
| -------------------------------------------- | ------------------------------------------------ |
| `GET /api/v1/dex/aggregator/supported/chain` | Aggregator (quote / swap build) supported chains |

## Sample Call (Python)

```python
import hmac, hashlib, base64, urllib.request
from datetime import datetime, timezone

API_KEY = "your-api-key"
SECRET  = "your-secret-key"
BASE    = "https://web3.binance.com/build"

now  = datetime.now(timezone.utc)
ts   = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
path = "/api/v1/dex/aggregator/supported/chain"
prehash = ts + "GET" + "/build" + path
sig = base64.b64encode(hmac.new(SECRET.encode(), prehash.encode(), hashlib.sha256).digest()).decode()

req = urllib.request.Request(BASE + path)
req.add_header("X-OC-APIKEY", API_KEY)
req.add_header("X-OC-TIMESTAMP", ts)
req.add_header("X-OC-SIGN", sig)
print(urllib.request.urlopen(req).read().decode())
```



---

## Document: Introduction

Cross-DEX aggregated quotes and swaps, with equity (RWA) token support

URL: /en/dev-docs/products/trading-api/introduction


# Introduction

The Trading API provides cross-DEX token quotes, swaps, and approval services, automatically
selecting the optimal route for token exchanges. It also supports **equity token trading** (RWA /
Real World Assets such as Ondo, xStock, and BStock stock tokens); Ondo and BStock trade via an RFQ
(Request for Quote) workflow, while xStock trades through regular AMM liquidity pools.

## Feature Overview

| Feature                | Endpoint                                     | Method | Description                                                                     |
| ---------------------- | -------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| Supported Chains       | `/api/v1/dex/aggregator/supported/chain`     | GET    | Query supported blockchain networks                                             |
| Get Quote              | `/api/v1/dex/aggregator/quote`               | GET    | Get a token swap quote (supports SWAP and RFQ modes)                            |
| Execute Swap           | `/api/v1/dex/aggregator/swap`                | GET    | Generate swap transaction data or RFQ typed-data to sign                        |
| Quote and Swap         | `/api/v1/dex/aggregator/quote-and-swap`      | GET    | Get a quote and build a swap transaction in a single call (no `quoteId` needed) |
| Approve Transaction    | `/api/v1/dex/aggregator/approve-transaction` | GET    | Generate token approval transaction data                                        |
| Get Transaction Status | `/api/v1/dex/aggregator/history`             | GET    | Query DEX swap transaction status by txHash                                     |
| Submit RFQ Order       | `/api/v1/dex/aggregator/order/submit`        | POST   | Submit a signed RFQ order (equity tokens only)                                  |
| Get RFQ Order Status   | `/api/v1/dex/aggregator/order/{orderId}`     | GET    | Poll RFQ order settlement status                                                |

## Execution Modes

The `/quote` response includes an `executionMode` field that tells you which trading flow to follow:

| Mode   | Token Types                        | Flow                                                                                         |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `SWAP` | Regular crypto tokens              | Sign the `tx` from `/swap` and broadcast to the chain                                        |
| `RFQ`  | Equity tokens (Ondo, BStock, etc.) | Sign `rfq.typedDataToSign` from `/swap`, submit via `/order/submit`, poll `/order/{orderId}` |

## Equity Token Trading (RWA)

The Trading API supports tokenized equity assets (Real World Assets), including:

- **Ondo tokens** (type=1): Tokenized stocks and ETFs (e.g. NKEon/Nike, NVDAon/Nvidia, EEMon/iShares
  ETF). Always routed via **3-vendor RFQ** (InchFusion + CowSwap + PcsXRfq). All routes return
  `executionMode=RFQ`.
- **BStock tokens** (type=3): Exchange-traded stock tokens (e.g. PALLon/Palladium, TSLAB/Tesla).
  Routed via **LiquidMesh (SWAP) + PcsXRfq (RFQ)** in a mixed result — one SWAP route and one RFQ
  route may be returned simultaneously.
- **xStock tokens** (type=2): Tokenized stocks (e.g. AAPLx/Apple, NVDAx/Nvidia, TSLAx/Tesla). Traded
  via regular AMM liquidity pools — no RFQ route. Returns `executionMode=SWAP`, same flow as regular
  crypto tokens.

> **Note**: Ondo, xStock, and BStock token sets are mutually exclusive. A given token belongs to one
> type only.

### SWAP Mode Flow (regular tokens and BStock LiquidMesh route)

```
GET /quote  →  GET /swap  →  Sign tx  →  Broadcast to chain
```

### Flash API Flow (latency-sensitive)

For latency-sensitive trading with a known vendor, skip the `/quote` step entirely and call
`/quote-and-swap` — it returns executable calldata / swapTransaction in a single request, saving one
HTTP round-trip vs the two-step flow above. Currently the `vendor` parameter only accepts
`LiquidMesh`.

```
GET /quote-and-swap?vendor=LiquidMesh  →  Sign tx  →  Broadcast to chain
```

### RFQ Mode Flow (Ondo tokens and BStock PcsXRfq route)

```
GET /quote  →  GET /swap  →  Sign rfq.typedDataToSign (EIP-712)
           →  POST /order/submit  →  GET /order/{orderId}  (poll until FILLED / FAILED)
```

### Key Constraints for Equity Token Trading

| Constraint                | Details                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `userWalletAddress`       | **Required** in `/quote` for RFQ routes. Used as the swap receiver in the RFQ order.            |
| `quoteId` TTL             | 30 seconds. Call `/swap` within 30s of `/quote` or you will get `QUOTE_EXPIRED` (40401).        |
| EIP-712 signature         | Sign `rfq.typedDataToSign` from `/swap`. The signing wallet must match `userWalletAddress`.     |
| `vendor` in approve       | **Required** for equity tokens in `/approve-transaction`. Use `vendorName` from `/quote`.       |
| Idempotency (`requestId`) | Reuse the same UUID when retrying `/order/submit`. A new UUID creates a new order.              |
| Market hours              | Ondo tokens may be unavailable outside US market hours (error 40367); BStock similarly (40369). |

## Custom Fee (Add Fee / Referral Fee)

The Trading API supports an on-chain, atomic custom-fee (referral fee / revenue-share) feature: a
configurable percentage of the swap is deducted on-chain and sent to a wallet address you designate,
while the remainder goes through the normal DEX route. This is useful for integrators who want to
collect a platform fee or share revenue with affiliates.

**Supported chains.** Both EVM chains (BSC, Ethereum, Base, etc.) and Solana (`CT_501`) are
supported, across `/quote`, `/swap`, `/quote-and-swap`, and the Solana-only `/swap-instruction`.

**How it works.** Two directions are supported, controlled by which parameters you send:

| Direction    | Quote stage (`/quote`) | Swap stage (`/swap`, `/quote-and-swap`)      | Effect                                                                                                        |
| ------------ | ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `FROM_TOKEN` | `feeSource=FROM_TOKEN` | `fromTokenReferrerWalletAddress` (non-empty) | Fee is deducted from the sell token; the net amount is sent to the DEX. User receives the full DEX output.    |
| `TO_TOKEN`   | `feeSource=TO_TOKEN`   | `toTokenReferrerWalletAddress` (non-empty)   | The full input is swapped; fee is deducted from the buy-token output. User receives the DEX output minus fee. |

**Parameter pairing.**

- `/quote`: `feePercent` + `feeSource` (both present or both absent).
- `/swap`, `/quote-and-swap`, and `/swap-instruction`: `feePercent` + exactly one of
  `fromTokenReferrerWalletAddress` / `toTokenReferrerWalletAddress` (the two referrer addresses are
  mutually exclusive).

**Limits.** `feePercent` is a decimal string in `(0, 5]` for EVM chains and `(0, 10]` for Solana,
with at most 2 decimal places (e.g. `"1.5"` = 1.5%). Values with more than 2 decimals are rejected
with `INVALID_FEE_PERCENT` (40466). Referrer addresses must match the selected chain's format — EVM
(`0x` + 40 hex chars) or Solana Base58 pubkey — otherwise `INVALID_REFERRER_ADDRESS` (40467).
Supplying both referrer addresses returns `CONFLICT_REFERRER_PARAMS` (40468). On Solana, the
referrer must already be activated (funded with some SOL) or the request returns
`REFERRER_NOT_ACTIVATED` (40469).

**Quote ↔ swap consistency.** When using the two-step flow, the fee direction (implied by which
referrer address you pass to `/swap`) and the `feePercent` value must match the ones locked in the
`/quote` cache for that `quoteId`; a mismatch returns `SWAP_QUOTE_MISMATCH` (40462). The
`/quote-and-swap` Flash API has no prior quote, so the fee is fully determined by the single
request.

**Response echo.** When the fee is enabled, `/quote`, `/swap`, `/quote-and-swap`, and
`/swap-instruction` responses include three fields under each route / `routerResult`: `feeAmount`
(fee deducted, integer string), `feeToken` (the token in which the fee is denominated), and
`actualSwapAmount` (the amount actually participating in the DEX swap). All three are `null` when
the fee is not enabled.

**RFQ routes.** Equity / RWA token (Ondo, BStock) RFQ routes ignore fee parameters and execute as a
standard fee-less RFQ order.



---

## Document: Integration Flow

How to integrate the Trading API — authenticate, approve, quote, build, sign, broadcast, and verify

URL: /en/dev-docs/products/trading-api/integration-flow


# Integration Flow

A complete token-swap integration spans three Binance Web3 APIs:

- **Trading API** selects a route, builds the swap transaction, and provides the ERC-20 approval
  transaction data when authorization is needed.
- **Transaction API** broadcasts transactions after your wallet signs them.
- **Wallet API** reads the resulting on-chain transaction and its status.

> The Trading API and Transaction API **never hold your private key**. They only return unsigned
> transaction data or relay a transaction that you have already signed. Keep signing operations in
> your own wallet or signer.

Every request to these APIs is authenticated with your API Key and Secret Key. See
[Authentication](/authentication) for the required headers and HMAC signing details.

## Two Meanings of “Authorization”

This flow contains two separate authorization concepts:

1. **API request authentication**: every Binance Web3 API request must include `X-OC-APIKEY`,
   `X-OC-TIMESTAMP`, and `X-OC-SIGN`. See [Authentication](/authentication) for HMAC signing
   details.
2. **ERC-20 token approval**: before an EVM swap can spend an ERC-20 token, the token contract must
   approve the selected DEX spender. This is an on-chain transaction signed by the user's wallet. It
   is conditional: skip it when the allowance is already sufficient, and do not use this pattern for
   native tokens, Solana, or Tron.

## End-to-End Flow (SWAP mode)

The following is the standard flow for regular tokens. The approval step is conditional and must be
confirmed on-chain before the swap transaction is submitted.

```
0. Authenticate every API request with API Key + Secret Key
1. GET  /approve-transaction (optional) → request ERC-20 approval transaction data
   Sign and broadcast the approval tx, then wait for confirmation
2. GET  /quote                         → select a route and receive quoteId
3. GET  /swap                          → get the unsigned swap tx
4. Sign the swap tx locally with the user's wallet
5. POST /broadcast-transaction         → broadcast the signed swap tx
6. GET  /transaction-detail-by-txhash → poll the final on-chain status
```

For latency-sensitive integrations, `GET /quote-and-swap` combines steps 2 and 3. It does not remove
the conditional ERC-20 approval step.

## Step 0 — Authenticate API Requests

All requests in this guide are authenticated. Use the exact URL path, including `/build`, when
calculating `X-OC-SIGN`; the API request signature is separate from the on-chain wallet signature.
See [Authentication](/authentication) for the required headers, HMAC-SHA256 pre-hash, timestamp
window, and rate limits.

## Step 1 — Request and Submit the ERC-20 Approval (Conditional)

Approval is needed only when all of the following apply:

- the selected chain is EVM;
- the sell token is an ERC-20 token; and
- the user's current allowance for the standard DEX spender is less than the amount to swap.

For a regular `SWAP` integration, check the allowance first and, when it is insufficient, call the
authorization endpoint `GET /api/v1/dex/aggregator/approve-transaction` **before** requesting a
quote. This endpoint is the source of the approval transaction data. At this point, `approveTarget`
is not available yet and is not required to call the authorization endpoint.

| Parameter              | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| `binanceChainId`       | The chain where the swap will be executed                            |
| `tokenContractAddress` | The sell-token contract address                                      |
| `approveAmount`        | The amount to authorize, in the token's smallest unit                |
| `vendor`               | Omit for the regular SWAP flow; use a `vendorName` only for RFQ flow |

The response contains `data[].data` (ERC-20 `approve()` calldata), `dexContractAddress` (the
spender), and gas fields. Construct an EVM transaction whose `to` is the token contract address,
whose `data` is the returned calldata, and whose `from` is the user's wallet. Sign it locally and
broadcast it through `POST /api/v1/dex/pre-transaction/broadcast-transaction`.

Wait until the approval transaction is confirmed before continuing to `/quote`. Do not confuse the
approval transaction with the swap transaction: each has its own nonce, signature, `txHash`, and
status. Passing `approveTransaction=true` to `/swap` is a convenience for returning approval data in
`data.tx.signatureData`; it does not replace calling `/approve-transaction` when authorization is
needed, and the client must still sign, broadcast, and confirm the returned approval before the
swap.

> **RFQ exception:** RFQ/RWA routes require a vendor-specific approval in some cases, and the
> `vendor` parameter must be the `vendorName` returned by `/quote`. For RFQ, call `/quote` first,
> then call `/approve-transaction` with that vendor before continuing to `/swap`. See
> [RFQ mode](#rfq-mode-equity-tokens).

## Step 2 — Get a Quote

After the regular approval has been confirmed, or when approval was not needed, call
`GET /api/v1/dex/aggregator/quote` with the chain, token pair, amount, and (when required) the user
wallet address. Select a route from the response and retain its `quoteId`.

The quote response also tells you:

- `executionMode`: follow the `SWAP` flow for regular tokens or the
  [RFQ flow](#rfq-mode-equity-tokens) for equity/RWA tokens.
- `approveTarget`: an informational spender address for the selected route. It does **not** perform
  authorization and is not a substitute for `/approve-transaction`. For a regular SWAP, use it only
  to cross-check the spender returned by the authorization endpoint if your integration requires
  that validation.
- `quoteId`: the route identifier consumed by `/swap`; it expires in about 30 seconds.

If the quote expires, request a new quote instead of retrying the same `quoteId`.

## Step 3 — Build the Swap Transaction

Call `GET /api/v1/dex/aggregator/swap` with the `quoteId` from step 2 and the same route parameters:
`binanceChainId`, `fromTokenAddress`, `toTokenAddress`, `amount`, and the required
`userWalletAddress` (the wallet that will sign the transaction, i.e. the sender). Slippage is set
with `slippagePercent` or `autoSlippage=true` — one of the two must be provided. These parameters
must match the cached quote. The response returns an **unsigned** payload under `data.tx`.

You can instead call `GET /api/v1/dex/aggregator/quote-and-swap` with the full quote parameters when
you do not need to choose a route first. Currently its `vendor` shortcut supports `LiquidMesh`.

| Chain family      | What the unsigned payload contains                                                      |
| ----------------- | --------------------------------------------------------------------------------------- |
| EVM               | `from`, `to`, `data`, `value`, `gas`, `gasPrice`, and optionally `maxPriorityFeePerGas` |
| Solana (`CT_501`) | Versioned transaction data plus `computeUnitPrice` and `computeUnitLimit`               |
| Tron (`CT_195`)   | Router `to`, contract calldata in `data`, and call `value`                              |

## Step 4 — Sign Locally

Use the wallet that owns `data.tx.from` (or the supplied user wallet address). The Binance Web3 API
must never receive a private key or seed phrase.

### EVM chains (BSC, Ethereum, Base, ...)

Map the response fields to an EIP-1559 or legacy transaction and sign it. The resulting raw signed
transaction is a hex string beginning with `0x`.

| `data.tx` field        | Signed transaction field           |
| ---------------------- | ---------------------------------- |
| `from`                 | Signer / sender                    |
| `to`                   | Transaction recipient (DEX router) |
| `data`                 | ABI-encoded calldata               |
| `value`                | Native-token value in wei          |
| `gas`                  | Gas limit                          |
| `gasPrice`             | Legacy gas price in wei            |
| `maxPriorityFeePerGas` | EIP-1559 priority fee in wei       |

### Python example: sign approval and swap transactions

Install the signing and RPC libraries:

```bash
pip install eth-account web3
```

The following example uses the `eth-account` private-key signer and a JSON-RPC connection only to
obtain the next nonce. `approve_response` is the JSON response from `/approve-transaction`, and
`swap_response` is the JSON response from `/swap`. The private key stays local and is never sent to
Binance Web3 API.

```python
import os

from eth_account import Account
from web3 import Web3

CHAIN_ID = 56  # BSC; use the chain ID from your request
RPC_URL = os.environ["EVM_RPC_URL"]
PRIVATE_KEY = os.environ["WALLET_PRIVATE_KEY"]
TOKEN_CONTRACT_ADDRESS = os.environ["FROM_TOKEN_ADDRESS"]

w3 = Web3(Web3.HTTPProvider(RPC_URL))
account = Account.from_key(PRIVATE_KEY)


def as_int(value):
    """Convert decimal or 0x-prefixed API values to integers."""
    if value is None:
        return 0
    return int(value, 0) if isinstance(value, str) else int(value)


def sign_evm_transaction(*, to, data, value, gas, gas_price, max_priority_fee_per_gas=None):
    nonce = w3.eth.get_transaction_count(account.address, "pending")
    transaction = {
        "chainId": CHAIN_ID,
        "nonce": nonce,
        "to": Web3.to_checksum_address(to),
        "data": data or "0x",
        "value": as_int(value),
        "gas": as_int(gas),
    }
    if max_priority_fee_per_gas:
        transaction["maxFeePerGas"] = as_int(gas_price)
        transaction["maxPriorityFeePerGas"] = as_int(max_priority_fee_per_gas)
    else:
        transaction["gasPrice"] = as_int(gas_price)

    signed = account.sign_transaction(transaction)
    raw_transaction = signed.raw_transaction.hex()
    return raw_transaction if raw_transaction.startswith("0x") else "0x" + raw_transaction


# 1) For a regular SWAP, call GET /approve-transaction before GET /quote
#    when the allowance is insufficient.
approve_item = approve_response["data"][0]
signed_approval_tx = sign_evm_transaction(
    to=TOKEN_CONTRACT_ADDRESS,  # approve() is called on the token contract
    data=approve_item["data"],
    value=0,
    gas=approve_item["gasLimit"],
    gas_price=approve_item["gasPrice"],
)

# Send signed_approval_tx as signedTransaction to the broadcast endpoint,
# wait for approval confirmation, and then call GET /quote.

# 2) After the quote is selected, call GET /swap.
swap_tx = swap_response["data"]["tx"]
if swap_tx["from"].lower() != account.address.lower():
    raise ValueError("The swap transaction sender does not match the signing wallet")

signed_swap_tx = sign_evm_transaction(
    to=swap_tx["to"],
    data=swap_tx["data"],
    value=swap_tx.get("value", "0"),
    gas=swap_tx["gas"],
    gas_price=swap_tx["gasPrice"],
    max_priority_fee_per_gas=swap_tx.get("maxPriorityFeePerGas"),
)

broadcast_payload = {
    "binanceChainId": str(CHAIN_ID),
    "address": account.address,
    "signedTransaction": signed_swap_tx,
    "enableMevProtection": False,
}
# POST broadcast_payload to /broadcast-transaction with the API HMAC headers.
```

The helper uses the returned `gasPrice` as the legacy `gasPrice` when `maxPriorityFeePerGas` is
absent. When `/swap` returns `maxPriorityFeePerGas`, it uses the returned `gasPrice` as
`maxFeePerGas` and constructs a type-2 EIP-1559 transaction. The raw signed transaction is
normalized to a `0x...` string before it is sent as `signedTransaction`. The API request HMAC
signature and the on-chain wallet signature shown above are independent.

### Solana (`CT_501`)

Sign the versioned transaction with the user's Solana wallet and serialize the signed transaction as
base64. If you need to add instructions before signing, use `/swap-instruction`, compile the v0
transaction locally, and then sign it.

### Tron (`CT_195`)

Build a `TRIGGER_SMART_CONTRACT` transaction from the returned fields, sign it with a Tron signer,
and serialize the signer's JSON object as `signedTransaction`. It must contain `raw_data` and a
`signature` array. Do **not** send the raw calldata hex as `signedTransaction`; the broadcast API
will reject it because it cannot identify the signer.

## Step 5 — Broadcast the Signed Swap Transaction

Call `POST /api/v1/dex/pre-transaction/broadcast-transaction`:

| Field                 | Value                                                         |
| --------------------- | ------------------------------------------------------------- |
| `binanceChainId`      | The same chain ID used by `/quote` and `/swap`                |
| `signedTransaction`   | EVM raw signed hex, Solana base64, or Tron signed JSON string |
| `address`             | The user's wallet address; for EVM this is `data.tx.from`     |
| `enableMevProtection` | Optional and EVM-only; `true` uses a private mempool          |

A successful response returns `data.txHash` and an internal `data.orderId`. Keep the `txHash`; it is
the key used by the Wallet API to query the transaction details.

### Sample Broadcast Call (EVM)

```bash
curl -X POST 'https://web3.binance.com/build/api/v1/dex/pre-transaction/broadcast-transaction' \\
  -H 'X-OC-APIKEY: your-api-key' \\
  -H 'X-OC-TIMESTAMP: 2026-08-04T00:00:00.000Z' \\
  -H 'X-OC-SIGN: <request-signature>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "binanceChainId": "56",
    "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "signedTransaction": "0xf86c808504a817c80082520894d8da6bf26964af9d7eed9e03e53415d37aa96045880de0b6b3a76400008025a0...",
    "enableMevProtection": false
  }'
```

The `X-OC-SIGN` value above is the Binance Web3 API request signature. It is unrelated to the
on-chain wallet signature encoded in `signedTransaction`.

## Step 6 — Query Transaction Details and Poll Status

Use the `txHash` returned by the broadcast response with the Wallet API endpoint
`GET /api/v1/dex/post-transaction/transaction-detail-by-txhash`:

```bash
curl -G 'https://web3.binance.com/build/api/v1/dex/post-transaction/transaction-detail-by-txhash' \\
  -H 'X-OC-APIKEY: your-api-key' \\
  -H 'X-OC-TIMESTAMP: 2026-08-04T00:00:01.000Z' \\
  -H 'X-OC-SIGN: <request-signature>' \\
  --data-urlencode 'binanceChainId=56' \\
  --data-urlencode 'txHash=0xabc123def4567890abc123def4567890abc123def4567890abc123def4567890'
```

The response's `data` array contains the transaction detail. Inspect `data[].txStatus`:

| `txStatus` | Meaning                                                 | Client action                                                  |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `pending`  | The transaction has been broadcast but is not finalized | Poll again with backoff                                        |
| `success`  | The transaction succeeded on-chain                      | Show the confirmed swap and token transfers                    |
| `fail`     | The transaction was mined but failed                    | Show the failure and inspect gas, method, and transfer details |

Immediately after broadcast, the endpoint may return an empty `data` array while indexing catches
up. Treat that as “not indexed yet,” wait briefly, and retry. Always pass both `binanceChainId` and
the exact `txHash`; hashes from the approval transaction and swap transaction are different.

The returned detail also includes block height, gas used, transaction fee, input/output addresses,
internal calls, and token transfers. Use `tokenTransferDetails` to verify that the expected sell and
buy-token movements occurred, rather than treating a broadcast response alone as proof of a
successful swap.

## Field Mapping Across the Complete Flow

| Source                                   | Next step                                                            |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `/approve-transaction` → `data[].data`   | Build the approval tx, sign, broadcast, and wait for confirmation    |
| `/quote` → `quoteId`                     | Pass to `/swap`                                                      |
| `/quote` → `approveTarget`               | Optional spender cross-check only; it does not perform authorization |
| `/swap` → `data.tx`                      | Map to the local wallet transaction and sign it                      |
| `/broadcast-transaction` → `data.txHash` | Pass to Wallet API transaction-detail-by-txhash                      |
| Wallet API → `data[].txStatus`           | Drive the final pending/success/fail UI state                        |

## RFQ Mode (Equity Tokens)

Equity / RWA tokens such as Ondo and BStock can return `executionMode=RFQ`. This is not the normal
raw-transaction flow: quote first to learn the `vendorName`, request vendor-specific approval when
needed, then sign an EIP-712 order and submit it to the RFQ service instead of broadcasting
`data.tx`.

```
1. GET  /quote            → executionMode = RFQ; obtain vendorName and typed-data inputs
2. GET  /approve-transaction (optional) → pass vendorName when ERC-20 approval is needed
   Sign and broadcast the approval tx, then wait for confirmation
3. GET  /swap             → returns rfq.typedDataToSign
4. Sign rfq.typedDataToSign with the user's wallet (eth_signTypedData_v4)
5. POST /order/submit     → submit userSignature + vendor + quoteId + requestId
6. GET  /order/{orderId}  → poll until FILLED / FAILED
```

The signing wallet must match `userWalletAddress` from `/quote`. `POST /order/submit` requires
`userSignature` (the EIP-712 signature), `vendor`, and `quoteId` — the latter two come from the
`rfq` object in the `/swap` response, and note that this `quoteId` is the value of `rfq.orderId`,
not the route identifier from `/quote`. Also pass `requestId`, a new UUID per order; reuse the same
`requestId` when retrying for idempotency. `signingScheme` is optional and defaults to the vendor's
default when omitted. For RFQ, use the RFQ order-status endpoint as the primary status source. The
Wallet API transaction detail endpoint applies to an on-chain transaction hash and is not a
replacement for RFQ order status.

## Common Pitfalls

| Pitfall                          | Fix                                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `40102 Invalid signature`        | Include `/build` in the signed request path and sign the exact raw query string; see [Authentication](/authentication). |
| `QUOTE_EXPIRED` (40401)          | Call `/swap` within about 30 seconds of `/quote`, or use `/quote-and-swap`.                                             |
| `SWAP_QUOTE_MISMATCH` (40462)    | Keep the `/swap` amount, token pair, fee direction, and other quote-bound parameters unchanged.                         |
| ERC-20 swap reverts              | Call `approve-transaction`, sign and broadcast its returned calldata, then confirm approval before submitting the swap. |
| Wallet API returns empty `data`  | The transaction may not be indexed yet; retry with backoff using the same chain ID and `txHash`.                        |
| Tron `invalid signedTransaction` | Send the signed `{raw_data, signature}` JSON, not calldata hex.                                                         |
| Solana transaction rejected      | Re-check `computeUnitLimit` and `computeUnitPrice`; use `/swap-instruction` to inspect instructions.                    |

## Related Endpoints

| API             | Endpoint                                                        | Purpose                                                |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| Trading API     | `GET /api/v1/dex/aggregator/quote`                              | Select a route and receive `quoteId`                   |
| Trading API     | `GET /api/v1/dex/aggregator/quote-and-swap`                     | Quote + build a transaction in one call                |
| Trading API     | `GET /api/v1/dex/aggregator/swap`                               | Build the unsigned swap transaction                    |
| Trading API     | `GET /api/v1/dex/aggregator/approve-transaction`                | Request ERC-20 approval transaction data               |
| Transaction API | `POST /api/v1/dex/pre-transaction/broadcast-transaction`        | Broadcast an approval or swap transaction              |
| Wallet API      | `GET /api/v1/dex/post-transaction/transaction-detail-by-txhash` | Query block, transfer, and pending/success/fail status |
| Trading API     | `POST /api/v1/dex/aggregator/order/submit`                      | Submit a signed RFQ order                              |
| Trading API     | `GET /api/v1/dex/aggregator/order/{orderId}`                    | Poll RFQ settlement status                             |



---

## Document: Fee & Revenue Sharing

Custom fee (Add Fee / referral fee) and revenue-sharing parameters, directions, limits, and error codes for the Trading API

URL: /en/dev-docs/products/trading-api/fee-and-revenue-sharing


# Fee & Revenue Sharing

The Trading API supports an on-chain, atomic **custom-fee** (also called **Add Fee** / **referral
fee** / **revenue share**) feature: a configurable percentage of each swap is deducted on-chain and
sent to a wallet address you designate, while the remainder follows the normal DEX route. This is
useful for integrators who want to collect a platform fee or share revenue with affiliates.

All deductions happen atomically inside the swap transaction — the fee and the swap either succeed
together or fail together. No off-chain settlement is required.

## Supported Endpoints & Chains

The feature is available on every swap-building endpoint, across EVM chains and Solana:

| Endpoint                                  | Method | Fee parameters                                    |
| ----------------------------------------- | ------ | ------------------------------------------------- |
| `/api/v1/dex/aggregator/quote`            | GET    | `feePercent` + `feeSource`                        |
| `/api/v1/dex/aggregator/swap`             | GET    | `feePercent` + one referrer address               |
| `/api/v1/dex/aggregator/quote-and-swap`   | GET    | `feePercent` + one referrer address               |
| `/api/v1/dex/aggregator/swap-instruction` | GET    | `feePercent` + one referrer address (Solana only) |

| Chain                                                                                                                                                                          | `feePercent` range                              | Referrer address format |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ----------------------- |
| BNB Smart Chain, Ethereum, Arbitrum One, Base, Polygon, Optimism, Linea, Blast, Avalanche C-Chain, Scroll, Mode, Metis Andromeda, Sonic, Katana, Plasma, Monad, Robinhood, Arc | `(0, 5]` — greater than 0, up to 5% inclusive   | `0x` + 40 hex chars     |
| Tron                                                                                                                                                                           | `(0, 5]` — greater than 0, up to 5% inclusive   | Base58 (`T` + 33 chars) |
| Solana                                                                                                                                                                         | `(0, 10]` — greater than 0, up to 10% inclusive | Base58 pubkey           |

`feePercent` is a **decimal string** with at most **2 decimal places** (e.g. `"1.5"` = 1.5%). Values
with more than 2 decimals are rejected with `INVALID_FEE_PERCENT` (`40466`).

## Fee Directions

Two deduction directions are supported. On `/quote` the direction is chosen via `feeSource`; on the
swap-building endpoints it is implied by **which** referrer address you pass.

| Direction    | `/quote`               | Swap endpoints                   | Effect                                                                                                                        |
| ------------ | ---------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `FROM_TOKEN` | `feeSource=FROM_TOKEN` | `fromTokenReferrerWalletAddress` | Fee is deducted from the **sell token**; the net amount is sent to the DEX. The user still receives the full DEX output.      |
| `TO_TOKEN`   | `feeSource=TO_TOKEN`   | `toTokenReferrerWalletAddress`   | The full input is swapped; the fee is deducted from the **buy-token output**. The user receives the DEX output minus the fee. |

### Fund flow

```
FROM_TOKEN direction                    TO_TOKEN direction
─────────────────────                   ─────────────────────
sell token                              sell token
  │                                       │
  ├── feePercent ──► referrer             └── 100% ──► DEX ──► buy token
  │                                                ├── feePercent ──► referrer
  └── net amount ──► DEX ──► buy token              └── remainder ──► user
                       └──► user
```

## Parameter Pairing

Each endpoint accepts a specific combination — parameters must be **all present or all absent** for
a given fee direction:

| Endpoint                                        | Fee parameters                                                                                  | Rule                                                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `/quote`                                        | `feePercent` + `feeSource`                                                                      | Both present or both absent.                                                                                         |
| `/swap`, `/quote-and-swap`, `/swap-instruction` | `feePercent` + exactly one of `fromTokenReferrerWalletAddress` / `toTokenReferrerWalletAddress` | The two referrer addresses are **mutually exclusive** — supplying both returns `CONFLICT_REFERRER_PARAMS` (`40468`). |

If you omit all fee parameters, the swap executes as a regular fee-less swap.

## Limits & Validation

| Rule                             | Detail                                                                                   | Error on violation                 |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| `feePercent` range (EVM)         | `(0, 5]` — `> 0`, `≤ 5`, max 2 decimals                                                  | `40466` `INVALID_FEE_PERCENT`      |
| `feePercent` range (Solana)      | `(0, 10]` — `> 0`, `≤ 10`, max 2 decimals                                                | `40466` `INVALID_FEE_PERCENT`      |
| Referrer address format          | EVM: `0x` + 40 hex chars; Solana: Base58 pubkey                                          | `40467` `INVALID_REFERRER_ADDRESS` |
| Both referrer addresses          | Mutually exclusive — pick exactly one                                                    | `40468` `CONFLICT_REFERRER_PARAMS` |
| Solana referrer not activated    | Referrer wallet has no SOL balance (ATA cannot be created)                               | `40469` `REFERRER_NOT_ACTIVATED`   |
| Tax token on same side (Solana)  | The token on the fee side is a tax token (`buyTax` > 0 or `sellTax` > 0)                 | `40470` `TAX_TOKEN_FEE_CONFLICT`   |
| `four.meme` tokens               | Fee parameters are **not supported** when either side of the pair is a `four.meme` token | —                                  |
| RFQ routes (equity / RWA tokens) | Fee parameters are ignored; the order executes as a standard fee-less RFQ order          | —                                  |

> **Solana referrer activation:** before using a referrer address on Solana, fund it with a small
> amount of SOL so the on-chain fee token account (ATA) can be created. An empty referrer wallet is
> rejected with `40469`.

## Quote ↔ Swap Consistency

When using the **two-step flow** (`/quote` → `/swap`), the fee direction (implied by which referrer
address you pass to `/swap`) and the `feePercent` value **must match** the ones locked in the
`/quote` cache for that `quoteId`. A mismatch returns `SWAP_QUOTE_MISMATCH` (`40462`).

The **one-step** `/quote-and-swap` Flash API has no prior quote, so the fee is fully determined by
the single request — no consistency check applies.

## Response Echo

When the fee is enabled, the `/quote`, `/swap`, `/quote-and-swap`, and `/swap-instruction` responses
include three fields under each route / `routerResult`. All three are `null` when the fee is not
enabled.

| Field              | Type                            | Description                                                                                                                                                                 |
| ------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feeAmount`        | string (integer, smallest unit) | Fee deducted for this swap. `FROM_TOKEN` = `originalFromCoinAmount × feePercent/100` (HALF_UP); `TO_TOKEN` = `originalToCoinAmount × feePercent/100` (HALF_DOWN).           |
| `feeToken`         | string (contract address)       | Token in which the fee is denominated. `FROM_TOKEN` = sell-token address; `TO_TOKEN` = buy-token address.                                                                   |
| `actualSwapAmount` | string (integer, smallest unit) | Amount that actually participates in the DEX swap. `FROM_TOKEN` = `fromTokenAmount − feeAmount` (net); `TO_TOKEN` = original input amount (fee taken from the output side). |

## Error Codes

| Code    | Message                                                                                                   | Affected endpoints                                                      |
| ------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `40462` | `SWAP_QUOTE_MISMATCH` — fee direction / `feePercent` on `/swap` differs from the cached `/quote`          | `/swap`                                                                 |
| `40466` | `Invalid feePercent. EVM chains allow (0, 5], Solana allows (0, 10]`                                      | `/quote`, `/swap`, `/quote-and-swap`, `/swap-instruction`               |
| `40467` | `Invalid referrer address` — format does not match the selected chain                                     | `/swap`, `/quote-and-swap`, `/swap-instruction`                         |
| `40468` | `fromTokenReferrerWalletAddress and toTokenReferrerWalletAddress are mutually exclusive`                  | `/swap`, `/quote-and-swap`, `/swap-instruction`                         |
| `40469` | `Referrer wallet address is not activated on Solana` — fund it with SOL first                             | `/swap`, `/quote-and-swap`, `/swap-instruction` (Solana only)           |
| `40470` | `Tax token cannot configure referral fee on the same side` — use the opposite direction or remove the fee | `/quote`, `/swap`, `/quote-and-swap`, `/swap-instruction` (Solana only) |

## Sample Calls (Python)

Both examples use a 1.5% fee deducted from the sell token (`FROM_TOKEN` direction).

### Two-step: `/quote` then `/swap`

```python
import hmac, hashlib, base64, urllib.request
from datetime import datetime, timezone

API_KEY = "your-api-key"
SECRET  = "your-secret-key"
BASE    = "https://web3.binance.com/build"
HEADERS = {}

def sign(method, path_with_query, body=""):
    now = datetime.now(timezone.utc)
    ts  = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
    # requestPath MUST include the /build prefix — it is part of the signed string.
    request_path = "/build" + path_with_query
    prehash = ts + method + request_path + body
    sig = base64.b64encode(hmac.new(SECRET.encode(), prehash.encode(), hashlib.sha256).digest()).decode()
    HEADERS["X-OC-APIKEY"] = API_KEY
    HEADERS["X-OC-TIMESTAMP"] = ts
    HEADERS["X-OC-SIGN"] = sig

def call(path_with_query):
    req = urllib.request.Request(BASE + path_with_query)
    for k, v in HEADERS.items():
        req.add_header(k, v)
    return urllib.request.urlopen(req).read().decode()

# Step 1 — quote with a 1.5% FROM_TOKEN fee
quote_qs = (
    "/api/v1/dex/aggregator/quote"
    "?binanceChainId=56"
    "&fromTokenAddress=0x55d398326f99059fF775485246999027B3197955"
    "&toTokenAddress=0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
    "&amount=1000000"
    "&feePercent=1.5"
    "&feeSource=FROM_TOKEN"
)
sign("GET", quote_qs)
quote = call(quote_qs)
print(quote)
# Save quoteId from the response, then pass it to /swap within 30s.

# Step 2 — swap with the same 1.5% fee, FROM_TOKEN direction
swap_qs = (
    "/api/v1/dex/aggregator/swap"
    "?binanceChainId=56"
    "&quoteId=<quoteId-from-step-1>"
    "&fromTokenAddress=0x55d398326f99059fF775485246999027B3197955"
    "&toTokenAddress=0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
    "&amount=1000000"
    "&userWalletAddress=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
    "&slippagePercent=0.5"
    "&feePercent=1.5"
    "&fromTokenReferrerWalletAddress=0xCbF2B6E6e3D7e9e4e4e4e4e4e4e4e4e4e4e4e4e4"
)
sign("GET", swap_qs)
print(call(swap_qs))
```

### One-step: `/quote-and-swap`

```python
# Reuse the sign() and call() helpers from the snippet above.

qs = (
    "/api/v1/dex/aggregator/quote-and-swap"
    "?binanceChainId=56"
    "&fromTokenAddress=0x55d398326f99059fF775485246999027B3197955"
    "&toTokenAddress=0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
    "&amount=1000000"
    "&userWalletAddress=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
    "&vendor=LiquidMesh"
    "&slippagePercent=0.5"
    "&feePercent=1.5"
    "&fromTokenReferrerWalletAddress=0xCbF2B6E6e3D7e9e4e4e4e4e4e4e4e4e4e4e4e4e4"
)
sign("GET", qs)
print(call(qs))
```



---

## Document: Error Codes

Trading API error code reference — complete list of business error codes, causes, and troubleshooting guidance.

URL: /en/dev-docs/products/trading-api/error-codes


# Error Codes

## Response Format

All Trading API responses — including errors — return **HTTP 200**. The business result is indicated
by the `code` field in the response body.

```json
{
  "code": 0,
  "msg": "success",
  "data": { ... },
  "timestamp": 1718000000000
}
```

A non-zero `code` always indicates an error. Check the `msg` field for a human-readable description.

---

## Success

| Code | Description       |
| ---- | ----------------- |
| `0`  | Request succeeded |

---

## Parameter Errors

| Code    | Message                             | Cause                                                                                                                                                                                               | Affected Endpoints |
| ------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `40001` | `Parameter [field] error: <reason>` | Request parameter failed validation — field format invalid, value out of range, required parameter missing, or unsupported enum value. The `msg` field includes the specific field name and reason. | All endpoints      |

**Common `40001` triggers:**

- `chainId` is not a positive integer or not on the supported-chain list
- `fromTokenAddress` / `toTokenAddress` is not a valid EVM address or Solana pubkey
- `amount` is not a positive numeric string
- `slippagePercent` is not a valid decimal string
- `gasLevel` is not one of the allowed enum values
- Required `@RequestParam` is absent from the request
- `userWalletAddress` is missing when quoting an Ondo (RFQ) token pair

---

## Authentication & Authorization Errors

These codes are enforced by the API Gateway before the request reaches the Trading API service.

| Code    | Message             | Cause                                                                                                                                                                                                                                                                                     |
| ------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `40101` | `Invalid API Key`   | The `X-OC-APIKEY` header is missing, malformed, or the key has been deleted / disabled                                                                                                                                                                                                    |
| `40102` | `Signature error`   | The `X-OC-SIGN` value does not match the expected HMAC-SHA256 or Ed25519 signature. For `/order/submit`: the `userSignature` does not match the `userWalletAddress` used in `/quote` — ensure the signing wallet is correct and EIP-712 typed data is signed (not a plain-text signature) |
| `40103` | `Timestamp expired` | The `X-OC-TIMESTAMP` is outside the allowed `recv_window` relative to server time (default ±5 000 ms) 

