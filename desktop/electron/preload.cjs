const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tamiaApp", {
  isDesktop: true,
  getDefaultRoadmap: () => ipcRenderer.invoke("app:get-default-roadmap"),
  loadRoadmap: () => ipcRenderer.invoke("app:load-roadmap"),
  saveRoadmap: (data) => ipcRenderer.invoke("app:save-roadmap", data),
  getStorageInfo: () => ipcRenderer.invoke("app:get-storage-info"),
});
