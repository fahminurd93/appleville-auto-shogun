// data/boosters.js
// Mirroring struktur CLI: speedMult & yieldMult untuk estimasi ETA/yield
export const BOOSTERS = {
  "skip":               { key: "skip",               name: "No Booster",          durationSeconds: 0,    currency: null,   price: 0,   speedMult: 1.0,  yieldMult: 1.0 },
  "fertiliser":         { key: "fertiliser",         name: "Fertiliser",          durationSeconds: 43200, currency: "coins", price: 10,   speedMult: 1.43, yieldMult: 1.0 },
  "silver-tonic":       { key: "silver-tonic",       name: "Silver Tonic",        durationSeconds: 43200, currency: "coins", price: 15,   speedMult: 1.00, yieldMult: 1.25 },
  "super-fertiliser":   { key: "super-fertiliser",   name: "Super Fertiliser",    durationSeconds: 43200, currency: "ap",    price: 25,   speedMult: 2.00, yieldMult: 1.0 },
  "golden-tonic":       { key: "golden-tonic",       name: "Golden Tonic",        durationSeconds: 43200, currency: "ap",    price: 50,   speedMult: 1.00, yieldMult: 2.0 },
  "deadly-mix":         { key: "deadly-mix",         name: "Deadly Mix",          durationSeconds: 43200, currency: "ap",    price: 150,  speedMult: 8.00, yieldMult: 0.6 },
  "quantum-fertilizer": { key: "quantum-fertilizer", name: "Quantum Fertilizer",  durationSeconds: 43200, currency: "ap",    price: 175,  speedMult: 2.50, yieldMult: 1.5 },

  "potion-of-gains":    { key: "potion-of-gains",    name: "Potion of Gains",     durationSeconds: 43200, currency: "ap",    price: 15,   speedMult: 1.67, yieldMult: 1.0 },
  "elixir-of-degens":   { key: "elixir-of-degens",   name: "Elixir of Degens",    durationSeconds: 43200, currency: "ap",    price: 30,   speedMult: 1.00, yieldMult: 1.75 },
  "giga-brew":          { key: "giga-brew",          name: "Giga Brew",           durationSeconds: 43200, currency: "ap",    price: 75,   speedMult: 1.67, yieldMult: 1.4 },
  "wild-growth":        { key: "wild-growth",        name: "Wild Growth",         durationSeconds: 43200, currency: "ap",    price: 100,  speedMult: 0.80, yieldMult: 3.0 },
  "warp-time-elixir":   { key: "warp-time-elixir",   name: "Warp-Time Elixir",    durationSeconds: 43200, currency: "ap",    price: 500,  speedMult: 5.00, yieldMult: 1.0 },
  "titans-growth":      { key: "titans-growth",      name: "Titan's Growth",      durationSeconds: 86400, currency: "ap",    price: 1000, speedMult: 0.67, yieldMult: 5.0 },
  "apex-potion":        { key: "apex-potion",        name: "Apex Potion",         durationSeconds: 43200, currency: "ap",    price: 5000, speedMult: 3.33, yieldMult: 2.0 }
};

export const boosterList = () => Object.values(BOOSTERS);
