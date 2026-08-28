/** Нормализация и проверка входящих данных заявки. */

const MAX = { name: 60, message: 1000, page: 500, ua: 400, utm: 200 };

export function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

/**
 * Приводит телефон к международному виду.
 * Поддержаны Узбекистан (+998, 9 цифр) и Россия/Казахстан (+7, 10 цифр).
 */
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 9) return `+998${digits}`;                    // 90 123 45 67
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return `+7${digits.slice(1)}`;
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`; // прочие страны
  return null;
}

const CHANNELS = new Set(['call', 'telegram', 'whatsapp']);
const SOURCES = new Set(['form', 'quiz', 'chat']);

/**
 * @returns {{ok: true, value: object} | {ok: false, errors: Record<string,string>}}
 */
export function validateLead(body = {}) {
  const errors = {};

  const name = clean(body.name, MAX.name);
  if (name.length < 2) errors.name = 'Укажите имя — минимум 2 символа';
  else if (!/[\p{L}]/u.test(name)) errors.name = 'Имя должно содержать буквы';

  const phone = normalizePhone(body.phone);
  if (!phone) errors.phone = 'Проверьте номер телефона';

  const contactChannel = CHANNELS.has(body.contactChannel) ? body.contactChannel : 'call';
  const source = SOURCES.has(body.source) ? body.source : 'form';

  if (Object.keys(errors).length) return { ok: false, errors };

  const utm = {};
  if (body.utm && typeof body.utm === 'object') {
    for (const [k, v] of Object.entries(body.utm)) {
      if (/^utm_[a-z_]{1,20}$/.test(k)) utm[k] = clean(String(v), MAX.utm);
    }
  }

  return {
    ok: true,
    value: {
      name,
      phone,
      contactChannel,
      source,
      message: clean(body.message, MAX.message) || null,
      pageUrl: clean(body.pageUrl, MAX.page) || null,
      utm: Object.keys(utm).length ? utm : null,
      quizAnswers: body.quizAnswers && typeof body.quizAnswers === 'object' ? body.quizAnswers : null,
      sessionId: clean(body.sessionId, 64) || null,
    },
  };
}

/**
 * Простейшая защита от ботов: скрытое поле должно быть пустым,
 * а форму нельзя отправить быстрее, чем за 2.5 секунды.
 */
export function looksLikeBot(body = {}) {
  if (clean(body.company, 100)) return 'honeypot';
  const elapsed = Number(body.elapsedMs);
  if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < 2500) return 'too-fast';
  return null;
}
