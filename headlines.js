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
  const fits = categoryKeys.flatMap((key) =>
    CATEGORIES[key].templates
      .map((template, i) => ({ key, template, id: `${key}:${i}` }))
      .filter(({ template }) => playerNames.length > 1 || !template.includes('{B}')),
  );
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
