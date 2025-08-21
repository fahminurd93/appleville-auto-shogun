// data/seeds.js
// Mirroring struktur CLI: key, name, growSeconds, currency, price, yield
export const SEEDS = {
  "wheat":          { key: "wheat",          name: "wheat",          growSeconds: 5,     currency: "coins", price: 2,   yield: 2 },
  "lettuce":        { key: "lettuce",        name: "lettuce",        growSeconds: 30,    currency: "coins", price: 8,   yield: 8 },
  "golden-apple":   { key: "golden-apple",   name: "golden-apple",   growSeconds: 120,   currency: "ap",    price: 10,  yield: 10 },
  "carrot":         { key: "carrot",         name: "carrot",         growSeconds: 180,   currency: "coins", price: 25,  yield: 25 },
  "crystal-apple":  { key: "crystal-apple",  name: "crystal-apple",  growSeconds: 600,   currency: "ap",    price: 40,  yield: 40 },
  "tomato":         { key: "tomato",         name: "tomato",         growSeconds: 900,   currency: "coins", price: 80,  yield: 80 },
  "onion":          { key: "onion",          name: "onion",          growSeconds: 3600,  currency: "coins", price: 200, yield: 200 },
  "diamond-apple":  { key: "diamond-apple",  name: "diamond-apple",  growSeconds: 3600,  currency: "ap",    price: 150, yield: 150 },
  "royal-apple":    { key: "royal-apple",    name: "royal-apple",    growSeconds: 18000, currency: "ap",    price: 500, yield: 500 },
  "strawberry":     { key: "strawberry",     name: "strawberry",     growSeconds: 14400, currency: "coins", price: 600, yield: 600 },
  "pumpkin":        { key: "pumpkin",        name: "pumpkin",        growSeconds: 43200, currency: "coins", price: 1500, yield: 1500 }
};

export const seedList = () => Object.values(SEEDS);
