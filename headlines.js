// Plantillas de titulares. {A} y {B} se sustituyen por jugadores al azar; ___ es la parte censurada.
export const CATEGORIES = {
  secretos: {
    label: 'Secretos Turbios',
    emoji: '🤫',
    templates: [
      'Se filtra el chat secreto donde {A} le confiesa a {B} que ___.',
      '{A} lleva tres años ocultando que ___. {B} lo sabía y se calló.',
      'Encuentran en el historial de {A} la búsqueda: "cómo ___ sin que se entere {B}".',
      'La madre de {A} encuentra debajo de su cama ___.',
      '{A} admite en terapia que su mayor fantasía es ___.',
      '{B} revisa el móvil de {A} y descubre una carpeta oculta llena de ___.',
      'Exclusiva: el verdadero motivo por el que {A} nunca contesta mensajes es ___.',
      '{A} y {B} firman un pacto de sangre para que nadie sepa que ___.',
      '{A} tiene guardado en favoritos, en una carpeta llamada "Trabajo", ___.',
      'El diario íntimo de {A} revela que cada noche sueña con {B} ___.',
      '{A} confiesa borracho que su crush secreto es ___.',
    ],
  },
  madrugada: {
    label: 'Noticias de la Madrugada',
    emoji: '🌙',
    templates: [
      'Pillan a {A} y {B} haciendo ___ a las 3 AM en la cocina.',
      'Vecinos denuncian ruidos extraños: {A} estaba ___ a las 4:20 AM.',
      '{A} manda un audio de 7 minutos a las 5 AM explicando ___.',
      'Última hora: {A} sale de la discoteca abrazado a ___.',
      '{A} despierta en un lugar desconocido junto a {B} y ___.',
      'Las cámaras del supermercado graban a {A} en pijama ___ de madrugada.',
      '{B} recibe a las 3:33 AM una foto de {A} ___. Sin contexto.',
      'La fiesta en casa de {A} termina con la policía, un bombero y ___.',
      '{A} le escribe "¿estás despierto?" a {B} a las 4 AM junto a una foto de ___.',
      'Encuentran a {A} en la calle a las 6 AM vestido solo con calcetines y ___.',
    ],
  },
  crimenes: {
    label: 'Crímenes Absurdos',
    emoji: '🚔',
    templates: [
      'La policía arresta a {A} después de que {B} filtrara su foto haciendo ___.',
      '{A}, condenado a 20 años por ___. {B} declaró en su contra.',
      'Detienen a {A} en el aeropuerto intentando pasar ___ en la maleta.',
      '{A} asalta una gasolinera armado únicamente con ___.',
      'La Interpol busca a {A} por ___ en 14 países.',
      '{B} denuncia a {A} por robarle ___ y no devolverlo nunca.',
      'Juicio del siglo: {A} alega que ___ fue en defensa propia.',
      '{A} se fuga de prisión usando ___ y la ayuda de {B}.',
      'Detienen a {A} por hacer ___ en mitad de un funeral.',
      'Arrestan a {A} por vender fotos de los pies de {B} haciéndolas pasar por ___.',
    ],
  },
  discord: {
    label: 'Cosas de Discord',
    emoji: '🎧',
    templates: [
      '{A} se olvida de silenciar el micro y todo el server escucha ___.',
      '{A} comparte pantalla por error y todos ven ___.',
      '{B} banea a {A} del servidor por publicar ___ en #general.',
      'El estado de Discord de {A} lleva seis meses diciendo: ___.',
      '{A} se gasta 300€ en Nitro solo para mandarle a {B} ___.',
      'Se filtra el canal privado de {A} y {B}: solo contiene ___.',
      '{A} entra a la llamada y lo primero que se oye es ___.',
      '{A} cambia su foto de perfil a ___ y nadie se atreve a decir nada.',
      '{A} deja la cámara encendida y todos ven a {B} al fondo ___.',
      '{A} sube a #memes una foto de {B} ___ y la fija en el canal.',
    ],
  },
  todos: {
    label: 'Todos Contra Todos',
    emoji: '⚔️',
    templates: [
      'Toda la sala vota por unanimidad que {A} es ___.',
      '{A} y {B} se pelean en directo por ___. El chat enloquece.',
      'Encuesta: el 99% del grupo cree que {A} es secretamente ___.',
      'Si {A} fuera un objeto sería ___. Y {B} lo usaría.',
      '{A} revela qué haría con {B} en una isla desierta: ___.',
      'Reality show: {A} expulsa a {B} de la casa por ___.',
      '{A} gana el premio a "Peor Amigo del Año" por ___.',
      'Netflix estrena la docuserie de {A}: "___".',
      'Ranking oficial del grupo: {A} es el más ___.',
      '{A} ofrece 50€ al primero que se atreva a ___ delante de {B}.',
    ],
  },
  parejas: {
    label: 'Parejas Funables',
    emoji: '💞',
    templates: [
      'Pillan a {A} y {B} solos en un jacuzzi vestidos de ___.',
      '{A} y {B} se casan borrachos en Las Vegas. El testigo fue ___.',
      'Se filtra el TikTok de {A} y {B} bailando ___ en ropa interior.',
      '{A} y {B} se quedan atrapados 8 horas en un ascensor con ___.',
      'Los paparazzis cazan a {A} y {B} en una cita romántica dentro de ___.',
      '{A} y {B} abren un OnlyFans juntos. Su primer post: ___.',
      'La policía encuentra a {A} y {B} disfrazados de ___ en un motel de carretera.',
      '{A} y {B} comparten cama en un viaje y amanecen ___.',
      '{A} y {B} protagonizan la nueva telenovela "Pasión, traición y ___".',
      'Ven a {A} dándole de comer en la boca a {B} ___.',
      '{A} y {B} ganan el concurso de parejas del pueblo haciendo ___.',
      '{A} le pide matrimonio a {B} con ___ en vez de anillo.',
      '{A} y {B} se tatúan juntos ___ en la nalga.',
      'El vecino graba a {A} y {B} en el balcón a las 4 AM ___.',
    ],
  },
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Convierte "Pillan a {A} ... ___ ..." en partes que el cliente pinta (nombres resaltados, censura).
function toParts(template, names) {
  return template
    .split(/(\{A\}|\{B\}|___)/)
    .filter(Boolean)
    .map((chunk) => {
      if (chunk === '___') return { type: 'blank' };
      if (chunk === '{A}' || chunk === '{B}') return { type: 'name', value: names[chunk[1]] };
      return { type: 'text', value: chunk };
    });
}

// `used` es un Set por sala para no repetir titulares hasta agotar el mazo.
export function generateHeadline(categoryKeys, playerNames, used) {
  const fitting = (keys) => keys.flatMap((key) =>
    CATEGORIES[key].templates
      .map((template, i) => ({ key, template, id: `${key}:${i}` }))
      .filter(({ template }) => playerNames.length > 1 || !template.includes('{B}')),
  );
  // Con un solo jugador conectado, una selección solo de "Parejas" no tiene plantillas válidas.
  let fits = fitting(categoryKeys);
  if (!fits.length) fits = fitting(Object.keys(CATEGORIES));
  let fresh = fits.filter(({ id }) => !used.has(id));
  if (!fresh.length) {
    for (const { id } of fits) used.delete(id);
    fresh = fits;
  }
  const chosen = pick(fresh);
  used.add(chosen.id);
  const [A, B] = shuffle(playerNames);
  return { category: chosen.key, parts: toParts(chosen.template, { A, B }) };
}
