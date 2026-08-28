/**
 * Точка входа: один Node-процесс отдаёт и лендинг, и API, и админку.
 * Сборщика нет — фронтенд на нативных ES-модулях, библиотеки монтируются в /vendor.
 */
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from './db.js';
import { leadsRouter } from './routes/leads.js';
import { assistantRouter } from './routes/assistant.js';
import { adminRouter } from './routes/admin.js';
import { telegramConfigured } from './telegram.js';
import { club } from './club.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

migrate();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser(process.env.SESSION_SECRET || 'dev-secret-change-me'));

// Библиотеки из node_modules — чтобы сайт работал без интернета и без сборщика.
const vendor = (pkg) => express.static(path.join(ROOT, 'node_modules', pkg), {
  maxAge: '1d',
  index: false,
});
app.use('/vendor/three', vendor('three'));
app.use('/vendor/gsap', vendor('gsap'));
app.use('/vendor/lenis', vendor('lenis'));

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /api\nAllow: /\n');
});

app.use('/api', leadsRouter);
app.use('/api/assistant', assistantRouter);
app.use(adminRouter);

app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: '1h' }));

app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ ok: false, error: 'Не найдено' });
  return res.status(404).sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`\n  ${club.name} — лендинг запущен`);
  console.log(`  Сайт:    http://localhost:${PORT}`);
  console.log(`  Админка: http://localhost:${PORT}/admin`);
  console.log(`  Telegram: ${telegramConfigured() ? 'настроен' : 'не настроен (заявки только в базу)'}`);
  console.log(`  База:    data/app.db\n`);
});
