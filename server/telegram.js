/**
 * Уведомления в Telegram через Bot API.
 * Выбран самый простой рабочий вариант: бот отправляет сообщение в группу
 * (или канал / личку) методом sendMessage. Вебхук и публичный HTTPS не нужны.
 */
import { club, formatMoney } from './club.js';

const API = 'https://api.telegram.org';

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const CHANNEL_LABEL = { call: 'звонок', telegram: 'Telegram', whatsapp: 'WhatsApp' };
const SOURCE_LABEL = { form: 'форма на сайте', quiz: 'квиз помощника', chat: 'чат с помощником' };

/** Собирает читаемое сообщение о заявке. */
export function buildLeadMessage(lead) {
  const lines = [
    `🎮 <b>Новая заявка — ${esc(club.name)}</b>`,
    '',
    `👤 <b>Имя:</b> ${esc(lead.name)}`,
    `📞 <b>Телефон:</b> ${esc(lead.phone)}`,
    `💬 <b>Связь:</b> ${esc(CHANNEL_LABEL[lead.contact_channel] || lead.contact_channel)}`,
    `🔗 <b>Источник:</b> ${esc(SOURCE_LABEL[lead.source] || lead.source)}`,
  ];

  if (lead.quiz_answers) {
    const quiz = safeParse(lead.quiz_answers);
    if (quiz) {
      lines.push('', '<b>Ответы в квизе:</b>');
      for (const [label, value] of Object.entries(quiz.summary || {})) {
        lines.push(`• ${esc(label)}: ${esc(value)}`);
      }
      if (quiz.estimate) {
        lines.push(`💰 <b>Ориентир по цене:</b> ${esc(formatMoney(quiz.estimate.total))} (${esc(quiz.estimate.note)})`);
      }
    }
  }

  if (lead.message) lines.push('', `📝 <b>Комментарий:</b> ${esc(lead.message)}`);

  const utm = safeParse(lead.utm);
  if (utm && Object.keys(utm).length) {
    lines.push('', `📊 <b>UTM:</b> ${esc(Object.entries(utm).map(([k, v]) => `${k}=${v}`).join(', '))}`);
  }

  lines.push('', `🕒 ${esc(formatDate(lead.created_at))} · заявка №${lead.id}`);
  return lines.join('\n');
}

function safeParse(json) {
  try { return json ? JSON.parse(json) : null; } catch { return null; }
}

function formatDate(sqlDate) {
  // В базе UTC-строка вида "2026-08-28 14:03:11" — показываем время клуба.
  const date = new Date(`${String(sqlDate).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return String(sqlDate);
  return date.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', dateStyle: 'short', timeStyle: 'short' });
}

/** Низкоуровневая отправка. Возвращает {ok, error?}. */
export async function sendMessage(text, extra = {}) {
  if (!telegramConfigured()) return { ok: false, error: 'Telegram не настроен (нет токена или chat_id)' };

  try {
    const response = await fetch(`${API}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...extra,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.description || `HTTP ${response.status}` };
    }
    return { ok: true, messageId: data.result?.message_id };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/** Отправка заявки менеджерам. Никогда не бросает исключение. */
export async function sendLeadToTelegram(lead) {
  const digits = String(lead.phone || '').replace(/\D/g, '');
  const extra = digits
    ? { reply_markup: { inline_keyboard: [[{ text: '💬 Написать в WhatsApp', url: `https://wa.me/${digits}` }]] } }
    : {};
  const result = await sendMessage(buildLeadMessage(lead), extra);
  if (!result.ok) console.warn('[telegram] заявка №%s не отправлена: %s', lead.id, result.error);
  return result;
}
