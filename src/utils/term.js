// src/utils/term.js � pewarna & styling terminal (tanpa dependency)

// Deteksi dukungan warna (bisa dipaksa via env FORCE_COLOR=1 atau NO_COLOR=1)
const _supports =
  process.env.NO_COLOR ? false :
  process.env.FORCE_COLOR === '1' ? true :
  !!(process.stdout && process.stdout.isTTY);

export const supportsColor = _supports;
const wrap = (code) => (s) => _supports ? `\x1b[${code}m${s}\x1b[0m` : String(s);

export const c = {
  dim:     wrap('2'),
  gray:    wrap('90'),
  red:     wrap('31'),
  green:   wrap('32'),
  yellow:  wrap('33'),
  blue:    wrap('34'),
  magenta: wrap('35'),
  cyan:    wrap('36'),
  bold:    wrap('1'),
};

export function line(width = 60) {
  const s = '-'.repeat(width);
  return _supports ? c.gray(s) : s;
}

// Map prefix ? warna. Termasuk fallback ASCII & �mojibake� (kalau emoji rusak jadi ???)
const COLOR_MAP = [
  { t: ['?','[OK]','✅'],            clr: c.green   },
  { t: ['?','[ERR]','✝','?'],       clr: c.red     },
  { t: ['??','?','[WARN]','� ️'],   clr: c.yellow  },
  { t: ['??','?','[i]','ℹ️'],     clr: c.cyan    },
  { t: ['??','[PLOT]'],                clr: c.cyan    },
  { t: ['???','[RESV]','??'],           clr: c.yellow  },
  { t: ['??','[PLANT]','🌱'],        clr: c.green   },
  { t: ['??','[BUY]','🛒'],          clr: c.cyan    },
  { t: ['?','[BOOST]','✨'],          clr: c.magenta },
  { t: ['??','[BAL]','💰'],          clr: c.yellow  },
  { t: ['??','[WAIT]','🕒'],          clr: c.gray    },
  { t: ['??','[RUSH]','🚀'],          clr: c.blue    },
  { t: ['??','[PROG]','📈'],          clr: c.cyan    },
  { t: ['??','?','->','→','[?]'],     clr: c.blue    },
  { t: ['??','[RELOAD]','♻️'],      clr: c.cyan    },
  { t: ['?','[RETRY]'],                clr: c.yellow  },
];

// Warnai baris berdasarkan prefix
export function colorizeLine(msg) {
  if (!_supports) return msg;
  const s = String(msg);
  for (const { t, clr } of COLOR_MAP) {
    for (const token of t) {
      if (s.startsWith(token)) return clr(s);
    }
  }
  return s;
}

// Pilih warna stabil per akun (hash sederhana dari nama)
export function pickNameColor(name) {
  const palette = [c.cyan, c.green, c.magenta, c.yellow, c.blue];
  let h = 0;
  for (const ch of String(name)) h = (h + ch.charCodeAt(0)) % palette.length;
  return palette[h];
}
