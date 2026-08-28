/**
 * Скрытая админ-панель на /admin.
 * HTML лежит в server/views/admin и НЕ раздаётся как статика —
 * страница отдаётся только этим роутом, поэтому её нельзя открыть в обход входа.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { endSession, isAuthed, passwordMatches, requireAdminApi, startSession } from '../auth.js';
import { getChatMessages, leadStats, listLeads, updateLead, getLead } from '../db.js';
import { clientIp, rateLimit, resetLimit } from '../rateLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '..', 'views', 'admin');

export const adminRouter = express.Router();

// Панель не должна попадать в поиск.
adminRouter.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.set('Cache-Control', 'no-store');
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

adminRouter.get('/admin', (req, res) => {
  res.sendFile(path.join(VIEWS, isAuthed(req) ? 'index.html' : 'login.html'));
});

adminRouter.get('/admin/admin.css', (req, res) => res.sendFile(path.join(VIEWS, 'admin.css')));
adminRouter.get('/admin/admin.js', (req, res) => res.sendFile(path.join(VIEWS, 'admin.js')));

adminRouter.post('/admin/login', loginLimiter, (req, res) => {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ ok: false, error: 'ADMIN_PASSWORD не задан в .env' });
  }
  if (!passwordMatches(req.body?.password)) {
    return res.status(401).json({ ok: false, error: 'Неверный пароль' });
  }
  startSession(res);
  resetLimit(clientIp(req));
  return res.json({ ok: true });
});

adminRouter.post('/admin/logout', (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

/* --------------------------------- API ------------------------------------ */

const api = express.Router();
api.use(requireAdminApi);

api.get('/stats', (req, res) => res.json({ ok: true, stats: leadStats() }));

api.get('/leads', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const { rows, total } = listLeads({
    q: String(req.query.q || '').slice(0, 100),
    status: String(req.query.status || ''),
    source: String(req.query.source || ''),
    limit,
    offset,
  });
  res.json({ ok: true, leads: rows.map(shape), total, limit, offset });
});

api.get('/leads/:id', (req, res) => {
  const lead = getLead(Number(req.params.id));
  if (!lead) return res.status(404).json({ ok: false, error: 'Заявка не найдена' });
  return res.json({ ok: true, lead: shape(lead), chat: getChatMessages(lead.session_id || '') });
});

api.patch('/leads/:id', (req, res) => {
  const allowed = ['new', 'in_work', 'done', 'spam'];
  const status = req.body?.status;
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ ok: false, error: 'Неизвестный статус' });
  }
  const lead = updateLead(Number(req.params.id), {
    status,
    adminNote: typeof req.body?.adminNote === 'string' ? req.body.adminNote.slice(0, 2000) : undefined,
  });
  if (!lead) return res.status(404).json({ ok: false, error: 'Заявка не найдена' });
  return res.json({ ok: true, lead: shape(lead) });
});

api.get('/export.csv', (req, res) => {
  const { rows } = listLeads({ limit: 10000 });
  const head = ['id', 'Дата', 'Имя', 'Телефон', 'Связь', 'Источник', 'Статус', 'Комментарий', 'Квиз', 'Заметка'];
  const csv = [head, ...rows.map((r) => [
    r.id, r.created_at, r.name, r.phone, r.contact_channel, r.source, r.status,
    r.message || '', quizToText(r.quiz_answers), r.admin_note || '',
  ])]
    .map((line) => line.map(csvCell).join(';'))
    .join('\r\n');

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${csv}`); // BOM — чтобы Excel не показывал кракозябры
});

adminRouter.use('/api/admin', api);

/* ------------------------------- Утилиты ---------------------------------- */

function csvCell(value) {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

function quizToText(json) {
  if (!json) return '';
  try {
    const data = JSON.parse(json);
    const parts = Object.entries(data.summary || {}).map(([k, v]) => `${k}: ${v}`);
    if (data.estimate) parts.push(`Оценка: ${data.estimate.total}`);
    return parts.join(' | ');
  } catch {
    return '';
  }
}

function shape(row) {
  return {
    ...row,
    quiz_answers: row.quiz_answers ? safeParse(row.quiz_answers) : null,
    utm: row.utm ? safeParse(row.utm) : null,
  };
}

function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}
