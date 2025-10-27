# COMMENT

## TL;DR 🚀
- 🧩 **Full-stack real-time ticker platform**: Next.js/React frontend + Node/ConnectRPC backend + Playwright scraper.
- 📡 **Live price streaming** from TradingView via a headless Chromium **BrowserPool** and a typed `PriceService` stream.
- 🧠 **PriceHub** multiplexes subscribers per symbol, coalesces fast ticks, and caches last prices for warm hydration.
- 🎛️ **Resilient UX**: spinner overlay during connect, persistent watchlist, sparkline charts, rAF-batched updates.
- 🛑 **Robust error paths**: detects TradingView 404 / “symbol not found”, tears down the Playwright context, and surfaces **“Invalid symbol”** to the UI.
- 🐳 **Dockerized** runtime + 🤖 **GitHub Actions** for CI/CD deployment to **EC2** with CORS/health endpoints and graceful shutdown.
---

## Project Details

### Frontend (Next.js / React)
- 📈 **TickerBoard/Grid/Cards** with clean typography, tabular numerals, and compact **Sparkline**.
- ⏳ **Loading UX**: big spinner overlay on the chart **while connecting**, price shows `—` until first tick.
- 🧭 **Symbol management**: add/remove, persisted to local storage; “already added” & format validation.
- 🔄 **Streaming client**: exponential backoff, abort-safe reconnection, and warm hydration using cached last prices.
- 🧵 **Perf**: requestAnimationFrame coalescing to avoid re-renders on bursty ticks.

### Backend (Node + ConnectRPC + Playwright)
- 🧠 **PriceHub**: per-symbol worker registry (`TickerWorker`), **MAX_PAGES** guard, and last-tick TTL cache.
- 🛰️ **TradingViewPage**: maps symbols for navigation, **detects 404/not-found content**, and **closes page+context** on failure.
- 🔁 **Typed errors → gRPC codes**: `InvalidSymbolError` → `Code.NotFound` so the client shows **“Invalid symbol”** and drops the card.
- ❤️ **Health** endpoint and **CORS** (configurable `WEB_ORIGIN`).
- 🧹 **Graceful shutdown**: unsubscribes workers, closes the browser pool safely.

### DevOps ⚙️
- 🐳 **Docker** image for reproducible builds/runs.
- 🤖 **GitHub Actions**: deploys to **EC2** (prepare target dir, upload artifacts, restart service/container).
- 🔐 Simple, auditable pipeline that’s easy to iterate on.

---

## Run Locally 💻
- 📦 Run `pnpm install --recursive` to install all dependencies.  
- ▶️ Run `./run.sh` to launch the application.  
  This single script handles all steps, including **code generation** (e.g., `buf generate`) and starting both the **frontend** and **backend** servers.
- 🌍 Open **http://localhost:3000** in a web browser.


---

## Notable UX Details ✨
- ⏱️ **Coalesced Price Emitter** (100–200ms window) to limit noisy updates.
- 🧵 **rAF-batched** state commits for smooth charts.
- 🧯 Clear, user-visible errors (“Invalid symbol”, “Already added”, “Invalid symbol format”).

---

