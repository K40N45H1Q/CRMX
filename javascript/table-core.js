export let table = new Tabulator("#table", {
    movableColumns: true, // ✅ Включает перетаскивание заголовков
    layout: "fitColumns",
    resizableColumns: false,
    height: "500px",
    placeholder: "NO RECORD",
    columns: []
});