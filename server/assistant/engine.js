/**
 * Движок понимания вопросов без внешнего API.
 * Схема: нормализация → токенизация → лёгкий стемминг → синонимы →
 * скоринг интентов (фразы, точные слова, нечёткое совпадение) → порог уверенности.
 */

/** Слова-синонимы приводятся к одному «каноническому» стему. */
const SYNONYMS = {
  цен: 'цен', стоимост: 'цен', стоит: 'цен', почем: 'цен', прайс: 'цен',
  тариф: 'цен', дорог: 'цен', деньг: 'цен', бюджет: 'цен', ценник: 'цен',
  комп: 'пк', пк: 'пк', компьютер: 'пк', машин: 'пк', железо: 'пк',
  видеокарт: 'пк', проц: 'пк', процессор: 'пк', rtx: 'пк', конфиг: 'пк',
  бронь: 'брон', брон: 'брон', забронир: 'брон', зарезерв: 'брон',
  график: 'график', режим: 'график', открыва: 'график', закрыва: 'график',
  адрес: 'адрес', наход: 'адрес', находит: 'адрес', расположен: 'адрес', метро: 'адрес',
  игр: 'игр', поигра: 'игр', катк: 'игр',
  дет: 'возраст', ребен: 'возраст', школьник: 'возраст', лет: 'возраст',
  еда: 'еда', кушат: 'еда', перекус: 'еда', кофе: 'еда', напитк: 'еда', бар: 'еда',
  челов: 'человек', друз: 'человек', команд: 'человек', компан: 'человек',
  плойк: 'ps5', приставк: 'ps5', консол: 'ps5', плейстейшн: 'ps5',
};

/**
 * Служебные слова: они есть почти в любом вопросе, поэтому не должны
 * приносить очки — иначе «во сколько закрываетесь» уедет в интент про цены.
 */
const STOPWORDS = new Set([
  'скольк', 'как', 'что', 'чт', 'где', 'когд', 'ли', 'ест', 'есть', 'мож', 'можн', 'вы', 'вас',
  'мне', 'мы', 'ваш', 'нас', 'это', 'так', 'там', 'тут', 'бы', 'же', 'ну', 'да', 'нет',
  'для', 'при', 'без', 'над', 'под', 'про', 'или', 'но', 'то', 'бол', 'все', 'сво', 'свои',
  'хоч', 'хочу', 'над', 'нужн', 'подскаж', 'скаж', 'расскаж', 'привет', 'пожалуйст',
]);

/** Окончания, которые срезаем при стемминге (от длинных к коротким). */
const ENDINGS = [
  'иями', 'ями', 'ами', 'иях', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ые', 'ие',
  'ой', 'ей', 'ай', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ах', 'ях', 'ов', 'ев', 'ам', 'ям',
  'ом', 'ем', 'их', 'ых', 'ть', 'ла', 'ло', 'ли', 'ет', 'ут', 'ют', 'ат', 'ят',
  'а', 'я', 'о', 'е', 'у', 'ю', 'ы', 'и', 'ь',
];

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s+]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stem(word) {
  let out = word;
  // Возвратные глаголы: «закрываетесь» → «закрывает» → «закрыва».
  if (out.length > 6 && (out.endsWith('сь') || out.endsWith('ся'))) out = out.slice(0, -2);
  if (out.length <= 3) return out;
  for (const ending of ENDINGS) {
    if (out.length - ending.length >= 3 && out.endsWith(ending)) {
      return out.slice(0, -ending.length);
    }
  }
  return out;
}

export function tokenize(text) {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 1)
    .map((word) => {
      const s = stem(word);
      return SYNONYMS[s] || SYNONYMS[word] || s;
    });
}

const CANONICAL = new Set(Object.values(SYNONYMS));

export function isStopword(token) {
  if (CANONICAL.has(token)) return false;
  return STOPWORDS.has(token) || token.length < 3;
}

/** Расстояние Левенштейна с ранним выходом по порогу. */
export function levenshtein(a, b, limit = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, row[j]);
    }
    if (best > limit) return limit + 1;
    prev = row;
  }
  return prev[b.length];
}

function fuzzyHit(token, patternToken) {
  const minLen = Math.min(token.length, patternToken.length);
  if (minLen < 5) return false;
  const limit = minLen >= 8 ? 2 : 1;
  return levenshtein(token, patternToken, limit) <= limit;
}

/** Готовит интенты к матчингу: паттерны стеммим один раз при старте. */
export function compileIntents(intents) {
  return intents.map((intent) => ({
    ...intent,
    compiled: intent.patterns.map((pattern) => {
      const tokens = tokenize(pattern);
      return {
        raw: normalize(pattern),
        tokens,
        keyTokens: tokens.filter((t) => !isStopword(t)),
      };
    }),
  }));
}

const WEIGHTS = { phrase: 3, allTokens: 2, partial: 0.7, exact: 1.8, fuzzy: 1 };

export function scoreIntent(intent, { tokens, normalized }) {
  let score = 0;
  const counted = new Set();

  for (const pattern of intent.compiled) {
    if (pattern.tokens.length > 1) {
      if (normalized.includes(pattern.raw)) { score += WEIGHTS.phrase; continue; }
      const allPresent = pattern.tokens.every((t) => tokens.includes(t));
      if (allPresent) { score += WEIGHTS.allTokens; continue; }
      // Частичное совпадение засчитываем только по значимым словам.
      if (pattern.keyTokens.length) {
        const covered = pattern.keyTokens.filter((t) => tokens.includes(t)).length;
        if (covered) score += (WEIGHTS.partial * covered) / pattern.keyTokens.length;
      }
      continue;
    }

    const [needle] = pattern.tokens;
    if (!needle || isStopword(needle) || counted.has(needle)) continue;
    if (tokens.includes(needle)) {
      score += WEIGHTS.exact;
      counted.add(needle);
    } else if (tokens.some((token) => fuzzyHit(token, needle))) {
      score += WEIGHTS.fuzzy;
      counted.add(needle);
    }
  }

  return score * (intent.weight || 1);
}

export const THRESHOLDS = { confident: 2, weak: 1, ambiguousGap: 0.6 };

/**
 * Подбирает интент под свободный текст.
 * @returns {{status:'confident'|'weak'|'ambiguous'|'unknown', intent?, alternatives?, score:number}}
 */
export function matchIntent(text, intents) {
  const normalized = normalize(text);
  const tokens = tokenize(text);
  if (!tokens.length) return { status: 'unknown', score: 0 };

  const ranked = intents
    .map((intent) => ({ intent, score: scoreIntent(intent, { tokens, normalized }) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return { status: 'unknown', score: 0 };

  const [top, second] = ranked;
  const ambiguous = second
    && top.score - second.score < THRESHOLDS.ambiguousGap
    && top.score < THRESHOLDS.confident * 1.6;

  if (ambiguous) {
    return {
      status: 'ambiguous',
      intent: top.intent,
      alternatives: ranked.slice(0, 3).map((item) => item.intent),
      score: top.score,
    };
  }
  if (top.score >= THRESHOLDS.confident) return { status: 'confident', intent: top.intent, score: top.score };
  if (top.score >= THRESHOLDS.weak) return { status: 'weak', intent: top.intent, score: top.score };
  return { status: 'unknown', score: top.score };
}
