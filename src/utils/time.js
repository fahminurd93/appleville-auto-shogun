// src/utils/time.js
export function fmtSec(s){
  s = Math.max(0, Math.ceil(s));
  if (s >= 3600) { const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); return `${h}h${String(m).padStart(2,'0')}m`; }
  if (s >= 60)    { const m = Math.floor(s/60);    const ss = s%60; return `${m}m${String(ss).padStart(2,'0')}s`; }
  return `${s}s`;
}
