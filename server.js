import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { handleHealth, handleData, handleBoard } from "./lib/handlers.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 3847;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function makeRes(nodeRes) {
  return {
    statusCode: 200,
    _headers: {},
    setHeader(k, v) {
      this._headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      nodeRes.writeHead(this.statusCode, {
        ...this._headers,
        "Content-Type": "application/json; charset=utf-8",
      });
      nodeRes.end(JSON.stringify(body));
    },
    end() {
      nodeRes.writeHead(this.statusCode, this._headers);
      nodeRes.end("");
    },
  };
}

await mkdir(join(__dirname, "data", "boards"), { recursive: true });

const server = createServer(async (nodeReq, nodeRes) => {
  const url = new URL(nodeReq.url, `http://${nodeReq.headers.host || "localhost"}`);
  const res = makeRes(nodeRes);

  if (nodeReq.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (url.pathname === "/health" || url.pathname === "/api/health") {
    return handleHealth(nodeReq, res);
  }
  if (url.pathname === "/api/data") {
    return handleData(nodeReq, res);
  }
  const boardMatch = url.pathname.match(/^\/api\/boards\/([^/]+)$/);
  if (boardMatch) {
    return handleBoard(nodeReq, res, decodeURIComponent(boardMatch[1]));
  }

  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = join(__dirname, decodeURIComponent(rel));

  if (!filePath.startsWith(__dirname)) {
    nodeRes.writeHead(403);
    nodeRes.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    nodeRes.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    nodeRes.end(content);
  } catch (_) {
    nodeRes.writeHead(404);
    nodeRes.end("Not found");
  }
});

if (!process.env.VERCEL) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`AZM Lean Startup Road Map running on port ${PORT}`);
    console.log(`Cloud storage: ${process.env.SUPABASE_URL ? "Supabase" : "local filesystem"}`);
  }).on("error", (err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
