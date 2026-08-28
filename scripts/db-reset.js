/**
 * Полная очистка базы: npm run db:reset -- --yes
 * Без флага --yes ничего не удаляет — защита от случайного запуска.
 */
import 'dotenv/config';
import { db, migrate } from '../server/db.js';

if (!process.argv.includes('--yes')) {
  console.log('\n  Это удалит ВСЕ заявки и диалоги.');
  console.log('  Если уверены, запустите: npm run db:reset -- --yes\n');
  process.exit(1);
}

db.exec('DELETE FROM leads; DELETE FROM chat_messages; DELETE FROM chat_sessions; DELETE FROM admin_sessions;');
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('leads', 'chat_messages')");
migrate();
console.log('\n  База очищена.\n');
