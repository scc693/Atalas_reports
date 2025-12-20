/**
 * Formats a time string (HH:MM) to 12-hour format with AM/PM.
 * @param {string} timeStr - The time string in "HH:MM" format.
 * @returns {string} - The formatted time string (e.g., "08:30 AM").
 */
export function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hour, minute] = timeStr.split(':');
    const h = parseInt(hour);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minute} ${ampm}`;
}

/**
 * Removes an item from a list (array of strings) by value.
 * @param {string[]} list - The list to filter.
 * @param {string} itemToRemove - The item to remove.
 * @returns {string[]} - A new list with the item removed.
 */
export function removeFromList(list, itemToRemove) {
    if (!list) return [];
    return list.filter(item => item !== itemToRemove);
}

/**
 * Checks if a name exists in a list of objects (where each object has a 'name' property).
 * @param {Array<{name: string}>} list - The list of objects.
 * @param {string} nameToCheck - The name to search for.
 * @returns {boolean} - True if found.
 */
export function isNameInList(list, nameToCheck) {
    if (!list || !nameToCheck) return false;
    return list.some(item => item.name === nameToCheck);
}
