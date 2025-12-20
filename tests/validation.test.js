import { validateIncidentForm } from '../utils.js';

describe('validateIncidentForm', () => {
    test('returns valid when all fields are present', () => {
        const data = {
            date: '2023-10-27',
            project: 'Project A',
            foreman: 'John Doe',
            description: 'Accident happened.',
            hasSignature: true
        };
        const result = validateIncidentForm(data);
        expect(result.valid).toBe(true);
    });

    test('returns invalid when date is missing', () => {
        const data = {
            project: 'Project A',
            foreman: 'John Doe',
            description: 'Accident happened.',
            hasSignature: true
        };
        const result = validateIncidentForm(data);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Please select a date.');
    });

    test('returns invalid when project is missing', () => {
        const data = {
            date: '2023-10-27',
            foreman: 'John Doe',
            description: 'Accident happened.',
            hasSignature: true
        };
        const result = validateIncidentForm(data);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Please enter a project.');
    });

    test('returns invalid when signature is missing', () => {
        const data = {
            date: '2023-10-27',
            project: 'Project A',
            foreman: 'John Doe',
            description: 'Accident happened.',
            hasSignature: false
        };
        const result = validateIncidentForm(data);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Please sign the report.');
    });
});
