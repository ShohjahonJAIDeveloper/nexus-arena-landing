/**
 * Виджет помощника: свободные вопросы + квиз.
 * Вся «умная» часть живёт на сервере (server/assistant), здесь только UI.
 */
const STORAGE_KEY = 'nexus-assistant-session';

const state = {
  sessionId: null,
  busy: false,
  started: false,
};

let el = {};

/** В ответах бота разрешаем только <b> — остальное экранируем. */
function renderText(text) {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
}

function scrollLog() {
  el.log.scrollTo({ top: el.log.scrollHeight, behavior: 'smooth' });
}

function addMessage(text, role) {
  const node = document.createElement('div');
  node.className = `msg msg--${role}`;
  node.innerHTML = renderText(text);
  el.log.appendChild(node);
  scrollLog();
  return node;
}

function showTyping() {
  const node = document.createElement('div');
  node.className = 'msg msg--bot msg--typing';
  node.innerHTML = '<i></i><i></i><i></i>';
  el.log.appendChild(node);
  scrollLog();
  return node;
}

function renderQuickReplies(replies = []) {
  el.replies.innerHTML = '';
  for (const reply of replies) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = reply.label;
    button.addEventListener('click', () => {
      addMessage(reply.label, 'user');
      send({ action: reply.action, value: reply.value || '' });
    });
    el.replies.appendChild(button);
  }
}

function renderProgress(progress) {
  const percent = progress ? (progress.current / progress.total) * 100 : 0;
  el.progress.style.width = `${percent}%`;
}

function applyInputHint(input) {
  if (input) {
    el.input.type = input.type === 'tel' ? 'tel' : 'text';
    el.input.placeholder = input.placeholder || 'Напишите ответ…';
    el.input.focus();
  } else {
    el.input.type = 'text';
    el.input.placeholder = 'Спросите про цены, зоны, турниры…';
  }
}

/** Печатает ответы по очереди — так диалог выглядит живым. */
async function printMessages(messages) {
  for (const [index, text] of messages.entries()) {
    const typing = showTyping();
    await wait(index === 0 ? 320 : Math.min(220 + text.length * 6, 900));
    typing.remove();
    addMessage(text, 'bot');
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, body) {
  const response = await fetch(`/api/assistant${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, sessionId: state.sessionId, pageUrl: location.href }),
  });
  if (!response.ok && response.status !== 429) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function send({ action = 'text', value = '', text = '' }) {
  if (state.busy) return;
  state.busy = true;
  el.replies.innerHTML = '';

  try {
    const data = await api('/message', { action, value, text });
    if (!data.ok) throw new Error(data.error || 'Ошибка помощника');

    state.sessionId = data.sessionId;
    localStorage.setItem(STORAGE_KEY, data.sessionId);

    await printMessages(data.messages || []);
    renderQuickReplies(data.quickReplies);
    renderProgress(data.progress);
    applyInputHint(data.input);
    if (data.finished) renderProgress(null);
  } catch (error) {
    console.error('[assistant]', error);
    addMessage('Связь с помощником пропала 😔 Позвоните нам: +998 90 123-45-67', 'bot');
  } finally {
    state.busy = false;
  }
}

async function startConversation() {
  if (state.started) return;
  state.started = true;
  try {
    const data = await api('/start', {});
    state.sessionId = data.sessionId;
    localStorage.setItem(STORAGE_KEY, data.sessionId);
    await printMessages(data.messages);
    renderQuickReplies(data.quickReplies);
  } catch (error) {
    console.error('[assistant]', error);
    addMessage('Не получилось запустить помощника. Напишите нам в Telegram: @nexus_arena', 'bot');
  }
}

function openWidget(quizValue) {
  el.root.classList.add('is-open');
  startConversation().then(() => {
    if (quizValue === undefined) return;
    addMessage('Подобрать тариф', 'user');
    send({ action: 'quiz', value: quizValue || '' });
  });
}

function closeWidget() {
  el.root.classList.remove('is-open');
}

export function initAssistant() {
  el = {
    root: document.getElementById('assistant'),
    toggle: document.getElementById('assistant-toggle'),
    close: document.getElementById('assistant-close'),
    log: document.getElementById('assistant-log'),
    replies: document.getElementById('assistant-replies'),
    form: document.getElementById('assistant-form'),
    input: document.getElementById('assistant-input'),
    progress: document.getElementById('assistant-progress'),
  };
  if (!el.root) return;

  state.sessionId = localStorage.getItem(STORAGE_KEY);

  el.toggle.addEventListener('click', () => {
    if (el.root.classList.contains('is-open')) closeWidget();
    else openWidget();
  });
  el.close.addEventListener('click', closeWidget);

  el.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = el.input.value.trim();
    if (!text || state.busy) return;
    el.input.value = '';
    addMessage(text, 'user');
    send({ action: 'text', text });
  });

  // Кнопки на лендинге, которые открывают помощника или сразу квиз.
  document.querySelectorAll('[data-assistant-open]').forEach((button) => {
    button.addEventListener('click', () => {
      const quiz = button.dataset.assistantQuiz;
      openWidget(quiz === undefined ? undefined : quiz);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeWidget();
  });
}
