import { apiLoadTable, getAvailableCars } from "./api.js";
import { applyDefaults } from "./defaults.js";
import { dateEditor, EU_COUNTRIES } from "./editors.js";
import { table } from "./table-core.js";

let AVAILABLE_CARS = [];
let calcInitialized = false;

export async function loadTable(tableName) {
    try {
        const [cars, payload] = await Promise.all([
            getAvailableCars(),
            apiLoadTable(tableName)
        ]);
        AVAILABLE_CARS = Array.isArray(cars) ? cars : [];
        applyDefaults(payload);
        const rawColumns = Array.isArray(payload.columns) ? payload.columns : [];
        const rows = Array.isArray(payload.rows)
            ? payload.rows.map(r => ({
                ...r,
                object: (r.object == null || r.object === "undefined") ? "" : String(r.object)
            }))
            : [];
        let columns = rawColumns.map(normalizeColumn);
        columns = ensureSystemColumns(columns, tableName);
        const finalColumns = columns.map(col => mapColumnProperties(col, tableName));
        table.setColumns(finalColumns);
        table.setData(rows);
        if (!calcInitialized) { setupConditionalCalc(); calcInitialized = true; }
    } catch (error) {
        console.error(`Failed to load table ${tableName}:`, error);
        alert(`Ошибка загрузки таблицы: ${error.message}`);
    }
}

function ensureSystemColumns(columns, tableName) {
    const existing = new Set(columns.map(c => c.field?.toLowerCase()));
    const result = [];
    result.push({ field: "select", title: "Select", width: 70, frozen: true });
    result.push({ field: "status", title: "Status", frozen: true });
    columns.forEach(c => {
        const f = c.field?.toLowerCase();
        if (f !== "select" && f !== "status") result.push(c);
    });
    if (tableName === "users") {
        if (!existing.has("object")) result.push({ field: "object", title: "Object" });
        if (!existing.has("monthly_payment")) result.push({ field: "monthly_payment", title: "Monthly Payment" });
        if (!existing.has("next_payment_date")) result.push({ field: "next_payment_date", title: "Next Payment" });
    }
    return result;
}

function normalizeColumn(column) {
    const raw = column.field || column.title || "";
    return { ...column, field: raw.toString().trim().toLowerCase().replace(/\s+/g, "_").replace("€", "eur") };
}

function mapColumnProperties(column, tableName) {
    const common = { headerMenu: false };
    const f = column.field;
    const title = column.title || f;
    if (title.trim().toLowerCase() === "citizenship") {
        return { ...common, field: f, title: title, editor: "list", editorParams: { values: EU_COUNTRIES, search: true } };
    }
    switch (f) {
        case "select":
            return {
                ...common, field: "select", title: "Select", headerSort: false, editor: false, width: 70, frozen: true,
                formatter: (cell) => {
                    const checked = cell.getRow().getData().select ? 'checked' : '';
                    return `<input type="checkbox" class="row-select" ${checked} style="pointer-events:auto; cursor:pointer;">`;
                },
                cellClick: (e, cell) => {
                    e.preventDefault(); e.stopPropagation();
                    const row = cell.getRow();
                    row.update({ select: !row.getData().select }, true);
                }
            };
        case "status": {
            const values = getStatusValues(tableName);
            return {
                ...common, field: "status", title: "Status", editor: "list", editorParams: { values },
                formatter: cell => values[cell.getValue()] || cell.getValue() || "", frozen: true
            };
        }
        case "object":
            return {
                ...common, field: "object", title: "Object", editor: "list",
                editorParams: () => {
                    const map = {};
                    (window.AVAILABLE_CARS || []).forEach(c => {
                        const v = String(c.value || "").trim();
                        if (v && v !== "null" && v !== "undefined") map[v] = c.label || "Авто";
                    });
                    return { values: map, autocomplete: false, placeholder: "Выберите авто..." };
                },
                formatter: cell => {
                    const rawVal = cell.getValue();
                    const val = String(rawVal || "").trim();
                    const car = window.CARS_CACHE?.[val];
                    if (!val) return "";
                    if (car?.label) return car.label;
                    const fallback = (window.AVAILABLE_CARS || []).find(c => String(c.value) === val);
                    if (fallback?.label) return fallback.label;
                    return val;
                }
            };
        case "monthly_payment":
            return {
                ...common, field: "monthly_payment", title: "Monthly", editor: false, visible: true, hozAlign: "right", width: 120,
                formatter: cell => {
                    let val = cell.getValue();
                    if (val === undefined || val === null) { const row = cell.getRow(); if (row) val = row.getData()?.monthly_payment; }
                    if (val == null || val === "" || val === "0.00" || val === "-" || val === "undefined") return "<span style='opacity:0.5'>-</span>";
                    const num = parseFloat(val);
                    if (isNaN(num)) return `<span style='color:#00FF00'>${String(val)}</span>`;
                    return `<span style='color:#00FF00;font-weight:700'>${num.toFixed(2)} €</span>`;
                }
            };
        case "next_payment_date":
            return {
                ...common, field: "next_payment_date", title: "Next Payment", editor: "input", visible: true, width: 130,
                formatter: cell => {
                    const val = cell.getValue();
                    if (!val) return "-";
                    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
                        const [y, m, d] = val.split("-"); return `${d}.${m}.${y}`;
                    }
                    return String(val);
                }
            };
        case "total_debt": case "initial_payment": case "annual_rate": case "terms":
            return { ...common, field: f, title: title, visible: false, editor: false };
        case "expiry_date":
            return {
                ...common, field: "expiry_date", title: "Expiry Date", editor: dateEditor,
                formatter: cell => {
                    const val = cell.getValue();
                    if (!val) return "—";
                    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
                        const [y, m, d] = val.split("-"); return `${d}.${m}.${y}`;
                    }
                    return String(val);
                },
                editorParams: { mask: "9999-99-99" }
            };
        default:
            return { ...column, ...common, editor: "input", mutatorEdit: value => typeof value === "string" ? value.trim() : value };
    }
}

function getStatusValues(tableName) {
    return {
        users: { paid: "Paid 🟢", pending: "Pending 🟡", overdue: "Overdue 🔴" },
        cars: { available: "Available 🟢", busy: "Busy 🔴" }
    }[tableName] || {};
}

if (table) {
    table.on("cellEdited", cell => {
        if (cell.getField() === "object") triggerCalc();
    });
}

(function setupSearch() {
    const inp = document.querySelector('input[placeholder="Search..."]');
    if (!inp || typeof table === "undefined") return;
    let timer;
    const debounce = (fn, ms) => (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
    const filter = debounce(val => {
        const term = val.trim().toLowerCase();
        if (!term) { table.clearFilter(); return; }
        table.setFilter(data => Object.entries(data).some(([k, v]) => !["id", "_id", "created_at", "select"].includes(k) && String(v).toLowerCase().includes(term)));
    }, 200);
    inp.addEventListener("input", e => filter(e.target.value));
})();

function setupConditionalCalc() {
    const inputs = document.querySelectorAll('.math input');
    if (inputs.length < 3) return;

    const calcAndApply = () => {
        const terms = parseInt(inputs[0].value) || 0;
        const rate = parseFloat(inputs[1].value) || 0;
        const initPct = parseFloat(inputs[2].value) || 0;
        const filled = inputs[0].value && inputs[1].value && inputs[2].value;

        if (!filled || typeof table === 'undefined') return;

        try {
            table.getRows().forEach(row => {
                const data = row.getData();
                const car = window.CARS_CACHE?.[data.object];
                if (!data.object || !car) return;

                const cost = car.cost_eur;
                const principal = cost - (cost * initPct / 100);
                let monthly = "-";

                if (principal > 0 && terms > 0) {
                    if (rate === 0) {
                        monthly = (principal / terms).toFixed(2);
                    } else {
                        const r = (rate / 100) / 12;
                        monthly = (principal * (r * Math.pow(1 + r, terms)) / (Math.pow(1 + r, terms) - 1)).toFixed(2);
                    }
                }

                const next = new Date();
                next.setMonth(next.getMonth() + 1);

                row.update({
                    monthly_payment: monthly,
                    next_payment_date: next.toISOString().split('T')[0]
                }, true);
            });
        } catch (e) {}
    };

    inputs.forEach(inp => inp.addEventListener('input', calcAndApply));
    table.on('dataLoaded', calcAndApply);
    setTimeout(calcAndApply, 150);
}

window.triggerCalc = setupConditionalCalc;

window.refreshObjectColumn = function() {
    setTimeout(() => { if (typeof table !== "undefined" && table) table.redraw(true); }, 100);
};

window.loadTable = loadTable;
window.getAvailableCarsCache = () => [...AVAILABLE_CARS];