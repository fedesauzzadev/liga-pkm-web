# Primer commit y push al repo privado

## Objetivo

Inicializar git en el proyecto, crear el primer commit con todo el código generado y publicarlo en el repo privado de GitHub (HTTPS).

## Criterios de aceptación

- [ ] AC-1: Git inicializado con rama por defecto `main`.
- [ ] AC-2: Ningún archivo prohibido queda versionado: `.env*`, `apps/web/public/{sprites,fx}`, `content/reference/`, `content/photos`, `docs/reference/*.{pdf,jpg,png}` (cubiertos por `.gitignore`, verificado con `git check-ignore` y revisión de `git status`).
- [ ] AC-3: `node_modules/` y `dist/` no aparecen en el staging.
- [ ] AC-4: Remote `origin` configurado con la URL HTTPS de GitHub.
- [ ] AC-5: Primer commit creado con mensaje descriptivo (ej: `chore: kickoff del proyecto`).
- [ ] AC-6: Push exitoso: `git status` reporta la rama sincronizada con `origin/main` y `git ls-remote origin main` devuelve el SHA del commit.

## Archivos involucrados

- `.gitignore` (ya existe; solo se verifica, no se modifica salvo hueco detectado)
- `.git/` (nuevo: init, config con remote)
- Todo el árbol del proyecto (primer commit): `apps/`, `packages/`, `content/`, `docs/`, `specs/`, `tasks/`, `tests/`, `tools/`, `*.json`, `*.mjs`, `*.ts`, `*.md` de raíz
- URL del remote: `https://github.com/<usuario>/liga-pkm-web.git` (confirmar usuario real antes del push)

## Plan de pasos

1. `git init -b main` en la raíz del proyecto.
2. Verificar exclusiones: `git check-ignore` sobre rutas prohibidas y revisar `git status --porcelain` (sin `node_modules`, `dist`, `.env`, assets privados).
3. `git add .` y revisar `git status` + `git diff --cached --stat` antes de commitear.
4. Commit con mensaje `chore: kickoff del proyecto` (ajustar al estilo si el jefe indica otro).
5. `git remote add origin https://github.com/<usuario>/liga-pkm-web.git`.
6. `git push -u origin main`.

## Comandos de verificación

```powershell
git status                          # rama main, sincronizada con origin/main, working tree clean
git log --oneline -1                # existe el primer commit
git ls-remote origin main           # devuelve el SHA pusheado
git check-ignore .env apps/web/public/sprites content/reference docs/reference   # confirma exclusiones
git ls-files | Select-String "node_modules|\.env$|sprites|content/reference"     # sin resultados
```
