// src/cli.js — parallel multi-account + progress logs per akun + HEADER txt + COLOR + JSONC
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import cfg from './config.js';
import { makeApi } from './api.js';
import { getState } from './api.js'; // single-account legacy (masih disimpan)
import { runPlantCycle, slotsFromState, pickEmptySlots, readySlots } from './logic.js';
import { seedList } from '../data/seeds.js';
import { boosterList } from '../data/boosters.js';
import { fmtSec } from './utils/time.js';
import { c, colorizeLine, line, pickNameColor } from './utils/term.js';

// >>> Tambahan penting untuk menu Push Prestige:
import { pushPrestigeLoopAll } from './push.js';

const rl = readline.createInterface({ input, output });
const nowStr = () => new Date().toLocaleTimeString('sv-SE', { hour12:false });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ========= BANNER / HEADER ========= */
function readBannerText() {
  // prioritas: env → data/shogun.txt → shogun.txt → data/banner.txt
  const candidates = [];
  if (process.env.BANNER_FILE) candidates.push(process.env.BANNER_FILE);
  candidates.push(path.resolve('data/shogun.txt'));
  candidates.push(path.resolve('shogun.txt'));
  candidates.push(path.resolve('data/banner.txt'));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const txt = fs.readFileSync(p, 'utf-8');
        return txt.replace(/\s+$/, ''); // rapihin trailing blank lines
      }
    } catch {}
  }
  return null;
}
function printBanner() {
  const b = readBannerText();
  if (!b) return;
  console.log('\n' + line());
  console.log(c.bold(b));
  console.log(line() + '\n');
}
/* ======== END BANNER ========= */

/* ========= JSONC (JSON + komentar & trailing comma) ========= */
function stripJsonComments(input) {
  let out = '';
  let inStr = false, quote = '', esc = false;
  let inLine = false, inBlock = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const nx = input[i + 1];

    if (inLine) {
      if (ch === '\n') { inLine = false; out += ch; }
      continue;
    }
    if (inBlock) {
      if (ch === '*' && nx === '/') { inBlock = false; i++; }
      continue;
    }
    if (inStr) {
      out += ch;
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === quote) { inStr = false; quote = ''; }
      continue;
    }

    if (ch === '"' || ch === "'") { inStr = true; quote = ch; out += ch; continue; }
    if (ch === '/' && nx === '/') { inLine = true; i++; continue; }
    if (ch === '/' && nx === '*') { inBlock = true; i++; continue; }

    out += ch;
  }
  return out;
}
function removeTrailingCommas(s) {
  return s.replace(/,\s*([}\]])/g, '$1');
}
function readJsonFlexible(p) {
  try {
    let txt = fs.readFileSync(p, 'utf-8');
    // dukung komentar & trailing comma
    txt = stripJsonComments(txt);
    txt = removeTrailingCommas(txt);
    const obj = JSON.parse(txt);
    if (Array.isArray(obj)) return obj;
    if (obj && Array.isArray(obj.accounts)) return obj.accounts;
  } catch {}
  return null;
}
/* ======== END JSONC ========= */

function normalizeEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const raw = e.rawCookie || e.cookie || e.RAW_COOKIE || e.raw_cookie || '';
  if (typeof raw !== 'string' || !raw.includes('=')) return null;
  return { name: e.name || 'Akun', rawCookie: raw.trim() };
}

async function loadAllAccounts() {
  const out = [];

  // 1) JSON/JSONC
  const jsonPath = path.resolve('data/accounts.json');
  const arr = fs.existsSync(jsonPath) ? readJsonFlexible(jsonPath) : null;
  if (Array.isArray(arr)) arr.forEach(x => { const n = normalizeEntry(x); if (n) out.push(n); });

  // 2) JS module (bisa pakai komentar bebas)
  const jsCandidates = [
    path.resolve('data/accounts.js'),
    path.resolve('config/accounts.js'),
    path.resolve('config/account.js'),
    path.resolve('accounts.js'),
    path.resolve('account.js'),
  ];
  for (const p of jsCandidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const mod = await import(pathToFileURL(p).href);
      const raw = (mod && (mod.ACCOUNTS || mod.default)) || null;
      if (Array.isArray(raw)) raw.forEach(x => { const n = normalizeEntry(x); if (n) out.push(n); });
    } catch {}
  }

  // de-dup by cookie
  const seen = new Set(); const dedup = [];
  for (const a of out) {
    if (seen.has(a.rawCookie)) continue;
    seen.add(a.rawCookie);
    dedup.push(a);
  }
  return dedup;
}

async function chooseSeedAndBooster() {
  const seeds = seedList();
  console.log(c.bold("\n== Seeds =="));
  seeds.forEach((s, i) => {
    console.log(`${c.cyan(String(i + 1).padStart(2, '0'))}. ${c.bold(s.name)} (${s.growSeconds}s, ${s.price} ${s.currency})`);
  });
  const si = await rl.question(c.yellow("Pilih seed [default=1]: "));
  const idx = (parseInt(si) || 1) - 1;
  const seed = seeds[Math.max(0, Math.min(idx, seeds.length - 1))];

  const boosters = boosterList();
  console.log(c.bold("\n== Boosters =="));
  boosters.forEach((b, i) => {
    console.log(`${c.cyan(String(i + 1).padStart(2, '0'))}. ${c.bold(b.name)} (speed x${b.speedMult}, yield x${b.yieldMult})`);
  });
  const bi = await rl.question(c.yellow("Pilih booster [default=1: No Booster]: "));
  const bidx = (parseInt(bi) || 1) - 1;
  const booster = boosters[Math.max(0, Math.min(bidx, boosters.length - 1))];

  return { seedKey: seed.key, boosterKey: booster.key };
}

function summarizeState(state) {
  const coins = state?.coins ?? 0;
  const ap    = state?.ap ?? state?.apples ?? 0;
  const slots = slotsFromState(state);
  const empties = pickEmptySlots(state, slots);
  const ready = readySlots(state, slots);
  const growing = Math.max(0, slots.length - empties.length - ready.length);
  return { coins, ap, plots: slots.length, empty: empties.length, ready: ready.length, growing };
}

async function workerLoop(account, seedKey, boosterKey, abortedRef) {
  const api = makeApi(account.rawCookie);

  // tag & warna
  const tagColor = pickNameColor(account.name);
  const tag = tagColor(`[${account.name}]`);
  const timeDim = () => c.dim(`[${nowStr()}]`);
  const log = (msg) => console.log(`${timeDim()} ${tag} ${colorizeLine(msg)}`);

  // info awal
  const st0 = await api.getState();
  if (st0?.ok && st0.state) {
    const s = summarizeState(st0.state);
    log(`💰 coins=${s.coins} • ap=${s.ap} • plots=${s.plots} (empty=${s.empty}, ready=${s.ready}, growing=${s.growing})`);
  } else {
    log(`❌ gagal ambil state awal: ${st0?.err || 'unknown'}`);
  }

  let cycles = 0;
  while (!abortedRef.stop) {
    cycles += 1;
    log(`🚀 cycle#${cycles} start — seed=${seedKey}, booster=${boosterKey}`);
    const r = await runPlantCycle({ seedKey, boosterKey, waitUntilHarvest: true }, api, log);
    if (!r?.ok) {
      const msg = typeof r.err === 'string' ? r.err : (r?.err?.message || JSON.stringify(r.err));
      log(`❌ gagal: ${msg}`);
    } else {
      log(`✅ cycle#${cycles} done — planted=${r.planted}, applied=${r.applied}, boughtPlots=${r.boughtPlots}, harvested=${r.harvestedFinal}, eta≈${r.eta ? fmtSec(r.eta) : '-'}`);
      const st = await api.getState();
      if (st?.ok && st.state) {
        const s = summarizeState(st.state);
        log(`💰 coins=${s.coins} • ap=${s.ap} • plots=${s.plots} (empty=${s.empty}, ready=${s.ready}, growing=${s.growing})`);
      }
    }
    await sleep(cfg.loopRestMs ?? 1500);
  }
  log('⏹️  berhenti.');
}

async function menuPlantLoopAll() {
  const accounts = await loadAllAccounts();
  if (!accounts.length) {
    console.log(c.red('Tidak menemukan akun di data/accounts.json atau accounts.js.'));
    return;
  }
  const { seedKey, boosterKey } = await chooseSeedAndBooster();
  console.log(c.bold(`\n🔁 START parallel — accounts=${accounts.length}, seed=${seedKey}, booster=${boosterKey}. Tekan Ctrl+C untuk berhenti.\n`));

  const ctrl = { stop: false };
  const onSig = () => { ctrl.stop = true; console.log(c.red('\n⏹️  Stop signal diterima, tunggu pekerja selesai...')); };
  process.once('SIGINT', onSig);
  await Promise.all(accounts.map(acc => workerLoop(acc, seedKey, boosterKey, ctrl)));
  process.off('SIGINT', onSig);
}

async function main() {
  printBanner(); // HEADER tampil di awal run
  console.log(c.bold("\n== MENU =="));
  console.log(`${c.cyan('1.')} ${c.bold('Plant LOOP (∞) — ALL ACCOUNTS (parallel)')}`);
  // >>> Tambahkan baris menu #2 di layar:
  console.log(`${c.cyan('2.')} ${c.bold('Push Prestige')}`);
  console.log(`${c.cyan('0.')} Keluar`);
  const ans = await rl.question(c.yellow("Pilih: "));
  if (ans.trim()==="1") { await menuPlantLoopAll(); }
  else if (ans.trim()==="2") { await pushPrestigeLoopAll(loadAllAccounts); }
  await rl.close();
  console.log(c.dim("Bye!"));
}

main().catch(e => { console.error(e); process.exit(1); });
