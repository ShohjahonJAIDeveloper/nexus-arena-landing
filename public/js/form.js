/** Форма заявки: клиентская валидация, отправка и экран «спасибо». */

const startedAt = Date.now();

function collectUtm() {
  const utm = {};
  new URLSearchParams(location.search).forEach((value, key) => {
    if (key.startsWith('utm_')) utm[key] = value.slice(0, 200);
  });
  return utm;
}

function setError(form, field, message) {
  const box = form.querySelector(`[data-error-for="${field}"]`);
  const wrapper = form.querySelector(`[name="${field}"]`)?.closest('.field');
  if (box) box.textContent = message || '';
  if (wrapper) wrapper.classList.toggle('has-error', Boolean(message));
}

function clearErrors(form) {
  form.querySelectorAll('.field__error').forEach((box) => { box.textContent = ''; });
  form.querySelectorAll('.field.has-error').forEach((field) => field.classList.remove('has-error'));
}

/** Проверка на клиенте — сервер всё равно проверит ещё раз. */
function validate(values) {
  const errors = {};
  if (values.name.trim().length < 2) errors.name = 'Укажите имя — минимум 2 символа';
  const digits = values.phone.replace(/\D/g, '');
  if (digits.length < 9) errors.phone = 'Введите номер: например, +998 90 123-45-67';
  return errors;
}

export function initLeadForm() {
  const form = document.getElementById('lead-form');
  if (!form) return;

  const submit = document.getElementById('lead-submit');
  const successText = document.getElementById('lead-success-text');

  form.querySelectorAll('input, textarea').forEach((input) => {
    input.addEventListener('input', () => setError(form, input.name, ''));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);

    const data = new FormData(form);
    const values = {
      name: String(data.get('name') || ''),
      phone: String(data.get('phone') || ''),
      contactChannel: String(data.get('contactChannel') || 'call'),
      message: String(data.get('message') || ''),
      company: String(data.get('company') || ''),
      source: 'form',
      pageUrl: location.href,
      utm: collectUtm(),
      elapsedMs: Date.now() - startedAt,
    };

    const errors = validate(values);
    if (Object.keys(errors).length) {
      Object.entries(errors).forEach(([field, message]) => setError(form, field, message));
      form.querySelector(`[name="${Object.keys(errors)[0]}"]`)?.focus();
      return;
    }

    submit.disabled = true;
    const label = submit.textContent;
    submit.innerHTML = '<span class="spinner"></span> Отправляем…';

    try {
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = await response.json();

      if (!result.ok) {
        Object.entries(result.errors || {}).forEach(([field, message]) => setError(form, field, message));
        if (result.error) setError(form, 'phone', result.error);
        return;
      }

      if (result.message && successText) successText.textContent = result.message;
      form.classList.add('is-sent');
      form.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch (error) {
      console.error('[lead]', error);
      setError(form, 'phone', 'Не удалось отправить. Позвоните нам: +998 90 123-45-67');
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  });
}
