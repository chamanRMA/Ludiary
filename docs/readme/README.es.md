<p align="right"><a href="../../README.md">English</a> · <b>Español</b></p>

# Ludiary

**Una sola biblioteca para todos tus juegos de PC — Steam, GOG, Epic, Ubisoft y EA — que se lanzan desde una única aplicación web local.**

![Licencia: GPL-3.0](https://img.shields.io/badge/licencia-GPL--3.0--only-blue)
![Plataforma: Windows](https://img.shields.io/badge/plataforma-Windows-0078D6)
[![Última versión](https://img.shields.io/github/v/release/chamanRMA/Ludiary?label=%C3%BAltima%20versi%C3%B3n)](https://github.com/chamanRMA/Ludiary/releases/latest)

Ludiary funciona en tu propio PC. Una pequeña aplicación de la bandeja arranca un servidor local y lo usas en tu navegador de siempre. Ves todos tus juegos en un solo sitio, pulsas **Jugar** y Ludiary lo abre a través de la tienda correspondiente.

> Ludiary no está afiliado a Steam, GOG, Epic Games, Ubisoft ni EA. Consulta el [aviso legal](#aviso-legal).

<!-- TODO: screenshots -->

## Por qué Ludiary

- **Local y privado.** Sin telemetría y sin servidor de Ludiary. Nada sale de tu PC salvo las llamadas a las tiendas, a los servicios que configures tú y la comprobación de nuevas versiones en GitHub, que puedes desactivar en Ajustes. Mira la [privacidad](../privacy.md) (en inglés).
- **Vías oficiales de las tiendas donde existen.** La conexión de cuenta de Steam es oficial. GOG, Epic, Ubisoft y EA no ofrecen una vía oficial para una aplicación como esta, así que sus conexiones de cuenta usan API no oficiales, y la importación de la lista de deseos de Steam usa un punto de acceso sin documentar. Ludiary las marca como tales. Pueden dejar de funcionar si la tienda cambia, y las usas bajo tu responsabilidad. Las cuentas son opcionales: el escaneo y Jugar funcionan sin ninguna. Mira [tiendas y riesgos](../guides/stores-and-risks.md) (en inglés).
- **Sin afiliación con ninguna tienda.** Es un proyecto independiente de código abierto.
- **Tus secretos van cifrados.** Los tokens, sesiones y claves de API se guardan cifrados; la clave de cifrado vive fuera de la base de datos, en el almacén de claves de Windows.

## Funciones

- **Biblioteca unificada.** Una entrada por juego, aunque lo tengas en varias tiendas. Ludiary escanea los juegos instalados de cada tienda y, donde la tienda lo permite, lee tu cuenta para mostrar los juegos que tienes pero no has instalado.
- **Jugar.** Lanza un juego desde Ludiary usando su entrada guardada. En GOG, Jugar pasa por GOG Galaxy por defecto (un ajuste permite abrir el juego directamente).
- **Favoritos, etiquetas y colecciones**, y **tiempo de juego** que informa Steam. Las colecciones de Steam se importan y se refrescan en cada sincronización.
- **DLC** dentro de la ficha de su juego base.
- **Comparador de precios** con [IsThereAnyDeal](https://isthereanydeal.com): mejor precio, mínimo histórico y una lista de juegos que sigues. Pones tu propia clave gratuita. Puedes importar tus **listas de deseos de Steam y GOG** a esa lista. Mira la [guía de precios](../guides/prices.md) (en inglés).
- **Copias de seguridad y restauración** de tu biblioteca y tus datos, automáticas o manuales. Mira la [guía de copias](../guides/backups.md) (en inglés).
- **Actualizaciones automáticas firmadas** (Ed25519) con vuelta atrás si la nueva versión no arranca. Mira la [guía de actualizaciones](../guides/updates.md) (en inglés).
- **Exportación de registros** desde Ajustes, para adjuntarlos a un aviso de error. Ludiary nunca los envía por su cuenta. Mira la [solución de problemas](../guides/troubleshooting.md) (en inglés).
- **Interfaz en español e inglés.**

### Tiendas

Lo que hace hoy cada conector. Los detalles cambian cuando cambian las tiendas. Mira [tiendas y riesgos](../guides/stores-and-risks.md) (en inglés).

| Tienda | Instalados y Jugar | Cuenta (poseídos, no instalados) | Notas |
|---|---|---|---|
| Steam | Sí (`steam://`) | Sí: inicio de sesión y tu propia API key | Portadas, tiempo de juego, DLC, colecciones, importar lista de deseos (punto de acceso sin documentar) |
| GOG | Sí, a través de GOG Galaxy o directo | Sí: página de login oficial, pegas el código (API no oficial) | DLC, importar lista de deseos (API no oficial) |
| Epic Games | Sí | Sí: página de login oficial, pegas el código (API no oficial) | Botón Instalar en los juegos que tienes |
| Ubisoft Connect | Sí (`uplay://`), detectados en el registro de Windows | Sí: inicio de sesión en una ventana integrada (API no oficial) | Portadas de la caché local |
| App de EA | Sí (`origin2://`), detectados por los ficheros de la app de EA | Sí: inicio de sesión en tu navegador y pegas un token (API no oficial) | |

Cada tienda es un conector aislado: si una falla, las demás siguen funcionando.

## Instalación

Solo para Windows por ahora.

1. Ve a la [última versión](https://github.com/chamanRMA/Ludiary/releases/latest).
2. Descarga `Ludiary-Setup-X.Y.Z.exe`.
3. Ejecútalo y sigue el instalador.
4. Abre **Ludiary** desde el acceso directo. Arranca la aplicación de la bandeja y el servidor si no están en marcha, y abre la web en tu navegador predeterminado.

**SmartScreen.** El instalador aún no está firmado con un certificado de firma de código, así que Windows puede mostrar «Windows protegió tu PC». Si lo descargaste de la página de versiones de este proyecto, pulsa **Más información** y después **Ejecutar de todas formas**. Solo aparece en la primera instalación manual; las actualizaciones que hace Ludiary no lo activan. Las actualizaciones siguen protegidas por su propia firma Ed25519. Cada versión incluye además un `SHA256SUMS.txt` para comprobar la descarga.
## Cómo funciona

```
 Navegador  ──>  http://ludiary.localhost:<puerto>
                     │
                     ▼
 Aplicación de la bandeja (Ludiary.exe) ── arranca ──> Servidor local (solo 127.0.0.1 / [::1])
                                                          │
              ┌───────────────┬───────────────────────────┴──────────┐
              ▼               ▼                      ▼                ▼
      Conectores de tienda  Base de datos SQLite  Almacén de claves  Lanzador de juegos
  (Steam GOG Epic Ubisoft EA)  (tus datos)        de Windows         (por ID guardado)
                                                  (clave de cifrado)
```

La seguridad en pocas palabras: el servidor escucha solo en la interfaz de bucle local y comprueba `Origin` y `Host`. El navegador se autoriza con un enlace de un solo uso que se convierte en una cookie `HttpOnly`, y las acciones que cambian datos o abren juegos exigen una segunda prueba ligada a la instalación. Los juegos se lanzan solo por el ID de un juego guardado en la base de datos, nunca por un comando o ruta recibidos por la API. Mira las decisiones 23, 29, 63, 66 y 67 del ADR.

## Compilar desde el código

Necesitas:

- Node 24 (mira [`.node-version`](../../.node-version)) y pnpm mediante Corepack
- Go (para el ayudante de la bandeja y el lanzador)
- [Inno Setup 6](https://jrsoftware.org/isinfo.php) (solo para crear el instalador)

```
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build:desktop
corepack pnpm build:installer
```

Para trabajar en la interfaz web con datos simulados, sin servidor:

```
corepack pnpm --filter @ludiary/web dev
```

Esto ejecuta `vite --mode simulator`. Cómo se publican y firman las versiones: [docs/release.md](../release.md) y [docs/code-signing.md](../code-signing.md) (en inglés).

## Estructura del proyecto

```
apps/
  desktop/       aplicación de la bandeja, lanzador, instalador y scripts de publicación
  web/           interfaz en React
packages/        core, db, api, contracts, i18n, itad, runtime, platform-* ...
connectors/      steam, gog, epic, ubisoft, ea
docs/
  adr/           decisiones de diseño (la fuente de verdad)
  guides/        guías de usuario (precios, copias, actualizaciones, problemas, tiendas y riesgos)
  manual-tests/  comprobaciones contra tiendas reales
```

## Hoja de ruta

- **Fase 2:** modo servidor casero en Docker, agente local y preparación para varios usuarios.
- **Fase 4:** alertas de mínimos. (La fase 3, el comparador de precios, ya está disponible.)
- **Sin fase asignada:** juegos manuales desde la interfaz y edición de metadatos por el usuario.

## Contribuir

Las contribuciones son bienvenidas. Lee antes [CONTRIBUTING.md](../../CONTRIBUTING.md).

- Firma cada commit (DCO): `git commit -s`.
- El diseño está en el [ADR](../adr/ADR.md). Los cambios que lo afecten necesitan una decisión nueva allí.
- El proyecto se desarrolla con la ayuda de [Claude Code](https://claude.com/claude-code); el equipo de agentes y sus reglas están en [`.claude/agents/`](../../.claude/agents/).

## Seguridad

Comunica las vulnerabilidades en privado. Mira [SECURITY.md](../../SECURITY.md).

## Política de firma de código

Mira la [política de firma de código](../code-signing-policy.md) (en inglés). El proyecto ha solicitado la firma gratuita del programa [SignPath Foundation](https://signpath.org).

## Licencia

[GPL-3.0-only](../../LICENSE).

Copyright (C) 2026 Ludiary contributors

## Aviso legal

Ludiary es un proyecto independiente. No está afiliado, respaldado ni patrocinado por Valve/Steam, GOG, Epic Games, Ubisoft, Electronic Arts ni IsThereAnyDeal. Todas las marcas y logotipos pertenecen a sus propietarios.
