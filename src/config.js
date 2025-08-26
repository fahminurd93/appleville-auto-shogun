// src/config.js — fixed config (jalan tanpa ENV)
import 'dotenv/config';

export default {
  // === Preferensi default (boleh kamu ubah) ===
  preferredSeedKey: 'golden-apple',

  // === Timing dasar ===
  tickMs: 1000,
  refreshStateMs: 30000,
  coolDownMs: 400,
  plotBuyMinCost: 10,   // minimal sisa coins di atas seed-reserve agar boleh beli plot

  // === Loop mode ===
  loopRestMs: 1500,
  idleTickMs: 10000,

  // === Auto buy plots (dieksekusi SETIAP cycle) ===
  autoExpandPlots: true, // selalu coba add plot tiap cycle
  targetPlotCount: 12,   // 0 = tanpa target; >0 = berhenti expand saat total plot mencapai angka ini
  maxAutoBuyPlots: 3,    // batas beli plot per cycle

  // === Minimal balance (RESERVE) ===
  minCoinsReserve: 2000, // sisakan minimal coins segini
  minApReserve: 50,      // sisakan minimal AP segini

  // Tampilkan info reserve di baris balance?
  showReserveInBalance: false,

  // Label countdown
  countdownLabel: 'Wait For Harvest',

  // Warna terminal
  forceColorMode: 'on', // 'on' | 'off' | 'auto'

  // === Penegakan reserve per aksi ===
  // Seeds (tanam): default FALSE → reserve TIDAK diterapkan agar tetap bisa tanam meski saldo mepet
  enforceReserveOnSeeds: false,
  // Plots & Booster: default TRUE → gunakan reserve agar saldo tidak habis untuk ekspansi/booster
  enforceReserveOnPlots: true,
  enforceReserveOnBoosters: true,

  // Endpoint TRPC
  baseUrl: 'https://app.appleville.xyz/api/trpc',

  // ===================== PUSH PRESTIGE =====================
  push: {
    // Target layout & perilaku prestige
    targetPlots: 12,
    autoPrestige: 'instant',           // 'instant' | 'safe' | 'off'
    prestigeTargetLevel: 0,            // 0 = selalu ke next level
    minRuntimeSecBeforePrestige: 0,    // minimal runtime sebelum prestige (0=tanpa batas)

    // Reserve default yang dipakai saat Push (bisa ditimpa per-phase di bawah)
    enforceReserveOnSeeds: false,
    enforceReserveOnPlots: true,
    enforceReserveOnBoosters: true,
    minCoinsReserve: 500,
    minApReserve: 50,

    // ===== Fallback progress prestige =====
    // Jika field netAp tidak tersedia/0, pakai saldo AP sebagai progress prestige.
    useApBalanceAsPrestigeProgress: true,

    // Prioritas seed & booster (urut dari paling disukai)
    coinSeedsPriority: ['wheat','lettuce','carrot','tomato','onion','strawberry','pumpkin'],
    apSeedsPriority:   ['ascendant-apple','golden-apple','crystal-apple','diamond-apple','royal-apple'],
    coinBoosterPriority: ['deadly-mix','silver-tonic','super-fertiliser','skip'],
    apBoosterPriority:   ['deadly-mix','quantum-fertilizer','golden-tonic','skip'],

    // Syarat AP untuk prestige (next level)
    prestigeReq: {
      "1": 60000, "2": 150000, "3": 300000,
      "4": 500000, "5": 750000, "6": 900000, "7": 1000000
    },

    // Dynamic seed reserve: pastikan cukup dana tanam ulang siklus berikutnya
    seedReserve: { enabled: true, basis: 'plots', multiplier: 1.05 },

    // Mode reserve saat Push: 'profiles' (pakai setting per-phase) atau 'adaptive'
    reserveMode: 'profiles',

    // Setting per-phase ketika reserveMode = 'profiles'
    reserves: {
      // Fase EXPAND (buru plot dulu)
      expand: {
        minCoinsReserve: 0,
        minApReserve: 0,
        enforceSeeds: false,
        enforcePlots: true,
        enforceBoosters: true
      },
      // Fase AP RUSH (kejar AP untuk prestige)
      rush: {
        minCoinsReserve: 1000,
        minApReserve: 100,
        enforceSeeds: false,
        enforcePlots: true,
        enforceBoosters: true
      }
    },

    // Mode reserve ADAPTIVE (aktif jika reserveMode='adaptive')
    // Reserve tumbuh sesuai jumlah plot
    adaptive: {
      baseCoins: 0, baseAp: 0,
      perPlotCoins: 80, perPlotAp: 5,
      maxCoins: 2000, maxAp: 150
    }
  },
  // =================== END PUSH PRESTIGE ===================
};
