// src/api.js — parallel-safe: per-account API client + kompat top-level
// Versi ini mengikuti API non-prestige yang sudah terbukti sukses,
// hanya MENAMBAHKAN prestige(), tanpa mengubah pola request lainnya.
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = 'https://app.appleville.xyz/api/trpc';

/* ================= JSONL helpers ================= */
function parseJsonLines(text) {
  try { return JSON.parse(text); } catch {}
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const frames = [];
  for (const ln of lines) { try { frames.push(JSON.parse(ln)); } catch {} }
  return frames.length ? frames : null;
}

function findStateFromFrames(frames) {
  if (!Array.isArray(frames)) return null;
  let found = null;
  function rec(v) {
    if (!v) return;
    if (Array.isArray(v)) { v.forEach(rec); return; }
    if (typeof v === 'object') {
      if (Array.isArray(v.plots)) found = v;
      for (const k in v) rec(v[k]);
    }
  }
  for (const fr of frames) rec(fr?.json ?? fr);
  return found;
}

function unwrapMutation(resp) {
  if (!resp || !resp.ok) return { ok:false, err:'no response', raw: resp?.raw || '' };
  const raw = resp.raw || '';
  if (/\"error\"/i.test(raw)) {
    try {
      const lines = raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const last = JSON.parse(lines[lines.length-1]);
      const errObj = last?.json?.[0]?.[0]?.error || last?.error || last?.result?.error || last;
      const msg = errObj?.message || errObj?.data?.message || errObj?.data?.code || errObj?.code || JSON.stringify(errObj);
      return { ok:false, err: msg, raw };
    } catch { return { ok:false, err: 'unknown error', raw }; }
  }
  return { ok:true, data: resp.frames, raw };
}

/* ========= SIGNER (untuk POST) =========
   Mengikuti bundel web app:
   - Header signature: x-xas3d
   - Header time     : x-mhab  (timestamp ms)
   - Header nonce    : x-2sa3  (random hex 16B)
   Signature = HMAC-SHA256(secret, `${ts}.${nonce}.${JSON.stringify(payload)}`)
*/
const HEADERS = {
  SIG:   'x-xas3d',
  TIME:  'x-mhab',
  NONCE: 'x-2sa3',
};
// Secret hasil de-obfuscation dari bundle frontend
const SECRET = '333ed@#@!@#Ffdf#@!33ed@#@!@#Ffdf#@!';

function signPayload(inputJson) {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = JSON.stringify(inputJson ?? {});
  const msg = `${timestamp}.${nonce}.${payload}`;
  const signature = crypto.createHmac('sha256', SECRET).update(msg, 'utf8').digest('hex');
  return { signature, timestamp, nonce };
}

/* ========= LOW-LEVEL FETCH (per cookie) ========= */
async function trpcGetBatch(cookie, paths) {
  const url = `${BASE}/${paths.join(',')}?batch=1`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'cookie': cookie,
      'origin': 'https://app.appleville.xyz',
      'referer': 'https://app.appleville.xyz/',
      'user-agent': 'Mozilla/5.0',
      'trpc-accept': 'application/jsonl',
      'x-trpc-source': 'nextjs-react'
    }
  });
  const text = await res.text();
  const frames = parseJsonLines(text);
  return { ok: !!frames, status: res.status, frames, raw: text };
}

async function trpcPost(cookie, path, inputObj) {
  const url = `${BASE}/${path}?batch=1`;
  const sig = signPayload(inputObj?.['0']?.json ?? {});
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'cookie': cookie,
      'origin': 'https://app.appleville.xyz',
      'referer': 'https://app.appleville.xyz/',
      'user-agent': 'Mozilla/5.0',
      'trpc-accept': 'application/json',
      'x-trpc-source': 'nextjs-react',
      [HEADERS.SIG]:  sig.signature,
      [HEADERS.TIME]: String(sig.timestamp),
      [HEADERS.NONCE]: sig.nonce
    },
    body: JSON.stringify(inputObj)
  });
  const text = await res.text();
  const frames = parseJsonLines(text);
  return { ok: !!frames, status: res.status, frames, raw: text };
}

/* ========= PER-ACCOUNT CLIENT ========= */
export function makeApi(rawCookie) {
  const cookie = String(rawCookie || '').trim();
  if (!cookie || !cookie.includes('=')) throw new Error('Cookie kosong/invalid untuk makeApi');

  return {
    // === STATE ===
    async getState() {
      const batch = await trpcGetBatch(cookie, ['auth.me','core.getState']);
      if (!batch.ok) return { ok:false, err:'no payload', _raw: batch };
      const state = findStateFromFrames(batch.frames);
      return { ok: !!state, user: null, state, _raw: batch };
    },

    // === HARVEST ===
    async harvestMany(slotIndexes=[]) {
      if (!slotIndexes.length) return { ok:true, data:{ plotResults: [] } };
      const payload = { "0": { "json": { slotIndexes } } };
      const r = await trpcPost(cookie, 'core.harvest', payload);
      return unwrapMutation(r);
    },

    // === PLANT ===
    async plantMany(plantings=[]) {
      if (!plantings.length) return { ok:true, data:{ plantedSeeds: 0 } };
      const payload = { "0": { "json": { plantings } } };
      // Mengikuti versi sukses non-prestige: core.plantSeed
      const r = await trpcPost(cookie, 'core.plantSeed', payload);
      return unwrapMutation(r);
    },

    // === BUY (SEEDS/MODIFIERS) ===
    async buySeeds(seedKey, quantity) {
      const payload = { "0": { "json": { purchases: [ { key: seedKey, type: "SEED", quantity } ] } } };
      const r = await trpcPost(cookie, 'core.buyItem', payload);
      return unwrapMutation(r);
    },
    async buyModifier(modifierKey, quantity) {
      const payload = { "0": { "json": { purchases: [ { key: modifierKey, type: "MODIFIER", quantity } ] } } };
      const r = await trpcPost(cookie, 'core.buyItem', payload);
      return unwrapMutation(r);
    },

    // === APPLY BOOSTER ===
    async applyModifier(applications=[]) {
      if (!applications.length) return { ok:true, data:{ appliedModifiers: 0 } };
      const payload = { "0": { "json": { applications } } };
      const r = await trpcPost(cookie, 'core.applyModifier', payload);
      return unwrapMutation(r);
    },

    // === BUY PLOT ===
    async buyPlot() {
      // coba null dulu
      let r = await trpcPost(cookie, 'core.buyPlot', { "0": { "json": null } });
      let out = unwrapMutation(r);
      if (out.ok) return out;
      // fallback: {}
      r = await trpcPost(cookie, 'core.buyPlot', { "0": { "json": {} } });
      out = unwrapMutation(r);
      return out;
    },

    // === PRESTIGE (Tambahan) ===
    async prestige() {
      // cukup json:null sesuai HAR
      const payload = { "0": { "json": null } };
      const r = await trpcPost(cookie, 'prestige.performReset', payload);
      return unwrapMutation(r);
    },

    _cookie: cookie
  };
}

/* ========= KOMPAT: top-level API (single account lama) ========= */
let CURRENT_COOKIE = null;
function pickCookieFromEnvOrFile() {
  if (process.env.RAW_COOKIE && process.env.RAW_COOKIE.includes('=')) return process.env.RAW_COOKIE.trim();
  try {
    const p = path.join(__dirname, '..', 'akun.txt');
    const txt = fs.readFileSync(p,'utf8').trim();
    if (txt) return txt;
  } catch {}
  const sess = process.env.SESSION_TOKEN || process.env.NEXTAUTH_SESSION_TOKEN;
  const csrf = process.env.CSRF_TOKEN;
  if (sess) return `session-token=${sess}` + (csrf ? `; __Host-authjs.csrf-token=${csrf}` : '');
  return null;
}
export function setCookie(c){ CURRENT_COOKIE = (c && c.trim()) || pickCookieFromEnvOrFile(); if(!CURRENT_COOKIE) throw new Error('Cookie tidak ditemukan'); }
function ensureCookie(){ if(!CURRENT_COOKIE) setCookie(null); return CURRENT_COOKIE; }
const _Default = () => makeApi(ensureCookie());

export async function getState(){ return _Default().getState(); }
export async function harvestMany(a){ return _Default().harvestMany(a); }
export async function plantMany(a){ return _Default().plantMany(a); }
export async function buySeeds(k,q){ return _Default().buySeeds(k,q); }
export async function buyModifier(k,q){ return _Default().buyModifier(k,q); }
export async function applyModifier(a){ return _Default().applyModifier(a); }
export async function buyPlot(){ return _Default().buyPlot(); }
// Tambahan kompabilitas prestige di top-level (optional)
export async function prestige(){ return _Default().prestige(); }
