// api.js

/**
 * Загрузка данных таблицы
 */
export async function apiLoadTable(tableName) {
    try {
        const response = await fetch(`/api/${tableName}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Failed to load table ${tableName}:`, error);
        throw error;
    }
}

/**
 * Сохранение данных таблицы
 */
export async function apiSaveTable(tableName, tableColumns, tableRows) {
    try {
        const response = await fetch(`/api/${tableName}/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                columns: tableColumns, 
                rows: tableRows 
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Save failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log("Save successful:", result);
        return result;
        
    } catch (error) {
        console.error(`Failed to save table ${tableName}:`, error);
        alert(`Ошибка сохранения: ${error.message}`);
        throw error;
    }
}

/**
 * Удаление строк
 */
export async function apiDeleteRows(tableName, rowsToDelete) {
    if (!rowsToDelete || rowsToDelete.length === 0) return;

    try {
        const response = await fetch(`/api/${tableName}/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: rowsToDelete })
        });

        if (!response.ok) {
            throw new Error(`Delete failed: ${response.status}`);
        }

        const result = await response.json();
        console.log("Delete successful:", result);
        return result;

    } catch (error) {
        console.error(`Failed to delete rows from ${tableName}:`, error);
        alert(`Ошибка удаления: ${error.message}`);
        throw error;
    }
}

/**
 * Получение списка доступных машин для выпадающего списка
 * Заполняет window.CARS_CACHE и window.AVAILABLE_CARS
 */
/**
 * Получение списка машин:
 * - Кэширует ВСЕ машины (для отображения названий и расчёта)
 * - Возвращает только доступные (для выпадающего списка)
 */
export async function getAvailableCars() {
    try {
        const res = await fetch("/api/cars");
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data.rows)) return [];

        // 🔑 Кэшируем ВСЕ машины (независимо от статуса)
        window.CARS_CACHE = {};
        data.rows.forEach(car => {
            const id = String(car.id || "").trim();
            if (id) {
                window.CARS_CACHE[id] = {
                    label: `${car.brand || ""} ${car.model || ""}`.trim() || "Авто",
                    value: id,
                    cost_eur: parseFloat(car.cost_eur) || 0,
                    status: car.status // сохраняем статус для возможной логики
                };
            }
        });

        // 🔑 Для редактора возвращаем ТОЛЬКО доступные
        const availableList = Object.values(window.CARS_CACHE)
            .filter(c => String(c.status || "").toLowerCase().includes("available"));
        
        window.AVAILABLE_CARS = availableList;
        
        if (typeof window.refreshObjectColumn === 'function') {
            window.refreshObjectColumn();
        }
        
        return availableList;
    } catch (e) {
        console.error("❌ getAvailableCars error:", e);
        return [];
    }
}