// data/seeds.js
// Mirroring struktur CLI: key, name, growSeconds, currency, price, yield
export const SEEDS = {
  "wheat":          { key: "wheat",          name: "wheat",               growSeconds: 5,     currency: "coins", price: 2,   yield: 2 },
  "lettuce":        { key: "lettuce",        name: "lettuce",             growSeconds: 30,    currency: "coins", price: 8,   yield: 8 },
  "golden-apple":   { key: "golden-apple",   name: "golden-apple",        growSeconds: 120,   currency: "ap",    price: 10,  yield: 10 },
  "carrot":         { key: "carrot",         name: "carrot",              growSeconds: 180,   currency: "coins", price: 25,  yield: 25 },
  "crystal-apple":  { key: "crystal-apple",  name: "crystal-apple",       growSeconds: 600,   currency: "ap",    price: 40,  yield: 40 },
  "tomato":         { key: "tomato",         name: "tomato",              growSeconds: 900,   currency: "coins", price: 80,  yield: 80 },
  "onion":          { key: "onion",          name: "onion",               growSeconds: 3600,  currency: "coins", price: 200, yield: 200 },
  "diamond-apple":  { key: "diamond-apple",  name: "diamond-apple",       growSeconds: 3600,  currency: "ap",    price: 150, yield: 150 },
  "strawberry":     { key: "strawberry",     name: "strawberry",          growSeconds: 14400, currency: "coins", price: 600, yield: 600 },
  "platinum-apple": { key: "platinum-apple", name: "Platinum Apple",      growSeconds: 14400, currency: "ap",    price: 500, yield: 500 },
  "pumpkin":        { key: "pumpkin",        name: "pumpkin",             growSeconds: 43200, currency: "coins", price: 750, yield: 750 },
  "royal-apple":    { key: "royal-apple",    name: "Royal Apple",         growSeconds: 43200, currency: "ap",    price: 1500, yield: 1500 },
  // === AP prestige seeds (baru) ===
  "legacy-apple":   { key:"legacy-apple",   name:"Legacy apple (P1)",   growSeconds: 60,    currency:"ap", price: 8,    yield: 8,    minPrestige: 1 },
  "ascendant-apple":{ key:"ascendant-apple",name:"Ascendant Apple (P2)",growSeconds: 300,   currency:"ap", price: 60,   yield: 60,   minPrestige: 2 },
  "relic-apple":    { key:"relic-apple",    name:"Relic Apple (P3)",    growSeconds: 2700,  currency:"ap", price: 120,  yield: 120,  minPrestige: 3 },
  "ethereal-apple": { key:"ethereal-apple", name:"Ethereal Apple (P4)", growSeconds: 7200,  currency:"ap", price: 400,  yield: 400,  minPrestige: 4 },
  "quantum-apple":  { key:"quantum-apple",  name:"Quantum Apple (P5)",  growSeconds: 28800, currency:"ap", price: 1500, yield: 1500, minPrestige: 5 },
  "celestial-apple":{ key:"celestial-apple",name:"Celestial Apple (P6)",growSeconds: 36000, currency:"ap", price: 2500, yield: 2500, minPrestige: 6 },
  "apex-apple":     { key:"apex-apple",     name:"Apex Apple (P7)",     growSeconds: 43200, currency:"ap", price: 3000, yield: 3000, minPrestige: 7 }

};

export const seedList = () => Object.values(SEEDS);
