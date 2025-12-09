/**
 * Unit tests for VimrcParser
 */

import { VimrcParser } from '../../src/parser/VimrcParser';
import { CommandType } from '../../src/types';

describe('VimrcParser', () => {
    let parser: VimrcParser;

    beforeEach(() => {
        parser = new VimrcParser();
    });

    describe('Basic Parsing', () => {
        it('should parse empty content', () => {
            const result = parser.parse('');
            expect(result.commands).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
        });

        it('should skip empty lines', () => {
            const result = parser.parse('\n\n\n');
            expect(result.commands).toHaveLength(0);
        });

        it('should skip comment lines', () => {
            const result = parser.parse('" This is a comment\n" Another comment');
            expect(result.commands).toHaveLength(0);
        });

        it('should parse nmap command', () => {
            const result = parser.parse('nmap j gj');
            expect(result.commands).toHaveLength(1);
            expect(result.commands[0].type).toBe(CommandType.NMAP);
            expect(result.commands[0].args).toEqual(['j', 'gj']);
        });

        it('should parse multiple commands', () => {
            const vimrc = `
nmap j gj
nmap k gk
imap jk <Esc>
            `.trim();
            const result = parser.parse(vimrc);
            expect(result.commands).toHaveLength(3);
        });
    });

    describe('Command Types', () => {
        it('should recognize map command', () => {
            const result = parser.parse('map a b');
            expect(result.commands[0].type).toBe(CommandType.MAP);
        });

        it('should recognize nmap command', () => {
            const result = parser.parse('nmap a b');
            expect(result.commands[0].type).toBe(CommandType.NMAP);
        });

        it('should recognize imap command', () => {
            const result = parser.parse('imap a b');
            expect(result.commands[0].type).toBe(CommandType.IMAP);
        });

        it('should recognize vmap command', () => {
            const result = parser.parse('vmap a b');
            expect(result.commands[0].type).toBe(CommandType.VMAP);
        });

        it('should recognize noremap command', () => {
            const result = parser.parse('noremap a b');
            expect(result.commands[0].type).toBe(CommandType.NOREMAP);
        });

        it('should recognize nnoremap command', () => {
            const result = parser.parse('nnoremap a b');
            expect(result.commands[0].type).toBe(CommandType.NNOREMAP);
        });

        it('should recognize let command', () => {
            const result = parser.parse('let mapleader = " "');
            expect(result.commands[0].type).toBe(CommandType.LET);
        });
    });

    describe('Inline Comments', () => {
        it('should handle inline comments', () => {
            const result = parser.parse('nmap j gj " move down visually');
            expect(result.commands).toHaveLength(1);
            expect(result.commands[0].args).toEqual(['j', 'gj']);
        });
    });

    describe('Leader Key Support', () => {
        it('should parse let mapleader command', () => {
            const result = parser.parse('let mapleader = " "');
            expect(result.commands).toHaveLength(1);
            expect(result.commands[0].type).toBe(CommandType.LET);
            expect(parser.getVariable('leader')).toBe(' ');
        });

        it('should substitute <leader> in mappings', () => {
            const vimrc = `let mapleader = ","
nmap <leader>w :w<CR>`;
            const result = parser.parse(vimrc);
            expect(result.commands).toHaveLength(2);
            // The second command should have <leader> replaced with ,
            expect(result.commands[1].args[0]).toBe(',w');
        });

        it('should handle leader with space', () => {
            const vimrc = `let mapleader = " "
nmap <leader>f :find`;
            const result = parser.parse(vimrc);
            expect(result.commands[1].args[0]).toBe(' f');
        });

        it('should handle leader without spaces around equals', () => {
            const result = parser.parse('let mapleader=","');
            expect(parser.getVariable('leader')).toBe(',');
        });
    });

    describe('Error Handling and Warnings', () => {
        it('should generate warning for unknown commands', () => {
            const result = parser.parse('unknowncommand arg1 arg2');
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0].message).toContain('Unknown command');
            expect(result.warnings[0].lineNumber).toBe(1);
        });

        it('should continue parsing after unknown command', () => {
            const vimrc = `unknowncommand arg1
nmap j gj
anotherUnknown test`;
            const result = parser.parse(vimrc);
            expect(result.warnings).toHaveLength(2);
            expect(result.commands).toHaveLength(3); // All commands including unknown
            expect(result.commands[1].type).toBe(CommandType.NMAP);
        });

        it('should track line numbers correctly', () => {
            const vimrc = `" comment
nmap j gj

unknowncommand test`;
            const result = parser.parse(vimrc);
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0].lineNumber).toBe(4);
        });

        it('should provide summary of parse results', () => {
            const vimrc = `nmap j gj
unknowncommand test
imap jk <Esc>`;
            const result = parser.parse(vimrc);
            const summary = parser.getSummary(result);
            expect(summary).toContain('2 mapping(s)');
            expect(summary).toContain('1 warning(s)');
        });

        it('should handle empty file gracefully', () => {
            const result = parser.parse('');
            expect(result.commands).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
            expect(result.warnings).toHaveLength(0);
        });

        it('should handle file with only comments', () => {
            const vimrc = `" This is a comment
" Another comment
" Yet another`;
            const result = parser.parse(vimrc);
            expect(result.commands).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
        });
    });
});
