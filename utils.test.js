import { formatTime, removeFromList, isNameInList } from './utils.js';

describe('formatTime', () => {
    test('formats morning time correctly', () => {
        expect(formatTime('08:00')).toBe('8:00 AM');
    });

    test('formats afternoon time correctly', () => {
        expect(formatTime('16:30')).toBe('4:30 PM');
    });

    test('formats noon correctly', () => {
        expect(formatTime('12:00')).toBe('12:00 PM');
    });

    test('formats midnight correctly', () => {
        expect(formatTime('00:00')).toBe('12:00 AM');
    });

    test('returns empty string for null/undefined input', () => {
        expect(formatTime(null)).toBe('');
        expect(formatTime(undefined)).toBe('');
    });

    test('preserves leading zeros in minutes', () => {
        expect(formatTime('09:05')).toBe('9:05 AM');
    });

    test('handles late-night times', () => {
        expect(formatTime('23:59')).toBe('11:59 PM');
    });
});

describe('removeFromList', () => {
    test('removes item from list', () => {
        const list = ['Alice', 'Bob', 'Charlie'];
        const result = removeFromList(list, 'Bob');
        expect(result).toEqual(['Alice', 'Charlie']);
    });

    test('returns same list if item not found', () => {
        const list = ['Alice', 'Bob'];
        const result = removeFromList(list, 'Charlie');
        expect(result).toEqual(['Alice', 'Bob']);
    });

    test('handles empty list', () => {
        expect(removeFromList([], 'Bob')).toEqual([]);
    });

    test('handles null list', () => {
        expect(removeFromList(null, 'Bob')).toEqual([]);
    });

    test('does not mutate the original list', () => {
        const list = ['Alice', 'Bob'];
        removeFromList(list, 'Bob');
        expect(list).toEqual(['Alice', 'Bob']);
    });
});

describe('isNameInList', () => {
    test('returns true if name exists', () => {
        const list = [{ name: 'Alice' }, { name: 'Bob' }];
        expect(isNameInList(list, 'Alice')).toBe(true);
    });

    test('returns false if name does not exist', () => {
        const list = [{ name: 'Alice' }, { name: 'Bob' }];
        expect(isNameInList(list, 'Charlie')).toBe(false);
    });

    test('case sensitive check', () => {
        const list = [{ name: 'Alice' }];
        expect(isNameInList(list, 'alice')).toBe(false);
    });

    test('handles empty list', () => {
        expect(isNameInList([], 'Alice')).toBe(false);
    });

    test('handles null/undefined inputs', () => {
        expect(isNameInList(null, 'Alice')).toBe(false);
        expect(isNameInList([], null)).toBe(false);
    });

    test('returns false when objects lack a name property', () => {
        const list = [{ title: 'Alice' }, { name: 'Bob' }];
        expect(isNameInList(list, 'Alice')).toBe(false);
    });
});
