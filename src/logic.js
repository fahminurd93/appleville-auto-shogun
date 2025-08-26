// src/logic.js — cycle: harvest → saldo → auto-buy plot → plant → (booster) → wait → harvest
import cfg from './config.js';
import * as API from './api.js';
import { SEEDS } from '../data/seeds.js';
import { BOOSTERS } from '../data/boosters.js';
import { fmtSec } from './utils/time.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const now = () => Date.now();
const LABEL_WAIT = (cfg.countdownLabel || 'Wait For Harvest');

function getPlots(state){ return Array.isArray(state?.plots) ? state.plots : []; }
function getPlotsMap(state){ return new Map(getPlots(state).map(p => [p.slotIndex, p])); }
function hasSeed(p){ return Boolean(p?.seed?.key); }
function isEmpty(p){ return !hasSeed(p); }
function endTimeMs(p){ const t = p?.seed?.endsAt ? new Date(p.seed.endsAt).getTime() : null; return Number.isFinite(t)?t:null; }
function isReady(p, t = now()){ const e = endTimeMs(p); return Boolean(p?.seed?.key && e && e <= t); }
function hasActiveModifier(p){
  if (!p || typeof p !== 'object') return false;
  if (p.activeModifier) return true;
  if (p.modifier?.active || p.modifier?.key) return true;
  if (Array.isArray(p.modifiers)) return p.modifiers.some(m => m?.active || m?.key);
  return false;
}

export function slotsFromState(state){ return getPlots(state).map(p=>p.slotIndex).filter(Number.isInteger).sort((a,b)=>a-b); }
export function pickEmptySlots(state, slotList){ const m=getPlotsMap(state); const out=[]; for(const i of slotList||[]){ const p=m.get(i); if(p&&isEmpty(p)) out.push(i);} return out; }
export function readySlots(state, slotList){ const m=getPlotsMap(state); const out=[]; const t=now(); for(const i of slotList||[]){ const p=m.get(i); if(p&&isReady(p,t)) out.push(i);} return out.sort((a,b)=>a-b); }
export function slotsNeedingBooster(state, slotList){ const m=getPlotsMap(state); const out=[]; for(const i of slotList||[]){ const p=m.get(i); if(p&&!hasActiveModifier(p)) out.push(i);} return out; }

export async function harvestDue(stateInput=null, api=API, log=()=>{}){
  const st = stateInput ? { ok:true, state: stateInput } : await api.getState();
  if (!st?.ok || !st.state) return { ok:false, err: st?.err || 'no state' };
  const SLOTS = slotsFromState(st.state);
  const due = readySlots(st.state, SLOTS);
  if (!due.length) { log('ℹ️  no ready plots to harvest'); return { ok:true, harvested: 0, slots: [] }; }
  const hv = await api.harvestMany(due);
  if (!hv?.ok) return { ok:false, err: hv.err };
  log(`✅ harvested ${due.length} slot(s): [${due.join(', ')}]`);
  return { ok:true, harvested: due.length, slots: due };
}

function estimateEtaSeconds(seedKey, boosterKey='skip'){
  const base = SEEDS[seedKey]?.growSeconds ?? 30;
  const spd  = BOOSTERS[boosterKey]?.speedMult ?? 1.0;
  return Math.ceil(base / (spd>0?spd:1));
}

// helper qty tanpa reserve
function affordableQty(price, currency, balanceCoins, balanceAp, wantQty){
  if (!price || price <= 0) return wantQty;
  if (String(currency).toLowerCase().includes('ap')) {
    const max = Math.floor((balanceAp ?? 0) / price);
    return Math.max(0, Math.min(wantQty, max));
  }
  const max = Math.floor((balanceCoins ?? 0) / price);
  return Math.max(0, Math.min(wantQty, max));
}

// helper qty dengan menjaga reserve
function affordableQtyWithReserve(price, currency, coins, ap, wantQty, minCoins=0, minAp=0){
  const cur = String(currency || 'coins').toLowerCase();
  const safeCoins = Math.max(0, (coins ?? 0) - (minCoins ?? 0));
  const safeAp    = Math.max(0, (ap ?? 0) - (minAp ?? 0));
  if (!price || price <= 0) return wantQty;
  if (cur.includes('ap')) {
    const max = Math.floor(safeAp / price);
    return Math.max(0, Math.min(wantQty, max));
  }
  const max = Math.floor(safeCoins / price);
  return Math.max(0, Math.min(wantQty, max));
}

// tebak mata uang dari pesan error server (untuk log)
function currencyHintFromError(err) {
  try {
    const raw = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
    const s = (raw || '').toLowerCase();
    if (/\bapples?\b|\bapple\b|\bap\b/.test(s)) return 'ap';
    if (/\bcoins?\b|\bcoin\b/.test(s)) return 'coins';
  } catch {}
  return null;
}

/**
 * ensurePlantFlow
 * urutan log:
 *  - harvest
 *  - saldo + ringkasan slot (dengan info reserve opsional)
 *  - AUTO BUY PLOT (patuh target, limit per-cycle, dan reserve sesuai config)
 *  - deteksi slot kosong → beli seed (reserve BISA diabaikan sesuai config) → plant
 *  - booster selektif (patuh reserve sesuai config)
 */
export async function ensurePlantFlow({ seedKey, boosterKey='skip' }, api=API, log=()=>{}){
  // === HARVEST lebih dulu
  let st0 = await api.getState();
  if (!st0?.ok || !st0.state) return { ok:false, err: st0?.err || 'no state' };
  const hv0 = await harvestDue(st0.state, api, log);
  if (!hv0?.ok) return hv0;
  await sleep(cfg.coolDownMs);

  // === SALDO + RINGKASAN
  let st = await api.getState();
  if (!st?.ok || !st.state) return { ok:false, err: st?.err || 'no state' };

  let slotsAll = slotsFromState(st.state);
  let empties  = pickEmptySlots(st.state, slotsAll);
  const ready  = readySlots(st.state, slotsAll);
  let coins    = st.state?.coins ?? 0;
  let ap       = st.state?.ap ?? st.state?.apples ?? 0;
  const growing= Math.max(0, slotsAll.length - empties.length - ready.length);

  const reservePart = cfg.showReserveInBalance
    ? ` | reserve: coins≥${cfg.minCoinsReserve}, ap≥${cfg.minApReserve}`
    : '';
  log(`💰 balance: coins=${coins}, ap=${ap}${reservePart} | plots=${slotsAll.length} (empty=${empties.length}, ready=${ready.length}, growing=${growing})`);

  // === AUTO BUY PLOT — SETIAP CYCLE (patuh reserve jika diaktifkan)
  let boughtPlots = 0;
  if (cfg.autoExpandPlots) {
    const maxPerCycle = Math.max(0, cfg.maxAutoBuyPlots ?? 0);
    const target = Math.max(0, cfg.targetPlotCount ?? 0);
    let toTry = maxPerCycle;
    if (target > 0) {
      const need = Math.max(0, target - slotsAll.length);
      toTry = Math.min(toTry, need);
    }
    for (let i = 0; i < toTry; i++) {
      // guard reserve coins hanya jika enforceReserveOnPlots = true
      if (cfg.enforceReserveOnPlots && coins <= (cfg.minCoinsReserve || 0)) {
        log('⚠️  auto-buy plot skipped — coins ≤ reserve');
        break;
      }
      const bp = await api.buyPlot();
      if (!bp?.ok) {
        const msg = (typeof bp?.err === 'string' ? bp.err : (bp?.err?.message || 'unknown')).toLowerCase();
        if (msg.includes('insufficient') || msg.includes('not enough') || msg.includes('balance')) {
          const hint = currencyHintFromError(bp?.err) || 'coins?';
          log(`⚠️  auto-buy plot skipped — insufficient balance (${hint})`);
        } else {
          log(`⚠️  auto-buy plot failed: ${typeof bp?.err==='string'?bp.err:JSON.stringify(bp?.err)}`);
        }
        break;
      }
      boughtPlots += 1;
      log(`🧱 auto-bought plot #${boughtPlots} (this cycle)`);
      await sleep(cfg.coolDownMs);

      // refresh setelah beli
      const stX = await api.getState();
      if (!stX?.ok || !stX.state) break;
      slotsAll = slotsFromState(stX.state);
      empties  = pickEmptySlots(stX.state, slotsAll);
      coins    = stX.state?.coins ?? coins;
      ap       = stX.state?.ap ?? stX.state?.apples ?? ap;
    }
  }

  // === DETEKSI SLOT KOSONG → BELI SEED → PLANT
  st = await api.getState();
  if (!st?.ok || !st.state) return { ok:false, err: st?.err || 'no state' };
  slotsAll = slotsFromState(st.state);
  empties  = pickEmptySlots(st.state, slotsAll);
  coins    = st.state?.coins ?? 0;
  ap       = st.state?.ap ?? st.state?.apples ?? 0;

  if (empties.length === 0) {
    log('ℹ️  no empty slot → nothing to plant.');
    return { ok:true, planted:0, applied:0, boughtPlots, reason:'no empty slot' };
  }

  const want = empties.length;
  const seedMeta = SEEDS[seedKey] || { price:0, currency:'coins' };

  // hitung maksimal beli seeds:
  // - jika enforceReserveOnSeeds=true → hormati reserve
  // - jika false → abaikan reserve (pakai saldo murni)
  const canBuyNoReserve = affordableQty(seedMeta.price, seedMeta.currency, coins, ap, want);
  const canBuySeeds = cfg.enforceReserveOnSeeds
    ? affordableQtyWithReserve(
        seedMeta.price, seedMeta.currency, coins, ap, want,
        cfg.minCoinsReserve || 0, cfg.minApReserve || 0
      )
    : canBuyNoReserve;

  if (canBuySeeds <= 0) {
    if (cfg.enforceReserveOnSeeds) {
      log(`⚠️  skip seeds — menjaga reserve (${seedMeta.currency || 'coins'}) / saldo tidak cukup (need ${seedMeta.price} x ${want})`);
    } else {
      log(`⚠️  skip seeds — saldo tidak cukup untuk minimal 1 seed (need ${seedMeta.price} ${seedMeta.currency || 'coins'})`);
    }
    return { ok:true, planted:0, applied:0, boughtPlots, reason:'insufficient for seeds' };
  }
  if (canBuySeeds < want) log(`ℹ️  adjust seeds: want=${want} → buy=${canBuySeeds}`);

  const targets = empties.slice(0, canBuySeeds);
  const br = await api.buySeeds(seedKey, targets.length);
  if (!br?.ok) return { ok:false, err: br.err || 'buy seed failed' };
  log(`🛒 bought seeds: ${seedKey} x${targets.length}`);
  await sleep(cfg.coolDownMs);

  const plantings = targets.map(slotIndex => ({ slotIndex, seedKey }));
  const pr = await api.plantMany(plantings);
  if (!pr?.ok) return { ok:false, err: pr.err || 'plant failed' };
  log(`🌱 planted ${plantings.length} slot(s): [${plantings.map(p=>p.slotIndex).join(', ')}]`);
  await sleep(cfg.coolDownMs);

  // === BOOSTER selektif
  let applied = 0;
  const useBooster = boosterKey && boosterKey !== 'skip';
  if (useBooster) {
    const stB = await api.getState();
    if (!stB?.ok || !stB.state) return { ok:false, err: stB?.err || 'no state' };
    coins = stB.state?.coins ?? 0;
    ap    = stB.state?.ap ?? stB.state?.apples ?? 0;

    const needBoost = slotsNeedingBooster(stB.state, targets);
    if (needBoost.length > 0) {
      let buyCount = needBoost.length;
      const bMeta = BOOSTERS[boosterKey];

      if (bMeta && Number.isFinite(bMeta.price) && bMeta.currency) {
        // Jika enforceReserveOnBoosters = true → hormati reserve
        buyCount = cfg.enforceReserveOnBoosters
          ? affordableQtyWithReserve(
              bMeta.price, bMeta.currency, coins, ap, needBoost.length,
              cfg.minCoinsReserve || 0, cfg.minApReserve || 0
            )
          : affordableQty(bMeta.price, bMeta.currency, coins, ap, needBoost.length);

        if (buyCount <= 0) {
          const reason = cfg.enforceReserveOnBoosters ? 'menjaga reserve / saldo tidak cukup' : 'saldo tidak cukup';
          log(`⚠️  skip booster — ${reason}`);
        }
      } else if (cfg.enforceReserveOnBoosters) {
        // tanpa metadata harga → minimal hormati guard reserve
        if (coins <= (cfg.minCoinsReserve || 0) || ap <= (cfg.minApReserve || 0)) {
          log('⚠️  skip booster — menjaga reserve');
          buyCount = 0;
        }
      }

      if (buyCount > 0) {
        const bm = await api.buyModifier(boosterKey, buyCount);
        if (!bm?.ok) {
          const msg = (typeof bm?.err === 'string' ? bm.err : (bm?.err?.message || 'unknown')).toLowerCase();
          if (msg.includes('insufficient') || msg.includes('not enough') || msg.includes('balance')) {
            const hint = currencyHintFromError(bm?.err) || 'coins?';
            log(`⚠️  skip booster — insufficient balance (${hint})`);
          } else {
            log(`⚠️  buy booster failed: ${typeof bm?.err==='string'?bm.err:JSON.stringify(bm?.err)}`);
          }
        } else {
          await sleep(cfg.coolDownMs);
          const apps = needBoost.slice(0, buyCount).map(slotIndex => ({ slotIndex, modifierKey: boosterKey }));
          const apR = await api.applyModifier(apps);
          if (!apR?.ok) {
            log(`⚠️  apply booster failed: ${typeof apR?.err==='string'?apR.err:JSON.stringify(apR?.err)}`);
          } else {
            applied = apps.length;
            log(`✨ booster applied to ${applied} slot(s): [${apps.map(x=>x.slotIndex).join(', ')}]`);
            await sleep(cfg.coolDownMs);
          }
        }
      }
    } else {
      log('ℹ️  all planted slots already have an active booster');
    }
  }

  return { ok:true, planted: plantings.length, applied, boughtPlots };
}

/**
 * runPlantCycle — tunggu panen + idle log tiap X detik
 */
export async function runPlantCycle({ seedKey, boosterKey='skip', waitUntilHarvest=true, pollIntervalMs=1000 }, api=API, log=()=>{}){
  const flow = await ensurePlantFlow({ seedKey, boosterKey }, api, log);
  if (!flow?.ok) return flow;
  if (!waitUntilHarvest) return { ok:true, ...flow, harvestedFinal:0, eta:null };

  // tunggu panen
  let st = await api.getState();
  if (!st?.ok || !st.state) return { ok:false, err: st?.err || 'no state' };

  const plots = getPlots(st.state).filter(p => p?.seed?.key && endTimeMs(p));
  let eta = null, harvestedFinal = 0;

  if (plots.length) {
    const nextMs = Math.min(...plots.map(p => endTimeMs(p)));
    let left = Math.max(0, nextMs - Date.now());
    eta = Math.ceil(left/1000);
    const tick = Math.max(1000, cfg.idleTickMs || 10000);
    let lastRefresh = Date.now();

    while (left > 0) {
      await sleep(Math.min(tick, left));
      left = Math.max(0, nextMs - Date.now());

      if (Date.now() - lastRefresh >= (cfg.refreshStateMs || 30000)) {
        const st2 = await api.getState();
        lastRefresh = Date.now();
        if (st2?.ok && st2.state) {
          const ps = getPlots(st2.state).filter(p => p?.seed?.key && endTimeMs(p));
          const next2 = ps.length ? Math.min(...ps.map(p => endTimeMs(p))) : null;
          if (next2) left = Math.max(0, next2 - Date.now());
          log(`🕒 ${LABEL_WAIT} ${fmtSec(Math.ceil(left/1000))} | join t.me/airdropshogun`);
        } else {
          log(`🕒 ${LABEL_WAIT} ${fmtSec(Math.ceil(left/1000))} | refresh failed`);
        }
      } else {
        log(`🕒 ${LABEL_WAIT} ${fmtSec(Math.ceil(left/1000))}`);
      }
    }
    const hv1 = await harvestDue(null, api, log);
    if (!hv1?.ok) return hv1;
    harvestedFinal = hv1.harvested || 0;
  } else {
    eta = estimateEtaSeconds(seedKey, boosterKey);
    const tick = Math.max(1000, cfg.idleTickMs || 10000);
    let left = eta * 1000;
    while (left > 0) {
      await sleep(Math.min(tick, left));
      left -= Math.min(tick, left);
      log(`🕒 ${LABEL_WAIT} ${fmtSec(Math.ceil(left/1000))}`);
    }
    const hv2 = await harvestDue(null, api, log);
    if (!hv2?.ok) return hv2;
    harvestedFinal = hv2.harvested || 0;
  }
  return { ok:true, ...flow, harvestedFinal, eta };
}
