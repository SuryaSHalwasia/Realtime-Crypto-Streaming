import http from "node:http";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { routes } from "./routes.js";
import { BrowserPool } from "../infra/playwright/BrowserPool.js";
import { PriceHub } from "../domain/PriceHub.js";

const PORT = Number(process.env.PORT ?? 8080);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";

// one shared headed Chromium across clients
const pool = new BrowserPool();
const hub = new PriceHub(pool);

const connectHandler = connectNodeAdapter({
  routes: (router) => routes(router, hub), // <-- pass hub
});

function setCors(res: http.ServerResponse, origin: string) {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms"
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    setCors(res, WEB_ORIGIN);
    res.writeHead(204).end();
    return;
  }
  if (req.url === "/health") {
    setCors(res, WEB_ORIGIN);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "pluto-connect" }));
    return;
  }
  setCors(res, WEB_ORIGIN);
  return connectHandler(req, res);
});

server.listen(PORT, () => {
  console.log(`[connect] listening on http://localhost:${PORT} (allowing ${WEB_ORIGIN})`);
});

let shuttingDown = false;

async function doShutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info("[connect] shutting down…");

  // Force-exit if close hangs
  const hardExit = setTimeout(async () => {
    try { await hub.shutdown(); } finally { process.exit(1); }
  }, 5000);
  hardExit.unref?.();

  server.close(async () => {
    try { await hub.shutdown(); }
    finally {
      clearTimeout(hardExit);
      process.exit(0);
    }
  });
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.info(`\n[connect] ${sig} received`);
    void doShutdown();
  });
}
