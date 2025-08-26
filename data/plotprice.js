// data/plotprice.js
// Harga untuk MEMBELI plot berikutnya ketika saat ini kamu punya N plot.
// Key = plotsNow (jumlah plot saat INI). Value = biaya untuk N+1.
//
// Contoh: ketika plotsNow=1, harga plot ke-2 adalah 25 coins.
//
// Sumber data dari kamu:
// plot 1 = 0
// plot 2 = 25 Coin
// plot 3 = 100 Coin
// plot 4 = 500 Coin
// plot 5 = 300 Ap
// plot 6 = 1000 Ap
// plot 7 = 2500 Coin
// plot 8 = 2500 Ap
// plot 9 = 10000 Coin
// plot 10 = 5000 Ap
// plot 11 = 25000 Coin
// plot 12 = 15000 Ap

export const PLOT_PRICES = {
  1:  { coins: 0,     ap: 0,      note: 'base plot gratis' }, // ? beli plot ke-1
  2:  { coins: 25,    ap: 0      }, // ? beli plot ke-2
  3:  { coins: 100,   ap: 0      }, // ? beli plot ke-3
  4:  { coins: 500,   ap: 0      }, // ? beli plot ke-4
  5:  { coins: 0,     ap: 300    }, // ? beli plot ke-5
  6:  { coins: 0,     ap: 1000   }, // ? beli plot ke-6
  7:  { coins: 2500,  ap: 0      }, // ? beli plot ke-7
  8:  { coins: 0,     ap: 2500   }, // ? beli plot ke-8
  9:  { coins: 10000, ap: 0      }, // ? beli plot ke-9
  10:  { coins: 0,     ap: 5000  }, // ? beli plot ke-10
  11: { coins: 25000, ap: 0      }, // ? beli plot ke-11
  12: { coins: 0,     ap: 15000  }, // ? beli plot ke-12
};

export function nextPlotCost(plotsNow) {
  const rec = PLOT_PRICES?.[Number(plotsNow) || 0] || {};
  return {
    coins: Number(rec.coins || 0),
    ap:    Number(rec.ap    || 0),
    found: Boolean((rec.coins ?? 0) > 0 || (rec.ap ?? 0) > 0),
  };
}
