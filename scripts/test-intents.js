import { intents } from '../server/assistant/knowledge.js';
import { compileIntents, matchIntent } from '../server/assistant/engine.js';

const compiled = compileIntents(intents);
const cases = [
  'сколько стоит час',
  'какое у вас железо',
  'можно отметить др',
  'есть ли плойка',
  'во сколько закрываетесь',
  'адресс какой',
  'хочу забранировать место',
  'какие игры есть',
  'а скидки для студентов бывают',
  'можно ли со своей едой',
  'мне 15 лет пустите',
  'как оплатить картой',
  'asdfgh qwerty',
];
for (const text of cases) {
  const r = matchIntent(text, compiled);
  console.log(text.padEnd(30), '->', r.status.padEnd(10), r.intent ? r.intent.id : '-', r.score.toFixed(2));
}
