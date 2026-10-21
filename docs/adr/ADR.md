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
| 40 | Contrato de los conectores de tienda | Vigente (confirmada por el usuario); `mediaHosts` añadido en la 71; `discoverRoots`, medios en instalados y `launchersResolved` añadidos en la 72 |
| 41 | Controlador de SQLite: `better-sqlite3` con Drizzle estable | Vigente (confirmada por el usuario) |
| 42 | Detección de instalaciones: autodetección y carpetas manuales | Vigente (confirmada por el usuario) |
| 43 | Credenciales en los asistentes de conexión | Vigente (confirmada por el usuario; revisa la 11) |
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
| 64 | Errores fatales visibles y credenciales no reconocidas | Vigente (compartimento de claves decidido por el usuario; amplía las 35, 45 y 46) |
| 65 | Ganchos de prueba y opciones de Node en el ejecutable publicado | Vigente (recomendada; amplía la 45) |
| 66 | Dirección de la web: `ludiary.localhost` | Vigente (recomendada; nombre aceptado por el usuario; amplía las 23, 28 y 29 y revisa la URL del enlace de la 63); alcance de la sesión ligada al puerto corregido en la 67 |
| 67 | Segundo factor ligado al origen y cookie de la dirección alternativa | Vigente (recomendada; amplía las 29 y 54 y corrige las 63 y 66) |
| 68 | Primera versión de `apps/web`: estructura, datos simulados y CSP | Vigente (recomendada; concreta la 10); portadas e `img-src` revisados en la 71; servir la SPA, librería de esquemas y selector de carpetas concretados en la 72 |
| 69 | Asistente de primer arranque | Vigente (confirmada por el usuario) |
| 70 | Fuentes tipográficas empaquetadas (OFL-1.1) | Vigente (confirmada por el usuario; amplía la 60) |
| 71 | Portadas de Steam desde su CDN | Vigente (qué, confirmado por el usuario; cómo, recomendado; revisa la 68 en portadas y CSP; amplía las 6 y 40) |
| 72 | Primer corte vertical de Steam: instalados, biblioteca y lanzamiento | Vigente (recomendada; tres puntos pendientes del usuario; amplía las 40, 42, 47, 50 y 68) |

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

### 40. Contrato de los conectores de tienda (ampliada en las decisiones 71 y 72)

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
5. **Lanzamiento (invariante 3).** La API solo recibe el ID de un juego canónico guardado y, opcionalmente, el ID de una de sus propiedades; el núcleo carga la `StoredProperty` de la base de datos y llama a `resolveAction`. Antes de ejecutar, el núcleo comprueba: que la acción y el tipo están en las capacidades; para `uri`, que el esquema está en `uriSchemes`; para `exec`, que `executable` es una ruta absoluta existente dentro de `installPath` de esa propiedad o de una ubicación resuelta de tipo `launcher`, y que ningún argumento contiene caracteres de control. `ProcessLauncher` ejecuta sin shell, con argumentos como lista, y abre las URI con la API del sistema, no con `cmd /c start`. La `LaunchSpec` no sale nunca por la API; la única excepción futura es el modo servidor sin agente (decisión 22), que devuelve al navegador solo especificaciones `uri` con esquema permitido.
6. **Secretos.** Los conectores guardan y leen sus tokens solo con `secrets`; el cifrado (algoritmo pendiente) y la clave (decisión 14) son del núcleo y de la plataforma. Los `Secret` no se pueden imprimir por accidente y el registro filtra además cualquier valor que coincida con un secreto conocido.
7. **Herramientas externas.** `legendary` y `gogdl` las ejecuta el núcleo con su directorio de configuración en una carpeta temporal privada, rehidratada desde el almacén cifrado y borrada al terminar. Comprobado en octubre de 2026: `legendary` deriva su directorio de configuración de `XDG_CONFIG_HOME` (así lo usa Heroic, PR #2803), y `gogdl` recibe la ruta del JSON donde guarda sus tokens. El nombre exacto del argumento de `gogdl` está por confirmar con su ayuda en línea.
8. **Ubicaciones descubiertas.** Los conectores declaran en `locations` qué valores de registro o carpetas conocidas necesitan (por ejemplo, el directorio de Steam o los manifiestos del launcher de EA). La plataforma los resuelve de forma genérica, sin saber nada de tiendas. Solo se resuelven si el usuario aceptó la autodetección (decisión 42). Ajustes muestra las ubicaciones detectadas junto a sus carpetas y permite desactivarlas.
9. **Traducciones.** Cada conector trae `locales/es.json` y `locales/en.json` con sus claves bajo `connectors.<id>.*`; los códigos de error comunes se traducen en `connectors.common.errors.<code>`. Los parámetros de los mensajes no llevan secretos.
10. **Prohibido en un conector:** importar módulos `node:*` de E/S, usar `fetch`, `process.env` o `child_process`, escribir en disco, tocar la base de datos, conocer el `user_id`, emparejar juegos y reintentar en bucle sin espera.
11. **Versionado.** Un cambio incompatible del contrato sube `contractVersion`; `runtime` rechaza al arrancar un conector con una versión distinta.

Capacidades previstas por tienda (orientativas; el agente de conectores las verifica con cuentas y juegos reales):

| Tienda | `access` | `library` | `scan` | Lanzamiento previsto |
|---|---|---|---|---|
| Steam | `official-api` | sí | sí | `uri` (`steam`) |
| GOG | `unofficial-api` | sí | sí | `exec` (cliente de Galaxy) |
| Epic | `unofficial-api` | sí | sí | `uri` del launcher de Epic, a verificar |
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

### 43. Credenciales en los asistentes de conexión (revisa la decisión 11)

**Decisión (confirmada por el usuario el 21 de octubre de 2026):** el principio de «sin pegar claves a mano» de la decisión 11 se sustituye por «sin escribir nada y sin editar ficheros». Cuando una tienda obliga a trasladar un dato, el asistente lo pide con un botón **Pegar desde el portapapeles** y lo valida en el momento.

- **El botón de pegar:** usa `navigator.clipboard.readText()` al pulsarlo. `http://127.0.0.1` cuenta como contexto seguro (supuesto: los navegadores tratan la dirección de bucle local como potencialmente confiable). Con la decisión 66 la web vive en `http://ludiary.localhost:<puerto>`, que la especificación de contextos seguros también trata como potencialmente confiable (supuesto, se comprueba en la 66). Chrome pide permiso de lectura del portapapeles; Firefox muestra un menú «Pegar» en el momento (lectura sin permiso desde Firefox 147, según MDN). Si el navegador lo deniega, se usa el campo normal con Ctrl+V. El valor nunca se guarda en el navegador, se envía al servidor y se cifra (decisión 46).
- **Steam:**
  - No existe vía oficial para obtener la API key sin que el usuario la copie. OpenID solo da el SteamID y no hay OAuth para usuarios finales; la clave se crea en `steamcommunity.com/dev/apikey`.
  - Pasos: (1) inicio de sesión con OpenID, sin copiar nada; (2) botón que abre la página de la clave, con instrucciones de qué poner en el campo de dominio; (3) Pegar, comprobación del formato (32 caracteres hexadecimales) y llamada de prueba a `IPlayerService/GetOwnedGames`; (4) si el perfil o los detalles de juego no son públicos, se explica cómo cambiarlo y se reintenta.
  - Modo alternativo **«Steam sin clave: solo instalados»**, que usa solo el escaneo local (decisión 42), para quien no quiera crear la clave.
  - **Descartado:** la lista XML del perfil de la comunidad (Valve la declara obsoleta y recorta las bibliotecas grandes); deducir la biblioteca de ficheros locales como `localconfig.vdf` (no oficial, solo refleja este PC y no la propiedad completa); y obtener la clave o tokens a partir de la sesión del cliente o de cookies de Steam (choca con las condiciones de uso y con el invariante 5).
- **Epic:**
  - Se usa el inicio de sesión con ventana integrada de `legendary` (versión 0.20.14 o posterior en Windows, según su README): abre el login oficial de Epic en una ventana y recoge el código automáticamente, sin copiar nada.
  - Si esa ventana no está disponible, se abre el login en el navegador y el usuario pega la respuesta. El asistente extrae `authorizationCode` del JSON pegado, así que no hace falta seleccionar solo el código.
  - **Descartado:** `legendary auth --import`, que lee la sesión del Epic Games Launcher y además la cierra.
- **GOG:** se abre el login oficial y al terminar el usuario pega la dirección final de la página. El asistente extrae el código de la URL. Supuesto: es el flujo de `gogdl`, con redirección fija a una página de GOG, lo que impide que la vuelta llegue a nuestro servidor. Una ventana integrada como la de Epic queda como mejora posterior.

**Motivo:** se mantiene la vía oficial donde existe y no se toca ninguna sesión de otros clientes. Lo único que el usuario hace es pulsar Pegar, que es lo más cerca de «sin pasos técnicos» que permiten las tiendas. Alternativas descartadas: pegar a mano sin ayuda (más errores y más abandono); automatizar la captura con cookies o sesiones de otros clientes (condiciones de uso y riesgo de seguridad).

**Consecuencias:**

- El tipo de paso `input` de la decisión 40 incorpora `paste: true` y un `extract` opcional (`'json-field:authorizationCode'`, `'url-query:code'`) que el núcleo aplica antes de validar.
- La ventana integrada de `legendary` la abre un proceso del servidor en el escritorio del usuario: solo funciona en modo localhost.
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

### 64. Errores fatales visibles y credenciales no reconocidas (amplía las decisiones 35, 45 y 46)

**Decisión (recomendada, 21 de octubre de 2026, tras la auditoría del prototipo):**

- **Quién muestra los errores:** el lanzador, el único papel con el usuario delante. El servidor no abre ventanas: comunica el fallo de arranque con su código de salida, y el lanzador que lo arrancó lo escucha.
- **Códigos de salida del papel servidor:**
  - 0: parada normal.
  - 3: ya hay otra instancia (decisión 62).
  - 10: clave maestra no reconocida.
  - 11: almacén de credenciales no disponible.
  - 12: base de datos no disponible, incluido no poder cargar SQLite.
  - 13: sin puerto libre.
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
  - Claves `fatal.title`, `fatal.masterKeyUnrecognized`, `fatal.keyStore`, `fatal.database`, `fatal.noPort`, `fatal.timeout` y `fatal.unexpected`, en español e inglés.
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

### 68. Primera versión de `apps/web`: estructura, datos simulados y CSP (concreta la decisión 10; portadas e `img-src` revisados en la decisión 71; servir la SPA, librería de esquemas y selector de carpetas concretados en la decisión 72)

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

### 71. Portadas de Steam desde su CDN (revisa el punto de portadas de la decisión 68; amplía las decisiones 6 y 40)

**Decisión:**

- **Qué (confirmado por el usuario el 21 de octubre de 2026):** los juegos de Steam usan la carátula que da Steam.
- **Cómo (recomendado):** el navegador carga la imagen directamente del CDN de Steam (opción A). El servidor no descarga ni guarda imágenes.
  - **Alcance:** solo para juegos canónicos con una propiedad de Steam, es decir, poseídos o detectados en Steam. Si un juego también está en otra tienda, gana la imagen de Steam. Un juego que solo está en GOG o Epic nunca pide nada a Steam, aunque se conozca su AppID por un ID externo. Así Valve no se entera de juegos de otras tiendas (invariante 9). Alcance confirmado por el usuario el 21 de octubre de 2026: solo los juegos que tiene en Steam, no los que solo se venden allí.
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

### 72. Primer corte vertical de Steam: instalados, biblioteca y lanzamiento (amplía las decisiones 40, 42, 47, 50 y 68)

**Decisión (recomendada, 21 de octubre de 2026; los tres puntos marcados «decide el usuario» quedan con la opción recomendada hasta que responda):**

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

- **`ScopedFileReader`** (semántica que el contrato no fijaba): UTF-8 sin BOM; `readText` como mucho de 1 MiB; `readDir` como mucho de 10 000 entradas. Toda ruta se resuelve con `realpath` y se rechaza si queda fuera de las raíces (`..`, uniones, enlaces simbólicos). Los errores son `ConnectorError` con `scan.root-unreadable`; una ruta fuera de las raíces da `internal`, porque es un fallo del conector. `join` sigue la semántica de rutas del SO.
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
- **`ProcessLauncher.openUri` de Windows** usa el mismo mecanismo que `openUrl`, ya validado en el prototipo: `spawn('rundll32.exe', ['url.dll,FileProtocolHandler', uri])`, sin shell, `windowsHide` y `detached`.
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
    - Aplica el SQL que genera `drizzle-kit` (separado por `--> statement-breakpoint`), incluido en el bundle como texto (`loader: { '.sql': 'text' }` de esbuild). El migrador de Drizzle lee una carpeta del disco, que no existe dentro del SEA.
    - Tabla `schema_migrations(id, hash, applied_at)` y una transacción por migración.
    - Si la base ya tiene migraciones aplicadas y hay alguna pendiente, primero hace la copia previa de la decisión 57 (`db.backup()` en `%LOCALAPPDATA%\Ludiary\backups`, conservando 3).
    - Una base con migraciones que esta versión no conoce (más nueva) no se abre: el servidor sale con 12 (decisión 64) y lo registra. La vuelta a una versión anterior es la de la decisión 58.
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

- **Sin mezclar datos reales y simulados.** `isSimulated` pasa a ser una constante de compilación (`import.meta.env.VITE_LUDIARY_SIMULATOR === '1'`). `vite dev` y `vite preview` la activan con su script; la compilación que se empaqueta, no. Una prueba comprueba que `dist/` no contiene el simulador.
- **El cliente real** (`src/data/real.ts`) implementa `LudiaryApi`:
  - Los métodos sin servidor en este corte (`startWizard`, `submitWizard` y `disconnect` de tiendas y servicios, colecciones, copias, registros, `syncAll` de biblioteca, favoritos y etiquetas) rechazan con `NotAvailableError`.
  - Las pantallas lo muestran como «Disponible próximamente» con el control desactivado, con texto traducido (**decide el usuario: punto B**).
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
    - `NotAvailableError` se pinta como «próximamente».
    - Jugar llama a `launchGame`.
    - `dist/` sin simulador.
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
- Detección del proceso de cada juego: propuesta en la 55. Se cierra para Steam en el corte 2b de la 72 (tiempo de juego, después del corte de la cuenta de Steam y antes de GOG), con al menos tres juegos reales, y se revalida con cada tienda nueva.
- Tres puntos de producto de la decisión 72: (A) selector nativo de carpetas en este corte o, mientras tanto, ocultar «Solo las carpetas que yo indique»; (B) funciones aún sin servidor mostradas como «Disponible próximamente» u ocultas; (C) confirmar el orden de cortes: cuenta de Steam, tiempo de juego y GOG.
- Linux y macOS: propuesta preliminar en la 61. Se cierra al terminar la fase 2.
- Comprobar el nombre «Ludiary» en las bases oficiales de marcas (EUIPO, OEPM, USPTO) y la disponibilidad de dominios antes de la primera publicación (decisión 44).
- Verificar los supuestos marcados en las decisiones 39 a 72 cuando se implemente cada parte. Del prototipo del instalador quedan: cerrojo de SQLite tras `taskkill /F` (62), secuestro de puerto desde otra cuenta, también en `[::1]` (63 y 66), cuadro en primer plano (64), `execArgvExtension` en Node 24.20 (65), y resolución, proxy y contexto seguro de `ludiary.localhost` en los navegadores (66).
