const { app, BrowserWindow, session, desktopCapturer, ipcMain, shell } = require('electron');
const path = require('path'), fs = require('fs');

// O programa abre o MESMO app que está no servidor (como o site): atualiza junto, sem divergência.
let SERVER = process.env.ECHOO_SERVER || '';
try { SERVER = SERVER || JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')).server || ''; } catch (e) {}
SERVER = String(SERVER).trim().replace(/\/+$/, '');
let ORIGIN = ''; try { ORIGIN = new URL(SERVER).origin; } catch (e) {}
const APP_URL = ORIGIN ? ORIGIN + '/app/' : '';

app.commandLine.appendSwitch('disable-renderer-backgrounding');
if (!app.requestSingleInstanceLock()) app.quit();

let win = null, lastUpd = null;
const page = n => path.join(__dirname, n);
const fromApp = e => { try { return new URL(e.senderFrame.url).origin === ORIGIN; } catch (x) { return false; } };

// Só o app do nosso servidor pode listar telas/janelas para compartilhar
ipcMain.handle('sources', async e => {
  if (!fromApp(e)) return [];
  const s = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 240, height: 135 }, fetchWindowIcons: false });
  return s.map(x => ({ id: x.id, name: x.name, thumb: x.thumbnail.toDataURL() }));
});
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.on('retry', () => load());
ipcMain.on('install-update', () => { try { require('electron-updater').autoUpdater.quitAndInstall(); } catch (e) {} });

function load() {
  if (!win) return;
  if (!APP_URL) return win.loadFile(page('offline.html'), { query: { m: 'config' } });
  win.loadFile(page('loading.html')).then(() => win.loadURL(APP_URL)).catch(() => { if (win && !win.isDestroyed()) win.loadFile(page('offline.html')); });
}
const tell = d => { lastUpd = d; if (win && !win.isDestroyed()) win.webContents.send('update', d); };

// Atualização automática do programa (instalador) via GitHub Releases
function setupUpdater() {
  if (!app.isPackaged) return;
  let au; try { au = require('electron-updater').autoUpdater; } catch (e) { return; }
  au.autoDownload = true; au.autoInstallOnAppQuit = true;
  au.on('update-available', i => tell({ state: 'available', version: i.version }));
  au.on('update-downloaded', i => tell({ state: 'ready', version: i.version }));
  au.on('error', e => console.error('atualizador:', e && e.message));
  const check = () => au.checkForUpdates().catch(() => {});
  check(); setInterval(check, 4 * 3600e3);
}

app.whenReady().then(() => {
  const ses = session.defaultSession, ok = ['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write', 'notifications'];
  ses.setPermissionRequestHandler((wc, perm, cb, d) => { let r = false; try { r = ok.includes(perm) && new URL(d.requestingUrl).origin === ORIGIN; } catch (e) {} cb(r); });
  ses.setDisplayMediaRequestHandler((req, cb) => { desktopCapturer.getSources({ types: ['screen'] }).then(src => cb({ video: src[0], audio: 'loopback' })); });
  win = new BrowserWindow({
    width: 1280, height: 780, minWidth: 900, minHeight: 600, backgroundColor: '#17110d', autoHideMenuBar: true, title: 'ECHOO',
    webPreferences: { preload: page('preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:') && !(ORIGIN && url.startsWith(ORIGIN))) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.on('did-finish-load', () => { if (lastUpd) tell(lastUpd); });
  win.on('closed', () => { win = null; });
  load(); setupUpdater();
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
