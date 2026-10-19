# CENSORED! (Edición Funable)

Party game multijugador en tiempo real para jugar en llamadas de Discord. El juego se inventa un titular escandaloso con los nombres de los jugadores, cada uno dibuja lo que hay **debajo de la censura** y después se revela delante de todos, con redoble de tambor, emojis volando y votación.

## Cómo se juega

1. **Lobby**: alguien crea la sala (código de 4 letras) y comparte el enlace. El host elige rondas, tiempo (60/90/120 s) y categorías.
2. **Dibujo**: cada jugador recibe su propio titular con 1 o 2 nombres de la sala y una parte **CENSURADA**. Hay pincel, borrador, texto estilo meme, colores, 3 grosores, deshacer (Ctrl+Z) y limpiar. Atajos: `B` pincel, `E` borrador, `T` texto. Al acabar el tiempo se recogen solos los dibujos.
3. **El Noticiero**: el host va caso por caso. «Quitar la censura» → redoble → la censura se parte y cae → aparece el dibujo y su autor. Todos pueden reaccionar 😂 💀 🚨 🤡 💩 (teclas 1–5) y los emojis vuelan en todas las pantallas.
4. **Veredicto**: cada jugador vota **🔥 Más Funable** y **🏆 Meme de la Ronda** (no puede votarse a sí mismo). Cada voto recibido son 100 puntos.
5. Tras la última ronda llega el **podio**, y el host puede lanzar la revancha.

## Ejecutar en local

Requiere Node.js 18 o superior.

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # igual, con recarga al cambiar el servidor
npm test           # partida completa simulada con 3 clientes
```

Para probarlo solo, abre varias ventanas de incógnito (cada ventana privada es un jugador distinto).

Para jugar con amigos sin desplegar, expón tu puerto con un túnel (`npx localtunnel --port 3000`, `cloudflared tunnel --url http://localhost:3000` o ngrok) y comparte la URL.

## Desplegar gratis

El servidor es un único proceso Node que sirve la web y los WebSockets, y lee el puerto de `PORT`.

### Render
1. Sube el proyecto a un repo de GitHub.
2. En Render: **New → Web Service** y elige el repo.
3. Runtime **Node**, Build command `npm install`, Start command `npm start`, plan **Free**.
4. Opcional: Health check path `/healthz`.

El plan gratis se duerme tras ~15 min sin tráfico. La primera carga tarda unos 30–60 s en despertar, así que abre el enlace un minuto antes de la partida.

### Railway
1. **New Project → Deploy from GitHub repo**.
2. Railway detecta Node y usa `npm start` sin configurar nada.
3. En **Settings → Networking → Generate Domain** obtienes la URL pública.

### Glitch
Glitch dejó de alojar proyectos en julio de 2025, así que ya no sirve. Usa Render, Railway o Fly.io.

## Arquitectura

```
server.js        Express + Socket.IO. El servidor manda: fases, temporizadores, validación de votos y dibujos.
headlines.js     Plantillas de titulares por categoría y el generador que inserta nombres.
public/
  index.html     Todas las pantallas (inicio, lobby, dibujo, revelación, votación, resultados, podio).
  style.css      Sistema visual: tokens, componentes y animaciones (respeta prefers-reduced-motion).
  js/app.js      Estado del cliente, render por fase y eventos de socket.
  js/board.js    Lienzo con historial de acciones (deshacer = repintar), trazos suavizados y texto meme.
  js/audio.js    Efectos 100 % sintéticos con Web Audio API (redoble, rotura de censura, alarma, clicks…).
  js/fx.js       Emojis voladores, confeti, flash y sacudidas.
test/            Prueba de integración con clientes Socket.IO reales.
```

Detalles que conviene conocer:

- **Un solo cerebro**: el cliente nunca decide la fase. Envía intenciones (`draw:submit`, `vote`, `reveal:show`…) y el servidor valida (solo el host avanza, nadie se vota a sí mismo, imágenes JPEG/PNG de máx. 1,5 MB) y difunde a cada jugador su propio estado.
- **Sin spoilers**: hasta que se quita la censura, el estado no incluye ni el autor ni la URL del dibujo.
- **Dibujos por HTTP**: se guardan en memoria y se sirven en `/img/:sala/:id` (con caché del navegador) en vez de reenviarlos por el socket en cada voto.
- **Reconexión**: cada navegador tiene un id persistente. Si recargas o se te cae el Wi-Fi, vuelves a la misma sala con tu titular y tus puntos. Si el host se va, el siguiente jugador conectado pasa a ser host.
- **Memoria**: las salas viven en RAM y se borran 10 minutos después de quedarse vacías. Reiniciar el servidor cierra todas las partidas.

## Añadir titulares

Edita `headlines.js`. Usa `{A}` y `{B}` para los nombres y `___` (una sola vez) para la parte censurada:

```js
'{A} se olvida de silenciar el micro y todo el server escucha ___.',
```
