/**
 * Проверка связки с Telegram: npm run tg:test
 * Отправляет тестовое сообщение в чат из .env и печатает подсказки при ошибке.
 */
import 'dotenv/config';
import { sendMessage, telegramConfigured } from '../server/telegram.js';
import { club } from '../server/club.js';

if (!telegramConfigured()) {
  console.log('\n  Telegram не настроен.\n');
  console.log('  1. Напишите @BotFather в Telegram → /newbot → получите TELEGRAM_BOT_TOKEN');
  console.log('  2. Создайте группу, добавьте туда бота и напишите в ней любое сообщение');
  console.log('  3. Откройте https://api.telegram.org/bot<ТОКЕН>/getUpdates');
  console.log('     и скопируйте chat.id (у групп он отрицательный, например -1001234567890)');
  console.log('  4. Впишите оба значения в .env и запустите команду снова\n');
  process.exit(1);
}

const text = [
  `✅ <b>Проверка связи — ${club.name}</b>`,
  '',
  'Если вы видите это сообщение, заявки с сайта будут приходить сюда.',
  `Отправлено: ${new Date().toLocaleString('ru-RU')}`,
].join('\n');

const result = await sendMessage(text);

if (result.ok) {
  console.log('\n  ✅ Сообщение отправлено. Проверьте чат в Telegram.\n');
} else {
  console.error(`\n  ❌ Не отправилось: ${result.error}\n`);
  console.error('  Частые причины:');
  console.error('  • бот не добавлен в группу или его удалили');
  console.error('  • неверный chat_id (для групп он начинается с минуса)');
  console.error('  • для канала бот должен быть администратором\n');
  process.exit(1);
}
