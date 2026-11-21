# Plan resolver-open-questions — Reducir las preguntas abiertas de OPEN-QUESTIONS.md

## Contexto
`docs/OPEN-QUESTIONS.md` acumula ~45 preguntas en estado `abierta`. Muchas son
ratificaciones de defaults ya aplicados que el dueño nunca confirmó; otras quedaron
obsoletas (moot) por decisiones posteriores registradas en el propio archivo.

## Objetivo
Cerrar el máximo de preguntas `abierta` **sin abrir tareas nuevas de features**:
1. **Cierre por obsolescencia (moot)** con cita de la evidencia existente en el repo:
   - Q-051 (presupuesto modelos 2 MB): resuelta de hecho por Q-053 → Q-061 (20 MB,
     confirmado por dueño) → Q-090 (24 → 36 MB, confirmado por dueño).
   - Q-052 (texturas GLB externas): Q-053 registra "Resuelve también el bloqueo de
     Q-051/Q-052 (import ejecutado)".
   - Q-055 (e2e t082 "Recentrar"): `e2e/t082-hud.mjs:140` ya espera
     "Centrar en mí,Vista general".
2. **Ratificación del dueño** (question tool) de defaults ya implementados, en un único
   lote: Q-037, Q-038, Q-050, Q-054, Q-076+Q-086+Q-087 (nombres de reportes), Q-092,
   Q-093, Q-095, Q-100, Q-102, y una consulta por derivar las deudas de split
   (Q-031/Q-036/Q-056/Q-103).
3. Lo confirmado se marca `resuelta por dueño (2026-10-28): …`; lo rechazado se registra
   con la decisión y, si exige código, queda `abierta` con la derivación anotada.

## Fuera de alcance
- Preguntas que requieren revisión visual del dueño fuera del chat (shots/boceto:
  Q-035, Q-041..Q-048, Q-057..Q-060, Q-066..Q-067, Q-072, Q-042..Q-044).
- Preguntas del pipeline OCR que exigen trabajo del dueño (etiquetar/re-escanear:
  Q-078..Q-088, salvo las de nombres).
- Administrativas que se cierran solas al cerrar tareas (Q-065, Q-070).
- Cambios de motor/UI: solo docs/estados; si una respuesta lo exige, se deriva, no se
  implementa en esta tarea.

## AC
- AC-1: Q-051, Q-052 y Q-055 figuran `cerrada (2026-10-28, resolver-open-questions)`
  con cita de la evidencia que las vuelve moot.
- AC-2: cada pregunta del lote queda con estado final coherente con la respuesta del
  dueño (`resuelta por dueño (2026-10-28): …` o `abierta` con derivación).
- AC-3: no se modifica código de motor/UI ni `content/` de juego (salvo que una
  respuesta exija un cambio trivial de test, que se documenta en el reporte).
- AC-4: `pnpm verify` verde (reintento permitido por el ruido de bench ya registrado en
  Q-014/Q-040/Q-093/Q-101).
- AC-5: reporte ≤ 60 líneas en `tasks/reports/resolver-open-questions.md`.
