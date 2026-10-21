# Ludiary — gestor unificado de bibliotecas de videojuegos

**Ludiary** es una aplicación web local para ver y lanzar, desde un solo sitio, los juegos de varias tiendas: **Steam, GOG, Epic, Ubisoft y EA**. Proyecto de código abierto para el público general con licencia GPL-3.0-only (texto en `LICENSE`) y contribuciones bajo DCO.

La fuente de verdad del diseño es el **ADR** (`docs/adr/ADR.md`). Este fichero resume lo que todo agente debe saber. Cada agente de `.claude/agents/` amplía lo suyo.

## Alcance

- **MVP:** modo localhost en **Windows**. Un ejecutable ligero con icono en la bandeja arranca el servidor y un acceso directo abre la web en el navegador predeterminado. Incluye biblioteca unificada, escaneo de carpetas, lanzamiento directo desde el ejecutable, favoritos, etiquetas, colecciones, tiempo de juego, interfaz en español e inglés, copias de seguridad y registros exportables.
- **Fase 2:** modo servidor casero en Docker, agente local y preparación para multiusuario.
- **Fase 3:** comparador de precios con IsThereAnyDeal (más precios directos de tienda donde no cubra).
- **Fase 4:** histórico de precios y alertas de mínimos.
- **Sin fase asignada:** juegos manuales (interfaz) y personalización de metadatos por el usuario.

## Invariantes

No se rompen sin pasar por el arquitecto y sin dejar una decisión nueva en el ADR.

1. El núcleo no depende del modo de ejecución (localhost o Docker), del sistema operativo ni del empaquetado. Lo que depende del SO va detrás de interfaces propias: lanzar procesos, escanear instalaciones, bandeja, almacén de claves e instalador.
2. Cada tienda es un conector aislado con una interfaz común. Si falla uno, los demás siguen funcionando.
3. Los juegos se lanzan **solo por el ID de un juego guardado en la base de datos**, nunca por comandos o rutas recibidos por la API.
4. En modo localhost el servidor escucha solo en la interfaz de bucle local (`127.0.0.1` y `[::1]`, mismo puerto; la web se abre en `ludiary.localhost`, ADR 66), valida `Origin` y `Host`, exige la prueba del token de instalación (HMAC, sin que el token viaje; ADR 63) en acciones que cambian datos o lanzan procesos y autoriza al navegador con un enlace de un solo uso que se canjea por una cookie `HttpOnly`. Ninguna ruta de la API del navegador que cambie datos, lance procesos, muestre o acepte secretos o exporte ficheros se autoriza solo con la cookie: también exige la clave de origen (ADR 67).
5. Los tokens, sesiones y claves de terceros se guardan cifrados. La clave de cifrado vive fuera de la base de datos. Ningún secreto ni dato personal va al repositorio, a los registros ni a los ficheros de pruebas.
6. Ningún texto de la interfaz va escrito en el código: todo pasa por ficheros de traducción (español e inglés).
7. El modelo de datos lleva `user_id` desde el principio. Un juego canónico agrupa varias propiedades (una por tienda o manual). Los datos del usuario (favoritos, etiquetas, colecciones, tiempo de juego) cuelgan del juego canónico.
8. Se usan las vías oficiales de las tiendas siempre que existan. El proyecto no está afiliado a ninguna tienda.
9. Sin telemetría ni servidor propio. Nada sale del equipo del usuario salvo las llamadas a las tiendas y a los servicios que él configure.
10. No se improvisa sobre una decisión abierta: se para y se escala al arquitecto.

## Equipo de agentes

| Agente | Cuándo usarlo |
|---|---|
| `arquitecto` | Diseño, contratos, modelo de datos, estructura del repositorio, decisiones abiertas y cambios del ADR. |
| `programador` | Implementar funcionalidades, API, interfaz, migraciones y corregir errores. |
| `conectores` | Conectores de Steam, GOG, Epic, Ubisoft y EA: biblioteca, escaneo, lanzamiento, asistentes de conexión y precios. |
| `empaquetador` | Ejecutable, instalador, acceso directo, bandeja, actualizaciones, firma e imagen Docker. |
| `tester` | Pruebas automáticas, respuestas grabadas y guía de pruebas manuales contra tiendas reales. |
| `auditor` | Revisión de solo lectura: conformidad con el ADR, seguridad, secretos, licencias y dependencias. |
| `documentalista` | README, guías de usuario, procedimientos, plantillas de incidencias y claridad del ADR. |

Los agentes no se invocan entre sí: coordina la sesión principal.

## Flujo de trabajo

1. Si la tarea toca diseño, contratos o una decisión abierta, la sesión principal consulta primero al `arquitecto`.
2. Implementa el agente de la zona: `programador`, `conectores` o `empaquetador`.
3. El `tester` añade y ejecuta las pruebas.
4. El `auditor` revisa antes de dar por cerrado cualquier cambio que toque seguridad, secretos, conectores, empaquetado o actualizaciones.
5. El `documentalista` actualiza la documentación afectada.

Cuando un agente detecta que una tarea contradice el ADR o necesita una decisión abierta, **para y lo informa** con las opciones que ve. No decide por su cuenta.

## Orden de arranque recomendado

1. **Prototipo del instalador** en Windows: acceso directo, comprobación de servidor en marcha, icono de bandeja, SQLite y almacén de claves del sistema funcionando. Es el mayor riesgo técnico.
2. **Conector de Steam** de principio a fin: sincronizar, mostrar y lanzar un juego.
3. **Conector de GOG**: valida el lanzamiento por línea de comandos, el caso más distinto.

## Convenciones

- Nombre del proyecto: **Ludiary**. Paquetes con ámbito `@ludiary/`, todos con `"private": true` (ADR, decisión 44).
- Identificadores y comentarios del código en inglés. ADR en español. Documentación en inglés, con el README traducido en `docs/readme/` (decisión 49).
- Commits pequeños y descriptivos, con la decisión del ADR a la que responden cuando aplique, y con `Signed-off-by` (DCO, decisión 60): `git commit -s`.
- Cualquier dato de tiendas que pueda cambiar (APIs, URI, formatos) se verifica antes de depender de él y se deja anotado como supuesto.

## Referencias

- ADR completo: `docs/adr/ADR.md`
- Agentes: `.claude/agents/`
