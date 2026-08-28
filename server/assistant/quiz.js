/**
 * Сценарный квиз: 5 коротких шагов + контакты.
 * Ветвление зависит от цели визита, в конце — расчёт стоимости и заявка.
 */
import { zones, estimatePrice, formatMoney, club } from '../club.js';
import { normalizePhone } from '../validate.js';

const GOALS = {
  friends: 'Поиграть с друзьями',
  solo: 'Поиграть одному',
  tournament: 'Турнир / командные тренировки',
  birthday: 'День рождения или корпоратив',
  bootcamp: 'Буткемп и тренер',
};

const PEOPLE = {
  '1': { label: 'Я один', value: 1 },
  '2-4': { label: '2–4 человека', value: 4 },
  '5-8': { label: '5–8 человек', value: 6 },
  '9+': { label: 'Больше 8', value: 10 },
};

const HOURS = {
  '2': { label: '2 часа', value: 2 },
  '3': { label: '3 часа', value: 3 },
  '5': { label: '5 часов (пакет)', value: 5 },
  night: { label: 'Всю ночь', value: 10 },
};

const WHEN = {
  today: 'Сегодня',
  tomorrow: 'Завтра',
  weekend: 'В выходные',
  later: 'Другая дата — обсудим по телефону',
};

/** Какие зоны показывать под конкретную цель. */
function zoneOptions(goal) {
  if (goal === 'bootcamp') return ['bootcamp'];
  if (goal === 'birthday') return ['vip', 'ps5'];
  if (goal === 'tournament') return ['vip', 'standard', 'bootcamp'];
  if (goal === 'solo') return ['standard', 'vip'];
  return ['standard', 'vip', 'ps5'];
}

export const STEPS = [
  {
    id: 'goal',
    question: 'Зачем планируете прийти? Так подберу зону точнее.',
    options: () => Object.entries(GOALS).map(([id, label]) => ({ id, label })),
  },
  {
    id: 'people',
    question: 'Сколько вас будет?',
    skipIf: (a) => a.goal === 'solo' || a.goal === 'bootcamp',
    options: () => Object.entries(PEOPLE).map(([id, p]) => ({ id, label: p.label })),
  },
  {
    id: 'zone',
    question: 'Какая зона ближе?',
    options: (a) => zoneOptions(a.goal).map((id) => {
      const z = zones.find((zone) => zone.id === id);
      return { id, label: `${z.title} — ${z.priceLabel}` };
    }),
  },
  {
    id: 'hours',
    question: 'На сколько часов планируете?',
    skipIf: (a) => a.goal === 'bootcamp',
    options: () => Object.entries(HOURS).map(([id, h]) => ({ id, label: h.label })),
  },
  {
    id: 'when',
    question: 'Когда вам удобно?',
    options: () => Object.entries(WHEN).map(([id, label]) => ({ id, label })),
  },
  {
    id: 'name',
    question: 'Как к вам обращаться?',
    input: 'text',
    placeholder: 'Ваше имя',
    validate: (text) => (String(text).trim().length >= 2 ? null : 'Напишите имя — хотя бы 2 буквы'),
  },
  {
    id: 'phone',
    question: 'Оставьте номер — администратор перезвонит в течение 15 минут и подтвердит бронь.',
    input: 'tel',
    placeholder: '+998 90 123-45-67',
    validate: (text) => (normalizePhone(text) ? null : 'Проверьте номер: например, +998 90 123-45-67'),
  },
];

/** Стартовое состояние. prefill — id зоны или цели, если пришли с кнопки на сайте. */
export function startQuiz(prefill) {
  const answers = {};
  if (prefill && zones.some((z) => z.id === prefill)) answers.zone = prefill;
  if (prefill && GOALS[prefill]) answers.goal = prefill;
  if (answers.zone === 'bootcamp') answers.goal = 'bootcamp';
  return { mode: 'quiz', stepIndex: 0, answers };
}

/** В режиме «просто перезвоните» спрашиваем только имя и телефон. */
export const CONTACT_STEPS = STEPS.filter((s) => Boolean(s.input));

export function stepsFor(state) {
  return state.mode === 'lead' ? CONTACT_STEPS : STEPS;
}

/** Старт короткого сценария «оставить контакты». */
export function startContact() {
  return { mode: 'lead', stepIndex: 0, answers: {} };
}

function stepAt(state, index) {
  const steps = stepsFor(state);
  for (let i = index; i < steps.length; i += 1) {
    const step = steps[i];
    const alreadyAnswered = state.answers[step.id] !== undefined;
    const skipped = step.skipIf && step.skipIf(state.answers);
    if (!alreadyAnswered && !skipped) return { step, index: i };
  }
  return null;
}

/** Следующий вопрос квиза либо признак завершения. */
export function nextPrompt(state) {
  const found = stepAt(state, state.stepIndex);
  if (!found) return { done: true };
  state.stepIndex = found.index;
  const { step } = found;
  return {
    done: false,
    stepId: step.id,
    text: step.question,
    options: step.options ? step.options(state.answers) : null,
    input: step.input || null,
    placeholder: step.placeholder || null,
    progress: { current: found.index + 1, total: stepsFor(state).length },
  };
}

/** Записывает ответ на текущий шаг. Возвращает {ok} либо {ok:false, error}. */
export function applyAnswer(state, { choiceId, text }) {
  const found = stepAt(state, state.stepIndex);
  if (!found) return { ok: true };
  const { step } = found;

  if (step.input) {
    const value = String(text || '').trim();
    const error = step.validate ? step.validate(value) : null;
    if (error) return { ok: false, error };
    state.answers[step.id] = step.id === 'phone' ? normalizePhone(value) : value;
  } else {
    const options = step.options(state.answers);
    const chosen = options.find((o) => o.id === choiceId)
      || options.find((o) => o.label.toLowerCase() === String(text || '').toLowerCase().trim());
    if (!chosen) return { ok: false, error: 'Выберите один из вариантов кнопкой ниже.' };
    state.answers[step.id] = chosen.id;
  }

  state.stepIndex = found.index + 1;
  return { ok: true };
}

/** Человекочитаемая сводка + расчёт стоимости. */
export function buildSummary(answers) {
  const zoneId = answers.zone || 'standard';
  const people = PEOPLE[answers.people]?.value ?? (answers.goal === 'solo' ? 1 : 1);
  const hours = HOURS[answers.hours]?.value ?? 3;
  const estimate = estimatePrice({ zoneId, people, hours });

  const summary = {
    'Цель визита': GOALS[answers.goal] || 'Игра в клубе',
    'Зона': estimate.zone.title,
  };
  if (answers.people) summary['Сколько человек'] = PEOPLE[answers.people].label;
  if (answers.hours) summary['Сколько часов'] = HOURS[answers.hours].label;
  if (answers.when) summary['Когда'] = WHEN[answers.when];

  return { summary, estimate: { total: estimate.total, note: estimate.note, zoneId: estimate.zone.id } };
}

/** Текст, который бот показывает перед отправкой заявки. */
export function summaryText(answers) {
  const { summary, estimate } = buildSummary(answers);
  const lines = ['Собрал заявку:'];
  for (const [key, value] of Object.entries(summary)) lines.push(`• <b>${key}:</b> ${value}`);
  lines.push('', `💰 Ориентировочно: <b>${formatMoney(estimate.total)}</b> (${estimate.note}).`);
  lines.push('Точную сумму подтвердит администратор — скидки и акции применим автоматически.');
  return { text: lines.join('\n'), summary, estimate };
}

export function doneText(name) {
  return [
    `${name}, заявка принята! 🎮`,
    `Администратор перезвонит в течение 15 минут и закрепит за вами место. Если что — звоните сами: ${club.phone}.`,
  ].join('\n');
}

export { GOALS, PEOPLE, HOURS, WHEN };
