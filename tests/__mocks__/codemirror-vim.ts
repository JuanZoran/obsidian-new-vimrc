/**
 * Mock CodeMirror Vim extension for testing
 */

export function Vim(view: any) {
    return {
        map: function(from: string, to: string, mode: string) {
            // Mock implementation
        },
        noremap: function(from: string, to: string, mode: string) {
            // Mock implementation
        },
        mapclear: function() {
            // Mock implementation
        },
    };
}

export const vim = Vim;
