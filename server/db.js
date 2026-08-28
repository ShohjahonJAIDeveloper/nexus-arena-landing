/**
 * Слой доступа к данным. SQLite-файл лежит в data/app.db.
 * Все запросы собраны здесь, чтобы роуты не знали про SQL.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** Идемпотентные миграции: можно звать при каждом старте. */
export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      name            TEXT    NOT NULL,
      phone           TEXT    NOT NULL,
      contact_channel TEXT    NOT NULL DEFAULT 'call',
      source          TEXT    NOT NULL DEFAULT 'form',
      quiz_answers    TEXT,
      message         TEXT,
      page_url        TEXT,
      utm             TEXT,
      ip              TEXT,
      user_agent      TEXT,
      session_id      TEXT,
      status          TEXT    NOT NULL DEFAULT 'new',
      admin_note      TEXT,
      tg_sent         INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_leads_status  ON leads (status);

    CREATE TABLE IF NOT EXISTS chat_sessions (
      session_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      state      TEXT NOT NULL DEFAULT '{}',
      lead_id    INTEGER
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role       TEXT NOT NULL,
      text       TEXT NOT NULL,
      meta       TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_msgs_session ON chat_messages (session_id, id);

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token      TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
  `);
  db.prepare(`DELETE FROM admin_sessions WHERE expires_at < datetime('now')`).run();
}

// Схема создаётся сразу при импорте модуля: подготовленные запросы ниже
// обращаются к таблицам ещё до того, как приложение вызовет migrate().
migrate();

/* ---------------------------------- Заявки --------------------------------- */

const insertLeadStmt = db.prepare(`
  INSERT INTO leads (name, phone, contact_channel, source, quiz_answers, message,
                     page_url, utm, ip, user_agent, session_id)
  VALUES (@name, @phone, @contact_channel, @source, @quiz_answers, @message,
          @page_url, @utm, @ip, @user_agent, @session_id)
`);

export function insertLead(lead) {
  const info = insertLeadStmt.run({
    name: lead.name,
    phone: lead.phone,
    contact_channel: lead.contactChannel || 'call',
    source: lead.source || 'form',
    quiz_answers: lead.quizAnswers ? JSON.stringify(lead.quizAnswers) : null,
    message: lead.message || null,
    page_url: lead.pageUrl || null,
    utm: lead.utm ? JSON.stringify(lead.utm) : null,
    ip: lead.ip || null,
    user_agent: lead.userAgent || null,
    session_id: lead.sessionId || null,
  });
  return getLead(info.lastInsertRowid);
}

export function getLead(id) {
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
}

export function markTelegramSent(id, ok) {
  db.prepare('UPDATE leads SET tg_sent = ? WHERE id = ?').run(ok ? 1 : 0, id);
}

export function listLeads({ q = '', status = '', source = '', limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = {};
  if (q) {
    where.push('(name LIKE @q OR phone LIKE @q OR message LIKE @q OR quiz_answers LIKE @q)');
    params.q = `%${q}%`;
  }
  if (status) { where.push('status = @status'); params.status = status; }
  if (source) { where.push('source = @source'); params.source = source; }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT * FROM leads ${clause} ORDER BY id DESC LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM leads ${clause}`).get(params);
  return { rows, total };
}

export function updateLead(id, { status, adminNote }) {
  const current = getLead(id);
  if (!current) return null;
  db.prepare('UPDATE leads SET status = ?, admin_note = ? WHERE id = ?').run(
    status ?? current.status,
    adminNote ?? current.admin_note,
    id,
  );
  return getLead(id);
}

export function leadStats() {
  const one = (sql) => db.prepare(sql).get();
  return {
    total: one('SELECT COUNT(*) AS n FROM leads').n,
    today: one(`SELECT COUNT(*) AS n FROM leads WHERE date(created_at) = date('now')`).n,
    week: one(`SELECT COUNT(*) AS n FROM leads WHERE created_at >= datetime('now', '-7 days')`).n,
    newCount: one(`SELECT COUNT(*) AS n FROM leads WHERE status = 'new'`).n,
    fromQuiz: one(`SELECT COUNT(*) AS n FROM leads WHERE source = 'quiz'`).n,
    chats: one('SELECT COUNT(*) AS n FROM chat_sessions').n,
  };
}

/* ---------------------------------- Диалоги -------------------------------- */

export function getChatSession(sessionId) {
  return db.prepare('SELECT * FROM chat_sessions WHERE session_id = ?').get(sessionId);
}

export function saveChatState(sessionId, state) {
  db.prepare(`
    INSERT INTO chat_sessions (session_id, state) VALUES (@sid, @state)
    ON CONFLICT(session_id) DO UPDATE SET state = @state, updated_at = datetime('now')
  `).run({ sid: sessionId, state: JSON.stringify(state) });
}

export function linkChatToLead(sessionId, leadId) {
  db.prepare('UPDATE chat_sessions SET lead_id = ? WHERE session_id = ?').run(leadId, sessionId);
}

export function addChatMessage(sessionId, role, text, meta) {
  db.prepare(`
    INSERT INTO chat_messages (session_id, role, text, meta) VALUES (?, ?, ?, ?)
  `).run(sessionId, role, text, meta ? JSON.stringify(meta) : null);
}

export function getChatMessages(sessionId) {
  return db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id').all(sessionId);
}

/* ------------------------------- Сессии админа ------------------------------ */

export function createAdminSession(token, days = 7) {
  db.prepare(`
    INSERT INTO admin_sessions (token, expires_at) VALUES (?, datetime('now', ?))
  `).run(token, `+${days} days`);
}

export function isAdminSessionValid(token) {
  if (!token) return false;
  const row = db.prepare(`
    SELECT 1 AS ok FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')
  `).get(token);
  return Boolean(row);
}

export function destroyAdminSession(token) {
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
}
