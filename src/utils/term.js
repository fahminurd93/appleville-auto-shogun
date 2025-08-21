// src/utils/term.js — pewarna & styling terminal (tanpa dependency)
export const supportsColor = process.env.NO_COLOR ? false : !!(process.stdout && process.stdout.isTTY);
const wrap = (code) => (s) => supportsColor ? `\x1b[${code}m${s}\x1b[0m` : String(s);

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
  const s = '─'.repeat(width);
  return supportsColor ? c.gray(s) : s;
}

// Warna baris berdasarkan emoji prefix yang kita pakai di log
export function colorizeLine(msg) {
  if (!supportsColor) return msg;
  if (msg.startsWith('✅')) return c.green(msg);
  if (msg.startsWith('❌')) return c.red(msg);
  if (msg.startsWith('⚠️')) return c.yellow(msg);
  if (msg.startsWith('🧱')) return c.magenta(msg);
  if (msg.startsWith('🌱')) return c.green(msg);
  if (msg.startsWith('🛒')) return c.cyan(msg);
  if (msg.startsWith('✨')) return c.magenta(msg);
  if (msg.startsWith('💰')) return c.yellow(msg);
  if (msg.startsWith('🕒')) return c.gray(msg);
  if (msg.startsWith('🚀')) return c.blue(msg);
  if (msg.startsWith('📦')) return c.cyan(msg);
  return msg;
}

// pilih warna stabil per akun (hash sederhana dari nama)
export function pickNameColor(name) {
  const palette = [c.cyan, c.green, c.magenta, c.yellow, c.blue];
  let h = 0;
  for (const ch of String(name)) h = (h + ch.charCodeAt(0)) % palette.length;
  return palette[h];
}
