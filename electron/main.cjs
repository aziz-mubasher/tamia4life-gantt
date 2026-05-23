const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const isDev = !app.isPackaged;
const ROADMAP_FILE = () => path.join(app.getPath("userData"), "roadmap.json");
const DEFAULT_FILE = () =>
  isDev
    ? path.join(__dirname, "..", "data", "default-data.json")
    : path.join(process.resourcesPath, "data", "default-data.json");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: "AZM Lean Startup Road Map",
    backgroundColor: "#eef2f7",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, "..", "index.html"));
  win.setTitle("AZM - Lean Startup Road Map");

  if (isDev) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

ipcMain.handle("app:get-default-roadmap", () => readJson(DEFAULT_FILE()));

ipcMain.handle("app:load-roadmap", () => readJson(ROADMAP_FILE()));

ipcMain.handle("app:save-roadmap", (_event, data) => {
  writeJson(ROADMAP_FILE(), data);
  return { ok: true, path: ROADMAP_FILE() };
});

ipcMain.handle("app:get-storage-info", () => ({
  isDesktop: true,
  path: ROADMAP_FILE(),
}));

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});
