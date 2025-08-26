// src/api_claim_base_plot.js
// Addon: menambahkan api.claimBasePlot() dengan header & JSONL yang sama persis seperti src/api.js.
// Tujuan: klaim base plot setelah prestige (UI "Claim") atau fallback buyPlot(null) bila memang gratis.
// Hasil klaim SELALU diverifikasi di push.js melalui getState().

import cfg from './config.js';
import crypto from 'node:crypto';

// === util kecil (copy gaya api.js) ===
const baseUrl = String(cfg.baseUrl || 'https://app.appleville.xyz/api/trpc').replace(/\/+$/, '');
const JSONL = 'application/jsonl';
const randHex = (n=16)=>crypto.randomBytes(n).toString('hex');

function buildHeaders(rawCookie) {
  return {
    'accept': '*/*',
    'content-type': 'application/json',
    'trpc-accept': JSONL,
    'x-trpc-source': 'nextjs-react',
    'x-client-time': String(Date.now()),
    'x-trace-id': randHex(16),
    'cookie': String(rawCookie || '')
  };
}
function parseJsonl(text='') {
  const lines = String(text).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const frames = [];
  for (const ln of lines) {
    try { frames.push(JSON.parse(ln)); } catch { frames.push({ _raw: ln }); }
  }
  return frames;
}
function trpcPath(p){ return `${baseUrl}/${encodeURIComponent(p)}?batch=1`; }

async function trpcPost(path, payload, rawCookie) {
  const res = await fetch(trpcPath(path), {
    method: 'POST',
    headers: buildHeaders(rawCookie),
    body: JSON.stringify(payload ?? { "0": { "json": null } })
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, raw: text, frames: parseJsonl(text) };
}
function unwrapMutation(resp) {
  if (!resp || (resp.status && resp.status >= 400)) {
    return { ok:false, err: `http ${resp?.status||'error'}`, raw: resp?.raw, frames: resp?.frames||[] };
  }
  // Cari error di frames (sederhana): kalau ada "error" di frame manapun, treat error
  for (const fr of resp.frames || []) {
    // pola tRPC umum
    if (fr?.error) return { ok:false, err: fr.error, raw: resp.raw, frames: resp.frames };
    const j = fr?.json;
    if (Array.isArray(j)) {
      const stack=[j];
      while (stack.length) {
        const v = stack.pop();
        if (Array.isArray(v)) { for (const k of v) stack.push(k); }
        else if (v && typeof v === 'object') {
          if (v.error) return { ok:false, err: v.error, raw: resp.raw, frames: resp.frames };
          for (const val of Object.values(v)) if (val && (typeof val === 'object' || Array.isArray(val))) stack.push(val);
        }
      }
    }
  }
  return { ok:true, data: resp.frames, raw: resp.raw, frames: resp.frames };
}

export function withClaimBasePlot(api, rawCookie) {
  if (typeof api.claimBasePlot === 'function') return api;

  // Coba endpoint- endpoint klaim prestise + fallback core/buyPlot(null)
  // Urutan penting: prestige.* dulu (sesuai UI "Claim"), lalu core.claim*, terakhir buyPlot(null).
  const CANDIDATES = [
    // keluarga prestige
    { ep: 'prestige.claimRewards', payloads: [ { }, { reward: 'plot' }, { rewards: ['plot'] } ] },
    { ep: 'prestige.claimReward',  payloads: [ { }, { reward: 'plot' } ] },

    // kemungkinan di core
    { ep: 'core.claimReward',      payloads: [ { }, { reward: 'plot' } ] },
    { ep: 'rewards.claim',         payloads: [ { }, { reward: 'plot' }, { rewards: ['plot'] } ] },

    // variasi "claim base plot" yang pernah kita coba
    { ep: 'core.claimBasePlot',    payloads: [ { } ] },
    { ep: 'core.claimStarterPlot', payloads: [ { } ] },
    { ep: 'core.claimPlot',        payloads: [ { } ] },
    { ep: 'core.initializePlot',   payloads: [ { } ] },
    { ep: 'core.initPlot',         payloads: [ { } ] },
    { ep: 'core.freePlot',         payloads: [ { } ] },

    // fallback terakhir: treat base plot pertama sebagai "beli" dengan harga 0 → wajib NULL
    { ep: 'core.buyPlot',          payloads: [ { "0": { "json": null } }, null ] },
  ];

  async function postAuto(ep, jsonPayloadMaybe) {
    // untuk payload bentuk "batched siap pakai"
    if (jsonPayloadMaybe && jsonPayloadMaybe["0"] && jsonPayloadMaybe["0"].hasOwnProperty("json")) {
      return trpcPost(ep, jsonPayloadMaybe, rawCookie);
    }
    // normal: kita bungkus ke { "0": { "json": ... } }
    return trpcPost(ep, { "0": { "json": jsonPayloadMaybe ?? {} } }, rawCookie);
  }

  api.claimBasePlot = async function claimBasePlot() {
    let last = null;
    for (const { ep, payloads } of CANDIDATES) {
      for (const p of payloads) {
        try {
          const r = await postAuto(ep, p);
          const un = unwrapMutation(r);
          if (un.ok) return un;   // server tidak protes → kita anggap "attempt ok", verifikasi efeknya di push.js
          last = un;
        } catch (e) {
          last = { ok:false, err: e?.message || String(e) };
        }
      }
    }
    return last || { ok:false, err:'unknown-error' };
  };

  return api;
}
