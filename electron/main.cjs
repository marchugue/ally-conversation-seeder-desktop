const { app, BrowserWindow, ipcMain, net } = require('electron');
const path = require('path');

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:5175' : null);

function createMainWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 780,
    minHeight: 540,
    backgroundColor: '#0f1713',
    title: 'ALLY-JIS Conversation Seeder',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// Proxy API requests through Electron main process so calls to the centralized
// backend never fail due to file:// Origin CORS restrictions.
ipcMain.handle('api:request', async (_event, { url, method = 'GET', headers = {}, body }) => {
  const response = await net.fetch(url, {
    method,
    headers,
    body: body !== undefined ? body : undefined,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text || response.statusText };
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
});

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

