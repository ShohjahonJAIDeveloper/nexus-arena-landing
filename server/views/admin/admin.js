/** Логика админ-панели: список заявок, фильтры, карточка и смена статуса. */
const state = { q: '', status: '', source: '', limit: 25, offset: 0, total: 0 };

const STATUS_LABEL = { new: 'Новая', in_work: 'В работе', done: 'Готово', spam: 'Спам' };
const SOURCE_LABEL = { form: 'Форма', quiz: 'Квиз', chat: 'Чат' };
const CHANNEL_LABEL = { call: 'Звонок', telegram: 'Telegram', whatsapp: 'WhatsApp' };

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
  ));
}

function formatDate(sqlDate) {
  const date = new Date(`${String(sqlDate).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return sqlDate;
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

async function api(path, options = {}) {
  const response = await fetch(`/api/admin${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (response.status === 401) { location.reload(); return null; }
  return response.json();
}

/* ------------------------------ Статистика ---------------------------- */
async function loadStats() {
  const data = await api('/stats');
  if (!data?.ok) return;
  const s = data.stats;
  $('stats').innerHTML = [
    ['Всего заявок', s.total],
    ['Сегодня', s.today],
    ['За неделю', s.week],
    ['Новых', s.newCount],
    ['Из квиза', s.fromQuiz],
  ].map(([label, value]) => `
    <div class="card"><div class="card__value">${value}</div><div class="card__label">${label}</div></div>
  `).join('');
}

/* ------------------------------- Список ------------------------------- */
function quizPreview(quiz) {
  if (!quiz?.summary) return '';
  return Object.entries(quiz.summary).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ');
}

async function loadLeads() {
  const params = new URLSearchParams({
    q: state.q, status: state.status, source: state.source,
    limit: state.limit, offset: state.offset,
  });
  const data = await api(`/leads?${params}`);
  if (!data?.ok) return;

  state.total = data.total;
  const rows = data.leads.map((lead) => `
    <tr data-id="${lead.id}">
      <td class="nowrap">${lead.id}</td>
      <td class="nowrap">${formatDate(lead.created_at)}</td>
      <td><b>${esc(lead.name)}</b><br><span class="muted">${esc(lead.phone)}</span></td>
      <td><span class="badge badge--src">${SOURCE_LABEL[lead.source] || lead.source}</span></td>
      <td>${esc(lead.message || '') || quizPreview(lead.quiz_answers) || '<span class="muted">—</span>'}</td>
      <td><span class="badge badge--${lead.status}">${STATUS_LABEL[lead.status] || lead.status}</span></td>
    </tr>
  `).join('');

  $('rows').innerHTML = rows;
  $('empty').hidden = data.leads.length > 0;
  $('pager-info').textContent = data.total
    ? `${state.offset + 1}–${Math.min(state.offset + state.limit, data.total)} из ${data.total}`
    : 'Ничего не найдено';
  $('prev').disabled = state.offset === 0;
  $('next').disabled = state.offset + state.limit >= data.total;
}

/* ------------------------------ Карточка ------------------------------ */
async function openLead(id) {
  const data = await api(`/leads/${id}`);
  if (!data?.ok) return;
  const { lead, chat } = data;

  const quizRows = lead.quiz_answers?.summary
    ? Object.entries(lead.quiz_answers.summary)
        .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')
    : '';
  const estimate = lead.quiz_answers?.estimate
    ? `<dt>Оценка стоимости</dt><dd>${Number(lead.quiz_answers.estimate.total).toLocaleString('ru-RU')} сум
       <br><span class="muted">${esc(lead.quiz_answers.estimate.note || '')}</span></dd>`
    : '';
  const utm = lead.utm
    ? `<dt>UTM</dt><dd>${esc(Object.entries(lead.utm).map(([k, v]) => `${k}=${v}`).join(', '))}</dd>`
    : '';

  const chatHtml = chat?.length
    ? `<h3 style="margin-top:24px">Диалог с помощником</h3>
       <div class="chat">${chat.map((m) => `
         <div class="chat__msg chat__msg--${m.role}">${esc(m.text).replace(/&lt;\/?b&gt;/g, '')}</div>
       `).join('')}</div>`
    : '';

  $('drawer-panel').innerHTML = `
    <div class="drawer__head">
      <div>
        <h2>${esc(lead.name)}</h2>
        <div class="muted">Заявка №${lead.id} · ${formatDate(lead.created_at)}</div>
      </div>
      <button class="drawer__close" id="drawer-close">✕</button>
    </div>

    <a class="btn btn--primary" href="tel:${esc(lead.phone)}">📞 ${esc(lead.phone)}</a>
    <a class="btn" href="https://wa.me/${esc(lead.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener">WhatsApp</a>

    <dl class="kv">
      <dt>Связь</dt><dd>${CHANNEL_LABEL[lead.contact_channel] || lead.contact_channel}</dd>
      <dt>Источник</dt><dd>${SOURCE_LABEL[lead.source] || lead.source}</dd>
      <dt>Telegram</dt><dd>${lead.tg_sent ? 'отправлено' : 'не отправлено'}</dd>
      ${lead.message ? `<dt>Комментарий</dt><dd>${esc(lead.message)}</dd>` : ''}
      ${quizRows}
      ${estimate}
      ${utm}
      <dt>Страница</dt><dd class="muted">${esc(lead.page_url || '—')}</dd>
      <dt>IP</dt><dd class="muted">${esc(lead.ip || '—')}</dd>
    </dl>

    <label class="field">
      <span>Статус</span>
      <select id="lead-status">
        ${Object.entries(STATUS_LABEL).map(([value, label]) => `
          <option value="${value}" ${lead.status === value ? 'selected' : ''}>${label}</option>
        `).join('')}
      </select>
    </label>

    <label class="field">
      <span>Заметка администратора</span>
      <textarea id="lead-note" rows="3" placeholder="Перезвонил, забронировал VIP на субботу">${esc(lead.admin_note || '')}</textarea>
    </label>

    <button class="btn btn--primary" id="lead-save">Сохранить</button>
    <span class="muted" id="lead-saved" style="margin-left:10px"></span>

    ${chatHtml}
  `;

  $('drawer').classList.add('is-open');
  $('drawer-close').addEventListener('click', closeDrawer);
  $('lead-save').addEventListener('click', async () => {
    const result = await api(`/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: $('lead-status').value, adminNote: $('lead-note').value }),
    });
    if (result?.ok) {
      $('lead-saved').textContent = 'Сохранено';
      loadLeads();
      loadStats();
    }
  });
}

function closeDrawer() {
  $('drawer').classList.remove('is-open');
}

/* ------------------------------- События ------------------------------ */
let searchTimer;
$('filter-q').addEventListener('input', (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = event.target.value.trim();
    state.offset = 0;
    loadLeads();
  }, 300);
});

$('filter-status').addEventListener('change', (event) => {
  state.status = event.target.value;
  state.offset = 0;
  loadLeads();
});

$('filter-source').addEventListener('change', (event) => {
  state.source = event.target.value;
  state.offset = 0;
  loadLeads();
});

$('rows').addEventListener('click', (event) => {
  const row = event.target.closest('tr[data-id]');
  if (row) openLead(row.dataset.id);
});

$('drawer').addEventListener('click', (event) => {
  if (event.target.id === 'drawer') closeDrawer();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDrawer();
});

$('prev').addEventListener('click', () => {
  state.offset = Math.max(0, state.offset - state.limit);
  loadLeads();
});

$('next').addEventListener('click', () => {
  if (state.offset + state.limit < state.total) {
    state.offset += state.limit;
    loadLeads();
  }
});

$('refresh').addEventListener('click', () => { loadStats(); loadLeads(); });

$('logout').addEventListener('click', async () => {
  await fetch('/admin/logout', { method: 'POST' });
  location.reload();
});

// Автообновление списка раз в минуту — чтобы новые заявки появлялись сами.
setInterval(() => { loadStats(); loadLeads(); }, 60000);

loadStats();
loadLeads();
