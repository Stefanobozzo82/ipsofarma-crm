// Fio - pacchetto desktop per Steam.
// Carica il gioco offline (game/index.html) in una finestra a schermo intero e collega Steamworks
// (obiettivi e overlay) quando il gioco viene avviato da Steam.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const STEAM_APP_ID = Number(process.env.FIO_STEAM_APP_ID || 480); // 480 = app di prova di Valve; metti qui l'App ID vero
let steam = null;
try {
  const steamworks = require('steamworks.js');
  steam = steamworks.init(STEAM_APP_ID);
  steamworks.electronEnableSteamOverlay();
} catch (e) {
  console.warn('Steam non disponibile, il gioco parte senza obiettivi:', e.message);
}

ipcMain.on('fio-achievement', (_e, id) => {
  try { if (steam && !steam.achievement.isActivated(id)) steam.achievement.activate(id); } catch (e) { console.warn(e); }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, fullscreen: true, backgroundColor: '#16213e', autoHideMenuBar: true,
    title: 'Fio - Il Faro delle Mappe',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'game', 'index.html'));
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
