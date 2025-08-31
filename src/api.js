// src/api.js — tRPC client (kompat lama & baru) untuk Appleville
// - GET & POST ditandatangani header baru: x-xcsa3d / x-dbsv / x-dsa
// - getState() return shape kompat: { ok, user, state, _raw }
// - Factory makeApi() kompat dengan push.js lama
// Node 18+ (global fetch)

import crypto from "crypto";

/* ================= Const ================= */
export const BASE = "https://app.appleville.xyz/api/trpc";
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

/* ================= JSONL helpers ================= */
export function parseJsonLines(text) {
  try { return JSON.parse(text); } catch {}
  const lines = String(text || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
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
    if (typeof v === "object") {
      if (Array.isArray(v.plots)) found = v;
      for (const k in v) rec(v[k]);
    }
  }
  for (const fr of frames) rec(fr?.json ?? fr?.result?.data?.json ?? fr);
  return found;
}

function unwrapMutation(resp) {
  if (!resp || !resp.ok) return { ok:false, err:"no response", raw: resp?.raw || "" };
  const raw = resp.raw || "";
  if (/\"error\"/i.test(raw)) {
    try {
      const lines = raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const last = JSON.parse(lines[lines.length-1]);
      const errObj = last?.json?.[0]?.[0]?.error || last?.error || last?.result?.error || last;
      const msg = errObj?.message || errObj?.data?.message || errObj?.data?.code || errObj?.code || JSON.stringify(errObj);
      return { ok:false, err: msg, raw };
    } catch { return { ok:false, err:"unknown error", raw }; }
  }
  return { ok:true, data: resp.frames, raw };
}

/* ================= SECRET & Signing ================= */
// SECRET diambil dari bundle Next.js (urutan indeks [2,1,0,2,1,2])
function deriveSecretFromApp() {
  const parts = ["bbsds!eda", "2", "3ed2@#@!@#Ffdf#@!", "4"];
  const idx = [2, 1, 0, 2, 1, 2];
  return idx.map(i => parts[i]).join("");
}
const SECRET = deriveSecretFromApp();

function randomNonceHex(bytes = 16) { return crypto.randomBytes(bytes).toString("hex"); }

// Versi umum (normalize undefined/null → {} untuk mayoritas endpoint)
export function signPayloadCore(payload) {
  const norm = payload === undefined || payload === null ? {} : payload;
  const timestamp = Date.now();
  const nonce = randomNonceHex(16);
  const msg = `${timestamp}.${nonce}.${JSON.stringify(norm)}`;
  const signature = crypto.createHmac("sha256", SECRET).update(msg).digest("hex");
  return { signature, timestamp, nonce };
}

// Versi literal string (untuk GET "undefined"/"{}" atau POST "null")
function signWithString(literal) {
  const timestamp = Date.now();
  const nonce = randomNonceHex(16);
  const msg = `${timestamp}.${nonce}.${literal}`;
  const signature = crypto.createHmac("sha256", SECRET).update(msg).digest("hex");
  return { signature, timestamp, nonce };
}

/* ================= Fetch + Retry ================= */
async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function fetchWithRetry(url, init, { attempts = 5, baseDelay = 400 } = {}) {
  let lastErr;
  for (let i=0; i<attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"))
          || baseDelay * Math.pow(1.6, i) + Math.floor(Math.random()*150);
        await sleep(retryAfter);
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(baseDelay * Math.pow(1.6, i) + Math.floor(Math.random()*120));
    }
  }
  throw lastErr;
}

/* ================= Low-level tRPC ================= */
function baseHeaders({ cookie, authToken, accept = "*/*", trpcAccept = "application/jsonl" }) {
  const h = {
    accept,
    "user-agent": DEFAULT_UA,
    origin: "https://app.appleville.xyz",
    referer: "https://app.appleville.xyz/",
    cookie: cookie || "",
    "trpc-accept": trpcAccept,
    "x-trpc-source": "nextjs-react",
  };
  if (authToken) h["authorization"] = authToken; // "Bearer ..." atau token mentah
  return h;
}

export async function trpcGetBatch(cookie, paths, authToken, {
  signString = "{}",
  accept = "*/*",
  trpcAccept = "application/jsonl",
} = {}) {
  const url = `${BASE}/${paths.join(",")}?batch=1`;
  const sig = signWithString(signString);
  const headers = {
    ...baseHeaders({ cookie, authToken, accept, trpcAccept }),
    "x-xcsa3d": sig.signature,
    "x-dbsv": String(sig.timestamp),
    "x-dsa": sig.nonce,
  };
  const res = await fetchWithRetry(url, { method: "GET", headers });
  const text = await res.text();
  const frames = parseJsonLines(text);
  return { ok: !!frames, status: res.status, frames, raw: text };
}

export async function trpcPost(cookie, path, inputObj, authToken, {
  signLiteral,                 // jika diset, pakai literal ("null"/"{}"/"undefined")
  accept = "*/*",
  trpcAccept = "application/jsonl",
} = {}) {
  const url = `${BASE}/${path}?batch=1`;
  const hasJson0 =
    inputObj && inputObj["0"] && Object.prototype.hasOwnProperty.call(inputObj["0"], "json");
  const pure = hasJson0 ? inputObj["0"].json : undefined;
  const sig = signLiteral != null ? signWithString(signLiteral) : signPayloadCore(pure);
  const headers = {
    ...baseHeaders({ cookie, authToken, accept, trpcAccept }),
    "content-type": "application/json",
    "x-xcsa3d": sig.signature,
    "x-dbsv": String(sig.timestamp),
    "x-dsa": sig.nonce,
  };
  const res = await fetchWithRetry(url, { method: "POST", headers, body: JSON.stringify(inputObj ?? {}) });
  const text = await res.text();
  const frames = parseJsonLines(text);
  return { ok: !!frames, status: res.status, frames, raw: text };
}

/* ================= High-level ================= */
// getState: robust + kompat (return { ok, user, state, _raw })
export async function getState(cookie, authToken) {
  // 1) GET ["auth.me","core.getState"] signed "undefined" (header accept/trpc-accept default)
  let r = await trpcGetBatch(cookie, ["auth.me", "core.getState"], authToken, { signString: "undefined" });
  let state = findStateFromFrames(r.frames);
  if (state) return { ok: true, user: null, state, _raw: r };

  // 2) Fallback GET ... signed "{}"
  r = await trpcGetBatch(cookie, ["auth.me", "core.getState"], authToken, { signString: "{}" });
  state = findStateFromFrames(r.frames);
  if (state) return { ok: true, user: null, state, _raw: r };

  // 3) Fallback GET hanya ["core.getState"] signed "undefined"
  r = await trpcGetBatch(cookie, ["core.getState"], authToken, { signString: "undefined" });
  state = findStateFromFrames(r.frames);
  if (state) return { ok: true, user: null, state, _raw: r };

  // 4) Fallback GET accept 'application/json' + trpc-accept 'application/json'
  r = await trpcGetBatch(cookie, ["auth.me", "core.getState"], authToken, {
    signString: "undefined",
    accept: "application/json",
    trpcAccept: "application/json",
  });
  state = findStateFromFrames(r.frames);
  if (state) return { ok: true, user: null, state, _raw: r };

  // 5) Fallback POST body null (sign "null")
  const input = { 0: { json: null } };
  r = await trpcPost(cookie, "core.getState", input, authToken, {
    signLiteral: "null",
    accept: "application/json",
    trpcAccept: "application/json",
  });
  state = findStateFromFrames(r.frames);
  return { ok: !!state, user: null, state: state || null, _raw: r };
}

/* Mutasi versi baru (nama pendek) */
export async function harvest(cookie, slotIndexes, authToken) {
  const input = { 0: { json: { slotIndexes: Array.from(slotIndexes || []) } } };
  return trpcPost(cookie, "core.harvest", input, authToken);
}
export async function plant(cookie, slotIndexes, seedKey, authToken) {
  const input = { 0: { json: { slotIndexes: Array.from(slotIndexes || []), seedKey } } };
  return trpcPost(cookie, "core.plant", input, authToken);
}
export async function buyPlot(cookie, count = 1, authToken) {
  const input = { 0: { json: { count } } };
  return trpcPost(cookie, "core.buyPlot", input, authToken);
}

/* === PRESTIGE (baru) === */
// Coba rute baru 'prestige.performReset' (body null, sign "null"),
// lalu fallback ke rute lama jika server masih pakai nama lama.
export async function prestige(cookie, authToken) {
  const input = { 0: { json: null } };

  // v1: rute utama sekarang
  let r = await trpcPost(cookie, "prestige.performReset", input, authToken, {
    signLiteral: "null",
    accept: "application/json",
    trpcAccept: "application/json",
  });
  let out = unwrapMutation(r);
  if (out.ok) return out;

  // fallback lama #1
  r = await trpcPost(cookie, "core.prestige", input, authToken, {
    signLiteral: "null",
    accept: "application/json",
    trpcAccept: "application/json",
  });
  out = unwrapMutation(r);
  if (out.ok) return out;

  // fallback lama #2
  r = await trpcPost(cookie, "core.resetPrestige", input, authToken, {
    signLiteral: "null",
    accept: "application/json",
    trpcAccept: "application/json",
  });
  return unwrapMutation(r);
}

/* Wrapper nama lama (kompat logic lama) */
export async function harvestMany(cookie, slotIndexes = [], authToken) {
  if (!slotIndexes.length) return { ok:true, data:{ plotResults: [] } };
  const input = { 0: { json: { slotIndexes } } };
  const r = await trpcPost(cookie, "core.harvest", input, authToken);
  return unwrapMutation(r);
}
export async function plantMany(cookie, plantings = [], authToken) {
  // kompat lama: endpoint "core.plantSeed" dengan { plantings }
  if (!plantings.length) return { ok:true, data:{ plantedSeeds: 0 } };
  const input = { 0: { json: { plantings } } };
  const r = await trpcPost(cookie, "core.plantSeed", input, authToken);
  return unwrapMutation(r);
}
export async function buySeeds(cookie, seedKey, quantity, authToken) {
  const input = { 0: { json: { purchases: [ { key: seedKey, type: "SEED", quantity } ] } } };
  const r = await trpcPost(cookie, "core.buyItem", input, authToken);
  return unwrapMutation(r);
}
export async function buyModifier(cookie, modifierKey, quantity, authToken) {
  const input = { 0: { json: { purchases: [ { key: modifierKey, type: "MODIFIER", quantity } ] } } };
  const r = await trpcPost(cookie, "core.buyItem", input, authToken);
  return unwrapMutation(r);
}
export async function applyModifier(cookie, applications = [], authToken) {
  if (!applications.length) return { ok:true, data:{ appliedModifiers: 0 } };
  const input = { 0: { json: { applications } } };
  const r = await trpcPost(cookie, "core.applyModifier", input, authToken);
  return unwrapMutation(r);
}

/* ================= Factory (compat push.js) ================= */
export function makeApi(cookieOrOpts, opts) {
  const c =
    typeof cookieOrOpts === "string"
      ? cookieOrOpts
      : (cookieOrOpts && cookieOrOpts.cookie) || "";
  const token =
    (typeof cookieOrOpts === "object" && cookieOrOpts && (cookieOrOpts.authToken || cookieOrOpts.authorization || cookieOrOpts.token)) ||
    (opts && (opts.authToken || opts.authorization || opts.token));

  return {
    BASE,
    parseJsonLines,
    // state (kompat)
    getState: () => getState(c, token),
    // nama lama
    harvestMany: (slotIndexes=[]) => harvestMany(c, slotIndexes, token),
    plantMany:   (plantings=[])   => plantMany(c, plantings, token),
    buySeeds:    (key,q)          => buySeeds(c, key, q, token),
    buyModifier: (key,q)          => buyModifier(c, key, q, token),
    applyModifier:(apps=[])       => applyModifier(c, apps, token),
    buyPlot:     ()               => buyPlot(c, 1, token),
    // nama baru (opsional)
    harvest:     (slotIndexes=[]) => harvest(c, slotIndexes, token),
    plant:       (slotIndexes, k) => plant(c, slotIndexes, k, token),
    prestige:    ()               => prestige(c, token),            // <<— ditambahkan
    trpcGetBatch:(paths, opts)    => trpcGetBatch(c, paths, token, opts),
    trpcPost:    (path, body, o)  => trpcPost(c, path, body, token, o),
    _cookie: c,
  };
}

/* ================= Debug ================= */
export function redactCookie(c) {
  if (!c) return "";
  return c.replace(/session-token=([^;]+)/, "session-token=***")
          .replace(/__Host-authjs\.csrf-token=([^;]+)/, "__Host-authjs.csrf-token=***");
}
export function debugDump(label, { url, headers, status, bodyPreview }) {
  if (!process.env.DEBUG) return;
  console.log(
    `[DEBUG] ${label}\n`,
    url,
    "\nstatus:", status,
    "\nheaders:", Object.fromEntries(
      Object.entries(headers || {}).map(([k, v]) =>
        k === "cookie" ? [k, redactCookie(String(v))] : [k, v]
      )
    ),
    bodyPreview ? `\nbody: ${bodyPreview.slice(0, 200)}…` : ""
  );
}

/* default export (opsional) */
const api = {
  BASE,
  parseJsonLines,
  trpcGetBatch,
  trpcPost,
  getState,
  harvest,
  plant,
  buyPlot,
  prestige,        // <<— ditambahkan
  harvestMany,
  plantMany,
  buySeeds,
  buyModifier,
  applyModifier,
  makeApi,
};
export default api;
