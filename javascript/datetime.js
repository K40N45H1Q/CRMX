const datetime = document.getElementById("datetime");

function updateUTC() {
  const d = new Date();

  const pad = n => String(n).padStart(2, "0");

  const utc =
    `${d.getUTCFullYear()}-` +
    `${pad(d.getUTCMonth() + 1)}-` +
    `${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:` +
    `${pad(d.getUTCMinutes())}:` +
    `${pad(d.getUTCSeconds())} UTC`;

  datetime.textContent = utc;
}

updateUTC();               
setInterval(updateUTC, 1000);


// Вариант 2: Использовать MutationObserver (надежнее)
const observer = new MutationObserver(() => {
    document.querySelectorAll('.tabulator-cell').forEach(cell => {
        const text = cell.textContent;
        if (text === 'Paid 🟢') {
            cell.style.setProperty('color', '#1aff00', 'important');
        } else if (text === 'Pending 🟡') {
            cell.style.setProperty('color', '#e5ff00', 'important');
        } else if (text === 'Overdue 🔴') {
            cell.style.setProperty('color', '#ff0019', 'important');
        }
    });
});

observer.observe(document.body, { childList: true, subtree: true });

