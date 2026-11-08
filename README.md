# Realbook Strudel

Biblioteca de canciones en archivos individuales para interpretarlas y editarlas con [Strudel](https://strudel.cc/). Incluye:

- interfaz web estática con búsqueda, reproducción, pausa, edición local, importación y exportación;
- TUI de Node.js para buscar, crear y editar archivos del catálogo;
- despliegue automático a GitHub Pages al actualizar `main`.

## Importante: derechos de autor

El *Real Book* y muchas de sus transcripciones están protegidos por copyright. Este repositorio **no incluye canciones ni arreglos del Real Book**: solo dos demostraciones originales CC0. Añade únicamente obras de dominio público o contenido para el que tengas autorización de distribución, e indica su licencia en cada JSON.

Strudel usa AGPL-3.0-or-later; por ello este proyecto se distribuye bajo la misma licencia. Consulta `LICENSE`.

## Inicio rápido

```bash
npm install
npm run validate:songs
npm run dev
```

Abre la URL que muestra Vite. La edición en GitHub Pages se guarda en `localStorage`; usa **Descargar JSON** y añade el archivo a `songs/` para que forme parte del catálogo publicado.

### TUI

```bash
npm run tui
```

La TUI gestiona los JSON locales y muestra el código Strudel. La reproducción de audio se realiza en la interfaz web, porque Strudel usa Web Audio y el navegador exige una interacción del usuario antes de reproducir sonido.

## Formato de una canción

Cada archivo `songs/<id>.json` contiene metadatos y código ejecutable de Strudel:

```json
{
  "schemaVersion": 1,
  "id": "mi-cancion",
  "title": "Mi canción",
  "composer": "Autor/a",
  "key": "C major",
  "tempo": 120,
  "form": "AABA",
  "tags": ["swing"],
  "license": "CC0-1.0",
  "strudel": "setcps(120 / 60)\\nnote(\"c4 e4 g4\").s(\"triangle\")"
}
```

Valida el catálogo antes de hacer commit:

```bash
npm run validate:songs
```

## Publicación en GitHub Pages

El workflow `.github/workflows/deploy-pages.yml` construye y publica el sitio. Tras el primer push, en **Settings → Pages** selecciona **GitHub Actions** como fuente de despliegue si GitHub no la activa automáticamente. El sitio quedará disponible en `https://bogard1.github.io/realbook-strudel/`.
