/**
 * Basic setup test to verify Jest and fast-check are working
 */

import fc from 'fast-check';

describe('Test Setup', () => {
    it('should run basic Jest test', () => {
        expect(true).toBe(true);
    });

    it('should run basic fast-check property test', () => {
        fc.assert(
            fc.property(fc.integer(), (n) => {
                return n === n;
            })
        );
    });
});
