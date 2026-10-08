// Ponte sicuro tra il gioco e Steam: il gioco chiama window.fioSteam.unlock('ID_OBIETTIVO').
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fioSteam', { unlock: id => ipcRenderer.send('fio-achievement', String(id)) });
