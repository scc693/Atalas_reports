import { formatTime } from './utils.js';

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
});

import { removeFromList } from './utils.js';

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
});

import { isNameInList } from './utils.js';

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
});
