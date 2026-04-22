import { table } from "./table-core.js";
import { loadTable } from "./table-logic.js";
import { apiSaveTable, apiDeleteRows } from "./api.js";

const deleteBtn = document.getElementById("delete-btn");
const addRowBtn = document.getElementById("add-row-btn");
const addColumnBtn = document.getElementById("add-column-btn");
const saveBtn = document.getElementById("save-btn");
const tableSelect = document.getElementById("table-select");


saveBtn.addEventListener("click", async () => {
    document.activeElement.blur(); 
    await new Promise(res => setTimeout(res, 50));

    let rows = table.getData();
    const columns = table.getColumns().map(c => c.getDefinition());

    // 🔑 РАСЧЁТ ПЕРЕД ОТПРАВКОЙ (1 раз, на основе текущих инпутов)
    const terms = parseInt(document.querySelector('.math input')?.value) || 12;
    const rate = parseFloat(document.querySelectorAll('.math input')[1]?.value) || 0;
    const initPct = parseFloat(document.querySelectorAll('.math input')[2]?.value) || 0;

    rows = rows.map(row => {
        if (!row.object || !window.CARS_CACHE?.[row.object]) return row;
        
        const cost = window.CARS_CACHE[row.object].cost_eur;
        const principal = cost - (cost * initPct / 100);
        let monthly = "0.00";
        
        if (principal > 0 && terms > 0) {
            if (rate === 0) monthly = (principal / terms).toFixed(2);
            else {
                const r = (rate / 100) / 12;
                monthly = (principal * (r * Math.pow(1 + r, terms)) / (Math.pow(1 + r, terms) - 1)).toFixed(2);
            }
        }

        const next = new Date();
        next.setMonth(next.getMonth() + 1);

        return {
            ...row,
            monthly_payment: monthly,
            next_payment_date: next.toISOString().split('T')[0],
            terms: terms,
            annual_rate: rate,
            initial_payment: initPct,
            total_debt: cost.toFixed(2)
        };
    });

    await apiSaveTable(tableSelect.value, columns, rows);
});

addRowBtn.addEventListener("click", () => {
    table.addRow(
        {
            created_at: new Date().toISOString()
        },
        false
    );
});

addColumnBtn.addEventListener("click", () => {
    const name = prompt("Enter column name:");
    if (!name || !name.trim()) return;

    const field = name
        .toLowerCase()
        .replace(/\s+/g, "_");

    table.addColumn({
        title: name,
        field: field,
        editor: "input"
    });
});

deleteBtn.addEventListener("click", async () => {
    const rowsToDelete = [];

    table.getRows().forEach(row => {
        const checkbox = row.getElement().querySelector(".row-select");

        if (checkbox && checkbox.checked) {
            rowsToDelete.push(row.getData());
            row.delete();
        }
    });

    await apiDeleteRows(tableSelect.value, rowsToDelete);
});

tableSelect.addEventListener("change", () => {
    loadTable(tableSelect.value);
});

window.addEventListener("DOMContentLoaded", () => {
    loadTable(tableSelect.value);
});