// data/boosters.js
// Mirroring struktur CLI: speedMult & yieldMult untuk estimasi ETA/yield
export const BOOSTERS = {
  "skip":               { key: "skip",               name: "No Booster",          durationSeconds: 0,    currency: null,   price: 0,   speedMult: 1.0,  yieldMult: 1.0 },
  "fertiliser":         { key: "fertiliser",         name: "Fertiliser",          durationSeconds: 3600, currency: "coins", price: 18,  speedMult: 1.43, yieldMult: 1.0 },
  "silver-tonic":       { key: "silver-tonic",       name: "Silver Tonic",        durationSeconds: 3600, currency: "coins", price: 15,  speedMult: 1.0,  yieldMult: 1.25 },
  "super-fertiliser":   { key: "super-fertiliser",   name: "Super Fertiliser",    durationSeconds: 3600, currency: "ap",    price: 25,  speedMult: 2.0,  yieldMult: 1.0 },
  "golden-tonic":       { key: "golden-tonic",       name: "Golden Tonic",        durationSeconds: 3600, currency: "ap",    price: 50,  speedMult: 1.0,  yieldMult: 2.0 },
  "deadly-mix":         { key: "deadly-mix",         name: "Deadly Mix",          durationSeconds: 3600, currency: "ap",    price: 150, speedMult: 7.0,  yieldMult: 0.6 },
  "quantum-fertilizer": { key: "quantum-fertilizer", name: "Quantum Fertilizer",  durationSeconds: 3600, currency: "ap",    price: 175, speedMult: 2.5,  yieldMult: 1.5 }
};

export const boosterList = () => Object.values(BOOSTERS);
