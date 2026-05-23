import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

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

function healthPayload() {
  const hasUrl = !!process.env.SUPABASE_URL;
  const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const storage = hasUrl && hasKey ? "supabase" : "filesystem";
  const labels = {
    supabase: "Supabase cloud database",
    filesystem: "Local server files",
  };
  let hint = "Cloud database connected.";
  if (!hasUrl && !hasKey) {
    hint = "Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Render → Environment, then redeploy.";
  } else if (!hasUrl) {
    hint = "SUPABASE_URL is missing on the server. Add it in Render → Environment, then redeploy.";
  } else if (!hasKey) {
    hint = "SUPABASE_SERVICE_ROLE_KEY is missing. Add the service_role secret from Supabase → Settings → API, then redeploy.";
  }
  return {
    ok: true,
    app: "azm-lean-startup-roadmap",
    storage,
    storageLabel: labels[storage] || storage,
    supabaseUrl: hasUrl,
    supabaseServiceRoleKey: hasKey,
    hint,
  };
}

const server = createServer(async (nodeReq, nodeRes) => {
  const res = makeRes(nodeRes);

  try {
    const url = new URL(nodeReq.url, `http://${nodeReq.headers.host || "localhost"}`);

    if (nodeReq.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.status(204).end();
      return;
    }

    if (url.pathname === "/health" || url.pathname === "/api/health") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.json(healthPayload());
      return;
    }

    if (url.pathname === "/api/data") {
      const { handleData } = await import("./lib/handlers.js");
      return handleData(nodeReq, res);
    }

    const boardMatch = url.pathname.match(/^\/api\/boards\/([^/]+)$/);
    if (boardMatch) {
      const { handleBoard } = await import("./lib/handlers.js");
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
  } catch (err) {
    console.error("Request failed:", err);
    if (!nodeRes.headersSent) {
      nodeRes.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      nodeRes.end(JSON.stringify({ error: "server error", message: err?.message || String(err) }));
    }
  }
});

if (!process.env.VERCEL) {
  server
    .listen(PORT, "0.0.0.0", () => {
      console.log(`AZM Lean Startup Road Map running on port ${PORT}`);
      console.log(`Cloud storage: ${process.env.SUPABASE_URL ? "Supabase" : "local filesystem"}`);
      mkdir(join(__dirname, "data", "boards"), { recursive: true }).catch(() => {});
    })
    .on("error", (err) => {
      console.error("Failed to start server:", err);
      process.exit(1);
    });
}
