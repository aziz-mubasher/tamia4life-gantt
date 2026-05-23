import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const BOARDS_DIR = join(ROOT, "data", "boards");
const LEGACY_FILE = join(ROOT, "data", "saved-data.json");
const KEY_PREFIX = "lean-startup";

export function sanitizeBoardId(id) {
  return String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function boardKey(id) {
  return `${KEY_PREFIX}:board:${sanitizeBoardId(id)}`;
}

export function mainKey() {
  return `${KEY_PREFIX}:main`;
}

export function wrapPayload(data) {
  return { data, updatedAt: new Date().toISOString() };
}

export function isValidRoadmap(data) {
  return data && typeof data === "object" && Array.isArray(data.tasks) && Array.isArray(data.phases);
}

function supabaseEnabled() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function blobEnabled() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

let supabasePromise = null;

async function getSupabase() {
  if (!supabasePromise) {
    supabasePromise = (async () => {
      const [{ createClient }, { default: WebSocket }] = await Promise.all([
        import("@supabase/supabase-js"),
        import("ws"),
      ]);
      return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          realtime: { transport: WebSocket },
        }
      );
    })();
  }
  return supabasePromise;
}

function boardBlobPath(id) {
  return `${KEY_PREFIX}/boards/${sanitizeBoardId(id)}.json`;
}

function legacyBlobPath() {
  return `${KEY_PREFIX}/saved-data.json`;
}

async function readSupabase(key) {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("kaizen_data")
    .select("payload, updated_at")
    .eq("key", key)
    .maybeSingle();
  if (error || !data?.payload) return null;
  return {
    data: data.payload,
    updatedAt: data.updated_at || new Date().toISOString(),
  };
}

async function writeSupabase(key, payloadData) {
  const sb = await getSupabase();
  const updatedAt = new Date().toISOString();
  const { error } = await sb.from("kaizen_data").upsert(
    { key, payload: payloadData, updated_at: updatedAt },
    { onConflict: "key" }
  );
  if (error) throw error;
  return { data: payloadData, updatedAt };
}

async function readBoardFs(id) {
  const file = join(BOARDS_DIR, `${sanitizeBoardId(id)}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (_) {
    return null;
  }
}

async function writeBoardFs(id, data) {
  await mkdir(BOARDS_DIR, { recursive: true });
  const payload = wrapPayload(data);
  await writeFile(join(BOARDS_DIR, `${sanitizeBoardId(id)}.json`), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

async function readLegacyFs() {
  if (!existsSync(LEGACY_FILE)) return null;
  try {
    const data = JSON.parse(await readFile(LEGACY_FILE, "utf8"));
    return wrapPayload(data);
  } catch (_) {
    return null;
  }
}

async function writeLegacyFs(data) {
  await mkdir(join(ROOT, "data"), { recursive: true });
  await writeFile(LEGACY_FILE, JSON.stringify(data, null, 2), "utf8");
  return wrapPayload(data);
}

async function readByKey(key, blobPath, fsReader) {
  if (supabaseEnabled()) return readSupabase(key);
  if (blobEnabled() && blobPath) {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: blobPath, limit: 1 });
    if (!blobs.length) return null;
    const res = await fetch(blobs[0].url);
    if (!res.ok) return null;
    return res.json();
  }
  return fsReader();
}

async function writeByKey(key, payloadData, blobPath, fsWriter) {
  if (supabaseEnabled()) return writeSupabase(key, payloadData);
  if (blobEnabled() && blobPath) {
    const { put } = await import("@vercel/blob");
    const payload = wrapPayload(payloadData);
    await put(blobPath, JSON.stringify(payload, null, 2), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return payload;
  }
  return fsWriter(payloadData);
}

export async function readBoard(id) {
  return readByKey(boardKey(id), boardBlobPath(id), () => readBoardFs(id));
}

export async function writeBoard(id, data) {
  return writeByKey(boardKey(id), data, boardBlobPath(id), (payloadData) => writeBoardFs(id, payloadData));
}

export async function readLegacyData() {
  return readByKey(mainKey(), legacyBlobPath(), readLegacyFs);
}

export async function writeLegacyData(data) {
  return writeByKey(mainKey(), data, legacyBlobPath(), writeLegacyFs);
}

export function storageMode() {
  if (supabaseEnabled()) return "supabase";
  if (blobEnabled()) return "vercel-blob";
  if (process.env.VERCEL) return "ephemeral";
  return "filesystem";
}

export function storageLabel() {
  const modes = {
    supabase: "Supabase cloud database",
    "vercel-blob": "Vercel Blob storage",
    ephemeral: "Browser only (add Supabase env vars)",
    filesystem: "Local server files",
  };
  return modes[storageMode()] || storageMode();
}

export function storageDiagnostics() {
  const hasUrl = !!process.env.SUPABASE_URL;
  const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  let hint = "Cloud database connected.";
  if (!hasUrl && !hasKey) {
    hint = "Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Render → Environment, then redeploy.";
  } else if (!hasUrl) {
    hint = "SUPABASE_URL is missing on the server. Add it in Render → Environment, then redeploy.";
  } else if (!hasKey) {
    hint = "SUPABASE_SERVICE_ROLE_KEY is missing. Add the service_role secret from Supabase → Settings → API, then redeploy.";
  }
  return {
    supabaseUrl: hasUrl,
    supabaseServiceRoleKey: hasKey,
    hint,
  };
}
