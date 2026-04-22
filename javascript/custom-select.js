document.addEventListener('DOMContentLoaded', function () {
  const native = document.getElementById('table-select');
  const cs = document.getElementById('custom-select');
  const trigger = document.getElementById('cs-trigger');
  const valueEl = document.getElementById('cs-value');
  const list = document.getElementById('cs-list');
  const items = Array.from(list.querySelectorAll('li'));

  function openList() {
    list.setAttribute('aria-hidden', 'false');
    cs.setAttribute('aria-expanded', 'true');
    // focus first selected or first item
    const sel = list.querySelector('[aria-selected="true"]') || items[0];
    sel && sel.focus();
  }
  function closeList() {
    list.setAttribute('aria-hidden', 'true');
    cs.setAttribute('aria-expanded', 'false');
  }

  // Инициализация значения из native select
  function syncFromNative() {
    const val = native.value;
    const opt = Array.from(native.options).find(o => o.value === val);
    valueEl.textContent = opt ? opt.text : '';
    items.forEach(i => i.removeAttribute('aria-selected'));
    const sel = items.find(i => i.dataset.value === val);
    if (sel) sel.setAttribute('aria-selected', 'true');
  }
  syncFromNative();

  // Триггер клика
  trigger.addEventListener('click', function (e) {
    const opened = cs.getAttribute('aria-expanded') === 'true';
    opened ? closeList() : openList();
  });

  // Выбор опции
  items.forEach(li => {
    li.addEventListener('click', function () {
      const val = this.dataset.value;
      valueEl.textContent = this.textContent;
      native.value = val;
      native.dispatchEvent(new Event('change', { bubbles: true }));
      items.forEach(i => i.removeAttribute('aria-selected'));
      this.setAttribute('aria-selected', 'true');
      closeList();
      trigger.focus();
    });

    li.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = items[items.indexOf(this) + 1] || items[0];
        next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = items[items.indexOf(this) - 1] || items[items.length - 1];
        prev.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.click();
      } else if (e.key === 'Escape') {
        closeList();
        trigger.focus();
      }
    });
  });

  // Клавиши на контейнере
  cs.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    } else if (e.key === 'Escape') {
      closeList();
    }
  });

  // Закрытие по клику вне
  document.addEventListener('click', function (e) {
    if (!cs.contains(e.target)) closeList();
  });

  // Если native select меняется извне
  native.addEventListener('change', syncFromNative);
});
