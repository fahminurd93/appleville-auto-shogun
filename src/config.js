// src/config.js — fixed config (jalan tanpa ENV)
import 'dotenv/config';

export default {
  // === Preferensi default (boleh kamu ubah) ===
  preferredSeedKey: 'golden-apple',

  // === Timing dasar ===
  tickMs: 1000,
  refreshStateMs: 30000,
  coolDownMs: 400,

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
};
