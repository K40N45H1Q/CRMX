export const EU_COUNTRIES = [
    "Austria","Belgium","Bulgaria","Croatia","Cyprus",
    "Czech Republic","Denmark","Estonia","Finland","France",
    "Germany","Greece","Hungary","Ireland","Italy",
    "Latvia","Lithuania","Luxembourg","Malta","Netherlands",
    "Poland","Portugal","Romania","Slovakia","Slovenia",
    "Spain","Sweden"
];

export function dateEditor(cell, onRendered, success, cancel) {
    const input = document.createElement("input");
    input.type = "date";
    input.style.width = "100%";

    input.value = cell.getValue() || "";

    onRendered(() => {
        input.focus();
    });

    input.addEventListener("change", () => success(input.value));
    input.addEventListener("blur", () => success(input.value));

    return input;
}