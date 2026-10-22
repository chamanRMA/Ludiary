# ADR — Ludiary, gestor unificado de bibliotecas de videojuegos

Registro de decisiones de arquitectura · 14 de octubre de 2026 · Estado: aceptadas (versión inicial)

## Contexto

Página web y servidor para gestionar en un solo sitio las bibliotecas de videojuegos de varias plataformas: Steam, GOG, Ubisoft, EA y Epic.

- **MVP:** web desde la que lanzar los juegos, independientemente de la plataforma donde estén.
- **Nice to have:** comparador de tiendas para buscar y comprar donde el juego sale más barato. A futuro, histórico de precios y detección de mínimos.

## Índice de decisiones

| # | Decisión | Estado |
|---|---|---|
| 1 | Despliegue: self-hosted | Revisada en la 25 |
| 2 | Lanzamiento de juegos | Revisada en la 22 |
| 3 | Detección de la biblioteca | Escaneo revisado en la 22; ampliada en la 42 |
| 4 | Stack tecnológico | Vigente |
| 5 | Usuarios | Vigente |
| 6 | Metadatos y portadas | Vigente |
| 7 | Acceso y seguridad | Ampliada en la 23 |
| 8 | Distribución e instalación | Revisada en la 25 y la 26 |
| 9 | Comparador de precios | Revisada en la 24 |
| 10 | Frontend | Vigente |
| 11 | Autenticación con las tiendas | Revisada en la 43 |
| 12 | Sincronización de la biblioteca | Vigente |
| 13 | Ejecución en modo localhost | Concretada en la 26 |
| 14 | Custodia de la clave de cifrado | Vigente (confirmada por el usuario); ampliada en la 46 |
| 15 | Framework de backend y acceso a datos | Vigente (recomendada); controlador concretado en la 41 |
| 16 | Alcance de la biblioteca mostrada | Vigente |
| 17 | Juegos manuales | Vigente |
| 18 | Copias de seguridad | Revisada en la 57 |
| 19 | Pruebas de los conectores | Vigente |
| 20 | Emparejamiento de juegos entre tiendas | Vigente (confirmada por el usuario); concretada en la 51 |
| 21 | DLC y contenidos adicionales | Vigente |
| 22 | Lanzamiento y escaneo directos en modo localhost | Vigente |
| 23 | Seguridad local del servidor | Vigente; ampliada en la 63, la 66 y la 67 |
| 24 | Comparador de precios: IsThereAnyDeal primero | Vigente |
| 25 | Secuencia: localhost primero, Docker después | Vigente |
| 26 | Instalador y acceso directo en localhost | Vigente; instancia única concretada en la 62 |
| 27 | Sistemas operativos del modo localhost | Vigente |
| 28 | Puerto del servidor local | Vigente; ampliada en la 66 |
| 29 | Autorización del navegador | Vigente (confirmada por el usuario); duración en la 54; dirección en la 66; segundo factor ligado al origen en la 67 |
| 30 | Audiencia y modelo de proyecto | Vigente |
| 31 | Claves de servicios de terceros | Vigente |
| 32 | Actualización de la aplicación en modo localhost | Vigente |
| 33 | Idiomas de la interfaz | Vigente |
| 34 | Licencia del proyecto: GPL-3.0 | Vigente (confirmada por el usuario) |
| 35 | Diagnóstico de fallos | Vigente |
| 36 | Organización de la biblioteca en el MVP | Vigente |
| 37 | Métodos de entrada de la interfaz | Vigente |
| 38 | Estructura del repositorio y fronteras entre paquetes | Vigente (confirmada por el usuario) |
| 39 | Gestor de paquetes: pnpm con workspaces | Vigente (confirmada por el usuario) |
| 40 | Contrato de los conectores de tienda | Vigente (confirmada por el usuario); `mediaHosts` añadido en la 71; `discoverRoots`, medios en instalados y `launchersResolved` añadidos en la 72; `apiHosts`, `resolveMedia` y el primer `HttpClient` en la 73; asistente con `fields` en `open-external`, `WizardContext.now`, `makeSecret`, `SecretCipher` y `HttpClient` con POST en la 74; `ExecError` y fila de GOG de la tabla en la 76; regla 7 revisada para GOG y regla 5 (las ubicaciones `launcher` ya no amplían el `exec`) revisada en la 77; regla 7 revisada para Epic y fila de Epic en la 78 |
| 41 | Controlador de SQLite: `better-sqlite3` con Drizzle estable | Vigente (confirmada por el usuario) |
| 42 | Detección de instalaciones: autodetección y carpetas manuales | Vigente (confirmada por el usuario) |
| 43 | Credenciales en los asistentes de conexión | Vigente (confirmada por el usuario; revisa la 11); parte de Epic revisada en la 78 (sin ventana de `legendary`) |
| 44 | Nombre del proyecto (Ludiary) y ámbito de los paquetes | Vigente (confirmada por el usuario) |
| 45 | Ejecutable, instalador, bandeja y almacén de claves en Windows | Vigente (confirmada por el usuario tras el prototipo); ampliada en las 62 a 65; la actualización con vuelta atrás pasa a la 58 |
| 46 | Cifrado de secretos y rotación de la clave | Vigente (confirmada por el usuario; amplía la 14); token de instalación revisado en la 63 |
| 47 | Modelo de datos detallado | Vigente (confirmada por el usuario; migraciones por fases) |
| 48 | Framework de pruebas | Vigente (confirmada por el usuario) |
| 49 | Traducción e idiomas de la documentación | Vigente (confirmada por el usuario) |
| 50 | Intervalos mínimos de sincronización | Vigente (confirmada por el usuario); espera de 60 s extendida a todos los escaneos en la 72 |
| 51 | Normalización de nombres y ediciones dudosas | Vigente (confirmada por el usuario) |
| 52 | DLC cuyo juego base no está en la biblioteca | Vigente (confirmada por el usuario) |
| 53 | Puerto: dónde se guarda y rango permitido | Vigente (confirmada por el usuario) |
| 54 | Sesión del navegador: duración y revocación | Vigente (confirmada por el usuario); sesión ligada al puerto en la 63; segundo factor y cookie de la dirección alternativa en la 67 |
| 55 | Detección del proceso de cada juego | Propuesta (se cierra con pruebas reales) |
| 56 | Tiempo de juego propio y tiempo informado por las tiendas | Vigente (confirmada por el usuario) |
| 57 | Copias de seguridad: frecuencia y retención | Vigente (confirmada por el usuario; revisa la 18) |
| 58 | Actualización y firma de las versiones | Vigente (confirmada por el usuario); hereda de la 45 el requisito de validar la actualización con vuelta atrás |
| 59 | Registros: tamaño y rotación | Vigente (confirmada por el usuario) |
| 60 | Contribuciones y licencias de terceros | Vigente (confirmada por el usuario); ampliada en la 70 |
| 61 | Tiendas y funciones en Linux y macOS | Propuesta preliminar (se cierra en la fase 2) |
| 62 | Instancia única: cerrojo del sistema en la carpeta de datos | Vigente (recomendada; concreta la 26) |
| 63 | Autenticación entre el lanzador y el servidor local | Vigente (confirmada por el usuario; amplía la 23 y revisa el token de la 46); URL del enlace revisada en la 66; alcance de la sesión ligada al puerto corregido en la 67 |
| 64 | Errores fatales visibles y credenciales no reconocidas | Vigente (compartimento de claves decidido por el usuario; amplía las 35, 45 y 46); código de salida 14 añadido en la 72 |
| 65 | Ganchos de prueba y opciones de Node en el ejecutable publicado | Vigente (recomendada; amplía la 45) |
| 66 | Dirección de la web: `ludiary.localhost` | Vigente (recomendada; nombre aceptado por el usuario; amplía las 23, 28 y 29 y revisa la URL del enlace de la 63); alcance de la sesión ligada al puerto corregido en la 67 |
| 67 | Segundo factor ligado al origen y cookie de la dirección alternativa | Vigente (recomendada; amplía las 29 y 54 y corrige las 63 y 66) |
| 68 | Primera versión de `apps/web`: estructura, datos simulados y CSP | Vigente (recomendada; concreta la 10); portadas e `img-src` revisados en la 71; servir la SPA, librería de esquemas y selector de carpetas concretados en la 72 |
| 69 | Asistente de primer arranque | Vigente (confirmada por el usuario) |
| 70 | Fuentes tipográficas empaquetadas (OFL-1.1) | Vigente (confirmada por el usuario; amplía la 60) |
| 71 | Portadas de Steam desde su CDN | Qué, vigente (confirmado por el usuario); cómo, vigente (la alternativa de guardarlas en el equipo se descartó en la 75); revisa la 68 en portadas y CSP; amplía las 6 y 40; URL con hash resueltas en la 73 |
| 72 | Primer corte vertical de Steam: instalados, biblioteca y lanzamiento | Vigente (recomendada; puntos A y B decididos por el usuario, C aplazado por él; implementada y corregida tras la auditoría en su punto 11; quedan pendientes del usuario el aviso «Simulado» y los juegos movidos con `mklink /J`; amplía las 40, 42, 47, 50, 64 y 68); orden de cortes y emparejamiento con la segunda tienda revisados en la 76 |
| 73 | Portadas de Steam con ruta con hash: `IStoreBrowseService/GetItems` | Vigente (recomendada; amplía las 40, 71 y 72) |
| 74 | Cuenta de Steam: OpenID, API key cifrada y juegos no instalados | Vigente (recomendada; amplía las 40, 43, 46, 47, 50, 68, 72 y 73); punto 12 decidido por el usuario el 22-10-2026 |
| 75 | Portadas guardadas en el equipo y servidas por el servidor local | **Descartada** por el usuario el 22-10-2026: la caché del navegador ya las guarda 10 años; la 71 sigue vigente |
| 76 | Primer corte vertical de GOG: instalados, portadas y lanzamiento por línea de comandos | Vigente (recomendada; encargada por el usuario el 22-10-2026, lo que resuelve el punto C de la 72; amplía las 40, 42, 72 y 73; revisada por el auditor sin críticos ni altos y ajustada el mismo día; `LocalFiles.realPath` y comprobación de raíz activa al lanzar; punto 11.1 pendiente del usuario; punto 11.2 resuelto en la 77); vía de la cuenta y orden del emparejamiento revisados en la 77 |
| 77 | Cuenta de GOG: login oficial con código pegado, sesión cifrada y juegos no instalados | Vigente (recomendada; encargada por el usuario el 22-10-2026 antes del corte 2b y sin emparejamiento; amplía las 40, 43, 50, 74 y 76; revisa para GOG la regla 7 de la 40; sin cambios de contrato; revisada por el auditor el mismo día: las ubicaciones `launcher` ya no amplían el `exec` (revisa la regla 5 de la 40), época por tienda contra la carrera de rotación, `extract` de URL restringido; punto 12 aplicado por defecto con (a) y (a)) |
| 78 | Conector de Epic Games: instalados, Jugar y portadas (corte 1) y cuenta, no instalados e Instalar (corte 2) | Vigente (recomendada; encargada por el usuario el 22-10-2026; amplía las 40, 42, 50, 73, 74, 76 y 77; revisa para Epic la regla 7 y la fila de la 40 y la parte de Epic de la 43; sin tipos nuevos; `storeGameId` hasta 160 caracteres; punto 13 aplicado por defecto con (a), (a) y (a); corte 2 tras la prueba del corte 1; revisada por el auditor el mismo día sin críticos ni altos (punto 14): `.item` como entrada no confiable con regla estricta de ruta, solo el valor extraído en `json-field`, E5 comprobado y `AppDataPath` como primera fuente; E7 falso en la práctica: el corte 1 va sin portadas y sin `resolveMedia` (punto 15)) |

## Decisiones

### 1. Despliegue: self-hosted (secuencia revisada en la decisión 25)

**Decisión:** el sistema se ejecuta en localhost (el propio PC) o en un servidor casero (NAS, Raspberry). Mismo código para ambos modos.

**Consecuencia:** si el servidor no está en el PC de juego, por sí solo no puede abrir juegos ni leer sus carpetas.

### 2. Lanzamiento de juegos (revisada en la decisión 22)

**Decisión:** en el MVP, la web abre las URI de cada launcher (por ejemplo `steam://rungameid/ID`) desde el navegador. El agente local queda para una fase posterior.

**Consecuencia:** el MVP solo lanza juegos si se navega desde el PC donde están instalados. El agente permitirá lanzar desde otros dispositivos y con varios PCs.

### 3. Detección de la biblioteca (escaneo revisado en la decisión 22; ampliada en la decisión 42)

**Decisión:** APIs de cada plataforma, más escaneo de las carpetas de instalación que indique el usuario. El escaneo cubre Ubisoft y EA, que no tienen API pública.

**Consecuencias:**

- Steam tiene API oficial. Epic y GOG solo tienen APIs no oficiales, que pueden romperse.
- El escaneo necesita acceso al sistema de ficheros del PC: directo en modo localhost; en modo servidor solo con carpetas montadas en red o con el agente local.

### 4. Stack tecnológico

**Decisión:** TypeScript (Node) en backend y frontend, con SQLite como base de datos. Las herramientas existentes (por ejemplo `legendary` para Epic) se invocan como procesos externos.

**Motivo:** un solo lenguaje, fácil de empaquetar en Docker (incluido ARM) y SQLite sin servicio aparte.

### 5. Usuarios

**Decisión:** un solo usuario en el MVP, pero el modelo de datos incluye `user_id` desde el principio.

**Consecuencia:** añadir login y multiusuario más adelante no exigirá migraciones dolorosas.

### 6. Metadatos y portadas

**Decisión:** primero los datos que da cada tienda. Si no se detecta el juego, respaldo con IGDB o RAWG (proveedor intercambiable). A futuro, el usuario podrá personalizarlos.

**Modelo:** un juego canónico con varios orígenes (una propiedad por tienda), para que el mismo juego en Steam y GOG aparezca una sola vez.

### 7. Acceso y seguridad (ampliada en la decisión 23)

**Decisión:** acceso solo desde la red local (LAN), sin login en el MVP.

**Consecuencias:** no se expone a internet. Los tokens y sesiones de las tiendas se guardan cifrados en reposo.

### 8. Distribución e instalación (revisada en las decisiones 25 y 26)

**Decisión:** imagen Docker para servidor casero y ejecutable para el modo localhost.

**Consecuencia:** el núcleo debe ser independiente del empaquetado (mismo código, dos formatos).

### 9. Comparador de precios (nice to have; revisada en la decisión 24)

**Decisión:** precios obtenidos directamente de cada tienda, con un conector aislado y reemplazable por tienda.

**Consecuencias:**

- Es la parte más frágil: las tiendas cambian sus endpoints sin avisar.
- Futuro: histórico y mínimos. SteamDB no tiene API pública y restringe el uso automatizado; IsThereAnyDeal es candidato por tener API oficial.

### 10. Frontend

**Decisión:** React con Vite y TypeScript, como SPA compilada a ficheros estáticos que sirve el propio backend.

**Motivo:** mayor ecosistema y facilidad para encontrar ayuda. El peso no importa en una Raspberry porque se sirve ya compilado. Decisión revisable.

### 11. Autenticación con las tiendas (revisada en la decisión 43)

**Decisión:** login guiado desde la propia web: un asistente de conexión por tienda, dentro de Ajustes, que lleva al usuario paso a paso sin editar ficheros ni pegar claves a mano.

**Consecuencias:**

- **Steam:** inicio de sesión con OpenID para obtener el SteamID. Para listar los juegos hace falta además una API key (el asistente guía su creación) y el perfil público.
- **Epic y GOG:** el asistente abre el login oficial y recoge el código de autorización. El flujo no es oficial y puede cambiar.
- **Ubisoft y EA:** no hay login, solo escaneo de carpetas.
- Cada conector incluye su asistente de conexión dentro de la interfaz común.
- Los tokens resultantes se guardan cifrados en reposo (decisión 7).

### 12. Sincronización de la biblioteca

**Decisión:** la biblioteca se sincroniza al abrir la web y mediante un botón de sincronización manual.

**Consecuencias:**

- Al abrir la web se muestran de inmediato los datos guardados y la sincronización corre en segundo plano, con progreso visible.
- Cada tienda sincroniza por separado: si el conector de una falla, las demás no se bloquean.
- Debe existir un intervalo mínimo entre sincronizaciones por tienda para no saturar APIs no oficiales.
- El escaneo de carpetas se lanza en las mismas condiciones, y también bajo demanda.

### 13. Ejecución en modo localhost (concretada en la decisión 26)

**Decisión:** un ejecutable ligero que arranca el servidor en segundo plano, muestra un icono en la bandeja del sistema y abre la web en el navegador predeterminado.

**Consecuencias:**

- El navegador es la única interfaz, así que localhost y servidor casero comparten el mismo frontend.
- El lanzamiento de juegos por URI funciona desde el navegador del propio PC (decisión 2).
- El menú de la bandeja se limita a lo esencial: abrir la web, ver el estado de la sincronización y salir.
- Una app de escritorio con ventana propia (Electron o Tauri) queda descartada por ahora y podría añadirse después sin tocar el núcleo.

### 14. Custodia de la clave de cifrado (ampliada en la decisión 46)

**Decisión (confirmada por el usuario el 21 de octubre de 2026):** la clave que cifra los tokens vive fuera de la base de datos. En localhost se guarda en el almacén de credenciales del sistema operativo; en Docker se pasa por variable de entorno o Docker secret.

**Motivo:** el sistema es de un solo usuario y solo en LAN, así que lo principal es que copiar la base de datos o una copia de seguridad no filtre los tokens. No exige escribir una contraseña en cada reinicio.

**Consecuencias:**

- El `docker-compose` de ejemplo incluye la variable de la clave.
- Perder la clave obliga a volver a conectar las tiendas, no a reconstruir la biblioteca.
- La contraseña maestra opcional, prevista aquí como mejora futura, se concretó en la decisión 46 (desactivada por defecto, activable en Ajustes).

### 15. Framework de backend y acceso a datos

**Decisión (recomendada):** Fastify como framework de backend y Drizzle ORM sobre SQLite para el acceso a datos.

**Motivo:** ambos son ligeros, tienen buen soporte de TypeScript y encajan con un servicio que corre en una Raspberry o en un PC de juego sin consumir recursos de más. Drizzle mantiene las migraciones cerca del SQL, lo que facilita revisarlas.

**Consecuencias:**

- Cada conector es un módulo independiente que implementa la interfaz común; no hace falta un framework con inyección de dependencias para eso.
- La decisión es revisable: el núcleo no debe depender de detalles de Fastify ni de Drizzle fuera de sus capas de entrada y de datos.

### 16. Alcance de la biblioteca mostrada

**Decisión:** la biblioteca muestra todos los juegos que posee el usuario, instalados o no, con un filtro para ver solo los instalados.

**Consecuencias:**

- El modelo guarda, por cada propiedad de un juego en una tienda, si está instalado y su ubicación de instalación.
- La acción principal de cada juego es Jugar si está instalado. Si no lo está, abre su ficha en el launcher de esa tienda (o la instalación directa donde la URI lo permita).
- Ubisoft y EA, al depender del escaneo, solo muestran los juegos instalados que se detecten.
- Hay filtros por tienda y por estado de instalación.

### 17. Juegos manuales

**Decisión:** los juegos manuales (de otras plataformas, sin tienda o con ejecutable propio) se añaden en una fase posterior, no en el MVP.

**Consecuencias:**

- El modelo de datos debe admitir desde el principio un origen de tipo manual, aunque aún no exista interfaz para crearlo.
- Reutilizará el mismo mecanismo de edición de metadatos que la personalización prevista en la decisión 6.

### 18. Copias de seguridad (revisada en la decisión 57)

**Decisión:** copia de la base de datos a una carpeta que el usuario configura. Revisada en la decisión 57: las copias periódicas vienen desactivadas por defecto y el usuario las activa en Ajustes; la copia previa a una migración o actualización es siempre automática.

**Motivo:** la biblioteca se reconstruye sincronizando con las tiendas; lo insustituible son las personalizaciones del usuario y, más adelante, los juegos manuales.

**Consecuencias:**

- La copia usa el mecanismo de copia segura de SQLite, no una copia directa del fichero mientras se escribe.
- En Docker, la carpeta de copias es un volumen montado aparte del de datos.
- La copia no incluye la clave de cifrado (decisión 14): al restaurar hay que volver a conectar las tiendas.
- Hace falta un punto de restauración documentado (cómo recuperar una copia).

### 19. Pruebas de los conectores

**Decisión:** pruebas automáticas con respuestas grabadas de cada tienda, más pruebas manuales periódicas contra las tiendas reales.

**Consecuencias:**

- Las respuestas grabadas se guardan en el repositorio sin tokens ni datos personales.
- Las pruebas del núcleo y de los conectores con respuestas grabadas corren en automático, sin credenciales.
- Las pruebas contra tiendas reales las lanza el desarrollador a mano con sus propias cuentas; sus credenciales nunca van al repositorio.
- Si una tienda cambia su API, las pruebas manuales fallan y hay que actualizar el conector y sus respuestas grabadas.
- No hay detección automática de conectores rotos: un fallo de sincronización se muestra por tienda con un mensaje claro en la web (decisión 12).

### 20. Emparejamiento de juegos entre tiendas (concretada en la decisión 51)

**Decisión (confirmada por el usuario el 21 de octubre de 2026):** emparejamiento automático conservador con corrección manual. Dos entradas se unen solas cuando comparten un ID externo (IGDB o RAWG, si ya se obtuvo) o cuando su nombre normalizado coincide exactamente (sin mayúsculas, símbolos ni marcas como ™ o ®). Los casos dudosos, como ediciones o subtítulos distintos, se dejan separados y se marcan como posible duplicado para que el usuario los confirme.

**Motivo:** una fusión errónea oculta un juego, mientras que un duplicado sin fusionar solo molesta. Emparejar solo por ID obligaría a consultar IGDB o RAWG para toda la biblioteca, lo que contradice la decisión 6; hacerlo todo a mano sería tedioso en bibliotecas grandes.

**Consecuencias:**

- El usuario puede fusionar y separar entradas manualmente.
- Las fusiones y separaciones manuales se guardan y prevalecen sobre el emparejamiento automático en sincronizaciones futuras.
- La interfaz necesita una vista de posibles duplicados pendientes de confirmar.

### 21. DLC y contenidos adicionales

**Decisión:** los DLC no aparecen como entradas de la biblioteca; se muestran dentro de la ficha de su juego base.

**Consecuencias:**

- La lista principal contiene solo juegos base, lo que evita ruido y falsos duplicados.
- El modelo relaciona cada DLC con su juego base.
- Un DLC no tiene acción de Jugar propia.
- No todas las tiendas exponen los DLC con la misma facilidad: los que no se detecten simplemente no aparecen en la ficha.

### 22. Lanzamiento y escaneo directos en modo localhost (revisa las decisiones 2 y 3)

**Decisión:** en modo localhost el servidor corre en el mismo PC que los juegos, así que lanza juegos y escanea carpetas directamente, sin depender de URI abiertas desde el navegador. La web solo pide jugar un juego y el ejecutable lo lanza.

**Motivo:** según un hilo del foro de GOG (dato a verificar), GOG Galaxy no registra un protocolo de lanzamiento y sus juegos se lanzan con argumentos de línea de comandos, algo que un navegador no puede ejecutar. Lanzar desde el servidor local cubre las cinco tiendas con un mismo mecanismo.

**Consecuencias:**

- Cómo se lanza un juego es una capacidad de cada conector: URI o línea de comandos según la tienda.
- En modo servidor LAN el servidor no puede lanzar ni escanear. Mientras no exista el agente local, la web usa URI desde el navegador como alternativa limitada, solo para las tiendas que las admiten (no GOG).
- El agente local futuro es este mismo ejecutable funcionando como cliente de un servidor casero.
- Las URI de EA han dado fallos en algunos juegos reportados: su conector debe validarse con juegos reales.

### 23. Seguridad local del servidor (amplía la decisión 7; ampliada en las decisiones 63, 66 y 67)

**Decisión:** en modo localhost el servidor escucha solo en `127.0.0.1`, valida las cabeceras `Origin` y `Host` de cada petición, exige un token por instalación en las acciones que cambian datos o lanzan procesos, y lanza juegos únicamente por el ID de un juego guardado en la base de datos, nunca por comandos libres recibidos por la API.

**Motivo:** un servidor local sin login que ejecuta procesos podría ser invocado por cualquier página web abierta en el navegador o por otro equipo de la red.

**Consecuencias:**

- En modo servidor LAN se escucha en la red local, pero se mantienen la validación de cabeceras y el token.
- El token lo gestiona el sistema; el usuario no lo escribe.
- **Ampliación (decisión 63):** se considera también la amenaza de otro usuario sin privilegios del mismo equipo, que comparte los puertos de `127.0.0.1`. El token de instalación no viaja nunca en claro: el lanzador y el servidor se autentican mutuamente con HMAC-SHA256 sobre un nonce de un solo uso, y el lanzador solo abre un enlace cuya prueba y formato ha comprobado. Las sesiones del navegador quedan ligadas al puerto en el que se crearon (alcance corregido en la decisión 67: eso revoca sesiones al cambiar de puerto, pero no impide reutilizar una cookie robada).
- **Ampliación (decisión 66):** «solo en `127.0.0.1`» pasa a ser «solo en la interfaz de bucle local»: el servidor escucha en `127.0.0.1` y en `[::1]`, en el mismo puerto, y nunca en otra interfaz. `Host` y `Origin` se validan contra una lista cerrada con el nombre `ludiary.localhost` y la dirección `127.0.0.1`, siempre con el puerto vigente.
- **Ampliación (decisión 67):** el «token por instalación en las acciones que cambian datos o lanzan procesos» se concreta, para el navegador, en dos factores: la cookie de sesión y una clave ligada al origen que la página envía en una cabecera. La cookie sola no autoriza ninguna de esas acciones.

### 24. Comparador de precios: IsThereAnyDeal primero (revisa la decisión 9)

**Decisión:** el comparador usa IsThereAnyDeal como fuente principal de precios, y el histórico y los mínimos salen del mismo servicio. Los precios directos de cada tienda solo se añaden donde ese servicio no cubra.

**Motivo:** hasta donde sabemos, Epic, EA y Ubisoft no ofrecen API pública de precios. Rastrear sus páginas es frágil y puede chocar con sus condiciones de uso.

**Consecuencias:**

- Se depende de un tercero: hay que revisar su clave de API, sus límites y sus condiciones de uso.
- El conector directo de precios sigue siendo una capacidad opcional de cada tienda.
- Hay que verificar qué tiendas cubre realmente el servicio.

### 25. Secuencia: localhost primero, Docker después (revisa las decisiones 1 y 8)

**Decisión:** el MVP se construye y distribuye solo para el modo localhost. La imagen Docker y el modo servidor casero llegan después, junto con el agente local.

**Motivo:** sin agente, un servidor en la LAN solo puede mostrar la biblioteca; no puede lanzar juegos ni escanear carpetas del PC.

**Consecuencias:**

- El núcleo se escribe desde ya independiente del modo de ejecución (decisión 8).
- La hoja de ruta refleja esta secuencia.

### 26. Instalador y acceso directo en localhost (concreta las decisiones 8 y 13)

**Decisión:** el modo localhost se distribuye con un instalador que crea un acceso directo. Al abrirlo, el lanzador comprueba si el servidor ya está en marcha; si no lo está, lo arranca en segundo plano con su icono en la bandeja y, en cualquier caso, abre la web en el navegador predeterminado del usuario.

**Consecuencias:**

- Debe haber una sola instancia: el lanzador detecta el servidor ya activo (por ejemplo, con una comprobación de estado en su puerto local) antes de arrancar otro. Concretado en la decisión 62: la instancia única la garantiza un cerrojo del sistema en la carpeta de datos, y el lanzador reconoce a su servidor con la autenticación de la decisión 63, no solo con la comprobación de estado.
- El icono de la bandeja permite abrir la web, ver el estado de la sincronización y parar el servidor.
- El instalador y el empaquetado (bandeja, SQLite, almacén de claves del SO) son el principal riesgo técnico, por lo que conviene validarlos pronto.

### 27. Sistemas operativos del modo localhost

**Decisión:** el modo localhost se soporta primero en Windows; Linux y macOS llegan después.

**Motivo:** Windows es el único sistema donde conviven las cinco tiendas, ya que Ubisoft Connect y la app de EA solo existen para Windows.

**Consecuencias:**

- Instalador, icono de bandeja y almacén de claves se implementan primero para Windows (almacén de credenciales del sistema).
- Las partes que dependen del sistema (lanzar procesos, escanear instalaciones, bandeja, almacén de claves e instalador) van detrás de interfaces propias, para poder añadir otros sistemas sin tocar el núcleo.
- En Linux y macOS habrá menos tiendas disponibles.
- El modo servidor en Docker no depende de esta decisión.

### 28. Puerto del servidor local (ampliada en la decisión 66)

**Decisión:** en el primer arranque el servidor elige un puerto libre automáticamente y lo guarda para los siguientes arranques. El usuario puede cambiarlo en la configuración.

**Consecuencias:**

- El servidor responde a una comprobación de estado que lo identifica como esta aplicación: así el acceso directo distingue un servidor ya en marcha de otro programa que ocupe el puerto.
- Si el puerto guardado lo ocupa otro programa, se elige uno libre nuevo y se actualiza el valor guardado.
- Las comprobaciones de `Origin` y `Host` (decisión 23) deben usar siempre el puerto vigente.
- La dirección de la web puede cambiar entre instalaciones o tras un conflicto; el acceso directo siempre abre la correcta.
- **Ampliación (decisión 66):** un puerto solo se da por bueno si se puede abrir a la vez en `127.0.0.1` y en `[::1]`. Si cualquiera de los dos está ocupado, se pasa al siguiente candidato.

### 29. Autorización del navegador (concreta la decisión 23; duración en la decisión 54; dirección en la decisión 66; segundo factor en la decisión 67)

**Decisión (confirmada por el usuario el 21 de octubre de 2026):** en modo localhost, el acceso directo o la bandeja piden al servidor un enlace de apertura de un solo uso y de corta duración. Al abrirlo, el servidor lo canjea por una cookie de sesión (`HttpOnly`) y lo invalida. A partir de ahí el navegador queda autorizado sin login.

**Motivo:** el usuario no escribe nada y no queda un token permanente en el historial ni en los marcadores.

**Consecuencias:**

- Si el usuario borra la cookie o usa otro navegador, vuelve a abrir la web desde el acceso directo o desde la bandeja.
- Las cookies no distinguen puertos dentro del mismo host: su valor es un secreto de sesión aleatorio y revocable.
- **Ampliación (decisión 66):** el enlace de apertura y la web usan `http://ludiary.localhost:<puerto>/`. La cookie queda ligada a ese nombre, así que ya no se envía a otros programas de `127.0.0.1` ni de `localhost`. La bandeja ofrece además abrir con `127.0.0.1` como dirección alternativa. Matiz (decisión 67): la cookie sí se envía a `ludiary.localhost:<otro puerto>`, y la de la dirección alternativa a cualquier `127.0.0.1:<puerto>` mientras el navegador siga abierto.
- **Ampliación (decisión 67):** la cookie sola no autoriza acciones que cambien datos, lancen procesos o muestren o acepten secretos. Hace falta además la clave de origen que se entrega al canjear el enlace.
- **Modo servidor (decisión del usuario):** el enlace de un solo uso no sirve, porque el navegador no está en el mismo equipo que el servidor. En ese modo se entra con un login local (contraseña o PIN) que se crea en la primera puesta en marcha y que sustituye al enlace; la cookie de sesión es la misma. Los detalles (PIN o contraseña, límite de intentos, recuperación) se concretan en la fase 2, junto con el multiusuario.

### 30. Audiencia y modelo de proyecto

**Decisión:** proyecto de código abierto dirigido al público general, no solo a usuarios técnicos.

**Consecuencias:**

- La instalación y la conexión con las tiendas deben ser guiadas y sin pasos técnicos (decisiones 11 y 26). Pedir una API key de Steam es una barrera para este público: el asistente debe guiarla paso a paso.
- Las claves de servicios de terceros (IGDB, IsThereAnyDeal) no pueden ir en el repositorio abierto; su política se decide aparte.
- Las actualizaciones pasan a ser críticas, porque los conectores se romperán cuando las tiendas cambien sus APIs.
- Hace falta documentación, soporte a incidencias y, probablemente, una interfaz en varios idiomas.
- Al distribuir públicamente aumenta la exposición a las condiciones de uso de las tiendas: conviene usar sus vías oficiales siempre que existan y dejar claro que el proyecto no está afiliado a ellas.

### 31. Claves de servicios de terceros

**Decisión:** cada usuario aporta sus propias claves de IGDB (o RAWG) y de IsThereAnyDeal, y son opcionales. Un asistente en Ajustes le guía para crearlas.

**Consecuencias:**

- La aplicación funciona sin ellas con los datos que da cada tienda.
- Sin clave de IGDB o RAWG no hay respaldo de metadatos (decisión 6). Los juegos detectados solo por escaneo, como los de Ubisoft y EA, pueden quedar sin portada ni datos.
- Sin clave de IsThereAnyDeal el comparador de precios queda desactivado hasta configurarla (decisión 24).
- Las claves se guardan cifradas igual que los tokens de las tiendas (decisión 14).
- No se necesita servidor propio ni clave compartida en el repositorio.

### 32. Actualización de la aplicación en modo localhost

**Decisión:** la aplicación busca y aplica actualizaciones automáticamente al arrancar. El usuario puede desactivarlo.

**Motivo:** los conectores se romperán cuando las tiendas cambien sus APIs y hay que poder corregirlos rápido para un público general.

**Consecuencias:**

- Las versiones deben ir firmadas y la aplicación debe verificar la firma antes de instalarlas: se trata de un programa que lanza procesos.
- Si una actualización falla, la aplicación vuelve a la versión anterior.
- Firmar el instalador evita además los avisos de Windows al instalarlo, aunque tiene un coste.
- Las actualizaciones del modo servidor en Docker se gestionan aparte, con la imagen.

### 33. Idiomas de la interfaz

**Decisión:** la interfaz sale en español e inglés desde el MVP, con la infraestructura de traducción preparada desde el principio.

**Consecuencias:**

- Ningún texto de la interfaz va escrito directamente en el código: todos pasan por ficheros de traducción.
- El idioma se toma del sistema o del navegador y el usuario puede cambiarlo.
- Añadir un idioma nuevo (por ejemplo, por la comunidad) no exige tocar el código.
- Los mensajes de error de los conectores también se traducen.

### 34. Licencia del proyecto

**Decisión (confirmada por el usuario el 21 de octubre de 2026; no es asesoría legal):** GPL-3.0 solo esa versión (identificador SPDX `GPL-3.0-only`, sin «or later»), con contribuciones bajo DCO (decisión 60).

**Motivo:** garantiza que las versiones derivadas que se distribuyan sigan siendo abiertas, y encaja con herramientas de terceros que, según lo que se sabe, también usan GPL-3.0 (`legendary` y `heroic-gogdl`, comprobado en sus repositorios; decisión 60).

**Consecuencias:**

- Hay que comprobar la licencia de cada herramienta o librería incluida en el instalador y cumplir sus avisos.
- Cambiar de licencia más adelante exigiría el acuerdo de los colaboradores, lo que afecta a la política de contribuciones.

### 35. Diagnóstico de fallos

**Decisión:** la aplicación guarda registros locales y ofrece en Ajustes un botón para exportarlos, junto con un enlace al repositorio de GitHub para abrir una incidencia (issue).

**Consecuencias:**

- Los registros no incluyen tokens, claves ni datos personales: se filtran antes de guardarse o exportarse (incluidos nombres de usuario del sistema en las rutas).
- Los registros tienen un tamaño máximo y se rotan, para no crecer sin límite.
- El usuario adjunta el fichero exportado a la incidencia manualmente; la aplicación no envía nada por su cuenta.
- La plantilla de incidencias pide la versión de la aplicación, el sistema operativo y el fichero exportado.
- No hay telemetría ni servidor propio.

### 36. Organización de la biblioteca en el MVP

**Decisión:** el MVP incluye favoritos, etiquetas y colecciones propias, y tiempo de juego con última partida.

**Consecuencias:**

- Son datos del usuario que no se recuperan sincronizando con las tiendas: se guardan en la base de datos y entran en las copias de seguridad (decisión 18).
- Se asocian al juego canónico y no a una tienda concreta, para que sobrevivan a fusiones y separaciones de entradas (decisión 20). Al fusionar dos entradas se suman los tiempos de juego.
- El tiempo de juego propio lo mide el ejecutable observando el proceso del juego lanzado desde la aplicación (decisión 22). Como el proceso no siempre cuelga de la aplicación, porque lo lanza el launcher, hay que detectarlo por su ejecutable en la carpeta de instalación.
- Los juegos lanzados fuera de la aplicación no suman tiempo propio.
- En modo servidor sin agente local no hay tiempo de juego propio.

### 37. Métodos de entrada de la interfaz

**Decisión:** la interfaz se diseña para ratón y teclado. El mando y un modo de televisión quedan fuera del alcance previsto.

**Consecuencias:**

- La navegación con teclado sigue siendo una base de accesibilidad, aunque no se prepare soporte de mando.
- Si en el futuro se quisiera un modo de mando o de televisión, bastaría una interfaz alternativa sobre el mismo núcleo, sin rehacerlo.

### 38. Estructura del repositorio y fronteras entre paquetes

**Decisión (confirmada por el usuario el 21 de octubre de 2026):** un único repositorio organizado como monorepo con workspaces (decisión 39), TypeScript con módulos ES en todos los paquetes y referencias de proyecto de TypeScript. Ámbito de paquetes `@ludiary/`, con todos los paquetes privados (decisión 44).

```
/
├─ apps/
│  ├─ desktop/            Ejecutable de Windows (MVP): lanzador, instancia única, bandeja,
│  │                      arranque del servidor. Será también el agente local (decisión 22).
│  ├─ server/             Entrada sin interfaz: desarrollo y, en la fase 2, imagen Docker.
│  └─ web/                SPA React + Vite. Se compila a estáticos que sirve la API.
├─ packages/
│  ├─ contracts/          Contrato de conectores (decisión 40), puertos del SO, errores tipados
│  │                      y tipos compartidos. Solo tipos y funciones puras, sin E/S.
│  ├─ core/               Dominio y casos de uso: biblioteca, emparejamiento, orquestación de la
│  │                      sincronización, lanzamiento por ID, copias, ajustes. Define los puertos
│  │                      de persistencia que implementa db.
│  ├─ db/                 Drizzle + SQLite: esquema, migraciones y repositorios.
│  ├─ api/                Fastify: rutas, seguridad local (Origin/Host, token, sesión; decisiones
│  │                      23 y 29) y servicio de la SPA.
│  ├─ api-contract/       DTO y esquemas de la API, compartidos por api y web.
│  ├─ i18n/               Catálogos es/en del núcleo, la web y la bandeja; agrega en la compilación
│  │                      los catálogos de cada conector.
│  ├─ platform-node/      Implementaciones genéricas sobre Node: ejecución de procesos sin shell,
│  │                      ficheros de solo lectura acotados, HTTP, cifrado, almacén de claves por
│  │                      variable de entorno o secreto (Docker).
│  ├─ platform-windows/   Windows: almacén de credenciales, lectura de registro, carpetas
│  │                      conocidas, apertura de URI, bandeja.
│  ├─ runtime/            Raíz de composición: une núcleo, db, api, conectores y plataforma según
│  │                      el modo (localhost o servidor).
│  └─ connector-testkit/  Dobles de HTTP, almacén, ficheros y herramientas; reproducción de
│                         respuestas grabadas (decisión 19).
├─ connectors/
│  └─ steam/ gog/ epic/ ubisoft/ ea/
│                         Un paquete por tienda, con sus catálogos es/en (locales/) y sus
│                         respuestas grabadas (fixtures/).
├─ docs/
└─ tools/                 Scripts de compilación, empaquetado y comprobación de fronteras.
```

Reglas de dependencia (un paquete solo importa lo que figura en su fila):

| Paquete | Puede importar |
|---|---|
| `contracts` | Nada interno. |
| `core` | `contracts`. |
| `connectors/*` | `contracts` y librerías de terceros aprobadas (análisis de formatos, validación). Nunca otro conector, `core`, `db`, `api`, `runtime` ni `platform-*`. |
| `connector-testkit` | `contracts`. |
| `db` | `core` (para implementar sus puertos), `contracts`, Drizzle. |
| `api` | `core`, `contracts`, `api-contract`, Fastify. No importa `db`, conectores ni `platform-*`. |
| `api-contract` | Nada interno (solo la librería de esquemas). |
| `i18n` | Nada interno; lee en la compilación los `locales/` de los conectores. |
| `platform-node` | `contracts`. |
| `platform-windows` | `contracts`, `platform-node`. |
| `runtime` | Todos los paquetes de `packages/` y `connectors/`. Es el único que conoce los conectores y la plataforma concretos. |
| `apps/desktop`, `apps/server` | `runtime` y la plataforma que les toca. |
| `apps/web` | `api-contract`, `i18n`. Nada del servidor. |

Además:

- `core` y `connectors/*` no importan módulos `node:*` de E/S (`fs`, `child_process`, `net`, `http`, `https`, `os`, `path`, `crypto`) ni usan `fetch` global, `process.env` o temporizadores de reintento propios: todo les llega por puertos o por el contexto del conector. El núcleo trata las rutas como cadenas opacas; las compara y normaliza la plataforma.
- Los conectores se registran de forma estática en `runtime` mediante una función de fábrica por paquete (`createSteamConnector()`, etc.). No hay carga dinámica de plugins.
- El modo de ejecución es configuración de `runtime`. El núcleo no pregunta en qué modo está: recibe o no recibe los puertos de lanzar y escanear, y lo refleja como capacidades disponibles.
- Puertos del SO definidos en `contracts`: `ProcessLauncher` (ejecutable con argumentos o URI), `LocationResolver` (registro y carpetas conocidas declaradas por los conectores, decisión 40), `ScopedFileReader` (lectura acotada a raíces), `KeyStore` (clave de cifrado, decisión 14), `SecretCipher` (algoritmo pendiente), `TrayHost` (bandeja) y `PlatformInfo`. El instalador no es un puerto en tiempo de ejecución sino parte de la compilación de `apps/desktop`.
- Las fronteras se comprueban en CI: dependencias declaradas en cada `package.json` (el gestor de la decisión 39 rechaza importaciones no declaradas), una regla de fronteras con `dependency-cruiser` (supuesto: herramienta adecuada, a confirmar al configurarla) y `no-restricted-imports` / `no-restricted-globals` de ESLint para lo prohibido en `core` y `connectors/*`.
- Se confirma la convención de `CLAUDE.md`: identificadores y comentarios del código en inglés.

**Motivo:** el monorepo permite cambiar a la vez el contrato y los conectores que lo implementan, con un solo historial y una sola CI. Separar en paquetes, en vez de en carpetas, convierte los invariantes 1 y 2 en errores de compilación o de CI y no en disciplina: un conector no puede importar el núcleo ni otro conector porque no los tiene declarados, y el núcleo no puede tocar Windows porque solo ve puertos. Tener `runtime` como única raíz de composición deja el agente local futuro como otra composición del mismo ejecutable. Alternativas descartadas: un único paquete con carpetas (las fronteras dependerían solo de la revisión); varios repositorios (versionar el contrato entre repositorios es caro para un proyecto pequeño); conectores como plugins cargados en tiempo de ejecución (complica el empaquetado en un solo ejecutable y abre una vía de ejecución de código ajeno).

**Consecuencias:**

- Hay más `package.json` y `tsconfig` que mantener; se comparten mediante un `tsconfig.base.json` y configuración común de ESLint en la raíz.
- El código debe poder empaquetarse en un único fichero con un empaquetador de JavaScript: nada de `require` dinámicos ni rutas calculadas a módulos. Condiciona, sin cerrarla, la herramienta del ejecutable (pendiente).
- Añadir una tienda es añadir un paquete en `connectors/` y una línea en `runtime`.
- El framework de pruebas sigue pendiente; `connector-testkit` no depende de él.

### 39. Gestor de paquetes: pnpm con workspaces

**Decisión (confirmada por el usuario el 21 de octubre de 2026):** pnpm con workspaces (`pnpm-workspace.yaml` con `apps/*`, `packages/*` y `connectors/*`) y protocolo `workspace:*` para las dependencias internas. Versión fijada de forma exacta en el campo `packageManager` del `package.json` raíz, en la mayor 11 (supuesto: es la mayor estable actual; se vieron publicaciones 11.x hasta agosto de 2026), y Node fijado en `engines` y en `.node-version` a la línea 24 LTS (decisión 41).

- Instalación en Windows sin Corepack: `npm i -g pnpm@11`. Supuesto: el prefijo global de npm en Windows es `%AppData%\npm` y no requiere permisos de administrador; si en el equipo apunta a `C:\Program Files`, se cambia el prefijo o se usa `@pnpm/exe`. Una vez instalado cualquier pnpm, este cambia solo a la versión de `packageManager` (`manage-package-manager-versions`, disponible desde pnpm 9.7; supuesto: activo por defecto en la mayor 11).
- Los scripts de instalación de dependencias quedan bloqueados salvo una lista explícita de permitidos (supuesto: comportamiento por defecto desde pnpm 10; el nombre exacto de la opción se confirma al configurar).
- Antigüedad mínima de versión (`minimumReleaseAge`) de un día para dependencias nuevas, con excepciones explícitas para correcciones de seguridad urgentes.
- Docker (fase 2): `pnpm fetch` para cachear capas y `pnpm deploy --prod` para producir la carpeta mínima de `apps/server`, en multiarquitectura (amd64 y arm64).
- Ejecutable de Windows: el código se empaqueta con un empaquetador de JavaScript antes de generar el ejecutable, así que la estructura de enlaces de `node_modules` de pnpm no llega al producto. Si alguna herramienta de empaquetado la necesitara plana, se recurre a `node-linker=hoisted`.

**Motivo:** la estructura estricta de `node_modules` de pnpm impide importar dependencias no declaradas, que es justo lo que hace cumplir las fronteras de la decisión 38. Además bloquea por defecto los scripts de instalación, lo que reduce la superficie de cadena de suministro en un programa que lanza procesos, y es rápido y ahorra disco. Su coste es instalar una herramienta más, sin Corepack en este equipo. Alternativas descartadas: npm workspaces (sin instalación extra, pero permite dependencias fantasma y ejecuta scripts de instalación por defecto); Yarn Berry con PnP (compatibilidad irregular con herramientas y con el empaquetado en un solo ejecutable); Bun (es otro runtime y el producto corre sobre Node).

**Consecuencias:**

- La guía de contribución indica cómo instalar pnpm en Windows sin Corepack.
- La CI instala pnpm a partir de `packageManager` (supuesto: `pnpm/action-setup` lo lee).
- Cada dependencia con scripts de instalación necesita una entrada justificada en la lista de permitidos; el `auditor` la revisa.

### 40. Contrato de los conectores de tienda (ampliada en las decisiones 71, 72, 73, 74 y 76; fila de GOG de la tabla revisada en la 76; regla 7 revisada para GOG y regla 5 revisada en la decisión 77; regla 7 revisada para Epic y fila de Epic revisada en la decisión 78)

**Decisión (confirmada por el usuario el 21 de octubre de 2026):** todos los conectores implementan la interfaz `StoreConnector` (versión de contrato 1), definida en `packages/contracts`. El conector **describe**; el núcleo **ejecuta, guarda y decide**. El conector no ve la base de datos, la clave de cifrado, el `user_id`, el sistema de ficheros completo ni la red directamente: todo le llega por un contexto que construye el núcleo.

```ts
// packages/contracts/src/connector.ts — contract version 1 (ADR 40)

export type StoreId = 'steam' | 'gog' | 'epic' | 'ubisoft' | 'ea';
/** i18n key. Connector keys live under `connectors.<storeId>.*`, shared ones under `connectors.common.*`. */
export type I18nKey = string & { readonly __brand: 'I18nKey' };
export type I18nParams = Readonly<Record<string, string | number>>;
export type GameAction = 'play' | 'open-store-page' | 'install';
export type ExternalToolId = 'legendary' | 'gogdl';

export interface StoreConnector {
  readonly contractVersion: 1;
  readonly id: StoreId;
  readonly nameKey: I18nKey;
  /** 'unofficial-api' is shown to the user as fragile. */
  readonly access: 'official-api' | 'unofficial-api' | 'local-only';
  readonly capabilities: ConnectorCapabilities;
  /** Floor between two library syncs, in ms. The core applies max(floor, configured value). */
  readonly minSyncIntervalMs: number;
  /** Hosts the wizard may send the user to. HTTPS only. */
  readonly authHosts: readonly string[];
  /** Launcher/manifest locations the platform resolves for this connector (see LocationDeclaration). */
  readonly locations: readonly LocationDeclaration[];
  /** Bundled external tools this connector may run. */
  readonly externalTools: readonly ExternalToolId[];

  /** Present only if the store needs an account (not Ubisoft or EA). */
  readonly connection?: ConnectionWizard;
  /** Required when capabilities.library is true. Owned properties, games and DLC. */
  listLibrary?(ctx: SyncContext): Promise<LibrarySnapshot>;
  /** Required when capabilities.scan is true. Installed properties found under ctx.roots. */
  scanInstalled?(ctx: ScanContext): Promise<ScanResult>;
  /**
   * Describes how to perform an action on a property already stored in the database.
   * Returns null if the action is not available for it. The core validates and executes
   * the result; a LaunchSpec is never returned by the API as a command.
   */
  resolveAction(property: StoredProperty, action: GameAction, ctx: LaunchContext): Promise<LaunchSpec | null>;
  /** Reserved for phase 3 (direct store prices where IsThereAnyDeal does not cover). Absent in the MVP. */
  readonly prices?: PriceProvider;
}

export interface ConnectorCapabilities {
  readonly library: boolean;
  readonly scan: boolean;
  readonly dlc: 'none' | 'library' | 'scan' | 'library-and-scan';
  readonly actions: readonly GameAction[];
  readonly launchKinds: readonly LaunchSpec['kind'][];
  /** Allow-list of URI schemes this connector may return, e.g. ['steam']. */
  readonly uriSchemes: readonly string[];
  /** The store reports its own playtime (how it combines with ours is pending). */
  readonly storePlaytime: boolean;
  /** Direct store prices. false until phase 3. */
  readonly price: boolean;
}

// ---------- Contexts (built by the core, one per store and run) ----------

export interface BaseContext {
  /** Cancellation and core-enforced timeout. */
  readonly signal: AbortSignal;
  /** Redacting logger. Messages in English, no secrets, no personal data. */
  readonly log: ConnectorLogger;
  readonly locale: string;
}

export interface SyncContext extends BaseContext {
  readonly http: HttpClient;
  readonly secrets: SecretVault;
  readonly tools: ExternalToolRunner;
  readonly progress: ProgressReporter;
}

export interface WizardContext extends SyncContext {
  /** Core-owned return URL for OpenID/OAuth flows (uses the current port, ADR 28). */
  readonly callbackUrl: string;
  /** Encrypted, short-lived state for this wizard session; wiped on done or cancel. */
  readonly wizardState: SecretVault;
}

export interface ScanContext extends BaseContext {
  /** User folders plus resolved locations declared by this connector. */
  readonly roots: readonly ScanRoot[];
  /** Read-only, confined to roots. Path semantics come from the platform. */
  readonly fs: ScopedFileReader;
  readonly progress: ProgressReporter;
}

export interface LaunchContext extends BaseContext {
  /** Resolved locations with purpose 'launcher' (e.g. GOG Galaxy client). */
  readonly launchers: readonly ResolvedLocation[];
  readonly fs: ScopedFileReader;
}

// ---------- Secrets, network, tools, files ----------

/** Never printable: toString() and toJSON() return '[redacted]'. */
export interface Secret {
  reveal(): string;
  toString(): string;
  toJSON(): string;
}

/** Scoped to (user, store). The core encrypts and decrypts; the connector never sees the key or the ciphertext. */
export interface SecretVault {
  get(name: string): Promise<Secret | null>;
  set(name: string, value: string | Secret): Promise<void>;
  delete(name: string): Promise<void>;
}

/** Only network access a connector has. Secrets in headers/query are revealed at send time and redacted in logs. */
export interface HttpClient {
  request(req: {
    method: 'GET' | 'POST';
    url: string;
    headers?: Readonly<Record<string, string | Secret>>;
    query?: Readonly<Record<string, string | number | Secret>>;
    body?: { json: unknown } | { form: Readonly<Record<string, string | Secret>> };
  }): Promise<{ status: number; headers: Readonly<Record<string, string>>; json(): Promise<unknown>; text(): Promise<string> }>;
}

/**
 * Runs a bundled tool without a shell. The core picks the binary (never the connector), points the
 * tool's config/session directory to a private temporary folder rehydrated from the vault, and
 * re-encrypts and wipes it afterwards. stdout/stderr are never logged raw.
 */
export interface ExternalToolRunner {
  run(tool: ExternalToolId, args: readonly (string | Secret)[], opts?: { timeoutMs?: number }):
    Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export interface ScopedFileReader {
  readText(path: string): Promise<string>;
  readDir(path: string): Promise<readonly { name: string; isDirectory: boolean }[]>;
  exists(path: string): Promise<boolean>;
  join(...parts: string[]): string;
}

export type LocationSource =
  | { kind: 'registry-value'; hive: 'HKLM' | 'HKCU'; key: string; value: string; view?: '32' | '64' }
  | { kind: 'registry-subkeys'; hive: 'HKLM' | 'HKCU'; key: string; value: string; view?: '32' | '64' }
  | { kind: 'known-folder'; folder: 'ProgramData' | 'ProgramFiles' | 'ProgramFilesX86' | 'LocalAppData' | 'RoamingAppData'; relative: string };

export interface LocationDeclaration {
  readonly id: string;
  readonly purpose: 'scan' | 'launcher';
  readonly os: readonly ('windows' | 'linux' | 'macos')[];
  readonly sources: readonly LocationSource[];
}

export interface ResolvedLocation { readonly declarationId: string; readonly path: string; readonly tag?: string }
export type ScanRoot =
  | { readonly origin: 'user'; readonly path: string }
  | ({ readonly origin: 'discovered' } & ResolvedLocation);

export interface ProgressReporter { report(p: { done: number; total?: number; phaseKey?: I18nKey }): void }
export interface ConnectorLogger {
  debug(msg: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
  info(msg: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
  warn(msg: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
}

// ---------- Connection wizard (rendered by the web, driven by the core) ----------

export interface ConnectionWizard {
  start(ctx: WizardContext): Promise<WizardStep>;
  submit(ctx: WizardContext, stepId: string, input: WizardInput): Promise<WizardStep | WizardDone>;
  /** Cheap check of the stored connection, without a full sync. */
  status(ctx: SyncContext): Promise<{ state: 'connected' | 'expired' | 'disconnected'; accountLabel?: string }>;
  /** Removes this connector's secrets and tool sessions. */
  disconnect(ctx: SyncContext): Promise<void>;
}

export type WizardStep =
  | { kind: 'info'; id: string; titleKey: I18nKey; bodyKey: I18nKey; params?: I18nParams }
  | { kind: 'open-external'; id: string; titleKey: I18nKey; bodyKey: I18nKey; url: string; awaits: 'callback' | 'input' }
  | { kind: 'input'; id: string; titleKey: I18nKey; bodyKey: I18nKey; fields: readonly WizardField[] };

export interface WizardField {
  name: string; labelKey: I18nKey; secret: boolean; pattern?: string; maxLength: number;
  /** Shows a "Paste from clipboard" button (ADR 43). */
  paste?: boolean;
  /** Applied by the core before validating, e.g. 'json-field:authorizationCode' or 'url-query:code' (ADR 43). */
  extract?: `json-field:${string}` | `url-query:${string}`;
}

export type WizardInput =
  | { kind: 'continue' }
  | { kind: 'fields'; values: Readonly<Record<string, string>> }
  | { kind: 'callback'; query: Readonly<Record<string, string>> };

/** accountLabel: non-secret display name shown in Settings; never logged. */
export interface WizardDone { kind: 'done'; accountLabel?: string }

// ---------- Library and scan results ----------

export interface LibrarySnapshot {
  /** false if the store returned a partial list: the core must not mark missing properties as no longer owned. */
  readonly complete: boolean;
  readonly entries: readonly StoreEntry[];
}

export interface StoreEntry {
  readonly storeGameId: string;
  readonly kind: 'game' | 'dlc';
  /** For DLC, when the store says which game it belongs to. */
  readonly baseStoreGameId?: string;
  readonly title: string;
  readonly externalIds?: Readonly<Partial<Record<'igdb' | 'rawg' | 'steamAppId', string>>>;
  readonly media?: { readonly coverUrl?: string; readonly heroUrl?: string; readonly iconUrl?: string };
  readonly storePlaytimeMinutes?: number;
  /** ISO 8601. */
  readonly storeLastPlayedAt?: string;
}

export interface ScanResult {
  readonly entries: readonly InstalledEntry[];
  readonly unreadableRoots: readonly { root: ScanRoot; code: ConnectorErrorCode }[];
}

export interface InstalledEntry {
  /** Absent when the store id cannot be read; the core then relies on title only. */
  readonly storeGameId?: string;
  readonly kind: 'game' | 'dlc';
  readonly baseStoreGameId?: string;
  readonly title: string;
  /** Absolute, inside one of ctx.roots. */
  readonly installPath: string;
  /** Relative to installPath. Hints for process detection (pending decision). */
  readonly executables?: readonly string[];
  /** Opaque to the core, persisted, and handed back only to this connector in StoredProperty. */
  readonly launchData?: Readonly<Record<string, string>>;
}

// ---------- Actions ----------

/** Read from the database by the core. DLC never reach resolveAction. */
export interface StoredProperty {
  readonly storeGameId: string | null;
  readonly installed: boolean;
  readonly installPath: string | null;
  readonly launchData: Readonly<Record<string, string>> | null;
}

export type LaunchSpec =
  | { kind: 'uri'; uri: string }
  | { kind: 'exec'; executable: string; args: readonly string[]; cwd?: string };

// ---------- Errors ----------

export type ConnectorErrorCode =
  | 'auth.required' | 'auth.expired' | 'auth.invalid'
  | 'account.private-profile'
  | 'network.unavailable' | 'network.timeout' | 'store.rate-limited'
  | 'store.unexpected-response'
  | 'tool.missing' | 'tool.failed'
  | 'scan.root-unreadable'
  | 'launch.launcher-missing' | 'launch.not-installed'
  | 'action.unsupported'
  | 'internal';

/** message: English, for developers, no secrets. The UI shows messageKey (or connectors.common.errors.<code>). */
export class ConnectorError extends Error {
  constructor(
    readonly code: ConnectorErrorCode,
    message: string,
    readonly details: { messageKey?: I18nKey; params?: I18nParams; retryAfterMs?: number; cause?: unknown } = {},
  ) { super(message); }
}

// ---------- Prices (phase 3; shape to be confirmed then) ----------

export interface PriceProvider {
  getPrice(entry: { storeGameId: string }, region: string, ctx: SyncContext):
    Promise<{ amountMinor: number; currency: string; regularAmountMinor?: number; url: string } | null>;
}
```

Reglas del lado del núcleo:

1. **Aislamiento.** Cada conector se ejecuta en su propia tarea, con `AbortSignal` y tiempo máximo por operación. El núcleo combina los resultados con `Promise.allSettled`; un fallo se guarda en el estado de sincronización de esa tienda (código y clave de traducción) y no afecta a las demás. Cualquier excepción que no sea `ConnectorError` se convierte en `internal`. El aislamiento es dentro del proceso; las herramientas externas ya corren en procesos aparte. Si hiciera falta más, el contrato permite mover un conector a un hilo de trabajo sin cambiarlo.
2. **Intervalo mínimo.** Antes de sincronizar una tienda, el núcleo aplica el mayor entre `minSyncIntervalMs` y el valor configurado (pendiente), contado desde el último intento. Vale para la sincronización automática y para el botón manual; si no toca aún, la interfaz muestra cuándo estará disponible. Los escaneos locales no están sujetos a este intervalo.
3. **Instantáneas.** Con `complete: false`, el núcleo añade y actualiza propiedades pero no da de baja las ausentes. El emparejamiento con juegos canónicos (decisión 20) y el tratamiento de los DLC son del núcleo; el conector solo informa de `kind` y `baseStoreGameId` cuando la tienda los da.
4. **Validación de salidas.** El núcleo valida todo lo que devuelve un conector: identificadores no vacíos y de longitud acotada, `installPath` dentro de una raíz del contexto, URL de medios en `https`, URL del asistente en `authHosts`.
5. **Lanzamiento (invariante 3).** La API solo recibe el ID de un juego canónico guardado y, opcionalmente, el ID de una de sus propiedades; el núcleo carga la `StoredProperty` de la base de datos y llama a `resolveAction`. Antes de ejecutar, el núcleo comprueba: que la acción y el tipo están en las capacidades; para `uri`, que el esquema está en `uriSchemes`; para `exec`, que `executable` es una ruta absoluta existente dentro de `installPath` de esa propiedad ~~o de una ubicación resuelta de tipo `launcher`~~ (revisado en la decisión 77: las ubicaciones `launcher` no amplían el confinamiento; solo vale `installPath`), y que ningún argumento contiene caracteres de control. `ProcessLauncher` ejecuta sin shell, con argumentos como lista, y abre las URI con la API del sistema, no con `cmd /c start`. La `LaunchSpec` no sale nunca por la API; la única excepción futura es el modo servidor sin agente (decisión 22), que devuelve al navegador solo especificaciones `uri` con esquema permitido.
6. **Secretos.** Los conectores guardan y leen sus tokens solo con `secrets`; el cifrado (algoritmo pendiente) y la clave (decisión 14) son del núcleo y de la plataforma. Los `Secret` no se pueden imprimir por accidente y el registro filtra además cualquier valor que coincida con un secreto conocido.
7. **Herramientas externas.** `legendary` y `gogdl` las ejecuta el núcleo con su directorio de configuración en una carpeta temporal privada, rehidratada desde el almacén cifrado y borrada al terminar. Comprobado en octubre de 2026: `legendary` deriva su directorio de configuración de `XDG_CONFIG_HOME` (así lo usa Heroic, PR #2803), y `gogdl` recibe la ruta del JSON donde guarda sus tokens. El nombre exacto del argumento de `gogdl` está por confirmar con su ayuda en línea. (Revisada en la decisión 77 para GOG y en la 78 para Epic: ninguna de las dos usa herramientas externas; la regla queda para un uso futuro, como descargar juegos.)
8. **Ubicaciones descubiertas.** Los conectores declaran en `locations` qué valores de registro o carpetas conocidas necesitan (por ejemplo, el directorio de Steam o los manifiestos del launcher de EA). La plataforma los resuelve de forma genérica, sin saber nada de tiendas. Solo se resuelven si el usuario aceptó la autodetección (decisión 42). Ajustes muestra las ubicaciones detectadas junto a sus carpetas y permite desactivarlas.
9. **Traducciones.** Cada conector trae `locales/es.json` y `locales/en.json` con sus claves bajo `connectors.<id>.*`; los códigos de error comunes se traducen en `connectors.common.errors.<code>`. Los parámetros de los mensajes no llevan secretos.
10. **Prohibido en un conector:** importar módulos `node:*` de E/S, usar `fetch`, `process.env` o `child_process`, escribir en disco, tocar la base de datos, conocer el `user_id`, emparejar juegos y reintentar en bucle sin espera.
11. **Versionado.** Un cambio incompatible del contrato sube `contractVersion`; `runtime` rechaza al arrancar un conector con una versión distinta.

Capacidades previstas por tienda (orientativas; el agente de conectores las verifica con cuentas y juegos reales):

| Tienda | `access` | `library` | `scan` | Lanzamiento previsto |
|---|---|---|---|---|
| Steam | `official-api` | sí | sí | `uri` (`steam`) |
| GOG | `unofficial-api` | sí | sí | ~~`exec` (cliente de Galaxy)~~ `exec` del ejecutable del juego; Galaxy, opcional (revisado en la decisión 76) |
| Epic | `unofficial-api` | sí | sí | ~~`uri` del launcher de Epic, a verificar~~ `uri` (`com.epicgames.launcher`) del launcher (revisado en la decisión 78) |
| Ubisoft | `local-only` | no | sí | `uri` (`uplay`), a verificar |
| EA | `local-only` | no | sí | `uri` o `exec`, a validar con juegos reales |

**Motivo:** un contrato que solo describe (datos y especificaciones de lanzamiento) y deja la ejecución, la persistencia y la validación al núcleo concentra en un único sitio lo delicado: lanzar procesos, guardar secretos y tocar el disco. Los conectores, que son la parte que más se romperá, quedan pequeños, sin E/S propia y comprobables con respuestas grabadas sustituyendo `http`, `fs` y `tools` por los dobles de `connector-testkit`. Alternativas descartadas: que el conector lance el juego él mismo (dispersa la superficie de ejecución de procesos y rompe el invariante 3); que el conector reciba la clave o los tokens descifrados en bruto y gestione su persistencia (multiplica los puntos donde puede filtrarse un secreto); un asistente de conexión con interfaz propia por conector (obliga a meter React en los conectores; los pasos declarativos bastan para OpenID, códigos de autorización y claves).

**Consecuencias:**

- `capabilities` alimenta la interfaz: filtros, botones disponibles y avisos de fragilidad para las APIs no oficiales.
- Confirmado por el usuario: en la pantalla de tiendas, cada conector con `access: 'unofficial-api'` (hoy Epic y GOG) muestra un icono de alerta junto a su nombre. Al pasar el ratón o al enfocarlo con el teclado (decisión 37), un tooltip traducido explica que se usa una vía no oficial que puede dejar de funcionar sin aviso y que el proyecto no está afiliado a la tienda. La clave común es `connectors.common.access.unofficial`.
- Las tiendas sin cuenta (Ubisoft y EA) no tienen `connection` ni `listLibrary`; solo muestran instalados (decisión 16).
- El modelo de datos detallado (pendiente) debe guardar `launchData`, `executables`, `storePlaytimeMinutes` y el estado de sincronización por tienda con código y clave de error.
- La decisión 11 decía «sin pegar claves a mano»: el paso `input` existe porque Steam exige la API key del usuario y el flujo de Epic puede requerir copiar un código de autorización. El asistente lo guía paso a paso y lo valida con `pattern`. La propuesta de la decisión 43 lo resuelve con el botón de pegar y la extracción automática.
- El agente de conectores no necesita decisiones nuevas para empezar Steam; sí para el valor del intervalo y para la detección de procesos.

### 41. Controlador de SQLite: `better-sqlite3` con Drizzle estable

**Decisión (confirmada por el usuario: «lo más estable posible»):** `better-sqlite3` (13.0.3 a 21 de octubre de 2026) con Drizzle en su línea estable 0.x: `drizzle-orm` 0.45.4 y `drizzle-kit` 0.31.11 (etiqueta `latest` de npm comprobada esa fecha), con el controlador `drizzle-orm/better-sqlite3`. Versiones fijadas de forma exacta. La base de datos va en modo WAL y con claves foráneas activadas. Las copias de seguridad (decisión 18) usan `db.backup()` de `better-sqlite3`.

Nota de trazabilidad: una primera redacción de esta decisión, nunca confirmada, recomendaba `node:sqlite` con Drizzle 1.0 RC. El usuario la descartó antes de confirmarla porque las dos piezas siguen en fase de candidata: `node:sqlite` está en estabilidad 1.2 («release candidate») en Node 24 y Drizzle 1.0 solo existe como RC (1.0.0-rc.4).

**Por qué un módulo nativo complica el empaquetado, y cómo se mitiga:**

- `better-sqlite3` no es solo JavaScript: incluye un binario compilado (`.node`). Ese binario no se puede meter dentro del fichero de un ejecutable único de Node como el resto del código. Hay que distribuirlo en la misma carpeta que el ejecutable, o extraerlo a una carpeta temporal y cargarlo con `process.dlopen` (documentación de ejecutables únicos de Node 24).
- El binario tiene que coincidir con el sistema, la arquitectura y la biblioteca de C: win32-x64 para Windows, linux-arm64 o linuxmusl-arm64 para Docker en ARM. Hasta la versión 12, además, tenía que coincidir con la versión exacta de Node (ABI). Desde la 13 usa N-API, una interfaz estable entre versiones de Node, y trae los binarios dentro del propio paquete para win32-x64, win32-arm64, linux-x64, linux-arm64, linuxmusl-x64, linuxmusl-arm64, darwin-x64 y darwin-arm64 (mapa `exports` del paquete 13.0.3). Eso elimina casi todo el problema de versiones.
- Si no hay binario para la plataforma, se compila al instalar. Eso exige herramientas de compilación y que pnpm lo tenga en su lista de permitidos (decisión 39). El 13.0.3 no declara scripts de instalación. Supuesto: pnpm puede detectar igualmente una compilación implícita por `binding.gyp`; si lo hace, se añade a la lista con justificación.
- **Mitigación:** el instalador de Windows lleva el `.node` de win32-x64 junto al ejecutable, en una carpeta propia, y se carga desde ahí (decisión 45). La imagen Docker se construye por arquitectura con el binario que trae el paquete. Una prueba de humo en CI abre una base de datos desde el artefacto empaquetado.
- El coste no es exclusivo de SQLite. El almacén de credenciales (decisión 45) y la bandeja probablemente exigen ya código nativo o un ejecutable auxiliar, así que el empaquetado tiene que resolver módulos nativos de todos modos.

**Motivo:** `better-sqlite3` lleva años en producción, Drizzle lo soporta en su línea estable y la 13 reduce el problema de los binarios. Alternativas descartadas: `node:sqlite` con Drizzle 1.0 RC (sin binario nativo, pero las dos piezas siguen en fase candidata); `node:sqlite` con un adaptador propio sobre `sqlite-proxy` de Drizzle 0.x (deja una pieza en RC y añade código propio).

**Consecuencias:**

- No hace falta un mínimo concreto dentro de Node 24 LTS: `better-sqlite3` 13 pide Node 22 o posterior.
- La versión de SQLite la marca `better-sqlite3` (3.53.4 según su documentación de compilación) y se actualiza con el paquete.
- Cuando Drizzle 1.0 sea estable, la migración es una decisión aparte que solo afecta a `packages/db`.
- `node:sqlite` queda como alternativa si en el futuro se estabiliza y conviene quitar el binario.

### 42. Detección de instalaciones: autodetección y carpetas manuales (amplía la decisión 3)

**Decisión (confirmada por el usuario):** hay dos fuentes de detección que se pueden combinar.

- **Autodetección:** lectura, solo de lectura, de las ubicaciones que declara cada conector, como valores del registro de Windows o carpetas conocidas de los launchers (por ejemplo, el directorio de Steam y sus bibliotecas, o los manifiestos del launcher de EA). Es el mecanismo `locations` de la decisión 40.
- **Carpetas manuales:** las que indica el usuario (decisión 3).

En el primer arranque, un paso del asistente inicial pregunta cómo configurarlo, con una explicación breve de qué se lee:

1. Automática y carpetas manuales (recomendada).
2. Solo las carpetas que yo indique.
3. Configurarlo más tarde.

La elección se puede cambiar en Ajustes, donde cada ubicación detectada aparece con su ruta y su propio interruptor.

**Motivo:** la autodetección hace que el público general vea sus juegos sin configurar nada (decisión 30). Preguntar en el primer arranque respeta a quien no quiere que la aplicación lea el registro o carpetas de otros programas.

**Consecuencias:**

- Nunca se escribe en el registro ni en ficheros de los launchers. Solo se leen las claves y carpetas declaradas por los conectores y aceptadas por el usuario.
- Con «solo carpetas manuales», el contexto de escaneo solo recibe raíces de origen `user`. Algunas tiendas detectarán peor sin sus manifiestos, en especial Ubisoft, que guarda sus instalaciones en el registro (supuesto a verificar), y la interfaz lo avisa.
- Con «configurarlo más tarde», la biblioteca se limita a lo que llegue por API (Steam, GOG y Epic conectados).
- La lista de ubicaciones detectadas y su estado se guarda por dispositivo (decisión 47).

### 43. Credenciales en los asistentes de conexión (revisa la decisión 11; parte de Epic revisada en la decisión 78)

**Decisión (confirmada por el usuario el 21 de octubre de 2026):** el principio de «sin pegar claves a mano» de la decisión 11 se sustituye por «sin escribir nada y sin editar ficheros». Cuando una tienda obliga a trasladar un dato, el asistente lo pide con un botón **Pegar desde el portapapeles** y lo valida en el momento.

- **El botón de pegar:** usa `navigator.clipboard.readText()` al pulsarlo. `http://127.0.0.1` cuenta como contexto seguro (supuesto: los navegadores tratan la dirección de bucle local como potencialmente confiable). Con la decisión 66 la web vive en `http://ludiary.localhost:<puerto>`, que la especificación de contextos seguros también trata como potencialmente confiable (supuesto, se comprueba en la 66). Chrome pide permiso de lectura del portapapeles; Firefox muestra un menú «Pegar» en el momento (lectura sin permiso desde Firefox 147, según MDN). Si el navegador lo deniega, se usa el campo normal con Ctrl+V. El valor nunca se guarda en el navegador, se envía al servidor y se cifra (decisión 46).
- **Steam:**
  - No existe vía oficial para obtener la API key sin que el usuario la copie. OpenID solo da el SteamID y no hay OAuth para usuarios finales; la clave se crea en `steamcommunity.com/dev/apikey`.
  - Pasos: (1) inicio de sesión con OpenID, sin copiar nada; (2) botón que abre la página de la clave, con instrucciones de qué poner en el campo de dominio; (3) Pegar, comprobación del formato (32 caracteres hexadecimales) y llamada de prueba a `IPlayerService/GetOwnedGames`; (4) si el perfil o los detalles de juego no son públicos, se explica cómo cambiarlo y se reintenta.
  - Modo alternativo **«Steam sin clave: solo instalados»**, que usa solo el escaneo local (decisión 42), para quien no quiera crear la clave.
  - **Descartado:** la lista XML del perfil de la comunidad (Valve la declara obsoleta y recorta las bibliotecas grandes); deducir la biblioteca de ficheros locales como `localconfig.vdf` (no oficial, solo refleja este PC y no la propiedad completa); y obtener la clave o tokens a partir de la sesión del cliente o de cookies de Steam (choca con las condiciones de uso y con el invariante 5).
- **Epic:**
  - ~~Se usa el inicio de sesión con ventana integrada de `legendary` (versión 0.20.14 o posterior en Windows, según su README): abre el login oficial de Epic en una ventana y recoge el código automáticamente, sin copiar nada.~~ (Revisado en la decisión 78: no se usa `legendary`; la vía es la del punto siguiente.)
  - Si esa ventana no está disponible, se abre el login en el navegador y el usuario pega la respuesta. El asistente extrae `authorizationCode` del JSON pegado, así que no hace falta seleccionar solo el código.
  - **Descartado:** `legendary auth --import`, que lee la sesión del Epic Games Launcher y además la cierra.
- **GOG:** se abre el login oficial y al terminar el usuario pega la dirección final de la página. El asistente extrae el código de la URL. Supuesto: es el flujo de `gogdl`, con redirección fija a una página de GOG, lo que impide que la vuelta llegue a nuestro servidor. Una ventana integrada como la de Epic queda como mejora posterior.

**Motivo:** se mantiene la vía oficial donde existe y no se toca ninguna sesión de otros clientes. Lo único que el usuario hace es pulsar Pegar, que es lo más cerca de «sin pasos técnicos» que permiten las tiendas. Alternativas descartadas: pegar a mano sin ayuda (más errores y más abandono); automatizar la captura con cookies o sesiones de otros clientes (condiciones de uso y riesgo de seguridad).

**Consecuencias:**

- El tipo de paso `input` de la decisión 40 incorpora `paste: true` y un `extract` opcional (`'json-field:authorizationCode'`, `'url-query:code'`) que el núcleo aplica antes de validar.
- ~~La ventana integrada de `legendary` la abre un proceso del servidor en el escritorio del usuario: solo funciona en modo localhost.~~ (Sin efecto tras la decisión 78.)
- El documentalista prepara guías con capturas para crear la clave de Steam y hacer públicos los detalles de juego.

### 44. Nombre del proyecto y ámbito de los paquetes

**Decisión (confirmada por el usuario el 21 de octubre de 2026):** el proyecto se llama **Ludiary** (de *ludus*, juego, y *diary*, diario). Los paquetes del workspace usan el ámbito `@ludiary/` y todos llevan `"private": true`. El identificador técnico (rutas, variables de entorno, entrada del almacén de credenciales) es `Ludiary`, o `LUDIARY` en las variables de entorno.

**Motivo:** el nombre provisional, «Atlas Games», coincidía casi exactamente con una marca registrada de juegos de Trident, Inc. (editorial de Ars Magica y Once Upon a Time). Ludiary describe lo que hace la aplicación: la biblioteca y el tiempo de juego del usuario. Con `"private": true` los paquetes nunca se publican en npm, así que el ámbito no necesita estar libre; aun así, lo está.

**Comprobaciones (21 de octubre de 2026):**

- npm: no existe ningún paquete `ludiary`.
- GitHub: no hay ningún usuario ni organización `ludiary`, ni repositorios con ese nombre.
- Búsqueda web: no aparece ninguna app, producto ni marca con ese nombre.
- Candidatos descartados: Playdex (ya existe una app de bibliotecas de juegos con ese nombre), Lanzadera (aceleradora de empresas española), Portolan, Orrery y Cartograph (ocupados en npm), Gamedex y Gameshelf (cientos de repositorios), Ludora y Juegoteca (cuenta de GitHub ocupada) y Ludoatlas (conserva «Atlas»).

**Riesgo (no es asesoría legal):** no se han consultado las bases oficiales de marcas (EUIPO, OEPM, USPTO) ni la disponibilidad de dominios. Se comprueban antes de la primera publicación, por ejemplo con TMview.

**Consecuencias:**

- El nombre visible y el identificador técnico (rutas, entrada del almacén de credenciales, cookie) salen de una sola constante de configuración, para poder renombrar sin tocar el código.
- La decisión 38 queda con ámbito `@ludiary/`.
- La carpeta local del repositorio puede seguir llamándose `AtlasGames`: no afecta al producto.

### 45. Ejecutable, instalador, bandeja y almacén de claves en Windows (ampliada en las decisiones 62 a 65)

**Decisión (confirmada por el usuario el 21 de octubre de 2026, tras validar el prototipo y sus pruebas manuales):**

- **Ejecutable:** ejecutable único de Node (SEA) generado desde un único fichero CommonJS producido por un empaquetador de JavaScript (esbuild). El ejecutable no lleva dentro los módulos nativos: se instalan en una carpeta `native/` junto a él y se cargan desde ahí. Si SEA da problemas, la alternativa es distribuir `node.exe` oficial con el fichero empaquetado y un pequeño iniciador con el icono y el nombre de la aplicación.
- **Un solo ejecutable con varios papeles:** el acceso directo abre `Ludiary.exe`. Si el servidor responde a la comprobación de estado, le pide un enlace de apertura y abre el navegador; si no, arranca el servidor en segundo plano y la bandeja. El agente local futuro es el mismo ejecutable con otra configuración (decisión 22).
- **Bandeja (confirmada por el usuario el 21 de octubre de 2026):** un ejecutable auxiliar pequeño y propio, en Go con una librería de bandeja sin CGO (por ejemplo `gogpu/systray`), que habla con el servidor por su entrada y salida estándar. Recibe sus textos ya traducidos desde el servidor. Alternativas: `systray2` (envuelve un auxiliar en Go ya hecho; mantenimiento por confirmar) o un auxiliar en .NET (exige runtime o NativeAOT).
  - Prueba manual del usuario (21 de octubre de 2026): el tooltip no aparecía. Causa: `gogpu/systray` v0.3.0 registra el icono con `NOTIFYICON_VERSION_4` y nunca envía `NIF_SHOWTIP`, que ese modo exige. No hay versión posterior con el arreglo, así que se usa una copia parcheada en `apps/desktop/tray-helper/third_party/gogpu-systray` (MIT, cambio descrito en su `PATCHED.md`) mediante `replace` en `go.mod`. Se quita en cuanto haya una versión oficial con el arreglo.
- **Almacén de claves:** `@napi-rs/keyring` sobre el Administrador de credenciales de Windows (supuesto: binding mantenido con binarios precompilados; verificar en el prototipo). Alternativa: un módulo nativo propio sobre DPAPI.
- **Instalador:** Inno Setup, con instalación por usuario en `%LOCALAPPDATA%\Programs\Ludiary` sin permisos de administrador, textos en español e inglés, acceso directo y desinstalador que pregunta si se borran los datos. Supuesto: su licencia permite usarlo en un proyecto GPL; verificar. Alternativas: Velopack (instalador y actualizaciones juntos, pero no admite volver a una versión anterior, que la decisión 32 exige); NSIS; MSIX (restricciones de empaquetado y de lanzamiento de procesos por evaluar).
- **Datos fuera del programa:** base de datos, registros y configuración de arranque en `%LOCALAPPDATA%\Ludiary\`, separados de la carpeta del programa para que las actualizaciones no los toquen.
- **Textos del instalador (ampliación tras la auditoría del prototipo, recomendada):** los textos propios del instalador usan el mecanismo de idiomas de Inno Setup: los `.isl` que trae Inno para sus mensajes y `[CustomMessages]` con prefijo de idioma (`spanish.`, `english.`) para los nuestros, que el código Pascal usa siempre como `{cm:Clave}`. Se acepta frente al invariante 6 porque son ficheros de traducción por idioma, no texto mezclado con la lógica, con dos condiciones: los mensajes propios salen del `.iss` principal a un fichero incluido que solo contiene mensajes (`apps/desktop/installer/messages.iss`, con `#include`), y la compilación del instalador falla si una clave existe en un idioma y no en el otro. No se comparten con `@ludiary/i18n`: el instalador corre antes de que exista la aplicación y son unas pocas frases.
- **Ampliaciones tras la auditoría del prototipo:** instancia única (decisión 62), autenticación entre lanzador y servidor (63), errores fatales visibles y credenciales no reconocidas (64), y ganchos de prueba y opciones de Node en el ejecutable publicado (65).

**Motivo:** son piezas conocidas y separables, de modo que un fallo en una (por ejemplo, la bandeja) se cambia sin rehacer las demás. SEA es la vía oficial de Node.

**Consecuencias:**

- El empaquetador valida en el prototipo los ocho puntos de su guía con estas piezas. La condición original para pasar a vigente era el ciclo completo: instalar, arrancar, bandeja, SQLite, credencial, abrir navegador y actualizar con vuelta atrás. *Revisión del 21 de octubre de 2026 (decisión del usuario):* la decisión se confirma con todo el ciclo validado salvo la actualización con vuelta atrás, que no depende de estas piezas sino del actualizador y pasa a ser requisito de la decisión 58.
- La compilación de Windows necesita Node, Go e Inno Setup en CI (por ejemplo, GitHub Actions con Windows).

**Resultados del prototipo (21 de octubre de 2026, Windows 11 10.0.26200, x64):** código en `apps/desktop`, `packages/platform-windows`, `packages/runtime`, `packages/api`. Las comprobaciones de línea de comandos se ejecutaron de verdad; lo visual queda en la lista de pruebas manuales del informe del empaquetador. Estado: **cerrable** si el usuario valida esas pruebas (icono y menú de la bandeja, asistente del instalador, apertura real del navegador). El ciclo de actualización firmada con vuelta atrás (punto 8 de la guía del empaquetador) no se ha implementado: queda para la decisión 58, con las implicaciones de más abajo. El estado de la decisión no se ha cambiado.

*Versiones usadas:* Node 24.20.0, pnpm 11.28.6, Go 1.27.0, `better-sqlite3` 13.0.3 (SQLite 3.53.4), `@napi-rs/keyring` 2.1.2, Fastify 5.12.7, esbuild 0.28.2, `postject` 1.0.0-alpha.6, `resedit` 3.1.0 (solo compilación), `gogpu/systray` 0.3.0, Inno Setup 6.7.3, TypeScript 7.0.2.

*Qué funcionó:*

- **SEA desde un bundle de esbuild:** un único CommonJS de 1,5 MB (sin minificar, con Fastify y Pino dentro, sin avisos de esbuild) inyectado en una copia de `node.exe`. El ejecutable pesa 95 MB (es el runtime de Node); el instalador comprimido, 27 MB. En Node 24.20 solo existe `--experimental-sea-config` más `postject`; `--build-sea` llegó en Node 25.5.0 y no consta que esté en la línea 24.
- **`better-sqlite3` 13.0.3 desde `native/`:** se carga con `process.dlopen` y se pasa a la base de datos como objeto en la opción `nativeBinding` (la versión 13 lo admite). Dentro de un SEA `require` no carga ficheros `.node`, así que no sirve el camino por defecto. Verificado desde el exe: modo WAL, claves foráneas, escritura y lectura, `db.backup()` y lectura de la copia. El paquete no declara scripts de instalación: pnpm no necesitó permitir nada para él (supuesto de la decisión 41 confirmado).
- **`@napi-rs/keyring` 2.1.2:** hay binario `win32-x64-msvc` precompilado. Se carga también con `process.dlopen` sobre el `.node` suelto, sin pasar por su `index.js` (que usa `require`). Escritura, lectura y borrado de 32 bytes con `setSecret` y `getSecret` comprobados. La entrada aparece en el Administrador de credenciales como credencial genérica con destino `<nombre>.<servicio>`: `master-key/1.Ludiary` e `install-token.Ludiary`. Primer arranque «creada», siguientes «cargada». Este paquete tampoco tiene scripts de instalación.
- **Bandeja en Go sin CGO:** auxiliar de 3 MB (`CGO_ENABLED=0`, `-H=windowsgui`) con `gogpu/systray` 0.3.0 (MIT). Protocolo de un JSON por línea sobre stdio; los textos llegan ya traducidos desde el servidor (es/en). Comprobado: arranca, informa «ready», acepta actualizaciones de menú y se cierra al cerrarse su stdin (si el servidor muere de golpe con `taskkill /F`, el auxiliar desaparece solo). Falta la comprobación visual y el clic.
- **Servidor e instancia única:** Fastify en `127.0.0.1`, puerto según la decisión 53 guardado en `runtime.json`, `/api/health` que identifica a Ludiary (28), `Host` distinto de `127.0.0.1:<puerto>` rechazado con 421 (incluido `localhost`) y `Origin` ajeno con 403 (23). El lanzador reutiliza el servidor vivo (segunda ejecución: mismo PID, solo nuevo enlace); cuatro lanzamientos simultáneos dejan un solo servidor (cerrojo de arranque exclusivo); un servidor muerto con `taskkill /F` se recupera; y con el puerto guardado ocupado por otro programa se elige uno nuevo y se actualiza `runtime.json`. El arranque en frío hasta tener el enlace tarda unos 0,5 s. *Nota posterior:* el auditor encontró dos carreras en ese cerrojo de fichero con PID; se sustituye por el cerrojo del sistema de la decisión 62, y el envío del token en claro por la autenticación de la 63.
- **Enlace de un solo uso y cookie (29, 54):** `POST /api/open-link` exigía el token de instalación (sustituido por el protocolo de la decisión 63); `GET /open?t=…` responde 302 con `Set-Cookie: …; Path=/; HttpOnly; SameSite=Strict`; el segundo canje del mismo enlace da 403; `/` sin cookie da 401 y con cookie 200.
- **Instalador Inno Setup 6.7.3:** por usuario, sin administrador, en `%LOCALAPPDATA%\Programs\Ludiary`; acceso directo en el menú Inicio y opcional en el escritorio; textos es/en (`Spanish.isl` viene con Inno); desinstalador. Comprobado en modo silencioso: instalar; instalar encima con el servidor en marcha (lo para antes); desinstalar conservando datos (valor por defecto en silencio); desinstalar borrando datos y credenciales (`/PURGEDATA=1` en silencio, o la pregunta en el asistente); y el acceso directo abriendo la web. La licencia de Inno Setup es permisiva (se conservan copyright y avisos), compatible con distribuir el instalador de un proyecto GPL (supuesto de esta decisión confirmado leyendo su `license.txt`).

*Qué no funcionó o hay que tener en cuenta:*

- **Orden de las herramientas del exe:** editar con `resedit` (icono, versión, subsistema) y luego inyectar con `postject` falla («Relocation corrupted»). Funciona inyectar primero y editar después. Ambos pasos quitan la firma del `node.exe` oficial: Authenticode (decisión 58) debe aplicarse a `Ludiary.exe` ya terminado.
- **Subsistema GUI:** `node.exe` es de consola y un acceso directo mostraría una ventana negra. El prototipo cambia el subsistema del exe a Windows GUI (campo de la cabecera PE). Consecuencia: el exe no tiene salida estándar. El diagnóstico va por ficheros de registro (`%LOCALAPPDATA%\Ludiary\logs`), `--selftest --out <fichero>` para las pruebas, y si el lanzador falla el usuario no ve ningún mensaje (pendiente: cuadro de error, por ejemplo desde el auxiliar de Go). *Resuelto en la decisión 64.*
- **`postject` 1.0.0-alpha.6** no se publica desde mayo de 2023. Es la herramienta que documenta Node, pero es un riesgo de mantenimiento.
- **Un servidor visto sin terminar:** una vez, en una prueba contaminada (asistente sin modo silencioso por un parámetro mal pasado), un servidor registró «shutting down» y siguió vivo. No se reprodujo con las pruebas limpias; se añadió una salida forzada a los 5 s.
- **`gogpu/systray` es joven** (versión 0.x, repositorio con pocas decenas de estrellas). Las alternativas de la decisión (`systray2`, .NET) no se probaron.
- **Nombre de la credencial:** el destino real es `<nombre>.<servicio>` (`master-key/1.Ludiary`); la decisión 46 habla de `Ludiary/master-key/<keyId>`. Solo es una convención de nombres, pero conviene alinear el texto. *Alineado en la decisión 46.*

*Qué implican las decisiones aún no implementadas:*

- **Cifrado (46):** `node:crypto` (AES-256-GCM, `scrypt`, SHA-256) funciona dentro del SEA. La clave maestra de 32 bytes ya se guarda como bytes en el Administrador de credenciales; un envoltorio con contraseña maestra cabe de sobra en el límite del almacén (2560 bytes por credencial, según la documentación de Windows; sin verificar en el prototipo). El lanzador necesita el token de instalación en claro para pedir el enlace: en el prototipo vive en el Administrador de credenciales (`install-token`), mientras que la decisión 46 dice que en la base de datos solo va su hash. Son compatibles, pero hay que confirmar que el token en claro vive en el almacén del sistema. *Confirmado en la decisión 63: vive en claro en el almacén del sistema y no viaja nunca.*
- **Actualizador (58):** las carpetas versionadas (`app-<versión>`) chocan con dos hechos del prototipo: el acceso directo apunta a una ruta fija y un exe en marcha no se puede reemplazar. Hace falta un lanzador mínimo y estable en la raíz de la instalación que lea el puntero de versión activa (candidato natural: ampliar el auxiliar de Go, de 3 MB, para no duplicar los 95 MB de Node). Cada versión retenida pesa unos 100 MB descomprimidos (dos versiones conservadas, unos 200 MB). El instalador ya sabe parar el servidor con `Ludiary.exe --stop`; el actualizador debe hacer lo mismo antes de cambiar el puntero.
- **Firma:** hay tres binarios propios que firmar (`Ludiary.exe`, `ludiary-tray.exe`, el instalador). Sin Authenticode, SmartScreen avisará; no se ha probado en otro equipo.

### 46. Cifrado de secretos y rotación de la clave (token de instalación revisado en la decisión 63; formato de la entrada en la decisión 64)

**Decisión (confirmada por el usuario el 21 de octubre de 2026):**

- **Algoritmo:** AES-256-GCM de `node:crypto`, con un nonce aleatorio de 12 bytes por cifrado y etiqueta de 16 bytes. Datos asociados (AAD) = `user_id|ámbito|nombre`, de modo que un valor cifrado no se pueda mover a otra fila o a otro conector.
- **Formato:** texto `v1.<keyId>.<nonce base64url>.<cifrado+etiqueta base64url>`, guardado en la columna `ciphertext` de la tabla `secrets` (decisión 47) junto con `key_id`.
- **Clave:** 32 bytes aleatorios generados en el primer arranque.
  - Localhost: se guarda en el Administrador de credenciales con servicio `Ludiary` y cuenta `master-key/<keyId>`. Windows la muestra como credencial genérica con destino `master-key/<keyId>.Ludiary` (por ejemplo, `master-key/1.Ludiary`), según comprobó el prototipo de la decisión 45. El texto original decía `Ludiary/master-key/<keyId>`; era solo una convención de nombres y se alinea con lo real.
  - Docker: variable `LUDIARY_MASTER_KEY`, o un fichero de secreto en `/run/secrets/`, en base64.
  - La aplicación usa un anillo de claves: una activa y, durante la rotación, las anteriores.
- **Rotación** (botón en Ajustes, y en Docker con `LUDIARY_MASTER_KEY_PREVIOUS`): se crea una clave nueva y se marca como activa, se recifran todos los secretos en una transacción, se comprueba que todos descifran y solo entonces se borra la anterior. Si falla, se deshace la transacción y sigue la clave anterior.
- **Pérdida de la clave:** los secretos que no descifran se borran y sus tiendas pasan a «hay que volver a conectar» (decisión 14). La biblioteca y los datos del usuario no se tocan.
- **Contraseña maestra opcional (decisión del usuario; amplía la decisión 14):** por defecto no hay contraseña y la clave vive en el almacén del sistema. En Ajustes el usuario puede activar una contraseña maestra:
  - La clave maestra se guarda envuelta (cifrada con AES-256-GCM) con una clave derivada de la contraseña mediante `scrypt` de `node:crypto`, con sal aleatoria y parámetros guardados junto al envoltorio. En ese modo, el almacén del sistema solo guarda el envoltorio, nunca la clave en claro. El envoltorio va en la misma entrada `master-key/<keyId>` con el prefijo de formato de la decisión 64, para que una versión anterior no lo confunda con una clave ausente.
  - Tras cada arranque, la biblioteca se ve con los datos guardados, pero las tiendas que necesitan tokens quedan en «bloqueado» hasta que el usuario escribe la contraseña en la web. La clave desbloqueada vive solo en memoria.
  - Olvidar la contraseña equivale a perder la clave: se vuelve a conectar las tiendas, sin perder la biblioteca ni los datos del usuario.
  - Activarla, cambiarla o quitarla vuelve a envolver la clave maestra, sin recifrar los secretos.
- **Lo que no se cifra sino que se guarda como hash:** las sesiones del navegador y el token de instalación se guardan como SHA-256 de un valor aleatorio de 32 bytes. Solo hace falta comprobarlos, no recuperarlos.
  - *Revisado en la decisión 63 para el token de instalación:* el lanzador y el servidor lo usan como clave HMAC, así que ambos lo necesitan en claro. Vive en el Administrador de credenciales (servicio `Ludiary`, cuenta `install-token`), protegido por Windows para el usuario, nunca en la base de datos ni en la red. Las sesiones del navegador y los enlaces de apertura siguen guardándose como hash.

**Motivo:** AES-GCM es un estándar autenticado, está en Node sin dependencias y el formato versionado permite cambiar de algoritmo más adelante. Alternativas descartadas: libsodium con XChaCha20-Poly1305 (otra dependencia nativa sin ventaja clara aquí); DPAPI directamente para cada secreto (solo existe en Windows y rompe el modo Docker).

**Consecuencias:** el núcleo depende del puerto `SecretCipher` (decisión 38) y la implementación vive en `platform-node`. Las pruebas cubren el recifrado, la clave perdida y la manipulación del AAD.

### 47. Modelo de datos detallado

**Decisión (confirmada por el usuario el 21 de octubre de 2026):** identificadores UUID en texto (`crypto.randomUUID`), fechas como enteros en milisegundos UTC y JSON en columnas de texto. Todas las tablas de datos llevan `user_id`.

| Tabla | Columnas principales | Notas |
|---|---|---|
| `users` | `id`, `created_at` | Un usuario en el MVP. |
| `devices` | `id`, `user_id`, `name`, `kind` (`local` / `agent`) | Equipo donde están las instalaciones. Prepara el agente y los varios PC; en el MVP hay uno. |
| `canonical_games` | `id`, `user_id`, `title`, `normalized_title`, `igdb_id`, `rawg_id`, `media` (JSON), `metadata_source`, `overrides` (JSON, futuro), `created_at`, `updated_at` | Lo que ve la biblioteca. Índice por (`user_id`, `normalized_title`). |
| `game_properties` | `id`, `user_id`, `canonical_game_id` (nulo solo en DLC huérfanos), `store` (`steam`…`ea` / `manual`), `store_game_id` (nulo si solo se detectó por carpeta), `kind` (`game` / `dlc`), `base_store_game_id`, `title`, `normalized_title`, `owned` (por API), `removed_at`, `store_metadata` (JSON), `store_playtime_minutes`, `store_last_played_at` | Única por (`user_id`, `store`, `store_game_id`). Los DLC son propiedades de tipo `dlc` cuyo `canonical_game_id` apunta al juego base. |
| `installations` | `id`, `property_id`, `device_id`, `install_path`, `executables` (JSON), `launch_data` (JSON), `detected_by` (`scan` / `library`), `last_seen_at` | «Instalado» significa que hay fila para el dispositivo actual. |
| `scan_roots` | `id`, `user_id`, `device_id`, `origin` (`user` / `discovered`), `path`, `declaration_id`, `store`, `enabled` | Carpetas manuales y ubicaciones detectadas (decisión 42). |
| `match_decisions` | `id`, `user_id`, `kind` (`merge` / `split`), `key_a`, `key_b`, `created_at` | Claves estables `store:store_game_id` (o un hash de la ruta para lo detectado por carpeta), no IDs de fila, para que sobrevivan a una reconstrucción. Prevalecen sobre el emparejamiento automático (decisión 20). |
| `duplicate_candidates` | `id`, `user_id`, `canonical_a`, `canonical_b`, `reason`, `status` (`pending` / `dismissed`) | Descartar uno equivale a registrar un `split`. |
| `user_game_data` | `canonical_game_id`, `user_id`, `favorite`, `hidden`, `updated_at` | Datos del usuario (decisión 36). |
| `tags`, `game_tags` | `id`, `user_id`, `name` / `canonical_game_id`, `tag_id` | |
| `collections`, `collection_games` | `id`, `user_id`, `name`, `position` / `collection_id`, `canonical_game_id`, `position` | |
| `play_sessions` | `id`, `user_id`, `canonical_game_id`, `property_id`, `device_id`, `started_at`, `ended_at`, `duration_s` | Tiempo propio. Al fusionar, las sesiones pasan al canónico resultante (los tiempos se suman solos). Al separar, siguen a su `property_id`. |
| `store_connections` | `user_id`, `store`, `status`, `account_label`, `connected_at` | |
| `secrets` | `id`, `user_id`, `scope` (`store:<id>`, `service:igdb`…), `name`, `ciphertext`, `key_id`, `updated_at` | Formato de la decisión 46. |
| `sync_state` | `user_id`, `store`, `operation` (`library` / `scan`), `last_attempt_at`, `last_success_at`, `status`, `error_code`, `error_key`, `error_params` (JSON), `next_allowed_at` | Un registro por tienda y operación (decisiones 12 y 40). |
| `browser_sessions` | `id`, `user_id`, `token_hash`, `created_at`, `last_seen_at`, `expires_at` | Decisión 54. |
| `settings` | `user_id` (nulo si es global), `key`, `value` (JSON) | Idioma, carpeta de copias, opciones. El puerto no se guarda aquí (decisión 53). |

**Motivo:** separar instalaciones de propiedades prepara los varios PC y el agente sin migraciones dolorosas. Guardar sesiones de juego en lugar de un total hace que fusionar y separar no pierda tiempo. Usar claves estables en las decisiones de fusión las hace sobrevivir a una resincronización completa. Alternativas descartadas: una tabla `dlc` aparte (duplica columnas de propiedad); un total de tiempo por juego (se pierde al separar).

**Consecuencias:** este es el esquema objetivo, pero las migraciones de Drizzle se crean por fases: cada una añade solo las tablas y columnas que usa la funcionalidad que se implementa en ese momento, sin tablas vacías «para luego». `user_id` va desde la primera (invariante 7). Los DLC sin juego base se tratan como indica la decisión 52.

### 48. Framework de pruebas

**Decisión (confirmada por el usuario el 21 de octubre de 2026):** Vitest para las pruebas unitarias y de integración de todos los paquetes, con un proyecto por workspace. Playwright para unas pocas pruebas de extremo a extremo de la web contra un servidor con datos grabados, a partir de que exista la interfaz. Las respuestas grabadas son JSON en `connectors/<id>/fixtures/` y las reproducen los dobles de `connector-testkit`. Una comprobación en CI busca en esos ficheros patrones de token, SteamID, correo y rutas con nombre de usuario.

**Motivo:** Vitest es nativo de TypeScript y de módulos ES, comparte configuración con Vite y es lo que propuso el tester. Alternativas descartadas: Jest (configuración más pesada para ES y TypeScript); `node:test` (menos ergonomía y menos integración con Vite). Supuesto: la versión mayor vigente de Vitest se fija al instalar.

### 49. Traducción e idiomas de la documentación

**Decisión (confirmada por el usuario el 21 de octubre de 2026):**

- **Biblioteca:** i18next en el servidor (mensajes de error, textos de la bandeja) y react-i18next en la web. Catálogos JSON por espacio de nombres (`common`, `library`, `settings`, `connectors.<id>`…) en `packages/i18n` y en `locales/` de cada conector. Plurales con `Intl.PluralRules`, a través de i18next. Una comprobación en CI verifica que español e inglés tienen las mismas claves.
- **Documentación (confirmada por el usuario el 21 de octubre de 2026):**
  - Toda la documentación inicial se escribe en inglés: `README.md`, `CONTRIBUTING.md`, guías de usuario y documentación técnica.
  - El `README.md` de la raíz, el que muestra GitHub, está en inglés y empieza con un selector de idioma que enlaza a las traducciones.
  - Las traducciones del README viven en una carpeta propia, `docs/readme/README.<idioma>.md` (la primera, `README.es.md`). Añadir un idioma es añadir un fichero y su enlace en el selector.
  - Las guías de usuario se traducen más adelante con la misma estructura por idioma; mientras no exista la traducción, se enlaza la versión en inglés.
  - El ADR sigue en español.

**Motivo:** i18next funciona igual en Node y en React, que es justo lo que hace falta para compartir catálogos entre servidor, web y bandeja. Alternativas descartadas: FormatJS / react-intl (centrado en React, poco útil en el servidor); Lingui (exige compilar los catálogos y usar macros).

### 50. Intervalos mínimos de sincronización (espera de los escaneos ampliada en la decisión 72)

**Decisión (confirmada por el usuario el 21 de octubre de 2026):**

| Tienda | Suelo del conector (`minSyncIntervalMs`) | Sincronización automática al abrir la web |
|---|---|---|
| Steam | 10 minutos | Si la última correcta tiene más de 6 horas |
| GOG, Epic | 30 minutos | Si la última correcta tiene más de 12 horas |
| Ubisoft, EA (escaneo) | Sin suelo; se ignora una petición repetida en menos de 60 segundos | En cada apertura |

El botón manual respeta el suelo. Tras un error, el siguiente intento automático espera el doble del suelo, hasta 24 horas; el manual sigue disponible tras el suelo.

**Motivo:** son valores muy por debajo de cualquier límite conocido. Por ejemplo, el límite citado habitualmente para la API web de Steam es de 100 000 llamadas al día por clave; supuesto, porque no aparece en el texto oficial consultado. Las APIs no oficiales reciben menos tráfico para no llamar la atención. Alternativa descartada: un único valor para todas (penaliza a Steam o arriesga a Epic y GOG).

### 51. Normalización de nombres y ediciones dudosas

**Decisión (confirmada por el usuario el 21 de octubre de 2026):**

- **Normalización** (concreta la decisión 20), en este orden:
  1. Unicode NFKC.
  2. Minúsculas.
  3. Quitar ™, ® y ©.
  4. Quitar diacríticos.
  5. Convertir `&` en `and`.
  6. Sustituir cualquier carácter que no sea letra ni número por un espacio.
  7. Colapsar espacios.
- Si los títulos normalizados coinciden y ninguno contiene una marca de edición, las entradas se unen solas.
- **Edición dudosa:** si los títulos coinciden solo después de quitar marcas de edición o de añadir subtítulos, quedan separados y se marcan como posible duplicado.
  - Las marcas de edición son una lista mantenida en el código, con pruebas, por ejemplo: `goty`, `game of the year`, `definitive`, `deluxe`, `complete`, `ultimate`, `gold`, `enhanced`, `remastered`, `director's cut`, `anniversary`, `edition`.
  - Un título que difiere solo en un número final (secuela) no se toca.
- Un ID externo común (IGDB, RAWG, o el AppID de Steam declarado por otra tienda) une siempre, salvo que haya un `split` manual.

**Motivo:** prioriza que una fusión errónea no oculte juegos (decisión 20). Alternativa descartada: similitud aproximada de texto (por ejemplo, Levenshtein), que provoca fusiones erróneas entre secuelas.

### 52. DLC cuyo juego base no está en la biblioteca

**Decisión (confirmada por el usuario el 21 de octubre de 2026):** se guarda como propiedad `dlc` con `canonical_game_id` nulo y `base_store_game_id` relleno. No aparece en la biblioteca. Se enlaza solo en cuanto aparece su juego base en una sincronización o un escaneo. Mientras tanto se lista en una sección secundaria, «Contenido adicional sin juego base», dentro de Ajustes > Biblioteca.

**Motivo:** cumple la decisión 21, con DLC fuera de la lista principal, sin perder datos. Alternativas descartadas: descartarlo (se pierde y hay que volver a descargarlo); crear un juego base fantasma (ruido y falsos duplicados).

### 53. Puerto: dónde se guarda y rango permitido

**Decisión (confirmada por el usuario el 21 de octubre de 2026):**

- El puerto se guarda en `%LOCALAPPDATA%\Ludiary\runtime.json`, junto con la versión y el PID del servidor, y no en la base de datos. El acceso directo tiene que leerlo antes de que el servidor arranque.
- **Primer arranque:** se prueba un puerto aleatorio entre 20000 y 39999, hasta 20 intentos. Si todos fallan, se pide uno al sistema (puerto 0).
- **Configuración manual:** se admite de 1024 a 65535.
- Se evita el rango dinámico de Windows (49152–65535), que usan las conexiones salientes y donde Hyper-V y WSL suelen reservar puertos. Por eso se prueba a abrir el puerto en vez de calcularlo.

**Motivo:** un rango fijo fuera del dinámico reduce los cambios de puerto entre arranques, y el fichero aparte resuelve el problema de qué se lee primero. Alternativa descartada: guardarlo en la base de datos (el lanzador tendría que abrirla antes del servidor).

### 54. Sesión del navegador: duración y revocación (ampliada en las decisiones 63 y 67)

**Decisión (confirmada por el usuario el 21 de octubre de 2026):**

- **Enlace de apertura:** de un solo uso, válido 60 segundos.
- **Cookie de sesión:** `HttpOnly`, `SameSite=Strict`, `Path=/`, sin dominio, con un nombre fijo derivado del identificador técnico (decisión 44).
- **Duración:** renovación automática con el uso hasta 30 días sin actividad y caducidad absoluta a los 90 días. Al caducar, basta con volver a abrir desde el acceso directo.
- **Revocación:** botón «Cerrar todas las sesiones del navegador» en Ajustes y en la bandeja. Cambiar el token de instalación (decisión 46) revoca también todas las sesiones.
- Las sesiones se guardan como hash (decisiones 46 y 47).
- **Ampliación (decisión 63):** cada sesión solo vale en el puerto en el que se creó; si el servidor cambia de puerto, se revocan todas.
- **Ampliación (decisión 67):**
  - La cookie de un canje hecho por la dirección alternativa (`127.0.0.1`) no lleva `Max-Age`: es de sesión del navegador. La duración de 30 y 90 días se aplica solo a la dirección principal.
  - Cada sesión lleva una clave de origen que vive solo en memoria del servidor y muere al pararlo. Las acciones sensibles exigen cookie y clave.

**Motivo:** con un solo usuario en local, una sesión larga evita molestias, y la revocación cubre el caso de perder el control del navegador. Alternativa descartada: una sesión que muere al cerrar el navegador (obligaría a pasar siempre por el acceso directo).

### 55. Detección del proceso de cada juego (propuesta; se cierra con pruebas reales)

**Decisión (propuesta):**

- Un puerto del SO `ProcessWatcher` devuelve los procesos cuya ruta de ejecutable está dentro de la `install_path` de la instalación lanzada.
- Después de lanzar un juego, el núcleo consulta cada 5 segundos durante un máximo de 3 minutos.
- La sesión empieza con el primer proceso encontrado y termina cuando no queda ninguno durante 30 segundos. Las sesiones de menos de un minuto se descartan.
- Los `executables` declarados por el conector priorizan la búsqueda, y una lista de exclusión ignora instaladores, actualizadores y auxiliares antitrampas.
- En Windows hacen falta las rutas de los procesos sin permisos de administrador. Primero se prueba una consulta del sistema (CIM/WMI). Si es lenta o poco fiable, se recurre a una llamada nativa.

**Motivo:** encaja con la decisión 36 y no depende de que el proceso cuelgue de la aplicación. Queda en propuesta porque hay que validarlo con juegos reales de las cinco tiendas, sobre todo con juegos que arrancan con un lanzador propio y con antitrampas. **Cuándo se cierra:** durante el conector de Steam, con al menos tres juegos por tienda, antes de dar por buena la medición de tiempo.

### 56. Tiempo de juego propio y tiempo informado por las tiendas

**Decisión (confirmada por el usuario el 21 de octubre de 2026):**

- Por cada propiedad, el tiempo mostrado es el mayor entre el que informa la tienda y el propio medido para esa propiedad.
- El total del juego canónico es la suma de esos valores por propiedad.
- La última partida es la más reciente de todas las fuentes.
- La ficha muestra el desglose por tienda y el tiempo propio.

**Motivo:** el tiempo de Steam ya incluye las sesiones lanzadas desde la aplicación; sumar ambos lo contaría dos veces, y quedarse con el mayor por propiedad lo evita. Alternativa descartada: sumar siempre (cuenta doble); usar solo el de la tienda (Ubisoft y EA no informan).

### 57. Copias de seguridad: frecuencia y retención

**Decisión (confirmada por el usuario el 21 de octubre de 2026):**

- **Copias periódicas, desactivadas por defecto (decisión del usuario; revisa la decisión 18):** el usuario las activa en Ajustes. Activadas, se copia al arrancar si la última copia tiene más de 24 horas y cada 24 horas mientras la aplicación está en marcha, y se conservan las últimas 7 diarias y 4 semanales. Motivo del usuario: la biblioteca se reconstruye sincronizando con las tiendas.
- **Copia previa a una migración o actualización, siempre activa:** antes de cambiar el esquema o la versión se hace una copia en `%LOCALAPPDATA%\Ludiary\backups` (carpeta interna y no configurable; las copias periódicas desactivadas no la afectan) y se conservan las 3 últimas. No es una copia de seguridad del usuario sino la red de seguridad del propio programa: si una migración falla, se restaura y se vuelve a la versión anterior (decisión 58).
- **Aviso al usuario:** al desactivarse por defecto, los datos que no vienen de las tiendas (favoritos, etiquetas, colecciones y tiempo medido por Ludiary, decisión 36) se pierden con una avería del disco. Ajustes lo explica junto a la opción.
- **Carpeta por defecto de las copias periódicas:** `Documentos\Ludiary\Copias`, configurable. Solo se crea si el usuario activa las copias periódicas.
- **Restauración:** en Ajustes. Se elige una copia, se valida con `PRAGMA integrity_check` y se cambia por la base actual con el servidor parado (la actual se guarda primero como copia). Después se arranca de nuevo.
- **Desinstalar borrando los datos** (pregunta del desinstalador o `/PURGEDATA=1` en modo silencioso) borra toda la carpeta `%LOCALAPPDATA%\Ludiary`, incluidas las copias internas previas a migraciones. Las copias periódicas del usuario (`Documentos\Ludiary\Copias` o la carpeta que haya elegido) no se tocan.

**Motivo:** pocas copias, con poco peso, cubren tanto los errores del usuario como las actualizaciones fallidas. Alternativa descartada: guardar las **copias periódicas del usuario** en la carpeta de datos por defecto (se pierden con la misma avería de disco o al desinstalar). El descarte no se aplica a las copias internas previas a una migración: son la red de seguridad del propio programa para volver atrás, no sustituyen a las copias del usuario, y por eso sí viven en `%LOCALAPPDATA%\Ludiary\backups`.

### 58. Actualización y firma de las versiones

**Decisión (confirmada por el usuario el 21 de octubre de 2026):**

- **Actualizador propio** dentro del ejecutable. Consulta un manifiesto de versiones en GitHub Releases, descarga el paquete, verifica su firma Ed25519 con la clave pública incluida en la aplicación y lo instala en una carpeta versionada (`app-<versión>`). Después cambia el puntero de versión activa.
- **Vuelta atrás:** si la nueva versión no supera la comprobación de estado en el primer arranque, el puntero vuelve a la anterior. Se conservan las dos últimas versiones.
- **Requisito heredado de la decisión 45 (21 de octubre de 2026):** el actualizador no se da por cerrado hasta validar en Windows el ciclo completo de actualizar con vuelta atrás: descargar, verificar la firma, parar el servidor con `Ludiary.exe --stop`, cambiar el puntero de versión, arrancar y, si la comprobación de estado falla, volver solo a la versión anterior. El prototipo de la 45 dejó anotado lo que exige: un lanzador mínimo y estable en la raíz de la instalación que lea el puntero (candidato: ampliar el auxiliar de Go), porque el acceso directo apunta a una ruta fija y Windows no deja reemplazar un ejecutable en marcha; y unos 100 MB por versión conservada.
- **Firma Authenticode** del instalador y del ejecutable, para evitar los avisos de SmartScreen: se pide primero SignPath Foundation, gratuita para proyectos de código abierto con compilación automatizada.
  - Si SignPath no acepta el proyecto, se publica sin Authenticode (decisión del usuario): la guía de instalación explica el aviso de SmartScreen. La firma Ed25519 sigue protegiendo las actualizaciones.
  - Azure Artifact Signing no parece disponible para particulares fuera de EE. UU. y Canadá (supuesto, según una fuente secundaria de febrero de 2026).
- La clave privada Ed25519 vive solo en los secretos de CI.

**Motivo:** las carpetas versionadas dan vuelta atrás de forma natural (decisión 32), y la verificación propia no depende del certificado comercial. Alternativas descartadas: Velopack (no admite volver atrás, según su documentación); un certificado comercial (coste anual; el usuario prefiere publicar sin firma si SignPath no acepta el proyecto).

### 59. Registros: tamaño y rotación

**Decisión (confirmada por el usuario el 21 de octubre de 2026):**

- Registros en JSON por líneas con `pino`, con filtrado de claves sensibles y de rutas con nombre de usuario antes de escribir.
- Ficheros de 5 MB, con hasta 5 ficheros rotados (25 MB en total), en `%LOCALAPPDATA%\Ludiary\logs`.
- La exportación genera un zip con los registros filtrados, la versión, el sistema operativo y el estado de sincronización por tienda, sin la base de datos.
- Supuesto: rotación con `pino-roll` o con un flujo propio si ese paquete no encaja.

**Motivo:** cabe sin problemas como adjunto de una incidencia de GitHub y cubre varios días de uso. Alternativa descartada: winston (más pesado y sin ventaja aquí).

### 60. Contribuciones y licencias de terceros (ampliada en la decisión 70)

**Decisión (confirmada por el usuario el 21 de octubre de 2026):**

- **Contribuciones:**
  - Las contribuciones se aceptan con DCO (`Signed-off-by` en cada commit), sin CLA.
  - Cada cambio entra por pull request con CI en verde.
  - Los cambios en conectores, seguridad o empaquetado pasan la revisión del auditor.
- **Licencias de terceros:**
  - Una comprobación en CI genera `THIRD_PARTY_NOTICES` y rechaza dependencias cuya licencia no figure en una lista compatible con GPL-3.0: MIT, BSD, ISC, Apache-2.0, MPL-2.0, LGPL y GPL-3.0.
  - `legendary` y `heroic-gogdl` son GPL-3.0 (comprobado en sus repositorios). Se distribuyen como programas aparte, con su licencia y un enlace al código fuente exacto de la versión incluida.
  - Supuesto: hay que revisar las licencias de las librerías que llevan dentro sus ejecutables de Windows (Python y dependencias).

**Motivo:** DCO es ligero y habitual en proyectos GPL. Al no haber CLA, cambiar de licencia en el futuro exigiría el acuerdo de los colaboradores (decisión 34), lo que se acepta. Alternativa descartada: CLA (barrera para colaboradores y gestión adicional).

### 61. Tiendas y funciones en Linux y macOS (propuesta preliminar; se cierra al llegar la fase)

**Decisión (propuesta preliminar):**

- **Linux:**
  - Steam completo (biblioteca, escaneo y lanzamiento).
  - Epic y GOG: biblioteca y lanzamiento de lo instalado mediante `legendary` y `gogdl`, porque no hay launcher nativo.
  - Ubisoft y EA no se admiten.
- **macOS:**
  - Steam completo.
  - GOG y Epic con sus launchers nativos (lanzamiento a verificar).
  - Ubisoft y EA no se admiten.
- **Almacén de claves:** Secret Service (libsecret) en Linux y Llavero en macOS.

**Motivo y cuándo se cierra:** depende de cómo funcionen las ubicaciones y el lanzamiento en cada sistema, y no bloquea el MVP. Se cierra al terminar la fase 2, con pruebas en ambos sistemas.

### 62. Instancia única: cerrojo del sistema en la carpeta de datos (concreta la decisión 26)

**Decisión (recomendada, 21 de octubre de 2026, tras la auditoría del prototipo):**

- La instancia única la garantiza un cerrojo que el sistema operativo libera solo cuando muere el proceso, sobre el fichero `instance.lock` de la carpeta de datos (`%LOCALAPPDATA%\Ludiary\`).
- Se implementa con SQLite, que ya va incluido. Se abre `instance.lock` como base de datos aparte, con el modo de diario por defecto (no WAL) y un tiempo de espera de 2 s, y se ejecuta `BEGIN EXCLUSIVE` sin cerrar nunca la transacción. Si devuelve `SQLITE_BUSY`, otra instancia viva tiene el cerrojo.
- Puerto `InstanceLock` en `contracts`:

```ts
/** Single instance per data directory (ADR 62). The OS releases it when the holder process dies. */
export interface InstanceLock {
  /** Becomes the single instance. Resolves null if another live process holds the lock. */
  acquire(): Promise<(() => void) | null>;
  /** True if a live process holds the lock. Holds it only for an instant, so it never makes a concurrent acquire() fail. */
  isHeld(): Promise<boolean>;
}
```

- La implementación usa el SQLite inyectado y no depende del SO. En el prototipo vive junto a `database.ts` en `runtime`; pasa a `db` cuando exista ese paquete.
- **Orden del arranque del servidor:** cerrojo → credenciales → base de datos → puerto → `runtime.json` → bandeja. Solo quien tiene el cerrojo lee, crea o regenera credenciales.
- Se eliminan el fichero `server.lock` con PID, la comparación de antigüedad y la comprobación de estado dentro del cerrojo. Si queda un `server.lock` antiguo, se borra sin leerlo.
- El servidor que no obtiene el cerrojo sale con el código 3 (decisión 64) sin tocar nada.
- **`--stop` (lo usa el instalador):**
  - Si el cerrojo está libre, sale con 0.
  - Si está tomado, pide la parada autenticada (decisión 63) y espera hasta 15 s a que el cerrojo quede libre. Sale con 0 si queda libre y con 1 si no.
- El lanzador no usa el cerrojo: reconoce a su servidor con la comprobación de estado más la autenticación de la decisión 63.

**Motivo:** el sistema libera el cerrojo al terminar el proceso, así que no hay cerrojos huérfanos que adivinar ni PID reutilizados, y desaparecen las dos carreras que encontró el auditor (dos servidores sobre la misma base y, en el primer arranque, dos claves maestras). El fichero vive en la carpeta de datos, con permisos solo para el usuario, de modo que otro usuario del equipo no puede ocuparlo ni suplantarlo, y queda ligado justo a lo que protege. Funciona igual en Linux y macOS.

Alternativas descartadas:

- Named pipe `\\.\pipe\Ludiary-…`: el espacio de nombres de las tuberías es común a todo el equipo. Otro usuario puede crearla antes y bloquear el arranque o hacerse pasar por el servidor, y Node no permite fijar su ACL.
- Abrir un fichero con modo de compartición exclusivo: Node no lo expone de forma documentada.
- Mantener el fichero con PID: no se puede hacer seguro frente a fallos y PID reutilizados.

**Consecuencias:**

- Supuestos a verificar con pruebas automáticas:
  - Dos procesos simultáneos dejan un solo servidor.
  - Tras `taskkill /F` el siguiente arranque obtiene el cerrojo. Windows libera los bloqueos al terminar el proceso, aunque su documentación avisa de que puede tardar un poco.
  - `isHeld()` en paralelo con `acquire()` no hace fallar a `acquire()`.
- Las pruebas de instancia única dejan de depender de esperas de 20 s.

### 63. Autenticación entre el lanzador y el servidor local (amplía la decisión 23; revisa el token de instalación de la decisión 46; URL del enlace revisada en la decisión 66; alcance de la sesión ligada al puerto corregido en la decisión 67)

**Decisión (recomendada, 21 de octubre de 2026, tras la auditoría del prototipo):**

- **Amenaza considerada:** otro usuario sin privilegios del mismo equipo.
  - En Windows los puertos de `127.0.0.1` son comunes a todos los usuarios: puede ocupar el puerto guardado cuando Ludiary no está en marcha y responder a `/api/health` como si fuera Ludiary.
  - No puede leer `%LOCALAPPDATA%\Ludiary` ni el Administrador de credenciales de otro usuario.
  - Un administrador del equipo queda fuera del alcance.
- **El token de instalación no viaja nunca.** Es una clave `K` de 32 bytes que comparten el lanzador y el servidor a través del Administrador de credenciales, y solo se usa como clave de HMAC-SHA256. Desaparece la cabecera `x-ludiary-token` y ningún endpoint acepta el token en claro.
- **Protocolo (dos peticiones, prueba mutua):**
  1. `POST /api/launcher/challenge`, con cuerpo JSON vacío (`{}`) → `{ nonce }`. El nonce son 32 bytes aleatorios en base64url, de un solo uso y válidos 30 s. Como mucho hay 32 pendientes; al pasar de ahí se descartan los más antiguos.
  2. `POST /api/launcher/<acción>` con `{ nonce, proof }`. `acción` sale de una lista cerrada: `open-link` y `shutdown`. `proof = base64url(HMAC-SHA256(K, "ludiary-launcher-v1\n" + acción + "\n" + puerto + "\n" + nonce))`. El servidor consume el nonce siempre, aunque la prueba falle, compara en tiempo constante y responde el mismo 401 para un nonce desconocido o una prueba incorrecta.
  3. Respuesta: `{ result, proof }`. `result` es la URL del enlace en `open-link` y `"ok"` en `shutdown`. `proof = base64url(HMAC-SHA256(K, "ludiary-server-v1\n" + acción + "\n" + puerto + "\n" + nonce + "\n" + result))`.
  - `puerto` es, en el lanzador, el puerto al que se conecta y, en el servidor, aquel en el que escucha (decisión 28).
  - Las peticiones a `/api/launcher/*` con cabecera `Origin` se rechazan con 403: nunca vienen de un navegador.
- **El lanzador comprueba antes de abrir nada:**
  - La prueba del servidor.
  - Que la URL sea exactamente `http://127.0.0.1:<puerto>/open?t=` seguido de 43 caracteres base64url. Revisado en la decisión 66: pasa a ser `http://ludiary.localhost:<puerto>/open?t=` seguido de 43 caracteres base64url.
  - Si algo falla, ese puerto no es su servidor. Lo registra y sigue como si no hubiera servidor: arranca uno, que encontrará el puerto ocupado y elegirá otro (decisión 28). Relee `K` del almacén en cada intento.
- La bandeja sigue generando el enlace dentro del proceso (`createOpenUrl`), sin pasar por la red.
- `/api/status` exige la sesión del navegador y deja de aceptar el token.
- **Sesión ligada al puerto (amplía la decisión 54):** cada sesión guarda el puerto en el que se creó y solo vale en ese puerto; si el servidor cambia de puerto, se revocan todas. En el prototipo ya se cumple, porque las sesiones viven en memoria y el puerto solo cambia al reiniciar. La versión persistente (decisión 47) guarda el puerto con la sesión.
  - **Alcance (corregido en la decisión 67):** esto protege frente a quien ocupe un puerto **antiguo** de Ludiary: lo que el navegador guardó para ese origen (cookie o almacenamiento de la página) deja de valer cuando el servidor se va a otro puerto. **No impide reutilizar una cookie robada:** si otro programa de `ludiary.localhost:<otro puerto>` o `127.0.0.1:<otro puerto>` recibe la cookie, puede enviarla al servidor real en su puerto vigente y el servidor la acepta. Esa reutilización la cierra la clave de origen de la decisión 67.
- Las funciones que calculan las pruebas (`launcherProof` y `serverProof`) viven en `packages/api` y las usan `api` y `runtime`.

**Motivo:** quien ocupe el puerto no recibe nada que le sirva. La prueba del lanzador está ligada a ese puerto y a un nonce de un solo uso, y el impostor no puede falsificar la respuesta, así que el lanzador nunca abre su página. Eso evita también páginas falsas que pidan la clave de Steam o los códigos de Epic y GOG de la decisión 43. Es lo más simple que cierra a la vez el robo del token y la suplantación del servidor.

Alternativas descartadas:

- Validar solo la URL devuelta: el impostor seguiría recibiendo el token.
- Que el lanzador genere el enlace con el secreto compartido: no evita abrir la página del impostor; hace falta comprobar igualmente quién responde.
- Hablar por un named pipe con ACL del usuario: Node no permite fijar la ACL y otro usuario puede ocupar el nombre (decisión 62).
- Una sola petición con marca de tiempo: se puede repetir contra un servidor recién arrancado, que no conoce los nonces anteriores.

**Consecuencias:**

- El token de instalación se guarda en claro en el Administrador de credenciales (servicio `Ludiary`, cuenta `install-token`), que Windows protege por usuario, y nunca en la base de datos. El «se guarda como hash» de la decisión 46 queda para las sesiones y los enlaces de apertura.
- Cambiar el token revoca todas las sesiones (decisión 54).
- Riesgos residuales aceptados:
  - Pedir un nonce no exige autenticación: otro usuario del equipo puede pedirlos sin parar y desplazar el del lanzador antes de que lo use. Solo molesta (no filtra nada ni da acceso). Por eso `--stop` repite la petición de parada cada segundo durante su espera y el lanzador reintenta cada 250 ms.
  - Otro usuario puede ocupar puertos libres y forzar cambios de puerto. Es una molestia, no una fuga.
  - Si el usuario abre a mano una dirección `127.0.0.1` de otro programa (por ejemplo, un marcador antiguo), el navegador le envía la cookie, porque las cookies no distinguen puertos (decisión 29). Corregido en la decisión 67: el texto original decía que, con la sesión ligada al puerto, esa cookie no servía en el servidor real. Es falso: el otro programa puede reenviarla al puerto vigente y el servidor la acepta. Ni siquiera hace falta que el usuario abra la dirección a mano: cualquier página puede llevar la ventana a `ludiary.localhost:<otro puerto>`, y desde allí una petición al mismo origen ya lleva la cookie. Lo cierra la clave de origen (decisión 67). Hoy el impacto es bajo, porque la sesión solo da acceso a `/api/status`.
  - Supuesto a verificar: libuv no fija `SO_EXCLUSIVEADDRUSE` en Windows (según los comentarios de su código fuente), y se cuenta con que la seguridad de sockets reforzada de Windows impide a otra cuenta enlazar el mismo puerto ya ocupado con `SO_REUSEADDR`. Se comprueba con una prueba manual desde una segunda cuenta; si falla, habrá que fijar esa opción desde código nativo.
- En modo servidor (fase 2), el agente local se emparejará con el mismo principio: una clave compartida que nunca viaja en claro.

### 64. Errores fatales visibles y credenciales no reconocidas (amplía las decisiones 35, 45 y 46; código de salida 14 añadido en la decisión 72)

**Decisión (recomendada, 21 de octubre de 2026, tras la auditoría del prototipo):**

- **Quién muestra los errores:** el lanzador, el único papel con el usuario delante. El servidor no abre ventanas: comunica el fallo de arranque con su código de salida, y el lanzador que lo arrancó lo escucha.
- **Códigos de salida del papel servidor:**
  - 0: parada normal.
  - 3: ya hay otra instancia (decisión 62).
  - 10: clave maestra no reconocida.
  - 11: almacén de credenciales no disponible.
  - 12: base de datos no disponible, incluido no poder cargar SQLite, y cualquier fallo de la migración que no sea el del código 14.
  - 13: sin puerto libre.
  - 14: base de datos más nueva que esta versión, con migraciones que no conoce (añadido en la decisión 72). Mensaje `fatal.databaseTooNew`.
  - 1: cualquier otro error.
- **Espera del lanzador:** mientras siga vivo el servidor que arrancó, espera hasta 60 s (antes, 20) a que responda con la autenticación de la decisión 63. Si el servidor sale con 3, sigue esperando a la otra instancia. Si sale con otro código, o se agota la espera, muestra el mensaje que corresponde y sale con 1.
- **Cuadro de mensaje desde el auxiliar de Go:** `ludiary-tray.exe --dialog` lee un JSON por la entrada estándar, `{"kind":"error","title":"…","body":"…"}`, y muestra `MessageBoxW` con icono de error, Aceptar y `MB_SETFOREGROUND`. Después escribe `{"result":"ok"}` y termina. Windows traduce el botón; los textos llegan ya traducidos (invariante 6). No hay cuadro de confirmación: con la clave compartimentada no hace falta preguntar nada.
- Puerto `UserDialogs` en `contracts`:

```ts
/** Modal messages for errors the user must see, since Ludiary.exe has no console (ADR 64). Texts arrive translated. */
export interface UserDialogs {
  showError(title: string, body: string): Promise<void>;
}
```

- La implementación `HelperProcessDialogs` vive en `platform-windows`. En `RuntimeDeps` es opcional: sin ella, el fallo solo se registra. Las pruebas inyectan un doble.
- **Textos:**
  - Claves `fatal.title`, `fatal.masterKeyUnrecognized`, `fatal.keyStore`, `fatal.database`, `fatal.databaseTooNew` (decisión 72), `fatal.noPort`, `fatal.timeout` y `fatal.unexpected`, en español e inglés.
  - Indican la carpeta de registros (`%LOCALAPPDATA%\Ludiary\logs`) y cómo abrir una incidencia (decisión 35).
  - Un error del papel lanzador que llega a `runLauncher` se escribe en `launcher.log` y muestra `fatal.unexpected`. Un `uncaughtException` fuera de ese camino solo se escribe en `crash.log`, sin cuadro.
- **Formato de la entrada `master-key/1`:**
  - Exactamente 32 bytes: la clave en claro (formato actual).
  - Los formatos futuros, como el envoltorio con contraseña de la decisión 46, empiezan por el prefijo ASCII `LDK` seguido de un byte de versión y siempre miden más de 32 bytes.
  - Cualquier otra cosa, o un `LDK` de una versión que el programa no conoce, es una entrada no reconocida.
- **Clave maestra no reconocida (decisión del usuario, 21 de octubre de 2026; sustituye a la pregunta propuesta):** no se pregunta nada. La entrada no reconocida se **compartimenta**:
  - El servidor recorre `master-key/1`, `master-key/2`… hasta `master-key/16` y usa la primera que reconoce. Una entrada que no reconoce no se toca nunca: queda como compartimento propio.
  - Si no hay ninguna reconocida, crea la clave nueva en el primer hueco libre. Los secretos cifrados con la clave antigua conservan su `key_id` (decisión 46) y simplemente no se leen con esta versión; sus tiendas quedan en «hay que volver a conectar». No se borran: si se vuelve a una versión que sí reconoce esa clave, siguen ahí.
  - Solo si los 16 huecos están ocupados por entradas no reconocidas, el servidor sale con 10 y el lanzador muestra `fatal.masterKeyUnrecognized` (pide actualizar Ludiary).
  - `--purge` (desinstalar borrando datos) elimina todos los huecos.
- **Compatibilidad entre versiones (decisión del usuario):** que una clave deje de reconocerse no debe ocurrir al cambiar de versión. Cada versión publicada reconoce todos los formatos de clave que hayan escrito las versiones anteriores. Un formato nuevo solo se escribe por una acción explícita del usuario (activar la contraseña maestra de la decisión 46), nunca al actualizar, y la vuelta atrás automática de la decisión 58 solo puede volver a una versión que reconozca los formatos ya escritos. El compartimento es la red de seguridad, no el camino normal.
- **Token de instalación con un tamaño inesperado:** se regenera sin preguntar y se registra un aviso. No protege datos; regenerarlo solo revoca las sesiones (decisión 54).
- **Clave maestra ausente:** se crea, como hasta ahora (primer arranque o clave perdida, decisión 46).

**Motivo:** sustituir una clave que no se entiende destruye secretos que una versión posterior sí sabría leer, por ejemplo tras una vuelta atrás de la decisión 58 con la contraseña maestra activada. Bloquear sin salida deja al usuario sin la aplicación. Compartimentarla, como pidió el usuario, cubre los dos casos sin preguntar nada: la aplicación sigue funcionando y la entrada original queda intacta. El código de salida es el canal más simple entre el lanzador y el servidor que acaba de arrancar, sin ficheros nuevos, y el auxiliar de Go ya se distribuye y llama a la API de Windows sin CGO.

Alternativas descartadas:

- Un cuadro desde PowerShell: lento, depende de la política de ejecución y puede abrir una consola.
- Una página de error en el navegador: necesita un servidor en marcha, que es justo lo que ha fallado.
- Un módulo nativo propio: una pieza más que compilar y firmar.

**Consecuencias:**

- Supuesto a verificar en las pruebas manuales: que el cuadro aparece en primer plano cuando lo abre el auxiliar lanzado por el lanzador (reglas de primer plano de Windows). Si no, se añade `MB_TOPMOST`.
- Los fallos del servidor después de arrancar, como perder la bandeja, siguen yendo solo al registro.
- Los mensajes `fatal.*` son textos de cara al usuario: el documentalista los revisa en ambos idiomas y los recoge en la guía de solución de problemas.

### 65. Ganchos de prueba y opciones de Node en el ejecutable publicado (amplía la decisión 45)

**Decisión (recomendada, 21 de octubre de 2026, tras la auditoría del prototipo):**

- La compilación define con esbuild la constante `__LUDIARY_TEST_HOOKS__`: `true` en la variante de pruebas y `false` en la publicada. Con `false`, `main.ts` borra esas variables de la copia del entorno que recibe todo el programa (y los procesos hijos) antes de leer ninguna, así que los ganchos quedan desactivados. Algunas lecturas siguen en el fichero empaquetado, pero nunca encuentran valor.
- **Solo en la variante de pruebas:**
  - `LUDIARY_NATIVE_DIR`, `LUDIARY_TRAY_HELPER`, `LUDIARY_OPEN_URL_FILE` y `LUDIARY_DATA_DIR`.
  - Un doble de `UserDialogs` (decisión 64) que escribe en el fichero de `LUDIARY_DIALOG_FILE` y responde lo que indique la prueba.
  - Con `LUDIARY_DATA_DIR`, el servicio de credenciales pasa a ser `Ludiary-test-<8 primeros caracteres hexadecimales del SHA-256 de la ruta>`, para que las pruebas nunca lean, creen ni borren (`--purge`) las credenciales reales del desarrollador.
- **En la variante publicada** solo queda `LUDIARY_LANG`, útil para soporte. `--selftest --out` puede quedarse: no carga nada externo.
- **Opciones de Node:**
  - `"execArgvExtension": "none"` en `sea-config.json`, de modo que se ignora `NODE_OPTIONS`. Según la documentación de SEA de la línea 24, el valor por defecto es `"env"`, que sí lo admite.
  - En la variante publicada, al arrancar y antes de cualquier conexión o proceso hijo, se borran `NODE_OPTIONS` y `NODE_TLS_REJECT_UNAUTHORIZED` de `process.env`.
  - `NODE_EXTRA_CA_CERTS` se deja: lo necesitan las redes con proxy corporativo y solo añade certificados.
- Las pruebas de extremo a extremo con la variante publicada se ejecutan solo en un equipo limpio de CI, sin credenciales reales. El resto usa la variante de pruebas.

**Motivo:** quien puede fijar variables de entorno del usuario ya ejecuta código como él, así que no es una frontera de seguridad. Aun así, quitar los ganchos reduce superficie y evita que un `NODE_OPTIONS` puesto para desarrollo o un `NODE_TLS_REJECT_UNAUTHORIZED=0` olvidado cambien el comportamiento del programa publicado. La separación de credenciales corrige un fallo real del prototipo: una prueba con otra carpeta de datos usa las credenciales reales, y `--purge` las borra.

**Consecuencias:**

- Supuesto a verificar ejecutando el exe: que Node 24.20 respeta `execArgvExtension`. Aparece en la documentación de la línea 24 sin indicar desde qué versión. Si no lo respeta, se anota aquí que el propio proceso sigue leyendo `NODE_OPTIONS` y se mantiene el borrado del entorno para los hijos.
- CI compila las dos variantes; solo la publicada se firma (decisión 58) y se sube.

### 66. Dirección de la web: `ludiary.localhost` (amplía las decisiones 23, 28 y 29; revisa la URL del enlace de la decisión 63; alcance de la sesión ligada al puerto y cookie de la dirección alternativa corregidos en la decisión 67)

**Decisión (recomendada, 21 de octubre de 2026; el nombre y que el puerto siga visible los ha aceptado el usuario):**

- **Dirección principal:** `http://ludiary.localhost:<puerto>/`. El nombre se deriva del identificador técnico (decisión 44): `<appId en minúsculas>.localhost`. El puerto sigue visible: ocultarlo exigiría el 80, fuera del rango de la decisión 53.
- **Dónde escucha el servidor:** en `127.0.0.1` y en `[::1]`, en el mismo puerto, y en ninguna otra interfaz.
  - Un puerto solo vale si se abren las dos direcciones. Si una de ellas da `EADDRINUSE` o `EACCES`, se cierra la otra y se prueba el siguiente candidato (decisión 28).
  - Única excepción: si `[::1]` no existe en el equipo (`EADDRNOTAVAIL` o `EAFNOSUPPORT`), se sigue solo con `127.0.0.1` y se registra un aviso. En ese caso nadie, ni el navegador ni otro programa, puede usar `[::1]`.
  - Motivo de seguridad: los navegadores pueden resolver `ludiary.localhost` a `::1` y a `127.0.0.1` (supuesto 3). Si solo escucháramos en `127.0.0.1`, otro usuario del equipo (la amenaza de la decisión 63) podría abrir `[::1]:<puerto>`, recibir el enlace de apertura y canjearlo antes que el navegador, o servir una página falsa que pida la clave de Steam. Ocupar las dos direcciones lo impide.
- **`Host` aceptado** (lista cerrada, comparación exacta, puerto vigente): `ludiary.localhost:<puerto>` y `127.0.0.1:<puerto>`. El segundo lo usan el lanzador y la comprobación de estado, que hablan por `127.0.0.1` (el resolvedor de Windows no garantiza `*.localhost`), y la dirección alternativa. Se rechaza todo lo demás con 421, incluidos `localhost:<puerto>`, `[::1]:<puerto>` y otros `*.localhost`.
- **`Origin` aceptado:** `http://ludiary.localhost:<puerto>` y `http://127.0.0.1:<puerto>`. Cualquier otro, incluido `null`, se rechaza con 403. `/api/launcher/*` sigue rechazando cualquier `Origin` (decisión 63).
- **Enlace de apertura:** `http://ludiary.localhost:<puerto>/open?t=<43 caracteres base64url>`. El lanzador solo abre un enlace con exactamente ese formato (revisa la comprobación de la decisión 63). El protocolo HMAC no cambia: la URL ya va dentro de `result`, que cubre la prueba del servidor.
- **Dirección alternativa (plan B):** la bandeja tiene la entrada «Abrir con la dirección alternativa (127.0.0.1)». Genera dentro del proceso un enlace `http://127.0.0.1:<puerto>/open?t=…`, sin pasar por la red. El acceso directo siempre abre la dirección principal. La guía de solución de problemas explica cuándo usar la alternativa. Ampliado en la decisión 67: la cookie de ese canje no lleva `Max-Age`.
- **Cookie:** se mantiene `ludiary_session`, `HttpOnly; SameSite=Strict; Path=/`, sin `Domain`. Al leerla, el servidor acepta la petición si **cualquiera** de las cookies con ese nombre es una sesión válida, no solo la última.

**Motivo:**

- Es la forma estándar de dar nombre a un servicio local sin tocar el fichero `hosts` (que exige permisos de administrador) ni el DNS. La RFC 6761 reserva `.localhost` para el bucle local, y los navegadores lo resuelven ellos mismos (supuestos 1 y 2).
- **Mejora la seguridad respecto a `127.0.0.1`:**
  - La cookie es solo de `ludiary.localhost`. Ya no se envía a otros servicios de `127.0.0.1:<otro puerto>` ni de `localhost:<otro puerto>`, como servidores de desarrollo. Sí se envía a `ludiary.localhost:<otro puerto>`, porque las cookies no distinguen puertos. Corregido en la decisión 67: el texto original decía que ese caso ya lo cubría la sesión ligada al puerto (decisión 63), y no es así. Quien escuche en ese otro puerto recibe la cookie y puede reenviarla al servidor real. Lo cierra la clave de origen (decisión 67). Con `127.0.0.1` pasaba lo mismo, así que no es una regresión de esta decisión.
  - Excepción: la dirección alternativa vuelve a poner la cookie en `127.0.0.1`, y desde allí se envía a cualquier `127.0.0.1:<puerto>`. Por eso esa cookie dura solo lo que dure el navegador abierto (decisión 67).
  - Otras páginas `*.localhost` son de otro sitio, así que `SameSite=Strict` sí las aísla. Con `127.0.0.1`, cualquier puerto era del mismo sitio (supuesto 4).
- **DNS rebinding:** sigue cerrado. Una página atacante siempre envía su propio nombre en `Host`, y los navegadores no consultan el DNS para `*.localhost`, así que nadie puede hacer que un dominio suyo apunte a nosotros con nuestro nombre. La lista cerrada de `Host` hace el resto.
- **Plantar cookies desde otra página `*.localhost`:** si un navegador admitiera `Domain=localhost` (supuesto 4), otro servicio local podría plantar una `ludiary_session` falsa. No puede plantar una válida, porque necesitaría un enlace de apertura y para eso hace falta `K` (decisión 63). Como mucho, la falsa ocultaría la buena. Aceptar cualquier cookie válida con ese nombre lo evita. Ya pasaba igual con `127.0.0.1`, así que no es un riesgo nuevo.
- **No se cambia el nombre de la cookie:** el prefijo `__Host-` exige `Secure`, y su comportamiento en `http` local no está garantizado en todos los navegadores. Además, no protege frente a otro puerto del mismo nombre, que es el caso que queda. Corregido en la decisión 67: el texto original decía que la defensa frente a ese caso era la sesión ligada al puerto. No lo es; la defensa es la clave de origen de la decisión 67, porque el almacenamiento de la página sí distingue puertos.

Alternativas descartadas:

- Mantener `127.0.0.1`: funciona, pero es menos amigable y comparte cookies con cualquier servicio de `127.0.0.1`.
- `localhost` sin subdominio: lo usan muchos programas locales y comparte cookies con todos ellos. Además, en Windows a menudo resuelve primero a `::1`.
- Una entrada en `hosts` o un nombre `.local` propio: exige permisos de administrador o mDNS, y los navegadores no lo tratan como contexto seguro.
- Detectar automáticamente si el navegador resuelve el nombre, con una página en `127.0.0.1` que pruebe `ludiary.localhost` y redirija: necesita un segundo enlace de un solo uso y peticiones entre orígenes, y solo cubre un caso que no esperamos en los navegadores admitidos. El lanzador no puede comprobarlo, porque no es el navegador.
- Una opción en Ajustes para elegir la dirección: si el nombre no funciona, el usuario no llega a Ajustes. La bandeja sí es accesible siempre.

**Supuestos** (no verificados en línea al tomar la decisión, porque la búsqueda no estaba disponible; se comprueban a mano antes de dar el cambio por cerrado, ver «Consecuencias»):

1. **Resolución sin DNS del sistema.** Chrome resuelve `localhost` y `*.localhost` al bucle local de forma interna desde hace años, y Edge, Brave, Opera y Vivaldi heredan ese comportamiento de Chromium. Firefox lo hace desde la versión 84 (diciembre de 2020) aproximadamente. Todas las versiones con soporte, incluidas las ESR, son posteriores.
2. **Proxy.** Chromium no envía al proxy `localhost`, `*.localhost` ni las direcciones de bucle local (reglas de exclusión implícitas). Firefox no envía `localhost` al proxy por defecto. Si algún navegador o un PAC corporativo enviara `ludiary.localhost` a un proxy, la web no cargaría con el nombre y habría que usar la dirección alternativa. Con `127.0.0.1` el riesgo de proxy es el mismo, no mayor.
3. **IPv6.** Los navegadores resuelven `*.localhost` a `::1` y a `127.0.0.1`, y si una falla prueban la otra (en Chromium, el segundo intento empieza a los 300 ms aproximadamente). Al escuchar en ambas no hay ni espera ni hueco para un impostor.
4. **Sitio y cookies.** `localhost` no está en la lista de sufijos públicos, así que la regla por defecto lo trata como sufijo y `ludiary.localhost` es un sitio propio, distinto de `otro.localhost`. Cualquier interpretación razonable llega a la misma conclusión. Queda por ver si algún navegador acepta `Domain=localhost` (solo afecta al caso de cookies plantadas, ya mitigado).
5. **Contexto seguro.** La especificación *Secure Contexts* trata `*.localhost` como potencialmente confiable, y Chrome, Edge y Firefox la siguen: `window.isSecureContext` es `true` y `navigator.clipboard.readText` existe (decisión 43). Si no fuera así en algún navegador, el botón Pegar caería al campo con Ctrl+V que ya prevé la decisión 43, y la dirección alternativa mantiene el contexto seguro.
6. **Escucha en `[::1]` con Fastify.** Una sola instancia de Fastify puede atender un segundo servidor HTTP de Node (por ejemplo, con `app.routing` o con `serverFactory`), con los mismos ganchos. Las pruebas lo comprueban.

**Consecuencias:**

- El invariante 4 de `CLAUDE.md` y las fichas de los agentes que dicen «solo `127.0.0.1`» pasan a decir «solo en la interfaz de bucle local (`127.0.0.1` y `[::1]`)».
- La comprobación manual del supuesto de la decisión 63 sobre el secuestro de puertos desde otra cuenta incluye ahora `[::1]`.
- El permiso del portapapeles de Chrome es por origen: se pide una vez para `ludiary.localhost:<puerto>` y otra vez si cambia el puerto.
- No hay migración. El prototipo guarda las sesiones en memoria y aún no hay versiones publicadas.
- **Verificación manual antes de cerrar el cambio**, en Windows 11 con la versión actual de Chrome, Edge y Firefox (y Brave, Opera o Vivaldi si están a mano):
  - El acceso directo abre `ludiary.localhost:<puerto>` y la sesión funciona.
  - En la consola, `window.isSecureContext` da `true` y `typeof navigator.clipboard.readText` da `"function"`.
  - Con un proxy manual inexistente configurado en Windows (por ejemplo, `127.0.0.1:9`), la web sigue cargando.
  - La entrada de la bandeja abre la dirección alternativa.
  - Los resultados se anotan aquí y se eliminan los supuestos confirmados.
  - **Resultado (21 de octubre de 2026):** el usuario hizo la verificación con el instalador del prototipo en Chrome, Edge y Firefox y confirma que todo funciona: el acceso directo abre `ludiary.localhost:<puerto>` con la sesión autorizada, `isSecureContext` es `true` y `navigator.clipboard.readText` existe, y la entrada de la bandeja abre la dirección alternativa. Con eso se dan por confirmados en esos tres navegadores los supuestos de resolución de `*.localhost` y de contexto seguro. Siguen sin comprobar Brave, Opera y Vivaldi, y el secuestro de puertos desde otra cuenta de Windows (decisión 63).
- El documentalista añade a la guía de solución de problemas el caso «el navegador no abre `ludiary.localhost`» con la dirección alternativa de la bandeja.

### 67. Segundo factor ligado al origen y cookie de la dirección alternativa (amplía las decisiones 29 y 54; corrige el alcance de la sesión ligada al puerto de las decisiones 63 y 66)

**Decisión (recomendada, 21 de octubre de 2026, tras la auditoría de la decisión 66):**

- **Corrección.** Las decisiones 63 y 66 daban por hecho que la sesión ligada al puerto impedía usar la cookie si llegaba a `ludiary.localhost:<otro puerto>` o a `127.0.0.1:<otro puerto>`. No es así:
  - Ligar la sesión al puerto solo revoca las sesiones cuando el servidor cambia de puerto.
  - Ataque, por otro usuario del equipo (la amenaza de la decisión 63):
    1. Escucha en `127.0.0.1:31337` o `[::1]:31337`.
    2. Una página que visita la víctima lleva la ventana a `http://ludiary.localhost:31337/`. Esa primera navegación entre sitios no lleva la cookie (`SameSite=Strict`).
    3. La página del atacante, ya servida desde `ludiary.localhost:31337`, hace una petición a su propio origen. Es del mismo sitio y las cookies no distinguen puertos, así que el navegador envía `ludiary_session`.
    4. El atacante la reenvía desde su proceso a `127.0.0.1:<puerto real>` con `Host: ludiary.localhost:<puerto real>`, sin `Origin`, y el servidor la acepta.
  - Con `127.0.0.1` pasa igual. `Origin`, `Host`, `SameSite`, el prefijo `__Host-` o cambiar el nombre de la cookie no lo evitan: el atacante reenvía desde fuera del navegador y elige las cabeceras.
  - **Lo que sí protege ligar al puerto:** lo que el navegador guardó para un origen antiguo de Ludiary (cookie o almacenamiento de la página) deja de valer cuando el servidor se va a otro puerto y otro programa puede ocupar el antiguo. Se mantiene por eso.
- **Requisito.** Ninguna acción de la API del navegador que **cambie datos, lance procesos, muestre o acepte secretos o exporte ficheros** (registros, copias) se autoriza solo con la cookie. Exige además la **clave de origen**: un secreto por sesión que solo conoce la página servida por el origen real, porque el almacenamiento del navegador es por origen, puerto incluido.
- **Mecanismo mínimo:**
  - **Generación:** al canjear el enlace en `/open`, el servidor crea, además del secreto de la cookie, una clave de origen de 32 bytes aleatorios en base64url (43 caracteres). Guarda su SHA-256 junto a la sesión, **solo en memoria**: no se persiste nunca, ni siquiera en la versión persistente de las sesiones (decisión 47). Muere al parar el servidor, al cambiar de puerto y al revocar la sesión.
  - **Entrega:** `/open` deja de responder con un 302. Responde 200 con una página HTML mínima, con `Cache-Control: no-store` (ya global) y CSP `default-src 'none'; script-src 'self'`, que lleva la cookie en `Set-Cookie` y la clave en `<meta name="ludiary-origin-key" content="…">`. Un script estático propio (`/open.js`, sin secretos) la lee, la guarda y hace `location.replace("/")`, de modo que `/open?t=…` no queda en el historial. Sin JavaScript se muestra un texto traducido que lo explica. La clave nunca va en la URL, ni en la consulta ni en el fragmento.
  - **Dónde la guarda la página:** en `localStorage`, con la clave `<appId en minúsculas>.originKey` (`ludiary.originKey`). Se elige `localStorage` y no `sessionStorage` porque ambos son por origen, puerto incluido, y en este diseño ofrecen la misma protección (ver «Motivo»); `localStorage` además sirve en pestañas nuevas. La SPA lee la clave en cada petición, sin copiarla en memoria, para recoger siempre la del último canje.
  - **Cabecera:** `X-Ludiary-Origin-Key` (nombre derivado del identificador técnico, decisión 44). Nunca se acepta en la consulta, en el cuerpo ni en una cookie.
  - **Comprobación**, en la capa de entrada (decisión 15), después de `Host` y `Origin`:
    - Se calcula el SHA-256 de la cabecera y se acepta la petición solo si alguna de las cookies `ludiary_session` válidas (decisión 66) es una sesión cuya clave de origen coincide, comparando en tiempo constante.
    - Falta de cabecera, clave desconocida o clave de otra sesión: la misma respuesta, `401 { error: "origin_key_required" }`.
    - La cabecera es un secreto: el filtro de registros (decisión 35) la elimina.
  - **Por defecto, todo:** cada ruta declara su nivel de acceso en su configuración: `public` (`/api/health`, `/open`, `/open.js`, `/api/launcher/*` y los ficheros estáticos de la SPA, que no llevan datos), `session` (solo cookie) o `session+key`. **Una ruta que no declare nada exige `session+key`.** Hoy solo `/api/status` queda en `session`. Cualquier otra ruta de solo lectura que se quiera dejar en `session` se anota aquí con su motivo.
- **Recarga, pestañas nuevas y reinicios:**
  - Recargar la pestaña o abrir otra mientras el servidor sigue en marcha: funciona, `localStorage` conserva la clave.
  - Tras parar o reiniciar el servidor, o tras un cambio de puerto, la clave ya no vale. La SPA recibe `origin_key_required`, borra la clave guardada y muestra un aviso traducido: «Vuelve a abrir Ludiary desde el acceso directo o desde la bandeja». Como el acceso directo arranca el servidor y abre la web (decisión 26), el uso normal no lo nota.
  - Si la cookie sigue viva pero no hay clave válida, la SPA puede mostrar lo que permita `session`, sin acciones.
- **Cookie de la dirección alternativa (mitigación).** Cuando el enlace se canjea con `Host: 127.0.0.1:<puerto>`, la cookie se emite **sin `Max-Age`**: es de sesión del navegador. La de la dirección principal mantiene los 90 días de la decisión 54. En la versión persistente de las sesiones (decisión 47), las sesiones canjeadas por `127.0.0.1` no se persisten: viven en memoria y mueren al parar el servidor.
- **Cuándo se implementa:**
  - **Ahora:** solo la cookie sin `Max-Age` de la dirección alternativa.
  - **La clave de origen puede esperar a la SPA**, con una condición estricta: se implementa (comprobación, entrega en `/open`, nivel de acceso por defecto y pruebas) **en el mismo cambio que introduzca la primera ruta del navegador que cambie datos, lance procesos, muestre o acepte secretos o exporte ficheros**, y nunca después. Hoy no existe ninguna: la sesión solo abre `/api/status`. El auditor rechaza cualquier cambio que añada una de esas rutas sin la clave.

**Motivo:**

- La única primitiva del navegador que distingue puertos y que el atacante no puede leer desde su propio origen es el almacenamiento por origen. Un secreto que solo vive allí y viaja en una cabecera cierra la reutilización de la cookie robada. Además, las páginas de otros orígenes no pueden añadir esa cabecera sin una petición previa de CORS que el servidor no responde, así que cubre también la falsificación de peticiones entre sitios.
- **Que la clave muera con el servidor** cierra el caso que el almacenamiento por origen no cubre: mientras Ludiary está parado, otro usuario puede ocupar su puerto y servir una página que lea el almacenamiento de ese origen. Lo que lea ya no vale. Mientras Ludiary está en marcha, nadie más puede servir su origen, porque ocupa el puerto en `127.0.0.1` y en `[::1]` (decisión 66). Por eso `localStorage` no es más débil que `sessionStorage` aquí, y evita volver al acceso directo en cada pestaña nueva, que es lo que la decisión 54 quería evitar.
- Se mantiene la cookie `HttpOnly` confirmada por el usuario (decisiones 29 y 54): sigue siendo la sesión de larga duración y, frente a un fallo de inyección de código en la página, obliga a robar dos cosas en lugar de una.
- La página intermedia con un script propio evita scripts en línea y deja la CSP en `script-src 'self'`.

Alternativas consideradas:

- **`sessionStorage` o memoria, con la vida de la sesión** (propuesta del auditor): misma protección frente a otro puerto, pero cada pestaña nueva exige volver al acceso directo. Con `sessionStorage`, una pestaña abierta que se recargue mientras Ludiary está parado y otro ocupa su puerto entregaría la clave si esta sobreviviera al reinicio. La clave que muere con el servidor cierra ese caso con cualquiera de los dos almacenes, y `localStorage` es más cómodo.
- **Quitar la cookie y usar solo la clave como credencial en la cabecera:** igual de seguro frente a este ataque y algo más simple, pero revisa las decisiones 29 y 54, confirmadas por el usuario, y pierde la defensa en profundidad de `HttpOnly`. Si en la fase 2 se quiere simplificar, se le propone al usuario.
- **Firmar cada petición con una clave no exportable de WebCrypto guardada en IndexedDB:** resiste incluso el robo por inyección de código, pero añade complejidad que no compensa con una CSP estricta y un solo usuario local.
- **Validar `Sec-Fetch-Site`, `Origin` u otras cabeceras del navegador:** no sirve, porque el atacante reenvía desde su proceso y elige las cabeceras.

**Consecuencias:**

- Riesgos residuales aceptados:
  - **Cookie robada, rutas `session`:** quien la consiga puede seguir usando las rutas de solo cookie. Hoy, solo `/api/status`, que no tiene datos personales.
  - **Dirección alternativa:** mientras el navegador siga abierto, la cookie de `127.0.0.1` llega a cualquier `127.0.0.1:<puerto>`, incluidos los programas de otros usuarios. Algunos navegadores, con la opción «Continuar donde lo dejaste», restauran las cookies de sesión al reabrirse, así que puede durar más de lo esperado. Con la clave de origen, esa cookie sola solo abre las rutas `session`, y la sesión muere al parar el servidor. La guía de solución de problemas recomienda volver a la dirección principal en cuanto funcione.
  - **Inyección de código en la propia página:** podría leer la clave y actuar desde la página. Se mitiga con la CSP estricta de la SPA (`script-src 'self'`, sin `unsafe-inline` ni `unsafe-eval`) y con la escapada de textos que ya exige la interfaz.
- El tester añade, junto con la primera ruta `session+key`:
  - Cookie válida sin cabecera, cabecera de otra sesión, clave tras reiniciar el servidor (cookie conservada) y clave en la consulta: todas dan `401 origin_key_required`.
  - Una ruta sin nivel declarado exige `session+key`.
  - `/open` responde 200 sin redirección y la clave no aparece en la URL ni en los registros.
  - Canje por `127.0.0.1`: `Set-Cookie` sin `Max-Age`; por `ludiary.localhost`: con `Max-Age`.
- El invariante 4 de `CLAUDE.md` y las fichas del `programador`, el `auditor` y el `tester` añaden que las acciones sensibles del navegador exigen cookie y clave de origen.
- El documentalista recoge en la guía de solución de problemas el aviso «Vuelve a abrir Ludiary desde el acceso directo o desde la bandeja» y la recomendación sobre la dirección alternativa.

### 68. Primera versión de `apps/web`: estructura, datos simulados y CSP (concreta la decisión 10; portadas e `img-src` revisados en la decisión 71; servir la SPA, librería de esquemas y selector de carpetas concretados en la decisión 72; enlace de inicio de sesión con vuelta en la misma pestaña en la decisión 74)

**Decisión (recomendada, 21 de octubre de 2026):**

- **Alcance de este primer cambio:** solo interfaz, con datos simulados detrás de una capa de datos que tiene la forma del futuro contrato. **No se toca `packages/api`**: ninguna ruta nueva, ni estática ni de datos. La web se prueba con `vite dev` y `vite preview`. Los valores pegados en los asistentes se validan solo en formato, viven en el estado del componente y se descartan al cambiar de paso; no se guardan en el navegador ni se envían a ningún sitio. Así no se activa la condición de la decisión 67.
- **Servir la SPA desde la API** se hace en el mismo cambio que la clave de origen (decisión 67), porque los dos tocan `/open` y `/`. Ese cambio incluye: estáticos de `apps/web/dist` como rutas `public`; vuelta a `index.html` para cualquier ruta que no empiece por `/api/`, `/open` ni `/assets/`; la CSP de abajo en la respuesta; sustituir la página de `/` generada en el servidor por la SPA, que pide `/api/status` y, con 401, muestra el texto de «no autorizado»; y cómo viajan los estáticos dentro del ejecutable (carpeta junto a `Ludiary.exe` o recursos del ejecutable único: lo decide el empaquetador entonces).
- **Enrutado sin librería:** un enrutador propio de unas 50 líneas en `src/app/router.ts`, con la API de historial (`pushState` y `popstate`), patrones con parámetros (`/game/:id`), un `Link` que es un `<a href>` real y, al navegar, vuelta arriba y foco en el `h1` de la página (decisión 37). Lleva prueba unitaria del emparejamiento de rutas. Rutas: `/`, `/library`, `/game/:id`, `/collections`, `/store/:id`, `/local`, `/prices`, `/settings/:section`, `/welcome`.
- **Estilos:** CSS plano. `src/styles/tokens.css` con las variables del tema claro y oscuro en `:root[data-theme="light|dark"]`, y CSS Modules de Vite (`*.module.css`) por componente. Sin preprocesadores ni librerías de componentes. El tema por defecto sigue `prefers-color-scheme`. Para evitar el parpadeo, un script clásico propio, `public/theme-init.js`, cargado en el `<head>` con `src` (nunca en línea), pone `data-theme` antes de pintar.
- **Traducciones (decisiones 33 y 49):** i18next y react-i18next en la web. Los catálogos de la web viven en `packages/i18n/locales/web/es.json` y `en.json`, con claves planas con prefijo por área (`common.`, `nav.`, `onboarding.`, `settings.`, `library.`, `stores.`, `services.` y `connectors.<id>.` para los textos simulados de los asistentes, que pasarán a `connectors/<id>/locales/` cuando exista cada conector). Se exportan por `@ludiary/i18n/web`. Configuración de i18next: `keySeparator: false`, `nsSeparator: false` e interpolación con `{` y `}`, la misma sintaxis que los catálogos actuales del servidor, para que la futura migración del servidor a i18next no reescriba catálogos. Idioma inicial: el elegido por el usuario o, si no hay, `pickLocale(navigator.language)`. Una prueba en `packages/i18n/test/` comprueba que cada par es/en tiene las mismas claves.
- **`packages/api-contract`** se crea ahora, **solo con tipos** y sin librería de esquemas: elegirla (TypeBox, Zod u otra) se decide con la primera ruta real, porque depende de cómo valide Fastify. Nada interno, como fija la decisión 38. Borrador v0:

```ts
// packages/api-contract/src/index.ts — draft v0 (ADR 68). Types only; schemas come with the first real route.
export type StoreId = 'steam' | 'gog' | 'epic' | 'ubisoft' | 'ea';   // same values as contracts (ADR 40), redeclared: no internal imports
export type ServiceId = 'igdb' | 'rawg' | 'itad';
export type I18nKey = string;
export type I18nParams = Readonly<Record<string, string | number>>;
/** Milliseconds UTC (ADR 47). */
export type Epoch = number;

export interface ApiErrorDto { error: string }                         // current server format
export interface TranslatedErrorDto { code: string; key: I18nKey; params?: I18nParams }

export type DetectionMode = 'auto-and-manual' | 'manual-only' | 'later'; // ADR 42

export interface SyncStatusDto {
  operation: 'library' | 'scan';
  state: 'idle' | 'running' | 'error';
  lastSuccessAt?: Epoch;
  nextAllowedAt?: Epoch;
  progress?: { done: number; total?: number };
  error?: TranslatedErrorDto;
}

export interface StoreStatusDto {
  store: StoreId;
  access: 'official-api' | 'unofficial-api' | 'local-only';
  /** 'not-applicable': Ubisoft and EA, no account. */
  connection: 'connected' | 'expired' | 'disconnected' | 'not-applicable';
  /** 'installed-only': Steam without key (ADR 43), and Ubisoft and EA. */
  mode: 'library' | 'installed-only';
  accountLabel?: string;
  sync: readonly SyncStatusDto[];
}

export interface ServiceStatusDto {
  service: ServiceId;
  purpose: 'metadata' | 'prices';
  configured: boolean;
  /** false while the feature that uses it does not exist (IsThereAnyDeal until phase 3). */
  available: boolean;
}

export type WizardTarget = { kind: 'store'; store: StoreId } | { kind: 'service'; service: ServiceId };

/** Wire form of WizardStep (ADR 40, 43). */
export type WizardStepDto =
  | { kind: 'info'; id: string; titleKey: I18nKey; bodyKey: I18nKey; params?: I18nParams }
  | { kind: 'open-external'; id: string; titleKey: I18nKey; bodyKey: I18nKey; url: string; awaits: 'callback' | 'input' }
  | { kind: 'input'; id: string; titleKey: I18nKey; bodyKey: I18nKey; fields: readonly WizardFieldDto[] };

export interface WizardFieldDto {
  name: string; labelKey: I18nKey; secret: boolean; pattern?: string; maxLength: number;
  paste?: boolean;
  extract?: `json-field:${string}` | `url-query:${string}`;
}

export type WizardInputDto =
  | { kind: 'continue' }
  | { kind: 'fields'; values: Readonly<Record<string, string>> }
  | { kind: 'callback'; query: Readonly<Record<string, string>> };

export type WizardResponseDto =
  | WizardStepDto
  | { kind: 'done'; accountLabel?: string }
  | { kind: 'rejected'; stepId: string; error: TranslatedErrorDto };   // same step again, with the error shown

export interface OnboardingDto { completedAt: Epoch | null; detection: DetectionMode | null }

export interface ScanRootDto { id: string; origin: 'user' | 'discovered'; path: string; store?: StoreId; enabled: boolean }

export interface SettingsDto {
  locale: 'system' | 'es' | 'en';
  detection: DetectionMode | null;
  scanRoots: readonly ScanRootDto[];
  backups: { periodic: boolean; folder: string | null };              // ADR 57
  autoUpdate: boolean;                                                // ADR 32
}

/** Draft until the library API exists. */
export interface GameSummaryDto {
  id: string; title: string; coverUrl?: string; stores: readonly StoreId[];
  installed: boolean; favorite: boolean; playtimeMinutes: number; lastPlayedAt?: Epoch; tags: readonly string[];
}
export interface GameDetailDto extends GameSummaryDto {
  properties: readonly { id: string; store: StoreId | 'manual'; installed: boolean; installPath?: string;
                         actions: readonly ('play' | 'open-store-page' | 'install')[] }[];
  dlc: readonly { id: string; title: string; store: StoreId }[];
  collections: readonly { id: string; name: string }[];
}
```

  Regla: **ninguna respuesta lleva secretos.** De una clave o un token la API solo devuelve si está configurado.
- **Capa de datos:** `src/data/api.ts` define la interfaz `LudiaryApi` (estado de tiendas y servicios; `startWizard`, `submitWizard`, `cancelWizard` y `disconnect` sobre un `WizardTarget`; `getOnboarding` y `completeOnboarding`; `getSettings` y `updateSettings`; `getLibrary` y `getGame`) y exporta una única instancia. En este cambio es `src/data/mock.ts`, en memoria. Las pantallas no importan el simulador directamente. El simulador descarta los valores recibidos: no los registra, no los guarda y no los devuelve.
- **Campos de secretos:** `type="password"`, `autoComplete="off"`, `spellCheck={false}`, sin elemento `<form>` (para que los gestores de contraseñas no ofrezcan guardarlos; Intro se maneja con `onKeyDown`). El botón Pegar llama a `navigator.clipboard.readText()` al pulsarlo; si falla o se deniega, enfoca el campo y muestra el texto «Pulsa Ctrl+V» (decisión 43). Se recortan espacios antes de validar. Nunca se escribe un valor en la consola.
- **Validación en el cliente:** solo de formato, con el `pattern` y `maxLength` del paso. La comprobación real (llamada de prueba) es del servidor. Donde el formato no está publicado se usa un patrón permisivo, para no bloquear claves válidas (supuestos en la decisión 69).
- **Enlaces externos:** solo URL `https`; la web descarta cualquier otra aunque venga del servidor. Se abren con `<a target="_blank" rel="noopener noreferrer">`. El enlace de OpenID no se abre en el simulador, que avanza el paso al pulsar Continuar; los enlaces a páginas públicas de creación de claves sí.
- **CSP de la SPA** (la pondrá el servidor; ahora se configura igual en `preview.headers` de Vite para detectar infracciones con `vite preview`):
  `default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
  - Sin `'unsafe-inline'` en estilos: la prop `style` de React escribe por CSSOM, que la CSP no bloquea; lo que sí se prohíbe es `<style>` en JSX y `dangerouslySetInnerHTML`.
  - `vite dev` no aplica CSP (su recarga en caliente usa código en línea); por eso la comprobación es con `vite preview`.
  - Las portadas simuladas son ficheros locales o degradados en CSS. No se enlazan imágenes de CDN de tiendas: por privacidad y por `img-src 'self'`. Cómo llegan las portadas reales (probablemente caché local servida por la API) se decide con los metadatos.
- **Servidor de desarrollo:** `server.host: '127.0.0.1'`, `strictPort: true`, `preview.host: '127.0.0.1'`. Nunca `--host`.
- **TypeScript:** `apps/web/tsconfig.json` extiende la base con `lib` `ES2023`, `DOM` y `DOM.Iterable`, `jsx: "react-jsx"` y `types: ["vite/client"]`. El `tsconfig.json` raíz excluye `apps/web`, y el script `typecheck` de la raíz comprueba los dos.
- **Preferencias de presentación** (tema y menú lateral compactado): `localStorage` con claves `ludiary.theme` y `ludiary.sidebar`, de forma permanente; no son datos del usuario de la decisión 36. Dónde vive el estado del primer arranque y el idioma: decisión 69.

**Motivo:** con datos simulados detrás de la forma del contrato, las pantallas avanzan sin abrir rutas que acepten secretos antes de que exista la clave de origen. Un enrutador propio evita una dependencia para nueve rutas sin anidamiento ni carga de datos. CSS Modules viene con Vite y evita choques de nombres sin dependencias. Las claves planas coinciden con las `I18nKey` completas que envían los conectores (`connectors.steam.…`). Alternativas descartadas: `react-router` 8.5 (dependencia y API de más para este tamaño; revisable si el enrutado crece); Tailwind o una librería de componentes (dependencias y estilo ajeno a un diseño ya aprobado); servir ya la SPA desde la API (obligaría a adelantar la clave de origen o a dejar `/` a medias); enrutado con `#` (evita la vuelta a `index.html`, pero ese coste es de una línea en el servidor).

**Consecuencias:**

- El cambio que sirva la SPA debe añadir los avisos de licencia de sus dependencias empaquetadas: el `build.mjs` actual solo recoge las del ejecutable, a partir del metafile de esbuild.
- Elegir la librería de esquemas de `api-contract` queda pendiente para la primera ruta real.
- Añadir carpetas en Ajustes no puede hacerse con un selector del navegador, que no da rutas. Hará falta un selector nativo abierto por el servidor (un puerto nuevo de la plataforma). En el simulador, el botón añade una ruta ficticia. Se decide con el escaneo.
- El tester añade las pruebas unitarias del enrutador, de la validación de formato y de la paridad de claves; las de Playwright esperan al servidor con datos grabados (decisión 48).

### 69. Asistente de primer arranque

**Decisión (confirmada por el usuario el 21 de octubre de 2026):** al abrir la web sin primer arranque completado, la SPA lleva a `/welcome`. Cinco pasos; todos tienen «Saltar» y el asistente entero «Saltar todo». Terminar o saltar todo lo marca como completado. Se puede repetir desde Ajustes > General.

1. **Bienvenida e idioma:** español o inglés, preseleccionado desde el navegador (decisión 33).
2. **Detección de instalaciones:** las tres opciones de la decisión 42, con la explicación breve de qué se lee. Con «Configurarlo más tarde», el paso 3 avisa de que Ubisoft y EA no aparecerán.
3. **Tiendas:** una tarjeta por tienda, con su asistente (el mismo componente que Ajustes > Tiendas).
   - **Steam:** dos caminos. Completo: inicio de sesión con OpenID, botón que abre `https://steamcommunity.com/dev/apikey`, Pegar con comprobación de formato (32 caracteres hexadecimales, decisión 43) y aviso del perfil público. O **«Steam sin clave: solo instalados»**.
   - **GOG y Epic:** abrir el login oficial (decisión 43), con el icono de vía no oficial (decisión 40).
   - **Ubisoft y EA:** sin cuenta; texto de que se detectan instalados.
4. **Servicios opcionales:** metadatos con IGDB o RAWG (uno de los dos, decisión 6). **RAWG es el recomendado por defecto** (confirmado por el usuario): una sola clave y alta más sencilla; IGDB queda como alternativa.
   - **IGDB:** abrir `https://dev.twitch.tv/console/apps/create`, con instrucciones: cuenta de Twitch con verificación en dos pasos activada, nombre único, URL de redirección `http://localhost`, una categoría; luego **Manage**, copiar el Client ID y pulsar **New Secret** para el Client Secret. Dos campos con Pegar.
   - **RAWG:** abrir `https://rawg.io/login/?forward=developer` y pegar la clave. Un campo.
   - **IsThereAnyDeal:** no aparece en el asistente hasta la fase 3. En Ajustes se ve como «próximamente», sin campo.
   - **En Ajustes**, las claves de IGDB, RAWG e IsThereAnyDeal van en una sección nueva, **«Servicios»**, junto a «Tiendas» (confirmado por el usuario).
5. **Listo:** resumen de lo configurado y lo saltado, y botón a la biblioteca.

- **Estado en esta fase sin servidor:** el primer arranque (`completedAt`, `detection`) y el idioma se guardan en `localStorage` (`ludiary.onboarding`, `ludiary.locale`), **solo dentro del simulador de la capa de datos**, para que las pantallas no sepan dónde se guardan. Destino final: tabla `settings` del servidor, ámbito de usuario, claves `onboarding.completedAt`, `detection.mode` y `ui.locale` (decisión 47). Como `localStorage` es por puerto, un cambio de puerto repite el asistente; se acepta mientras dure el simulador. Nunca se guarda un secreto ahí.

**Supuestos (comprobados el 21 de octubre de 2026 salvo donde se indica):**

- Steam: la clave se pide en `https://steamcommunity.com/dev/apikey`, que exige iniciar sesión (`steamcommunity.com/dev` lo confirma). El formato de 32 caracteres hexadecimales y las restricciones de cuentas limitadas no se pudieron ver sin sesión: siguen como supuesto. En el campo de dominio se recomienda `localhost` (supuesto: Valve no lo valida).
- IGDB: la página de documentación de IGDB devolvió 403 a la consulta automática. Los pasos salen de la documentación de Twitch (registro de aplicaciones: consola, verificación en dos pasos obligatoria, **New Secret** invalida el anterior) y de guías de terceros (RomM: redirección `localhost`). El formato del Client ID y del secreto no está publicado: patrón permisivo `^[A-Za-z0-9]{20,64}$`. El token se obtiene en el servidor con `client_credentials`; el secreto nunca va al navegador.
- RAWG: la clave se obtiene desde `https://rawg.io/login/?forward=developer` (la página enlaza la ruta relativa). Plan gratuito: hasta 20 000 peticiones al mes, uso no comercial según la tabla de precios (sus condiciones lo contradicen en parte) y **atribución obligatoria con enlace activo a RAWG en cada página que muestre sus datos**. Formato no publicado: patrón permisivo.
- IsThereAnyDeal (fase 3): la aplicación se registra en `https://isthereanydeal.com/apps/my/`; la clave va en el parámetro `key` o en la cabecera `ITAD-API-Key`. Límite por defecto: 1000 peticiones cada 5 minutos. Piden enlazar o mencionar IsThereAnyDeal, no dar a entender afiliación y no quitar las etiquetas de afiliado. No dicen nada de que cada usuario aporte su clave en una aplicación abierta: hay que preguntarlo a `api@isthereanydeal.com` antes de la fase 3.

**Motivo:** el orden va de lo que no exige nada al usuario (idioma, detección) a lo que exige crear cuentas o claves, para que quien salte el final ya tenga sus juegos instalados visibles. Ocultar IsThereAnyDeal evita pedir una clave para algo que aún no existe.

**Consecuencias:**

- Si se usa RAWG, la ficha y la biblioteca muestran «Datos de RAWG» con enlace (texto traducido).
- El documentalista prepara guías con capturas de Steam, Twitch (IGDB) y RAWG.

### 70. Fuentes tipográficas empaquetadas (amplía la decisión 60)

**Decisión (confirmada por el usuario el 21 de octubre de 2026; no es asesoría legal):** Fraunces e Inter se empaquetan con la web desde npm, `@fontsource-variable/fraunces` 5.3.0 e `@fontsource-variable/inter` 5.3.0 (licencia `OFL-1.1` en su `package.json`, comprobado ese día). Nunca se cargan de Google Fonts ni de otro CDN (invariante 9). La lista de licencias permitidas de la decisión 60 añade `OFL-1.1`, **solo para ficheros de fuentes** distribuidos como recursos aparte, con su `LICENSE` copiado a los avisos de terceros.

**Motivo:** la OFL permite redistribuir las fuentes con cualquier programa, incluido uno GPL, siempre que viajen con su licencia y no se vendan solas. Fontsource evita copiar ficheros a mano y fija la versión. Alternativas descartadas: Google Fonts (sale tráfico del equipo y lo bloquea la CSP); fuentes del sistema (cambia el diseño aprobado).

**Consecuencias:** el comprobador de licencias de la CI acepta `OFL-1.1` solo en paquetes `@fontsource*`.

### 71. Portadas de Steam desde su CDN (revisa el punto de portadas de la decisión 68; amplía las decisiones 6 y 40; ampliada en la decisión 73)

**Decisión:**

- **Qué (confirmado por el usuario el 21 de octubre de 2026):** los juegos de Steam usan la carátula que da Steam.
- **Cómo (recomendado):** el navegador carga la imagen directamente del CDN de Steam (opción A). El servidor no descarga ni guarda imágenes.
  - **Alcance:** solo para juegos canónicos con una propiedad de Steam, es decir, poseídos o detectados en Steam. Si un juego también está en otra tienda, gana la imagen de Steam. Un juego que solo está en GOG o Epic nunca pide nada a Steam, aunque se conozca su AppID por un ID externo. Así Valve no se entera de juegos de otras tiendas (invariante 9). Alcance confirmado por el usuario el 21 de octubre de 2026: solo los juegos que tiene en Steam, no los que solo se venden allí.
  - **Corrección del 22-10-2026 (prueba del usuario con la cuenta de GOG, decisión 77):** las portadas de GOG se resolvían y guardaban, pero no se veían, porque el resumen del juego en `packages/db` solo leía los medios de la propiedad de Steam. Ahora, si no hay propiedad de Steam, se usan los de la primera tienda, en el orden fijo `steam, gog, epic, ubisoft, ea`, que tenga medios. Steam sigue ganando cuando existe.
  - **URL por AppID** (las construye el conector de Steam, en `media`):
    - `coverUrl`: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/<appId>/library_600x900.jpg` (vertical, 600×900).
    - Respaldo, `heroUrl` en `media`: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/<appId>/header.jpg` (460×215).
    - Si la tienda da un `header_image` con ruta con hash, se usa ese, siempre que su host esté en `mediaHosts`.
  - **Contrato:** el manifiesto del conector añade `mediaHosts: readonly string[]`, para Steam `shared.akamai.steamstatic.com`, `shared.cloudflare.steamstatic.com` y `shared.steamstatic.com`. El punto 4 de la decisión 40 pasa a exigir «URL de medios en `https` y con host en `mediaHosts`». `GameSummaryDto` añade `coverFallbackUrl?: string`.
  - **CSP** (servidor y `preview.headers`; el resto no cambia): `img-src 'self' data: https://shared.akamai.steamstatic.com https://shared.cloudflare.steamstatic.com https://shared.steamstatic.com`. El servidor construye `img-src` a partir de la unión de los `mediaHosts`. Una prueba comprueba que la lista de `vite.config` coincide.
  - **Referente:** cabecera `Referrer-Policy: no-referrer` en la SPA, en el servidor y en `preview.headers`. Además, `referrerPolicy="no-referrer"` en cada `<img>`, porque `vite dev` no aplica cabeceras. También `loading="lazy"`, `decoding="async"` y sin `crossorigin`.
  - **Respaldo en la web:** si falla `coverUrl`, se prueba `coverFallbackUrl`, centrada con `object-fit: contain` sobre el degradado. Si también falla, queda el degradado local con el título (el actual). Sin reintentos.
- **Simulador de `apps/web`:** los juegos de Steam simulados llevan AppID reales y sus dos URL con el formato de arriba. Los de otras tiendas siguen con el degradado.

**Supuestos (comprobados el 21 de octubre de 2026):**

- `appdetails` devuelve `header_image` en `shared.akamai.steamstatic.com/store_item_assets/steam/apps/<appId>/…`, a veces con un segmento de hash (RimWorld, Cyberpunk 2077, Portal 2, Hollow Knight, Disco Elysium, Baldur's Gate 3).
- La ruta sin hash `…/<appId>/library_600x900.jpg` y `…/<appId>/header.jpg` devolvieron JPEG para Elden Ring, Cyberpunk 2077, Portal 2 y Baldur's Gate 3. Que valga para todos los juegos es un supuesto; el respaldo cubre el fallo.
- `shared.cloudflare.steamstatic.com` responde con 301 a `shared.steamstatic.com`. La CSP comprueba también el destino de una redirección, por eso se declaran los dos.
- `cdn.cloudflare.steamstatic.com/steam/apps/…` y `steamcdn-a.akamaihd.net/steam/apps/…` siguen sirviendo, pero son hosts antiguos: no se usan ni se declaran.
- No hay documentación oficial de estos hosts ni de las rutas. Si Valve las cambia, la web cae al degradado; se corrige en el conector y en la lista de hosts.

**Motivo:** en localhost la petición sale de la misma IP tanto si la hace el navegador como si la hace el servidor, y sin referente ni cookies de terceros Valve no sabe más de lo que ya sabe por la cuenta. La opción B (el servidor descarga, guarda en la carpeta de datos y sirve desde `'self'`) habría exigido una ruta nueva, gestión de la caché, límites de tamaño, validación del tipo de fichero y su limpieza, todo para el mismo resultado visible. Se descarta por ahora. Se revisa si hace falta modo sin conexión o si el modo Docker la necesita.

**Consecuencias:**

- Sin conexión, las portadas de Steam caen al degradado.
- Las portadas de GOG y Epic, y el respaldo de IGDB o RAWG, seguirán este mismo patrón (`mediaHosts` y CSP derivada) cuando se implementen. Cada host nuevo pasa por el arquitecto.
- El tester añade una prueba para la validación de `mediaHosts` y otra para la paridad de la CSP.
- El auditor revisa la CSP y `Referrer-Policy` cuando el servidor sirva la SPA.

### 72. Primer corte vertical de Steam: instalados, biblioteca y lanzamiento (amplía las decisiones 40, 42, 47, 50, 64 y 68; orden de cortes y emparejamiento con la segunda tienda revisados en la decisión 76)

**Decisión (recomendada, 21 de octubre de 2026; puntos del usuario respondidos el mismo día):**

- **Respuestas del usuario:**
  - **A:** el selector nativo de carpetas entra en este corte.
  - **B:** lo que el servidor aún no tiene se queda en la web **como está ahora**, es decir, con el comportamiento del simulador, en lugar de mostrarse como «Disponible próximamente». Esto revisa el punto «Sin mezclar datos reales y simulados» del apartado 7: el cliente real implementa lo que el servidor ya tiene y delega el resto en el simulador, método a método. Lo simulado sigue sin guardar nada en el servidor.
  - **C:** no se fija todavía el orden de los cortes siguientes: primero se termina y se prueba este; el orden se decide después.

#### 1. Alcance

- **Entra:** Steam en el modo «Steam sin clave: solo instalados» (decisión 43), de principio a fin:
  - detección por las ubicaciones del registro y las bibliotecas de Steam (decisión 42) y por carpetas manuales;
  - biblioteca y ficha reales servidas por la API;
  - portadas desde el CDN de Steam (decisión 71);
  - lanzamiento por ID con `steam://rungameid/<appId>`;
  - asistente de primer arranque (decisión 69) y ajustes de detección (decisión 42) guardados en el servidor;
  - la SPA servida por el servidor con la clave de origen (decisiones 67 y 68).
- **Queda fuera, cada parte con su corte:**
  - **Corte siguiente, cuenta de Steam:** OpenID, API key cifrada (decisión 46, con `SecretCipher`, tabla `secrets` y `store_connections`), `GetOwnedGames`, juegos no instalados, `open-store-page`, DLC de la biblioteca y motor de asistentes.
  - **Corte 2b, tiempo de juego:** detección del proceso (decisión 55), `play_sessions` y última partida. Va justo después del corte de la cuenta y antes de GOG. Motivo: cerrar la 55 exige pruebas con juegos reales, con lanzador propio y con antitrampas, y elegir entre CIM y una llamada nativa. Ese trabajo no debe bloquear el lanzamiento. La 55 se cierra para Steam en ese corte y se revalida con cada tienda nueva.
  - Favoritos, etiquetas y colecciones (decisión 36), copias periódicas y restauración (decisión 57), exportación de registros (decisión 59) y persistencia de las sesiones del navegador (ver el punto 10).
- **Motivo de no meter ya la cuenta:** necesita cifrado de secretos, la ruta de vuelta de OpenID, un `HttpClient` con filtrado de secretos, respuestas grabadas de la API web y el motor de asistentes. Es otro tanto de trabajo, y su superficie de seguridad merece una auditoría propia. El modo solo instalados es un modo de producto confirmado (decisión 43), no un apaño, y valida ya todo el camino de lanzar y escanear, que es el mayor riesgo.

#### 2. Contrato de los conectores (amplía la decisión 40)

- `packages/contracts/src/connector.ts` contiene **todo** el contrato versión 1 de la decisión 40, con las ampliaciones de la 71 y de esta decisión. Son solo tipos y no cuestan nada. Tener el contrato entero evita reescribir la interfaz en cada corte.
- **Implementado en este corte:** `ScanContext`, `LaunchContext`, `DiscoveryContext`, `ScopedFileReader`, `ConnectorLogger`, `ProgressReporter`, `ConnectorError`, las ubicaciones y la función pura `checkConnectorManifest`.
- **Solo tipos hasta el corte de la cuenta:** `SyncContext`, `WizardContext`, `HttpClient`, `SecretVault`, `ExternalToolRunner` y `ConnectionWizard`.
- **Ampliaciones compatibles:** son miembros opcionales o tipos nuevos, y `contractVersion` sigue en 1 porque no hay nada publicado.

```ts
// packages/contracts/src/connector.ts — additions of ADR 72 to contract version 1 (ADR 40, 71)
export interface StoreConnector {
  // ...everything in ADR 40...
  /** ADR 71. HTTPS hosts of every media URL this connector returns. */
  readonly mediaHosts: readonly string[];
  /**
   * Optional. Reads files under resolved 'scan' locations and returns more scan roots,
   * e.g. the Steam library folders listed in libraryfolders.vdf. The core validates them
   * (absolute, existing directory, at most 64), stores them as 'discovered' scan_roots and
   * shows them in Settings with their own switch (ADR 42).
   */
  discoverRoots?(ctx: DiscoveryContext): Promise<readonly ResolvedLocation[]>;
}

export interface DiscoveryContext extends BaseContext {
  /** Resolved locations of this connector with purpose 'scan'. */
  readonly locations: readonly ResolvedLocation[];
  /** Read-only, confined to those locations. */
  readonly fs: ScopedFileReader;
}

export interface InstalledEntry {
  // ...everything in ADR 40...
  readonly externalIds?: Readonly<Partial<Record<'igdb' | 'rawg' | 'steamAppId', string>>>;
  /** Same rules as StoreEntry.media: https and host in mediaHosts (ADR 71). */
  readonly media?: { readonly coverUrl?: string; readonly heroUrl?: string; readonly iconUrl?: string };
}

export interface LaunchContext extends BaseContext {
  readonly launchers: readonly ResolvedLocation[];
  /**
   * false when the user did not allow auto-detection (ADR 42): launcher locations were not
   * looked up, so an empty `launchers` proves nothing and the connector must not report
   * 'launch.launcher-missing' because of it.
   */
  readonly launchersResolved: boolean;
  /** Confined to the launcher locations and the installPath of the property. */
  readonly fs: ScopedFileReader;
}

/** Pure: lists what is wrong in a manifest (runtime refuses the connector at startup if non-empty). */
export function checkConnectorManifest(c: StoreConnector): readonly string[];
```

- **`ScopedFileReader`** (semántica que el contrato no fijaba): UTF-8 sin BOM; `readText` como mucho de 1 MiB; `readDir` como mucho de 10 000 entradas. Toda ruta se resuelve con `realpath` y se rechaza si queda fuera de las raíces (`..`, uniones, enlaces simbólicos). Los errores de lectura son `ConnectorError` con `scan.root-unreadable`. `join` sigue la semántica de rutas del SO. Una ruta fuera de las raíces da `internal`, con dos casos (precisado tras la auditoría, punto 11):
  - **Fuera por su texto** (absoluta ajena o con `..`): `ConnectorError` con `internal`. Es un fallo del conector y tumba su escaneo.
  - **Dentro por su texto, pero su `realpath` sale de las raíces** (unión o enlace que escapa): `PathEscapesRootsError`, subtipo de `ConnectorError` con código `internal`. El conector puede capturarlo y tratarlo como un dato del disco, no como un fallo propio. Steam lo trata así: si es una instalación (`common\<installdir>`), se salta esa entrada y la instalación se retira de la biblioteca; si es la propia `steamapps`, la raíz cuenta como ilegible y conserva sus instalaciones.
- **Manifiesto de Steam en este corte:**
  - `access: 'official-api'`.
  - Capacidades: `library: false` (pasa a `true` con la cuenta), `scan: true`, `dlc: 'none'`, `actions: ['play']`, `launchKinds: ['uri']`, `uriSchemes: ['steam']`, `storePlaytime: false`, `price: false`.
  - `minSyncIntervalMs: 600_000` (decisión 50), `authHosts: []`, `externalTools: []`, `mediaHosts` de la decisión 71, sin `connection` ni `listLibrary`.
  - `locations`:
    - `steam-root` (`scan`): `HKCU\Software\Valve\Steam` → `SteamPath`; después `HKLM\SOFTWARE\Valve\Steam` → `InstallPath` con vista de 32 bits; después la carpeta conocida `ProgramFilesX86` + `Steam`.
    - `steam-client` (`launcher`): `HKCU\Software\Valve\Steam` → `SteamExe`.
- **Lógica del conector de Steam:**
  - `discoverRoots` lee `<steam-root>\steamapps\libraryfolders.vdf`, con el formato nuevo (`"0" { "path" … }`) y con el antiguo (`"1" "D:\\SteamLibrary"`). Devuelve cada biblioteca con `declarationId: 'steam-root'` y `tag: 'library'`, incluida la propia carpeta de Steam.
  - `scanInstalled` acepta como raíz una biblioteca (contiene `steamapps\`) o la propia carpeta `steamapps`. Lee cada `appmanifest_<id>.acf` y saca `appid`, `name` e `installdir`. Informa la entrada solo si existe `steamapps\common\<installdir>`. `installPath` es esa carpeta, `kind: 'game'` y `media` con las dos URL de la decisión 71. Excluye una lista de herramientas mantenida en el código y con pruebas (al menos `228980`, Steamworks Common Redistributables). Si falta `name`, el título es `Steam <appId>`: es un dato, no un texto de la interfaz.
  - `resolveAction('play')` exige un `storeGameId` de solo dígitos (1 a 10). Si `launchersResolved` es `true` y no hay `steam-client` existente, lanza `launch.launcher-missing`. En otro caso devuelve `{ kind: 'uri', uri: 'steam://rungameid/<appId>' }`. Cualquier otra acción devuelve `null`.
  - Analizador VDF (KeyValues de texto) propio, en `connectors/steam/src/vdf.ts`:
    - Cadenas entre comillas con los escapes `\\`, `\"`, `\n` y `\t`, tokens sin comillas y comentarios `//`.
    - Las condiciones `[$…]` se ignoran.
    - Claves sin distinguir mayúsculas.
    - Profundidad máxima de 32.
    - Una entrada mal formada da `store.unexpected-response` solo para ese fichero, que se registra y se salta.
  - Se descartan dependencias de npm para VDF porque el formato es pequeño y conviene probar los límites a fondo.

#### 3. Puertos del SO y plataforma

Puertos nuevos en `packages/contracts/src/ports.ts`, de los que la decisión 38 ya preveía tres:

```ts
/** ADR 38, 40 rule 8. Read-only: implementations never write the registry or launcher files (ADR 42). */
export interface LocationResolver {
  /** Every distinct existing path of the declaration on this OS, in source order (deduplicated with LocalFiles.compareKey). */
  resolve(decl: LocationDeclaration): Promise<readonly ResolvedLocation[]>;
}

/** Path semantics and confined reading (ADR 38: the core treats paths as opaque strings). */
export interface LocalFiles {
  scoped(roots: readonly string[]): ScopedFileReader;
  /** Absolute, OS separators, no trailing separator; keeps the original case. */
  normalize(path: string): string;
  isAbsolute(path: string): boolean;
  /** True if `path` is `root` or below it, after realpath; case-insensitive on Windows; 'D:\\Games2' is not inside 'D:\\Games'. */
  isInside(path: string, root: string): Promise<boolean>;
  /** Equality key for uniqueness (lower-case on Windows). */
  compareKey(path: string): string;
  isDirectory(path: string): Promise<boolean>;
  /**
   * Added after the audit (point 11). Required. Pure text check, no I/O: false for UNC paths
   * and device paths (`\\?\`, `\\.\`) on Windows. Discovered and registry roots are filtered
   * with it before any stat, so no SMB connection is ever opened on their behalf.
   */
  isLocalPath(path: string): boolean;
}

/** ADR 40 rule 5: never through a shell; the core validates the spec before calling. */
export interface ProcessLauncher {
  /** Kinds this platform can run; runtime refuses a connector whose launchKinds are not all here. */
  readonly kinds: readonly ('uri' | 'exec')[];
  /** Hands the URI to the OS handler of its scheme. */
  openUri(uri: string): Promise<void>;
  /** Detached, args as a list, no shell. Implemented with the GOG connector; until then `kinds` excludes 'exec'. */
  exec(spec: { executable: string; args: readonly string[]; cwd?: string }): Promise<void>;
}

/** Native folder dialog on the user's desktop (localhost only). null if cancelled. Texts arrive translated. */
export interface FolderPicker {
  pick(opts: { title: string }): Promise<string | null>;
}

/** Time for the core, which must not use timers or Date directly (ADR 38). */
export interface Clock {
  now(): number;
  timeout(ms: number): AbortSignal;
}
```

- **`LocalFiles`** vive en `packages/platform-node`, que se crea ahora. Es genérico: `node:fs/promises` y `node:path` con la semántica de `process.platform`.
- **`LocationResolver` de Windows** vive en `platform-windows`:
  - Las carpetas conocidas salen del entorno (`ProgramFiles(x86)`, `ProgramData`, `LOCALAPPDATA`, `APPDATA`).
  - El registro se lee con el auxiliar de Go, `ludiary-tray.exe --registry`. Recibe por la entrada estándar `{"queries":[{"hive":"HKCU","key":"…","value":"…","view":"32","kind":"value"}]}` y responde por la salida estándar con un JSON en UTF-8.
  - El auxiliar abre las claves solo con `KEY_QUERY_VALUE | KEY_ENUMERATE_SUB_KEYS` (`golang.org/x/sys/windows/registry`), así que no puede escribir aunque se le pida. Solo admite `HKCU` y `HKLM`.
  - Las rutas leídas pasan por `LocalFiles.normalize`: `SteamPath` viene con `/` y en minúsculas.
  - Alternativas descartadas: `reg.exe query` (salida en la página de códigos de la consola, que estropea rutas con caracteres no ASCII, y formato pensado para personas) y un módulo nativo de registro (otro `.node` que compilar, distribuir y firmar).
- **`ProcessLauncher.openUri` de Windows** usa el mismo mecanismo que `openUrl`, ya validado en el prototipo: `spawn('rundll32.exe', ['url.dll,FileProtocolHandler', uri])`, sin shell, `windowsHide` y `detached`. Tras la auditoría, `rundll32.exe` se invoca por ruta absoluta (`%SystemRoot%\System32\rundll32.exe`), no por nombre, para no depender del `PATH` ni de la carpeta actual.
  - Antes, la plataforma valida por su cuenta: `^[a-z][a-z0-9+.-]*:[\x21-\x7E]+$`, sin comillas, sin `%` seguido de algo que no sea hexadecimal, y como mucho 2048 caracteres. La lista de esquemas ya la comprobó el núcleo; esta es la segunda barrera.
  - `PlatformInfo.openUrl` sigue admitiendo solo `http(s)`: abre el navegador y no es un lanzamiento. Se factoriza la llamada común.
  - Si en las pruebas manuales `rundll32` no abriera `steam://`, la alternativa es `ludiary-tray.exe --open-uri` con `ShellExecuteW`. Las dos usan la API del sistema, no `cmd /c start`.
- **`FolderPicker` de Windows:**
  - Es `ludiary-tray.exe --pick-folder`, con `IFileOpenDialog` y `FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM`. Recibe el título traducido por la entrada estándar y responde `{"path":"…"}` o `{"cancelled":true}`.
  - Si `IFileOpenDialog` sin CGO resultara demasiado frágil, se usa `SHBrowseForFolderW` con `BIF_NEWDIALOGSTYLE`, que es una llamada simple.
  - Cierra la parte pendiente de la decisión 68 (**decide el usuario: punto A**).

#### 4. Paquetes nuevos y qué contienen

- **`packages/core`.** Solo importa `contracts`. Define los puertos de persistencia y los casos de uso:
  - **Arranque:** asegura el único usuario y el dispositivo `local` (decisión 47). Al arrancar pasa a `idle` cualquier `sync_state` que quedara en `running` por un cierre brusco.
  - **Registro de conectores:** valida `checkConnectorManifest`, que `contractVersion` sea 1 y que `ProcessLauncher.kinds` cubra los `launchKinds`.
  - **Escaneo:**
    - La espera es de 60 s desde el último intento, en **todas** las tiendas (amplía la decisión 50, que la fijaba para Ubisoft y EA). Los escaneos siguen sin el suelo de `minSyncIntervalMs` (regla 2 de la decisión 40). Un cambio de ajustes o de carpetas fuerza el escaneo sin esa espera.
    - Raíces según el modo de detección:
      - Sin primer arranque completado: no se escanea.
      - `later`: ninguna raíz, sin llamar al conector, lo que retira las instalaciones detectadas.
      - `manual-only`: solo las carpetas `user` activadas.
      - `auto-and-manual`: además, `LocationResolver` → `discoverRoots` → carpetas `discovered` activadas.
    - Cada conector corre aislado con `Promise.allSettled`, `AbortSignal` y un tiempo máximo de 60 s (`Clock.timeout`). Cualquier excepción que no sea `ConnectorError` pasa a `internal`.
    - Validación de la regla 4 de la decisión 40:
      - ID de 1 a 64 caracteres imprimibles y título de 1 a 300 sin caracteres de control.
      - `installPath` absoluto y dentro de una raíz del contexto (`LocalFiles.isInside`).
      - Medios en `https` con host en `mediaHosts`.
      - `launchData` con 16 claves como mucho y valores de 1024 caracteres como mucho.
      - Como mucho 10 000 entradas.
      - Una entrada inválida se descarta y se registra; no tumba el escaneo. Un ID repetido se queda con la primera.
    - **Plan de escaneo**, que el núcleo calcula y `db` aplica en **una** transacción:
      - Propiedad nueva: se crea su juego canónico.
      - Propiedad existente: se actualizan título, medios y la instalación del dispositivo.
      - Instalación que ya no aparece: se borra la fila de `installations` solo si su ruta está bajo una raíz leída con éxito. Las que estén bajo una raíz de `unreadableRoots` se conservan.
      - Instalación que ya no está bajo ninguna raíz vigente y activada: se borra. Así, desactivar una carpeta retira sus juegos.
      - Propiedad detectada solo por escaneo (`owned = 0`) que se queda sin instalaciones: recibe `removed_at`. Su canónico deja de verse si todas sus propiedades están retiradas, pero no se borra, así que reaparece con sus datos al reinstalar.
      - Las carpetas `discovered` que el conector deja de devolver se borran. Las nuevas entran activadas.
  - **Emparejamiento mínimo** (decisión 51):
    - `normalizeTitle` completo, con la lista de marcas de edición y sus pruebas, porque `normalized_title` se guarda ya.
    - Regla de este corte: dos propiedades de **la misma tienda** no se unen nunca (son productos distintos). Con una sola tienda, cada propiedad tiene su canónico.
    - La unión entre tiendas, `match_decisions` y `duplicate_candidates` llegan con la segunda tienda.
  - **Biblioteca:** lista de canónicos con alguna propiedad no retirada, con su estado de instalación en este dispositivo y sus portadas. Si hay propiedad de Steam, gana su imagen (decisión 71). Ficha con propiedades y acciones según las capacidades y el estado de instalación.
  - **Lanzamiento** (regla 5 de la decisión 40 e invariante 3):
    - Entrada: `canonicalId` y, opcionalmente, `propertyId`, que tiene que ser de ese canónico.
    - Sin `propertyId`, se elige la primera propiedad instalada en el orden fijo `steam, gog, epic, ubisoft, ea`.
    - Comprobaciones:
      - `play` está en `capabilities.actions`.
      - El tipo está en `launchKinds` y en `ProcessLauncher.kinds`.
      - Para `uri`, el esquema está en `uriSchemes`.
      - Para `exec`, se aplica ya la comprobación completa de la regla 5, con pruebas, aunque ninguna plataforma lo ejecute todavía.
    - Una especificación rechazada se registra con el ID del conector y devuelve `launch.rejected`.
    - Un segundo lanzamiento del mismo canónico en menos de 5 s devuelve `already-starting` sin lanzar.
    - La `LaunchSpec` nunca sale del núcleo.
  - **Ajustes:** primer arranque (`onboarding.completedAt`), `detection.mode` y `ui.locale` en `settings` con ámbito de usuario (decisión 69). Carpetas: listar, activar o desactivar, añadir con `FolderPicker` (un solo diálogo a la vez) y quitar las de origen `user`.
  - **Errores tipados:** `CoreError` con `code`, `key` y `params`. Códigos: `not-found`, `not-installed`, `action-unavailable`, `launch.rejected`, `launch.launcher-missing`, `busy`, `invalid-input`, `picker-unavailable`, más los de `ConnectorErrorCode` reexpuestos.
  - **Fachada que consume `api`:**

```ts
// packages/core/src/index.ts (sketch)
export interface CoreDeps {
  connectors: readonly StoreConnector[];
  library: LibraryRepository; scanRoots: ScanRootRepository; syncState: SyncStateRepository;
  settings: SettingsRepository; identity: IdentityRepository;
  files: LocalFiles; locations?: LocationResolver; launcher?: ProcessLauncher; folderPicker?: FolderPicker;
  clock: Clock; newId: () => string; log: CoreLogger; t: (key: string) => string;
}
// locations/launcher/folderPicker absent => the mode cannot scan/launch (ADR 22, 38): capabilities say so.
export interface LudiaryCore {
  listLibrary(): Promise<readonly GameSummary[]>;
  getGame(canonicalId: string): Promise<GameDetail | null>;
  launch(canonicalId: string, propertyId?: string): Promise<{ status: 'started' | 'already-starting' }>;
  requestSync(req: { trigger: 'open' | 'manual'; operations?: readonly ('library' | 'scan')[] }): Promise<void>;
  storeStatus(): Promise<readonly StoreStatus[]>;
  getSettings(): Promise<Settings>; updateSettings(patch: SettingsPatch): Promise<Settings>;
  getOnboarding(): Promise<Onboarding>; completeOnboarding(mode: DetectionMode | null): Promise<void>; resetOnboarding(): Promise<void>;
  setScanRootEnabled(id: string, enabled: boolean): Promise<void>;
  pickScanRoot(): Promise<ScanRoot | null>; removeScanRoot(id: string): Promise<void>;
}
export function createCore(deps: CoreDeps): Promise<LudiaryCore>;
```

  - `requestSync` solo implementa la operación `scan`. La operación `library` se implementa con el primer conector que tenga `listLibrary`, en el corte de la cuenta: hoy no tendría a quién llamar.
- **`packages/db`** (Drizzle 0.45.4 sobre `better-sqlite3`, decisión 41):
  - Pasan aquí `openDatabase` y el cerrojo de instancia (decisión 62).
  - **Primera migración `0001_library_scan`**, solo con lo que usa este corte (decisión 47):
    - `users`, `devices`.
    - `canonical_games`: `id`, `user_id`, `title`, `normalized_title`, `media`, `metadata_source`, `created_at`, `updated_at`.
    - `game_properties`: `id`, `user_id`, `canonical_game_id`, `store`, `store_game_id`, `kind`, `title`, `normalized_title`, `owned`, `removed_at`, `store_metadata`.
    - `installations`: con `user_id`, que la tabla de la decisión 47 omitía y su regla general exige.
    - `scan_roots`: con `tag` y `path_key` (de `LocalFiles.compareKey`) además de las columnas de la decisión 47.
    - `sync_state`, `settings`.
    - Índices únicos: (`user_id`, `store`, `store_game_id`), (`property_id`, `device_id`) y (`user_id`, `device_id`, `origin`, `path_key`). Índice por (`user_id`, `normalized_title`).
    - Las demás tablas y columnas de la 47 llegan con su funcionalidad.
  - **Migrador propio:**
    - Aplica el SQL que genera `drizzle-kit` (separado por `--> statement-breakpoint`), incluido en el bundle. El migrador de Drizzle lee una carpeta del disco, que no existe dentro del SEA.
    - **Implementado** (sustituye a la idea inicial de importar los `.sql` con `loader: { '.sql': 'text' }` de esbuild): `drizzle-kit` deja su salida en `packages/db/drizzle/`; `packages/db/scripts/embed-migrations.mjs` la convierte en `packages/db/src/migrations.generated.ts`, que es TypeScript normal y entra en el bundle sin cargadores especiales. Una prueba comprueba que el fichero generado coincide con la salida de `drizzle-kit`, para que no se desincronicen.
    - El id registrado en `schema_migrations` es `0001_library_scan`, aunque el fichero de `drizzle-kit` se llame `0000_…`. El id es el que cuenta y no cambia.
    - Tabla `schema_migrations(id, hash, applied_at)` y una transacción por migración.
    - Si la base ya tiene migraciones aplicadas y hay alguna pendiente, primero hace la copia previa de la decisión 57 (`db.backup()` en `%LOCALAPPDATA%\Ludiary\backups`, conservando 3).
    - Una base con migraciones que esta versión no conoce (más nueva) no se abre: el servidor sale con 14 y el lanzador muestra `fatal.databaseTooNew` (decisión 64, código añadido tras la auditoría; antes decía 12, que queda para los demás fallos de la base de datos y de la migración). Se registra. La vuelta a una versión anterior es la de la decisión 58.
  - Repositorios que implementan los puertos de `core`. Métodos asíncronos en la firma, aunque el controlador sea síncrono, para no atar el núcleo a él.
- **`packages/platform-node`:** `LocalFiles` y `ScopedFileReader`, y el reloj real. `exec` llega con GOG.
- **`connectors/steam`:**
  - `src/` con el manifiesto, `vdf.ts`, `libraryfolders.ts`, `appmanifest.ts`, `scan.ts`, `launch.ts` y `createSteamConnector()`.
  - `locales/es.json` y `en.json` con `connectors.steam.*`. Los textos simulados de Steam que hoy están en `packages/i18n/locales/web` se mueven aquí (decisión 68).
  - `fixtures/` con árboles de ficheros sanitizados (ver «Pruebas»).
  - `packages/i18n` agrega los catálogos con una importación JSON estática por conector (`src/connectors.ts`, una línea por tienda, igual que el registro de `runtime`). La prueba de paridad los cubre.
- **`packages/connector-testkit`** (solo `contracts`):
  - `memoryFiles(tree, { os: 'windows' })`: un `ScopedFileReader` y unas rutas de Windows en memoria, con los mismos límites y errores que el real.
  - `scanContext()`, `discoveryContext()` y `launchContext()`, con registro y progreso que capturan.
  - `assertConnectorConformance(connector)`: manifiesto válido, hosts de medios sin esquema ni barra, esquemas en minúsculas, `resolveAction` nunca devuelve una URI con otro esquema.
  - Los dobles de HTTP y de herramientas llegan con el corte de la cuenta.

#### 5. API HTTP

- **Librería de esquemas: TypeBox** (cierra el pendiente de la decisión 68). `api-contract` exporta los esquemas como JSON Schema y los tipos con `Static<>`. Fastify los valida con su Ajv sin adaptadores ni proveedor de tipos: las rutas se tipan con genéricos y `Static`.
  - Todos los cuerpos y consultas llevan `additionalProperties: false`. Así, un `uri`, `command` o `path` en la petición de lanzar da 400 (invariante 3).
  - `apps/web` importa `api-contract` solo con `import type`, con `verbatimModuleSyntax` y una regla de ESLint, para que TypeBox no entre en la web.
  - Supuesto: TypeBox 1.x se publica como `typebox` y la línea 0.34 sigue como `@sinclair/typebox` con soporte largo. Se usa la 1.x si su JSON Schema compila con el Ajv de Fastify 5.12. Si no, la 0.34. Se fija exacta al instalar y se anota aquí.
  - **Fijado:** `typebox` 1.4.2 (la línea 1.x), comprobado con el Ajv de Fastify 5.12.7. Fastify se configura con `removeAdditional: false`, `coerceTypes: false` y `useDefaults: false`: el Ajv no retoca la entrada, así que un campo de más da 400 en lugar de borrarse en silencio, y un tipo equivocado no se convierte.
  - Alternativas descartadas: Zod (necesita un adaptador a JSON Schema y un proveedor de tipos de terceros) y tipos sin validación (deja la validación de entrada a mano en rutas que lanzan procesos).
- **Nivel de acceso** (decisión 67) en `config.access` de cada ruta. Un gancho después de `Host` y `Origin` lo aplica, y lo no declarado es `session+key`. El manejador de rutas no encontradas responde 404 JSON sin autenticar y no revela nada.

| Método y ruta | Acceso | Cuerpo o consulta → respuesta |
|---|---|---|
| `GET /api/health` | `public` | Igual que hoy. |
| `POST /api/launcher/challenge`, `POST /api/launcher/:action` | `public` (HMAC, decisión 63) | Igual que hoy. |
| `GET /open?t=` | `public` | Página mínima con la clave de origen (punto 6). |
| `GET /open.js` | `public` | Script estático, sin secretos. |
| Estáticos y vuelta a `index.html` | `public` | Punto 6. |
| `GET /api/status` | `session` | Igual que hoy (único `session`). |
| `GET /api/library` | `session+key` | → `GameSummaryDto[]`. |
| `GET /api/games/:id` | `session+key` | → `GameDetailDto` o 404. |
| `POST /api/games/:id/launch` | `session+key` | `{ propertyId?: string }` → `202 { status: 'started' \| 'already-starting' }`. |
| `POST /api/sync` | `session+key` | `{ trigger: 'open' \| 'manual', operations?: ('library' \| 'scan')[] }` → `202 StoreStatusDto[]`. |
| `GET /api/stores` | `session+key` | → `StoreStatusDto[]`, solo de los conectores registrados. La web consulta cada segundo mientras alguno está en `running`. |
| `GET /api/onboarding` | `session+key` | → `OnboardingDto`. |
| `POST /api/onboarding/complete` | `session+key` | `{ detection: DetectionMode \| null }` → 204, y lanza el escaneo. |
| `POST /api/onboarding/reset` | `session+key` | → 204. |
| `GET /api/settings`, `PATCH /api/settings` | `session+key` | `{ locale?, detection? }` → `SettingsDto`. |
| `PATCH /api/scan-roots/:id` | `session+key` | `{ enabled: boolean }` → `ScanRootDto`. |
| `POST /api/scan-roots/pick` | `session+key` | `{}` → `201 ScanRootDto`, `200 { cancelled: true }` o `409 busy`. |
| `DELETE /api/scan-roots/:id` | `session+key` | → 204. Solo las de origen `user`. |

- Las lecturas de biblioteca, ficha, tiendas y ajustes quedan en `session+key` y no en `session`: llevan datos personales (juegos y rutas). Hoy no hay ninguna ruta `session` nueva que anotar en la decisión 67.
- **Errores:** `{ error: string, detail?: TranslatedErrorDto }`. `not-found` da 404, `invalid-input` y la validación de esquema dan 400, `busy` da 409, los demás errores de dominio 422 y lo inesperado 500, sin detalle.
- **Cambios en `api-contract` respecto al borrador v0:**
  - Se añaden `LaunchRequestDto`, `LaunchResponseDto`, `SyncRequestDto`, `ScanRootPatchDto`, `SettingsPatchDto` y `ApiErrorDto.detail`.
  - `ScanRootDto` añade `declarationId?`, `tag?` y `labelKey?`.
  - En `SettingsDto`, `backups` y `autoUpdate` pasan a ser opcionales: si no vienen, la función no está disponible.
  - `GameSummaryDto` y `GameDetailDto` quedan como en la decisión 71. `favorite` es `false` y `tags` va vacío hasta su corte.

#### 6. Clave de origen y servir la SPA (decisiones 67 y 68, en el mismo cambio)

- **`SessionStore`:** `redeemOpenLink` devuelve `{ session, originKey }` y guarda el SHA-256 de la clave junto a la sesión, en memoria. `authorize(cookieValues, originKeyHeader)` devuelve `ok`, `no-session` o `no-key`, y recorre todas las cookies con ese nombre (decisión 66), comparando en tiempo constante.
- **`/open`:**
  - Responde 200 con el HTML mínimo de la decisión 67: `<meta name="ludiary-origin-key" content="…">`, `<script src="/open.js"></script>` y `<noscript>` con el texto traducido.
  - CSP `default-src 'none'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
  - Un enlace inválido o caducado responde 403 con una página traducida («Vuelve a abrir Ludiary desde el acceso directo o desde la bandeja»), no con JSON.
  - `/open.js` se genera en `api` a partir del `appId`: guarda la clave en `localStorage['ludiary.originKey']` y hace `location.replace('/')`. No sale de `apps/web/dist`, para que `/open` funcione aunque falte la web.
- **Estáticos:**
  - `runtime` lee una sola vez, al arrancar, la carpeta `web/` y entrega a `api` un mapa en memoria `ruta → { cuerpo, tipo, inmutable }`. Ocupa pocos MB, con las fuentes.
  - Solo se sirve lo que está en el mapa, así que no hay rutas calculadas a partir de la petición ni recorrido de directorios. Tipos por extensión con una tabla cerrada.
  - `/assets/*` lleva `Cache-Control: public, max-age=31536000, immutable`; lo demás, `no-store`. Se descarta `@fastify/static` porque una tabla en memoria es más pequeña y no tiene superficie de rutas.
  - **Vuelta a `index.html`:** solo para `GET` de rutas que no empiezan por `/api/`, `/open` ni `/assets/`.
  - Si falta la carpeta `web/`, el servidor arranca igual: `/` muestra una página traducida que pide reinstalar, y se registra el error.
- **Cabeceras de la SPA:** la CSP de la decisión 68, con `img-src` construido por `runtime` a partir de la unión de los `mediaHosts` de los conectores registrados (decisión 71), y `Referrer-Policy: no-referrer`. La página de `/` generada en el servidor desaparece.
- **La web:**
  - Un único `fetch` envuelto en `src/data/http.ts` lee `localStorage['ludiary.originKey']` en **cada** petición (sin copiarla en memoria) y la envía en `X-Ludiary-Origin-Key`, con `credentials: 'same-origin'`.
  - Con `401 origin_key_required`, borra la clave y muestra el aviso traducido de volver a abrir desde el acceso directo.
  - Con `401 session_required`, muestra «no autorizado».
  - Al arrancar pide `/api/status`.
  - El filtro de registros elimina la cabecera (decisión 67).

#### 7. Web: de simulador a API real

- ~~**Sin mezclar datos reales y simulados.** … Una prueba comprueba que `dist/` no contiene el simulador.~~ (Revisado por el **punto B** del usuario y ajustado tras la auditoría, que señaló la contradicción.) Lo vigente:
  - `isSimulated` es una constante de compilación (`import.meta.env.VITE_LUDIARY_SIMULATOR === '1'`). `vite dev` y `vite preview` la activan con su script; la compilación que se empaqueta, no. Una prueba (`apps/web/src/data/build-mode.test.ts`) comprueba que vale `false` en producción.
  - `isSimulated` indica si **toda** la web va contra el simulador, no si el simulador está en el bundle: `dist/` sí lo contiene, porque el cliente real lo usa para los métodos sin servidor.
- **El cliente real** (`apps/web/src/data/real.ts`) implementa `LudiaryApi`:
  - Los métodos que el servidor ya tiene van a la API.
  - Los métodos sin servidor en este corte (`startWizard`, `submitWizard` y `disconnect` de tiendas y servicios, colecciones, copias, registros, `syncAll` de biblioteca, favoritos y etiquetas) se delegan en el simulador, método a método, como hasta ahora. Lo simulado no guarda nada en el servidor.
  - ~~Rechazan con `NotAvailableError` y las pantallas lo muestran como «Disponible próximamente» con el control desactivado~~ (revisado por el punto B: no hay `NotAvailableError` en este corte).
  - **Pendiente del usuario:** si en producción esas partes muestran un aviso «Simulado». Hoy `SimNote` (`apps/web/src/components/bits.tsx`) solo se pinta con `isSimulated`, así que en el ejecutable no hay aviso. Propuesta del auditor: quitar `&& isSimulated` de la condición de `SimNote` para que el aviso salga siempre en lo simulado, y que `getMaintenance` de `real.ts` devuelva `lastBackupAt: null` para no enseñar una fecha de copia inventada. Recomendación del arquitecto: aceptarla, porque una fecha de copia falsa en el producto real puede hacer creer al usuario que tiene copias; es una decisión de producto y la toma el usuario.
  - En la tarjeta de Steam, el camino completo del asistente sale como «próximamente» y el modo solo instalados está activo sin pasos.
  - `simulateExpiredSession` solo existe en el simulador.
- **`LudiaryApi`** añade `launchGame(id: string, propertyId?: string): Promise<{ status: 'started' | 'already-starting' }>` (también en el simulador, que no lanza nada). En `pages/Game.tsx`, Jugar lo llama, se desactiva 5 s y muestra «Abriendo en Steam…» o el error traducido.
- **Al abrir la web** se llama a `POST /api/sync { trigger: 'open' }` (decisión 12). El botón de escanear usa `trigger: 'manual'`. Tras completar el primer arranque o cambiar la detección, el servidor ya escanea solo.

#### 8. Proceso y tiempo de juego

Fuera de este corte, en el corte 2b (punto 1). `installations.executables` no se crea todavía: Steam no lo informa en sus manifiestos y su primer uso es la detección del proceso.

#### 9. Empaquetado

- `apps/web/dist` se copia a una carpeta `web/` junto a `Ludiary.exe` (`apps/desktop/dist/app/web/`), no dentro del SEA:
  - Las actualizaciones de la decisión 58 ya copian carpetas versionadas enteras.
  - No hace falta la API de recursos del SEA.
  - La carpeta del programa ya es de escritura solo para el usuario, igual que el propio exe.
- `build.mjs` compila antes la web (`pnpm --filter @ludiary/web build`) y genera los avisos de sus dependencias de producción, incluidas las fuentes OFL con su `LICENSE` (decisiones 60 y 70).
- El instalador incluye `web\*` de forma recursiva.
- En la variante de pruebas, `LUDIARY_WEB_DIR` redirige la carpeta y se añade a la lista de ganchos de la decisión 65.
- El auxiliar de Go suma `--registry` y `--pick-folder`, y sus módulos entran en los avisos por el `go list` ya existente.
- Las migraciones viajan dentro del bundle (punto 4).

#### 10. Lo que no cambia y conviene decir

- Las sesiones del navegador siguen en memoria: no se crea `browser_sessions`.
  - La decisión 54 se cumple mientras el servidor sigue en marcha.
  - Tras reiniciar, la clave de origen ya no vale (decisión 67) y el uso normal pasa por el acceso directo. Persistirlas solo mantendría vivo `/api/status`.
  - Se persisten cuando haya una ruta `session` con valor tras reiniciar, o si el usuario lo pide. El cambio es pequeño.
- El idioma de la bandeja sigue saliendo del sistema o de `LUDIARY_LANG`. `ui.locale` se aplica a la web.

#### 11. Implementado y corregido tras la auditoría (21 de octubre de 2026)

Lo que se fijó al implementar y lo que el programador corrigió a raíz de la revisión del auditor. Los puntos 2 a 7 ya lo recogen en su sitio; aquí está el resumen y lo que no tenía sitio propio.

- **Contradicciones con el punto B** (señaladas por el auditor): el apartado 7 y las pruebas de la web decían que `dist/` no contenía el simulador y que lo no disponible se pintaba como «próximamente». Quedan revisados en su sitio según B: `isSimulated` vale `false` en producción y el cliente real delega en el simulador los métodos sin servidor.
- **Migraciones embebidas** en `packages/db/src/migrations.generated.ts`, generadas desde `packages/db/drizzle/` con `packages/db/scripts/embed-migrations.mjs` y con prueba de coincidencia. Id `0001_library_scan` (punto 4).
- **TypeBox** fijado en `typebox` 1.4.2 con el Ajv de Fastify 5.12.7, sin `removeAdditional`, `coerceTypes` ni `useDefaults` (punto 5).
- **Código de salida 14** `databaseTooNew` con `fatal.databaseTooNew`, añadido a la tabla de la decisión 64. El 12 queda para los demás fallos de la base de datos y de la migración.
- **`ScopedFileReader` y uniones:** `PathEscapesRootsError` (subtipo de `ConnectorError`, código `internal`) cuando el `realpath` sale de las raíces; Steam lo trata como entrada saltada o raíz ilegible. Una ruta fuera por su texto sigue siendo un fallo del conector (punto 2).
  - **Consecuencia para el usuario:** quien mueva juegos de Steam a otro disco con `mklink /J` dejando la unión en `steamapps\common` no los verá en la biblioteca.
  - **Propuesta, sin decidir (pendiente del usuario):** admitirlos añadiendo como raíz el destino real de la unión. Opciones:
    - (a) **Dejarlo así** y documentarlo en la guía de solución de problemas: mover el juego con el gestor de almacenamiento del propio Steam (supuesto: el nombre exacto del menú se comprueba al escribir la guía), que usa una biblioteca real en el otro disco, en lugar de `mklink /J`. Sin coste y sin superficie nueva. Añadir la carpeta de destino como carpeta manual no basta: no contiene `steamapps\appmanifest_*.acf`, así que el escaneo actual no encuentra nada en ella.
    - (b) **Añadir el destino real como raíz, con permiso explícito** (la propuesta): al detectar `PathEscapesRootsError` en una instalación, el núcleo muestra en Ajustes «Esta instalación apunta a otra carpeta» con un botón para autorizar el destino. El destino entra como raíz asociada a esa biblioteca, el lector de esa biblioteca lo acepta como raíz adicional y `isInside` da por buena la instalación. Conserva el confinamiento (nada se lee sin que el usuario lo autorice) a cambio de un tipo de raíz y una pantalla nuevos.
    - (c) **Seguir las uniones automáticamente** si el destino es local (`isLocalPath`). Lo más cómodo, pero rompe la regla de que el conector solo lee bajo raíces que el usuario ve y puede desactivar (decisión 42).
    - Recomendación del arquitecto: (a) en este corte y (b) si hay usuarios afectados. (c) se descarta.
- **`LocalFiles.isLocalPath`** (obligatorio en el puerto, punto 3): las raíces descubiertas y las leídas del registro se descartan si son UNC o rutas de dispositivo (`\\?\`, `\\.\`) antes de cualquier `stat`, para no abrir conexiones SMB por un valor del registro o de `libraryfolders.vdf`. Una carpeta UNC solo se admite si la elige el usuario en el selector.
- **Manifiesto ilegible en ese momento** (fichero bloqueado, error de E/S): la raíz se marca como ilegible y conserva sus instalaciones, igual que una raíz de `unreadableRoots`. Un manifiesto que se lee pero está **malformado** se salta (y se registra), como ya decía el analizador VDF; si esa instalación ya no aparece por otra vía, se retira con las reglas del plan de escaneo.
- **`rundll32.exe`** por ruta absoluta bajo `SystemRoot` (punto 3).
- **Apagado:** `RuntimeDeps.dispose` y `DisposableHelperRunner.dispose()` matan los procesos auxiliares que sigan vivos, como un diálogo de carpetas abierto, para que no queden huérfanos al parar desde la bandeja.
- **Filtro de `user_id`** añadido en `getGame`, en `listInstallations` y en el `update` de `applyScanPlan`, que no lo aplicaban. Regla general (decisión 47): toda consulta y toda escritura de `db` filtra por `user_id`, aunque el MVP tenga un solo usuario.
- **Dependencias de desarrollo con avisos:** `drizzle-kit` trae `esbuild` ≤0.24.2 (aviso moderado GHSA-67mh-4wv8-2f99, que afecta al servidor de desarrollo de esbuild) y `@esbuild-kit/*`, obsoleto. Son solo de desarrollo y no entran en el instalador ni en el bundle. Se aceptan y se revisan al subir `drizzle-kit`.

#### Supuestos de Steam (no hay documentación oficial; se verifican con los juegos reales del desarrollador)

1. `HKCU\Software\Valve\Steam` tiene `SteamPath` (con `/` y en minúsculas) y `SteamExe`. `HKLM\SOFTWARE\WOW6432Node\Valve\Steam` tiene `InstallPath`. Las fuentes son de terceros: NSIS, foros y la página de soporte de Steam con la variante WOW6432Node.
2. `steamapps\libraryfolders.vdf` usa KeyValues con entradas numeradas `path` y `apps`. Pueden quedar instalaciones con el formato antiguo, de solo rutas.
3. `appmanifest_<id>.acf` tiene la raíz `AppState` con `appid`, `name`, `installdir` (relativo a `steamapps\common`) y `StateFlags`. El significado de los bits de `StateFlags` no está documentado y no se usa. Contiene `LastOwner` (SteamID64): **nunca entra en fixtures ni en registros**.
4. Los DLC no tienen manifiesto propio: el escaneo no informa DLC (`dlc: 'none'`).
5. `steam://rungameid/<id>` arranca el juego, y abre Steam si estaba cerrado. Según la wiki comunitaria de Valve, es igual que `run` pero admite mods y accesos directos ajenos. No hay página oficial de Valve. Se usa `rungameid`, como dice la tabla de la decisión 40.
6. `rundll32 url.dll,FileProtocolHandler` entrega `steam://` al manejador registrado igual que `http(s)`.
7. El diálogo de carpetas abierto por el auxiliar, lanzado por un servidor en segundo plano, aparece en primer plano o al menos parpadea en la barra de tareas (reglas de primer plano de Windows, como en la decisión 64). Si queda oculto, se le da una ventana propietaria `TOPMOST`.

**Motivo:** es el corte más pequeño que recorre todas las capas reales (plataforma → conector → núcleo → base de datos → API → web → lanzamiento) con la tienda mejor conocida y sin secretos de terceros. Así se puede auditar la parte más delicada (servir la SPA, la clave de origen y lanzar procesos) sin mezclarla con el cifrado de tokens. Leer el registro y abrir diálogos con el auxiliar de Go reutiliza una pieza ya firmada y distribuida, sin módulos nativos nuevos. `discoverRoots` hace visibles y desactivables las bibliotecas de Steam, que es lo que la decisión 42 promete en Ajustes, sin dar al conector acceso fuera de sus raíces.

**Consecuencias:**

- **Pruebas que pide el corte:**
  - `connectors/steam`:
    - VDF: escapes, comentarios, anidamiento, claves sin mayúsculas, BOM, fichero mal formado, límite de profundidad, condiciones.
    - `libraryfolders`: formatos antiguo y nuevo.
    - Escaneo sobre fixtures: dos bibliotecas, carpeta `common\<installdir>` ausente, herramienta `228980` excluida, títulos con caracteres no ASCII, appid repetido, raíz que es `steamapps`.
    - `resolveAction`: solo dígitos, lanzador ausente con y sin `launchersResolved`, acciones distintas de `play`.
    - URL de medios dentro de `mediaHosts` y conformidad con `connector-testkit`.
  - Fixtures: comprobación de la decisión 48 ampliada con `LastOwner`, el patrón SteamID64 `7656119\d{10}` y rutas `C:\Users\…`.
  - `platform-node`:
    - `..`, rutas absolutas fuera, unión o enlace que escapa (con `realpath`), límites de tamaño y de entradas.
    - `isInside` sin mayúsculas y la trampa del prefijo (`D:\Games2`), `normalize` con `/`.
  - `platform-windows`:
    - Protocolo de `--registry` con un auxiliar doble.
    - Validación de `openUri` (esquema, caracteres de control, espacios, comillas, `%`, longitud) antes de lanzar nada.
  - Auxiliar de Go: pruebas en Go del JSON de `--registry` y de que la máscara de acceso es solo de lectura.
  - `core`:
    - `normalizeTitle` y las marcas de edición.
    - Plan de escaneo: nueva, actualizada, desaparecida, raíz ilegible conservada, raíz desactivada retirada, entradas inválidas descartadas, ID repetido.
    - Los cuatro modos de detección, la espera de 60 s y el escaneo forzado.
    - Aislamiento con un conector que falla, conversión a `internal`, tiempo máximo con reloj doble y `running` huérfano al arrancar.
    - Lanzamiento: ID desconocido, no instalado, propiedad de otro canónico, esquema no permitido, tipo fuera de capacidades o de la plataforma, reglas de `exec`, doble clic y que la `LaunchSpec` no aparece en el resultado.
  - `db`:
    - Migración desde vacío, repetición sin efecto, base más nueva rechazada, copia previa solo con migraciones ya aplicadas (y se conservan 3).
    - `user_id` en todas las tablas, claves foráneas, índices únicos y deshacer el plan si falla a medias.
  - `api`:
    - Las pruebas de la decisión 67.
    - Ruta sin nivel → `session+key`.
    - `/open` sin redirección, CSP y la clave fuera de la URL y de los registros.
    - Estáticos: solo los del mapa, intentos de recorrido de directorios → 404, la vuelta a `index.html` nunca en `/api/` ni en `/assets/`, y CSP con `img-src` igual a la unión de `mediaHosts`.
    - Lanzamiento con campos extra → 400 y correspondencia de los errores.
  - `runtime`:
    - Conector con otra `contractVersion` o con tipos que la plataforma no ejecuta → rechazado.
    - Arranque sin carpeta `web/`.
    - Paridad de la lista de `vite.config.ts` con los `mediaHosts` (decisión 71; vive aquí porque `runtime` es el único que conoce los conectores).
  - Web:
    - El envoltorio de `fetch` lee la clave en cada petición y la borra con `origin_key_required`.
    - ~~`NotAvailableError` se pinta como «próximamente».~~ (Revisado por el punto B.) Los métodos sin servidor del cliente real delegan en el simulador.
    - Jugar llama a `launchGame`.
    - ~~`dist/` sin simulador.~~ (Revisado por el punto B.) `isSimulated` vale `false` en producción (`build-mode.test.ts`).
  - `i18n`: paridad incluyendo `connectors/steam/locales`.
  - Playwright (decisión 48): servidor de `runtime` en modo prueba con un árbol de Steam de fixtures en una carpeta temporal, `LocationResolver` doble y `ProcessLauncher` que graba. Casos: enlace → biblioteca → ficha → Jugar graba `steam://rungameid/<id>`; primer arranque con cada modo; desactivar una carpeta retira sus juegos.
  - Prueba de humo del exe empaquetado: `/` sirve `index.html` y un `/assets/*`.
- **Pruebas manuales** (las prepara el tester):
  - Al menos tres juegos reales de Steam en dos bibliotecas, uno de ellos en una ruta con caracteres no ASCII.
  - Lanzar con Steam cerrado y abierto.
  - Steam desinstalado o sin `SteamExe`.
  - Diálogo de carpetas en primer plano.
  - Chrome, Edge y Firefox.
- **Revisión del auditor** antes de cerrar: `/open` y la clave de origen, los estáticos y la CSP, `openUri`, `--registry` y `--pick-folder`, la validación del lanzamiento y las fixtures.
- Los agentes `programador`, `conectores` y `empaquetador` tienen en este punto su especificación. El `documentalista` actualiza la guía de usuario (detección, carpetas, «próximamente») y la de solución de problemas («Steam no se abre al pulsar Jugar»).
- Se cierran los pendientes de la decisión 68: librería de esquemas (TypeBox) y selector nativo de carpetas.
- La decisión 55 sigue en propuesta y se cierra para Steam en el corte 2b.

### 73. Portadas de Steam con ruta con hash: `IStoreBrowseService/GetItems` (amplía las decisiones 40, 71 y 72)

**Problema (prueba del usuario con su Steam real, 22 de octubre de 2026):** de 18 juegos, BALL x PIT (2062430) y Europa Universalis V (3450310) se quedan sin portada. Las rutas sin hash de la decisión 71 (`…/apps/<appId>/library_600x900.jpg` y `…/header.jpg`) dan 404 para ellos y 200 para juegos antiguos como 620. Los juegos recientes solo publican sus imágenes bajo un segmento de hash que no se puede deducir del AppID.

**Decisión (recomendada, 22 de octubre de 2026):**

- **Fuente:** el núcleo pide al conector de Steam las URL vigentes con `GET https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=…`, público y sin clave, con `data_request.include_assets: true`. Devuelve, por juego, `assets.asset_url_format` (`steam/apps/<appId>/${FILENAME}?t=…`) y los nombres de fichero `library_capsule` (vertical 600×900) y `header`, con o sin hash. La URL final es `https://shared.akamai.steamstatic.com/store_item_assets/` + `asset_url_format` con `${FILENAME}` sustituido. Se piden varios juegos en una sola petición.
  - Comprobado el 22 de octubre de 2026: para 3450310 y 2062430 da `library_capsule` con hash (`478711af…/library_600x900.jpg` y `b6cabe19…/library_600x900.jpg`) y la URL resultante devuelve un JPEG; para 620 da `library_600x900.jpg` sin hash; para 228980 y 1 da `success: 15` sin `assets`.
- **Para todos los juegos de Steam, no solo los que fallan:** el servidor no sabe qué imagen da 404 (la carga el navegador, decisión 71) y no se añaden sondeos al CDN. Con peticiones por lotes, 18 juegos son una petición; y la ruta con hash es la que usa la propia tienda.
- **Las URL construidas por AppID de la decisión 71 se quedan** como valor inicial y como respaldo mientras no haya respuesta (primer escaneo, sin conexión, juego que `GetItems` no conoce).
- **Precedencia por campo:** `coverUrl` resuelta > `coverUrl` del escaneo; `heroUrl` resuelta > `heroUrl` del escaneo. `GameSummaryDto` no cambia: `coverUrl` y `coverFallbackUrl` salen de ahí, y la web conserva su cadena de respaldo y el degradado.
- **Alcance y privacidad (decisión 71 e invariante 9):** solo propiedades de Steam no retiradas, de tipo `game` y con `storeGameId`. Sale hacia Valve la lista de AppID que el usuario tiene en Steam, la misma información que ya recibe su CDN al cargar las portadas y que Valve conoce por la cuenta. La petición la hace el servidor: sin cookies (Node no guarda cookies), sin `Referer` y sin datos del equipo. `context` fijo con `country_code: 'US'` (no se envía la ubicación real) y `language` según `ui.locale` (`spanish` para `es`, `english` en otro caso).
- **Cuándo:** como paso final de la operación `scan` de cada tienda, dentro de la misma ejecución (el estado sigue en `running` hasta acabar, así que la web ve las portadas al refrescar). Un fallo de este paso se registra como aviso y **no** pone la tienda en error ni cambia el resultado del escaneo.
  - Pendientes: propiedades sin `mediaResolvedAt` o con más de 30 días.
  - Lotes de 50 AppID como mucho y 20 lotes por ejecución (el resto queda para la siguiente).
  - Tiempo máximo de 15 s por ejecución del paso (`Clock.timeout`), aparte de los 60 s del escaneo.
  - Tras un fallo (red, 429, respuesta inesperada), no se reintenta hasta pasado el mayor entre `minSyncIntervalMs` (10 min para Steam, decisión 50) y `retryAfterMs`. Se guarda en memoria: tras reiniciar se permite un intento.
  - Una respuesta válida marca **todos** los AppID pedidos con `mediaResolvedAt`; los que no traen `assets` quedan con medios resueltos vacíos y no se vuelven a pedir hasta pasados los 30 días.
- **Descartadas:**
  - `appdetails` (opción a del encargo): una petición por juego, límite estricto conocido por la comunidad y sin portada vertical (solo `header_image`). Habría dejado a los juegos recientes con la imagen horizontal.
  - Caché local del cliente (`appcache\librarycache`, opción b): formato sin documentar, lectura binaria del disco del cliente, una ruta nueva para servir imágenes y su nivel de acceso; es lo que la decisión 71 descartó. Se revisa si hace falta modo sin conexión.
  - Aceptar el degradado hasta el corte de la cuenta (opción c): el fallo afecta a todo juego reciente y el usuario ya lo ha visto.

#### Contrato (amplía la decisión 40; `contractVersion` sigue en 1)

```ts
// packages/contracts/src/connector.ts — additions of ADR 73
export interface StoreConnector {
  // ...ADR 40, 71, 72...
  /** ADR 73. Bare lower-case hosts this connector's HttpClient may call (HTTPS, default port). [] if none. */
  readonly apiHosts: readonly string[];
  /**
   * ADR 73. Optional. Current artwork of stored properties, at most 50 ids per call.
   * Ids missing from the result: nothing known. Media follow rule 4 (https, host in mediaHosts).
   */
  resolveMedia?(storeGameIds: readonly string[], ctx: MediaContext): Promise<ReadonlyMap<string, EntryMedia>>;
}

export interface MediaContext extends BaseContext {
  readonly http: HttpClient;
}
```

- `checkConnectorManifest` añade: cada `apiHosts` es un host desnudo en minúsculas (misma regla que `mediaHosts`), y un conector con `resolveMedia` tiene `apiHosts` no vacío (`listLibrary` no lo exige: Epic y GOG pueden ir solo por herramientas externas). `assertConnectorConformance` comprueba lo mismo.
- **Steam:** `apiHosts: ['api.steampowered.com']`. `mediaHosts` y la CSP **no cambian**: las URL resueltas siguen en `shared.akamai.steamstatic.com`. La CSP no necesita `connect-src` nuevo porque la petición la hace el servidor.
- El corte de la cuenta reutiliza `apiHosts` y este `HttpClient` para `GetOwnedGames`, y `resolveMedia` cubre ya los juegos no instalados.

#### `HttpClient` mínimo de este corte

Se implementa ahora la parte de `HttpClient` (decisión 40) que este paso necesita; lo demás llega con la cuenta.

- **Dónde:** `packages/platform-node/src/http.ts`, `createHttpClient(opts: { hosts: readonly string[]; signal: AbortSignal; log: ConnectorLogger; fetch?: typeof fetch; maxBytes?: number }): HttpClient`. `fetch` inyectable solo para pruebas; por defecto el `fetch` global de Node.
- **El núcleo no hace E/S:** `CoreDeps` añade `http?: (hosts: readonly string[], signal: AbortSignal, log: ConnectorLogger) => HttpClient`. `runtime` lo conecta con `createHttpClient`. Sin `http`, el paso de medios no se ejecuta (pruebas y modos sin red). El núcleo crea un cliente por conector con **sus** `apiHosts`.
- **Reglas:**
  - Solo `GET`. `POST` lanza `ConnectorError('internal')`. `shortcut: solo GET, se amplía a POST con cuerpo json/form en el corte de la cuenta.`
  - URL con `https:`, host exactamente en `hosts`, sin usuario ni contraseña, sin puerto distinto del 443. Si no, `ConnectorError('internal')` sin enviar nada.
  - `query` se añade con `URLSearchParams`; un `Secret` se revela solo al enviar (`reveal()`), nunca con `String()`.
  - `redirect: 'error'`: una redirección es `store.unexpected-response` (no se sigue a hosts no declarados).
  - Respuesta limitada a `maxBytes` (por defecto 2 MiB), leída por flujo; si se supera, `store.unexpected-response`. `json()` que no es JSON: `store.unexpected-response`.
  - Errores de transporte: `network.timeout` si el `signal` se aborta, `network.unavailable` en otro caso. Los códigos HTTP **no** son errores del cliente: los interpreta el conector.
  - Registro: `debug` con método, host, ruta, estado y duración. **Nunca** la consulta ni las cabeceras (aquí lleva la lista de juegos, que es dato personal; con la cuenta llevará la API key).
  - Sin `User-Agent` propio ni cabeceras extra salvo `accept: application/json`.
- `connector-testkit` adelanta su doble de HTTP: `fakeHttp(handler)` que graba las peticiones y responde con respuestas grabadas, y `mediaContext()`.

#### Lo mínimo que hay que implementar

- `packages/contracts/src/connector.ts`: `apiHosts`, `resolveMedia`, `MediaContext` y las reglas nuevas de `checkConnectorManifest`.
- `connectors/steam/src/media.ts`: `resolveSteamMedia(ids, ctx)`. Manifiesto con `apiHosts`.
  - Construye `input_json` con `ids: [{ appid: Number(id) }]`, el `context` de arriba y `data_request: { include_assets: true }`.
  - `429` → `store.rate-limited` con `retryAfterMs` de `Retry-After`; otro estado distinto de 200 o cuerpo sin `response.store_items` → `store.unexpected-response`.
  - Por elemento, se acepta solo si `success === 1`, `appid` está entre los pedidos, `asset_url_format` cumple `^steam/apps/<appid>/\$\{FILENAME\}(\?t=\d{1,12})?$` con su propio AppID, y cada nombre de fichero cumple `^(?:[0-9a-f]{40}/)?[a-z0-9_]{1,64}\.(?:jpg|png)` (algunos juegos antiguos usan `portrait.png`; ver la corrección del final). Lo que no cumple se salta, sin tumbar el resto.
  - `library_capsule` → `coverUrl`; `header` → `heroUrl`.
- `packages/platform-node/src/http.ts`: `createHttpClient` con las reglas de arriba.
- `packages/core`: paso de medios al final de la operación `scan`, con las reglas de «Cuándo». Valida la salida con la misma función de medios que el escaneo (`validate.ts`) e ignora los ID no pedidos. `CoreDeps.http`.
- `packages/core` y `packages/db`, puerto de la biblioteca:
  - `listMediaPending(store, olderThan: number, limit: number): Promise<readonly string[]>` (`storeGameId`).
  - `setResolvedMedia(store, media: ReadonlyMap<string, EntryMedia>, requested: readonly string[], at: number): Promise<void>`.
- `packages/db`: **sin migración**. `StoreMetadataJson` añade `resolvedMedia?: MediaJson` y `mediaResolvedAt?: number`. El `update` del plan de escaneo los conserva (hoy reescribe `store_metadata` entero y los borraría). `summary` aplica la precedencia por campo. Filtro de `user_id` en las consultas nuevas (decisión 47).
- `packages/runtime`: pasa `http` a `createCore`.
- Web y simulador: sin cambios.

#### Pruebas

- `connectors/steam`, con respuestas grabadas de `GetItems` (datos públicos de juegos, sin datos de cuenta) para 620, 3450310, 2062430 y 228980:
  - Con hash, sin hash y `success: 15`.
  - Saltados: `asset_url_format` de otro AppID, nombre con `..` o `/` de más, extensión distinta, host o esquema en el nombre, `appid` no pedido.
  - `429` con `Retry-After`, `500`, cuerpo que no es JSON y JSON sin `store_items`.
  - La petición: host `api.steampowered.com`, ruta exacta, `input_json` con exactamente los ID pedidos e `include_assets`, idioma según `locale`.
  - Conformidad con `apiHosts`.
- `platform-node` (`http.ts`, con `fetch` doble): `http:`, host no declarado, puerto, credenciales en la URL y `POST` rechazados sin llamar a `fetch`; redirección; límite de bytes; aborto → `network.timeout`; fallo de red → `network.unavailable`; `Secret` revelado en la consulta; el registro no contiene la consulta.
- `core`: solo Steam y solo pendientes; lotes de 50 y tope de 20; ID ausentes marcados como resueltos vacíos; caducidad de 30 días con reloj doble; tras un fallo, espera de 10 min o `retryAfterMs`; el fallo no cambia el estado del escaneo; medios con host fuera de `mediaHosts` descartados; sin `http` o sin `resolveMedia` no hay paso.
- `db`: el escaneo conserva `resolvedMedia`; precedencia por campo en `summary`; `listMediaPending` y `setResolvedMedia` filtran por `user_id`.
- Fixtures: la comprobación de la decisión 48 se aplica también a las respuestas grabadas.
- **Manual (usuario):** BALL x PIT y Europa Universalis V muestran la portada vertical tras un escaneo; sin red, la biblioteca abre igual y cae a las URL por AppID o al degradado; el registro exportado no contiene AppID ni `input_json`.

#### Supuestos (verificar al implementar)

1. `IStoreBrowseService/GetItems/v1` no aparece en la documentación oficial de Steamworks: lo usa la propia tienda y lo documenta la comunidad. Funciona sin clave (comprobado el 22 de octubre de 2026). Si Valve lo cierra o lo cambia, el paso falla con aviso y quedan las URL por AppID.
2. Límite de peticiones y número máximo de ID por petición sin documentar. 50 por lote es conservador; se ajusta si responde 429 o error con lotes de 50.
3. `asset_url_format` acaba en `?t=<número>`; si cambia el formato, la expresión regular salta el elemento (se ve en el registro como elementos saltados, sin la consulta).
4. Las URL con hash siguen sirviendo tras un cambio de imagen del juego (direccionadas por contenido). Si no, los 30 días de caducidad lo corrigen.
5. Las imágenes no dependen del país del `context`. Un juego no visible en `US` queda con las URL por AppID.
6. `GetItems` no exige un `User-Agent` concreto.

**Motivo:** es la única fuente pública sin clave que da la portada vertical con hash, y lo hace por lotes, así que el coste en red es mínimo y una vez resuelto no se repite. Mantiene intactos `mediaHosts`, la CSP y el modelo de la decisión 71 (el navegador carga del CDN, el servidor no sirve imágenes), y no añade tablas. Adelantar un `HttpClient` acotado a `apiHosts` y solo `GET` es poca superficie y es la pieza que el corte de la cuenta necesita de todos modos.

**Corrección del 22-10-2026 (prueba del usuario):** algunos juegos antiguos llaman a su portada vertical `portrait.png` (por ejemplo, 228400). El patrón de nombres solo admitía `.jpg`, así que la respuesta se descartaba y quedaba la URL adivinada, que da 404; además, el navegador no guarda en caché un 404 y lo volvía a pedir en cada repintado. Ahora el patrón admite `.jpg` y `.png`; la migración de datos `0003_recheck_steam_media` borra la resolución guardada de Steam para que el siguiente escaneo pregunte de nuevo; y la web recuerda durante la sesión las portadas que ya fallaron y no las vuelve a pedir.

**Consecuencias:**

- Primera salida de red del servidor hacia una tienda. El `auditor` revisa `http.ts` (hosts, redirecciones, límite, registro), la validación de `resolveSteamMedia` y que no salga nada de juegos que no son de Steam.
- `apiHosts` pasa a ser obligatorio en todos los conectores: los dobles y fixtures existentes añaden `apiHosts: []`.
- El `documentalista` añade a la guía de solución de problemas que una portada que falta aparece tras el siguiente escaneo con conexión, y menciona en la de privacidad la petición a `api.steampowered.com` con la lista de AppID.
- Las tiendas futuras siguen el mismo patrón: `apiHosts` declarados y medios resueltos por `resolveMedia` si su escaneo no los da.

### 74. Cuenta de Steam: OpenID, API key cifrada y juegos no instalados (amplía las decisiones 40, 43, 46, 47, 50, 68, 72 y 73)

**Decisión (recomendada, 22 de octubre de 2026):** es el «corte siguiente, cuenta de Steam» de la decisión 72, encargado el 22 de octubre de 2026 tras probar el corte anterior con Steam real (18 juegos, portadas de la 73 y Jugar).

#### 1. Alcance

- **Entra:**
  - el camino completo del asistente de Steam de la decisión 43: OpenID, abrir la página de la clave, Pegar, llamada de prueba y aviso de perfil privado;
  - el motor de asistentes en el núcleo y sus rutas;
  - `SecretCipher`, la tabla `secrets` y `store_connections`, en la migración `0002_store_account`;
  - `listLibrary` con `GetOwnedGames`, para mostrar los juegos poseídos que no están instalados, con la acción `install`;
  - el tiempo de juego y la última partida que informa Steam (decisión 56);
  - desconectar y el estado `expired`;
  - un `HttpClient` con POST y cabeceras secretas.
- **Fuera, cada parte con su motivo:**
  - Rotación de la clave y contraseña maestra (decisión 46). El formato `v1.<keyId>` y el `key_id` por fila ya la admiten, y en este corte el anillo tiene una sola clave. Se hace cuando haya un segundo secreto que proteger, o antes de publicar.
  - DLC de la biblioteca: `GetOwnedGames` no los devuelve (supuesto S5). `dlc` sigue en `'none'`.
  - `open-store-page`: con `install` ya se cumple la decisión 16 («la instalación directa donde la URI lo permita»).
  - Nombre de la cuenta en Ajustes: lo decide el usuario (punto 12).
  - Claves de IGDB y RAWG: siguen en el simulador. Usarán el mismo motor y el mismo almacén con el ámbito `service:<id>`.
  - Persistir las sesiones del navegador (decisión 72, punto 10).

#### 2. ¿OpenID o pegar el perfil?

- **A. OpenID (la decisión 43, confirmada por el usuario).**
  - Ventajas: el usuario no copia nada y, si ya tiene sesión de Steam en el navegador, basta un clic. El SteamID llega firmado por Steam. La aserción no da acceso a la cuenta: no hay contraseña ni token.
  - Coste: una página de vuelta, un POST de `check_authentication` y protección contra repeticiones.
- **B. Pegar la URL del perfil o el SteamID.**
  - Menos código, pero es un segundo dato que copiar. Una URL personalizada (`/id/<nombre>`) exige además `ResolveVanityURL`, y para el público general (decisión 30) es otro sitio donde perderse.
  - En seguridad es equivalente aquí: con la clave del propio usuario solo se leen datos que su perfil ya hace públicos, así que OpenID no protege nada que B ponga en riesgo.
- **Se mantiene A** por la experiencia de uso y porque está confirmada. B es el plan de reserva solo si Steam no acepta el `realm` de la dirección local (supuesto S1). Necesitaría una decisión nueva.

#### 3. Flujo OpenID 2.0 de Steam

- **Ida (la construye el conector):** `https://steamcommunity.com/openid/login` con:
  - `openid.ns=http://specs.openid.net/auth/2.0`;
  - `openid.mode=checkid_setup`;
  - `openid.return_to=<callbackUrl>`;
  - `openid.realm=<origen de callbackUrl>/`;
  - `openid.identity` y `openid.claimed_id`, ambos `http://specs.openid.net/auth/2.0/identifier_select`.
- **`callbackUrl`** la crea el núcleo: `<returnBase>/connect/return?w=<wizardId>`.
  - `returnBase` es `http://<Host>` de la petición que abrió el asistente. Ese `Host` ya está validado contra la lista cerrada (decisiones 23 y 66), así que vale `ludiary.localhost:<puerto>` o `127.0.0.1:<puerto>` con el puerto vigente.
  - La vuelta llega al mismo origen que abrió el asistente, porque la clave de origen vive en el `localStorage` de ese origen (decisión 67).
- **Misma pestaña.** El enlace de inicio de sesión (`open-external` con `awaits: 'callback'`) se abre en la misma pestaña, con `rel="noreferrer"`. Revisa la regla general de la decisión 68 (`target="_blank"`) solo para este tipo de paso. Así la vuelta cae en la pestaña de Ludiary y no hay que coordinar dos pestañas. Los demás enlaces externos siguen en pestaña nueva.
- **Vuelta (la web, sin ruta pública nueva):**
  - `/connect/return` es una ruta de la SPA, que el servidor entrega por la vuelta a `index.html`.
  - La página lee `location.search` y lo borra **antes de nada** con `history.replaceState(null, '', '/connect/return')`.
  - Si `w` es un id con formato válido, envía `POST /api/wizards/<w>/callback` con **solo** los parámetros `openid.*`, con la cookie y la clave de origen (`session+key`).
  - Supuesto S10: tras una navegación entre sitios, las peticiones `fetch` de la página al mismo origen sí llevan la cookie `SameSite=Strict`. Comprobado por el usuario el 22-10-2026 con su cuenta real: la cookie viaja. **Sin plan de reserva** (decisión del usuario): la recarga con `location.replace` que se proponía aquí no serviría, porque la página borra la consulta de OpenID antes de enviarla; si un navegador no mandara la cookie, el usuario ve «no autorizado» y vuelve a conectar la cuenta.
  - Ninguna ruta pública procesa datos de Steam.
- **Verificación (conector, `connectors/steam/src/openid.ts`), en este orden. Cualquier fallo es `auth.invalid` con la clave `connectors.steam.error.openid`:**
  1. `openid.mode`:
     - `cancel`: `auth.required` con la clave `connectors.steam.login.cancelled`;
     - cualquier valor distinto de `id_res`: fallo.
  2. `openid.ns` es exactamente `http://specs.openid.net/auth/2.0`.
  3. `openid.op_endpoint` es exactamente `https://steamcommunity.com/openid/login`.
  4. `openid.return_to` es **exactamente** `ctx.callbackUrl`, con su `w`. Una aserción grabada en otro asistente o para otro sitio (`return_to` ajeno) no pasa.
  5. `openid.claimed_id` cumple `^https://steamcommunity\.com/openid/id/(7656119\d{10})$` y `openid.identity` es igual a él.
  6. `openid.signed`, separado por comas, contiene `op_endpoint`, `claimed_id`, `identity`, `return_to`, `response_nonce` y `assoc_handle`.
  7. `openid.response_nonce` empieza por una fecha `AAAA-MM-DDTHH:MM:SSZ` de hace 5 minutos como mucho y no más de 1 minuto en el futuro, según `ctx.now()`.
  8. `POST https://steamcommunity.com/openid/login` con cuerpo de formulario: todos los `openid.*` recibidos, con `openid.mode=check_authentication`. La respuesta debe ser 200 y, leída por líneas `clave:valor`, tener **exactamente** `ns:http://specs.openid.net/auth/2.0` e `is_valid:true`. No se busca una subcadena (supuesto S2).
- **Repetición:**
  - El paso de la vuelta solo se acepta una vez: tras el éxito, el asistente pasa al paso siguiente y otra vuelta para el mismo `w` da `rejected`.
  - Cada asistente tiene un `w` nuevo, ligado a `return_to` (comprobación 4), y caduca a los 15 minutos sin actividad.
  - La comprobación 7 acota la ventana.
  - No se confía en que Steam rechace por sí mismo un nonce repetido (supuesto S3), así que no hace falta una tabla de nonces.
- El SteamID verificado queda en el estado del asistente (punto 5) hasta terminar. Es un dato personal: nunca va a los registros ni a las respuestas de la API.

#### 4. Pasos del asistente de Steam

| Id | Tipo | Qué hace |
|---|---|---|
| `choose` | `info` | Explica los dos caminos. Continuar lleva a `login`. El botón «Steam sin clave: solo instalados» lo resuelve la web: cancela el asistente y cierra, sin más llamadas. Ya es el modo por defecto de Steam sin conexión (decisión 72). |
| `login` | `open-external`, `awaits: 'callback'` | La URL del punto 3. |
| `apikey` | `open-external`, `awaits: 'input'`, con campo | Enlace a `https://steamcommunity.com/dev/apikey`, con instrucciones para el campo de dominio (`localhost`, supuesto S11). Campo `apiKey`: `secret: true`, `paste: true`, `pattern: '^[0-9A-Fa-f]{32}$'`, `maxLength: 64`. |
| `profile` | `info` | Solo si la llamada de prueba indica perfil privado (`{"response":{}}`). Explica cómo hacer públicos los «Detalles de juego». Continuar repite la prueba con la clave guardada en el estado del asistente. |

- **Llamada de prueba**, en el envío de `apikey`: `GetOwnedGames` con `include_appinfo=false` (ver el punto 7 para la petición).
  - 401 o 403: `rejected` con `auth.invalid` y la clave `connectors.steam.error.key` (clave mal copiada o revocada, supuesto S6).
  - 429: `rejected` con `store.rate-limited`.
  - Error de red: `rejected` con su código.
  - `response` sin `game_count`: paso `profile`.
  - Con `game_count`: `secrets.set('steamId')`, `secrets.set('apiKey')` y `done`.
- **Contrato** (amplía la decisión 40; alinea el desvío ya anotado en `api-contract`): el paso `open-external` admite `fields?: readonly WizardField[]` cuando `awaits === 'input'`. El enlace y el campo comparten pantalla, como ya hace la web.

#### 5. Motor de asistentes (núcleo)

- **`packages/core/src/wizards.ts`.** Sesiones **solo en memoria**, nunca persistidas, como la clave de origen:
  - Una por tienda: abrir otra cancela la anterior.
  - Como mucho 4 a la vez.
  - Caducan a los 15 minutos sin actividad.
  - El id es `deps.newId()` (UUID v4 aleatorio, 122 bits).
  - Mueren al parar el servidor.
  - El `wizardState` de la decisión 40 es un mapa en memoria de esa sesión. El comentario del contrato («Encrypted») pasa a ser «solo en memoria, se borra al terminar, cancelar o caducar»: no tocar el disco es más estricto que cifrar.
- **`WizardContext`** añade `now(): number`, porque los conectores no leen la hora por su cuenta (decisión 38). Todo lo demás está ya en la 40:
  - `callbackUrl`;
  - `http`, con los `apiHosts` del conector;
  - `secrets`, el almacén del ámbito `store:<id>`;
  - `tools`, que en este corte es un doble que lanza `tool.missing`;
  - `progress`, que no hace nada.
- **Validación de lo que devuelve el conector** (regla 4 de la decisión 40):
  - `id` del paso con `^[a-z][a-z0-9-]{0,31}$`.
  - Claves de texto bajo `connectors.<id>.` o `connectors.common.`.
  - `url` en `https` y con host en `authHosts`.
  - Como mucho 4 campos, con `name` `^[A-Za-z][A-Za-z0-9]{0,31}$`, `maxLength` entre 1 y 4096 y un `pattern` que compile.
  - Si algo no cumple: `internal` y la sesión se cierra.
- **Validación de la entrada:**
  - `stepId` debe ser el paso actual, o da `rejected`.
  - El tipo de entrada debe corresponder al paso:
    - `info`, o `open-external` con `awaits: 'input'` sin campos: `continue`;
    - paso con campos: `fields`;
    - `open-external` con `awaits: 'callback'`: solo por la ruta de vuelta.
  - `fields`: exactamente los nombres declarados. Se aplica `extract`, se recortan espacios y se comprueba `maxLength` y `pattern` anclado en el servidor, aunque la web ya lo haga.
  - La vuelta: como mucho 32 parámetros, nombres `^[A-Za-z0-9._-]{1,64}$` y valores de hasta 2048 caracteres sin caracteres de control.
  - Los valores de campos `secret` no se registran nunca.
- **Llamadas al conector:** con un tiempo máximo de 30 s.
  - Un `ConnectorError` da `rejected` en el mismo paso, con `code` y `key`.
  - Otra excepción da `internal` y cierra la sesión.
- **Al terminar (`done`):**
  - `store_connections` pasa a `connected` con `connected_at`.
  - Se borra la sesión.
  - Se programa la operación `library` de esa tienda **forzada**, sin el suelo de la decisión 50: es la primera.
- **Fachada** (amplía `LudiaryCore` de la decisión 72):

```ts
// packages/core/src/env.ts — additions of ADR 74
export type WizardResponse =
  | WizardStep | WizardDone
  | { kind: "rejected"; stepId: string; error: CoreErrorInfo };

export interface LudiaryCore {
  // ...ADR 72...
  /** returnBase: "http://<validated Host>", no path. 404 not-found if the store has no `connection`. */
  startWizard(store: StoreId, returnBase: string): Promise<{ wizardId: string; response: WizardResponse }>;
  submitWizard(wizardId: string, stepId: string, input: WizardInput): Promise<WizardResponse>; // input.kind !== 'callback'
  wizardCallback(wizardId: string, query: Readonly<Record<string, string>>): Promise<{ store: StoreId; response: WizardResponse }>;
  cancelWizard(wizardId: string): Promise<void>;
  disconnect(store: StoreId): Promise<void>;
}

export interface CoreDeps {
  // ...ADR 72, 73...
  cipher: SecretCipher;                 // ADR 46, 74
  secrets: SecretRepository;
  connections: ConnectionRepository;
  /** ADR 73, plus maxBytes: the core passes 16 MiB for listLibrary, 2 MiB otherwise. */
  http?: (hosts: readonly string[], signal: AbortSignal, log: ConnectorLogger, opts?: { maxBytes?: number }) => HttpClient;
}
```

- **API** (todas `session+key`, porque aceptan secretos o cambian datos, decisión 67; TypeBox con `additionalProperties: false`):

| Método y ruta | Cuerpo → respuesta |
|---|---|
| `POST /api/stores/:store/wizard` | `{}` → `201 WizardStartDto { wizardId, response: WizardResponseDto }`. `returnBase` sale del `Host` ya validado, nunca del cuerpo. |
| `POST /api/wizards/:wizardId/submit` | `WizardSubmitDto { stepId, input }`, con `input.kind` en `continue` o `fields`, como mucho 8 valores de hasta 4096 caracteres → `200 WizardResponseDto`. |
| `POST /api/wizards/:wizardId/callback` | `WizardCallbackDto { query }`, con los límites de la vuelta → `200 { store, response: WizardResponseDto }`. |
| `DELETE /api/wizards/:wizardId` | → 204, también si ya no existe. |
| `DELETE /api/stores/:store/connection` | → 204 (punto 9). |

  - Un asistente desconocido o caducado da `404 not-found`; la web lo muestra como «El asistente ha caducado, vuelve a empezar».
  - `LaunchRequestDto` añade `action?: 'play' | 'install'`; si falta, vale `play`.
  - `GameSummaryDto` añade `mainAction: 'play' | 'install' | null`.
- **Web: de simulador a real solo para Steam** (revisa el punto 7 de la decisión 72 en este método):
  - `real.ts`:
    - `startWizard`, `submitWizard`, `cancelWizard` y `disconnect` van a la API cuando `target` es `{ kind: 'store', store: 'steam' }`; las demás tiendas y los servicios siguen delegados en el simulador.
    - Guarda el `wizardId` en `sessionStorage` (`ludiary.wizardId.steam`; hoy solo Steam tiene asistente con redirección), no en memoria: tiene que sobrevivir al viaje a Steam en la misma pestaña. No es un secreto (sin cookie y clave de origen no sirve) y desaparece al cerrar la pestaña. La vuelta comprueba además que coincide con el `w` de la URL.
    - Añade `wizardCallback(wizardId, query)`.
    - `getStores` deja de superponer el estado simulado sobre Steam.
  - `ConnectWizard.tsx`:
    - Acepta `resume?: { target, response }` para continuar sin `startWizard`.
    - En `awaits: 'callback'`, fuera del simulador, pinta un enlace en la misma pestaña («Iniciar sesión en Steam»). Antes de seguirlo guarda en `sessionStorage['ludiary.wizardReturn']` solo `'welcome'` o `'settings'`, ningún dato de Steam.
    - El botón «Steam sin clave» cancela y cierra.
  - Página nueva `/connect/return` (y su ruta en `router.ts`):
    - Hace lo del punto 3 y muestra `ConnectWizard` con `resume`.
    - Al terminar o cancelar, vuelve a `/welcome`, en el paso Tiendas, o a `/settings/stores`, según `ludiary.wizardReturn` (lista cerrada; por defecto, Ajustes), y borra esa entrada.
  - Los textos `connectors.steam.*` pasan a `connectors/steam/locales/` si aún no están allí (decisión 72). Claves nuevas:
    - `connectors.steam.error.openid`, `connectors.steam.error.key` y `connectors.steam.login.cancelled`;
    - `connectors.steam.disconnect.revokeHint` («Ludiary borra la clave; para anularla en Steam, pulsa Revoke en steamcommunity.com/dev/apikey»);
    - `library.action.install`, `game.installing` y `wizard.expired`.

#### 6. Secretos (decisión 46, mínimo de este corte)

- **Puerto** en `packages/contracts/src/ports.ts` (lo previó la decisión 38). Implementación en `packages/platform-node/src/cipher.ts` con `node:crypto`:

```ts
/** ADR 46, 74. AES-256-GCM. aad = `${userId}|${scope}|${name}`. */
export interface SecretCipher {
  /** Slot n of the credential master-key/<n> (ADR 64). */
  readonly activeKeyId: number;
  /** `v1.<keyId>.<nonce base64url>.<ciphertext+tag base64url>`, fresh random 12-byte nonce per call, 16-byte tag. */
  encrypt(plaintext: string, aad: string): string;
  /** 'other-key': written under another slot (compartment, ADR 64). 'invalid': bad format, tag or AAD. */
  decrypt(blob: string, aad: string): { ok: true; value: string } | { ok: false; reason: "other-key" | "invalid" };
}
// platform-node
export function createSecretCipher(key: { id: number; value: Uint8Array }): SecretCipher; // throws unless 32 bytes
// contracts (pure): toString()/toJSON() give "[redacted]"
export function makeSecret(value: string): Secret;
```

  - El análisis es estricto: cuatro partes, `v1`, `keyId` entre 1 y 16, nonce de exactamente 12 bytes y cifrado de al menos 16. Cualquier otra cosa es `invalid`.
  - `runtime` crea el cifrador con la clave que ya carga `loadMasterKey` (id y valor) y lo pasa a `createCore`.
- **Migración `0002_store_account`** (decisión 47; la copia previa de la 57 la hace ya el migrador). Nombre: drizzle-kit numera los ficheros desde 0000, así que el fichero es `packages/db/drizzle/0001_store_account.sql` y el id registrado en `schema_migrations` es `0002_store_account` (`embed-migrations.mjs` suma uno, como con `0001_library_scan`).
  - `secrets`: `id`, `user_id`, `scope`, `name`, `ciphertext`, `key_id` (entero), `updated_at`. Único por (`user_id`, `scope`, `name`).
  - `store_connections`: `user_id`, `store`, `status` (`connected` / `expired`, con `CHECK`), `account_label` (nulo), `connected_at`. Clave primaria (`user_id`, `store`). Sin fila, la tienda está desconectada.
  - `game_properties` añade `store_playtime_minutes` y `store_last_played_at`, enteros nulos; las fechas en milisegundos (decisión 47).
- **Almacén por conector** (`packages/core/src/vault.ts`): implementa `SecretVault` sobre `SecretRepository` y `SecretCipher`, con ámbito `store:<id>` y AAD `user_id|ámbito|nombre`.
  - `set` cifra y hace un upsert.
  - `get`:
    - sin fila: `null`;
    - `key_id` distinto de la clave activa: `null`. La fila **no se toca**: es un compartimento (decisión 64) y se registra un aviso sin el nombre del secreto;
    - `invalid` con la clave activa (clave perdida y recreada en el mismo hueco, o AAD manipulado): se **borra** la fila, se registra un aviso y devuelve `null` (decisión 46);
    - en otro caso, `makeSecret(valor)`.
  - Reconectar sobrescribe la fila del compartimento con el mismo nombre. Es una acción explícita del usuario y se acepta.
- **Estado que se muestra:**
  - Sin fila en `store_connections`: `disconnected`.
  - Con fila: el núcleo llama a `connection.status`. Steam devuelve `connected` si lee `steamId` y `apiKey`, y `expired` si no; es local, sin red.
  - Se combina con `store_connections.status`: si cualquiera dice `expired`, se muestra `expired`.
  - `mode` es `library` si está `connected` e `installed-only` en otro caso.
- **Registros** (decisiones 35 y 40, regla 6): `makeRedactor` de `runtime/src/files.ts` añade dos patrones que sustituye por `[redacted]`: `\b[0-9A-Fa-f]{32}\b` (forma de la API key) y `\b7656119\d{10}\b` (SteamID64). Es la red bajo `Secret`. Se acepta que tape algún hash legítimo de 32 caracteres hexadecimales.

#### 7. Biblioteca

- **Conector** (`connectors/steam/src/library.ts`):
  - `listLibrary` hace `GET https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/`:
    - cabecera `x-webapi-key` con el `Secret` (vía oficial según la página de autenticación de Steamworks; supuesto S4 para las claves de usuario; plan de reserva: parámetro `key` como `Secret`);
    - consulta: `steamid`, `include_appinfo=true`, `include_played_free_games=true`, `skip_unvetted_apps=false` (supuesto S8) y `format=json`.
  - Sin `steamId` o sin `apiKey` legibles: `auth.required`.
  - Respuesta:
    - 401 o 403: `auth.invalid`.
    - 429: `store.rate-limited` con `Retry-After`.
    - Cualquier otro estado distinto de 200: `store.unexpected-response`.
    - `response` sin `game_count`: `account.private-profile` (supuesto S5).
  - Por juego:
    - `appid` entero entre 1 y 2³²−1;
    - `name`, o `Steam <appid>` si falta;
    - `playtime_forever` (minutos, entero ≥ 0) → `storePlaytimeMinutes`;
    - `rtime_last_played` (segundos; 0 es nunca) → `storeLastPlayedAt` en ISO;
    - `media` con las URL por AppID de la decisión 71;
    - se excluyen los AppID de `EXCLUDED_APP_IDS`.
  - `complete` vale `games.length === game_count`.
- **Manifiesto de Steam:**
  - `library: true`, `actions: ['play', 'install']`, `storePlaytime: true`;
  - `authHosts: ['steamcommunity.com']`;
  - `apiHosts: ['api.steampowered.com', 'steamcommunity.com']`; el segundo es para `check_authentication`;
  - `connection` y `listLibrary`.
  - `dlc: 'none'`, `uriSchemes: ['steam']` y `minSyncIntervalMs: 600_000` no cambian.
  - `checkConnectorManifest` añade dos reglas: un conector con `connection` tiene `authHosts` no vacío, y uno con `library` tiene `apiHosts` o `externalTools` no vacíos.
- **Núcleo, operación `library`** (cierra «`requestSync` solo implementa `scan`» de la decisión 72):
  - **Quién:** conectores con `library` y fila `connected` en `store_connections`.
  - **Orden:** en la cola por tienda que ya existe, `library` antes que `scan`, nunca a la vez. Así no se pisan las escrituras de propiedades, y el escaneo engancha las instalaciones a las propiedades poseídas.
  - **Cuándo** (decisión 50):
    - El botón manual respeta el suelo de 10 minutos desde el último intento.
    - `trigger: 'open'` sincroniza solo si la última sincronización correcta tiene más de 6 horas (constante del núcleo por tienda: 6 h para Steam y 12 h para GOG y Epic).
    - Tras un error, el intento automático espera el doble del suelo (20 minutos).
    - Tiempo máximo de 60 s.
  - **Validación:**
    - las mismas reglas que las entradas del escaneo (ID, título y medios en `mediaHosts`);
    - `storePlaytimeMinutes` entero entre 0 y 10⁸;
    - `storeLastPlayedAt` como fecha ISO válida;
    - como mucho 50 000 entradas;
    - una entrada `dlc` sin la capacidad se descarta.
  - **Plan en una transacción** (`applyLibraryPlan`):
    - Mismo AppID = misma propiedad, por el índice único (`user_id`, `store`, `store_game_id`). Una propiedad que ya existía por el escaneo pasa a `owned = 1`, `removed_at = null`, y actualiza título, tiempo, última partida y `store_metadata.media`, conservando `resolvedMedia` (decisión 73).
    - Una propiedad nueva crea su canónico, con la regla de una sola tienda de la 72.
    - El título del canónico sigue al de su propiedad de Steam. El escaneo deja de sobrescribir el título de una propiedad con `owned = 1`: el de la API es mejor que el `name` del manifiesto.
    - Con `complete: true`, las propiedades con `owned = 1` ausentes pasan a `owned = 0`, y a `removed_at` si no tienen instalación.
    - **Guarda:** una instantánea completa y **vacía**, con propiedades poseídas en la base, se trata como `complete: false` y se registra un aviso. Steam devuelve a veces respuestas vacías en perfiles públicos (supuesto S5), y una así no debe vaciar la biblioteca.
  - **Errores:**
    - `auth.invalid` o `auth.expired`: `store_connections.status = 'expired'`.
    - `account.private-profile`: error de la sincronización con su clave traducida.
    - En ningún caso se toca la biblioteca.
  - **Tras una sincronización correcta:** el paso de medios de la decisión 73, con las mismas reglas. Así resuelve las portadas con hash de los juegos no instalados.
- **Tiempo de juego** (decisión 56):
  - El tiempo de una propiedad es el mayor entre `store_playtime_minutes` y el tiempo propio. El propio vale 0 hasta el corte 2b.
  - El total del canónico es la suma de sus propiedades no retiradas; `lastPlayedAt`, la más reciente.
  - La ficha muestra el tiempo de Steam.
- **Acciones:**
  - `mainAction`: `play` si hay una instalación y el modo puede lanzar; si no, `install` si alguna propiedad poseída la ofrece; si no, `null`.
  - El núcleo (`core.ts` y `launch.ts`) admite `install` con las mismas comprobaciones que `play` (capacidad, tipo, esquema, doble clic en 5 s), pero exige que la propiedad **no** esté instalada y tenga `owned = 1`.
  - Steam: `resolveAction('install')` devuelve `steam://install/<appId>`, con la misma comprobación de dígitos y de `launcher-missing` que `play` (supuesto S9: abre el diálogo de instalación de Steam y no instala nada sin confirmar).
  - La web pinta «Instalar» y, al pulsar, «Abriendo Steam…».

#### 8. `HttpClient` (amplía el de la decisión 73)

- `POST` con `body: { form }`, que se envía como `application/x-www-form-urlencoded`, o `{ json }`. Un `GET` con cuerpo es `internal`.
- Los `Secret` del formulario, de la consulta o de las cabeceras se revelan solo al enviar.
- **Cabeceras del conector:**
  - nombres `^[a-z0-9-]{1,64}$`;
  - prohibidas `host`, `cookie`, `content-length`, `connection` y `transfer-encoding`;
  - valores sin CR ni LF.
  - Se suman a `accept: application/json`.
- Opción `maxBytes` por cliente: 16 MiB para `listLibrary`; 2 MiB, el valor por defecto, para lo demás. Por ejemplo, 10 000 juegos con `include_appinfo` ocupan del orden de 1,5 MB.
- Lo demás no cambia: hosts exactos de `apiHosts`, sin redirecciones, el error del `signal`. El registro sigue con método, host, ruta, estado y duración; **nunca** consulta, cabeceras ni cuerpo.

#### 9. Desconectar y caducidad

- **Desconectar** (`DELETE /api/stores/steam/connection`), en este orden:
  1. `connection.disconnect`, que borra `steamId` y `apiKey` de su almacén.
  2. El núcleo borra además todo el ámbito `store:steam`, incluidos los compartimentos.
  3. Borra la fila de `store_connections` y la de `sync_state` de `library`, para que una reconexión sincronice enseguida.
  4. Aplica lo que decida el usuario sobre los juegos no instalados (punto 12). Recomendado: las propiedades de Steam pasan a `owned = 0`, y a `removed_at` las que no tienen instalación, como en el escaneo. Los canónicos y los datos del usuario no se borran y reaparecen al reconectar.
- La web recuerda con `connectors.steam.disconnect.revokeHint` que la clave sigue viva en Steam hasta que se revoca allí.
- **Clave revocada o mal copiada:** `GetOwnedGames` responde 401 o 403. La tienda pasa a `expired`, la biblioteca se queda como estaba y la tarjeta muestra «Hay que volver a conectar» con el botón del asistente (la pantalla que ya existe para la sesión caducada simulada de Epic). Reconectar sobrescribe los secretos.
- **Clave maestra perdida o compartimento** (punto 6): el mismo estado `expired`, sin red y sin tocar la biblioteca.

#### 10. Pruebas

- **`connectors/steam`**, con respuestas grabadas sanitizadas (decisiones 19 y 48):
  - SteamID ficticio `76561190000000000`, que cumple el patrón pero no es de nadie.
  - Clave `0123456789abcdef0123456789abcdef`.
  - Ningún nombre de cuenta.
  - La comprobación de fixtures acepta **solo** esos dos valores literales y sigue rechazando cualquier otro `7656119\d{10}` o hexadecimal de 32 caracteres.
  - OpenID:
    - firma inválida (`is_valid:false`);
    - respuesta con `is_valid:true` como subcadena de otra línea;
    - `return_to` ajeno, o con otro `w`;
    - `op_endpoint` distinto;
    - `claimed_id` de otro host o con `identity` distinta;
    - `signed` sin `return_to`;
    - nonce caducado o del futuro;
    - `mode=cancel`;
    - la URL de ida con `realm` igual al origen de `callbackUrl`;
    - el POST lleva exactamente los `openid.*` recibidos, con `mode` cambiado.
  - Clave:
    - formato y recorte de espacios;
    - 401 y 403 → `rejected`;
    - perfil privado → `profile` y reintento;
    - éxito → dos `secrets.set` y `done`;
    - la clave viaja en `x-webapi-key` y no en la URL.
  - `listLibrary`:
    - biblioteca normal, `game_count` distinto del número de juegos (`complete: false`), `{}` (privado), 403, 429 y 500;
    - AppID fuera de rango, nombre ausente, `rtime_last_played` igual a 0, `228980` excluido.
  - `resolveAction('install')`.
  - Conformidad con las reglas nuevas del manifiesto.
- **`platform-node`:**
  - `cipher.ts`:
    - ida y vuelta;
    - nonce distinto en cada cifrado;
    - AAD manipulado (otro `user_id`, otro ámbito, otro nombre) → `invalid`;
    - un byte del cifrado o de la etiqueta cambiado → `invalid`;
    - `keyId` de otro hueco → `other-key`;
    - formatos rotos → `invalid`;
    - clave de tamaño distinto de 32 → error al crear.
  - `http.ts`:
    - POST con formulario y con JSON;
    - `Secret` en cabecera, formulario y consulta, revelado solo en la petición enviada;
    - cabeceras prohibidas o con CR/LF rechazadas sin llamar a `fetch`;
    - `maxBytes` por cliente;
    - el registro no contiene ni la clave ni el cuerpo.
- **`core`:**
  - Motor de asistentes:
    - paso fuera de turno;
    - campos de más o de menos;
    - `pattern` en el servidor;
    - URL fuera de `authHosts` → `internal`;
    - vuelta repetida → `rejected`;
    - asistente caducado (reloj doble) y tope de 4;
    - abrir uno nuevo cancela el anterior;
    - `done` → `connected` y sincronización forzada.
  - Almacén:
    - clave perdida (fila cifrada con otra clave del mismo hueco) → fila borrada y `expired`;
    - compartimento → fila conservada y `expired`;
    - el AAD incluye el `user_id`.
  - Biblioteca:
    - fusión con la propiedad escaneada (mismo AppID);
    - `complete: false` no da de baja;
    - instantánea vacía con poseídos → no da de baja;
    - suelo, 6 horas al abrir y doble del suelo tras error;
    - `auth.invalid` → `expired`;
    - `library` y `scan` nunca a la vez;
    - el escaneo ya no sobrescribe el título de una propiedad poseída.
  - `install`: rechazado si está instalado o no es poseído; doble clic.
  - Tiempo: mayor por propiedad y suma por canónico.
  - `disconnect`: borra el ámbito y aplica la regla del punto 12.
- **`db`:**
  - `0002` desde una base con `0001` (copia previa hecha);
  - índice único de `secrets`;
  - `CHECK` de `store_connections`;
  - filtro de `user_id` en todo lo nuevo (decisión 47).
- **`api`:**
  - Las rutas nuevas sin clave de origen → 401 `origin_key_required`.
  - Campos de más → 400.
  - `returnBase` sale del `Host` y no del cuerpo.
  - Una petición de vuelta con más de 32 parámetros → 400.
  - Ninguna respuesta lleva la clave ni el SteamID: comprobado con una búsqueda sobre todas las respuestas de la prueba.
  - `LaunchRequestDto` con `action: 'install'`.
- **`runtime`:** el redactor tapa una clave y un SteamID dentro de un mensaje.
- **Web:**
  - `real.ts` envía Steam a la API y el resto al simulador.
  - `/connect/return` borra la consulta antes de llamar y envía solo `openid.*`.
  - `ludiary.wizardReturn` fuera de la lista cerrada → Ajustes.
  - El enlace de OpenID abre en la misma pestaña.
  - El botón Instalar.
- **Playwright:** el asistente completo contra un Steam doble (OpenID y `GetOwnedGames` grabados) → biblioteca con juegos no instalados → Instalar graba `steam://install/<id>`. Desconectar los retira.
- **Pruebas manuales del usuario** (las prepara el tester):
  - conectar con su cuenta real en Chrome, Edge y Firefox, por `ludiary.localhost` y por `127.0.0.1`;
  - perfil con detalles de juego privados y luego públicos;
  - clave revocada en Steam → `expired` y reconectar;
  - Instalar un juego no instalado;
  - tiempos de juego coherentes con los de Steam;
  - borrar a mano `master-key/1` en el Administrador de credenciales → `expired` sin perder la biblioteca;
  - el registro exportado no contiene la clave, el SteamID ni `openid.*`.

#### 11. Orden de implementación y trabajo en paralelo

1. **Primero, y bloquea lo demás** (`programador`, pequeño): `contracts` (`SecretCipher`, `makeSecret`, `fields` en `open-external`, `WizardContext.now`, reglas del manifiesto) y `api-contract` (DTO del punto 5).
2. **En paralelo**, cada parte contra dobles:
   - `conectores`: `openid.ts`, el asistente, `library.ts`, `install` y las respuestas grabadas. Solo necesita `contracts` y el `fakeHttp` de `connector-testkit`, que añade `wizardContext()` y `syncContext()`.
   - `programador` A: `platform-node` (`cipher.ts` y `http.ts`).
   - `programador` B: `db` (migración `0002` y repositorios).
   - `programador` C: `core` (motor, almacén, operación `library`, `install` y tiempo).
   - `programador` D: la web contra el simulador, adaptado a los DTO nuevos.
   - `auditor`: revisión de este diseño (OpenID, almacén y rutas) antes de que haya código, para que los cambios salgan baratos.
3. **Después:** rutas de `api` y conexión en `runtime` (cifrador desde `loadMasterKey`, redactor y `http` con `maxBytes`), Playwright y la revisión del `auditor` sobre el código (cifrado, almacén, vuelta de OpenID, `http.ts`, registros, fixtures y la comprobación de la 67).
4. **Al final:** pruebas manuales del usuario con su cuenta y el `documentalista`:
   - guía con capturas para crear la clave y hacer públicos los detalles de juego (decisión 43);
   - privacidad: qué sale hacia Steam (SteamID, clave y la petición de la 73);
   - solución de problemas: «Hay que volver a conectar» y el perfil privado.

#### 12. Lo que decide el usuario

**Respuestas del usuario (22 de octubre de 2026):**

- **Punto 1: opción nueva (c).** Al desconectar, los juegos de Steam no instalados **se quedan visibles con un velo gris** que aclara que no están sincronizados. Concreción:
  - Desconectar **no toca las propiedades** ni los canónicos: solo borra los secretos del ámbito `store:steam`, la fila de `store_connections` y el `sync_state` de `library` (pasos 1 a 3 del punto 9). El paso 4 del punto 9 queda sustituido por esto.
  - El velo se calcula al leer, sin columna nueva: un juego lleva `unsynced: true` en `GameSummaryDto` y `GameDetailDto` cuando todas sus propiedades que no están instaladas son de una tienda cuya conexión no está `connected` (desconectada o `expired`). Un juego instalado nunca lleva velo.
  - La web pinta la portada atenuada en gris con el texto traducido `library.unsynced` («Sin sincronizar: conecta tu cuenta de Steam para actualizarlo») y mantiene la ficha accesible. Las acciones de tienda de esos juegos siguen disponibles.
  - Al reconectar, la primera sincronización de `library` actualiza o retira lo que haya cambiado mientras tanto, con las reglas normales (instantánea completa, guarda de la respuesta vacía).
  - Lo mismo vale para el estado `expired` (clave revocada o clave maestra perdida).
- **Punto 2: opción (b) con datos mínimos.** Se muestra «Conectado como <nombre>». Al conectar se llama una vez a `ISteamUser/GetPlayerSummaries` y **solo se guarda `personaname`**, en `store_connections.account_label`; nada más del perfil (ni avatar, ni nombre real, ni país, ni URL del perfil). No se registra nunca. Se refresca solo al volver a conectar. Si la llamada falla, la conexión sigue adelante sin nombre («Conectado»).
- **Identificación de la cuenta:** el usuario confirma OpenID frente a pegar la URL del perfil.
- **Comprobación previa del supuesto S1 (22-10-2026):** una petición `checkid_setup` con `realm` `http://ludiary.localhost:<puerto>/` devuelve la misma página de inicio de sesión de Steam que con un `realm` público (`https://example.com/`). Falta comprobar la vuelta tras iniciar sesión, que es la primera prueba manual del usuario.

1. **Al desconectar Steam**, los juegos que no están instalados:
   - (a) desaparecen de la biblioteca y vuelven al reconectar, con sus favoritos y datos (recomendado: la biblioteca refleja lo que Ludiary sabe que posee);
   - (b) se quedan visibles hasta borrarlos a mano.
2. **Nombre de la cuenta en Ajustes** («Conectado como …»):
   - (a) no, solo «Conectado» (recomendado en este corte: cero llamadas y cero datos personales de más);
   - (b) sí, con una llamada a `ISteamUser/GetPlayerSummaries` al conectar, guardando `personaname` en `store_connections.account_label`, que nunca se registra.

#### Supuestos de Steam (verificar al implementar; los marcados con «sin verificar» no se han comprobado)

- **S1 (sin verificar):** Steam acepta `openid.realm=http://ludiary.localhost:<puerto>/` y `http://127.0.0.1:<puerto>/`. Las librerías de la comunidad usan `http://localhost:<puerto>` sin problema (`steam-openid-php`, `passport-steam`); `.localhost` como subdominio no está comprobado. Si falla, se prueba solo con `127.0.0.1` y, en último caso, el plan B del punto 2.
- **S2:** `check_authentication` responde texto `clave:valor` por líneas, con `ns:` e `is_valid:true`. Coincide con la especificación de OpenID 2.0 y con las librerías de la comunidad; no hay documentación de Valve.
- **S3 (sin verificar):** si Steam rechaza un `response_nonce` ya verificado. No se depende de ello.
- **S4:** la clave puede ir en la cabecera `x-webapi-key`. Lo dice la página de autenticación de Steamworks («as a standard parameter or by setting the 'x-webapi-key' request header value»). Falta comprobar que vale para las claves de usuario en `api.steampowered.com`; si no, se usa el parámetro `key` como `Secret`.
- **S5:** `GetOwnedGames` (documentado en Steamworks con `key`, `steamid`, `include_appinfo`, `include_played_free_games` y `appids_filter`) solo devuelve juegos si los detalles de juego son visibles. Con el perfil privado responde `{"response":{}}`, según la comunidad, y la misma respuesta aparece a veces en perfiles públicos. No incluye DLC (sin verificar).
- **S6 (sin verificar):** una clave revocada o inválida da 403, o según algunos 401. Se tratan los dos igual.
- **S7 (sin verificar):** el límite de 100 000 llamadas al día por clave (decisión 50). Este corte hace como mucho unas pocas llamadas cada 10 minutos.
- **S8 (sin verificar):** `skip_unvetted_apps=false` hace aparecer juegos con perfil limitado. Dato de la comunidad; si Steam lo ignora, no cambia nada.
- **S9 (sin verificar):** `steam://install/<appId>` abre el diálogo de instalación del cliente (wiki comunitaria de Valve).
- **S10:** las peticiones `fetch` de una página a la que se llegó desde otro sitio llevan la cookie `SameSite=Strict` de su propio origen. Es el comportamiento estándar. Comprobado por el usuario el 22-10-2026; sin plan de reserva (decisión 74).
- **S11 (sin verificar):** el campo de dominio de la página de la clave acepta `localhost` (decisión 69).
- **S12:** `playtime_forever` va en minutos y `rtime_last_played` en segundos Unix.

**Motivo:** es el mínimo que cierra el camino completo de la decisión 43 con la vía oficial de Steam, sin rutas públicas nuevas: la vuelta de OpenID entra por la SPA y una ruta `session+key`, así que hereda la clave de origen de la 67. Las sesiones del asistente en memoria evitan cifrar estado temporal. El `SecretCipher` y el almacén son los de la 46 sin la rotación, que el formato ya admite. La operación `library` reutiliza la cola por tienda, la validación, el plan transaccional y el paso de medios que ya existen. Mismo AppID = misma propiedad sale gratis del índice único. Alternativas descartadas:

- pegar el perfil en lugar de OpenID (punto 2);
- abrir OpenID en otra pestaña y coordinarlas (polling o `BroadcastChannel`: más código para el mismo resultado);
- una ruta pública `/openid/return` que procese la aserción (superficie sin clave de origen);
- persistir el estado del asistente cifrado (disco para datos de 15 minutos);
- un filtro de registros por valores conocidos (los patrones cubren la clave y el SteamID con menos código).

**Consecuencias:**

- Segunda salida de red, y la primera con un secreto. El `auditor` revisa antes de cerrar:
  - `cipher.ts` y `vault.ts`;
  - la verificación de OpenID y `/connect/return`;
  - las rutas nuevas y su nivel de acceso;
  - el POST y las cabeceras de `http.ts`;
  - el redactor y las fixtures.
- El punto 7 de la decisión 72 queda revisado para Steam: sus asistentes y `disconnect` dejan de delegarse en el simulador.
- `apiHosts` de Steam incluye `steamcommunity.com`, solo para `check_authentication`. `mediaHosts` y la CSP no cambian: la verificación la hace el servidor.
- El documentalista actualiza las guías del punto 11.
- Si el usuario elige (b) en el punto 12.2, `store_connections.account_label` ya existe y no hace falta migración.

### 75. Portadas guardadas en el equipo y servidas por el servidor local (descartada)

**Estado: descartada por el usuario el 22 de octubre de 2026. No se implementa; la decisión 71 sigue vigente tal cual.** Se conserva el diseño de abajo como alternativa estudiada, por si en el futuro hiciera falta (por ejemplo, ver las portadas tras borrar los datos del navegador o desde otro navegador).

**Motivo del descarte:** la petición era no tener que llamar a Steam cada vez. Comprobado el 22-10-2026 con `curl -sI` sobre `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/library_600x900.jpg`: Steam sirve las portadas con `Cache-Control: public, max-age=315103098` (unos 10 años, `Expires` en 2036), `ETag` y `Last-Modified`. El navegador descarga cada portada **una sola vez** y la sigue mostrando sin conexión; solo vuelve a pedirla si se borra su caché o se usa otro navegador. Las direcciones (`GetItems`, decisión 73) solo se consultan para juegos nuevos o cada 30 días. Con eso, el código de esta decisión (ruta nueva con nivel `session`, validación de imágenes, limpieza, carpeta de 50–100 MB por cada 1000 juegos y otra auditoría) no compensa.

**Petición del usuario (22 de octubre de 2026):** que Ludiary guarde las portadas en el equipo, «para no tener que llamar a Steam cada vez para sacar imágenes».

**Decisión (recomendada, 22 de octubre de 2026):**

#### 1. Qué pasa hoy

- **El servidor de Ludiary no descarga imágenes.** Solo llama a `GetItems` (decisión 73) para las propiedades pendientes: las que no tienen `mediaResolvedAt` o lo tienen con más de 30 días. Lo hace al final de un escaneo o de una sincronización de biblioteca, en lotes de 50. Con la biblioteca ya resuelta, abrir la web no hace ninguna llamada a `GetItems`.
- **El navegador carga cada portada del CDN de Steam** (decisión 71). Si la vuelve a pedir depende de su caché HTTP y de las cabeceras que envía Steam: mientras la copia sigue fresca no sale nada; cuando caduca, el navegador vuelve a preguntar a Steam o la descarga de nuevo. Si se borra la caché del navegador, se cambia de navegador o falta espacio, se descargan otra vez. Sin conexión y con la copia caducada, sale el degradado.
- **La percepción del usuario es correcta en parte.** No hay una llamada a Steam por cada imagen en cada visita, pero las portadas dependen de la caché del navegador, que Ludiary no controla, y sin conexión pueden desaparecer.
- **Supuesto sin verificar:** no se pudieron leer las cabeceras de caché de `shared.akamai.steamstatic.com`, porque la herramienta de consulta no muestra cabeceras. Quien implemente lo comprueba con `curl -sI https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/library_600x900.jpg` y lo anota aquí. No cambia la decisión: la caché local no depende de esas cabeceras. Medido el 22 de octubre de 2026: esa portada (620) ocupa 51,5 KB.

#### 2. Quién descarga, cuándo y qué

- **El servidor**, desde el núcleo, con el `HttpClient` de la decisión 73 creado con los **`mediaHosts`** del conector dueño de la propiedad, no con sus `apiHosts`. Así no se toca la lista de ningún conector. Se conservan las reglas: solo `https`, hosts exactos, sin redirecciones (una redirección cuenta como fallo y no se sigue), tope de 2 MiB por respuesta y el `signal` del paso.
- **Cuándo:** un **paso de portadas** justo después del paso de medios de la decisión 73, en la misma ejecución y en la misma cola por tienda. Se ejecuta al final del escaneo y tras una sincronización de biblioteca correcta, y un fallo nunca cambia el resultado de la operación.
  - Pendientes: propiedades no retiradas, de tipo `game`, con URL de medios efectiva (la precedencia por campo de la 73) y en alguno de estos casos:
    - sin copia;
    - con una URL distinta de la que se copió (nueva ruta con hash o nuevo `?t=`);
    - con su fichero ausente del disco;
    - con un fallo de hace más de 30 días.
  - Descargas en serie, como mucho 300 por ejecución y 30 s en total (`Clock.timeout`). Lo que no entre queda para la siguiente ejecución, y mientras tanto el navegador sigue usando el CDN.
  - Por propiedad se guarda **una sola imagen**: se prueba la portada vertical (`coverUrl`) y, si responde 403, 404 o 410, la horizontal (`heroUrl`). Si ninguna existe o lo recibido no es una imagen admitida, se anota el fallo y no se reintenta hasta pasados 30 días o hasta que cambie la URL.
  - Un 429, un 5xx, un error de red o el tiempo agotado paran el paso: no se reintenta hasta pasado el mayor entre `minSyncIntervalMs` y `Retry-After` (como mucho un día), en memoria, igual que el paso de medios.
- **Petición:** `GET` con `accept: image/jpeg, image/png, image/webp` y nada más. El tipo de contenido que responda el CDN no se usa: decide la firma de los primeros bytes.
- **Alcance (invariante 9 y decisión 71):** solo las URL que ya están en la base y que ya validó `validateMedia` contra los `mediaHosts` del conector de esa propiedad. Un juego que solo es de GOG o de Epic nunca pide nada a Steam.
- **Descartadas:**
  - Descargar la primera vez que la web pide la imagen: mete llamadas de red en una petición del navegador y obliga a gestionar la concurrencia y los tiempos en la ruta.
  - Una cola permanente en segundo plano: las ejecuciones de escaneo y sincronización ya son la cola, y tienen su orden y sus límites.

#### 3. Dónde y cuánto

- **Carpeta:** `%LOCALAPPDATA%\Ludiary\covers\` (`join(platform.dataDir, 'covers')`), plana, sin subcarpetas.
- **Nombre:** `<sha256 del contenido en hexadecimal>.<jpg|png|webp>`. El nombre sale solo de los bytes, nunca de la URL ni de la petición. Dos juegos con la misma imagen comparten fichero.
- **Escritura atómica:** primero `<nombre>.tmp` y después `rename`.
- **En la base, sin migración:** `StoreMetadataJson` (decisión 73) añade `cover`, en la misma propiedad que da los medios (hoy la de Steam):

```ts
// packages/db/src/schema.ts — StoreMetadataJson, addition of ADR 75
cover?:
  | { url: string; file: string; kind: 'cover' | 'hero'; at: number } // url = coverUrl tried first (change key)
  | { url: string; failedAt: number };                                  // neither image usable
```

  - Los `update` del plan de escaneo y de `applyLibraryPlan` conservan `cover`, igual que `resolvedMedia` (decisiones 73 y 74).
- **Tamaño:** como mucho 2 MiB por fichero. No hay tope total: con unos 50 a 100 KB por portada de Steam, 1000 juegos ocupan del orden de 50 a 100 MB. `shortcut: sin tope total, se añade uno si alguien pasa de 10 000 juegos o lo pide.`
- **Limpieza:** al final de cada paso de portadas se borran los ficheros de la carpeta que cumplen `^[0-9a-f]{64}\.(jpg|png|webp)$` y que no usa ninguna propiedad no retirada del usuario, y también los `.tmp` sobrantes. No se toca nada que no cumpla el patrón y no se recorren subcarpetas. Desconectar Steam no retira propiedades (decisión 74, punto 12), así que sus portadas se quedan.
- **Copias de seguridad (decisión 57):** no se incluyen. Se pueden regenerar y la copia es solo de la base de SQLite. Si se restaura una base que apunta a ficheros que ya no existen, el paso siguiente los descarga de nuevo (caso «fichero ausente») y mientras tanto la web usa el CDN.
- **Desinstalar:** «borrar los datos» ya elimina toda la carpeta `%LOCALAPPDATA%\Ludiary` (decisión 57), portadas incluidas. Sin esa opción se conservan, como la base.

#### 4. Cómo se sirven

- **Ruta:** `GET /api/games/:id/cover`.
  - `:id` con patrón UUID y consulta `v` opcional con `^[0-9a-f]{16}$`, que solo sirve para la caché del navegador. Cualquier otro campo da 400 (`additionalProperties: false`).
  - El núcleo busca el canónico **filtrando por `user_id`** y toma `cover.file` de la propiedad que da los medios. El nombre se valida otra vez con el patrón antes de unirlo a la carpeta. Si falta la fila, el fichero o el nombre no cumple el patrón: `404` JSON.
- **Nivel de acceso: `session`** (anotado en la decisión 67). Un `<img>` envía la cookie del mismo sitio pero no puede añadir `X-Ludiary-Origin-Key`. Se acepta porque:
  - solo devuelve una imagen pública de la tienda, sin datos del equipo;
  - el `:id` es un UUID aleatorio que solo se conoce por rutas `session+key`, así que quien robe la cookie (la amenaza de la decisión 67) no puede probar juegos para saber qué tiene el usuario;
  - una página de otro sitio no recibe la cookie (`SameSite=Strict`) y la respuesta lleva `Cross-Origin-Resource-Policy: same-origin`.
  - Descartado: `fetch` con la cabecera y `blob:`. Pierde la caché HTTP, obliga a añadir `blob:` a `img-src` y suma código en la web.
- **Cabeceras de la respuesta:**
  - `Content-Type` según la extensión guardada, con una tabla cerrada de tres tipos;
  - `X-Content-Type-Options: nosniff` (ya global);
  - `Cache-Control: private, max-age=31536000, immutable`, que sustituye al `no-store` global solo en esta ruta. El fichero de una URL con `v` nunca cambia;
  - `Content-Security-Policy: default-src 'none'; sandbox`, por si alguien abre la imagen como documento;
  - `Cross-Origin-Resource-Policy: same-origin`.
- **DTO:** `GameSummaryDto` y `GameDetailDto` no cambian de forma. `summary` (en `db`) rellena:
  - copia de tipo `cover`: `coverUrl = /api/games/<id>/cover?v=<16 primeros caracteres del nombre>` y `coverFallbackUrl` = `heroUrl` del CDN, como hoy;
  - copia de tipo `hero`: sin `coverUrl`, y `coverFallbackUrl` = la ruta local;
  - sin copia o con fallo: las URL del CDN de hoy.
- **CSP:** sin cambios. `'self'` ya cubre la ruta local, y los hosts del CDN **se quedan** en `img-src` como respaldo mientras falte la copia (ver punto 9, pregunta 1).
- **Web:** una línea en `Cover` (`apps/web/src/components/bits.tsx`): la clase `coverContain` se aplica cuando `src === game.coverFallbackUrl`, no cuando `failed > 0`, para que una copia de tipo `hero` se pinte centrada. El simulador no cambia.

#### 5. Respaldo

Si la descarga falla o aún no se ha hecho, todo sigue como hoy: el CDN de Steam (`coverUrl`, luego `coverFallbackUrl`) y, al final, el degradado con el título. Si la ruta local da 404, por ejemplo porque se borró la carpeta, la web pasa al siguiente eslabón.

#### 6. Seguridad

- Se admiten **solo JPEG, PNG y WebP**, por firma:
  - JPEG: `FF D8 FF`;
  - PNG: `89 50 4E 47 0D 0A 1A 0A`;
  - WebP: `RIFF` en los bytes 0 a 3 y `WEBP` en los bytes 8 a 11.
- Nunca se admiten SVG, GIF ni HTML. Un cuerpo que no cumple ninguna firma no se escribe en el disco y cuenta como fallo de esa propiedad.
- La imagen no se decodifica en el servidor, para no añadir dependencias. Las firmas, el tope de 2 MiB, el tipo cerrado al servir, `nosniff` y la CSP con `sandbox` bastan para que nunca se sirva como otra cosa.
- No hay recorrido de directorios: el nombre sale del SHA-256 de los bytes y se valida con el patrón al escribir, al servir y al limpiar. El `:id` de la ruta solo se usa como clave de la base.
- **Registros:** la ruta de una URL del CDN lleva el AppID, y la lista de juegos es un dato personal (decisión 73). El `HttpClient` de este paso se crea con una opción nueva, `logPath: false`, para registrar solo método, host, estado y duración. El paso resume en un `info` con recuentos (descargadas, fallidas y borradas), sin AppID ni URL.

#### 7. Privacidad (invariante 9)

- **Hoy** el navegador pide cada imagen al CDN cuando su caché lo necesita, con la IP del equipo y su `User-Agent`, sin referente (`no-referrer`) y sin `crossorigin`.
- **Con este cambio** la pide el servidor, desde la misma IP, **una vez por imagen** mientras la URL no cambie, sin cookies, sin referente y con el `User-Agent` por defecto de Node, sin datos del navegador. Valve recibe lo mismo que ya recibía (qué AppID tiene el usuario en Steam) y menos veces. Mientras falte la copia, el navegador sigue usando el CDN como hoy.
- No sale nada hacia hosts nuevos.

#### 8. Alternativas más pequeñas

- **Alargar la caché del navegador:** no se puede. La duración la fijan las cabeceras de Steam, y el servidor de Ludiary no está en medio.
- **Service Worker que guarde las imágenes en Cache Storage:**
  - funcionaría sin conexión para lo ya visto, pero el almacenamiento va por origen, puerto incluido: `ludiary.localhost:<puerto>` y `127.0.0.1:<puerto>` tendrían copias distintas, y un cambio de puerto (decisión 28) lo vaciaría;
  - el navegador puede borrarlo cuando le falte espacio, y cada navegador y perfil vuelve a descargar;
  - las respuestas de otro origen sin CORS son opacas, ocupan más cuota y no se pueden validar;
  - añade `worker-src`, el ciclo de vida del worker y otra superficie en la página.
  - No cumple «no llamar a Steam cada vez» de forma fiable y no es más simple.
- **Leer la caché del cliente de Steam** (`appcache\librarycache`): ya descartada en la decisión 73. No está documentada, no sirve para Ubisoft, EA, GOG ni Epic y también necesita la ruta para servir imágenes.
- La descarga en el servidor es además lo que pedirá el modo Docker (fase 2), así que no se hace dos veces.

#### 9. Lo que decide el usuario

1. **Respaldo en el navegador mientras falta la copia** (por ejemplo, en el primer escaneo o con un fallo):
   - (a) **la web carga la imagen del CDN de Steam, como hoy, hasta tener la copia** (recomendado: nunca se ve peor que ahora);
   - (b) el navegador nunca llama a Steam: solo degradado hasta que el servidor la descarga, y los hosts del CDN salen de `img-src`. Es más privado y la CSP queda en `'self'`, pero con bibliotecas grandes se ven degradados durante varias aperturas.
2. **Portadas en las copias de seguridad periódicas:**
   - (a) **no se incluyen; se vuelven a descargar** (recomendado: la copia sigue siendo un fichero pequeño);
   - (b) se incluyen.

#### 10. Lo mínimo que hay que implementar

- `packages/contracts/src/connector.ts`: la respuesta de `HttpClient` añade `bytes(): Promise<Uint8Array>`. `contractVersion` sigue en 1, porque es un cambio aditivo.
- `packages/connector-testkit`: `fakeHttp` implementa `bytes()`.
- `packages/platform-node/src/http.ts`:
  - `readLimited` devuelve `Buffer`; `text()` y `json()` lo decodifican, y `bytes()` lo entrega tal cual;
  - opción `logPath?: false`;
  - `CoreDeps.http` pasa `logPath` en sus `opts`, junto a `maxBytes`.
- `packages/platform-node/src/covers.ts` (nuevo): `createCoverFiles(dir)`, que implementa el puerto del núcleo:

```ts
// packages/core/src/ports.ts — ADR 75
export type CoverType = 'image/jpeg' | 'image/png' | 'image/webp';
export interface CoverFiles {
  /** Sniffs JPEG/PNG/WebP by magic bytes (anything else → null); writes <sha256>.<ext> via .tmp + rename. */
  save(bytes: Uint8Array): Promise<string | null>;
  /** null if the name fails ^[0-9a-f]{64}\.(jpg|png|webp)$ or the file is missing. */
  read(file: string): Promise<{ body: Uint8Array; type: CoverType } | null>;
  list(): Promise<ReadonlySet<string>>;
  /** Deletes pattern-matching files not in keep, and leftover .tmp. Returns how many. */
  prune(keep: ReadonlySet<string>): Promise<number>;
}
```

- `packages/core`:
  - `CoreDeps.covers?: CoverFiles`; sin él, no hay paso de portadas;
  - `src/covers.ts`, con el paso del punto 2, llamado desde `media.ts` al terminar el paso de medios;
  - constantes en `env.ts`: 300 descargas, 30 s y 30 días;
  - `readCover(canonicalId)` → `{ body, type } | null`.
- `packages/db` (repositorio de la biblioteca, todo filtrado por `user_id`):
  - `listCoverPending(store, { retryBefore, present, limit })` → `{ propertyId, urls: [cover?, hero?] }[]`, con la precedencia de la 73;
  - `setCover(propertyId, value)`;
  - `listCoverFiles()`, con los ficheros de propiedades no retiradas;
  - `getCoverFile(canonicalId)`;
  - en `summary`, las reglas del DTO del punto 4;
  - que se conserve `cover` en los tres `update` que hoy conservan `resolvedMedia`.
  - Sin migración.
- `packages/runtime`: `createCoverFiles(join(dataDir, 'covers'))` en `compose.ts` y `readCover` en `core-adapter.ts`.
- `packages/api`: la ruta del punto 4, con `config.access: 'session'` y sus cabeceras.
- `apps/web`: la línea de `Cover`.
- **Sin cambios:** CSP, `vite.config.ts`, `mediaHosts`, `apiHosts`, conectores y `api-contract` (salvo el esquema de la ruta nueva, si se declara allí).

#### 11. Pruebas

- **`platform-node`:**
  - `covers.ts`:
    - las tres firmas se guardan con su extensión;
    - SVG, HTML, GIF, vacío y un JPEG cortado a 2 bytes → `null`, sin fichero;
    - el mismo contenido da el mismo nombre;
    - escritura con `.tmp` y `rename`;
    - `read` rechaza `../x.jpg`, mayúsculas, otra extensión y rutas absolutas;
    - `prune` borra lo no usado y los `.tmp`, y respeta los ficheros que no cumplen el patrón.
  - `http.ts`: `bytes()` con contenido binario, el tope de bytes en `bytes()` y que con `logPath: false` el registro no lleva la ruta.
- **`core`** (`fakeHttp` y un `CoverFiles` doble):
  - solo pendientes, con los cuatro casos;
  - portada 404 → `hero`; las dos 404 → fallo, sin reintento antes de 30 días (reloj doble) y con reintento si cambia la URL;
  - no imagen → fallo;
  - 429 o 5xx paran el paso y esperan;
  - tope de 300 y de 30 s;
  - el cliente se crea con `mediaHosts` y nunca con `apiHosts`;
  - el fallo no cambia el estado de la operación;
  - sin `covers` o sin `http` no hay paso;
  - `prune` recibe los ficheros en uso;
  - una propiedad solo de otra tienda no pide nada a los hosts de Steam.
- **`db`:**
  - el escaneo y la biblioteca conservan `cover`;
  - `summary` con copia `cover`, copia `hero`, fallo y sin copia;
  - `listCoverPending` con fichero ausente y con URL cambiada;
  - filtro de `user_id` en todo lo nuevo.
- **`api`:**
  - la ruta con cookie y sin clave → 200 con las cabeceras del punto 4;
  - sin cookie → 401;
  - `:id` que no es UUID, `v` mal formado o un campo de más → 400;
  - canónico de otro usuario, sin copia o con un nombre manipulado en la base → 404;
  - el tipo sale de la tabla aunque la base diga otra cosa.
- **Web:** `Cover` aplica `coverContain` al pintar `coverFallbackUrl` aunque sea el primer eslabón.
- **Playwright:** con un CDN doble, tras el escaneo la biblioteca pide las portadas a `/api/games/…/cover` y ninguna a hosts externos.
- **Manual (usuario):** tras un escaneo con conexión, desconectar la red, borrar la caché del navegador y reabrir: se ven las 18 portadas, incluidas BALL x PIT y Europa Universalis V. Borrar la carpeta `covers` y escanear: vuelven. El registro exportado no contiene AppID ni URL del CDN.

**Motivo:**

- Es la única opción que cumple lo que pide el usuario: cada imagen se pide una vez y se ve sin conexión, sin depender de la caché del navegador, del puerto ni del navegador que se use.
- Reutiliza piezas que ya existen:
  - el `HttpClient` acotado, ahora con los `mediaHosts`;
  - el paso de medios, con su cola, su espera tras fallos y su validación;
  - el JSON de `store_metadata`, sin migración;
  - las URL del CDN, que pasan a ser el respaldo, con la web y su cadena de respaldo casi sin cambios.
- Lo que la decisión 71 temía de la opción B (ruta nueva, caché, límites, validación y limpieza) queda acotado a dos ficheros nuevos y una ruta.

**Consecuencias:**

- La decisión 71 queda revisada en el «cómo»: el servidor sí descarga, guarda y sirve imágenes. El «qué» (la carátula de Steam, solo para juegos que el usuario tiene en Steam) no cambia.
- `/api/games/:id/cover` es la segunda ruta `session`, anotada en la decisión 67.
- Las portadas de GOG, Epic, IGDB o RAWG usarán el mismo paso cuando existan, con los `mediaHosts` de su conector o proveedor.
- El `auditor` revisa antes de cerrar:
  - `covers.ts` (firmas, nombres y limpieza);
  - la ruta, su nivel de acceso y sus cabeceras;
  - que el cliente de descarga solo usa `mediaHosts`;
  - que el registro no lleva rutas del CDN.
- El `documentalista` actualiza:
  - privacidad: el servidor descarga cada portada una vez;
  - solución de problemas: dónde están las portadas, que se pueden borrar sin perder nada y que una que falta aparece tras el siguiente escaneo con conexión.

### 76. Primer corte vertical de GOG: instalados, portadas y lanzamiento por línea de comandos (amplía las decisiones 40, 42, 72 y 73; revisa el orden de cortes de la 72 y la fila de GOG de la tabla de la 40; vía de la cuenta, orden del emparejamiento y el `..` del punto 4 revisados en la decisión 77)

**Decisión (recomendada, 22 de octubre de 2026):** el 22 de octubre de 2026 el usuario encarga «empieza con el conector de GOG». Eso resuelve el punto (C) de la decisión 72: **GOG va antes que el corte 2b** (tiempo de juego), que pasa a ir después. Este corte es el equivalente de la 72 para GOG: lo justo para ver los juegos de GOG instalados y jugarlos, y sobre todo para validar el lanzamiento por línea de comandos (`exec`), el caso más distinto del contrato.

**Punto de partida:** en el PC del usuario no hay GOG Galaxy ni juegos de GOG (no existe `HKLM\SOFTWARE\WOW6432Node\GOG.com`). Todo lo que sigue sobre GOG sale de fuentes públicas y queda como supuesto (lista del final) hasta la prueba manual del punto 9.

#### 1. Alcance

- **Entra:**
  - detección de los juegos de GOG instalados por el registro (decisión 42) y por carpetas manuales, leyendo los ficheros `goggame-<productId>.info` de cada juego;
  - lanzamiento **directo del ejecutable del juego** con `ProcessLauncher.exec`, implementado ahora en Windows (punto 4);
  - portadas verticales desde la API de GamesDB de GOG, sin cuenta (punto 5);
  - el conector `connectors/gog` registrado en `runtime`, con sus textos, y la CSP ampliada con su host de imágenes.
- **Queda fuera, cada parte con su corte:**
  - **Cuenta de GOG:** inicio de sesión con `gogdl` y el flujo de la decisión 43, juegos no instalados, `listLibrary`, `install` y `ExternalToolRunner`. Igual que con Steam, primero se valida el camino de escanear y lanzar, que es el mayor riesgo, sin secretos de terceros.
  - **DLC:** el escaneo los distingue para **no** mostrarlos como juegos, pero no los informa (`dlc: 'none'`). El núcleo aún los descarta (`validate.ts`) y el modelo no tiene `base_store_game_id`; llegan con la cuenta de GOG o con su propio corte (decisiones 21 y 52).
  - **Emparejamiento entre tiendas.** La 72 decía que la unión entre tiendas, `match_decisions` y `duplicate_candidates` llegaban «con la segunda tienda». Se aplaza a un corte propio: necesita la interfaz de fusionar y separar (decisión 20, las decisiones manuales prevalecen) y una migración, y sin esa interfaz una fusión automática errónea no tendría arreglo. Consecuencia mientras tanto: un juego instalado en Steam y en GOG sale dos veces, una por tienda. Con solo instalados es poco frecuente; con la cuenta de GOG dejaría de serlo, así que el emparejamiento va antes o junto con ella (punto 11).
  - **Lanzar a través de GOG Galaxy:** lo decide el usuario (punto 11). Queda descrito en el punto 4 para poder añadirlo sin otra decisión técnica.
  - **Tiempo de juego** (corte 2b, decisión 55).

#### 2. Contrato (amplía la decisión 40; `contractVersion` sigue en 1)

**No cambia ningún tipo.** Todo lo que necesita GOG ya existe:

- `LaunchSpec` de tipo `exec` y `capabilities.launchKinds: ['exec']` (decisión 40).
- `registry-subkeys` en `LocationSource`, que el auxiliar de Go ya implementa (lee un valor de cada subclave, como mucho 256).
- `discoverRoots`, `resolveMedia`, `apiHosts` y `mediaHosts` (decisiones 71 a 73).
- La regla 5 de la decisión 40 para `exec`, que el núcleo ya comprueba con pruebas desde la 72 (`packages/core/src/launch.ts`, `checkSpec`).

Solo cambian comentarios y una implementación:

```ts
// packages/contracts/src/ports.ts — ADR 76: comment of ProcessLauncher.exec
/**
 * Detached, args as a list, no shell (ADR 40 rule 5). Windows (ADR 76): only an existing local `.exe`,
 * no verbatim arguments, the child's main window is not hidden. Rejects with ExecError.
 */
exec(spec: { executable: string; args: readonly string[]; cwd?: string }): Promise<void>;

// packages/contracts/src/ports.ts — ADR 76, new and small
export class ExecError extends Error {
  /** 'rejected': the platform's own check refused the spec. 'denied': the OS refused (e.g. needs administrator). 'failed': anything else. */
  constructor(readonly reason: "rejected" | "denied" | "failed") { super(`exec ${reason}`); this.name = "ExecError"; }
}
```

- Se justifica `ExecError` porque el núcleo tiene que distinguir «Windows no deja abrirlo» (un mensaje útil al usuario) de un fallo genérico. Es una clase nueva, no un cambio de una interfaz existente: `contractVersion` sigue en 1.
- **`ExecError` no lleva nada más que `reason`** (revisión del auditor): sin `cause`, y su `message` es el fijo de arriba. Nunca copia `message`, `path` ni `spawnargs` del error de Node, que llevan la ruta y los argumentos. Por la misma razón, los `ConnectorError` que lanza `resolveAction` de GOG no llevan rutas, nombres de fichero ni argumentos en `message` ni en `params`: solo el ID del producto.
- **Rutas canonizadas** (revisión del auditor): `checkSpec` pasa a `exec` el `executable` y el `cwd` ya resueltos con `realpath`, los mismos que comprobó dentro de las raíces, y no el texto que devolvió el conector. El puerto `LocalFiles` (decisión 72, `packages/contracts/src/ports.ts`) añade `realPath(path: string): Promise<string>`, implementado en `platform-node` con `realpath`; `checkSpec` canoniza y **vuelve a comprobar** que el resultado sigue dentro de las raíces. Es una ampliación compatible de un puerto del SO, no del contrato de los conectores: `contractVersion` sigue en 1. Queda una carrera residual entre la comprobación y `CreateProcess` (alguien con escritura en la carpeta del juego cambia una unión en medio); se acepta, porque ese alguien ya puede sustituir el `.exe`.
- **Instalación aún dentro de una raíz activa** (revisión del auditor; comprobado: hoy `launch.ts` no lo verifica, solo lee `installations`). Si el usuario desactiva o quita una carpeta, o pasa la detección a `later`, el escaneo forzado retira sus juegos, pero ese escaneo puede fallar, ir con retraso o no haber terminado. Se decide: antes de llamar al conector, el núcleo comprueba que `installPath` sigue dentro de alguna raíz **activada** de esa tienda según el modo de detección vigente (las mismas reglas que calculan las raíces del escaneo en la 72). Si no, `not-installed`, sin llamar al conector. Vale para todas las tiendas; para Steam no cambia nada visible.
- **Núcleo** (`launch.ts`): el `catch` de la llamada a `deps.launcher` traduce `ExecError('denied')` a `CoreError('launch.denied')`, con la clave `game.launchDenied` («Windows no ha permitido abrir el juego. Puede que pida permisos de administrador: ábrelo desde su tienda o desde su acceso directo»); `rejected` a `launch.rejected`, y el resto sigue en `internal`. Se registra solo el conector y el motivo, **nunca** la ruta ni los argumentos (llevan el nombre de usuario si el juego está bajo el perfil, decisión 35).
- La fila de GOG en la tabla de capacidades de la decisión 40 pasa de «`exec` (cliente de Galaxy)» a «`exec` (ejecutable del juego; Galaxy, opcional según el punto 11)».

#### 3. Escaneo

- **Fuente principal: el fichero `goggame-<productId>.info`** de la carpeta del juego. El registro solo sirve para **encontrar** carpetas.
  - Motivo: el `.info` está en todas las instalaciones de GOG (Galaxy e instalador sin conexión), sobrevive a reinstalar Windows y a mover la carpeta, y trae todo lo necesario: ID, nombre, tareas de juego y si es un DLC. Es lo que usa `gogdl` para lanzar en Windows (supuesto G3).
  - El registro solo da, por subclave, el valor que pide la ubicación (`path`). Leer de él `exe`, `launchCommand` o `workingDir` exigiría un tipo nuevo de `LocationSource` que devuelva varios valores por subclave y cambiar el auxiliar de Go, para unos datos que el `.info` ya tiene. Se descarta.
- **Manifiesto, `locations`:**
  - `gog-games` (`scan`): `{ kind: 'registry-subkeys', hive: 'HKLM', key: 'SOFTWARE\\GOG.com\\Games', value: 'path', view: '32' }`. Con la vista de 32 bits se lee `WOW6432Node` sin escribirlo en la clave, como recomienda GameFinder (supuesto G1). Devuelve la carpeta de cada juego instalado.
  - `gog-library` (`scan`): `{ kind: 'known-folder', folder: 'ProgramFilesX86', relative: 'GOG Galaxy\\Games' }`, la biblioteca por defecto de Galaxy (supuesto G2). Cubre un registro vacío o ilegible.
  - Ninguna ubicación `launcher` en este corte: el lanzamiento directo no la necesita.
- **`discoverRoots`** convierte carpetas de juego en raíces visibles en Ajustes, una por biblioteca y no una por juego (que llenaría Ajustes y chocaría con el tope de 64 raíces descubiertas de la 72). Sin E/S, solo texto:
  - De `gog-games`: la carpeta **padre** de cada juego, con `tag: 'library'`. Excepción: si el padre es la raíz de una unidad (`D:\`), se devuelve la propia carpeta del juego con `tag: 'game'`, para no recorrer una unidad entera.
  - De `gog-library`: la propia carpeta, con `tag: 'library'`.
  - Sin repetidos (clave en minúsculas, como Steam). El núcleo valida como siempre: absoluta, local, existente y como mucho 64.
- **`scanInstalled`**, para cada raíz (descubierta o del usuario), con profundidad 1:
  - Candidatas: la propia raíz y sus subcarpetas directas, como mucho 2000 por raíz. Así vale tanto una carpeta de juego como una carpeta de juegos (`C:\GOG Games`).
  - En cada candidata, `readDir` y ficheros que cumplan `^goggame-(\d{1,20})\.info$` (sin distinguir mayúsculas). Si no hay ninguno, no es de GOG y se pasa a la siguiente sin leer nada más. Los demás `goggame-*` (`.hashdb`, `.ico`, `galaxyFileList.ini`) no se leen.
  - Cada `.info` se lee con `readText` (1 MiB como mucho), se quita un BOM inicial si lo hay y se analiza con `JSON.parse`. Campos: `gameId` (cadena de dígitos; si viene como número JSON se acepta y se pasa a texto), `rootGameId` (igual), `name`.
    - `gameId` distinto del ID del nombre del fichero: se salta y se registra el ID.
    - `rootGameId` presente y distinto de `gameId`: es un **DLC** (supuesto G5). Se salta y se cuenta en el registro.
    - En otro caso es un juego: `storeGameId` = `gameId`, `kind: 'game'`, `title` = `name` recortado o `GOG <id>` si falta (un dato, no un texto de la interfaz), `installPath` = la carpeta candidata. Sin `media` (las URL llevan un hash que solo da la API, punto 5) ni `launchData` (punto 4).
  - Un ID ya visto se salta (el núcleo también lo hace).
  - Errores, con la misma clasificación que Steam (`isHandled` de `connectors/steam/src/scan.ts`, que se copia; no se comparte un paquete por diez líneas):
    - JSON mal formado o sin `gameId`: `store.unexpected-response`, se salta ese fichero.
    - Fichero bloqueado o error de E/S: la raíz cuenta como ilegible y conserva sus instalaciones (punto 11 de la 72).
    - `PathEscapesRootsError` en una subcarpeta (unión que sale de la raíz): se salta esa candidata. En la propia raíz: raíz ilegible.
    - Cualquier otro `internal` se propaga (fallo del conector).
  - En el registro solo van IDs, contadores y códigos, nunca rutas ni títulos.
- **Sin Galaxy** (instalador sin conexión): si el instalador escribe la misma clave del registro (supuesto G2), el juego aparece solo. Si no, aparece en cuanto el usuario añade su carpeta o la carpeta que lo contiene. La guía de usuario lo explica.
- **Con «solo carpetas manuales»** (decisión 42): solo raíces `user`; funciona igual, porque el escaneo no depende del registro.

#### 4. Lanzamiento

**Opciones:**

- **A. `exec` directo del ejecutable del juego** (recomendada). Del `.info`, la tarea de juego principal: ejecutable, argumentos y carpeta de trabajo, todo dentro de `installPath`.
  - Ventajas: funciona sin Galaxy (instalador sin conexión, juegos sin DRM); el ejecutable está siempre dentro de la carpeta del juego, así que el núcleo confina el `exec` a `installPath` sin ubicaciones `launcher`; el proceso es el del juego, lo que simplifica la detección de la decisión 55; no depende de la sintaxis sin documentar de Galaxy; es lo que hacen `gogdl` y Heroic.
  - Costes: sin Galaxy de por medio no hay sincronización de partidas en la nube antes de jugar, ni superposición, y los logros o el multijugador de los juegos que usan el SDK de Galaxy pueden necesitar Galaxy abierto (supuesto G12). Leer las tareas de un fichero exige partir la cadena de argumentos (abajo).
- **B. `exec` del cliente de Galaxy:** `GalaxyClient.exe /command=runGame /gameId=<id> /path=<installPath>`, con una ubicación `launcher` (`gog-galaxy-client`). Sintaxis de un hilo del foro de GOG, sin documentación oficial (supuesto G13).
  - Ventajas: nube, superposición y tiempo de Galaxy.
  - Costes: exige Galaxy instalado; abre Galaxy (lento, pesado); el foro escribe `/path="<ruta>"`, mientras que Node, al pasar argumentos como lista, entrecomilla el argumento entero (`"/path=C:\…"`) y no se sabe si Galaxy lo acepta: haría falta `windowsVerbatimArguments`, que es justo lo que este diseño prohíbe; y la detección de procesos pierde la relación directa.
- **C. URI de Galaxy:** descartada. No consta un esquema registrado para lanzar juegos (supuesto G14), como ya decía la decisión 22.

**Se elige A** en este corte. B queda especificada para añadirla si el usuario la pide (punto 11): solo sería otra rama en `resolveAction` y una ubicación `launcher`, sin tocar el contrato.

**`resolveAction` de GOG** (`connectors/gog/src/launch.ts`):

1. Acción distinta de `play`: `null`.
2. `storeGameId` debe cumplir `^\d{1,20}$`; si no, `action.unsupported` con `connectors.gog.errors.invalidId`.
3. Lee `<installPath>\goggame-<id>.info` con `ctx.fs` (confinado a `installPath`). Si no existe: `launch.not-installed` con `connectors.gog.errors.infoMissing` (el juego se desinstaló o se movió; el siguiente escaneo lo corrige). JSON mal formado: `store.unexpected-response`.
4. Tarea: la primera de `playTasks` con `isPrimary === true`, `type` igual a `FileTask` o ausente, y `path` de texto. Si no hay: `action.unsupported` con `connectors.gog.errors.noPlayTask` («Este juego no indica cómo abrirse; ábrelo desde GOG Galaxy»). Las `URLTask` y las tareas no principales se ignoran.
5. `path` debe ser relativo: sin letra de unidad, sin empezar por `\` o `/`, sin `:` y sin caracteres de control. Si no, `action.unsupported` con `connectors.gog.errors.invalidTask` (la misma clave para un `workingDir` no relativo y para más de 64 argumentos). Debe acabar en `.exe` (sin distinguir mayúsculas); si no (por ejemplo `.bat` o `.lnk`), `action.unsupported` con `connectors.gog.errors.unsupportedExecutable`. `executable` = `ctx.fs.join(installPath, path)`.
6. `workingDir`: si es texto no vacío, con las mismas reglas que `path`, `cwd` = `ctx.fs.join(installPath, workingDir)`; si no, `cwd` = `installPath`.
7. `arguments`: si es texto, se parte con `splitWindowsArgs` (abajo); más de 64 argumentos es `action.unsupported` con `connectors.gog.errors.invalidTask`.
8. Devuelve `{ kind: 'exec', executable, args, cwd }`.

- Se lee el `.info` **al lanzar**, no al escanear: así una actualización del juego que cambie el ejecutable vale enseguida, y no hace falta `launchData`.
- ~~Un `..` en `path` o `workingDir` no lo filtra el conector~~ (revisado en la decisión 77, A1: el conector lo rechaza con `invalidTask`). Si aun así una ruta sale de `installPath`, la rechaza el núcleo (`launch.rejected`), que es quien confina.
- **Invariante 3.** La API sigue recibiendo solo IDs. Ejecutable, argumentos y carpeta salen de un fichero local de la carpeta del juego, que el núcleo confina a `installPath`. Quien puede escribir ese `.info` puede también sustituir el propio `.exe`, así que el fichero no añade una vía nueva de ataque. Lo que sí se impide: salir de la carpeta del juego, que **Ludiary añada** un intérprete de órdenes (`cmd.exe`, `shell`) y ejecutar algo que no sea un `.exe`. El `.exe` y sus argumentos son los que dice el `.info`: si la tarea de un juego abre a su vez otro programa, eso es cosa del juego, como al abrirlo desde Galaxy.
- **Para la guía:** `CreateProcess` no pasa por SmartScreen ni mira la marca de la web (MOTW), a diferencia de un doble clic en el Explorador. Abrir un juego desde Ludiary no muestra esos avisos; el documentalista lo menciona en la guía de seguridad.

**`splitWindowsArgs(s: string): string[]`** (`connectors/gog/src/args.ts`, pura): parte la cadena con las reglas del CRT universal de Microsoft (UCRT, las de `CommandLineToArgvW` desde 2008) para los argumentos que siguen al programa: los espacios y tabuladores separan fuera de comillas; `"` abre o cierra; 2n barras inversas seguidas de `"` dan n barras y abren o cierran; 2n+1 barras seguidas de `"` dan n barras y una comilla literal; las barras que no van delante de una comilla son literales; dentro de comillas, `""` es una comilla literal. Node (libuv) vuelve a entrecomillar cada argumento con esas mismas reglas al crear el proceso, así que un juego que lea sus argumentos con el CRT recibe lo mismo que con Galaxy (supuesto G10).

**Núcleo:** ninguna regla nueva. `checkSpec` ya comprueba lo de la regla 5: tipo en `launchKinds` y en `ProcessLauncher.kinds`, `executable` absoluto, existente, no carpeta y dentro de `installPath` (GOG no declara `launcher`), argumentos sin caracteres de control (64 como mucho, 8192 caracteres cada uno), y `cwd` absoluto, carpeta y dentro de las mismas raíces.

**Plataforma, segunda barrera** (`packages/platform-windows/src/process-launcher.ts`, `exec`), antes de crear nada; cualquier fallo es `ExecError('rejected')`:

- `executable`: ruta absoluta con letra de unidad (`^[A-Za-z]:\\`), local (sin UNC ni `\\?\` o `\\.\`), sin caracteres de control ni `"`, con extensión `.exe` sin distinguir mayúsculas, y que exista como fichero (`stat`). Se rechazan expresamente `.bat` y `.cmd`: Node exige un intérprete de órdenes para ellos desde la corrección de CVE-2024-27980, y eso es lo que no se quiere.
- Además (revisión del auditor), para `executable` y `cwd`: ningún `:` después de la posición 1 (flujos alternativos `fichero:flujo`); ningún componente que sea un nombre reservado de dispositivo (`CON`, `PRN`, `AUX`, `NUL`, `COM0` a `COM9`, `LPT0` a `LPT9`, sin distinguir mayúsculas y también con extensión, como `nul.exe`); ningún componente acabado en punto o en espacio (Windows los recorta y la ruta comprobada no sería la ejecutada).
- `cwd`, si viene: mismas reglas de ruta, y que sea carpeta.
- **Unidades de red mapeadas y `subst`** (corregido tras la auditoría del código, 22-10-2026): `subst` se admite, porque `realPath` lo resuelve a la unidad real. Las **unidades de red mapeadas no se admiten** para `exec`: en Windows `realPath` (`GetFinalPathNameByHandle`) convierte `Z:\…` en `\\servidor\recurso\…`, el núcleo pasa esa ruta canonizada y la plataforma rechaza las UNC, así que Jugar da `launch.rejected`. Falla del lado seguro y no se añade código para distinguirlo. Supuesto sin verificar en un equipo real (no hay unidad mapeada en el del usuario). Si algún usuario lo necesita, se decide aparte.
- Cada argumento sin caracteres de control (incluido NUL), y la línea de órdenes resultante (ejecutable más argumentos entrecomillados) de 32 000 caracteres como mucho (el límite de `CreateProcess` es 32 767).

**Implementación de `exec` en Windows:**

```ts
spawn(executable, args, {
  cwd,                         // installPath when the task has no workingDir
  detached: true,              // the game outlives the server
  stdio: "ignore",
  windowsHide: false,          // see below
  env: childEnv(process.env),  // without LUDIARY_* and NODE_* (case-insensitive)
  // shell and windowsVerbatimArguments are never set (default false)
});
// resolve on 'spawn' (then unref), reject on 'error'
```

- **`windowsHide: false`**, a diferencia de `openUri`: `windowsHide` pide a Windows `SW_HIDE` en el arranque, y un juego que respete ese valor en su primer `ShowWindow` arrancaría con la ventana oculta. Para `rundll32` da igual; para un juego, no.
- **Entorno:** el juego hereda el del usuario, sin las variables cuyo nombre empiece por `LUDIARY_` (ganchos de prueba, decisión 65) o `NODE_`, comparando sin distinguir mayúsculas (en Windows `node_options` y `NODE_OPTIONS` son la misma). Las demás pasan tal cual, como si se abriera desde el Explorador. **Regla general:** ningún secreto viaja por el entorno de un proceso que se pueda lanzar como juego; en Docker, la clave por variable de entorno (decisión 14) no aplica porque ese modo no lanza.
- **Consola:** con `detached`, un ejecutable de consola (por ejemplo DOSBox) podría arrancar sin ventana de consola (supuesto G16). Se comprueba en el punto 9. Si falla, se resuelve en una decisión aparte con el auxiliar de Go y `CREATE_NEW_CONSOLE`; nunca con un intérprete de órdenes.
- **El juego sobrevive al servidor:** el servidor no corre dentro de un Job object con `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` (ni lo crea el lanzador, decisión 45), así que parar Ludiary no cierra el juego. Se comprueba en el punto 9.
- **Errores de `spawn`:** la plataforma solo mira `err.code`. `EACCES` y `EPERM` dan `ExecError('denied')` (entre ellos, un ejecutable que exige administrador: `CreateProcess` no muestra el aviso de UAC; supuesto G11); los demás, `ExecError('failed')`. No se reintenta con `ShellExecute` en este corte: una elevación lanzada desde un servidor en segundo plano merece su propia decisión.
- `kinds` pasa a `['uri', 'exec']`. Desaparece el `shortcut` de la 72 («`kinds` excluye `exec`»).

#### 5. Portadas

- **Entra en este corte**, porque hay una vía razonable sin cuenta y la biblioteca de GOG sin portadas se vería rota.
- **Fuente: GamesDB de GOG**, la que usa Galaxy 2.0. `GET https://gamesdb.gog.com/platforms/gog/external_releases/<productId>`, sin cuenta ni clave. De la respuesta se usan `game.vertical_cover.url_format` → `coverUrl` y `game.background.url_format` → `heroUrl`. El formato es `https://images.gog.com/<hash>{formatter}.{ext}?namespace=gamesdb`; se sustituye `{formatter}` por la cadena vacía y `{ext}` por `jpg`.
  - Comprobado el 22 de octubre de 2026 con Beneath a Steel Sky (1207658695): la URL resultante devuelve un JPEG vertical de unos 923×1300.
  - **Descartadas:** `api.gog.com/v2/games/<id>` (su `boxArtImage` es una miniatura de tienda de unos 170×240 con la banda «FREE» incrustada) y `api.gog.com/products/<id>` (sin portada vertical; logos e iconos en `images-1` a `images-4.gog-statics.com`).
- **Manifiesto:** `apiHosts: ['gamesdb.gog.com']`, `mediaHosts: ['images.gog.com']`. La CSP de la SPA y la lista de `vite.config.ts` añaden `https://images.gog.com` (la prueba de paridad de la 71 lo exige). Si `images.gog.com` redirige a otro host, la CSP lo bloquearía y la portada caería al degradado; se añade el destino tras comprobarlo (supuesto G9).
- **`resolveMedia`** (`connectors/gog/src/media.ts`):
  - Antes de pedir nada, cada ID se revalida con `^\d{1,20}$`; uno que no cumpla se omite sin petición (nunca se mete en la ruta).
  - Una petición por ID (GamesDB no admite lotes), como mucho **6 a la vez**, para que un lote de 50 quepa en los 15 s del paso de medios de la 73 (supuesto G8). Con la primera respuesta 429 no se lanzan más peticiones y `resolveMedia` lanza `store.rate-limited` en seguida.
  - Cada petición tiene un tiempo máximo de 8 s, aplicado por el conector al esperar la respuesta; el `signal` del contexto sigue cortando todo a los 15 s.
  - **Limitación aceptada (implementación, 22-10-2026):** `HttpClient.request` no admite `signal`, `timeout` ni `maxBytes` por petición, y no se amplía el contrato por esto. Por eso, tras un 429 o al vencer los 8 s, las peticiones que ya estaban en vuelo no se cancelan en el socket: terminan solas y su resultado se descarta. El tope de respuesta es el de 2 MiB del cliente de medios del núcleo (decisión 73), no los 512 KiB que propuso el auditor; una respuesta de GamesDB ocupa unos pocos KB. Se revisa si GamesDB responde 429 con frecuencia o si otra tienda necesita cancelar peticiones.
  - Por respuesta:
    - 200: se valida que `vertical_cover.url_format` y `background.url_format` cumplan `^https://images\.gog\.com/[0-9a-f]{64}\{formatter\}\.\{ext\}(\?namespace=gamesdb)?$`. El que no cumpla, o falte, se omite. La URL final se vuelve a comprobar con `^https://images\.gog\.com/[0-9a-f]{64}\.jpg(\?namespace=gamesdb)?$`.
    - 404: el ID no está en GamesDB. Queda fuera del mapa: el núcleo lo marca resuelto y vacío, y no lo vuelve a pedir en 30 días.
    - 429: `store.rate-limited` con `Retry-After`, para todo el lote.
    - Cualquier otro estado, un cuerpo que no es JSON o un JSON sin `game`: `store.unexpected-response` para todo el lote. Lanzar en vez de omitir importa: el núcleo marca resueltos todos los ID pedidos si la llamada vuelve bien, y un fallo pasajero dejaría el juego sin portada 30 días.
  - Sin cabeceras propias; el `HttpClient` de la 73 pone `accept: application/json` y no sigue redirecciones.
- **Núcleo:** sin cambios. El paso de medios de la 73 ya es genérico por conector (`media.ts`).
- **Privacidad (invariante 9):** solo propiedades de GOG. Salen hacia GOG **todos** los IDs de GOG detectados en el equipo, uno por petición, y la IP del usuario; sin cookies (Node no las guarda) y sin `User-Agent` propio. GOG recibe lo mismo que vería Galaxy. El documentalista lo añade a la guía de privacidad.

#### 6. Manifiesto de GOG

```ts
// connectors/gog/src/index.ts (sketch)
export function createGogConnector(): StoreConnector {
  return {
    contractVersion: 1,
    id: "gog",
    nameKey: "connectors.gog.name" as I18nKey,
    access: "unofficial-api",          // GamesDB now, gogdl with the account; shows the fragility icon (ADR 40)
    capabilities: {
      library: false, scan: true, dlc: "none",
      actions: ["play"], launchKinds: ["exec"], uriSchemes: [],
      storePlaytime: false, price: false,
    },
    minSyncIntervalMs: 1_800_000,      // ADR 50
    authHosts: [], apiHosts: ["gamesdb.gog.com"], mediaHosts: ["images.gog.com"],
    locations: GOG_LOCATIONS,          // gog-games, gog-library (point 3)
    externalTools: [],                 // gogdl arrives with the account cut
    scanInstalled: scanGogInstalled,
    discoverRoots: discoverGogRoots,
    resolveMedia: resolveGogMedia,
    resolveAction: resolveGogAction,
  };
}
```

- `checkConnectorManifest` lo acepta tal cual: `play` con un tipo, sin `uri` ni esquemas, `resolveMedia` con `apiHosts`.
- **Paquete `connectors/gog`** (`@ludiary/connector-gog`, `"private": true`), con la misma forma que `connectors/steam`: `src/` (`manifest.ts`, `info.ts`, `args.ts`, `scan.ts`, `launch.ts`, `media.ts`, `index.ts`), `locales/es.json` y `en.json` (`connectors.gog.*`), `fixtures/` y pruebas con `connector-testkit`.
- **`runtime`:** `createConnectors()` devuelve `[createSteamConnector(), createGogConnector()]`. `packages/i18n/src/connectors.ts` añade su línea.
- **Web:** la tarjeta de GOG queda como quedó la de Steam en la 72 (apartado 7): modo solo instalados activo y sin pasos; el asistente de cuenta sigue en el simulador. Jugar usa `game.launching` con `{store}` = GOG. El error nuevo `game.launchDenied` y las claves `connectors.gog.errors.*` se traducen en los dos idiomas.

#### 7. Proceso y tiempo de juego

Fuera de este corte (corte 2b). No se informa `executables` (el núcleo aún no lo guarda, punto 8 de la 72). Cuando llegue el 2b, GOG le da dos ventajas: el ejecutable lanzado está en `installPath` y es el del juego. La 55 se revalida con GOG en ese corte.

#### 8. Pruebas automáticas

Fixtures **inventadas**: IDs de producto ficticios (`1000000001`, `1000000002`…), títulos inventados y rutas bajo `C:\Games` o `D:\GOG Games`, nunca `C:\Users\…`. La comprobación de fixtures de la decisión 48 se aplica igual. La única respuesta grabada real es la pública de GamesDB para 1207658695 (datos de catálogo, sin datos de cuenta).

- **`connectors/gog`:**
  - `.info`: con y sin BOM, JSON roto, sin `gameId`, `gameId` distinto del nombre del fichero, `rootGameId` igual, distinto (DLC) y ausente, sin `name`, título no ASCII.
  - `scanInstalled` con `memoryFiles`: raíz que es una carpeta de juego; raíz que es una carpeta de juegos; juego con dos DLC en la misma carpeta (sale solo el juego); carpeta sin `.info`; ID repetido en dos raíces; fichero bloqueado (raíz ilegible y se conserva); unión que escapa en una subcarpeta (se salta) y en la raíz (ilegible); tope de 2000 subcarpetas; `goggame-*.hashdb` y `.ico` ignorados.
  - `discoverRoots`: padres agrupados, raíz de unidad → carpeta del juego con `tag: 'game'`, repetidos sin distinguir mayúsculas, `gog-library` tal cual.
  - `splitWindowsArgs`: tabla con los casos de las reglas de arriba (comillas, `""` dentro de comillas, barras pares e impares ante comilla, barras sueltas, espacios y tabuladores de más, cadena vacía) y una prueba de ida y vuelta con el entrecomillado de libuv (`quote_cmd_arg`, reimplementado en la prueba) sobre esos casos.
  - `resolveAction`: elige la tarea principal entre varias; ignora `URLTask` y no principales; sin tarea principal; `path` absoluto, con unidad, UNC o `:`; `.bat`, `.lnk`; `workingDir` vacío → `installPath`; más de 64 argumentos; `.info` ausente → `launch.not-installed`; ID no numérico; acciones distintas de `play` → `null`; ningún `ConnectorError` lanzado lleva una ruta, un nombre de fichero o un argumento en `message` ni en `params`.
  - `resolveMedia` con `fakeHttp`: 200 con las dos imágenes; `vertical_cover` nulo; `url_format` de otro host, con hash corto o con otra forma; 404 → fuera del mapa; 429 con `Retry-After` que no lanza más peticiones y devuelve en seguida; petición que tarda más de 8 s; 500 y cuerpo que no es JSON → lanza; ID que no cumple `^\d{1,20}$` → sin petición; como mucho 6 peticiones en vuelo; host y ruta exactos.
  - `assertConnectorConformance`.
- **`platform-windows`** (`exec` con `spawn` doble): ruta relativa, UNC, `\\?\`, sin `.exe`, `.bat`, `.cmd`, inexistente, carpeta, `"` o control en la ruta, NUL en un argumento, `cwd` que no es carpeta, línea demasiado larga, `:` tras la posición 1 (`C:\Games\x.exe:flujo`), nombres reservados (`C:\Games\CON\x.exe`, `C:\Games\nul.exe`, `COM1`, `LPT9`, en mayúsculas y minúsculas) y componentes acabados en punto o espacio, en `executable` y en `cwd` → `ExecError('rejected')` **sin llamar** a `spawn`; las opciones exactas (`detached`, `stdio: 'ignore'`, `windowsHide: false`, sin `shell` ni `windowsVerbatimArguments`, `cwd`); entorno sin `LUDIARY_*` ni `NODE_*` en cualquier combinación de mayúsculas (`node_options`, `Ludiary_Test`); `EACCES` y `EPERM` → `denied`; otro error → `failed`; el `ExecError` resultante no tiene `cause` y su `message` no contiene la ruta ni los argumentos aunque el error de Node sí los lleve (`path`, `spawnargs`); `kinds` incluye `exec`.
- **`core`:** un conector doble con `exec`: lanza con `executable` y `cwd` dentro de `installPath`; rechaza fuera (también con `..`); `exec` recibe las rutas de `realPath`, no las del conector, y una unión dentro de `installPath` que tras canonizar sale de las raíces se rechaza; instalación cuya raíz se desactivó o quitó (o modo `later`) antes del siguiente escaneo → `not-installed` sin llamar al conector; `ExecError('denied')` → `launch.denied`; el registro de un lanzamiento no contiene la ruta ni los argumentos. Con Steam y GOG instalados para el mismo canónico no hay caso todavía (sin emparejamiento), pero sí: dos canónicos distintos, cada uno lanza con su conector.
- **`runtime`:** `createConnectors` registra los dos; la paridad de la CSP con `images.gog.com`; una plataforma sin `exec` rechaza el conector de GOG al arrancar (regla de la 72).
- **`i18n`:** paridad con `connectors/gog/locales`.
- **Playwright:** árbol de GOG de fixtures en una carpeta temporal (con un `.exe` de prueba vacío), `LocationResolver` doble que devuelve la carpeta del juego y `ProcessLauncher` que graba. Casos: la biblioteca muestra el juego de GOG con el icono de API no oficial en Ajustes; Jugar graba un `exec` con el ejecutable, los argumentos partidos y el `cwd` esperados.

#### 9. Prueba manual (la prepara el tester; la hace el usuario)

- **Preparación:** instalar GOG Galaxy desde gog.com, iniciar sesión, añadir a la cuenta **Beneath a Steel Sky** (producto 1207658695, gratuito: etiqueta «Free Game» en la API de GOG el 22 de octubre de 2026) e instalarlo desde Galaxy en una biblioteca con espacios y un carácter no ASCII, por ejemplo `D:\Juegos GOG Ñ`. Se elige porque es gratuito y, previsiblemente, se abre con ScummVM con argumentos entre comillas, lo que prueba `splitWindowsArgs` (supuesto G15).
- **Qué comprobar:**
  1. `reg query "HKLM\SOFTWARE\WOW6432Node\GOG.com\Games" /s`: existe la subclave `1207658695` con `path` apuntando a la carpeta (G1).
  2. En la carpeta existe `goggame-1207658695.info`. Copiar al ADR, saneados, sus campos `gameId`, `rootGameId`, `name` y la tarea principal (`type`, `path`, `arguments`, `workingDir`) para cerrar G3 a G5 y G15.
  3. Ludiary, con autodetección: Ajustes muestra la biblioteca como carpeta detectada de GOG; tras el escaneo, el juego aparece con portada vertical (G7, G9).
  4. Jugar con Galaxy **cerrado**: el juego arranca, en primer plano y con su ventana visible; Galaxy no se abre. Repetir con Galaxy abierto.
  5. Con «solo carpetas manuales», añadir la carpeta de la biblioteca: el juego aparece igual.
  6. Desinstalar desde Galaxy y escanear: el juego desaparece.
  7. Opcional: descargar el instalador sin conexión de BASS desde la biblioteca de gog.com, instalarlo en otra carpeta sin Galaxy y ver si aparece solo (G2).
  8. Opcional, si el usuario tiene un juego de GOG con DLC instalado: el DLC no sale como juego (G5).
  9. El registro exportado no contiene la ruta de la biblioteca ni los argumentos del juego.
  10. Con el juego abierto, parar Ludiary desde la bandeja (o con `--stop`): el juego sigue abierto. Volver a abrir Ludiary con el juego aún abierto: arranca en el mismo puerto y la biblioteca funciona.
  11. Si BASS (o el juego de prueba) usa DOSBox u otro programa de consola, comprobar que su ventana aparece (G16). Si no hay ninguno de consola entre los juegos de prueba, se anota como sin comprobar.

#### 10. Orden de implementación y trabajo en paralelo

1. **Primero** (`programador`, pequeño): comentario de `ProcessLauncher.exec` y `ExecError` en `contracts`; `launch.denied` en `core` con su clave.
2. **En paralelo:**
   - `conectores`: `connectors/gog` completo contra `connector-testkit` (puntos 3 a 6 y sus pruebas).
   - `programador` o `empaquetador`: `exec` en `platform-windows` con su segunda barrera y sus pruebas.
   - `auditor`: revisión de este diseño (`exec`, `splitWindowsArgs`, confinamiento a `installPath`, `windowsHide`, entorno del hijo) antes de que haya código.
3. **Después:** registro en `runtime`, CSP y `vite.config.ts`, textos, Playwright y revisión del `auditor` sobre el código.
4. **Al final:** prueba manual del usuario (punto 9), con los supuestos cerrados en este ADR, y el `documentalista`: guía de usuario (GOG detectado solo; añadir la carpeta si se usó el instalador sin conexión en un sitio no estándar; que Jugar abre el juego sin pasar por Galaxy), privacidad (petición a GamesDB con los IDs de GOG) y solución de problemas («Windows no ha permitido abrir el juego», «Este juego no indica cómo abrirse»).

#### 11. Lo que decide el usuario

1. **Cómo se abre un juego de GOG:**
   - (a) siempre directo, sin Galaxy (recomendado en este corte: funciona con y sin Galaxy, es lo más rápido y no depende de una sintaxis sin documentar). Coste: las partidas en la nube de GOG no se sincronizan al abrir desde Ludiary, y algunos juegos pueden querer Galaxy abierto para logros o multijugador;
   - (b) a través de Galaxy si está instalado, y directo si no (opción B del punto 4). Coste: abre Galaxy cada vez y depende de que Galaxy acepte el argumento `/path` tal como lo entrecomilla Node, que solo se sabe probándolo;
   - (c) un ajuste por tienda para elegir, con (a) por defecto. Coste: una pantalla y un ajuste más.
2. **Qué va después de este corte:** (a) el corte 2b, tiempo de juego, que cierra la 55 con Steam y GOG a la vez (recomendado: el lanzamiento ya está validado en las dos tiendas); (b) la cuenta de GOG junto con el emparejamiento entre tiendas; (c) el emparejamiento solo, antes de cualquier cuenta nueva.

#### Supuestos de GOG (verificar en la prueba manual; los marcados con «sin verificar» no tienen más fuente que la indicada)

- **G1:** cada producto instalado tiene una subclave de `HKLM\SOFTWARE\GOG.com\Games` (en `WOW6432Node`, vista de 32 bits) con el ID como nombre y, entre otros, los valores `path`, `gameID`, `gameName`, `exe`, `launchCommand` y `dependsOn`. Fuentes: wiki de GameFinder («every sub-key … is a game», y que se use la vista del registro y no `WOW6432Node` en la clave) y un hilo del foro de GameSave Manager. Sin documentación de GOG.
- **G2 (sin verificar):** el instalador sin conexión escribe la misma clave, y la biblioteca por defecto de Galaxy es `C:\Program Files (x86)\GOG Galaxy\Games`.
- **G3:** en Windows, `goggame-<id>.info` está en la raíz de la carpeta del juego. Comprobado en el código de `gogdl` (`launch.py`, `load_game_info`), que lo lee ahí.
- **G4:** el `.info` tiene `playTasks` con `isPrimary`, `path` y `workingDir` relativos a la carpeta del juego, y `arguments` como una sola cadena. Comprobado en `gogdl` (que usa esos campos) y en la documentación de GOG para desarrolladores («This path is relative to the game root directory»; dos tipos de tarea, de fichero y de URL). El nombre `type` con valores `FileTask` y `URLTask` sale de foros de GOG.
- **G5 (sin verificar):** el `.info` tiene `gameId`, `rootGameId` y `name`, y cada DLC instalado deja su propio `.info` en la carpeta del juego base con `rootGameId` igual al del juego. `gogdl` no los usa.
- **G6 (sin verificar):** algunos juegos antiguos pueden no tener `playTasks`. Si pasa, Jugar muestra «Este juego no indica cómo abrirse»; la alternativa sería leer `exe` del registro, que exige el tipo de ubicación descartado en el punto 3.
- **G7:** GamesDB (`gamesdb.gog.com/platforms/gog/external_releases/<id>`) responde sin cuenta con `game.vertical_cover.url_format` en `images.gog.com`. Comprobado el 22 de octubre de 2026 con 1207658695. API no oficial: si cambia, el paso de medios falla con aviso y queda el degradado.
- **G8 (sin verificar):** GamesDB da 404 para un ID desconocido, y su límite de peticiones tolera 6 en paralelo. Si da 429 o el lote no cabe en 15 s, se baja la concurrencia o el tamaño del lote.
- **G9 (sin verificar):** `images.gog.com` sirve sin redirigir a otro host.
- **G10:** el entrecomillado de Node (libuv) es la inversa de las reglas del CRT de Microsoft. Un juego que analice a mano su línea de órdenes podría ver otras comillas si sus argumentos las llevan; quien lea `GetCommandLineW` ve la línea tal como la vuelve a entrecomillar libuv, no la cadena original del `.info`. La prueba de BASS lo cubre en parte.
- **G11 (sin verificar):** `spawn` de un ejecutable que exige administrador falla con `EACCES` (`ERROR_ELEVATION_REQUIRED` traducido por libuv).
- **G12 (sin verificar):** los juegos de GOG no necesitan Galaxy para arrancar (sin DRM); los que usan su SDK pueden necesitarlo para logros o multijugador.
- **G13:** `GalaxyClient.exe /command=runGame /gameId=<id> /path="<ruta>"` arranca un juego. Solo foros de GOG y de Lutris. No se usa salvo que el usuario elija (b) o (c) en el punto 11.1.
- **G14:** Galaxy no registra un esquema de URI para lanzar juegos. Hilo antiguo del foro de GOG; no se usa.
- **G15 (sin verificar):** Beneath a Steel Sky se abre con ScummVM y una tarea con argumentos entre comillas.
- **G16 (sin verificar):** con `detached: true`, un ejecutable de consola (DOSBox) puede arrancar sin ventana de consola visible. Si pasa, decisión aparte con el auxiliar de Go y `CREATE_NEW_CONSOLE`; nunca un intérprete de órdenes.

**Prueba manual del usuario (22 de octubre de 2026, Windows 11, Galaxy instalado, juego Cold Waters 1512372112 en `F:\GOG Galaxy\Games ñ\Cold Waters`):** «funciona como un tiro». Ludiary lo detectó solo, con la biblioteca en una unidad y carpeta no estándar con «ñ». Portada y Jugar: incluidos en ese «funciona», sin detalle paso a paso. Comprobado además, solo leyendo:
- **G1, confirmado:** la subclave `1512372112` está en `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games` (no existe `HKLM\SOFTWARE\GOG.com\Games` sin `WOW6432Node`), con `path`, `gameID`, `gameName`, `exe`, `launchCommand`, `launchParam`, `workingDir`, `dependsOn` y `DLC`, entre otros.
- **G3, confirmado:** `goggame-1512372112.info` está en la raíz de la carpeta del juego, junto a `.hashdb`, `.ico` y `.script`.
- **G4, confirmado:** la tarea principal es `{"type":"FileTask","isPrimary":true,"category":"game","path":"ColdWaters.exe"}`, relativa y sin `arguments` ni `workingDir`. Hay además tareas `FileTask` de documento (un PDF) y `URLTask`, sin `isPrimary`, que el conector no usa.
- **G5, en parte:** el `.info` del juego base tiene `gameId`, `rootGameId` (igual a `gameId`) y `name`. Los DLC siguen sin probar.
- **G2:** la biblioteca de Galaxy del usuario no es la predeterminada y se encontró por el registro; la carpeta predeterminada y el instalador sin conexión siguen sin probar.
- Sin probar en esta pasada: G6, G8, G9, G10/G15 con argumentos (Cold Waters no lleva), G11, G12 sin Galaxy, G16 y los pasos 9 a 11 de la guía.

Fuentes consultadas el 22 de octubre de 2026: [GameFinder, GOG Galaxy](https://github.com/erri120/GameFinder/wiki/GOG-Galaxy); [foro de GameSave Manager](https://forum.gamesave-manager.com/viewtopic.php?t=76&p=207); [`gogdl`, `launch.py`](https://github.com/Heroic-Games-Launcher/heroic-gogdl/blob/main/gogdl/launch.py); [GOG, tareas de Build Creator](https://docs.gog.com/bc-tasks/); [foro de GOG, lanzar un juego de Galaxy desde fuera](https://gog.com/forum/general/how_to_open_a_specific_galaxy_launcher_game_via_external_link); [foro de Lutris](https://forums.lutris.net/t/how-to-add-gog-galaxy-features-to-no-mans-sky-or-any-gog-game-i-guess/20531); respuestas de `api.gog.com/v2/games/1207658695`, `api.gog.com/products/1207658695` y `gamesdb.gog.com/platforms/gog/external_releases/1207658695`.

**Motivo:** es el corte más pequeño que valida `exec` de principio a fin con la tienda que lo necesita, sin secretos de terceros y **sin cambiar el contrato**: el registro, `discoverRoots`, `resolveMedia` y la regla 5 ya existían. Usar el `.info` como fuente única hace que el mismo código sirva para Galaxy, para el instalador sin conexión y para carpetas manuales. Lanzar el ejecutable del juego confina el `exec` a la carpeta del juego, que es la barrera más fuerte que permite el contrato, y evita depender de la sintaxis sin documentar de Galaxy. Alternativas descartadas: el registro como fuente de datos (un tipo nuevo de ubicación y cambios en el auxiliar para datos que ya da el `.info`); una raíz por juego (Ajustes lleno y tope de 64); `windowsVerbatimArguments` con la cadena del `.info` tal cual (pasaría al proceso texto sin validar argumento a argumento y abre la puerta a reglas de comillas propias); `api.gog.com` para las portadas (sin portada vertical útil).

**Consecuencias:**

- Primera ejecución de un `.exe` arbitrario del disco del usuario. El `auditor` revisa antes de cerrar: `exec` y su segunda barrera, `splitWindowsArgs`, que el `exec` no pueda salir de `installPath`, las opciones de `spawn`, el entorno del hijo, que el registro no lleve rutas ni argumentos, la CSP y las fixtures.
- Segunda tienda con salida de red (`gamesdb.gog.com`) y segundo host de imágenes en la CSP.
- El punto (C) de la decisión 72 queda resuelto: GOG antes del corte 2b.
- La afirmación de la 72 de que el emparejamiento llega «con la segunda tienda» queda revisada: llega en su propio corte (punto 1).
- Los agentes `conectores`, `programador` y `empaquetador` tienen aquí su especificación; el `tester` prepara la prueba manual del punto 9; el `documentalista` actualiza las guías del punto 10.

### 77. Cuenta de GOG: login oficial con código pegado, sesión cifrada y juegos no instalados (amplía las decisiones 40, 43, 50, 74 y 76; revisa para GOG la regla 7 de la 40 y, de la 76, la vía de la cuenta y el orden del emparejamiento)

**Decisión (recomendada, 22 de octubre de 2026):** el 22 de octubre de 2026 el usuario pide ver los juegos de su cuenta de GOG y decide hacer este corte **ahora, antes del corte 2b** (tiempo de juego). Eso responde al punto 11.2 de la decisión 76 con la opción (b), **pero sin el emparejamiento entre tiendas**. Es el equivalente de la 74 para GOG y reutiliza todo lo que la 74 dejó hecho: motor de asistentes, `SecretCipher`, tabla `secrets`, `store_connections`, paso con campo y Pegar, `HttpClient` con lista de hosts y `maxBytes`, operación `library` del núcleo, `install`, desconectar y velo gris.

**Punto de partida:** el corte de la 76 funciona con el Galaxy real del usuario (Cold Waters, 1512372112). Lo que sigue sobre la cuenta sale de fuentes públicas y de dos peticiones sin cuenta a `api.gog.com` hechas el 22-10-2026. Queda como supuesto (lista del final) hasta la prueba manual del punto 10.

#### 1. Alcance

- **Entra:**
  - el asistente de GOG de la decisión 43: abrir el login oficial de GOG, Pegar la dirección final y canjear el código;
  - la sesión de GOG (solo el refresh token) cifrada en `secrets`, y su renovación en cada sincronización;
  - `listLibrary` con los juegos poseídos, para mostrar los no instalados con la acción `install`;
  - `install`, que abre la ficha del juego en GOG Galaxy;
  - desconectar y el estado `expired`, con el velo gris de la 74;
  - el nombre de la cuenta («Conectado como …»), con el mismo criterio que el usuario eligió para Steam (punto 12).
- **Fuera, cada parte con su motivo:**
  - **Emparejamiento entre tiendas** (decisión del usuario). No es imprescindible: un juego poseído en Steam y en GOG sale dos veces, una por tienda, cada una con su insignia y sus acciones. No se pierde ningún dato y nada se fusiona mal. El corte del emparejamiento tendrá que unir también los datos del usuario de los dos canónicos, pero ese problema ya existe hoy con los instalados. Revisa la frase de la 76 («el emparejamiento va antes o junto con ella»).
  - **`gogdl` y `ExternalToolRunner`** (punto 2).
  - **DLC.** `user/data/games` los incluye y el catálogo dice cuáles son (`game_type: "dlc"`), pero el núcleo aún los descarta y el modelo no tiene `base_store_game_id` (decisiones 21, 52 y 76). Se saltan y se cuentan en el registro; `dlc` sigue en `'none'`.
  - **Tiempo de juego de GOG** (`gameplay.gog.com`, que usa Heroic): `storePlaytime` sigue en `false`. Va con el corte 2b o con uno propio.
  - **Portadas en `listLibrary`.** No se piden aquí: el paso de medios de la 73 ya resuelve con GamesDB (decisión 76, punto 5) todas las propiedades sin medios, también las no instaladas.
  - **Ventana integrada de login** (mejora prevista en la 43).

#### 2. Vía de acceso: HTTP directo frente a `gogdl`

- **A. HTTP directo desde el conector con el `HttpClient` de la 74** (se elige).
  - Ventajas:
    - todo son cuatro peticiones `GET` sencillas (canje, renovación, biblioteca y catálogo);
    - no hay binario nuevo que empaquetar, firmar y actualizar (`gogdl` es Python empaquetado con PyInstaller);
    - no hace falta el `ExternalToolRunner`: carpeta temporal privada, rehidratarla desde el almacén y volver a cifrarla (regla 7 de la 40), que es la pieza más delicada que quedaba por construir;
    - los tokens nunca tocan el disco en claro;
    - las respuestas grabadas se prueban con el `fakeHttp` que ya existe.
  - Coste: el conector reimplementa el canje y la renovación, unas 60 líneas. Si GOG cambia el flujo, hay que seguir a `gogdl` a mano.
- **B. `gogdl auth --code <código>` como herramienta externa** (regla 7 de la 40).
  - Ventaja: se hereda el mantenimiento de Heroic.
  - Costes: el binario, el `ExternalToolRunner` completo, analizar su salida estándar (que lleva los tokens) y una licencia GPL-3.0 más que cumplir al distribuir. Es compatible con la nuestra, pero obliga a publicar su código correspondiente con cada versión. Todo eso para cuatro peticiones.
- **Revisa para GOG la regla 7 de la decisión 40:** GOG no usa `gogdl` y su manifiesto mantiene `externalTools: []`. `ExternalToolId` conserva `'gogdl'`, sin cambiar el tipo, por si algún día se descargan juegos. La regla sigue igual para `legendary` (Epic).

**Identificador de cliente.** GOG no ofrece un registro OAuth público para aplicaciones de terceros (supuesto GA1). Se usa el identificador de cliente de Galaxy (`client_id` `46899977096215655` y su `client_secret`, documentados en gogapidocs). Es lo mismo que hacen `gogdl`, Heroic, Lutris y Comet.

- **Invariante 8.** La vía oficial que existe es el login de GOG, y se usa: el usuario escribe su contraseña y su segundo factor en `auth.gog.com`, nunca en Ludiary. No se toca ninguna sesión de Galaxy ni del navegador (decisión 43). Lo que no es oficial es presentarse ante GOG con el identificador de Galaxy. Por eso el conector sigue con `access: 'unofficial-api'` y su icono de fragilidad (decisión 40).
- **Riesgo legal y de condiciones de uso (no es asesoría legal).** GOG podría considerar que suplantar a su cliente infringe sus condiciones, o cambiar el secreto o bloquearlo. La tolerancia actual se deduce del uso público y prolongado por parte de Heroic, Lutris y Playnite, sin que conste una prohibición expresa (supuesto GA1). Mitigación: el fallo queda aislado en el conector (invariante 2), el escaneo y Jugar siguen funcionando sin cuenta, la guía lo explica y el proyecto no se declara afiliado. Si GOG publicara un registro de aplicaciones, se migra a él con una decisión nueva.
- **El `client_secret` de Galaxy no es un secreto del invariante 5.** Es el mismo en todas las instalaciones de Galaxy y está publicado en su binario y en varios repositorios públicos. Sin el login del usuario no da acceso a nada. Va como constante en `connectors/gog/src/auth.ts`, con un comentario que lo explica. El ADR no copia su valor (está en la fuente citada). El `auditor` lo confirma, y si se usa un escáner de secretos en el repositorio, esa constante va en su lista de excepciones.

#### 3. Flujo de login y canje

- **Ida (la URL la construye el conector y es fija):** `https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=client2`.
  - La vuelta llega a una página de GOG, nunca al servidor local (decisión 43). Por eso no se usa `callbackUrl`, ni `/connect/return`, ni `sessionStorage`.
  - El enlace se abre en **pestaña nueva**, la regla general de la 68: el paso espera un campo, no una vuelta.
- **Al terminar el login**, el navegador queda en `https://embed.gog.com/on_login_success?origin=client&code=<código>` (supuesto GA2). El usuario copia la dirección y pulsa Pegar. El núcleo aplica `extract: 'url-query:code'` y valida el resultado (decisión 74, punto 5).
- **Canje** (`connectors/gog/src/auth.ts`, `exchangeCode`): `GET https://auth.gog.com/token` con la consulta `client_id`, `client_secret`, `grant_type=authorization_code`, `code` (como `Secret`) y `redirect_uri`, que debe ser exactamente la de la ida.
  - 200 con JSON y `access_token` y `refresh_token` de texto que cumplen `^[A-Za-z0-9_-]{64,4096}$` (revisión del auditor, M2; supuesto GA13): correcto. Si no cumplen: `store.unexpected-response`.
  - 400 o 401 (código caducado, ya usado o mal copiado; supuesto GA7): `auth.invalid` con la clave `connectors.gog.error.code` («El código ha caducado o ya se usó. Vuelve a iniciar sesión y pega la dirección nueva»). El núcleo responde `rejected` y el usuario sigue en el mismo paso, con el mismo enlace.
  - 429: `store.rate-limited`. Cualquier otro estado, o un JSON sin esos campos: `store.unexpected-response`.
  - Se ignoran `user_id`, `session_id` y `expires_in`: el identificador de cuenta no se guarda en ningún sitio.
- **Repetición:** un código solo vale una vez en GOG, y el asistente ya caduca a los 15 minutos (decisión 74). No hace falta nada más.

#### 4. Pasos del asistente de GOG

| Id | Tipo | Qué hace |
|---|---|---|
| `login` | `open-external`, `awaits: 'input'`, con campo | La URL del punto 3. Cuerpo: «Inicia sesión en GOG en la pestaña nueva. Al terminar verás una página casi en blanco: copia su dirección completa de la barra y pulsa Pegar». Campo `redirectUrl`: `secret: true`, `paste: true`, `extract: 'url-query:code'`, `pattern: '^[A-Za-z0-9_-]{10,512}$'` (supuesto GA12) y `maxLength: 2048`. |

- Un solo paso, el que ya pinta el simulador (`apps/web/src/data/mock.ts`). Sin paso `choose`: «solo instalados» ya es el modo de GOG sin conexión (decisión 76), y cancelar lo deja así.
- **Al enviar `redirectUrl`:**
  1. Canje (punto 3).
  2. `secrets.set('refreshToken', …)`.
  3. Nombre de la cuenta, sin que un fallo bloquee: `GET https://embed.gog.com/userData.json` con `authorization: Bearer <access_token>`. Se lee **solo** `username`, se quitan los caracteres de control, se recorta a 64 y se devuelve como `accountLabel`. Cualquier fallo da `done` sin nombre («Conectado») y un registro con solo el código. La respuesta trae también el correo y otros datos: no se guardan ni se registran, y el objeto se descarta enseguida (supuesto GA10).
  4. `done`.
- No hay llamada de prueba aparte: el canje correcto ya prueba la sesión, y `done` lanza la primera sincronización forzada (decisión 74), cuyo error se ve en la tarjeta de GOG.
- El token de acceso del canje se usa solo para el paso 3 y se descarta.

#### 5. Sesión y tokens (decisión 46, mínimo de este corte)

- **Qué se guarda:** solo `refreshToken`, cifrado en `secrets` con el ámbito `store:gog` (decisión 74, punto 6). El token de acceso, que dura unos 3600 s (supuesto GA3), **no se guarda nunca**. Vive en memoria durante una operación y luego se descarta.
  - Motivo: la sincronización va como mucho cada 30 minutos y casi siempre con más espacio (decisión 50). Guardar el token de acceso solo ahorraría una petición a cambio de un segundo secreto que proteger y de lógica de caducidad.
- **Renovación** (`refreshSession`, al principio de cada `listLibrary`): `GET https://auth.gog.com/token` con la consulta `client_id`, `client_secret`, `grant_type=refresh_token` y `refresh_token` (como `Secret`).
  - 200 válido (mismas reglas que el canje): **lo primero** es `secrets.set('refreshToken', <nuevo>)`, y después se usa el token de acceso. GOG entrega un refresh token nuevo y el anterior puede dejar de valer (supuesto GA4). Si se usara antes de guardarlo y el proceso cayera, la sesión se perdería.
  - 400, 401 o 403 (sesión revocada, caducada o cambio de contraseña; supuesto GA7): `auth.expired` con la clave `connectors.gog.error.expired`. El núcleo pone `store_connections.status = 'expired'` y no toca la biblioteca (decisión 74, punto 7). La fila del secreto no se borra: reconectar la sobrescribe.
  - 429: `store.rate-limited` con `Retry-After`. Error de red: su código, **sin** pasar a `expired`. Cualquier otro estado: `store.unexpected-response`.
  - Sin `refreshToken` legible (clave perdida o compartimento): `auth.required`, y la tienda se ve `expired`, como en Steam.
- **Concurrencia:** solo `listLibrary` renueva, y la cola por tienda del núcleo nunca ejecuta dos operaciones `library` de GOG a la vez (decisión 74). `install`, `play`, el escaneo y los medios no usan la sesión.
- **`connection.status`** es local, sin red: `connected` si se lee `refreshToken`; si no, `expired`. Se combina con `store_connections.status` como en la 74.
- **Nunca salen:** los tokens y el código no aparecen en ninguna respuesta de la API, en ningún registro (el `HttpClient` no registra consulta, cabeceras ni cuerpo; decisión 74, punto 8), en ningún `message` ni `params` de un `ConnectorError`, ni en el `wizardState` en ningún momento (revisión del auditor, B4): el canje y el `set` ocurren en el mismo envío. La cabecera `authorization` se construye como `makeSecret('Bearer ' + token.reveal())` y se revela solo al enviar.
- **Redactor** (`makeRedactor`, `runtime/src/files.ts`): añade `(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{64,}(?![A-Za-z0-9_-])` → `[redacted]` (revisión del auditor, M2). Por construcción es un superconjunto de los tokens que el conector acepta (`^[A-Za-z0-9_-]{64,4096}$`): un token aceptado nunca escapa al redactor. Es la red bajo `Secret` para tokens opacos largos, y tapa también el `client_secret` (supuesto GA13). Se acepta que tape algún hash de 64 caracteres, como ya se aceptó con la clave de Steam.

#### 6. Biblioteca

- **Opciones:**
  - **A. `embed.gog.com/user/data/games` más `api.gog.com/products?ids=` por lotes** (se elige). La primera da los ID poseídos con el token. La segunda, **sin token**, da el título y el tipo de hasta 50 productos por petición. Con 500 juegos son unas 12 peticiones.
  - B. `embed.gog.com/account/getFilteredProducts?mediaType=1&page=N`: títulos paginados en una sola fuente, pero Lutris la llama con las cookies de una sesión web y no consta que acepte el token (sin verificar). Se descarta.
  - C. `galaxy-library.gog.com/users/<user_id>/releases` (Heroic): paginada con `page_token`, pero sin títulos. Obliga a una petición a GamesDB por juego (cientos), necesita el `user_id` y mezcla otras plataformas. Se descarta.
- **`listLibrary`** (`connectors/gog/src/library.ts`):
  1. `refreshSession` (punto 5).
  2. `GET https://embed.gog.com/user/data/games` con `authorization: Bearer`.
     - 401 o 403: `auth.expired`. Una redirección (3xx; el cliente no las sigue) o cualquier otro estado distinto de 200: `store.unexpected-response` (supuesto GA7). 429: `store.rate-limited`.
     - Cuerpo `{ "owned": [ … ] }`. Cada elemento es un entero, o una cadena de dígitos, de 1 a 20 cifras; el resto se salta y se cuenta. Sin `owned` como lista: `store.unexpected-response`. Más de 50 000 ID: `store.unexpected-response` (el tope de entradas de la 74).
     - Incluye juegos, DLC, packs y quizá películas, ocultos incluidos (supuesto GA5). Se quitan los repetidos.
  3. Lotes de 50, **en serie**: `GET https://api.gog.com/products` con `ids=<id,id,…>`, sin token y sin cabeceras propias.
     - 200 con una lista. Por elemento:
       - `id` (número o cadena de dígitos) que esté en el lote pedido; si no, se salta;
       - `title` de texto, sin caracteres de control, recortado y como mucho 300 caracteres (el límite del núcleo; corregido tras la auditoría del código, que vio el 500 inicial, también en Steam, chocar con él y dejar `complete` en falso); si falta, `GOG <id>`;
       - `game_type === "game"` → `{ storeGameId, kind: 'game', title }`, sin `media` ni `externalIds`;
       - `dlc`, `pack` u otro valor: se salta y se cuenta por tipo en el registro.
     - Un ID pedido que no vuelve (producto retirado del catálogo, película o ID desconocido; supuesto GA6) se salta y se cuenta. **No** hace la instantánea parcial: se sabe que se posee, pero no se puede mostrar.
       - `shortcut:` un juego retirado del catálogo no aparece y, si estaba guardado, se da de baja. Si la prueba manual muestra juegos poseídos que faltan, el respaldo es pedir esos ID a GamesDB (`title`, `type`), que ya está en `apiHosts`.
     - 429: `store.rate-limited` con `Retry-After`. Cualquier otro estado o un cuerpo que no es una lista: `store.unexpected-response` para toda la sincronización. La biblioteca no se toca, y así un lote fallido nunca da de baja juegos.
  4. `complete: true` si todas las peticiones fueron correctas y no se saltó ningún elemento mal formado de `owned`, con la misma regla que Steam.
- **Tiempo:** en serie caben unos 2000 juegos en los 60 s de la operación (decisión 74). Si un usuario real se acerca a ese límite, se pasa a 2 lotes en paralelo.
- **Núcleo:** sin cambios. La operación `library` de la 74 es genérica por conector. El intervalo es el de la 50 y la 74: un suelo de 30 minutos, 12 horas al abrir la web y el doble del suelo tras un error. Mismo ID de producto que el `.info` = misma propiedad, por el índice único. El título de la API sustituye al `name` del `.info` en las propiedades poseídas (regla de la 74). La guarda de la instantánea vacía también vale aquí.
- **Portadas:** el paso de medios que sigue a una sincronización correcta (decisión 73) pide a GamesDB las propiedades nuevas, como mucho 1000 por pasada (20 lotes de 50). Con una biblioteca grande, la primera pasada es la mayor carga sobre GamesDB hasta ahora (supuesto G8 de la 76). Si responde 429, el paso ya se para y lo reintenta más tarde, sin tocar nada.

#### 7. Instalar

- **Opciones:**
  - **A. `goggalaxy://openGameView/<productId>`** (se elige). Abre la ficha del juego en Galaxy, con su botón Instalar. Es lo que usa Playnite cuando no puede pedir la instalación directamente (supuesto GA8). No instala nada sin que el usuario lo confirme.
  - B. `GalaxyClient.exe /gameId=<id> /command=installGame` (Playnite, con Galaxy abierto). Tiene la misma sintaxis sin documentar y el mismo problema de comillas que la opción B del punto 4 de la 76. Se descarta.
  - C. Abrir la ficha `https://www.gog.com/game/<slug>` (`links.product_card`). Hoy no cabe en el contrato: `uriSchemes` prohíbe `https` (`checkConnectorManifest`), y el slug habría que guardarlo. Haría falta una decisión nueva. Queda como pregunta al usuario para cuando no hay Galaxy (punto 12.2).
- **`resolveAction('install')`** (`connectors/gog/src/launch.ts`):
  - mismo control de `^\d{1,20}$`;
  - si `ctx.launchersResolved`, busca la ubicación `gog-galaxy-client` y comprueba que existe `GalaxyClient.exe` dentro (`ctx.fs.exists(ctx.fs.join(path, 'GalaxyClient.exe'))`). Si no está: `launch.launcher-missing` con la clave `connectors.gog.errors.galaxyMissing` («Para instalar este juego hace falta GOG Galaxy. Instálalo desde gog.com o descarga el instalador desde tu biblioteca de gog.com»);
  - devuelve `{ kind: 'uri', uri: 'goggalaxy://openGameView/<id>' }`.
  - Es la misma forma que Steam.
- **`play` no cambia** (decisión 76): `exec` directo.
- **Ubicación nueva** (`locations`), `gog-galaxy-client` (`launcher`): `{ kind: 'registry-value', hive: 'HKLM', key: 'SOFTWARE\\GOG.com\\GalaxyClient\\paths', value: 'client', view: '32' }`, la carpeta del cliente según Playnite (supuesto GA9).
  - ~~Efecto secundario: la regla 5 de la 40 permite un `exec` también dentro de las ubicaciones `launcher`. Se acepta, porque el conector nunca lo construye.~~ **Revisado tras el auditor (A1):** la carpeta de Galaxy incluye su biblioteca por defecto, así que esa ampliación dejaba lanzar cualquier `.exe` de otros juegos. Se decide: las ubicaciones `launcher` **no amplían** el confinamiento del `exec`; el núcleo (`checkSpec`) solo acepta `executable` y `cwd` dentro de `installPath` de la propiedad (revisa la regla 5 de la 40). Las ubicaciones `launcher` siguen sirviendo para comprobar que un cliente existe y para las URI. Si un día se lanza a través de Galaxy (punto 11.1 de la 76), hará falta una regla propia con el ejecutable exacto del cliente, en una decisión nueva.
- La web pinta «Instalar» y, al pulsar, «Abriendo GOG Galaxy…» (`game.installing` con `{store}`).

#### 8. Manifiesto y contrato (`contractVersion` sigue en 1)

**No cambia ningún tipo ni ninguna regla del contrato.** Cambia solo el manifiesto de GOG:

```ts
// connectors/gog/src/index.ts — ADR 77 (changes over ADR 76)
capabilities: {
  library: true, scan: true, dlc: "none",
  actions: ["play", "install"], launchKinds: ["exec", "uri"], uriSchemes: ["goggalaxy"],
  storePlaytime: false, price: false,
},
authHosts: ["auth.gog.com"],
apiHosts: ["auth.gog.com", "embed.gog.com", "api.gog.com", "gamesdb.gog.com"],
mediaHosts: ["images.gog.com"],                    // unchanged; CSP unchanged
locations: [...GOG_LOCATIONS, GOG_GALAXY_CLIENT],  // point 7
externalTools: [],                                 // point 2
connection: gogConnection,                         // wizard.ts
listLibrary: listGogLibrary,                       // library.ts
```

- `checkConnectorManifest` lo acepta tal cual: tiene `connection` con `authHosts`, `library` con `apiHosts`, y `uri` con un esquema que no está prohibido.
- **Ficheros nuevos** en `connectors/gog/src`: `auth.ts` (URL de ida, canje, renovación y constantes de cliente), `wizard.ts` y `library.ts`. `launch.ts` y `manifest.ts` crecen. Claves nuevas en `locales/`:
  - `connectors.gog.login.title`, `connectors.gog.login.body` y `connectors.gog.login.field` (ya las usa el simulador);
  - `connectors.gog.error.code` y `connectors.gog.error.expired`;
  - `connectors.gog.errors.galaxyMissing`;
  - `connectors.gog.disconnect.hint`.
- **Web** (`apps/web/src/data/real.ts`): `isSteam` pasa a ser «tienda con asistente real», con la lista cerrada `['steam', 'gog']`. La ruta pasa a ser `/api/stores/${store}/wizard` y `disconnect` va a `/api/stores/${store}/connection`. El `wizardId` de GOG vive solo en memoria: sin redirección no hace falta `sessionStorage`, que sigue siendo exclusivo de Steam. `getStores` deja de superponer el estado simulado también sobre GOG. `ConnectWizard` ya pinta el paso con enlace y campo (el de la clave de Steam). Lo único nuevo es que el enlace de GOG abre en pestaña nueva, que ya es el comportamiento por defecto.
- **Núcleo, `api`, `db` y `platform-*`:** sin cambios de código previstos. La 74 ya los dejó genéricos por tienda. Si al implementar aparece algo específico de Steam en el núcleo (por ejemplo, el título que sigue a la propiedad «de Steam»), se generaliza a «de la propiedad poseída» sin otra decisión.

#### 9. Desconectar y caducidad

- **Igual que la 74, con la opción (c) que eligió el usuario** (punto 12.1 de la 74), que se aplica a GOG con el mismo criterio:
  1. `connection.disconnect` borra `refreshToken`;
  2. el núcleo borra el ámbito `store:gog`, la fila de `store_connections` y el `sync_state` de `library`;
  3. las propiedades no se tocan, y los juegos no instalados quedan con el velo gris (`unsynced`), con el texto de la tienda.
- **Sin revocación remota:** no consta un punto de GOG para revocar un refresh token (sin verificar). `connectors.gog.disconnect.hint` dice lo verificable: «Ludiary borra su sesión de GOG de este equipo. Para cerrar todas las sesiones, cambia la contraseña en gog.com». No se promete más.
- **Sesión caducada o revocada:** la renovación falla (punto 5), la tienda pasa a `expired`, la biblioteca se queda como estaba con el velo, y la tarjeta muestra «Hay que volver a conectar». Reconectar sobrescribe el secreto. La duración de un refresh token sin usar no consta (supuesto GA4): quien no abra Ludiary en mucho tiempo puede tener que reconectar.
- **Clave maestra perdida o compartimento:** igual que Steam: `expired`, sin red y sin tocar la biblioteca.

#### 10. Pruebas

- **Fixtures inventadas:**
  - código `gog-test-auth-code-0001`;
  - tokens `gog-test-access-token` y `gog-test-refresh-token`, y para la rotación `gog-test-refresh-token-2`;
  - `user_id` `10000000000000001`;
  - `username` `TestUser`, sin campo de correo;
  - ID de producto `1000000001`… como en la 76.
  - La única respuesta real es la pública del catálogo, `api.gog.com/products?ids=1207658695,1512372112,1120912052` (datos de catálogo, un juego y un DLC).
- **Comprobación de privacidad** (`packages/connector-testkit/src/privacy.ts`): añade a `ALLOWED` las constantes de los tres tokens y del código, como hizo la 74 con Steam. La regla «credential field» ya rechaza cualquier otro `access_token`, `refresh_token` o `client_secret` con valor. Por eso las pruebas comparan la URL pedida con la constante importada de `auth.ts` y **no** escriben el `client_secret` en ningún fichero de `fixtures/`.
- **`connectors/gog`:**
  - URL de ida exacta: host, `client_id`, `redirect_uri` codificada, `response_type` y `layout`.
  - Canje:
    - consulta exacta, con el código como `Secret` y la misma `redirect_uri`;
    - 400 y 401 → `auth.invalid` con `connectors.gog.error.code`;
    - 429;
    - 500;
    - JSON sin `refresh_token` o con un token que no cumple el patrón;
    - éxito → un solo `secrets.set('refreshToken')` y `done`.
  - Nombre:
    - solo `username`, saneado y recortado;
    - un fallo de `userData.json` → `done` sin nombre;
    - el correo de la respuesta no aparece en el resultado ni en el registro.
  - Renovación:
    - `set` del token nuevo **antes** de la petición a `embed.gog.com` (orden comprobado con el doble);
    - 400, 401 y 403 → `auth.expired`;
    - error de red → no es `auth.*`;
    - sin `refreshToken` → `auth.required`.
  - `listLibrary`:
    - `owned` con enteros y cadenas, repetidos, valores no numéricos (`complete: false`) y más de 50 000;
    - lotes de 50 exactos y en serie;
    - `game_type` `game`, `dlc` y `pack`;
    - ID que no vuelve (no cambia `complete`);
    - `id` fuera del lote;
    - título ausente → `GOG <id>`;
    - 3xx, 401, 429 y 500 en cada petición;
    - cuerpo que no es una lista;
    - la cabecera `authorization` va solo a `embed.gog.com`, nunca a `api.gog.com`.
  - `resolveAction('install')`:
    - URI exacta;
    - Galaxy ausente con `launchersResolved` → `launch.launcher-missing`;
    - sin resolver → URI;
    - ID no numérico.
  - `play` sin cambios.
  - `assertConnectorConformance` con el manifiesto nuevo.
  - Ningún `ConnectorError` lleva un token, el código o el nombre de la cuenta.
- **`runtime`:** el redactor tapa un token opaco de 64 caracteres o más dentro de un mensaje.
- **`core`:** un conector doble de segunda tienda con `library` recorre el camino de la 74 sin código nuevo: `connected` → sincronización forzada → no instalados con `install` → desconectar → velo. Además, `auth.expired` en `listLibrary` → `expired`.
- **`api`:** la búsqueda sobre todas las respuestas de la prueba de la 74 se amplía a los tokens y al código de GOG.
- **Web:** `real.ts` envía GOG a la API (`/api/stores/gog/wizard`) sin `sessionStorage`, y Epic sigue en el simulador.
- **Playwright:** asistente de GOG contra un GOG doble (canje, `user/data/games` y `products` grabados) → juegos no instalados → Instalar graba `goggalaxy://openGameView/<id>`. Desconectar los deja con velo.
- **Guía manual** (`docs/manual-tests/gog.md`; la prepara el `tester` y la hace el usuario). Se añade una sección «Account (ADR 77)» con estos pasos:
  1. Conectar desde Ajustes en Chrome, Edge y Firefox: el login abre en pestaña nueva, la página final tiene `code=` en la dirección, y Pegar la acepta (GA2, GA12). Anotar solo la forma del código (longitud y caracteres), nunca el código.
  2. «Conectado como <nombre>» (GA10).
  3. Juegos no instalados en la biblioteca: el número coincide con la biblioteca de gog.com sin contar DLC; los ocultos en gog.com aparecen (GA5); ningún juego poseído falta (GA6). Si falta alguno, anotar su ID.
  4. Cold Waters (instalado) sale una sola vez, con el título de la API, y su DLC (OST) no sale.
  5. Instalar un juego no instalado con Galaxy instalado: se abre su ficha en Galaxy (GA8). `reg query "HKLM\SOFTWARE\WOW6432Node\GOG.com\GalaxyClient\paths"` tiene `client` (GA9). Comprobar también si `HKCU\Software\Classes\goggalaxy` o `HKLM\SOFTWARE\Classes\goggalaxy` existe.
  6. Sincronizar dos veces separadas por más de 30 minutos: sigue conectado (renovación y rotación, GA4).
  7. Cerrar sesiones o cambiar la contraseña en gog.com y sincronizar: `expired` y «Hay que volver a conectar»; reconectar (GA7).
  8. Desconectar: velo gris en los no instalados; Cold Waters sigue jugable.
  9. El registro exportado no contiene `code=`, `Bearer`, tokens, `client_secret`, el nombre de la cuenta ni el correo.
  10. Opcional: con Galaxy desinstalado, Instalar muestra «Para instalar este juego hace falta GOG Galaxy».

#### 11. Orden de implementación y trabajo en paralelo

1. **Primero** (`tester` o `programador`, pequeño): las constantes inventadas en `privacy.ts`. No hay cambios en `contracts` ni en `api-contract`.
2. **En paralelo:**
   - `conectores`: `auth.ts`, `wizard.ts`, `library.ts`, `install` en `launch.ts`, la ubicación nueva, el manifiesto, los textos, las fixtures y sus pruebas, todo contra `connector-testkit`.
   - `programador`: `real.ts` (punto 8), el patrón del redactor y la prueba de `core` con un conector doble de segunda tienda.
   - `auditor`: revisión de este diseño antes del código: el identificador de Galaxy en el repositorio, el orden de guardado en la renovación, la cabecera `Bearer` como `Secret`, el redactor y la ubicación `launcher` nueva.
3. **Después:** registro en `runtime` (el manifiesto cambia, el conector es el mismo), Playwright y la revisión del `auditor` sobre el código.
4. **Al final:**
   - prueba manual del usuario (punto 10);
   - el `documentalista`:
     - guía de conexión con capturas («copia la dirección de la página casi en blanco»);
     - privacidad: qué sale hacia GOG (el código, los tokens, la lista de ID a `api.gog.com` sin token y a GamesDB) y que el nombre se guarda en el equipo;
     - aviso de vía no oficial y de las condiciones de uso;
     - solución de problemas: «El código ha caducado», «Hay que volver a conectar» y «Hace falta GOG Galaxy».

#### 12. Lo que decide el usuario

**Aplicado por defecto (22-10-2026), salvo que el usuario diga otra cosa:** 12.1 (a), «Conectado como <nombre>»; 12.2 (a), mensaje si no hay Galaxy.

1. **Nombre de la cuenta:**
   - (a) «Conectado como <nombre>», con solo `username` de `userData.json`, como eligió para Steam (recomendado por coherencia; se aplica si no dice otra cosa);
   - (b) solo «Conectado», sin la llamada a `userData.json` (que además lleva el correo en la respuesta, aunque no se guarde).
2. **Instalar sin GOG Galaxy en el equipo:**
   - (a) mensaje «Hace falta GOG Galaxy» (recomendado en este corte: cero código nuevo);
   - (b) abrir en el navegador la ficha del juego en gog.com. Necesita una decisión nueva: permitir `https` a hosts concretos en las acciones y guardar el slug.
3. Sigue pendiente el punto 11.1 de la 76: cómo se abre un juego de GOG (directo, a través de Galaxy o con un ajuste). Este corte no lo cambia.

#### 13. Revisión del auditor sobre el diseño (22 de octubre de 2026)

**Confirmado por el auditor:** el `client_secret` público de Galaxy queda fuera del invariante 5, con las condiciones del punto 2: constante solo en `auth.ts`, sin copiarlo al ADR ni a las fixtures, y en la lista de excepciones de un escáner de secretos.

- **A1. `exec` y ubicaciones `launcher`.** Resuelto en el punto 7: las ubicaciones `launcher` no amplían el confinamiento; solo vale `installPath` (revisa la regla 5 de la 40). Además, el conector de GOG **rechaza `..`** como componente de `path` y de `workingDir` (`action.unsupported` con `connectors.gog.errors.invalidTask`). Revisa la frase del punto 4 de la 76 («un `..` no lo filtra el conector»). El núcleo sigue confinando igual: son dos barreras.
- **A2. Carrera entre desconectar o reconectar y la rotación del refresh token.** Una operación `library` en curso podía guardar un token rotado después de desconectar, o pisar el token de una reconexión. Vale para **todas las tiendas**:
  - El núcleo mantiene una **época por tienda**, un contador en memoria (no hace falta migración: al reiniciar no queda ninguna operación viva). La incrementan `disconnect` y cada envío al asistente de esa tienda antes de llamar a `submit`, que es donde ocurre el canje.
  - Cada operación `library` guarda la época al empezar. El `secrets` de su `SyncContext` **rechaza `set` y `delete`** si la época cambió, con un error del núcleo que el conector no captura.
  - Con la época cambiada, el núcleo **descarta** el resultado: no aplica el plan, no escribe `sync_state` ni cambia `store_connections.status`. Solo registra el código.
  - Si `secrets.set` falla después de que GOG rotara el token, el conector **propaga el error**, sin tragárselo ni seguir con el token de acceso. La sincronización falla con su código, y si GOG ya invalidó el token anterior (GA4), la siguiente pasa a `expired`.
- **M1. `extract: 'url-query:…'`.** `cleanField` (`packages/core/src/wizards.ts`) solo acepta una URL `https`, sin usuario ni contraseña (`username` y `password` vacíos) y con host en `authHosts ∪ apiHosts` del conector. Si no, el valor no se acepta. Para GOG, la página final está en `embed.gog.com`, que es de `apiHosts`. La web (`apps/web/src/data/validate.ts`) marca error de formato si lo pegado no es una URL con ese parámetro, en vez de validar el texto tal cual. Posible mejora, no ahora: un `extractFrom` con la ruta exacta (`/on_login_success`).
- **M2. Forma de los tokens.** Aceptación `^[A-Za-z0-9_-]{64,4096}$` y redactor superconjunto (puntos 3 y 5, supuesto GA13).
- **B1.** Una prueba del repositorio comprueba que el valor del `client_secret` solo aparece en `connectors/gog/src/auth.ts`.
- **B2.** Los ID que llegan como número JSON (`owned` y `id` del catálogo) se aceptan solo si `Number.isSafeInteger` y son positivos. Si no, se saltan: un número mayor que 2⁵³ ya perdió dígitos al analizarlo. Las cadenas de dígitos siguen con `^\d{1,20}$`.
- **B3.** Solo se usa el `client_id` (y su secreto) de Galaxy. **No** se imitan su `User-Agent` ni otras cabeceras de Galaxy: el `HttpClient` no pone cabeceras propias.
- **B4.** Los tokens y el código no pasan por el `wizardState` en ningún momento (punto 5).
- **B5.** Para el `documentalista`, en la guía de privacidad: al conectar, Ludiary pide `userData.json`, cuya respuesta trae el correo y el ID de la cuenta además del nombre. Solo se guarda el nombre; lo demás se descarta en memoria y nunca se registra.
- **Pruebas añadidas por la revisión:**
  - época cambiada durante una sincronización (desconectar y reconectar a mitad) → ni `set`, ni plan, ni `sync_state`;
  - `set` que falla tras rotar → error;
  - `..` en `path` y en `workingDir`;
  - `checkSpec` rechaza un `exec` dentro de una ubicación `launcher` y fuera de `installPath`;
  - `cleanField` con `http`, credenciales en la URL u otro host;
  - ID numéricos no seguros;
  - la prueba B1.

#### Supuestos de la cuenta de GOG (verificar en la prueba manual; los marcados con «sin verificar» no tienen más fuente que la indicada)

- **GA1 (sin verificar):** GOG no tiene registro OAuth público para terceros y tolera el uso del identificador de cliente de Galaxy por clientes de terceros. Solo consta el uso público de `gogdl` y Heroic, Lutris, Playnite y Comet. No se ha encontrado ninguna declaración de GOG a favor ni en contra.
- **GA2:** login en `auth.gog.com/auth` con `client_id`, `redirect_uri=https://embed.gog.com/on_login_success?origin=client`, `response_type=code` y `layout=client2`, y la vuelta con `code` en la consulta. Lo confirman gogapidocs, `gogdl` y Lutris. Falta probarlo con la cuenta del usuario.
- **GA3:** `GET auth.gog.com/token` con `grant_type=authorization_code` o `refresh_token` responde JSON con `access_token`, `refresh_token`, `expires_in` (3600), `token_type`, `user_id` y `session_id`. Lo confirman gogapidocs y `gogdl` (`auth.py`).
- **GA4 (sin verificar):** cada renovación entrega un refresh token nuevo, y el anterior deja de valer o puede dejar de valer. No consta cuánto dura uno sin usar.
- **GA5:** `embed.gog.com/user/data/games` acepta `Authorization: Bearer` y devuelve `owned` con los ID numéricos de todo lo poseído. El uso del token y la forma de la respuesta los confirman `gogdl` (`api.py`) y gogapidocs. Que incluya ocultos, DLC y películas está **sin verificar**.
- **GA6:** `api.gog.com/products?ids=` admite hasta 50 ID (gogapidocs) y devuelve una lista con `id`, `title`, `slug`, `game_type` y `links`. Un ID desconocido no aparece. Comprobado el 22-10-2026 con 1207658695 y 1512372112 (`game`), 1120912052 (`dlc`) y 1000000001 (ausente). Sin verificar: el valor `pack`, y si los productos retirados del catálogo siguen apareciendo.
- **GA7 (sin verificar):** un código o un refresh token inválidos dan 400 o 401 en `auth.gog.com/token`, y un token caducado da 401 en `embed.gog.com` (y no una redirección al login).
- **GA8 (en parte):** Galaxy registra el esquema `goggalaxy`, y `goggalaxy://openGameView/<id>` abre la ficha del juego. **Comprobado el 22-10-2026 en el equipo del usuario:** el esquema está registrado con la orden `"…\GalaxyClient.exe" /urlProtocol="%1"`. Falta ver que `openGameView` abre la ficha (paso 5 de la guía). Fuente: el controlador de instalación de Playnite (`GogGameController.cs`). Afina el supuesto G14 de la 76: no hay URI para **lanzar**, pero sí para abrir la ficha.
- **GA9 (confirmado el 22-10-2026 en el equipo del usuario):** la carpeta del cliente está en `HKLM\SOFTWARE\WOW6432Node\GOG.com\GalaxyClient\paths`, valor `client`, y dentro está `GalaxyClient.exe` (Playnite, `Gog.cs`).
- **GA10 (sin verificar con el token):** `embed.gog.com/userData.json` devuelve `username`, además de `userId` y `email` (gogapidocs; Lutris lo usa para comprobar la conexión).
- **GA11 (sin verificar):** los límites de peticiones de `embed.gog.com` y `api.gog.com` no están documentados. Este corte hace unas 2 + N/50 peticiones cada 30 minutos como mucho.
- **GA12 (sin verificar):** el código cumple `^[A-Za-z0-9_-]{10,512}$`. Si la prueba manual muestra otros caracteres, se amplía el patrón en el conector y en el simulador.
- **GA13 (sin verificar):** los tokens de GOG son cadenas opacas de 64 a 4096 caracteres de `[A-Za-z0-9_-]`. Si no lo son, el conector los rechaza (`store.unexpected-response`), y nunca se guarda un token que el redactor no tape. Si la prueba manual muestra otra forma, se cambian **a la vez** el patrón de aceptación y el del redactor, manteniendo el segundo como superconjunto del primero.

Fuentes consultadas el 22 de octubre de 2026: [gogapidocs, autenticación](https://gogapidocs.readthedocs.io/en/latest/auth.html); [gogapidocs, cuenta](https://gogapidocs.readthedocs.io/en/latest/account.html); [gogapidocs, listados](https://gogapidocs.readthedocs.io/en/latest/listing.html); [gogapidocs, Galaxy (`products?ids`)](https://gogapidocs.readthedocs.io/en/latest/galaxy.html); [`gogdl`, `auth.py`](https://github.com/Heroic-Games-Launcher/heroic-gogdl/blob/main/gogdl/auth.py) y [`api.py`](https://github.com/Heroic-Games-Launcher/heroic-gogdl/blob/main/gogdl/api.py); [Heroic, `gog/library.ts`](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/blob/main/src/backend/storeManagers/gog/library.ts) y [`gog/user.ts`](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/blob/main/src/backend/storeManagers/gog/user.ts); [Lutris, `services/gog.py`](https://github.com/lutris/lutris/blob/master/lutris/services/gog.py); [Playnite, `GogGameController.cs`](https://github.com/JosefNemec/PlayniteExtensions/blob/master/source/Libraries/GogLibrary/GogGameController.cs) y [`Gog.cs`](https://github.com/JosefNemec/PlayniteExtensions/blob/master/source/Libraries/GogLibrary/Gog.cs); [Comet](https://github.com/quantenzitrone/comet); respuestas de `api.gog.com/products?ids=1207658695,1512372112,1000000001` y `?ids=1120912052`.

**Motivo:** es el mínimo que cierra el camino de la cuenta de GOG de la decisión 43 **sin tocar el contrato, el núcleo ni la base de datos**: la 74 dejó genéricos el motor de asistentes, el almacén cifrado, la operación `library`, `install`, desconectar y el velo, y el paso con enlace, campo y extracción ya lo pinta la web. HTTP directo evita el binario de `gogdl` y el `ExternalToolRunner` para cuatro peticiones. Guardar solo el refresh token deja un único secreto por tienda, y el orden «guardar y luego usar» evita perder la sesión cuando GOG rota el token. La biblioteca con `user/data/games` más el catálogo por lotes cuesta unas pocas peticiones y no necesita guardar el identificador de cuenta. Alternativas descartadas:

- `gogdl` como herramienta externa (punto 2);
- `getFilteredProducts` (no consta que acepte el token) y `galaxy-library` (sin títulos, una petición por juego) para la biblioteca;
- guardar también el token de acceso y su caducidad (un secreto más para ahorrar una petición cada 30 minutos o más);
- `GalaxyClient.exe /command=installGame` (sintaxis sin documentar y comillas);
- hacer el emparejamiento en este corte (decisión del usuario; no es imprescindible, punto 1).

**Consecuencias:**

- Primer secreto de GOG y primer refresh token con rotación. Antes de cerrar, el `auditor` revisa:
  - `auth.ts`, incluido el orden de guardado en la renovación;
  - la constante del cliente de Galaxy en el repositorio;
  - la cabecera `Bearer` como `Secret`;
  - el redactor;
  - la ubicación `launcher` nueva;
  - las fixtures y la lista de excepciones de privacidad.
- La regla 7 de la decisión 40 queda revisada para GOG: no se ejecuta `gogdl`. La 76 queda revisada en dos frases de su punto 1: la cuenta no usa `gogdl` ni `ExternalToolRunner`, y el emparejamiento no va «antes o junto con» la cuenta, sino en su propio corte, después.
- El punto 11.2 de la 76 queda resuelto: cuenta de GOG ahora y sin emparejamiento; el corte 2b va después.
- `apiHosts` de GOG pasa a cuatro hosts; `mediaHosts` y la CSP no cambian.
- Los juegos poseídos en Steam y en GOG salen duplicados hasta el corte del emparejamiento. La guía lo dice.
- El `documentalista` actualiza las guías del punto 11; el `tester` amplía `docs/manual-tests/gog.md` (punto 10).

### 78. Conector de Epic Games: instalados, Jugar y portadas (corte 1) y cuenta con código pegado, juegos no instalados e Instalar (corte 2) (amplía las decisiones 40, 42, 50, 73, 74, 76 y 77; revisa para Epic la regla 7 y la fila de Epic de la tabla de la 40, y la parte de Epic de la 43)

**Decisión (recomendada, 22 de octubre de 2026):** el 22 de octubre de 2026 el usuario encarga «ponte con el conector de Epic». Se hace en **dos cortes dentro de esta decisión**, con la misma forma que GOG: el corte 1 equivale a la 76 (instalados, Jugar y portadas, sin cuenta) y el corte 2 a la 77 (login, sesión cifrada, juegos no instalados e Instalar). Reutiliza todo lo de Steam y GOG: ubicaciones, `discoverRoots`, escaneo con `ctx.fs` confinado, `resolveAction` con `uri`, `resolveMedia` con `HttpClient` y `apiHosts`, CSP derivada de `mediaHosts`, asistente con paso `open-external` con campo y Pegar, solo el refresh token cifrado, época por tienda, velo gris e `install`. El corte 2 empieza cuando el corte 1 pasa la prueba manual.

**Punto de partida (comprobado el 22-10-2026 en el equipo del usuario, solo lectura):** launcher en `E:\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe`; esquema `com.epicgames.launcher` registrado con la orden `"…\EpicGamesLauncher.exe" %1`; existe `C:\ProgramData\Epic\UnrealEngineLauncher\LauncherInstalled.dat` con `InstallationList` vacía y existe `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests` sin ningún `.item`. No hay juegos de Epic instalados: la prueba manual exige instalar uno (punto 11). Lo demás sale de fuentes públicas y queda como supuesto (listas del final).

#### 1. Alcance

- **Corte 1, entra:**
  - detección de los juegos instalados leyendo los manifiestos `*.item` del launcher (punto 3);
  - Jugar con la URI del launcher (punto 4);
  - portadas sin cuenta desde el catálogo de Epic con un token de aplicación (punto 5);
  - el conector `connectors/epic` registrado en `runtime`, con sus textos, y la CSP ampliada con sus hosts de imágenes.
- **Corte 2, entra:** asistente de login con el JSON pegado, sesión cifrada (solo el refresh token), `listLibrary` con los juegos poseídos (títulos y portadas del catálogo), Instalar, desconectar y `expired` con el velo gris, y «Conectado como <nombre>».
- **Fuera, en los dos cortes:**
  - **`legendary` y `ExternalToolRunner`** (punto 2).
  - **DLC y complementos:** se distinguen para no mostrarlos como juegos, pero no se informan (`dlc: 'none'`), igual que en la 76 y la 77 (decisiones 21 y 52).
  - **Emparejamiento entre tiendas** (decisión 77, punto 1): un juego poseído en Epic y en otra tienda sale una vez por tienda.
  - **Tiempo de juego de Epic** (`library/api/public/playtime`, que usa Playnite): `storePlaytime` sigue en `false`.
  - **Lanzar sin launcher** (`exec`, punto 4) y **descargar juegos**.
  - **Ventana integrada de login** (decisión 43): sin `legendary` no hay ventana; una propia necesitaría otra decisión.

#### 2. Vía de acceso: HTTP directo frente a `legendary`

- **A. HTTP directo desde el conector con el `HttpClient` de la 74** (se elige). Las mismas razones que la 77 con `gogdl`, y más fuertes:
  - el corte 1 no necesita cuenta, y el corte 2 son pocas peticiones: canje, renovación, biblioteca paginada y catálogo;
  - no hay binario Python empaquetado con PyInstaller que distribuir, firmar y actualizar, ni una GPL-3.0 más cuyo código correspondiente publicar con cada versión (decisión 60);
  - no hace falta el `ExternalToolRunner` (carpeta temporal privada, rehidratarla y volver a cifrarla), y los tokens nunca tocan el disco en claro;
  - `legendary` solo aportaría lo que este corte no hace: descargar y lanzar sin launcher.
- **B. `legendary auth --code` y `legendary list`** (regla 7 de la 40). Ventaja: se hereda su mantenimiento. Costes: el binario, el `ExternalToolRunner` completo, analizar su salida (con tokens) y su caché propia en disco.
- **Revisa para Epic la regla 7 de la decisión 40:** Epic no usa `legendary` y su manifiesto mantiene `externalTools: []`. Tras la 77 y esta, **ninguna tienda usa herramientas externas**: `ExternalToolId` conserva sus dos valores sin cambiar el tipo, por si algún día se descargan juegos, y `ExternalToolRunner` sigue sin implementar.
- **Revisa la parte de Epic de la decisión 43:** la ventana integrada de `legendary` desaparece; la vía es la que la 43 dejaba como alternativa: abrir el login en el navegador y pegar el JSON, del que el núcleo extrae `authorizationCode` (punto 7).

**Identificador de cliente.** Epic no ofrece a terceros un registro OAuth que dé acceso a la biblioteca: los servicios de cuenta de Epic Online Services son para juegos y no tienen ese permiso (supuesto EA1). Se usa el cliente público del launcher (`launcherAppClient2`, `client_id` y `client_secret` publicados en `legendary`, `egs-api` y Playnite), como hacen `legendary`, Heroic, Playnite y `egs-api`.

- **Invariante 8:** la vía oficial que existe, el login de Epic, se usa: el usuario escribe su contraseña y su segundo factor en `epicgames.com`, nunca en Ludiary. No se lee ni se cierra ninguna sesión del launcher (se mantiene descartado `legendary auth --import`, decisión 43). Lo no oficial es presentarse con el cliente del launcher: `access: 'unofficial-api'` e icono de fragilidad.
- **Riesgo de condiciones de uso (no es asesoría legal):** el mismo que la 77 con GOG. Mitigación igual: fallo aislado en el conector, escaneo y Jugar sin cuenta, la guía lo explica y el proyecto no se declara afiliado.
- **El `client_secret` del launcher no es un secreto del invariante 5**, por las mismas razones que el de Galaxy (77, punto 2). Va como constante **solo** en `connectors/epic/src/auth.ts`, con un comentario; el ADR no copia su valor ni el del `client_id`, que están en las fuentes citadas. La cabecera `authorization: basic <base64(id:secreto)>` se calcula en código a partir de las dos constantes (no se guarda en base64 en ningún fichero) y se envía como `Secret`. Ambos son 32 caracteres hexadecimales: el redactor ya los tapa (patrón de la clave de Steam).
- **Sin imitar al launcher:** no se envían su `User-Agent` ni otras cabeceras propias (`X-Epic-Device-ID`, etiquetas). `egs-api` y Playnite piden tokens sin `User-Agent` propio (supuesto EA8). Si Epic lo exigiera, se decide aparte.

#### 3. Escaneo (corte 1)

- **Fuente: los manifiestos `*.item` del launcher** en `<datos>\Manifests`. Cada uno es un JSON con, entre otros, `DisplayName`, `AppName`, `CatalogNamespace`, `CatalogItemId`, `InstallLocation`, `LaunchExecutable`, `bIsIncompleteInstall`, `MainGameAppName` y `AppCategories` (supuesto E2).
  - **Descartado `LauncherInstalled.dat`:** solo trae `InstallLocation`, `NamespaceId`, `ItemId` y `AppName`, sin título, sin estado incompleto y sin DLC; los `.item` ya lo cubren.
  - **Descartado leer la carpeta del juego** (`.egstore\*.mancpn`, que tendría los tres ID): sin verificar (supuesto E10). Jugar pasa por el launcher, que solo conoce los juegos con `.item`, así que el `.item` es la fuente que importa.
- **Ubicación (`locations`):** `epic-launcher-data` (`scan`), con dos fuentes en este orden (revisado tras el auditor, punto 14):
  1. `{ kind: 'registry-value', hive: 'HKLM', key: 'SOFTWARE\\Epic Games\\EpicGamesLauncher', value: 'AppDataPath', view: '64' }`. Comprobado el 22-10-2026 en el equipo del usuario: existe en la vista de 64 bits, con barra final, y **no** existe en `WOW6432Node`. El resolvedor ya normaliza la ruta (la barra final no importa) y descarta repetidos con la carpeta conocida.
  2. De respaldo, `{ kind: 'known-folder', folder: 'ProgramData', relative: 'Epic\\EpicGamesLauncher\\Data' }`, la carpeta por defecto según GameFinder, que existe en el equipo del usuario aunque el launcher esté en `E:` (supuesto E1).
  - ~~No se añade el valor de registro `AppDataPath`: solo serviría si alguien mueve los datos del launcher, y no consta que eso pase.~~ (Revisado tras el auditor.) Ninguna ubicación `launcher` en el corte 1 (punto 4).
- **Problema propio de Epic:** los manifiestos están en `ProgramData` y los juegos en cualquier otra carpeta, pero el núcleo exige `installPath` dentro de una raíz (regla 4 de la 40) y, al lanzar, dentro de una raíz activa (76, punto 2). Lo resuelve `discoverRoots`, como en GOG:
- **`discoverRoots`** (lee con `ctx.fs`, confinado a la carpeta de datos):
  - devuelve la propia carpeta de datos con `tag: 'manifests'`;
  - si existe `Manifests`, lee sus `*.item` (como mucho 2000, mismas reglas de lectura que abajo) y, de cada juego válido y completo, devuelve la carpeta **padre** de `InstallLocation` con `tag: 'library'`, o la propia carpeta con `tag: 'game'` si el padre es la raíz de una unidad. Todas con `declarationId: 'epic-launcher-data'`. Sin repetidos (clave en minúsculas, barras normalizadas). Si `Manifests` no existe, solo la carpeta de datos.
  - El núcleo valida como siempre (absolutas, existentes, como mucho 64) y Ajustes las muestra con su interruptor (decisión 42).
- **`scanInstalled`:**
  1. Si entre `ctx.roots` no está la carpeta de datos (desactivada, o modo «solo carpetas manuales»), devuelve vacío: Epic no detecta instalados sin sus manifiestos. La guía lo dice (punto 13.3).
  2. `readDir` de `<datos>\Manifests`; ficheros que cumplan `\.item$` sin distinguir mayúsculas, como mucho 2000, en orden. Cada uno con `readText` (1 MiB), quitando el BOM, y `JSON.parse`.
  3. Campos obligatorios: `AppName`, `CatalogNamespace`, `CatalogItemId` e `InstallLocation` de texto, los tres primeros con las formas del punto 6. Si falta alguno: `store.unexpected-response` y se salta ese fichero. ~~`InstallLocation` absoluta con letra de unidad y sin caracteres de control (se cambian `/` por `\` y se quita la barra final).~~ `InstallLocation` cumple la **regla estricta de ruta** del punto 14, M1 (revisado tras el auditor); si no, se salta y se cuenta, nunca `internal`.
  4. `bIsIncompleteInstall === true`: se salta y se cuenta (descarga o actualización a medias; el launcher no lo abriría).
  5. **DLC y complementos:** `MainGameAppName` presente y distinto de `AppName`, o `AppCategories` con `addons`: se salta y se cuenta. **No juegos:** `AppCategories` presente y sin `games` (sin `AppCategories`, juego: punto 15) (motores, complementos de Unreal, aplicaciones), o `CatalogNamespace === 'ue'`: se salta y se cuenta (supuesto E2).
  6. `InstallLocation` debe estar dentro de alguna **otra** raíz de `ctx.roots` (comparación de texto sin distinguir mayúsculas, con límite de componente, **antes** de tocar el disco: `ctx.fs` trata una ruta fuera de raíces como fallo del conector) y existir (`ctx.fs.exists`). Si no está dentro (el usuario desactivó esa carpeta) o no existe (juego movido o borrado sin el launcher): se salta y se cuenta. `PathEscapesRootsError`: se salta.
  7. Entrada: `storeGameId` del punto 6, `kind: 'game'`, `title` = `DisplayName` sin caracteres de control, recortado y de 300 como mucho (si falta, `Epic <AppName>`, un dato y no un texto de la interfaz), `installPath` = `InstallLocation`. Sin `media`, `launchData` ni `executables`.
  8. Un `storeGameId` ya visto se salta.
- **Errores** (misma clasificación que GOG, `isHandled` copiado): `readDir` de `Manifests` con error, o un `.item` bloqueado o con error de E/S, marca **todas** las raíces de `ctx.roots` como ilegibles. `Manifests` **inexistente** no es un error: resultado vacío con las raíces legibles, y el núcleo da de baja las instalaciones de Epic (el launcher no tiene ninguna; revisado tras el auditor, M3). Motivo: las instalaciones no cuelgan de la carpeta de datos sino de otras raíces, y marcar solo la de datos dejaría que el núcleo diera de baja todo Epic por un fallo pasajero. JSON mal formado: se salta ese fichero. Otro `internal` se propaga.
- **Registro:** solo contadores y códigos. Ni rutas, ni títulos, ni ID de Epic (son hexadecimales de 32 que el redactor tapa igualmente).

#### 4. Jugar e Instalar

**Opciones para Jugar:**

- **A. URI del launcher** (se elige): `com.epicgames.launcher://apps/<namespace>%3A<catalogItemId>%3A<appName>?action=launch&silent=true`. Es el formato de los accesos directos que crea el propio launcher (supuesto E3).
  - Ventajas: el launcher hace lo que un `exec` no puede: muchos juegos de Epic necesitan que se les pase al arrancar un código de intercambio de la sesión del usuario (`-AUTH_PASSWORD=<código> -AUTH_TYPE=exchangecode`) y, algunos, un token de propiedad (`-epicovt=<fichero>`). Así lo hace `legendary` al lanzar sin launcher (supuesto E9). Además, el launcher sincroniza las partidas en la nube, aplica actualizaciones pendientes y abre la superposición. Es la misma forma que Steam: sin `exec` y sin confinamiento de ejecutables.
  - Costes: exige el launcher instalado (lo está si hay `.item`) y lo arranca en segundo plano si estaba cerrado; la detección del proceso de la 55 es indirecta, como en Steam.
- **B. `exec` de `InstallLocation\LaunchExecutable`.** Funcionaría con juegos sin DRM, pero rompería en silencio los que exigen autenticación de Epic. Hacerlo bien exige la sesión del usuario (corte 2) y reimplementar el lanzamiento de `legendary` (código de intercambio, token de propiedad, argumentos `-epicapp`, `-epicenv`, `-epicusername`…). Se descarta.
- **C. La forma corta `apps/<appName>`** (foros): la usan algunos, pero el launcher actual escribe la de tres partes en sus accesos directos. Se descarta.

**`resolveAction`** (`connectors/epic/src/launch.ts`):

1. Acción distinta de `play` (corte 1) o de `play` e `install` (corte 2): `null`.
2. `storeGameId` debe cumplir el patrón del punto 6; si no, `action.unsupported` con `connectors.epic.errors.invalidId`. ~~Se parte en sus tres segmentos~~ La URI se construye con **los tres grupos de captura** del patrón (no partiendo el texto por `:`), que por el patrón no necesitan codificarse, unidos con `%3A`; antes de devolverla se comprueba con una aserción final que la URI entera cumple `^com\.epicgames\.launcher://apps/[A-Za-z0-9_-]{1,64}%3A[0-9a-f]{32}%3A[A-Za-z0-9._-]{1,60}\?action=(launch&silent=true|install)$` (revisado tras el auditor).
3. `play`: `installPath` nulo → `launch.not-installed`. Devuelve `{ kind: 'uri', uri: 'com.epicgames.launcher://apps/<ns>%3A<cat>%3A<app>?action=launch&silent=true' }`. **Sin comprobar el launcher:** si el juego tiene `.item`, el launcher está instalado; si se desinstaló después, Windows muestra su propio aviso de «no hay aplicación para este enlace». `shortcut:` se añade la comprobación si la prueba manual muestra que ese caso es habitual.
4. `install` (corte 2): la misma URI con `?action=install` (sin `silent`, para que el launcher muestre su diálogo; supuesto E4). Si `ctx.launchersResolved` y la ubicación `epic-launcher` no tiene `EpicGamesLauncher.exe`: `launch.launcher-missing` con `connectors.epic.errors.launcherMissing` («Para instalar este juego hace falta el launcher de Epic Games. Descárgalo de epicgames.com»). ~~La ubicación y la comprobación solo se añaden **si la prueba del corte 1 confirma el supuesto E5**; si no, Instalar devuelve la URI sin comprobar.~~ (Revisado tras el auditor: E5 está comprobado; la comprobación va siempre en el corte 2.) **Launcher presente** = alguna ubicación `epic-launcher` resuelta cuya ruta es un fichero que existe y acaba en `EpicGamesLauncher.exe` (sin distinguir mayúsculas); la ubicación ya apunta al `.exe`, no a una carpeta.
- **Ubicación del corte 2:** `epic-launcher` (`launcher`) con dos fuentes: `{ kind: 'registry-value', hive: 'HKCU', key: 'Software\\Epic Games\\EOS', value: 'ModSdkCommand' }` (la ruta del ejecutable del launcher, según su instalador; supuesto E5) y `{ kind: 'known-folder', folder: 'ProgramFilesX86', relative: 'Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe' }`, la carpeta por defecto. Solo la de registro encontraría el launcher del usuario en `E:`. ~~por eso no se usa sin confirmarla, para no dar un falso «hace falta el launcher».~~ Comprobado el 22-10-2026: `ModSdkCommand` existe en `HKCU`, con la ruta del `.exe` con `/` como separador y sin comillas. La plataforma no cambia por ello: el resolvedor de ubicaciones ya normaliza cada ruta (`files.normalize`) y comprueba que existe antes de devolverla (`location-resolver.ts`). Una prueba del resolvedor con una ruta con `/` lo fija.
- **Núcleo y plataforma:** sin cambios. `checkSpec` ya valida esquema y forma; `validateLaunchUri` acepta `%3A`, `?`, `&` y `=`. `uriSchemes: ['com.epicgames.launcher']` cumple `SCHEME_RE`.
- La web pinta «Abriendo Epic Games…» con `game.launching` (y `game.installing` en el corte 2) y `{store}`.

#### 5. Portadas

- **Corte 1, sin cuenta: catálogo de Epic con un token de aplicación** (se elige).
  - `POST https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token`, formulario `grant_type=client_credentials` y `token_type=eg1`, con la cabecera `basic` del punto 2. Da un token de aplicación, sin usuario, que `legendary` y `egs-api` usan para lo público (supuesto E7). Vive en memoria durante esa llamada a `resolveMedia`, como `Secret`, y no se guarda.
  - Por cada **namespace** del lote (los DLC comparten el del juego): `GET https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/<ns>/bulk/items?id=<cat>&id=<cat>…&includeDLCDetails=false&includeMainGameDetails=true&country=US&locale=<ctx.locale>`, con `authorization: bearer <token>` como `Secret`. Es la petición de `legendary`, Playnite y `egs-api` (supuesto E11). El `id` repetido no cabe en `query` (un objeto), así que el conector construye la consulta en la propia `url` con `URLSearchParams`; el `HttpClient` ya la conserva y añade la de `query`.
  - **Descartadas:** el GraphQL de la tienda (`store.epicgames.com/graphql`, protegido contra clientes que no son navegadores y con consultas sin documentar); la variante entre namespaces `POST …/catalog/api/shared/bulk/namespaces/items` de `egs-api` (menos peticiones, pero la forma de su respuesta no consta: se revisa si la biblioteca grande no cabe en tiempo, punto 8); y el feed público de promociones (solo juegos en oferta).
- **`resolveMedia`** (`connectors/epic/src/media.ts`), con las reglas de la 76:
  - cada ID se revalida con el patrón del punto 6 antes de nada; uno que no cumpla se omite sin petición; **si no queda ningún ID válido, no se pide el token de aplicación** y se devuelve un mapa vacío (revisado tras el auditor);
  - como mucho **50 ID por petición de catálogo**, también aquí (el lote del núcleo ya es de 50, pero la regla es del conector);
  - token primero: 400, 401 o 403 → `store.unexpected-response` para el lote; 429 → `store.rate-limited`;
  - como mucho **6 peticiones de catálogo a la vez**, 8 s cada una; con el primer 429 no se lanzan más y se lanza `store.rate-limited` con `Retry-After`;
  - 200: objeto con una entrada por ID de catálogo. De cada una, `keyImages` (lista de `{ type, url }`): `coverUrl` = la de `DieselGameBoxTall` o, si falta, `OfferImageTall`; `heroUrl` = la de `DieselGameBox` o, si falta, `OfferImageWide`. Cada URL: `https`, host en `mediaHosts`, sin usuario ni contraseña, 2048 caracteres como mucho. Una de otro host se omite y se cuenta, registrando **solo el host** (no es dato personal y cierra el supuesto E8). Un ID que no vuelve queda fuera del mapa;
  - 404 de un namespace: sus ID quedan fuera del mapa; cualquier otro estado o un cuerpo que no es un objeto: `store.unexpected-response` para el lote (lanzar en vez de omitir, por la misma razón que la 76).
  - **Si Epic no acepta el token de aplicación en el catálogo** (supuesto E7 falso): el corte 1 queda sin portadas (degradado) y se quita `resolveMedia` del manifiesto en el mismo cambio, sin otra decisión; con el corte 2 llegan por `listLibrary` (abajo). **Es lo que pasa (comprobado el 22-10-2026, punto 15):** `resolveEpicMedia` queda implementado y probado, pero **no se declara** en el manifiesto, porque enviaría a Epic los ID de los juegos instalados sin obtener nada. El corte 1 no tiene portadas para los instalados hasta conectar la cuenta.
- **Corte 2:** `listLibrary` ya pide el catálogo para los títulos (punto 8) y devuelve `media` con las mismas reglas en cada entrada, con el token del usuario. Los juegos poseídos tienen portada aunque falle E7.
- **`mediaHosts`: `['cdn1.epicgames.com', 'cdn2.unrealengine.com']`.** Las dos aparecen en las imágenes del feed público de la tienda (comprobado el 22-10-2026; las verticales en `cdn1.epicgames.com/offer/…` y `cdn1.epicgames.com/spt-assets/…`, otras en `cdn2.unrealengine.com`). La CSP y `vite.config.ts` las añaden (prueba de paridad de la 71). Que los `keyImages` del catálogo usen solo esos hosts está sin verificar (supuesto E8): si la prueba muestra otro, se añade tras comprobarlo.
- **Privacidad (invariante 9):** salen hacia Epic los namespace e ID de catálogo de los juegos de Epic detectados y la IP, con el token de aplicación, sin cookies ni `User-Agent` propio; lo mismo que pediría el launcher. El documentalista lo añade a la guía.

#### 6. Identificador de la propiedad (cambio pequeño del núcleo)

- **`storeGameId` = `<namespace>:<catalogItemId>:<appName>`**, con el patrón `^[A-Za-z0-9_-]{1,64}:[0-9a-f]{32}:[A-Za-z0-9._-]{1,60}$` (supuesto E6). El ID de catálogo y el namespace **solo si es un hexadecimal de 32** (revisado tras el auditor: un namespace legible como `fn` se deja tal cual) se pasan a minúsculas al leerlos, en el escaneo y en la biblioteca, para que el mismo juego dé el mismo ID por las dos vías.
  - Motivo: es lo único que necesitan a la vez la URI (los tres) y el catálogo (los dos primeros), y llega igual del `.item` y de la biblioteca. Con solo el ID de catálogo, Instalar un juego no instalado no podría construir la URI (`StoreEntry` no lleva `launchData`). Con solo `appName`, no se podría pedir el catálogo.
- **El núcleo limita hoy `storeGameId` a 64 caracteres** (`packages/core/src/validate.ts`, en las validaciones del escaneo y de la biblioteca), y el de Epic llega a 158. **Se decide subir el límite a 160** en las dos validaciones. La columna es `text` sin límite y el índice único no cambia. Es una relajación compatible: `contractVersion` sigue en 1. El comentario de `StoreEntry.storeGameId` y de `InstalledEntry.storeGameId` en `contracts` dice «1 a 160 caracteres, sin caracteres de control ni separadores de línea». La regla de la prueba de conformidad para ID hostiles (`{1,64}`) no cambia: solo mira los ID hostiles.

#### 7. Cuenta (corte 2): login, canje y sesión

- **Ida (URL fija construida en `auth.ts`):** `https://www.epicgames.com/id/login?redirectUrl=<url codificada>`, con `redirectUrl` = `https://www.epicgames.com/id/api/redirect?clientId=<client_id>&responseType=code`. Es la URL a la que redirige `legendary.gl/epiclogin` (comprobado el 22-10-2026). Se abre en pestaña nueva. `authHosts: ['www.epicgames.com']`.
- **Vuelta:** la página final, en `www.epicgames.com`, es un JSON con `warning`, `redirectUrl`, `authorizationCode`, `exchangeCode` y `sid` (forma comprobada el 22-10-2026 sin sesión, con los códigos nulos; supuesto EA2). El usuario copia la página y pulsa Pegar.
- **Paso `login`:** `open-external`, `awaits: 'input'`, con la URL de ida. Cuerpo: «Inicia sesión en Epic Games en la pestaña nueva. Al terminar verás un texto entre llaves: cópialo entero y pulsa Pegar. Epic avisa de no compartir ese código: Ludiary lo usa solo en este equipo para hablar con Epic». Campo `authorizationCode`: `secret: true`, `paste: true`, `extract: 'json-field:authorizationCode'`, `pattern: '^[0-9a-f]{32}$'` (supuesto EA3), `maxLength: 4096`. Un solo paso, sin `choose`, como GOG. El simulador (`apps/web/src/data/mock.ts`) cambia el paso de Epic de `awaits: 'callback'` a este.
- **`extract: 'json-field:…'` más tolerante (núcleo y web, mismo cambio):** hoy el núcleo (`cleanField` en `packages/core/src/wizards.ts`) rechaza todo lo que no sea un JSON, y la web (`validate.ts`) acepta además el valor suelto: no coinciden. Se decide la misma regla en los dos: (1) se analiza el texto como JSON; (2) si falla, se analiza el trozo entre la primera `{` y la última `}` (Chrome copia también la casilla «Dar formato» si se selecciona toda la página); (3) si el texto no tiene `{`, se toma tal cual, sin comillas alrededor (`legendary` también acepta el código suelto). Lo extraído pasa después por `pattern`, que es la validación de verdad. Sin cambios de tipos. **Precisado tras el auditor:** si el JSON analizado es un objeto, vale el campo pedido solo si es texto (si falta o no es texto, no hay valor); si es un texto JSON (`"…"`), vale ese texto como valor suelto; cualquier otro JSON (número, lista, `null`) se trata como valor suelto, que luego no pasará `pattern`.
  - **Solo viaja el valor extraído (M2):** con `json-field`, la web envía al servidor **solo** el valor extraído, nunca el texto pegado. `exchangeCode` y `sid` de la misma página son credenciales: ni la web ni el núcleo ni el conector los leen, los registran ni los devuelven en un error o un mensaje.
  - Sin comprobación de host como la de `url-query` (77, M1): un JSON no tiene origen que comprobar. El riesgo es el mismo que aceptó la 77: que alguien convenza al usuario de pegar un código de **otra** cuenta, lo que solo conecta Ludiary a esa cuenta. Se acepta.
- **Canje** (`exchangeCode`): `POST https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token`, cabecera `basic`, formulario `grant_type=authorization_code`, `code` (como `Secret`) y `token_type=eg1` (supuesto EA4).
  - 200 con `access_token` y `refresh_token` que cumplen `^eg1~[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$` y miden de 16 a 8192: correcto (`eg1` es un JWT firmado con el prefijo `eg1~`). Si no: `store.unexpected-response`.
  - 400 o 401: `auth.invalid` con `connectors.epic.error.code` («El código ha caducado o ya se usó. Vuelve a iniciar sesión y copia el texto nuevo»). Si el cuerpo trae `errorCode` igual a `errors.com.epicgames.oauth.corrective_action_required` (Epic pide aceptar algo en su web): `auth.invalid` con `connectors.epic.error.corrective` («Epic te pide confirmar algo en su web. Entra en epicgames.com, acéptalo y vuelve a conectar») (supuesto EA6). Del cuerpo de error solo se compara `errorCode` con esa constante; `errorMessage` nunca se lee ni se registra.
  - 429: `store.rate-limited`. Otro estado: `store.unexpected-response`.
  - De la respuesta se lee además `displayName` → `accountLabel` (sin caracteres de control, recortado a 64; si falta, `done` sin nombre). **No hace falta otra petición para el nombre**, a diferencia de GOG. `account_id` y lo demás se descartan; se registran solo los números `refresh_expires` y `expires_in` (segundos), que no son datos personales, para cerrar el supuesto EA5; también en cada renovación.
- **Al enviar:** canje → `secrets.set('refreshToken', …)` → `done` (con nombre si lo hay). El token de acceso del canje se descarta. Nada pasa por `wizardState` (77, B4).
- **Renovación** (`refreshSession`, al principio de cada `listLibrary`): el mismo `POST` con `grant_type=refresh_token`, `refresh_token` (como `Secret`) y `token_type=eg1`.
  - 200 válido: **lo primero** es `secrets.set('refreshToken', <nuevo>)` (Epic entrega uno nuevo en cada renovación; supuesto EA5). Si `set` falla, se propaga el error (77, A2).
  - 400, 401 o 403: `auth.expired` con `connectors.epic.error.expired`. 429 y red: como en la 77. Sin `refreshToken` legible: `auth.required`.
- **Duración de la sesión (supuesto EA5):** no consta cuánto vale un refresh token del launcher sin usar; una documentación de la comunidad muestra 28 800 s (8 h) para otro cliente. Si fuera tan corta, quien abra Ludiary una vez al día tendría que reconectar casi siempre. Se sabrá con el número registrado en la prueba manual; si es corto, se decide aparte (por ejemplo, avisar en la tarjeta de Epic). No se añade nada antes de saberlo.
- **`status`, `disconnect`, época, `expired` y velo gris:** idénticos a la 77 (puntos 5 y 9), con el ámbito `store:epic`. Sin revocación remota: `legendary` tiene un `DELETE …/oauth/sessions/kill/<token>`, pero el `HttpClient` no admite `DELETE` y no se amplía por esto. `connectors.epic.disconnect.hint`: «Ludiary borra su sesión de Epic de este equipo. Para cerrar todas las sesiones, cambia la contraseña en epicgames.com».
- **Redactor** (`makeRedactor`, `runtime/src/files.ts`): añade `eg1~[A-Za-z0-9._-]+` → `[redacted]`, antes del patrón de tokens largos. Es superconjunto del patrón de aceptación (sin él, la cabecera del JWT, de menos de 64 caracteres, quedaría a la vista; no es secreta, pero así no queda nada del token). El código de autorización, el `client_secret`, el `client_id` y los ID de Epic son hexadecimales de 32: ya los tapa el patrón de la clave de Steam.

#### 8. Biblioteca (corte 2)

- **Tiempo límite (añadido tras la auditoría del código, 22-10-2026):** cada petición al catálogo de la biblioteca lleva 8 s como `resolveMedia`, para que una lenta no consuma los 60 s de la operación. Las peticiones ya en vuelo cuando falla otra terminan solas (el `HttpClient` no tiene señal por petición; limitación aceptada como en la 76). El reparto de concurrencia (6 a la vez) vive en `connectors/epic/src/pool.ts`.
- **`listLibrary`** (`connectors/epic/src/library.ts`):
  1. `refreshSession`.
  2. `GET https://library-service.live.use1a.on.epicgames.com/library/api/public/items` con `includeMetadata=true` y `platform=Windows` (Playnite), `authorization: bearer` como `Secret`. Página siguiente con `cursor` = `responseMetadata.nextCursor` hasta que no venga (supuesto EA7). El cursor debe ser texto de 1 a 2048 caracteres sin caracteres de control y se pasa por `query`, nunca pegado a la URL; un cursor repetido (bucle) es `store.unexpected-response` (revisado tras el auditor). Como mucho 200 páginas y 50 000 registros; si se supera: `store.unexpected-response`. 401 o 403: `auth.expired`; 429; otro estado o un cuerpo sin `records` como lista: `store.unexpected-response`.
  3. De cada registro, `namespace`, `catalogItemId` y `appName` con las formas del punto 6. Uno mal formado se salta y deja `complete: false` (regla de la 74). `namespace === 'ue'` (contenido de Unreal Engine) se salta y se cuenta, sin tocar `complete`. Repetidos por `storeGameId`, fuera.
  4. Catálogo por namespace con la petición del punto 5, pero con el token del usuario; como mucho 50 ID por petición y **6 peticiones a la vez**. Como mucho **2000 namespaces por sincronización** (revisado tras el auditor): los que sobren no se piden y la instantánea sale con `complete: false`, así nada se da de baja por no caber. Por elemento:
     - `categories` con una ruta `addons`, o `mainGameItem` o `mainGameItemList` presentes (punto 15): DLC, se salta y se cuenta;
     - con una ruta que empiece por `games`: juego, `{ storeGameId, kind: 'game', title, media }`, con `title` saneado y de 300 como mucho (si falta, `Epic <appName>`) y `media` con las reglas del punto 5;
     - lo demás (aplicaciones, contenido digital, motores): se salta y se cuenta por tipo (supuesto EA10);
     - un ID pedido que no vuelve: se salta y se cuenta, sin tocar `complete`; el mismo `shortcut:` que la 77 (un juego retirado del catálogo no aparece).
     - 401 o 403: `auth.expired`; 429: `store.rate-limited`; otro estado o un cuerpo que no es un objeto: `store.unexpected-response` para toda la sincronización (la biblioteca no se toca).
  5. `complete: true` si todo fue bien, no hubo registros mal formados y no se superó el tope de namespaces.
- **Tiempo (supuesto EA9):** 1 renovación, unas pocas páginas y unas N/6 rondas de catálogo (N = namespaces). Con 1000 juegos y unos 300 ms por petición son unos 50 s, cerca de los 60 s de la operación (74). `shortcut:` si una biblioteca real no cabe, se pasa a la petición entre namespaces del punto 5, tras comprobar su respuesta. Las bibliotecas de Epic crecen con los juegos gratuitos semanales: el tester anota el número de juegos y la duración en la prueba.
- **Núcleo:** sin cambios. Mismo `storeGameId` que el escaneo = misma propiedad; el título de la API sustituye a `DisplayName` (regla de la 74); intervalos de la 50 y la 74 (30 minutos de suelo, 12 horas al abrir la web).

#### 9. Manifiesto y contrato (`contractVersion` sigue en 1)

```ts
// connectors/epic/src/index.ts — cut 1 (ADR 78)
export function createEpicConnector(): StoreConnector {
  return {
    contractVersion: 1,
    id: "epic",
    nameKey: "connectors.epic.name" as I18nKey,
    access: "unofficial-api",
    capabilities: {
      library: false, scan: true, dlc: "none",
      actions: ["play"], launchKinds: ["uri"], uriSchemes: ["com.epicgames.launcher"],
      storePlaytime: false, price: false,
    },
    minSyncIntervalMs: 1_800_000,                 // ADR 50
    authHosts: [],
    apiHosts: ["account-public-service-prod03.ol.epicgames.com", "catalog-public-service-prod06.ol.epicgames.com"],
    mediaHosts: ["cdn1.epicgames.com", "cdn2.unrealengine.com"],
    locations: EPIC_LOCATIONS,                    // epic-launcher-data (point 3)
    externalTools: [],                            // point 2
    scanInstalled: scanEpicInstalled,
    discoverRoots: discoverEpicRoots,
    // resolveMedia: resolveEpicMedia — not declared: the catalog answers app tokens with stubs (point 15)
    resolveAction: resolveEpicAction,
  };
}
// cut 2: library: true; actions ["play", "install"]; authHosts ["www.epicgames.com"];
// apiHosts += "library-service.live.use1a.on.epicgames.com"; locations += epic-launcher (always: E5 verified, see points 4 and 14);
// connection: epicConnection; listLibrary: listEpicLibrary.
```

- **Sin tipos nuevos.** Cambios fuera del conector, todos pequeños y compatibles:
  - corte 1: límite de `storeGameId` a 160 en `core` y su comentario en `contracts` (punto 6); ID inventados de Epic en `privacy.ts` (punto 10);
  - corte 2: `json-field` tolerante en `core` y `web` (punto 7); patrón `eg1~` del redactor; tokens inventados en `privacy.ts`.
- **Paquete `connectors/epic`** (`@ludiary/connector-epic`, `"private": true`): `src/` (`manifest.ts`, `item.ts`, `ids.ts`, `scan.ts`, `launch.ts`, `auth.ts`, `media.ts`, `index.ts`; en el corte 2 también `wizard.ts` y `library.ts`), `locales/es.json` y `en.json` (`connectors.epic.*`), `fixtures/` y pruebas con `connector-testkit`. `auth.ts` existe ya en el corte 1: las constantes del cliente y el token de aplicación.
- **`runtime`:** `createConnectors()` añade `createEpicConnector()`; `packages/i18n/src/connectors.ts` su línea. La plataforma ya admite `uri`.
- **Web:** corte 1, la tarjeta de Epic queda como quedó la de GOG en la 76 (modo solo instalados activo, asistente aún en el simulador). Corte 2, `real.ts` amplía la lista cerrada de tiendas con asistente real a `['steam', 'gog', 'epic']`, sin `sessionStorage` (sin redirección, como GOG).
- **Textos nuevos** (es y en): `connectors.epic.errors.invalidId`, `connectors.epic.errors.launcherMissing` (corte 2), `connectors.epic.login.title`, `.login.body`, `.login.field`, `connectors.epic.error.code`, `.error.corrective`, `.error.expired` y `connectors.epic.disconnect.hint`.

#### 10. Pruebas

- **Fixtures inventadas.** La comprobación de privacidad (`packages/connector-testkit/src/privacy.ts`) rechaza cualquier hexadecimal de 32, y los namespace, ID de catálogo, `client_id`, `client_secret` y códigos de Epic lo son. Por eso **no hay ninguna respuesta real grabada** de Epic, ni siquiera del catálogo público, y:
  - `ALLOWED` admite como ficticios los hexadecimales de 32 que empiezan por 24 ceros: `(?<![0-9A-Za-z])0{24}[0-9a-f]{8}(?![0-9A-Za-z])`. Ningún ID real tiene esa forma. Se usan namespace `000000000000000000000000000000a1`…, ID de catálogo `00000000000000000000000000000001`…, `appName` `TestGame01`…, código `00000000000000000000000000c0de01` y `account_id` `00000000000000000000000000000a01`;
  - corte 2: `FICTIONAL_EPIC_VALUES` con `eg1~epic-test.access.token`, `eg1~epic-test.refresh.token`, `eg1~epic-test.refresh.token-2` y `eg1~epic-test.client.token` (cumplen el patrón de aceptación). `displayName` `TestUser`;
  - imágenes con la forma `https://cdn1.epicgames.com/offer/000000000000000000000000000000a1/test-cover_1200x1600-0000`; rutas bajo `C:\Games` o `D:\Epic Games`, nunca `C:\Users\…`;
  - las pruebas comparan la cabecera `basic` con la calculada desde las constantes de `auth.ts`; el `client_secret` no aparece en ningún fichero de `fixtures/` ni de pruebas. Una prueba del repositorio comprueba que su valor solo está en `connectors/epic/src/auth.ts` (como la B1 de la 77). **Precisado tras el auditor:** la prueba recorre **todos** los ficheros de `git ls-files`, incluidos `docs/` y `.claude/`, y busca tanto el secreto como `base64(client_id:client_secret)`.
  - `privacy.ts` añade una regla propia, «Epic eg1 token», que rechaza cualquier `eg1~` seguido de caracteres de token que no sea uno de `FICTIONAL_EPIC_VALUES` (revisado tras el auditor).
- **Corte 1, `connectors/epic`:**
  - `.item`: con y sin BOM, JSON roto, sin cada campo obligatorio, `InstallLocation` relativa, con `/`, con barra final o con control, y cada caso de la regla estricta del punto 14, M1 (se salta y se cuenta, nunca `internal`); `bIsIncompleteInstall`; DLC por `MainGameAppName` y por `addons`; `AppCategories` sin `games`; namespace `ue`; título ausente, no ASCII y de más de 300; ID de catálogo en mayúsculas (sale en minúsculas).
  - `discoverRoots`: carpeta de datos siempre; padres agrupados sin distinguir mayúsculas; raíz de unidad → carpeta del juego con `tag: 'game'`; sin `Manifests` → solo la carpeta de datos; incompletos y DLC no generan raíz.
  - `scanInstalled` con `memoryFiles`: sin la carpeta de datos entre las raíces → vacío; juego dentro de una raíz activa; juego cuya raíz no está (desactivada) → se salta **sin** tocar el disco fuera de raíces; `InstallLocation` inexistente; `.item` bloqueado y `readDir` de `Manifests` con error → **todas** las raíces ilegibles; `Manifests` inexistente → vacío con las raíces legibles; unión que escapa → se salta; tope de 2000; ID repetido; el registro no lleva rutas, títulos ni ID.
  - `resolveAction`: URI exacta de `play` con los tres segmentos y `%3A`, construida desde los grupos y con la aserción final; namespace `fn` conservado y namespace hexadecimal en mayúsculas pasado a minúsculas; ID que no cumple el patrón (con `:` de más, `/`, `?`, `&`, espacios, mayúsculas en el ID de catálogo) → `action.unsupported` sin eco; `installPath` nulo → `not-installed`; otras acciones → `null`.
  - `resolveMedia` con `fakeHttp`: token de aplicación (formulario y cabecera exactos); agrupación por namespace con `id` repetido en la URL; `DieselGameBoxTall` y su respaldo `OfferImageTall`; host no permitido omitido; ID que no vuelve; 404; 401 y 403 del token; 429 que corta en seguida; más de 8 s; 500 y cuerpo que no es objeto → lanza; como mucho 6 en vuelo; más de 50 ID de un namespace → varias peticiones; lote sin ningún ID válido → ninguna petición, ni la del token; el token de aplicación nunca aparece en el registro ni en un error.
  - `assertConnectorConformance`.
- **Corte 1, fuera del conector:** `core`, un `storeGameId` de 158 caracteres se acepta en escaneo y biblioteca y uno de 161 se rechaza; `runtime`, registro de los tres conectores y paridad de la CSP con los dos hosts nuevos; `i18n`, paridad con `connectors/epic/locales`; `privacy.ts`, el patrón de ceros se admite y un hexadecimal de 32 cualquiera sigue rechazado; Playwright, un árbol de datos de Epic en una carpeta temporal (manifiesto y carpeta del juego), `LocationResolver` doble y `ProcessLauncher` que graba: el juego sale con el icono de vía no oficial y Jugar graba la URI exacta.
- **Corte 2:** las mismas pruebas que la 77 adaptadas: URL de ida exacta (con `redirectUrl` codificada); canje con formulario, cabecera y `token_type` exactos; 400 y 401 → `auth.invalid`; `corrective_action_required` → su clave; `errorMessage` nunca en el resultado ni en el registro; tokens que no cumplen el patrón; `displayName` saneado y ausente; `refresh_expires` y `expires_in` registrados como números; renovación con `set` **antes** de la primera petición a la biblioteca; 400, 401 y 403 → `auth.expired`; paginación con cursor, cursor repetido, cursor vacío, de más de 2048 o con control, tope de páginas y registros, registro mal formado (`complete: false`), namespace `ue`; más de 2000 namespaces → `complete: false` sin pedir los que sobran; catálogo con juego, DLC (`addons` y `mainGameItem`), aplicación y ID que no vuelve; `bearer` solo hacia los hosts de Epic que lo necesitan, nunca hacia el CDN; Instalar con launcher, sin launcher y con `ModSdkCommand` con `/`; época cambiada a mitad. En `core` y `web`, `json-field` con JSON, con texto alrededor de las llaves, con el código suelto, entre comillas, con un texto JSON, con un número o una lista, con un JSON sin el campo y con el campo no de texto; la web envía solo el valor extraído; `exchangeCode` y `sid` con valor no aparecen en la petición, en el registro ni en ningún error. En `runtime`, el redactor tapa un token `eg1~` entero. Playwright: asistente de Epic contra un Epic doble → no instalados → Instalar graba la URI con `action=install` → desconectar deja el velo.
- **Guía manual** (`docs/manual-tests/epic.md`, la prepara el `tester` y la hace el usuario; punto 11).

#### 11. Prueba manual (corte 1, y sección «Account» para el corte 2)

- **Preparación:** iniciar sesión en el launcher de Epic, conseguir **Home – A Unique Horror Adventure** (gratis en la tienda de Epic del 22-10-2026 a las 17:00 al 29-10-2026 a las 16:00, hora peninsular, según el feed público de promociones consultado el 22-10-2026; es un juego 2D pequeño) e instalarlo en una carpeta con espacios y una «ñ», por ejemplo `E:\Epic Games ñ`. Si el usuario ya tiene en su cuenta otro juego pequeño de Epic, vale ese. Hay que conseguirlo **antes del 29-10-2026**.
- **Corte 1, qué comprobar:**
  1. En `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests` aparece un `.item`. Copiar al ADR, saneados (sin rutas de usuario), los nombres de sus campos y los valores de `AppCategories`, `bIsIncompleteInstall`, `MainGameAppName` y la forma (longitud y caracteres, no el valor) de `CatalogNamespace`, `CatalogItemId` y `AppName` (E2, E6). Mirar si la carpeta del juego tiene `.egstore\*.mancpn` y qué campos lleva (E10).
  2. ~~`reg query "HKCU\Software\Epic Games\EOS" /v ModSdkCommand`: anotar si existe y si apunta al `EpicGamesLauncher.exe` de `E:` (E5).~~ Ya comprobado el 22-10-2026 (E5). Se mira solo que Ajustes muestra la carpeta de datos resuelta por `AppDataPath` (E1).
  3. Ludiary con autodetección: Ajustes muestra la carpeta de datos y la biblioteca de Epic; tras el escaneo, el juego sale con su título y su portada vertical (E7, E8). Si no hay portada, anotar el host de la imagen del registro.
  4. Jugar con el launcher **cerrado**: arranca el launcher en segundo plano y luego el juego, sin mostrar la ventana del launcher (E3). Repetir con el launcher abierto.
  5. Desactivar en Ajustes la carpeta de la biblioteca: el juego desaparece tras el escaneo. Volver a activarla.
  6. Con «solo carpetas manuales»: Epic no muestra el juego (comportamiento decidido, punto 13.3).
  7. Desinstalar desde el launcher y escanear: el juego desaparece.
  8. El registro exportado no contiene rutas, títulos ni ID de Epic.
- **Corte 2, sección «Account (ADR 78)»:**
  1. Conectar en Chrome, Edge y Firefox: el login abre en pestaña nueva, la página final es el JSON y Pegar lo acepta, copiando la página entera y copiando solo el código (EA2, EA3). Anotar solo la forma del código.
  2. «Conectado como <nombre>».
  3. Juegos no instalados: el número coincide con la biblioteca de la web de Epic sin DLC; anotar el número de juegos y lo que tarda la primera sincronización (EA9). Ningún juego poseído falta; si falta alguno, anotar su título.
  4. El juego instalado sale una sola vez, con el título de la API.
  5. Instalar un juego no instalado: el launcher abre su diálogo de instalación (E4). Si no hace nada, anotar qué pasa.
  6. Anotar el `refresh_expires` y el `expires_in` del registro (EA5). Sincronizar dos veces separadas por más de 30 minutos y al día siguiente: sigue conectado, o pasa a «Hay que volver a conectar».
  7. Cambiar la contraseña en epicgames.com y sincronizar: `expired`; reconectar.
  8. Desconectar: velo gris en los no instalados; el instalado sigue jugable.
  9. El registro exportado no contiene `authorizationCode`, `eg1~`, `bearer`, `basic`, el nombre de la cuenta ni ID de Epic.

#### 12. Orden de implementación y trabajo en paralelo

1. **Primero** (`programador`, pequeño): límite de `storeGameId` a 160 en `core` con su comentario en `contracts` y sus pruebas; el patrón de ID ficticios en `privacy.ts`.
2. **En paralelo:**
   - `conectores`: `connectors/epic` del corte 1 completo contra `connector-testkit` (puntos 3 a 6 y 9, y sus pruebas);
   - `programador`: registro en `runtime`, CSP y `vite.config.ts`, línea de `i18n`;
   - `auditor`: revisión de este diseño antes del código (el cliente del launcher en el repositorio, el token de aplicación, la regla de raíces de `scanInstalled` y el límite de 160).
3. **Después:** Playwright y revisión del `auditor` sobre el código.
4. **Prueba manual del corte 1** (punto 11) con los supuestos E cerrados en este ADR, y el `documentalista`: guía (Epic detectado solo con autodetección; Jugar abre el launcher), privacidad (catálogo de Epic con los ID detectados) y aviso de vía no oficial.
5. **Corte 2**, con lo aprendido: primero `json-field` tolerante en `core` y `web`, el redactor y los valores ficticios; en paralelo `conectores` (`auth.ts`, `wizard.ts`, `library.ts`, `install`, la ubicación `epic-launcher`) y `programador` (`real.ts`, simulador); revisión del `auditor` antes y después; prueba manual de la cuenta; `documentalista`: guía de conexión con capturas (copiar el texto entre llaves, el aviso de Epic), privacidad y solución de problemas.

#### 13. Lo que decide el usuario (solo producto)

**Aplicado por defecto (22-10-2026), salvo que el usuario diga otra cosa**, por analogía con lo que eligió en Steam y GOG: 13.1 (a), 13.2 (a) y 13.3 (a).

1. **Nombre de la cuenta:** (a) «Conectado como <nombre>», con `displayName` de la respuesta del canje, sin petición extra (recomendado); (b) solo «Conectado».
2. **Instalar sin el launcher de Epic:** (a) mensaje «Hace falta el launcher de Epic Games» (E5 ya comprobado); (b) abrir la ficha de la tienda en el navegador, que necesita una decisión nueva (como el 12.2 de la 77).
3. **Modo «solo carpetas manuales»:** (a) Epic no detecta instalados sin sus manifiestos, y la guía lo dice (recomendado: cero código, y Jugar necesita el launcher igualmente); (b) añadir la carpeta del juego a mano y leer `.egstore\*.mancpn`, solo si la prueba confirma E10, en un cambio pequeño posterior.
4. **Juego de prueba:** Home – A Unique Horror Adventure, que hay que conseguir antes del 29-10-2026, u otro juego pequeño que ya tenga en su cuenta.

#### 14. Revisión del auditor sobre el diseño (22 de octubre de 2026)

Sin críticos ni altos. Todo queda incorporado en los puntos anteriores; aquí, el resumen y lo que no cabe en ellos.

- **M1. Los `.item` son entrada no confiable.** `C:\ProgramData\Epic` da control total a `BUILTIN\Usuarios` (comprobado el 22-10-2026): cualquier cuenta del equipo puede escribir un manifiesto. `InstallLocation` debe cumplir la **misma regla que `localPath` de `process-launcher.ts`** (decisión 76, segunda barrera), y además no ser la raíz de una unidad:
  - empieza por `^[A-Za-z]:\\` (sin UNC, `\\?\` ni `\\.\`), tras cambiar `/` por `\` y quitar las barras finales;
  - ningún componente vacío, `.` ni `..`, ni acabado en punto o en espacio;
  - ningún `:` después de la posición 1 y ninguno de `"<>|?*` ni caracteres de control;
  - ningún componente que sea un nombre reservado de dispositivo (`CON`, `PRN`, `AUX`, `NUL`, `COM0` a `COM9`, `LPT0` a `LPT9`, sin distinguir mayúsculas y también con extensión);
  - no es una raíz de unidad (`C:\`).
  - Si no cumple: se salta y se cuenta, **nunca** `internal` (un fichero de otro usuario no debe parar el escaneo). La misma regla vale en `discoverRoots` antes de proponer una raíz. El efecto máximo de un `.item` falso, una vez dentro de las raíces, es mostrar un juego inexistente o con otro título, y Jugar solo abre una URI del launcher con ID validados: no hay `exec`.
- **M2. `json-field`:** la web envía solo el valor extraído; `exchangeCode` y `sid` nunca se leen, registran ni devuelven (punto 7).
- **M3. `Manifests` inexistente frente a ilegible:** inexistente → vacío con las raíces legibles (baja de las instalaciones); `readDir` con error → todas las raíces ilegibles (punto 3).
- **Bajos, incorporados:** regla exacta de `json-field` según el tipo de JSON (punto 7); cursor validado y repetido → `store.unexpected-response` (punto 8); tope de 2000 namespaces por sincronización con `complete: false` (punto 8); 50 ID por petición y sin token de aplicación si no hay lote válido (punto 5); URI desde los grupos del patrón con aserción final y namespace en minúsculas solo si es hexadecimal de 32 (puntos 4 y 6); prueba del `client_secret` sobre todo `git ls-files` y también en base64 (punto 10); regla propia de `privacy.ts` para `eg1~` (punto 10); `expires_in` registrado junto a `refresh_expires` (punto 7).
- **E5 comprobado** (`ModSdkCommand` en `HKCU`, con `/` y sin comillas): la ubicación `epic-launcher` y la comprobación de Instalar van siempre en el corte 2; launcher presente = ubicación resuelta al `.exe` (punto 4). **`AppDataPath`** (`HKLM`, vista de 64 bits, con barra final; no existe en `WOW6432Node`) pasa a primera fuente de la carpeta de datos, con la carpeta conocida de respaldo (punto 3). E1 queda a medias.
- **Fuera del ADR, para el usuario:** las definiciones de los agentes `conectores` y `auditor` (`.claude/agents/`) aún citan `legendary`. No se tocan aquí; decide el usuario si se actualizan.

#### 15. Peticiones reales sin cuenta y decisiones de implementación del corte 1 (22 de octubre de 2026)

**Comprobado por el agente `conectores` con peticiones reales sin cuenta:**

- El token de aplicación (`client_credentials`, `token_type=eg1`) responde 200 con `expires_in` 14 400, sin `User-Agent` propio (EA8, en parte).
- El catálogo por namespace responde 401 sin token y 200 con el token de aplicación. Para los 11 juegos de terceros del feed de juegos gratuitos devuelve un elemento incompleto: sin `keyImages`, con `categories` solo `audience` o `public` y con títulos internos (`DevGeneralAudience`). Solo Fortnite (namespace `fn`) trae `keyImages` (`DieselGameBox` y `DieselGameBoxTall`, en `cdn1.epicgames.com`).
- **Consecuencia:** E7 es falso en la práctica y `resolveMedia` no se declara (punto 5). El corte 1 queda sin portadas para los instalados hasta conectar la cuenta. La CSP mantiene los dos hosts, que usará el corte 2.

**Riesgo para el corte 2:** si el catálogo también devolviera elementos incompletos sin `categories` con el token del **usuario**, `listLibrary`, que filtra por rutas `games` (punto 8), saldría vacía. Es lo **primero** que comprueba la prueba manual del corte 2, antes del resto de la sección «Account». Si pasa, se decide aparte el criterio de juego (por ejemplo, el `.item` o los registros de la biblioteca).

**Decisiones del conector, incorporadas al diseño:**

- **DLC:** también se marca DLC un elemento del catálogo con `mainGameItemList`, además de `mainGameItem` (punto 8).
- **`.item` sin `AppCategories`:** se trata como juego (revisa para ese caso el paso 5 del escaneo del punto 3, que lo saltaba). `shortcut:` un manifiesto antiguo o recortado no debe esconder un juego instalado; un `AppCategories` presente y sin `games` se sigue saltando.
- **Jugar sin `installPath`:** `launch.not-installed` sin `messageKey`. La interfaz usa el texto común `connectors.common.errors.launch.not-installed`.
- **E5:** cerrado (punto 14).

#### Supuestos de Epic, corte 1 (verificar en la prueba manual; los marcados con «sin verificar» no tienen más fuente que la indicada)

- **E1 (a medias):** los manifiestos están en `<AppDataPath>\Manifests`. Comprobado el 22-10-2026: `AppDataPath` existe en `HKLM\SOFTWARE\Epic Games\EpicGamesLauncher` (vista de 64 bits, con barra final, no en `WOW6432Node`), la carpeta `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests` existe con el launcher en `E:`, y GameFinder la da como carpeta por defecto. Falta ver que el launcher escribe ahí el `.item` del juego de prueba.
- **E2 (sin verificar):** cada `.item` es un JSON con `DisplayName`, `AppName`, `CatalogNamespace`, `CatalogItemId`, `InstallLocation`, `LaunchExecutable`, `bIsIncompleteInstall`, `MainGameAppName` y `AppCategories`; los juegos llevan `games` en `AppCategories`, y los DLC, `addons` o un `MainGameAppName` distinto. Fuentes: ejemplo de la wiki de GameFinder y el artículo de jayd.ml; la regla de categorías no tiene fuente directa.
- **E3:** `com.epicgames.launcher://apps/<namespace>%3A<catalogItemId>%3A<appName>?action=launch&silent=true` arranca el juego. Es el formato de los accesos directos del launcher (hilo de los foros de Steam con el de Final Fantasy VII Remake); el esquema está registrado en el equipo del usuario (comprobado). Falta ver el arranque con el launcher cerrado.
- **E4 (sin verificar):** la misma URI con `action=install` abre el diálogo de instalación. Sin fuente directa.
- **E5 (comprobado el 22-10-2026 en el equipo del usuario):** `HKCU\Software\Epic Games\EOS`, valor `ModSdkCommand`, guarda la ruta de `EpicGamesLauncher.exe` (la de `E:`), con `/` como separador y sin comillas. GameFinder cita `ModSdkMetadataDir` en esa clave.
- **E6 (sin verificar):** el ID de catálogo es un hexadecimal de 32; el namespace cumple `[A-Za-z0-9_-]{1,64}` y el `appName`, `[A-Za-z0-9._-]{1,60}`, con el mismo uso de mayúsculas en el `.item` y en la biblioteca. Los del feed público son hexadecimales de 32 en minúsculas (comprobado el 22-10-2026); hay `appName` legibles (`Fortnite`) y otros hexadecimales.
- **E7 (falso en la práctica, comprobado el 22-10-2026):** el catálogo acepta el token de `client_credentials` (200; sin token, 401), pero para los juegos de terceros devuelve elementos incompletos, sin `keyImages`. Detalle en el punto 15.
- **E8 (en parte):** las imágenes están en `cdn1.epicgames.com` y `cdn2.unrealengine.com` (comprobado en el feed público el 22-10-2026); los tipos `DieselGameBoxTall` y `DieselGameBox` del catálogo, y sus hosts, sin verificar.
- **E9:** muchos juegos necesitan el launcher o un código de intercambio para arrancar. Comprobado en el código de `legendary` (`core.py`, `get_launch_parameters`: `-AUTH_PASSWORD` con un código de intercambio y `-epicovt` con un token de propiedad para los juegos que lo piden). Qué juegos concretos lo exigen no consta.
- **E10 (sin verificar):** la carpeta del juego tiene `.egstore\*.mancpn` con `AppName`, `CatalogNamespace` y `CatalogItemId`. Sin fuente; no se usa (punto 13.3).
- **E11:** `GET …/catalog/api/shared/namespace/<ns>/bulk/items?id=…` devuelve un objeto con una entrada por ID de catálogo, con `title`, `categories`, `keyImages` y `mainGameItem`. La petición la confirman `legendary` (`egs.py`), Playnite (`EpicAccountClient.cs`) y `egs-api` (`egs.rs`); la forma de la respuesta, solo por cómo la usa `legendary`.

#### Supuestos de la cuenta de Epic, corte 2

- **EA1 (sin verificar):** Epic no ofrece a terceros un registro OAuth con acceso a la biblioteca y tolera el uso del cliente del launcher. Solo consta su uso público por `legendary`, Heroic, Playnite y `egs-api`.
- **EA2:** la URL de login y la página final en JSON con `authorizationCode`. Comprobado el 22-10-2026: `legendary.gl/epiclogin` redirige a esa URL, y `www.epicgames.com/id/api/redirect` responde, sin sesión, `{"warning":…,"redirectUrl":…,"authorizationCode":null,"exchangeCode":null,"sid":null}`. Falta con sesión.
- **EA3 (sin verificar):** el código es un hexadecimal de 32 en minúsculas (lo que espera la prueba de `validate.test.ts` y el uso público). `legendary` acepta el JSON o el código suelto (comprobado en `cli.py`).
- **EA4:** `POST /account/api/oauth/token` con formulario, autenticación `basic` del cliente y `token_type=eg1`; respuesta con `access_token`, `refresh_token`, `expires_in`, `refresh_expires`, `account_id` y `displayName`; `eg1` es un JWT firmado con el prefijo `eg1~`. Confirmado en `legendary` (`egs.py`), `egs-api` (`login.rs`), Playnite y la documentación de la comunidad (FortniteEndpointsDocumentation, `Token.md`).
- **EA5 (sin verificar):** cada renovación entrega un refresh token nuevo; su duración no consta (28 800 s en la documentación de la comunidad, para otro cliente). Se cierra con `refresh_expires` y `expires_in` registrados.
- **EA6 (sin verificar):** un código o un refresh token no válidos dan 400 o 401 con `errorCode`; `corrective_action_required` existe. `legendary` trata cualquier 4xx con `errorCode` como credenciales no válidas.
- **EA7:** `GET library-service…/library/api/public/items` con `includeMetadata`, paginado con `responseMetadata.nextCursor` y `cursor`. Confirmado en `legendary`, `egs-api` y Playnite (este con `platform=Windows`). Que cada registro traiga `namespace`, `catalogItemId` y `appName`, por cómo lo usa `legendary`; sin ver una respuesta.
- **EA8 (confirmado el 22-10-2026 para el token de aplicación):** Epic no exige un `User-Agent` del launcher: `client_credentials` con `token_type=eg1` da 200 sin `User-Agent` propio. Falta con los tokens de usuario.
- **EA9 (sin verificar):** límites de peticiones del catálogo y de la biblioteca sin documentar; 6 peticiones a la vez y unos 300 ms por petición.
- **EA10 (sin verificar):** `categories` usa rutas `games…`, `addons…`, `applications` y otras, como en el feed público (comprobado allí el 22-10-2026); `mainGameItem` marca un DLC (por `includeMainGameDetails` de `legendary`).

Fuentes consultadas el 22 de octubre de 2026: [`legendary`, `api/egs.py`](https://github.com/derrod/legendary/blob/master/legendary/api/egs.py), [`cli.py`](https://github.com/derrod/legendary/blob/master/legendary/cli.py) y [`core.py`](https://github.com/derrod/legendary/blob/master/legendary/core.py); [`legendary.gl/epiclogin`](https://legendary.gl/epiclogin) (redirección); [`www.epicgames.com/id/api/redirect`](https://www.epicgames.com/id/api/redirect); [`egs-api`](https://docs.rs/crate/egs-api/0.9.0), [`egs.rs`](https://github.com/AchetaGames/egs-api-rs/blob/master/src/api/egs.rs) y [`login.rs`](https://github.com/AchetaGames/egs-api-rs/blob/master/src/api/login.rs); [Playnite, `EpicAccountClient.cs`](https://github.com/JosefNemec/PlayniteExtensions/blob/master/source/Libraries/EpicLibrary/Services/EpicAccountClient.cs); [FortniteEndpointsDocumentation, `Token.md`](https://github.com/LeleDerGrasshalmi/FortniteEndpointsDocumentation/blob/main/EpicGames/AccountService/Authentication/Token.md); [GameFinder, Epic Games Store](https://github.com/erri120/GameFinder/wiki/Epic-Games-Store); [jayd.ml, bibliotecas de Epic y Steam](https://jayd.ml/games/2020/05/16/epic-games-store-steam-libraries.html); [foros de Steam, acceso directo de Epic](https://steamcommunity.com/discussions/forum/1/4286935719733617676/); [feed público de promociones de Epic](https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=es-ES&country=ES&allowCountries=ES).

**Motivo:** con los manifiestos del launcher, la URI de sus propios accesos directos y el catálogo, Epic cabe en el contrato **sin tipos nuevos**: lo único que el contrato no permitía era un ID de 158 caracteres, y subir un límite de validación es la forma más pequeña de llevar en el ID todo lo que piden la URI y el catálogo, sin `launchData` en la biblioteca. Jugar por el launcher es lo único que funciona con los juegos que exigen la sesión de Epic al arrancar, y es la misma forma que Steam. HTTP directo evita, como en la 77, un binario Python, una GPL más y el `ExternalToolRunner`. Separar dos cortes deja validar escaneo, Jugar y portadas, el mayor riesgo, sin secretos, y aplazar los supuestos de la cuenta (duración de la sesión, forma de la biblioteca) a cuando haya un juego real con el que comprobarlos. Alternativas descartadas: `legendary` (punto 2); `exec` directo (punto 4); `LauncherInstalled.dat` y `.mancpn` como fuente (punto 3); el GraphQL de la tienda para las portadas (punto 5); guardar el ID de catálogo solo y el resto en `launchData` (Instalar no podría construir la URI).

**Consecuencias:**

- Tercera tienda con salida de red y dos hosts de imágenes más en la CSP. Primer token de aplicación (sin usuario) obtenido con un cliente público.
- La regla 7 de la decisión 40 queda revisada también para Epic: ninguna tienda usa herramientas externas, y la licencia de `legendary` deja de afectar a la distribución (decisión 60). La parte de Epic de la decisión 43 queda revisada: sin ventana de `legendary`, el JSON pegado es la vía.
- La fila de Epic de la tabla de la 40 pasa a «`uri` (`com.epicgames.launcher`) del launcher».
- El núcleo acepta `storeGameId` de hasta 160 caracteres para todas las tiendas.
- Sin carpeta de datos del launcher (modo «solo carpetas manuales»), Epic no muestra instalados.
- Antes de cerrar cada corte, el `auditor` revisa: las constantes del cliente y su única aparición en `auth.ts`, el token de aplicación, la regla de raíces y de errores de `scanInstalled`, el límite de 160, y en el corte 2 el orden de guardado, la cabecera `bearer` como `Secret`, el `json-field` tolerante, el redactor `eg1~` y las fixtures.
- El `tester` prepara `docs/manual-tests/epic.md` (punto 11); el `documentalista`, las guías de los pasos 4 y 5 del punto 12.

## Arquitectura resultante

- **Núcleo (backend):** API, base de datos SQLite y sincronización periódica.
- **Conectores por tienda** (Steam, GOG, Epic, Ubisoft, EA) con interfaz común (decisión 40): asistente de conexión, listar biblioteca con DLC, escanear instalaciones, describir cómo se lanza un juego guardado (URI o línea de comandos) y, en el futuro, consultar precio.
- **Estructura en paquetes** y reglas de dependencia entre ellos: decisión 38.
- **Escáner** de carpetas de instalación.
- **Proveedor de metadatos** intercambiable (IGDB/RAWG).
- **Frontend** SPA servida por el backend.
- **Agente local** (fase posterior): el mismo ejecutable de localhost, funcionando como cliente de un servidor casero para lanzar juegos y escanear carpetas del PC.

## Riesgos principales

- APIs no oficiales (Epic, GOG) que pueden romperse sin aviso.
- Ubisoft y EA sin API: dependen del escaneo local.
- Limitación del modo servidor: sin agente local no puede lanzar juegos ni escanear carpetas del PC.
- Precios directos de tienda: mantenimiento continuo.
- Credenciales de varias cuentas guardadas en el servidor: cifrado y alcance solo LAN.
- Empaquetado del ejecutable (instalador, bandeja, almacén de claves y SQLite): validarlo pronto.
- Lanzamiento heterogéneo por tienda: GOG usa línea de comandos y las URI de EA han fallado en algunos juegos.
- Nombre del proyecto sin comprobar aún en las bases oficiales de marcas (decisión 44).
- Sin certificado Authenticode, Windows mostrará avisos al instalar (decisión 58).
- Otros usuarios del mismo equipo comparten los puertos de `127.0.0.1`: mitigado con la autenticación mutua y la sesión ligada al puerto (decisión 63), con la escucha en `127.0.0.1` y `[::1]` a la vez (decisión 66) y con la clave de origen, sin la cual una cookie robada desde otro puerto no autoriza acciones sensibles (decisión 67, pendiente de implementar junto con la primera de esas acciones); queda por verificar que no pueden secuestrar un puerto ya ocupado.

## Hoja de ruta sugerida

1. **MVP:** conectores de biblioteca, escaneo de carpetas, interfaz con cuadrícula de juegos y lanzamiento directo desde el ejecutable, en modo localhost.
2. **Fase 2:** modo Docker (servidor casero), agente local y preparación para multiusuario.
3. **Fase 3:** comparador de precios con IsThereAnyDeal, más precios directos de tienda donde no cubra.
4. **Fase 4:** histórico de precios y alertas de mínimos.

Sin fase asignada: juegos manuales y personalización de metadatos por el usuario.

## Pendiente por decidir

Revisado con el usuario el 21 de octubre de 2026. Quedan abiertos:

- Actualizador con vuelta atrás (decisión 58): por implementar y validar en Windows; condición que antes cerraba la 45.
- Detección del proceso de cada juego: propuesta en la 55. Se cierra en el corte 2b de la 72 (tiempo de juego), que pasa a ir **después** del primer corte de GOG (decisión 76), con al menos tres juegos reales, y se revalida con cada tienda nueva.
- Puntos de producto de la decisión 72: A y B decididos por el usuario. (C), orden de los cortes, **resuelto** el 22-10-2026: tras la cuenta de Steam (74) el usuario encargó GOG (76), antes del corte 2b.
- Decisión 76, punto 11.1 (usuario): cómo se abre un juego de GOG (directo, a través de Galaxy o con un ajuste). El punto 11.2 queda **resuelto** el 22-10-2026: el usuario eligió (b), la cuenta de GOG ahora, pero sin el emparejamiento, que va en su propio corte; el corte 2b va después (decisión 77).
- Decisión 77: punto 12 aplicado por defecto («Conectado como <nombre>» y mensaje si no hay Galaxy); el usuario puede cambiarlo. Prueba manual de la cuenta (punto 10) para cerrar los supuestos GA1 a GA13, y revisión del `auditor` antes y después del código.
- Decisión 78 (Epic): punto 13 aplicado por defecto («Conectado como <nombre>», mensaje si falta el launcher, sin instalados de Epic en «solo carpetas manuales»); el usuario puede cambiarlo. El usuario consigue Home – A Unique Horror Adventure (u otro juego pequeño) **antes del 29-10-2026** para la prueba manual del corte 1 (punto 11), que cierra los supuestos E pendientes (E5 ya comprobado; E7 falso, el corte 1 va sin portadas). La prueba del corte 2 comprueba primero que el catálogo con el token del usuario trae `categories` y `keyImages` (punto 15). El usuario decide si se actualizan las definiciones de los agentes `conectores` y `auditor`, que aún citan `legendary` (punto 14). El corte 2 cierra EA1 a EA10; si la sesión de Epic dura pocas horas (EA5), se decide aparte. Revisión del `auditor` antes y después del código de cada corte.
- Emparejamiento entre tiendas (decisiones 20, 51 y 76): sin corte asignado. Hasta entonces, un juego poseído en Steam y en GOG (o Epic) sale una vez por tienda.
- Decisión 76: prueba manual con GOG Galaxy y Beneath a Steel Sky (punto 9) para cerrar los supuestos G1 a G15.
- Decisión 74: comprobar a mano con la cuenta real la vuelta de OpenID a `ludiary.localhost` (supuesto S1) y el resto de supuestos de Steam (S3 a S11).
  - Aviso «Simulado» en producción en las partes que el cliente real delega en el simulador (punto 7). Propuesta del auditor, que el arquitecto recomienda: quitar `&& isSimulated` de `SimNote` en `bits.tsx` y que `getMaintenance` de `real.ts` devuelva `lastBackupAt: null`.
  - Juegos de Steam movidos con `mklink /J` a otro disco, que hoy no se ven (punto 11): dejarlo así y documentarlo (recomendado en este corte) o admitirlos añadiendo el destino real como raíz con permiso explícito.
- Linux y macOS: propuesta preliminar en la 61. Se cierra al terminar la fase 2.
- Comprobar el nombre «Ludiary» en las bases oficiales de marcas (EUIPO, OEPM, USPTO) y la disponibilidad de dominios antes de la primera publicación (decisión 44).
- Verificar los supuestos marcados en las decisiones 39 a 78 cuando se implemente cada parte. Del prototipo del instalador quedan: cerrojo de SQLite tras `taskkill /F` (62), secuestro de puerto desde otra cuenta, también en `[::1]` (63 y 66), cuadro en primer plano (64), `execArgvExtension` en Node 24.20 (65), y resolución, proxy y contexto seguro de `ludiary.localhost` en los navegadores (66).
