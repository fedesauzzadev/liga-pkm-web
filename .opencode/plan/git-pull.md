# Actualizar el repo con git pull

## Objetivo
Traer la última versión de `origin/main` y dejar el entorno local listo para seguir laburando (dependencias al día, verificación verde).

## Criterios de aceptación
- [ ] `git pull --ff-only origin main` completa sin conflictos (working tree estaba limpio).
- [ ] `git status` muestra branch sincronizada con `origin/main` y tree limpio.
- [ ] Si cambió `pnpm-lock.yaml`, se corrió `pnpm install` y termina OK.
- [ ] `pnpm verify` da verde (typecheck + lint + test + content:validate + build).

## Archivos involucrados
- Ninguno editado a mano (solo sync).
- `pnpm-lock.yaml` — solo si el pull lo actualiza (dispara `pnpm install`).

## Plan de pasos
1. `git status` — confirmar tree limpio y rama `main`.
2. `git pull --ff-only origin main`.
3. Verificar si `pnpm-lock.yaml` cambió en el pull; si sí, `pnpm install`.
4. Correr verificación completa (`pnpm verify`).
5. Revisar `pnpm digest` por si cambiaron reglas/docs que afecten la tarea en curso.

## Comandos de verificación
```powershell
git status
git pull --ff-only origin main
git log --oneline -5
pnpm install   # solo si cambió pnpm-lock.yaml
pnpm verify
```
