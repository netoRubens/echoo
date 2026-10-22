// Atualização do programa (instalador Inno Setup): baixa da Release oficial do GitHub,
// confere o SHA-256 e executa o instalador em modo silencioso.
const https = require('https'), http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');

const cmp = (a, b) => { const x = String(a).split('.').map(n => parseInt(n, 10) || 0), y = String(b).split('.').map(n => parseInt(n, 10) || 0); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };

function get(url, { allow, maxBytes = 5e6, sink, hops = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (allow && !allow(url)) return reject(new Error('endereço não permitido'));
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { 'user-agent': 'ECHOO-updater' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); if (hops >= 5) return reject(new Error('redirecionamentos demais'));
        return resolve(get(new URL(res.headers.location, url).href, { allow, maxBytes, sink, hops: hops + 1 }));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let n = 0; const chunks = [], hash = crypto.createHash('sha256'), out = sink ? fs.createWriteStream(sink) : null;
      res.on('data', c => { n += c.length; if (n > maxBytes) return req.destroy(new Error('arquivo grande demais')); hash.update(c); out ? out.write(c) : chunks.push(c); });
      res.on('end', () => { const sha256 = hash.digest('hex'); if (out) out.end(() => resolve({ sha256, size: n })); else resolve({ body: Buffer.concat(chunks), sha256 }); });
      res.on('error', reject);
    });
    req.on('error', reject); req.setTimeout(60000, () => req.destroy(new Error('tempo esgotado')));
  });
}

// Só aceita baixar da Release do repositório configurado (e dos servidores de arquivos do GitHub nos redirecionamentos)
const allowGithub = repo => url => {
  try { const u = new URL(url); if (u.protocol !== 'https:') return false;
    if (u.hostname === 'github.com') return u.pathname.toLowerCase().startsWith('/' + String(repo).toLowerCase() + '/releases/');
    return /(^|\.)githubusercontent\.com$/.test(u.hostname); } catch (e) { return false; }
};

async function check({ server, current, repo, dir, allowDownload, onState }) {
  const info = JSON.parse((await get(String(server).replace(/\/+$/, '') + '/api/version', { maxBytes: 1e5 })).body.toString('utf8'));
  if (!info.shell || cmp(info.shell, current) <= 0) return null;
  const allow = allowDownload || allowGithub(repo);
  if (!info.download || !allow(info.download)) throw new Error('download fora do repositório oficial');
  onState && onState({ state: 'available', version: info.shell });
  const want = ((await get(info.download + '.sha256', { allow, maxBytes: 1e4 })).body.toString('utf8').match(/[a-f0-9]{64}/i) || [])[0];
  if (!want) throw new Error('sem hash de verificação');
  const file = path.join(dir, 'ECHOO-Setup-' + info.shell + '.exe'), rm = () => { try { fs.unlinkSync(file); } catch (e) {} };
  const r = await get(info.download, { allow, maxBytes: 600e6, sink: file }).catch(e => { rm(); throw e; });
  if (r.sha256.toLowerCase() !== want.toLowerCase()) { rm(); throw new Error('o hash do arquivo não confere'); }
  return { version: info.shell, file };
}
function install(file) { spawn(file, ['/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', '/RESTARTAPPLICATIONS'], { detached: true, stdio: 'ignore' }).unref(); }
module.exports = { check, install, cmp, allowGithub, get };
