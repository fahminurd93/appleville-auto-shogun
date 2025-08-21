Appleville CLI Menu v4.3 — Booster Auto (buy & apply)
=====================================================

Baru di v4.3:
- **Beli booster** via `core.buyItem` dengan `type: "MODIFIER"`.
- **Apply booster** via `core.applyModifier` payload `{applications:[{slotIndex, modifierKey}]}`.
- Aksi Plant (Auto Cycle) sekarang otomatis:
  start → harvest matang → (opsional) buy plot → buy **seeds & booster** → plant → **apply booster** → tunggu → harvest.

Rute tRPC (non-CLI parity):
- GET `auth.me,core.getState`
- POST `core.buyItem` (`SEED` & `MODIFIER`)
- POST `core.plantSeed`
- POST `core.harvest`
- POST `core.buyPlot` (payload **null**)
- POST `core.applyModifier`

Konfigurasi & data:
- `data/seeds.js` & `data/boosters.js` dipakai untuk pilihan & ETA fallback.
- Signature header membedakan `null` vs `{}` (penting untuk buy plot).

Cara pakai:
1) Isi cookie (data/accounts.json atau .env RAW_COOKIE).
2) `npm start` → pilih akun → Plant (Auto Cycle) → pilih Seed & Booster, dan opsi buy plot / tunggu panen.


Troubleshooting:
- Jika masih "no payload", jalankan dengan DEBUG=1 untuk cetak raw:
  DEBUG=1 node src/cli.js
  Kirim 200–400 karakter pertama dari RAW (tanpa cookie) agar pola respons bisa dipetakan.


v4.3.5 notes: getState tries `state.getState` (null) → `state.getState` ({}) → `auth.me,core.getState`.


v4.3.8 notes (Multi-Account):
- CLI membaca cookie dari:
  - data/accounts.json  → array ATAU { "accounts": [...] }
  - data/accounts.js / config/accounts.js / config/account.js / accounts.js / account.js
- Field yang diterima: rawCookie | cookie | RAW_COOKIE | raw_cookie
- Saat banyak akun → tampilkan daftar untuk dipilih
- Menu tambahan: "Ganti akun"


v4.4.0 notes:
- GET tRPC sekarang ikut bertanda tangan (x-meta-hash, x-client-time, x-trace-id)
  - GET tanpa input → sign(undefined)
  - GET dengan input=null → sign(null)
- getState mencoba urutan: GET(noinput) → GET(input=null) → POST(null) → POST({}) → fallback non-CLI (GET noinput & input).
- Multi-akun stabil (format array atau {accounts:[]}), menu Ganti Akun tetap ada.
- DEBUG level: set DEBUG=1 untuk preview raw, DEBUG=2 untuk header+URL trace.
