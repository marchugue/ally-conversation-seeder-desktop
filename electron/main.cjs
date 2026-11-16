const { app, BrowserWindow, ipcMain, net } = require('electron');
const path = require('path');

if (process.platform === 'linux' || process.env.ALLY_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration();
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.allyjis.conversationseeder');
}

const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || (isDev ? 'http://127.0.0.1:5175' : null);

function createMainWindow() {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const win = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 780,
    minHeight: 540,
    backgroundColor: '#0b110e',
    title: 'ALLY-JIS Conversation Seeder',
    icon: path.join(__dirname, '..', 'build', iconFile),
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

ipcMain.handle('api:request', async (_event, { url, method = 'GET', headers = {}, body }) => {
  try {
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
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { message: err?.message || 'Unable to reach centralized backend' },
    };
  }
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
