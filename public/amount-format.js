// v243 · Separadores de miles mientras se escribe un monto (calculadoras y conversor de monedas).
// Formato argentino: punto para miles, coma para decimales. Los puntos los pone el sitio; si alguien escribe un punto
// y todavía no hay coma, se toma como coma decimal. Escucha en fase de captura para que las calculadoras lean el valor
// ya formateado (todas aceptan "1.234.567,89").
(() => {
  const IDS = new Set(['updateAmount', 'uvaAmount', 'ccAmount', 'fxcAmount']);
  const sig = ch => /[\d,]/.test(ch);

  function format(raw) {
    let t = String(raw).replace(/[^\d,]/g, '');
    const c = t.indexOf(',');
    if (c >= 0) t = t.slice(0, c + 1) + t.slice(c + 1).replace(/,/g, '');
    let [int, dec] = c >= 0 ? [t.slice(0, c), t.slice(c + 1)] : [t, null];
    int = int.replace(/^0+(?=\d)/, '');
    if (dec != null && !int) int = '0';
    const withDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return dec != null ? `${withDots},${dec.slice(0, 4)}` : withDots;
  }

  function apply(el, typedDot, pasted) {
    let v = el.value, pos = el.selectionStart ?? v.length;
    // Pegado con punto decimal ("1500.50"): el punto es la coma.
    if (pasted && /^\s*\d+\.\d{1,2}\s*$/.test(v)) v = v.replace('.', ',');
    // Un punto recién escrito, sin coma todavía: es la coma decimal.
    if (typedDot && !v.includes(',')) { const i = pos - 1; if (v[i] === '.') { v = v.slice(0, i) + ',' + v.slice(i + 1); } }
    const before = [...v.slice(0, pos)].filter(sig).length, out = format(v);
    if (out === el.value) return;
    el.value = out;
    let n = 0, p = 0; while (p < out.length && n < before) { if (sig(out[p])) n++; p++; }
    try { el.setSelectionRange(p, p); } catch {}
  }

  document.addEventListener('input', e => {
    const el = e.target; if (!(el instanceof HTMLInputElement) || !IDS.has(el.id)) return;
    apply(el, e.inputType === 'insertText' && e.data === '.', e.inputType === 'insertFromPaste');
  }, true);
  // Valores iniciales (por ejemplo, el "1.000" del conversor) y montos pegados con otro formato.
  const init = () => { for (const id of IDS) { const el = document.getElementById(id); if (el && el.value && !/^[\d.]*(,\d*)?$/.test(el.value)) el.value = format(el.value); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
