// src/push.js — Mode Push Prestige (EXPAND ? AP RUSH ? prestige ? AUTO RESTART)
import cfg from './config.js';
import { makeApi } from './api.js';
import { runPlantCyclePush, computeSeedReserve } from './logic_push.js';
import { SEEDS } from '../data/seeds.js';
import { BOOSTERS } from '../data/boosters.js';
import { PLOT_PRICES } from '../data/plotprice.js';
import { colorizeLine, pickNameColor } from './utils/term.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const nowStr = () => new Date().toLocaleTimeString('sv-SE', { hour12: false });

/* ========== logger berwarna per akun ========== */
const makeLogger = (name) => {
  const nameColored = pickNameColor(name)(`[${name}]`);
  return (msg) => console.log(`[${nowStr()}] ${nameColored} ${colorizeLine(msg)}`);
};

/* ========== util seeds/booster ========== */
function seedUnitCost(seedKey) {
  const m = SEEDS[seedKey] || { price: 0, currency: 'coins' };
  const price = Number(m.price || 0);
  const cur = String(m.currency || 'coins').toLowerCase();
  return cur.includes('ap')
    ? { coinsPerSeed: 0, apPerSeed: price }
    : { coinsPerSeed: price, apPerSeed: 0 };
}
function hasMinPrestige(item, lvl) { return ((item?.minPrestige || 0) <= (lvl || 0)); }

const BOOSTER_BLACKLIST = new Set(
  (cfg.push?.boosterBlacklist || ['deadly-mix']).map(s => String(s || '').toLowerCase())
);

/** picker seed AWARE SALDO (baru) */
function pickSeed(goal, lvl, budget = null) {
  const list = goal === 'ap'
    ? (cfg.push?.apSeedsPriority || ['golden-apple'])
    : (cfg.push?.coinSeedsPriority || ['wheat', 'lettuce', 'carrot']);

  // Yang sudah unlock prestige
  const unlocked = list.filter(k => {
    const m = SEEDS[k];
    return m && hasMinPrestige(m, lvl);
  });

  // tanpa info budget ? perilaku lama (ambil prioritas pertama yg unlock)
  if (!budget) return unlocked[0] || Object.keys(SEEDS)[0] || 'wheat';

  const needAp = (goal === 'ap');
  const bal = needAp ? Number(budget.ap || 0) : Number(budget.coins || 0);

  // 1) coba ambil yang unlock & TERJANGKAU sesuai currency goal
  for (const k of unlocked) {
    const m = SEEDS[k]; if (!m) continue;
    const isAp = String(m.currency || 'coins').toLowerCase().includes('ap');
    const price = Number(m.price || 0);
    if ((needAp && isAp && bal >= price) || (!needAp && !isAp && bal >= price)) {
      return k;
    }
  }

  // 2) fallback: pilih yang TERMURAH (currency sesuai goal) di antara yang unlock
  let cheapest = null, best = Infinity;
  for (const k of unlocked) {
    const m = SEEDS[k]; if (!m) continue;
    const isAp = String(m.currency || 'coins').toLowerCase().includes('ap');
    if ((needAp && isAp) || (!needAp && !isAp)) {
      const p = Number(m.price || 0);
      if (p < best) { best = p; cheapest = k; }
    }
  }
  if (cheapest) return cheapest;

  // 3) fallback terakhir
  return unlocked[0] || Object.keys(SEEDS)[0] || 'wheat';
}

function pickBooster(goal, lvl) {
  const pref = goal === 'ap'
    ? (cfg.push?.apBoosterPriority || ['skip'])
    : (cfg.push?.coinBoosterPriority || ['skip']);
  for (const key of pref) {
    const k = String(key || '').toLowerCase();
    if (k === 'skip') return 'skip';
    if (BOOSTER_BLACKLIST.has(k)) continue;
    const b = BOOSTERS[k];
    if (b && b.type !== 'global' && hasMinPrestige(b, lvl)) return k;
  }
  return 'skip';
}

/* ========== prestige & ringkas state ========== */
function prestigeNeedForNext(levelNow) {
  const map = cfg.push?.prestigeReq || {};
  return Number(map[String((Number(levelNow || 0) + 1))] || 0);
}
function readPrestige(state) {
  const lvl = Number(state?.prestigeLevel || state?.prestige?.level || 0);
  const netCandidates = [
    state?.prestige?.netAp, state?.prestige?.net_ap, state?.netAp,
    state?.stats?.apEarned, state?.apEarned
  ];
  let netAp = 0;
  for (const v of netCandidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) { netAp = n; break; }
  }
  if (!netAp && cfg.push?.useApBalanceAsPrestigeProgress) {
    const bal = Number(state?.ap ?? state?.apples ?? 0);
    if (bal > 0) netAp = bal;
  }
  return { level: lvl, netAp };
}
function summarize(state) {
  const coins = Number(state?.coins || 0);
  const ap    = Number(state?.ap || state?.apples || 0);
  const plots = Array.isArray(state?.plots) ? state.plots : [];
  const slots = plots.map(p => p.slotIndex).filter(Number.isInteger);
  const t = Date.now();
  const empty = plots.filter(p => !p?.seed?.key).length;
  const ready = plots.filter(p => p?.seed?.key && p?.seed?.endsAt && new Date(p.seed.endsAt).getTime() <= t).length;
  const growing = Math.max(0, slots.length - empty - ready);
  const { level, netAp } = readPrestige(state);
  return { coins, ap, plots: slots.length, empty, ready, growing, level, netAp };
}

/* ========== harga plot from table ========== */
function nextPlotIndex(plotsNow) { return (Number(plotsNow || 0) + 1); }
function getPlotPrice(plotsNow) {
  const idx = nextPlotIndex(plotsNow);
  const e = PLOT_PRICES[idx]; // {coins, ap}
  return { coins: Number(e?.coins || 0), ap: Number(e?.ap || 0), idx };
}

/* ========== reserves (profiles/adaptive) + seed-reserve dinamis ========== */
function applyReservesPush(phase, state, goal, log) {
  const mode = cfg.push?.reserveMode || 'profiles';
  let minCoinsReserve = 0, minApReserve = 0;
  let enforceSeeds=false, enforcePlots=true, enforceBoosters=true;

  if (mode === 'profiles') {
    const p = cfg.push?.reserves?.[phase] || {};
    enforceSeeds     = !!p.enforceSeeds;
    enforcePlots     = !!p.enforcePlots;
    enforceBoosters  = !!p.enforceBoosters;
    minCoinsReserve  = Number(p.minCoinsReserve || 0);
    minApReserve     = Number(p.minApReserve || 0);
  } else {
    const a = cfg.push?.adaptive || {};
    const plots = Array.isArray(state?.plots) ? state.plots.length : 0;
    enforceSeeds=false; enforcePlots=true; enforceBoosters=true;
    const baseCoins = (a.baseCoins || 0) + plots * (a.perPlotCoins || 0);
    const baseAp    = (a.baseAp    || 0) + plots * (a.perPlotAp    || 0);
    minCoinsReserve = Math.min(a.maxCoins || 2000, baseCoins);
    minApReserve    = Math.min(a.maxAp    || 150 , baseAp);
  }

  const seedKey = pickSeed(goal, Number(state?.prestigeLevel || 0));
  const dyn = computeSeedReserve(state, seedKey); // {coins, ap}
  minCoinsReserve = Math.max(minCoinsReserve, Number(dyn.coins || 0));
  minApReserve    = Math.max(minApReserve,    Number(dyn.ap    || 0));

  log?.(`[RESV] [EXPAND MODE] (${cfg.push?.reserveMode || 'profiles'}/${phase}/dynamic:${goal}): coins=${minCoinsReserve}, ap=${minApReserve}`);
  return { enforceSeeds, enforcePlots, enforceBoosters, minCoinsReserve, minApReserve, seedKeyForPhase: seedKey };
}

/* ========== GUARD beli plot — bedakan COIN vs AP & seed tanam sesuai plot ========== */
function guardBuyPlotDetailed({ coins, ap, plotsNow, plantSeedKey, reserves, plotPrice=null }) {
  // Harga plot berikutnya:
  const plot = plotPrice || getPlotPrice(plotsNow); // {coins, ap, idx}
  const plotIsCoins = plot.coins > 0 && plot.ap === 0;
  const plotIsAp    = plot.ap    > 0 && plot.coins === 0;

  // Seed untuk tanam setelah membeli plot (mengikuti currency seed yg dipilih)
  const { coinsPerSeed, apPerSeed } = seedUnitCost(plantSeedKey);
  const plotsAfter = plotsNow + 1;
  const needFullCoins = coinsPerSeed * plotsAfter;
  const needFullAp    = apPerSeed    * plotsAfter;

  // Buffer hanya relevan untuk coins
  let bufferCoins = 0;
  const pv = cfg.plotBuyMinCost;
  if (pv === 'auto') bufferCoins = Math.max(coinsPerSeed, Math.ceil((plot.coins + needFullCoins) * 0.10));
  else bufferCoins = Math.max(0, Number(pv || 0));

  // Abaikan reserve mata uang yang TIDAK dipakai plot
  const coinsReserve = plotIsAp ? 0 : reserves.minCoinsReserve;
  const apReserve    = plotIsCoins ? 0 : reserves.minApReserve;

  // Minimal saldo yang wajib ada
  const mustHaveCoins = Math.max(
    coinsReserve,
    (plotIsCoins ? plot.coins : 0) + needFullCoins + (plotIsCoins ? bufferCoins : 0)
  );
  const mustHaveAp = Math.max(
    apReserve,
    (plotIsAp ? plot.ap : 0) + needFullAp
  );

  const allow = (coins >= mustHaveCoins) && (ap >= mustHaveAp);

  return {
    allow,
    need: {
      plotIdx: plot.idx,
      plotPriceCoins: plot.coins,
      plotPriceAp: plot.ap,
      needFullCoins, needFullAp,
      bufferCoins,
      mustHaveCoins, mustHaveAp
    },
    have: { coins, ap }
  };
}

/* ========== helper aksi farming & prestige ========== */
async function farmOnce(api, goal, lvl, reserves, log, budget = null) {
  const seedKey    = pickSeed(goal,  lvl, budget);
  const boosterKey = pickBooster(goal, lvl);
  log(`-> farm goal=${goal} ? seed=${seedKey}, booster=${boosterKey}`);
  const r = await runPlantCyclePush({ seedKey, boosterKey, reserves, waitUntilHarvest: true }, api, log);
  if (!r?.ok) log(`[WARN] farm gagal: ${typeof r?.err === 'string' ? r.err : JSON.stringify(r?.err)}`);
  return !!r?.ok;
}
async function tryPrestigeInstant(api, log) {
  try {
    const r = await api.prestige();
    if (r?.ok) { log('[OK] prestige sukses (instant).'); return true; }
    const msg = (typeof r?.err === 'string') ? r.err : (r?.err?.message || 'unknown');
    log(`[WARN] prestige gagal: ${msg}`);
  } catch (e) {
    log(`[WARN] prestige error: ${e?.message || String(e)}`);
  }
  return false;
}

/* ========== helper: klaim base plot setelah prestige / saat start baru ========== */
async function bootstrapBasePlot(api, log) {
  // Cek & klaim plot dasar jika 0
  for (let i = 0; i < 8; i++) {
    const st = await api.getState();
    if (!st?.ok || !st.state) { await sleep(300); continue; }
    const plots = Array.isArray(st.state?.plots) ? st.state.plots.length : 0;
    if (plots > 0) return true;
    log('[PLOT] bootstrap: klaim base plot…');
    try { await api.buyPlot(); } catch {}
    await sleep(500);
    const st2 = await api.getState();
    const p2 = Array.isArray(st2?.state?.plots) ? st2.state.plots.length : 0;
    if (p2 > 0) { log('[OK] base plot claimed ?'); return true; }
  }
  log('[WARN] bootstrap gagal (base plot tidak bisa diklaim).');
  return false;
}

/* ========== LOOP per akun (auto-restart setelah prestige) ========== */
async function runForAccount({ name, rawCookie }) {
  const api  = makeApi(rawCookie);
  const log  = makeLogger(name);

  let aborted = false;
  process.once('SIGINT', () => { aborted = true; console.log(colorizeLine('\n[WARN] Stop signal diterima, tutup worker…')); });

  while (!aborted) {
    // ---- START (fase awal siklus) ----
    let st0 = await api.getState();
    if (!st0?.ok || !st0.state) { log(`[ERR] gagal ambil state: ${st0?.err || 'no state'}`); return; }

    // prestige otomatis di awal (kalau sudah cukup)
    const S0 = summarize(st0.state);
    const need0 = prestigeNeedForNext(S0.level);
    if ((cfg.push?.autoPrestige === 'instant') && need0 > 0 && S0.netAp >= need0) {
      log(`[OK] progress cukup untuk prestige (${cfg.push?.useApBalanceAsPrestigeProgress ? 'apBalance/netAp' : 'netAp'}: ${S0.netAp}/${need0}) ? prestige instant…`);
      const ok = await tryPrestigeInstant(api, log);
      if (ok) {
        await sleep(1000);
        await bootstrapBasePlot(api, log);
        continue; // restart siklus dari awal
      }
      await sleep(900);
      st0 = await api.getState();
      if (!st0?.ok || !st0.state) { log(`[ERR] gagal ambil state setelah prestige`); return; }
    }

    // pastikan base plot ada saat start (akun baru/baru prestige)
    await bootstrapBasePlot(api, log);

    const S = summarize(st0.state);
    log(`[OK] Push start • lvl=${S.level}, coins=${S.coins}, ap=${S.ap}, plots=${S.plots}`);

    const targetPlots = Math.max(1, Number(cfg.push?.targetPlots || 12));
    let restartAfterPrestige = false;

    /* -------- PHASE: EXPAND -------- */
    while (!aborted) {
      const st = await api.getState();
      if (!st?.ok || !st.state) { log(`[ERR] gagal ambil state: ${st?.err || 'no state'}`); break; }
      const s = summarize(st.state);

      // Jika 0 plots (habis prestige manual?), bootstrap lagi
      if (s.plots === 0) {
        await bootstrapBasePlot(api, log);
        continue;
      }

      if (s.plots >= targetPlots) {
        log(`[OK] [PLOT] target tercapai: ${s.plots}/${targetPlots} ? [RUSH] AP`);
        break;
      }

      // Reserve & seed acuan EXPAND (fokus coins)
      const reserves = applyReservesPush('expand', st.state, 'coins', log);

      // Info plot berikutnya & pilih seed tanam sesuai currency plot, AWARE SALDO
      const plotInfo   = getPlotPrice(s.plots);
      const budgetNow  = { coins: s.coins, ap: s.ap };
      const plantSeedKey = plotInfo.ap > 0
        ? pickSeed('ap', s.level, budgetNow)                // AP plot ? pilih AP seed terjangkau
        : (reserves.seedKeyForPhase || pickSeed('coins', s.level, budgetNow));

      // Guard beli plot
      const g = guardBuyPlotDetailed({
        coins: s.coins,
        ap: s.ap,
        plotsNow: s.plots,
        plantSeedKey,
        reserves,
        plotPrice: plotInfo,
      });

      // Pesan user-friendly + detil kalkulasi
      log(`[INFO] next Plot#${g.need.plotIdx} you need coins=${g.need.mustHaveCoins}, ap=${g.need.mustHaveAp} | Balance Coin=${g.have.coins} | AP=${g.have.ap}`);
      log(`[i] calc: coins = plot:${g.need.plotPriceCoins} + full:${g.need.needFullCoins} + buffer:${g.need.bufferCoins}; ap = plot:${g.need.plotPriceAp} + full:${g.need.needFullAp}`);

      if (!g.allow) {
        const needTarget = (s.coins < g.need.mustHaveCoins) ? 'coins' : 'ap';
        await farmOnce(api, needTarget, s.level, reserves, log, budgetNow);
        await sleep(cfg.loopRestMs || 800);
        continue;
      }

      // Lulus guard ? beli plot
      const bp = await api.buyPlot();
      if (bp?.ok) {
        log('[OK] [PLOT] bought ?');
        await sleep(cfg.coolDownMs);
      } else {
        const em = (typeof bp?.err === 'string' ? bp.err : (bp?.err?.message || 'unknown'));
        log(`[WARN] buy plot gagal: ${em} ? farming dulu`);
        await farmOnce(api, 'coins', s.level, reserves, log, budgetNow);
      }

      // Putar ekonomi tiap iterasi (pakai budget terbaru)
      const afterBuy = await api.getState();
      const sb = afterBuy?.ok && afterBuy.state ? summarize(afterBuy.state) : s;
      await farmOnce(api, 'coins', sb.level, reserves, log, { coins: sb.coins, ap: sb.ap });
      await sleep(cfg.loopRestMs || 800);
    }

    /* -------- PHASE: AP RUSH -------- */
    while (!aborted) {
      const st = await api.getState();
      if (!st?.ok || !st.state) { log(`[ERR] gagal ambil state: ${st?.err || 'no state'}`); break; }
      const s = summarize(st.state);

      // Kalau turun di bawah target (mis. manual), balik EXPAND
      if (s.plots < targetPlots) {
        log('[INFO] plots di bawah target ? kembali ke EXPAND');
        break;
      }

      const need = prestigeNeedForNext(s.level);
      if (need) {
        const pct = ((s.netAp / need) * 100).toFixed(1);
        log(`[PROG] [RUSH AP MODE] prestige: ${s.netAp}/${need} (${pct}%)`);
      }

      const reserves = applyReservesPush('rush', st.state, 'ap', null);
      await farmOnce(api, 'ap', s.level, reserves, log, { coins: s.coins, ap: s.ap });

      if ((cfg.push?.autoPrestige || 'instant') !== 'off') {
        const needAp = prestigeNeedForNext(s.level);
        if (needAp > 0) {
          const after = await api.getState();
          if (after?.ok && after.state) {
            const s2 = summarize(after.state);
            if (s2.netAp >= needAp) {
              if ((cfg.push?.autoPrestige || 'instant') === 'instant') {
                const ok = await tryPrestigeInstant(api, log);
                if (ok) {
                  // prestige sukses ? tandai restart & keluar ke START
                  restartAfterPrestige = true;
                  break;
                }
              } else {
                log('[OK] AP cukup — silakan prestige manual (mode=safe/off)');
              }
            }
          }
        }
      }
      await sleep(cfg.loopRestMs || 800);
    }

    // Setelah RUSH selesai:
    if (aborted) break;
    if (restartAfterPrestige) {
      await sleep(1000);
      await bootstrapBasePlot(api, log);   // klaim base plot
      continue;                             // kembali ke START siklus
    }
    // kalau tidak restart (mis. stop/err), loop akan mengulang START lagi secara natural
  }
}

/* ========== Ekspor untuk CLI ========== */
export async function pushPrestigeLoopAll(loadAccountsFn) {
  const accounts = await (async () => { try { return await loadAccountsFn(); } catch { return []; } })();
  if (!accounts?.length) { console.log('Tidak menemukan akun di data/accounts.json atau accounts.js.'); return; }

  console.log(colorizeLine(`\n[OK] START Push Prestige  @ accounts=${accounts.length}. Tekan Ctrl+C untuk berhenti.\n`));
  const ctrl = { stop: false };
  const onSig = () => { ctrl.stop = true; console.log(colorizeLine('\n[WARN] Stop signal diterima, tutup worker…')); };
  process.once('SIGINT', onSig);

  await Promise.all(accounts.map(a => runForAccount(a)));

  process.off('SIGINT', onSig);
  console.log('Push Prestige selesai.');
}
