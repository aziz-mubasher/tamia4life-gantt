const BOARD_KEY = "tamia4life_board_id_v1";
const CLOUD_URL_KEY = "tamia4life_cloud_url_v1";
const POLL_MS = 20000;

let pollTimer = null;
let lastRemoteUpdatedAt = null;
let onRemoteUpdate = null;

function normalizeBoardId(id) {
  return String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function normalizeCloudUrl(url) {
  const trimmed = String(url || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const Cloud = {
  getBoardId() {
    const fromUrl = new URLSearchParams(window.location.search).get("board");
    if (fromUrl) {
      const id = normalizeBoardId(fromUrl);
      if (id) {
        localStorage.setItem(BOARD_KEY, id);
        return id;
      }
    }
    return localStorage.getItem(BOARD_KEY) || "";
  },

  setBoardId(id) {
    const normalized = normalizeBoardId(id);
    if (normalized) localStorage.setItem(BOARD_KEY, normalized);
    else localStorage.removeItem(BOARD_KEY);
    return normalized;
  },

  getCloudUrl() {
    const saved = localStorage.getItem(CLOUD_URL_KEY);
    if (saved) return normalizeCloudUrl(saved);
    if (window.location.origin && window.location.origin !== "null" && !window.location.protocol.startsWith("file")) {
      return window.location.origin;
    }
    return "";
  },

  setCloudUrl(url) {
    const normalized = normalizeCloudUrl(url);
    if (normalized) localStorage.setItem(CLOUD_URL_KEY, normalized);
    else localStorage.removeItem(CLOUD_URL_KEY);
    return normalized;
  },

  isShared() {
    return !!(this.getBoardId() && this.getCloudUrl());
  },

  shareLink(boardId = this.getBoardId()) {
    const base = this.getCloudUrl() || window.location.origin;
    const id = normalizeBoardId(boardId);
    if (!base || !id) return "";
    return `${base.replace(/\/+$/, "")}/?board=${encodeURIComponent(id)}`;
  },

  apiUrl(boardId = this.getBoardId()) {
    const base = this.getCloudUrl();
    const id = normalizeBoardId(boardId);
    if (!base || !id) return "";
    return `${base}/api/boards/${encodeURIComponent(id)}`;
  },

  async loadBoard() {
    const url = this.apiUrl();
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const payload = await res.json();
    if (!payload?.data?.tasks || !payload?.data?.phases) return null;
    lastRemoteUpdatedAt = payload.updatedAt || null;
    return payload.data;
  },

  async saveBoard(data) {
    const url = this.apiUrl();
    if (!url) return false;
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return false;
    const payload = await res.json();
    lastRemoteUpdatedAt = payload.updatedAt || new Date().toISOString();
    return true;
  },

  async createBoard(boardId, data) {
    this.setBoardId(boardId);
    return this.saveBoard(data);
  },

  startPolling(callback) {
    onRemoteUpdate = callback;
    this.stopPolling();
    if (!this.isShared()) return;
    pollTimer = setInterval(() => this.pollOnce(), POLL_MS);
  },

  stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },

  async pollOnce() {
    if (!this.isShared()) return;
    try {
      const url = this.apiUrl();
      const res = await fetch(url);
      if (!res.ok) return;
      const payload = await res.json();
      if (!payload?.data || !payload.updatedAt) return;
      if (lastRemoteUpdatedAt && payload.updatedAt <= lastRemoteUpdatedAt) return;
      lastRemoteUpdatedAt = payload.updatedAt;
      if (onRemoteUpdate) onRemoteUpdate(payload.data);
    } catch (_) {
      /* offline */
    }
  },

  markSynced(updatedAt) {
    lastRemoteUpdatedAt = updatedAt || new Date().toISOString();
  },

  disconnect() {
    this.stopPolling();
    localStorage.removeItem(BOARD_KEY);
    lastRemoteUpdatedAt = null;
  },
};

export default Cloud;
