/**
 * Роуты помощника: свободный диалог по базе знаний + квиз, который
 * мягко доводит до заявки. Состояние диалога живёт на сервере (SQLite).
 */
import express from 'express';
import crypto from 'node:crypto';
import { addChatMessage, getChatSession, linkChatToLead, saveChatState } from '../db.js';
import { intents, smallTalk, fallbackAnswer, fallbackQuickReplies, renderAnswer } from '../assistant/knowledge.js';
import { compileIntents, matchIntent } from '../assistant/engine.js';
import {
  startQuiz, startContact, nextPrompt, applyAnswer, summaryText, doneText,
} from '../assistant/quiz.js';
import { createLead } from '../leadService.js';
import { rateLimit } from '../rateLimit.js';
import { club } from '../club.js';

const compiledIntents = compileIntents(intents);
const compiledSmallTalk = compileIntents(smallTalk);

export const assistantRouter = express.Router();

const WELCOME = [
  `Привет! Я помощник клуба ${club.name}. 👾`,
  'Спросите про цены, зоны, железо или турниры — отвечу сразу. А могу за 30 секунд подобрать тариф и забронировать место.',
].join('\n');

const WELCOME_REPLIES = [
  { label: 'Сколько стоит час?', action: 'ask', value: 'сколько стоит час игры' },
  { label: 'Подобрать тариф', action: 'quiz' },
  { label: 'Какое железо?', action: 'ask', value: 'какие характеристики компьютеров' },
  { label: 'Где вы находитесь?', action: 'ask', value: 'адрес клуба' },
];

const CANCEL_WORDS = ['отмена', 'стоп', 'выйти', 'не хочу', 'назад'];

function loadState(sessionId) {
  const row = getChatSession(sessionId);
  if (!row) return { mode: 'chat', answersCount: 0, offeredQuiz: false };
  try {
    return JSON.parse(row.state);
  } catch {
    return { mode: 'chat', answersCount: 0, offeredQuiz: false };
  }
}

/** Ответ бота: пишем в базу и отдаём клиенту. */
function reply(sessionId, state, payload) {
  saveChatState(sessionId, state);
  const messages = Array.isArray(payload.messages) ? payload.messages : [payload.text];
  for (const text of messages) addChatMessage(sessionId, 'bot', text, { mode: state.mode });
  return {
    ok: true,
    sessionId,
    messages,
    quickReplies: payload.quickReplies || [],
    input: payload.input || null,
    progress: payload.progress || null,
    finished: Boolean(payload.finished),
  };
}

/** Приглашение к квизу после нескольких ответов — мягко и один раз. */
function maybeOfferQuiz(state, quickReplies) {
  if (state.offeredQuiz || state.answersCount < 2) return quickReplies;
  state.offeredQuiz = true;
  return [{ label: 'Подобрать тариф за 30 секунд', action: 'quiz' }, ...quickReplies];
}

function promptPayload(prompt, extraReplies = []) {
  const quickReplies = (prompt.options || []).map((o) => ({ label: o.label, action: 'choice', value: o.id }));
  return {
    text: prompt.text,
    quickReplies: [...quickReplies, ...extraReplies],
    input: prompt.input ? { type: prompt.input, placeholder: prompt.placeholder } : null,
    progress: prompt.progress,
  };
}

const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 40 });

assistantRouter.post('/start', (req, res) => {
  const sessionId = String(req.body?.sessionId || '').slice(0, 64) || crypto.randomUUID();
  const previous = loadState(sessionId);
  // Виджет всегда открывается с чистой ленты сообщений, поэтому и на сервере
  // сбрасываем незаконченный квиз: иначе следующий вопрос гостя будет принят
  // за ответ на шаг, который он уже не видит.
  const state = {
    mode: 'chat',
    answersCount: previous.answersCount || 0,
    offeredQuiz: Boolean(previous.offeredQuiz),
  };
  saveChatState(sessionId, state);
  res.json({
    ok: true,
    sessionId,
    messages: [WELCOME],
    quickReplies: WELCOME_REPLIES,
    input: null,
    progress: null,
    finished: false,
  });
});

assistantRouter.post('/message', chatLimiter, async (req, res) => {
  const sessionId = String(req.body?.sessionId || '').slice(0, 64) || crypto.randomUUID();
  const action = String(req.body?.action || 'text');
  const value = String(req.body?.value || '').slice(0, 64);
  const text = String(req.body?.text || '').slice(0, 500).trim();
  const state = loadState(sessionId);

  const userEcho = text || (action === 'choice' ? value : '');
  if (userEcho) addChatMessage(sessionId, 'user', userEcho, { action });

  // --- Переключение сценариев по кнопкам --------------------------------
  if (action === 'quiz') {
    const fresh = startQuiz(value);
    fresh.answersCount = state.answersCount || 0;
    fresh.offeredQuiz = true;
    const payload = promptPayload(nextPrompt(fresh), [{ label: 'Отменить', action: 'cancel' }]);
    return res.json(reply(sessionId, fresh, {
      ...payload,
      messages: ['Отлично! Пара коротких вопросов — и передам заявку администратору.', payload.text],
    }));
  }

  if (action === 'lead') {
    const fresh = startContact();
    fresh.answersCount = state.answersCount || 0;
    fresh.offeredQuiz = true;
    const payload = promptPayload(nextPrompt(fresh), [{ label: 'Отменить', action: 'cancel' }]);
    return res.json(reply(sessionId, fresh, {
      ...payload,
      messages: ['Хорошо, оставьте контакты — администратор перезвонит.', payload.text],
    }));
  }

  if (action === 'cancel' || (state.mode !== 'chat' && CANCEL_WORDS.includes(text.toLowerCase()))) {
    const chat = { mode: 'chat', answersCount: state.answersCount || 0, offeredQuiz: true };
    return res.json(reply(sessionId, chat, {
      text: 'Хорошо, не настаиваю 🙂 Спрашивайте что угодно про клуб — я рядом.',
      quickReplies: fallbackQuickReplies,
    }));
  }

  // --- Идёт квиз или сбор контактов -------------------------------------
  if (state.mode === 'quiz' || state.mode === 'lead') {
    const result = applyAnswer(state, { choiceId: action === 'choice' ? value : undefined, text });
    if (!result.ok) {
      const payload = promptPayload(nextPrompt(state), [{ label: 'Отменить', action: 'cancel' }]);
      return res.json(reply(sessionId, state, { ...payload, messages: [result.error, payload.text] }));
    }

    const prompt = nextPrompt(state);
    if (!prompt.done) {
      return res.json(reply(sessionId, state, promptPayload(prompt, [{ label: 'Отменить', action: 'cancel' }])));
    }

    // Все ответы собраны — создаём заявку.
    const isQuiz = state.mode === 'quiz';
    const built = isQuiz ? summaryText(state.answers) : null;
    const lead = await createLead({
      name: state.answers.name,
      phone: state.answers.phone,
      contactChannel: 'call',
      source: isQuiz ? 'quiz' : 'chat',
      quizAnswers: built ? { summary: built.summary, estimate: built.estimate, raw: state.answers } : null,
      message: null,
      pageUrl: req.body?.pageUrl,
      sessionId,
      req,
    });

    if (!lead.ok) {
      return res.json(reply(sessionId, state, {
        text: 'Не получилось отправить заявку 😔 Позвоните, пожалуйста: ' + club.phone,
        quickReplies: fallbackQuickReplies,
      }));
    }

    linkChatToLead(sessionId, lead.lead.id);
    const done = { mode: 'chat', answersCount: state.answersCount || 0, offeredQuiz: true, leadId: lead.lead.id };
    const messages = built ? [built.text, doneText(state.answers.name)] : [doneText(state.answers.name)];
    return res.json(reply(sessionId, done, {
      messages,
      quickReplies: [
        { label: 'Как добраться?', action: 'ask', value: 'адрес клуба' },
        { label: 'Какие игры есть?', action: 'ask', value: 'какие игры установлены' },
      ],
      finished: true,
    }));
  }

  // --- Свободный диалог --------------------------------------------------
  const query = action === 'ask' && req.body?.value ? String(req.body.value) : text;
  if (!query) {
    return res.json(reply(sessionId, state, { text: WELCOME, quickReplies: WELCOME_REPLIES }));
  }

  const small = matchIntent(query, compiledSmallTalk);
  if (small.status === 'confident' || small.status === 'ambiguous') {
    return res.json(reply(sessionId, state, {
      text: renderAnswer(small.intent),
      quickReplies: small.intent.quickReplies || WELCOME_REPLIES,
    }));
  }

  const match = matchIntent(query, compiledIntents);

  if (match.status === 'ambiguous' && match.alternatives?.length > 1) {
    return res.json(reply(sessionId, state, {
      text: 'Уточните, пожалуйста, что именно интересует:',
      quickReplies: [
        ...match.alternatives.map((intent) => ({
          label: intent.title,
          action: 'ask',
          value: intent.patterns[0],
        })),
        { label: 'Подобрать тариф', action: 'quiz' },
      ],
    }));
  }

  if (match.status === 'confident' || match.status === 'weak') {
    state.answersCount = (state.answersCount || 0) + 1;
    const prefix = match.status === 'weak' ? 'Возможно, вы про это:\n' : '';
    const quickReplies = maybeOfferQuiz(state, match.intent.quickReplies || fallbackQuickReplies);
    return res.json(reply(sessionId, state, {
      text: prefix + renderAnswer(match.intent),
      quickReplies,
    }));
  }

  return res.json(reply(sessionId, state, {
    text: fallbackAnswer(),
    quickReplies: fallbackQuickReplies,
  }));
});
