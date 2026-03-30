const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlayDesktop", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (partial) => ipcRenderer.invoke("settings:update", partial),
  showOverlay: () => ipcRenderer.invoke("overlay:show"),
  hideOverlay: () => ipcRenderer.invoke("overlay:hide"),
  reloadOverlay: () => ipcRenderer.invoke("overlay:reload"),
  resetBounds: () => ipcRenderer.invoke("overlay:reset-bounds"),
  toggleClickThrough: () => ipcRenderer.invoke("overlay:toggle-click-through"),
  openControls: () => ipcRenderer.invoke("overlay:open-controls"),
  openExternal: (url) => ipcRenderer.invoke("external:open", url),
  copyText: (value) => ipcRenderer.invoke("clipboard:write-text", value),
  onSettingsChanged: (callback) => {
    ipcRenderer.on("settings:changed", (_event, value) => callback(value));
  },
  onOverlayUrl: (callback) => {
    ipcRenderer.on("overlay:url", (_event, value) => callback(value));
  },
  clearNode: (roomId, node) => ipcRenderer.invoke("room:clear-node", roomId, node)
});
