// Uso: node tools/merge-backlog.mjs
// Pasa los estados (TODO/DOING/REVIEW/DONE) y las casillas tildadas del backlog/checklist VIEJOS
// a los archivos *.new.md, y los deja como BACKLOG.md / OWNER-REVIEW.md (guarda copia .bak).
// Si el archivo nuevo marca una tarea como CANCELADA, esa marca gana sobre el estado viejo.
// Además fusiona la sección "Notas de orden:" del viejo: cualquier nota viva que el nuevo
// no traiga se preserva (Q-077/Q-089: el merge pisaba las notas y perdió el congelado T-098).
import fs from 'node:fs';
const pairs = [
  ['tasks/BACKLOG.md', 'tasks/BACKLOG.new.md'],
  ['tasks/OWNER-REVIEW.md', 'tasks/OWNER-REVIEW.new.md'],
];

// Extrae las notas vivas de la sección "Notas de orden:" (bullets - … hasta EOF u otra sección).
function extractNotes(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^Notas de orden:\s*$/.test(l));
  if (start === -1) return [];
  const notes = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('- ')) notes.push(l);
    else if (l.trim() === '' || l.startsWith('#')) break;
    else break;
  }
  return notes;
}

for (const [oldP, newP] of pairs) {
  if (!fs.existsSync(newP)) { console.log(`(sin ${newP}, salteado)`); continue; }
  const oldTxt = fs.existsSync(oldP) ? fs.readFileSync(oldP, 'utf8') : '';
  const status = new Map(), checked = new Map();
  for (const l of oldTxt.split('\n')) {
    if (l.startsWith('|')) {
      const c = l.split('|');
      if (c.length < 7) continue;
      const id = c[1].replace(/\*/g, '').trim(), st = c[c.length - 2].trim();
      if (/^(T-|G)/.test(id) && st && st !== 'Estado') status.set(id, st);
    }
    const m = l.match(/^- \[( |x|X)\] (T-[0-9a-z]+)\b/);
    if (m) checked.set(m[2], m[1].toLowerCase() === 'x');
  }
  const newLines = fs.readFileSync(newP, 'utf8').split('\n');
  const outLines = newLines.map((l) => {
    if (l.startsWith('|')) {
      const c = l.split('|');
      if (c.length >= 7) {
        const id = c[1].replace(/\*/g, '').trim();
        const newSt = c[c.length - 2].trim();
        if (newSt === 'CANCELADA') return l;
        if (status.has(id)) { c[c.length - 2] = ` ${status.get(id)} `; return c.join('|'); }
      }
    }
    const m = l.match(/^- \[( |x)\] (T-[0-9a-z]+)\b/);
    if (m && checked.get(m[2])) return l.replace('- [ ]', '- [x]');
    return l;
  });
  // Fusionar notas: las del viejo ausentes en el nuevo se insertan tras "Notas de orden:".
  const oldNotes = extractNotes(oldTxt);
  if (oldNotes.length > 0) {
    const newNoteSet = new Set(outLines.filter((l) => l.startsWith('- ')));
    const missing = oldNotes.filter((n) => !newNoteSet.has(n));
    if (missing.length > 0) {
      const idx = outLines.findIndex((l) => /^Notas de orden:\s*$/.test(l));
      if (idx !== -1) outLines.splice(idx + 1, 0, ...missing);
      else outLines.push('Notas de orden:', ...missing);
      console.log(`${oldP}: ${missing.length} nota(s) de orden preservada(s) del viejo`);
    }
  }
  const out = outLines.join('\n');
  if (fs.existsSync(oldP)) fs.copyFileSync(oldP, oldP + '.bak');
  fs.writeFileSync(oldP, out);
  console.log(`${oldP}: actualizado (${status.size} estados y ${[...checked.values()].filter(Boolean).length} casillas conservados)`);
}
