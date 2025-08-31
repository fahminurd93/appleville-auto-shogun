// src/logic_push.js — khusus flow tanam untuk Push Prestige
// Tidak menyentuh auto-buy plot. Reserve & perilaku dibawa lewat parameter,
// jadi tidak mengutak-atik config global menu #1.

import cfg from './config.js';
import * as API from './api.js';
import { SEEDS } from '../data/seeds.js';
import { BOOSTERS } from '../data/boosters.js';
import { fmtSec } from './utils/time.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const now = () => Date.now();

// ==== MIN AP RESERVE KHUSUS BOOSTER ====
const BOOSTER_AP_RESERVE = Number(process.env.APV_MIN_AP_RESERVE_BOOST || 120);

/* ========== Helpers slot ========== */
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
function slotsNeedingBooster(state, slotList){ const m=getPlotsMap(state); const out=[]; for(const i of slotList||[]){ const p=m.get(i); if(p&&!hasActiveModifier(p)) out.push(i);} return out; }

/* harvest siap panen */
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

/* ETA */
function estimateEtaSeconds(seedKey, boosterKey='skip'){
  const base = SEEDS[seedKey]?.growSeconds ?? 30;
  const spd  = BOOSTERS[boosterKey]?.speedMult ?? 1.0;
  return Math.ceil(base / (spd>0?spd:1));
}

/* Kalkulasi mampu beli */
function affordableQty(price, currency, balanceCoins, balanceAp, wantQty){
  if (!price || price <= 0) return wantQty;
  if (String(currency).toLowerCase().includes('ap')) {
    const max = Math.floor((balanceAp ?? 0) / price);
    return Math.max(0, Math.min(wantQty, max));
  }
  const max = Math.floor((balanceCoins ?? 0) / price);
  return Math.max(0, Math.min(wantQty, max));
}

/* Seed reserve dinamis (jaga dana tanam penuh — referensi; enforcement di caller) */
export function computeSeedReserve(state, seedKey){
  const meta = SEEDS[seedKey] || {};
  const price = Number(meta.price||0);
  const currency = String(meta.currency||'coins').toLowerCase();
  const plots = slotsFromState(state).length;
  const mult = 1.05;
  const need = Math.ceil(price * plots * mult);
  return currency.includes('ap') ? { coins:0, ap:need } : { coins:need, ap:0 };
}

/* Booster blacklist (prestige lock) */
const blockedBoosters = new Set();

/**
 * ensurePlantFlowPush — khusus Push Prestige (tanpa auto-expand plot)
 * Params:
 *   seedKey, boosterKey
 *   reserves = { enforceSeeds, enforceBoosters, minCoinsReserve, minApReserve }
 *   countdownLabel (optional, default dari config)
 */
export async function ensurePlantFlowPush({ seedKey, boosterKey='skip', reserves={}, countdownLabel }, api=API, log=()=>{}){
  // HARVEST DULU
  let st0 = await api.getState();
  if (!st0?.ok || !st0.state) return { ok:false, err: st0?.err || 'no state' };
  const hv0 = await harvestDue(st0.state, api, log);
  if (!hv0?.ok) return hv0;
  await sleep(cfg.coolDownMs);

  // STATE TERKINI
  let st = await api.getState();
  if (!st?.ok || !st.state) return { ok:false, err: st?.err || 'no state' };

  let slotsAll = slotsFromState(st.state);
  let empties  = pickEmptySlots(st.state, slotsAll);
  const ready  = readySlots(st.state, slotsAll);
  let coins  = st.state?.coins ?? 0;
  let ap     = st.state?.ap ?? st.state?.apples ?? 0;
  const growing= Math.max(0, slotsAll.length - empties.length - ready.length);
  log(`💰 balance: coins=${coins}, ap=${ap} | plots=${slotsAll.length} (empty=${empties.length}, ready=${ready.length}, growing=${growing})`);

  // BELI SEED → TANAM (hormati reserve kalau enforceSeeds=true)
  st = await api.getState();
  if (!st?.ok || !st.state) return { ok:false, err: st?.err || 'no state' };
  slotsAll = slotsFromState(st.state);
  empties  = pickEmptySlots(st.state, slotsAll);

  if (empties.length === 0) {
    log('ℹ️  no empty slot → nothing to plant.');
    return { ok:true, planted:0, applied:0 };
  }

  const want = empties.length;
  const seedMeta = SEEDS[seedKey] || { price:0, currency:'coins' };
  const unit = String(seedMeta.currency||'coins').toLowerCase();
  const balCoins = st.state?.coins ?? 0;
  const balAp    = st.state?.ap ?? st.state?.apples ?? 0;

  let canBuy = affordableQty(seedMeta.price, seedMeta.currency, balCoins, balAp, want);

  // hormati reserve untuk seeds (kalau diminta)
  const minC = Math.max(0, Number(reserves.minCoinsReserve||0));
  const minA = Math.max(0, Number(reserves.minApReserve||0));
  if (reserves.enforceSeeds) {
    if (unit.includes('ap')) {
      const maxByReserve = Math.floor(Math.max(0, (balAp - minA)) / (seedMeta.price||1));
      canBuy = Math.max(0, Math.min(canBuy, maxByReserve));
    } else {
      const maxByReserve = Math.floor(Math.max(0, (balCoins - minC)) / (seedMeta.price||1));
      canBuy = Math.max(0, Math.min(canBuy, maxByReserve));
    }
  }

  if (canBuy <= 0) {
    log(`⚠️  skip seeds — saldo tidak cukup untuk minimal 1 seed (need ${seedMeta.price} ${seedMeta.currency||'coins'})`);
    return { ok:true, planted:0, applied:0, reason:'insufficient for seeds' };
  }
  if (canBuy < want) log(`ℹ️  adjust seeds: want=${want} → buy=${canBuy}`);

  const targets = empties.slice(0, canBuy);
  const br = await api.buySeeds(seedKey, targets.length);
  if (!br?.ok) return { ok:false, err: br.err || 'buy seed failed' };
  log(`🛒 bought seeds: ${seedKey} x${targets.length}`);
  await sleep(cfg.coolDownMs);

  const plantings = targets.map(slotIndex => ({ slotIndex, seedKey }));
  const pr = await api.plantMany(plantings);
  if (!pr?.ok) return { ok:false, err: pr.err || 'plant failed' };
  log(`🌱 planted ${plantings.length} slot(s): [${plantings.map(p=>p.slotIndex).join(', ')}]`);
  await sleep(cfg.coolDownMs);

  // BOOSTER (skip jika prestige lock / blacklist) + jaga MIN AP khusus booster
  let applied = 0;
  const useBooster = boosterKey && boosterKey !== 'skip';
  if (useBooster) {
    if (blockedBoosters.has(boosterKey)) {
      log(`ℹ️  booster '${boosterKey}' diblok sementara (prestige lock) — skip`);
    } else {
      const stB = await api.getState();
      if (!stB?.ok || !stB.state) return { ok:false, err: stB?.err || 'no state' };
      const lvl = Number(stB.state?.prestigeLevel || stB.state?.prestige?.level || 0);
      const neededLvl = Number(BOOSTERS[boosterKey]?.minPrestige || 0);
      if (neededLvl > lvl) {
        log(`ℹ️  skip booster — butuh prestige level ≥ ${neededLvl} (sekarang ${lvl})`);
      } else {
        const needBoost = slotsNeedingBooster(stB.state, targets);
        if (needBoost.length > 0) {
          // Protek saldo AP khusus booster: sisakan minimal BOOSTER_AP_RESERVE
          const boosterMeta = BOOSTERS[boosterKey] || { price:0, currency:'ap' };
          const unitB  = String(boosterMeta.currency || 'ap').toLowerCase();
          const priceB = Number(boosterMeta.price || 0);
          let toBoost = needBoost;

          if (unitB.includes('ap') && priceB > 0) {
            const balApB = stB.state?.ap ?? stB.state?.apples ?? 0;
            const maxByReserve = Math.floor(Math.max(0, (balApB - BOOSTER_AP_RESERVE)) / priceB);
            const allowed = Math.max(0, Math.min(needBoost.length, maxByReserve));
            if (allowed <= 0) {
              log(`⚠️  skip booster — jaga min AP ${BOOSTER_AP_RESERVE}`);
              toBoost = [];
            } else if (allowed < needBoost.length) {
              log(`ℹ️  adjust boosters: need=${needBoost.length} → buy=${allowed} (reserve AP ${BOOSTER_AP_RESERVE})`);
              toBoost = needBoost.slice(0, allowed);
            }
          }

          if (toBoost.length > 0) {
            const bm = await api.buyModifier(boosterKey, toBoost.length);
            if (!bm?.ok) {
              const msg = (typeof bm?.err === 'string' ? bm.err : (bm?.err?.message || 'unknown'));
              if (/requires level/i.test(msg)) {
                blockedBoosters.add(boosterKey);
                log(`ℹ️  booster '${boosterKey}' terkunci prestige — skip (cached)`);
              } else if (/insufficient|not enough|balance/i.test(msg)) {
                log('⚠️  skip booster — insufficient balance');
              } else {
                log(`⚠️  buy booster failed: ${msg}`);
              }
            } else {
              await sleep(cfg.coolDownMs);
              const apps = toBoost.map(slotIndex => ({ slotIndex, modifierKey: boosterKey }));
              const apR = await api.applyModifier(apps);
              if (!apR?.ok) {
                const m = (typeof apR?.err==='string'?apR.err:(apR?.err?.message||'unknown'));
                if (/requires level/i.test(m)) {
                  blockedBoosters.add(boosterKey);
                  log(`ℹ️  booster '${boosterKey}' terkunci prestige — skip (cached)`);
                } else {
                  log(`⚠️  apply booster failed: ${m}`);
                }
              } else {
                applied = apps.length;
                log(`✨ booster applied to ${applied} slot(s): [${toBoost.join(', ')}]`);
                await sleep(cfg.coolDownMs);
              }
            }
          }
        } else {
          log('ℹ️  all planted slots already have an active booster');
        }
      }
    }
  }

  return { ok:true, planted: plantings.length, applied };
}

/**
 * runPlantCyclePush — tanam + tunggu panen (khusus Push Prestige)
 */
export async function runPlantCyclePush({ seedKey, boosterKey='skip', reserves={}, waitUntilHarvest=true, countdownLabel }, api=API, log=()=>{}){
  const flow = await ensurePlantFlowPush({ seedKey, boosterKey, reserves, countdownLabel }, api, log);
  if (!flow?.ok) return flow;
  if (!waitUntilHarvest) return { ok:true, ...flow, harvestedFinal:0, eta:null };

  // tunggu panen
  let st = await api.getState();
  if (!st?.ok || !st.state) return { ok:false, err: st?.err || 'no state' };

  const plots = getPlots(st.state).filter(p => p?.seed?.key && endTimeMs(p));
  let eta = null, harvestedFinal = 0;

  const label = countdownLabel || cfg.countdownLabel || 'Wait For Harvest';

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
          log(`🕒 ${label} ${fmtSec(Math.ceil(left/1000))} | join t.me/airdropshogun`);
        } else {
          log(`🕒 idle ${fmtSec(Math.ceil(left/1000))} | refresh failed`);
        }
      } else {
        log(`🕒 ${label} ${fmtSec(Math.ceil(left/1000))}`);
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
      log(`🕒 ${label} ${fmtSec(Math.ceil(left/1000))}`);
    }
    const hv2 = await harvestDue(null, api, log);
    if (!hv2?.ok) return hv2;
    harvestedFinal = hv2.harvested || 0;
  }
  return { ok:true, ...flow, harvestedFinal, eta };
}
