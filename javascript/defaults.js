export let statusValues = {};

export function applyDefaults(data) {
    statusValues = data?.defaults?.status || {};
}
