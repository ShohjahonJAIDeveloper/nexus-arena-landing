/** Быстрый отчёт по базе: npm run db:stats */
import 'dotenv/config';
import { leadStats, listLeads } from '../server/db.js';

const stats = leadStats();
console.log('\n  Заявки');
console.log('  ──────────────────────────────');
console.log(`  всего:        ${stats.total}`);
console.log(`  сегодня:      ${stats.today}`);
console.log(`  за неделю:    ${stats.week}`);
console.log(`  новых:        ${stats.newCount}`);
console.log(`  из квиза:     ${stats.fromQuiz}`);
console.log(`  диалогов:     ${stats.chats}\n`);

const { rows } = listLeads({ limit: 10 });
if (!rows.length) {
  console.log('  Пока пусто. Оставьте заявку на сайте — она появится здесь.\n');
} else {
  console.log('  Последние заявки');
  console.log('  ──────────────────────────────');
  for (const lead of rows) {
    console.log(`  #${lead.id} ${lead.created_at} · ${lead.name} · ${lead.phone} · ${lead.source} · ${lead.status}`);
  }
  console.log('');
}
