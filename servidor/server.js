'use strict';
// ECHOO - servidor central. Dependência única: ws
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUB = path.join(__dirname, 'public');
fs.mkdirSync(DATA_DIR, { recursive: true });
const FILE = path.join(DATA_DIR, 'echoo.json');

/* ---------- persistência (arquivo JSON, gravação atômica) ---------- */
const DEFAULT_DB = () => ({ users: {}, reqs: [], sess: {}, servers: {}, msgs: {} });
let db = DEFAULT_DB(); const idx = {}; let pool = null;
// Com DATABASE_URL (Postgres: Neon, Supabase...) os dados ficam fora do servidor e sobrevivem a reinícios.
// Sem DATABASE_URL, usa um arquivo JSON (precisa de disco persistente).
async function loadDb() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false }, max: 3 });
    await pool.query('CREATE TABLE IF NOT EXISTS echoo_state (id int PRIMARY KEY, data jsonb NOT NULL, updated timestamptz NOT NULL DEFAULT now())');
    const r = await pool.query('SELECT data FROM echoo_state WHERE id = 1');
    if (r.rows[0]) db = { ...DEFAULT_DB(), ...r.rows[0].data };
    console.log('Dados carregados do Postgres.');
  } else {
    try { db = { ...DEFAULT_DB(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (e) {}
    console.log('Dados em arquivo:', FILE);
  }
  for (const u of Object.values(db.users)) idx[u.user] = u.id;
}
let dirty = false, saving = false; const save = () => { dirty = true; };
async function flush() {
  if (!dirty || saving) return; dirty = false; saving = true;
  try {
    if (pool) await pool.query('INSERT INTO echoo_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated = now()', [JSON.stringify(db)]);
    else { const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(db)); fs.renameSync(t, FILE); }
  } catch (e) { dirty = true; console.error('erro ao salvar:', e.message); }
  saving = false;
}
setInterval(flush, 1500);
for (const sg of ['SIGINT', 'SIGTERM']) process.on(sg, async () => { dirty = true; saving = false; await flush(); process.exit(0); });

/* ---------- utilidades ---------- */
const rnd = n => crypto.randomBytes(n).toString('hex');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const hashPw = p => { const salt = rnd(16); return 'scrypt$' + salt + '$' + crypto.scryptSync(p, salt, 32).toString('hex'); };
const checkPw = (p, h) => { const [, salt, hex] = String(h).split('$'); const a = Buffer.from(hex || '', 'hex'), b = crypto.scryptSync(p, salt || '', 32); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
const okImg = (a, max) => typeof a === 'string' && a.length <= max && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(a) ? a : '';
const isHex = h => /^#[0-9a-f]{6}$/i.test(h);
const VERSION_FILE = path.join(__dirname, 'version.json');
function readVersion() { let v = { version: '0.0.0', download: '' }; try { v = { ...v, ...JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')) }; } catch (e) {} if (process.env.DOWNLOAD_URL) v.download = process.env.DOWNLOAD_URL; return v; }
const APP_VER = readVersion().version;
// código de recuperação (sem e-mail): mostrado uma vez no cadastro
const recCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = crypto.randomBytes(16); let o = ''; for (let i = 0; i < 16; i++) { o += A[b[i] % A.length]; if (i % 4 === 3 && i < 15) o += '-'; } return o; };
const normRec = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
if (process.env.TURN_URL) ICE.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER, credential: process.env.TURN_PASS });

const ipHits = {};
function hit(ip, kind, max, win) { const k = kind + ip, n = Date.now(); ipHits[k] = (ipHits[k] || []).filter(t => n - t < win); if (ipHits[k].length >= max) return false; ipHits[k].push(n); return true; }
setInterval(() => { const n = Date.now(); for (const k in ipHits) { ipHits[k] = ipHits[k].filter(t => n - t < 3600e3); if (!ipHits[k].length) delete ipHits[k]; } }, 600e3);
function bucket(ws) { const n = Date.now(); ws.b = (ws.b || []).filter(t => n - t < 10000); if (ws.b.length >= 80) return false; ws.b.push(n); return true; }

/* ---------- conexões e visões ---------- */
const clients = new Map();
const online = id => clients.has(id) && clients.get(id).size > 0;
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const toUser = (id, o) => { const s = clients.get(id); if (s) s.forEach(w => send(w, o)); };
const toUsers = (ids, o) => ids.forEach(i => toUser(i, o));
const err = (ws, m) => send(ws, { t: 'err', m });
const vis = u => u.status === 'invisible' ? 'offline' : u.status;
const pub = (u, full = true) => ({ code: u.id, user: u.user, name: u.name, tag: u.tag, status: vis(u), ...(full ? { avatar: u.avatar || '', banner: u.banner || '' } : {}) });
const friendView = u => ({ ...pub(u), on: online(u.id) && u.status !== 'invisible' });
const selfView = u => ({ ...pub(u), status: u.status });
const dmKey = (a, b) => [a, b].sort().join('+');

const mem = (s, id) => s.members.find(m => m.c === id);
const memberIds = s => s.members.map(m => m.c);
const canManage = (s, id) => { if (s.owner === id) return true; const m = mem(s, id); return !!m && m.r.some(r => (s.roles.find(x => x.id === r) || {}).manage); };
function srvView(s, icon) {
  const names = {}; s.members.forEach(m => { const u = db.users[m.c]; if (u) names[m.c] = u.name; });
  const o = { id: s.id, name: s.name, desc: s.desc, owner: s.owner, v: s.v, roles: s.roles, members: s.members, chans: s.chans, names };
  if (icon) o.icon = s.icon || ''; return o;
}
const pushSrv = (s, icon, only) => (only || memberIds(s)).forEach(id => toUser(id, { t: 'srv', srv: srvView(s, icon) }));
const shareServer = (a, b) => Object.values(db.servers).some(s => mem(s, a) && mem(s, b));

// Controle de acesso a uma "chave" de conversa: DM (a+b) ou canal (servidor:canal)
function access(uid, key) {
  if (typeof key !== 'string' || key.length > 80) return null;
  if (key.includes(':')) {
    const [sid, cid] = key.split(':'), s = db.servers[sid]; if (!s || !mem(s, uid)) return null;
    const c = s.chans.find(x => x.id === cid); if (!c) return null;
    return { type: c.t, members: memberIds(s), srv: s };
  }
  const p = key.split('+'); if (p.length !== 2 || !p.includes(uid)) return null;
  const o = p[0] === uid ? p[1] : p[0], u = db.users[uid];
  if (!db.users[o] || !u.friends.includes(o)) return null;
  return { type: 'dm', members: [uid, o] };
}
const recips = k => { if (k.includes(':')) { const s = db.servers[k.split(':')[0]]; return s ? memberIds(s) : []; } return k.split('+'); };

/* ---------- voz ---------- */
const voice = {}, inV = {};
const vbroadcast = k => toUsers(recips(k), { t: 'vs', c: k, on: [...(voice[k] || [])] });
function vleave(uid) { const k = inV[uid]; if (!k) return; delete inV[uid]; const s = voice[k]; if (s) { s.delete(uid); if (!s.size) delete voice[k]; } vbroadcast(k); }

/* ---------- amizades ---------- */
function acceptReq(from, to) {
  db.reqs = db.reqs.filter(r => !(r.from === from && r.to === to) && !(r.from === to && r.to === from));
  const a = db.users[from], b = db.users[to]; if (!a || !b) return;
  if (!a.friends.includes(to)) a.friends.push(to); if (!b.friends.includes(from)) b.friends.push(from);
  save();
  toUser(from, { t: 'friend', f: friendView(b) }); toUser(to, { t: 'friend', f: friendView(a) });
  toUser(from, { t: 'reqRm', code: to }); toUser(to, { t: 'reqRm', code: from });
}
const presence = u => u.friends.forEach(f => toUser(f, { t: 'pres', code: u.id, on: online(u.id) && u.status !== 'invisible', status: vis(u) }));

function sendInit(ws, u) {
  const vo = {}; for (const k in voice) { const a = access(u.id, k); if (a && a.type !== 't') vo[k] = [...voice[k]]; }
  send(ws, {
    t: 'init', me: selfView(u), ice: ICE, ver: APP_VER,
    friends: u.friends.map(f => db.users[f]).filter(Boolean).map(friendView),
    reqIn: db.reqs.filter(r => r.to === u.id).map(r => db.users[r.from]).filter(Boolean).map(x => pub(x)),
    reqOut: db.reqs.filter(r => r.from === u.id).map(r => db.users[r.to]).filter(Boolean).map(x => pub(x)),
    servers: Object.values(db.servers).filter(s => mem(s, u.id)).map(s => srvView(s, true)), voice: vo
  });
}
function login(ws, u, extra) {
  ws.uid = u.id; if (!clients.has(u.id)) clients.set(u.id, new Set()); clients.get(u.id).add(ws);
  const token = rnd(24); ws.sk = sha(token); db.sess[ws.sk] = { id: u.id, ts: Date.now() }; save();
  send(ws, { t: 'auth', token, ...(extra || {}) }); sendInit(ws, u); if (clients.get(u.id).size === 1) presence(u);
}

/* ---------- mensagens do cliente ---------- */
function handle(ws, m) {
  if (!ws.uid) {
    if (m.t === 'register') {
      if (!hit(ws.ip, 'reg', 6, 3600e3)) return send(ws, { t: 'autherr', m: 'Muitas contas criadas por aqui. Tente mais tarde.' });
      const user = str(m.user, 20).toLowerCase(), pass = str(m.pass, 100), name = str(m.name, 20).trim() || user;
      if (!/^[a-z0-9_]{3,20}$/.test(user)) return send(ws, { t: 'autherr', m: 'Usuário: 3 a 20 letras minúsculas, números ou _.' });
      if (pass.length < 6) return send(ws, { t: 'autherr', m: 'A senha precisa ter pelo menos 6 caracteres.' });
      if (idx[user]) return send(ws, { t: 'autherr', m: 'Esse usuário já existe.' });
      const id = 'u' + rnd(5);
      const u = db.users[id] = { id, user, pass: hashPw(pass), name, tag: String(1000 + Math.floor(Math.random() * 9000)), avatar: '', banner: '', status: 'online', friends: [], ts: Date.now() };
      const rec = recCode(); u.rec = hashPw(normRec(rec)); idx[user] = id; save(); return login(ws, u, { rec });
    }
    if (m.t === 'login') {
      if (!hit(ws.ip, 'log', 12, 60e3)) return send(ws, { t: 'autherr', m: 'Muitas tentativas. Aguarde um minuto.' });
      const id = idx[str(m.user, 20).toLowerCase()], u = id && db.users[id];
      if (!u || !checkPw(str(m.pass, 100), u.pass)) return send(ws, { t: 'autherr', m: 'Usuário ou senha incorretos.' });
      return login(ws, u);
    }
    if (m.t === 'reset') {
      if (!hit(ws.ip, 'rst', 8, 3600e3)) return send(ws, { t: 'autherr', m: 'Muitas tentativas. Tente mais tarde.' });
      const id = idx[str(m.user, 20).toLowerCase()], u = id && db.users[id], pass = str(m.pass, 100);
      if (pass.length < 6) return send(ws, { t: 'autherr', m: 'A nova senha precisa ter pelo menos 6 caracteres.' });
      if (!u || !u.rec || !checkPw(normRec(m.code), u.rec)) return send(ws, { t: 'autherr', m: 'Usuário ou código de recuperação incorretos.' });
      u.pass = hashPw(pass); const rec = recCode(); u.rec = hashPw(normRec(rec));
      for (const k in db.sess) if (db.sess[k].id === u.id) delete db.sess[k];
      save(); return login(ws, u, { rec, reset: 1 });
    }
    if (m.t === 'resume') {
      const s = db.sess[sha(str(m.token, 100))], u = s && db.users[s.id];
      if (!u) return send(ws, { t: 'autherr', m: '', resume: 1 });
      ws.uid = u.id; ws.sk = sha(str(m.token, 100)); if (!clients.has(u.id)) clients.set(u.id, new Set()); clients.get(u.id).add(ws);
      send(ws, { t: 'auth', token: m.token }); sendInit(ws, u); if (clients.get(u.id).size === 1) presence(u); return;
    }
    return;
  }
  const uid = ws.uid, u = db.users[uid];
  switch (m.t) {
    case 'chpw': case 'recGen': {
      if (!hit(ws.ip, 'pw', 10, 3600e3)) return err(ws, 'Muitas tentativas. Tente mais tarde.');
      if (!checkPw(str(m.t === 'chpw' ? m.old : m.pass, 100), u.pass)) return err(ws, 'Senha atual incorreta.');
      if (m.t === 'recGen') { const rec = recCode(); u.rec = hashPw(normRec(rec)); save(); send(ws, { t: 'rec', rec }); break; }
      const np = str(m.pass, 100); if (np.length < 6) return err(ws, 'A nova senha precisa ter pelo menos 6 caracteres.');
      u.pass = hashPw(np); for (const k in db.sess) if (db.sess[k].id === uid && k !== ws.sk) delete db.sess[k];
      save(); send(ws, { t: 'ok', m: 'Senha alterada.' }); break;
    }
    case 'logout': { delete db.sess[sha(str(m.token, 100))]; save(); break; }
    case 'search': {
      const q = str(m.q, 30).trim().toLowerCase(); if (q.length < 2) return; const out = [];
      for (const x of Object.values(db.users)) {
        if (x.id === uid) continue;
        if (x.user.startsWith(q) || x.name.toLowerCase().includes(q)) {
          out.push({ ...pub(x, false), rel: u.friends.includes(x.id) ? 'f' : db.reqs.some(r => r.from === uid && r.to === x.id) ? 'o' : db.reqs.some(r => r.from === x.id && r.to === uid) ? 'i' : '' });
          if (out.length >= 20) break;
        }
      }
      send(ws, { t: 'results', q, users: out }); break;
    }
    case 'prof': {
      if (typeof m.name === 'string') u.name = m.name.trim().slice(0, 20) || u.name;
      if (typeof m.tag === 'string') u.tag = m.tag.replace(/\D/g, '').padStart(4, '0').slice(-4);
      if (typeof m.avatar === 'string') u.avatar = okImg(m.avatar, 80000);
      if (typeof m.banner === 'string') u.banner = okImg(m.banner, 120000);
      if (['online', 'idle', 'dnd', 'invisible'].includes(m.status)) u.status = m.status;
      save(); toUser(uid, { t: 'me', me: selfView(u) }); presence(u);
      u.friends.forEach(f => toUser(f, { t: 'friend', f: friendView(u) })); break;
    }
    case 'profGet': {
      const ids = Array.isArray(m.ids) ? m.ids.slice(0, 50) : [], list = [];
      for (const id of ids) { const x = db.users[str(id, 30)]; if (x && (x.id === uid || u.friends.includes(x.id) || shareServer(uid, x.id))) list.push(pub(x)); }
      send(ws, { t: 'profs', list }); break;
    }
    case 'reqSend': {
      const to = db.users[str(m.to, 30)];
      if (!to || to.id === uid) return err(ws, 'Pessoa não encontrada.');
      if (u.friends.includes(to.id)) return err(ws, 'Vocês já são amigos.');
      if (db.reqs.some(r => r.from === uid && r.to === to.id)) return err(ws, 'Você já enviou um pedido para essa pessoa.');
      if (db.reqs.some(r => r.from === to.id && r.to === uid)) return acceptReq(to.id, uid);
      if (db.reqs.filter(r => r.from === uid).length >= 30) return err(ws, 'Você tem pedidos pendentes demais.');
      db.reqs.push({ from: uid, to: to.id, ts: Date.now() }); save();
      send(ws, { t: 'reqOut', u: pub(to) }); toUser(to.id, { t: 'reqIn', u: pub(u) }); break;
    }
    case 'reqAcc': { const from = str(m.from, 30); if (db.reqs.some(r => r.from === from && r.to === uid)) acceptReq(from, uid); break; }
    case 'reqDec': { const from = str(m.from, 30); db.reqs = db.reqs.filter(r => !(r.from === from && r.to === uid)); save(); toUser(uid, { t: 'reqRm', code: from }); toUser(from, { t: 'reqRm', code: uid }); break; }
    case 'reqCnl': { const to = str(m.to, 30); db.reqs = db.reqs.filter(r => !(r.from === uid && r.to === to)); save(); toUser(uid, { t: 'reqRm', code: to }); toUser(to, { t: 'reqRm', code: uid }); break; }
    case 'unf': {
      const o = db.users[str(m.code, 30)]; if (!o || !u.friends.includes(o.id)) return;
      u.friends = u.friends.filter(x => x !== o.id); o.friends = o.friends.filter(x => x !== uid); save();
      toUser(uid, { t: 'frDel', code: o.id }); toUser(o.id, { t: 'frDel', code: uid }); break;
    }
    case 'msg': {
      const key = str(m.c, 80), txt = str(m.m, 2000).trim(), a = access(uid, key);
      if (!a || a.type === 'v' || !txt) return;
      const msg = { id: rnd(6), k: uid, u: u.name, m: txt, ts: Date.now() };
      const arr = db.msgs[key] = db.msgs[key] || []; arr.push(msg); if (arr.length > 2000) arr.splice(0, arr.length - 2000); save();
      toUsers(a.members, { t: 'msg', c: key, m: msg }); break;
    }
    case 'hist': {
      const key = str(m.c, 80), a = access(uid, key); if (!a || a.type === 'v') return;
      send(ws, { t: 'hist', c: key, msgs: (db.msgs[key] || []).slice(-100) }); break;
    }
    /* ----- servidores ----- */
    case 'sNew': {
      const name = str(m.name, 32).trim(); if (!name) return err(ws, 'Dê um nome ao servidor.');
      if (Object.values(db.servers).filter(s => s.owner === uid).length >= 10) return err(ws, 'Limite de 10 servidores por conta.');
      const id = 's' + rnd(4);
      const s = db.servers[id] = { id, name, desc: str(m.desc, 160).trim(), icon: okImg(m.icon, 80000), owner: uid, v: 1,
        roles: [{ id: 'adm', name: 'Admin', color: '#D8082F', manage: true }, { id: 'mem', name: 'Membro', color: '#6b5d52', manage: false }],
        members: [{ c: uid, r: ['adm'] }], chans: [{ id: 'c1', n: 'geral', t: 't' }, { id: 'c2', n: 'Sala de voz', t: 'v' }] };
      save(); send(ws, { t: 'srv', srv: srvView(s, true), open: 1 }); break;
    }
    case 'sEdit': case 'sRoleAdd': case 'sRoleDel': case 'sMemRole': case 'sChanAdd': case 'sChanDel': case 'sInv': case 'sKick': {
      const s = db.servers[str(m.id, 30)]; if (!s || !mem(s, uid)) return;
      if (!canManage(s, uid)) return err(ws, 'Você não tem permissão para isso.');
      let icon = false;
      if (m.t === 'sEdit') { s.name = str(m.name, 32).trim() || s.name; s.desc = str(m.desc, 160).trim(); if (typeof m.icon === 'string') { s.icon = okImg(m.icon, 80000); icon = true; } }
      else if (m.t === 'sRoleAdd') { const n = str(m.name, 24).trim(); if (!n || s.roles.length >= 20) return; s.roles.push({ id: 'r' + rnd(3), name: n, color: isHex(m.color) ? m.color : '#888888', manage: !!m.manage }); }
      else if (m.t === 'sRoleDel') { const r = str(m.r, 24); if (r === s.roles[0].id) return; s.roles = s.roles.filter(x => x.id !== r); s.members.forEach(x => x.r = x.r.filter(y => y !== r)); }
      else if (m.t === 'sMemRole') { const x = mem(s, str(m.m, 30)), r = str(m.r, 24); if (!x || x.c === s.owner || !s.roles.some(y => y.id === r)) return; x.r = m.on ? [...new Set([...x.r, r])] : x.r.filter(y => y !== r); }
      else if (m.t === 'sChanAdd') {
        if (s.chans.length >= 50) return; const v = m.ch === 'v'; let n = str(m.n, 24).trim(); if (!n) return; if (!v) n = n.toLowerCase().replace(/\s+/g, '-');
        s.chans.push({ id: 'c' + rnd(3), n, t: v ? 'v' : 't' });
      }
      else if (m.t === 'sChanDel') {
        const c = s.chans.find(x => x.id === str(m.ch, 24)); if (!c) return;
        if (c.t === 't' && s.chans.filter(x => x.t === 't').length < 2) return err(ws, 'Mantenha pelo menos um canal de texto.');
        s.chans = s.chans.filter(x => x !== c); delete db.msgs[s.id + ':' + c.id];
        const k = s.id + ':' + c.id; if (voice[k]) { for (const w of voice[k]) delete inV[w]; delete voice[k]; toUsers(memberIds(s), { t: 'vs', c: k, on: [] }); }
      }
      else if (m.t === 'sInv') {
        const added = [];
        for (const id of (Array.isArray(m.ids) ? m.ids.slice(0, 20) : [])) {
          const o = db.users[str(id, 30)]; if (!o || mem(s, o.id) || !u.friends.includes(o.id) || s.members.length >= 100) continue;
          s.members.push({ c: o.id, r: ['mem'] }); added.push(o.id);
        }
        if (!added.length) return; s.v++; save(); pushSrv(s, false, memberIds(s).filter(x => !added.includes(x))); pushSrv(s, true, added); return;
      }
      else if (m.t === 'sKick') {
        const k = str(m.m, 30); if (k === s.owner || k === uid || !mem(s, k)) return;
        s.members = s.members.filter(x => x.c !== k); s.v++; save(); toUser(k, { t: 'sDel', id: s.id }); pushSrv(s, false); return;
      }
      s.v++; save(); pushSrv(s, icon); break;
    }
    case 'sLeave': { const s = db.servers[str(m.id, 30)]; if (!s || !mem(s, uid) || s.owner === uid) return; s.members = s.members.filter(x => x.c !== uid); s.v++; save(); toUser(uid, { t: 'sDel', id: s.id }); pushSrv(s, false); break; }
    case 'sDel': {
      const s = db.servers[str(m.id, 30)]; if (!s || s.owner !== uid) return;
      const ids = memberIds(s); for (const c of s.chans) { delete db.msgs[s.id + ':' + c.id]; const k = s.id + ':' + c.id; if (voice[k]) { for (const w of voice[k]) delete inV[w]; delete voice[k]; } }
      delete db.servers[s.id]; save(); toUsers(ids, { t: 'sDel', id: s.id }); break;
    }
    /* ----- voz, ligações e sinalização WebRTC ----- */
    case 'vj': { const k = str(m.c, 80), a = access(uid, k); if (!a || a.type === 't') return; vleave(uid); (voice[k] = voice[k] || new Set()).add(uid); inV[uid] = k; vbroadcast(k); break; }
    case 'vl': vleave(uid); break;
    case 'mu': { const k = inV[uid]; if (!k) return; (voice[k] || []).forEach(x => x !== uid && toUser(x, { t: 'mu', from: uid, on: !!m.on })); break; }
    case 'ring': case 'ra': case 'rr': case 'rx': {
      const to = str(m.to, 30); if (!db.users[to] || !u.friends.includes(to)) return;
      if (m.t === 'ring' && !online(to)) return err(ws, 'Essa pessoa está offline.');
      toUser(to, { t: m.t, from: uid }); break;
    }
    case 'sig': {
      const to = str(m.to, 30); if (!inV[uid] || inV[uid] !== inV[to]) return;
      if (JSON.stringify(m.d || {}).length > 30000) return;
      toUser(to, { t: 'sig', from: uid, k: m.k === 'screen' ? 'screen' : 'voice', d: m.d }); break;
    }
  }
}

/* ---------- HTTP (site, app online e configuração) ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.exe': 'application/octet-stream', '.zip': 'application/zip', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (url.pathname === '/api/version') { const v = readVersion(); res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); return res.end(JSON.stringify({ version: v.version, download: v.download })); }
  let p; try { p = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  const f = path.normalize(path.join(PUB, p.endsWith('/') ? p + 'index.html' : p));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (e, s) => {
    if (!e && s.isDirectory()) { res.writeHead(301, { location: url.pathname.replace(/\/?$/, '/') }); return res.end(); }
    if (e || !s.isFile()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    const hd = { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' };
    if (f === path.join(PUB, 'app', 'index.html')) { // injeta a versão atual: o app sabe se está desatualizado
      return fs.readFile(f, 'utf8', (e2, html) => { if (e2) { res.writeHead(500); return res.end(); } res.writeHead(200, hd); res.end(html.replace('__ECHOO_VERSION__', APP_VER)); });
    }
    res.writeHead(200, hd); fs.createReadStream(f).pipe(res);
  });
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 700 * 1024 });
wss.on('connection', (ws, req) => {
  ws.ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', buf => {
    let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (!bucket(ws)) return err(ws, 'Muitas ações em pouco tempo.');
    try { handle(ws, m); } catch (e) { console.error('erro:', e); }
  });
  ws.on('close', () => {
    const uid = ws.uid; if (!uid) return; const set = clients.get(uid); if (set) { set.delete(ws); if (!set.size) { clients.delete(uid); vleave(uid); const u = db.users[uid]; if (u) presence(u); } }
  });
});
setInterval(() => wss.clients.forEach(w => { if (!w.alive) return w.terminate(); w.alive = false; w.ping(); }), 30000);
loadDb().then(() => server.listen(PORT, () => console.log('ECHOO servidor em http://localhost:' + PORT))).catch(e => { console.error('Falha ao iniciar:', e.message); process.exit(1); });
