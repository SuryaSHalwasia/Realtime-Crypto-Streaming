import http from "node:http";

const PORT = Number(process.env.PORT ?? 8080);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "pluto-server" }));
    return;
  }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Pluto server is running. Try GET /health\n");
});

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
