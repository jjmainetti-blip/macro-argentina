// Extracción mínima de texto de un PDF (streams FlateDecode, operadores Tj/TJ/'), sin dependencias: corre en Workers.
export async function pdfText(buf, maxStreams = 60) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const latin = new TextDecoder('latin1').decode(u8);
  const out = [];
  let pos = 0, n = 0;
  while (n < maxStreams) {
    const s = latin.indexOf('stream', pos); if (s < 0) break;
    if (latin.slice(s - 3, s) === 'end') { pos = s + 6; continue; }
    const dictStart = latin.lastIndexOf('<<', s), dict = latin.slice(dictStart, s);
    let start = s + 6; if (latin[start] === '\r') start++; if (latin[start] === '\n') start++;
    const e = latin.indexOf('endstream', start); if (e < 0) break;
    pos = e + 9;
    if (!/FlateDecode/.test(dict) || /ASCII85|ASCIIHex|\/Subtype\s*\/(Image|Type1C|CIDFontType0C)|\/Length1|\/Length2/.test(dict)) continue;
    n++;
    // v159 · Se recorta el stream exacto: /Length directo si está, o se quitan los saltos de línea previos a
    // "endstream". En Cloudflare Workers, DecompressionStream descarta todo el stream si hay bytes sobrantes al final.
    const L = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
    let end = L ? Math.min(start + Number(L[1]), e) : e;
    if (!L) while (end > start && (u8[end - 1] === 10 || u8[end - 1] === 13)) end--;
    try {
      const txt = await inflate(u8.subarray(start, end));
      if (!/T[jJ]/.test(txt)) continue;
      out.push(contentText(txt));
    } catch { }
  }
  return out.join('\n');
}
// Descomprime tolerando bytes sobrantes al final del stream (comunes en PDFs: \r\n antes de endstream).
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate'), w = ds.writable.getWriter(), r = ds.readable.getReader();
  w.write(bytes).catch(() => { }); w.close().catch(() => { });
  const parts = []; let len = 0;
  try { for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); len += value.length; } } catch { }
  const all = new Uint8Array(len); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  return new TextDecoder('latin1').decode(all);
}
function unesc(s) { return s.replace(/\\(\d{1,3}|.)/g, (_, c) => /^\d+$/.test(c) ? String.fromCharCode(parseInt(c, 8)) : ({ n: '\n', r: '', t: ' ', '(': '(', ')': ')', '\\': '\\' }[c] ?? c)); }
function contentText(c) {
  let r = '';
  const re = /\[((?:\\.|[^\]])*)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")|(T\*|Td|TD|Tm|ET)\b/g; let m;
  while ((m = re.exec(c))) {
    if (m[1] != null) { for (const p of m[1].matchAll(/\(((?:\\.|[^\\)])*)\)|(-?\d+(?:\.\d+)?)/g)) { if (p[1] != null) r += unesc(p[1]); else if (Number(p[2]) < -200) r += ' '; } }
    else if (m[2] != null) r += unesc(m[2]);
    else r += ' ';
  }
  return r.replace(/\s+/g, ' ');
}
