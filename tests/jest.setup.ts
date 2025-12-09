/**
 * Jest setup file
 */

// Mock localStorage
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
};

global.localStorage = localStorageMock as any;

// Mock document if needed
if (typeof document === 'undefined') {
    (global as any).document = {
        createElement: jest.fn(() => ({
            style: {},
        })),
    };
}
