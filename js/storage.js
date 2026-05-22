import Cloud from "./cloud.js";

const STORAGE_KEYS = {
  data: "tamia4life_gantt_data_v1",
  ui: "tamia4life_gantt_ui_v1",
};

const desktop = typeof window !== "undefined" && window.tamiaApp?.isDesktop;

const Storage = {
  loadData(fallback) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.data);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.tasks && parsed?.phases) return parsed;
      }
    } catch (_) {
      /* ignore corrupt storage */
    }
    return structuredClone(fallback);
  },

  saveData(data) {
    localStorage.setItem(STORAGE_KEYS.data, JSON.stringify(data));
    if (Cloud.isShared()) {
      Cloud.saveBoard(data).catch(() => {});
      return;
    }
    if (desktop) {
      window.tamiaApp.saveRoadmap(data).catch(() => {});
      return;
    }
    this.syncToServer(data);
  },

  loadUI() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ui);
      if (raw) return Object.assign({ zoom: 2, collapsed: [] }, JSON.parse(raw));
    } catch (_) {
      /* ignore */
    }
    return { zoom: 2, collapsed: [] };
  },

  saveUI(ui) {
    localStorage.setItem(STORAGE_KEYS.ui, JSON.stringify(ui));
  },

  clearAll() {
    localStorage.removeItem(STORAGE_KEYS.data);
    localStorage.removeItem(STORAGE_KEYS.ui);
  },

  async fetchDefault() {
    if (desktop) {
      const data = await window.tamiaApp.getDefaultRoadmap();
      if (data?.tasks && data?.phases) return data;
      throw new Error("Could not load default data");
    }
    const res = await fetch("./data/default-data.json");
    if (!res.ok) throw new Error("Could not load default data");
    return res.json();
  },

  async syncToServer(data) {
    try {
      await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch (_) {
      /* server optional */
    }
  },

  async loadFromServer() {
    if (Cloud.isShared()) {
      try {
        const data = await Cloud.loadBoard();
        if (data) return data;
      } catch (_) {
        /* ignore */
      }
      return null;
    }
    if (desktop) {
      try {
        const data = await window.tamiaApp.loadRoadmap();
        if (data?.tasks && data?.phases) return data;
      } catch (_) {
        /* ignore */
      }
      return null;
    }
    try {
      const res = await fetch("/api/data");
      if (!res.ok) return null;
      const payload = await res.json();
      const data = payload?.data || payload;
      if (data?.tasks && data?.phases) return data;
    } catch (_) {
      /* server optional */
    }
    return null;
  },

  lastSavedLabel() {
    if (Cloud.isShared()) {
      return `Shared board · ${Cloud.getBoardId()}`;
    }
    if (desktop) return "Saved in Tamia4Life app";
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.data);
      if (!raw) return "Using default roadmap";
      const kb = (raw.length / 1024).toFixed(1);
      return `Saved locally · ${kb} KB`;
    } catch (_) {
      return "Saved locally";
    }
  },

  cloud: Cloud,
};

export default Storage;
