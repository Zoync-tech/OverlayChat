const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { version: APP_VERSION } = require("../package.json");

const DEFAULT_SETTINGS = {
  appVersion: APP_VERSION,
  roomId: "ipl-main",
  overlayBaseUrl: "https://overlaychat-6f3c1.web.app/o",
  clickThrough: false,
  overlayVisible: true,
  opacity: 1,
  bounds: {
    width: 462,
    height: 924,
    x: 80,
    y: 60
  }
};

let controlWindow = null;
let overlayWindow = null;

const settingsPath = () => path.join(app.getPath("userData"), "settings.json");

const loadSettings = () => {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf8");
    const parsed = JSON.parse(raw);

    if (parsed.appVersion !== APP_VERSION) {
      return { ...DEFAULT_SETTINGS };
    }

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      bounds: {
        ...DEFAULT_SETTINGS.bounds,
        ...(parsed.bounds || {})
      }
    };
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
};

let settings = loadSettings();

const saveSettings = () => {
  settings.appVersion = APP_VERSION;
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
};

const getOverlayQuery = () => ({
  room: settings.roomId,
  mode: "desktop"
});

const loadOverlayPage = (window) => {
  window.loadFile(path.join(__dirname, "..", "overlay.html"), {
    query: getOverlayQuery()
  });
};

const broadcastState = () => {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send("settings:changed", settings);
  }
};

const applyOverlayFlags = () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(settings.clickThrough, { forward: true });
  overlayWindow.setOpacity(settings.opacity);
};

const persistOverlayBounds = () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  const bounds = overlayWindow.getBounds();
  settings.bounds = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y
  };
  saveSettings();
  broadcastState();
};

const ensureOverlayWindow = () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  overlayWindow = new BrowserWindow({
    ...settings.bounds,
    show: false,
    frame: false,
    transparent: true,
    title: "OverlayChat",
    titleBarStyle: "hidden",
    hasShadow: false,
    resizable: true,
    movable: true,
    fullscreenable: false,
    skipTaskbar: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadOverlayPage(overlayWindow);
  overlayWindow.setMenuBarVisibility(false);
  overlayWindow.removeMenu();
  
  overlayWindow.once("ready-to-show", () => {
    applyOverlayFlags();
    if (settings.overlayVisible) {
      overlayWindow.showInactive();
    }
  });

  overlayWindow.on("move", persistOverlayBounds);
  overlayWindow.on("resize", persistOverlayBounds);
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });

  return overlayWindow;
};

const ensureControlWindow = () => {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.focus();
    return controlWindow;
  }

  controlWindow = new BrowserWindow({
    width: 440,
    height: 760,
    minWidth: 420,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: "#08121e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  controlWindow.loadFile(path.join(__dirname, "control.html"));
  controlWindow.on("closed", () => {
    controlWindow = null;
  });

  return controlWindow;
};

const updateSettings = (partial) => {
  settings = {
    ...settings,
    ...partial,
    bounds: {
      ...settings.bounds,
      ...(partial.bounds || {})
    }
  };

  saveSettings();
  applyOverlayFlags();

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    loadOverlayPage(overlayWindow);
  }

  broadcastState();
  return settings;
};

const registerShortcuts = () => {
  globalShortcut.register("CommandOrControl+Shift+X", () => {
    updateSettings({ clickThrough: !settings.clickThrough });
  });

  globalShortcut.register("CommandOrControl+Shift+O", () => {
    const window = ensureOverlayWindow();
    settings.overlayVisible = true;
    saveSettings();
    window.showInactive();
    broadcastState();
  });
};

app.whenReady().then(() => {
  ensureControlWindow();
  if (settings.overlayVisible) {
    ensureOverlayWindow();
  }
  registerShortcuts();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  ensureControlWindow();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle("settings:get", () => settings);
ipcMain.handle("settings:update", (_event, partial) => updateSettings(partial));

ipcMain.handle("overlay:show", () => {
  const window = ensureOverlayWindow();
  settings.overlayVisible = true;
  saveSettings();
  applyOverlayFlags();
  window.showInactive();
  broadcastState();
  return settings;
});

ipcMain.handle("overlay:hide", () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
  settings.overlayVisible = false;
  saveSettings();
  broadcastState();
  return settings;
});

ipcMain.handle("overlay:reload", () => {
  const window = ensureOverlayWindow();
  loadOverlayPage(window);
  return settings;
});

ipcMain.handle("overlay:reset-bounds", () => {
  settings.bounds = { ...DEFAULT_SETTINGS.bounds };
  saveSettings();
  const window = ensureOverlayWindow();
  window.setBounds(settings.bounds);
  broadcastState();
  return settings;
});

ipcMain.handle("overlay:toggle-click-through", () => {
  return updateSettings({ clickThrough: !settings.clickThrough });
});

ipcMain.handle("overlay:open-controls", () => {
  ensureControlWindow();
  return true;
});

ipcMain.handle("external:open", (_event, url) => shell.openExternal(url));
ipcMain.handle("clipboard:write-text", (_event, value) => {
  clipboard.writeText(value || "");
  return true;
});
