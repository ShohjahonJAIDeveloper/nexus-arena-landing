/**
 * Единый источник правды о клубе: контакты, зоны, цены, акции.
 * Используется базой знаний помощника, квизом и уведомлениями в Telegram.
 * Тексты на лендинге в public/index.html должны совпадать с этими цифрами.
 */
export const club = {
  name: 'NEXUS Arena',
  city: 'Ташкент',
  address: 'ул. Амира Темура, 15 (ориентир — ТЦ «Пойтахт», 2 этаж)',
  phone: '+998 90 123-45-67',
  telegram: '@nexus_arena',
  hours: 'круглосуточно, 7 дней в неделю',
  parking: 'бесплатная парковка на 40 мест во дворе здания',
  wifi: 'бесплатный Wi-Fi 1 Гбит/с для гостей',
  minAge: 'с 14 лет; до 14 — в сопровождении взрослого. После 22:00 несовершеннолетним нужно письменное согласие родителей',
  payment: 'наличные, Uzcard/Humo, Payme, Click и перевод на карту',
  currency: 'сум',
};

export const zones = [
  {
    id: 'standard',
    title: 'Standard',
    price: 15000,
    priceLabel: '15 000 сум/час',
    seats: 40,
    specs: 'RTX 4070, i5-13600KF, 32 ГБ DDR5, монитор 27" 240 Гц',
    perks: ['Кресла DXRacer', 'Наушники HyperX Cloud III', 'Мышь Logitech G Pro X Superlight'],
    best: 'соло-игра и катки с друзьями',
  },
  {
    id: 'vip',
    title: 'VIP-комната',
    price: 25000,
    priceLabel: '25 000 сум/час',
    seats: 8,
    specs: 'RTX 4080 Super, i7-14700K, 32 ГБ DDR5, монитор 27" 360 Гц',
    perks: ['Отдельная закрытая комната', 'Кондиционер и свой свет', 'Бесплатный чай и снеки'],
    best: 'команда 5×5, стримы и закрытые сходки',
  },
  {
    id: 'ps5',
    title: 'PS5-зона',
    price: 30000,
    priceLabel: '30 000 сум/час за комнату',
    seats: 4,
    specs: 'PlayStation 5, телевизор 65" 120 Гц, 4 геймпада',
    perks: ['FC 26, Mortal Kombat 1, God of War', 'Диван на 4 человек', 'Цена за комнату, а не за человека'],
    best: 'компания 2–4 человека и вечеринки',
  },
  {
    id: 'bootcamp',
    title: 'Буткемп',
    price: 490000,
    priceLabel: '490 000 сум/месяц',
    seats: 10,
    specs: 'VIP-места + тренер по CS2 и Dota 2',
    perks: ['8 тренировок в месяц', 'Разбор демок и статистики', 'Участие в клубных турнирах'],
    best: 'тех, кто хочет играть на результат',
  },
];

export const deals = [
  { id: 'night', title: 'Ночной пакет', text: 'с 22:00 до 08:00 — 70 000 сум за всю ночь в Standard' },
  { id: 'pack5', title: 'Пакет 5 часов', text: '5 часов Standard за 60 000 сум вместо 75 000' },
  { id: 'sub30', title: 'Абонемент 30 часов', text: '350 000 сум, действует 60 дней, часы не сгорают' },
  { id: 'student', title: 'Студентам', text: '−20% по студенческому билету с 09:00 до 17:00 в будни' },
  { id: 'first', title: 'Первый визит', text: 'первый час бесплатно для новых гостей по заявке с сайта' },
];

export const games = [
  'CS2', 'Dota 2', 'Valorant', 'PUBG', 'Apex Legends', 'GTA V',
  'Fortnite', 'League of Legends', 'Rust', 'FC 26', 'Warzone', 'Minecraft',
];

export const events = {
  tournaments: 'Турниры по CS2 и Dota 2 каждую субботу в 18:00, вход 30 000 сум с человека, призовой фонд от 1 500 000 сум',
  birthday: 'День рождения: VIP-комната на 4 часа + торт + фотозона от 600 000 сум на компанию до 8 человек',
  corporate: 'Корпоративы и тимбилдинги — бронируем весь зал, от 2 000 000 сум за вечер',
};

/** Быстрая оценка стоимости для итогов квиза. */
export function estimatePrice({ zoneId, people = 1, hours = 3 }) {
  const zone = zones.find((z) => z.id === zoneId) || zones[0];
  if (zone.id === 'bootcamp') {
    return { zone, total: zone.price, note: 'абонемент на месяц, оплата разово' };
  }
  // PS5 оплачивается за комнату целиком, остальные зоны — за каждое место.
  const seatsCharged = zone.id === 'ps5' ? 1 : Math.max(1, people);
  let total = zone.price * hours * seatsCharged;
  let note = zone.id === 'ps5'
    ? `${hours} ч × ${zone.priceLabel}`
    : `${people} чел × ${hours} ч × ${zone.price.toLocaleString('ru-RU')} сум`;

  if (zone.id === 'standard' && hours >= 5) {
    const packs = Math.floor(hours / 5);
    const rest = hours % 5;
    total = (packs * 60000 + rest * zone.price) * seatsCharged;
    note += ' с учётом пакета «5 часов»';
  }
  return { zone, total, note };
}

export function formatMoney(value) {
  return `${Number(value).toLocaleString('ru-RU')} ${club.currency}`;
}
