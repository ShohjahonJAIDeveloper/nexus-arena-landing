/**
 * Единая точка создания заявки: валидация → запись в SQLite → Telegram.
 * Используется и формой на сайте, и помощником, чтобы логика не расползалась.
 */
import { insertLead, markTelegramSent } from './db.js';
import { validateLead } from './validate.js';
import { sendLeadToTelegram, telegramConfigured } from './telegram.js';
import { clientIp } from './rateLimit.js';

/**
 * @param {object} input поля заявки + req (для ip и user-agent)
 * @returns {Promise<{ok:true, lead:object, telegram:object} | {ok:false, errors:object}>}
 */
export async function createLead(input) {
  const { req, ...body } = input;
  const checked = validateLead(body);
  if (!checked.ok) return { ok: false, errors: checked.errors };

  const lead = insertLead({
    ...checked.value,
    ip: req ? clientIp(req) : null,
    userAgent: req ? String(req.get('user-agent') || '').slice(0, 400) : null,
  });

  let telegram = { ok: false, error: 'Telegram не настроен' };
  if (telegramConfigured()) {
    telegram = await sendLeadToTelegram(lead);
    markTelegramSent(lead.id, telegram.ok);
  }

  console.log('[lead] №%s %s %s (%s) → telegram: %s',
    lead.id, lead.name, lead.phone, lead.source, telegram.ok ? 'отправлено' : telegram.error);

  return { ok: true, lead, telegram };
}
