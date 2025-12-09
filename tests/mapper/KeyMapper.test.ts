/**
 * Unit tests for KeyMapper
 */

import { KeyMapper } from '../../src/mapper/KeyMapper';
import { CommandType, VimMode, ParsedCommand, HandlerContext, DEFAULT_SETTINGS } from '../../src/types';

describe('KeyMapper', () => {
    let keyMapper: KeyMapper;
    let mockContext: HandlerContext;

    beforeEach(() => {
        keyMapper = new KeyMapper();
        mockContext = {
            plugin: null,
            settings: { ...DEFAULT_SETTINGS }
        };
    });

    describe('canHandle', () => {
        it('should handle map command', () => {
            const command: ParsedCommand = {
                type: CommandType.MAP,
                args: ['a', 'b'],
                lineNumber: 1,
                raw: 'map a b'
            };
            expect(keyMapper.canHandle(command)).toBe(true);
        });

        it('should handle nmap command', () => {
            const command: ParsedCommand = {
                type: CommandType.NMAP,
                args: ['j', 'gj'],
                lineNumber: 1,
                raw: 'nmap j gj'
            };
            expect(keyMapper.canHandle(command)).toBe(true);
        });

        it('should handle all mapping command types', () => {
            const mappingTypes = [
                CommandType.MAP,
                CommandType.NMAP,
                CommandType.IMAP,
                CommandType.VMAP,
                CommandType.NOREMAP,
                CommandType.NNOREMAP,
                CommandType.INOREMAP,
                CommandType.VNOREMAP
            ];

            mappingTypes.forEach(type => {
                const command: ParsedCommand = {
                    type,
                    args: ['a', 'b'],
                    lineNumber: 1,
                    raw: `${type} a b`
                };
                expect(keyMapper.canHandle(command)).toBe(true);
            });
        });

        it('should not handle non-mapping commands', () => {
            const command: ParsedCommand = {
                type: CommandType.OBCOMMAND,
                args: ['editor:follow-link'],
                lineNumber: 1,
                raw: 'obcommand editor:follow-link'
            };
            expect(keyMapper.canHandle(command)).toBe(false);
        });
    });

    describe('getModeFromCommandType', () => {
        it('should return NORMAL for nmap', () => {
            expect(keyMapper.getModeFromCommandType(CommandType.NMAP)).toBe(VimMode.NORMAL);
        });

        it('should return NORMAL for nnoremap', () => {
            expect(keyMapper.getModeFromCommandType(CommandType.NNOREMAP)).toBe(VimMode.NORMAL);
        });

        it('should return INSERT for imap', () => {
            expect(keyMapper.getModeFromCommandType(CommandType.IMAP)).toBe(VimMode.INSERT);
        });

        it('should return INSERT for inoremap', () => {
            expect(keyMapper.getModeFromCommandType(CommandType.INOREMAP)).toBe(VimMode.INSERT);
        });

        it('should return VISUAL for vmap', () => {
            expect(keyMapper.getModeFromCommandType(CommandType.VMAP)).toBe(VimMode.VISUAL);
        });

        it('should return VISUAL for vnoremap', () => {
            expect(keyMapper.getModeFromCommandType(CommandType.VNOREMAP)).toBe(VimMode.VISUAL);
        });

        it('should return ALL for map', () => {
            expect(keyMapper.getModeFromCommandType(CommandType.MAP)).toBe(VimMode.ALL);
        });

        it('should return ALL for noremap', () => {
            expect(keyMapper.getModeFromCommandType(CommandType.NOREMAP)).toBe(VimMode.ALL);
        });
    });

    describe('isRecursiveMapping', () => {
        it('should return true for map', () => {
            expect(keyMapper.isRecursiveMapping(CommandType.MAP)).toBe(true);
        });

        it('should return true for nmap', () => {
            expect(keyMapper.isRecursiveMapping(CommandType.NMAP)).toBe(true);
        });

        it('should return true for imap', () => {
            expect(keyMapper.isRecursiveMapping(CommandType.IMAP)).toBe(true);
        });

        it('should return true for vmap', () => {
            expect(keyMapper.isRecursiveMapping(CommandType.VMAP)).toBe(true);
        });

        it('should return false for noremap', () => {
            expect(keyMapper.isRecursiveMapping(CommandType.NOREMAP)).toBe(false);
        });

        it('should return false for nnoremap', () => {
            expect(keyMapper.isRecursiveMapping(CommandType.NNOREMAP)).toBe(false);
        });

        it('should return false for inoremap', () => {
            expect(keyMapper.isRecursiveMapping(CommandType.INOREMAP)).toBe(false);
        });

        it('should return false for vnoremap', () => {
            expect(keyMapper.isRecursiveMapping(CommandType.VNOREMAP)).toBe(false);
        });
    });


    describe('parseKeySequence', () => {
        // Special keys are now preserved in Vim notation for CodeMirror Vim API
        it('should preserve <CR> in Vim notation', () => {
            expect(keyMapper.parseKeySequence(':w<CR>')).toBe(':w<CR>');
        });

        it('should preserve <Esc> in Vim notation', () => {
            expect(keyMapper.parseKeySequence('<Esc>')).toBe('<Esc>');
        });

        it('should preserve <Space> in Vim notation', () => {
            expect(keyMapper.parseKeySequence('<Space>w')).toBe('<Space>w');
        });

        it('should preserve <Tab> in Vim notation', () => {
            expect(keyMapper.parseKeySequence('<Tab>')).toBe('<Tab>');
        });

        it('should preserve case of special keys', () => {
            expect(keyMapper.parseKeySequence('<cr>')).toBe('<cr>');
            expect(keyMapper.parseKeySequence('<CR>')).toBe('<CR>');
            expect(keyMapper.parseKeySequence('<Cr>')).toBe('<Cr>');
        });

        it('should replace <leader> with leader key', () => {
            keyMapper.setLeaderKey(',');
            expect(keyMapper.parseKeySequence('<leader>w')).toBe(',w');
        });

        it('should preserve multiple special keys', () => {
            expect(keyMapper.parseKeySequence(':w<CR><Esc>')).toBe(':w<CR><Esc>');
        });

        it('should preserve regular characters', () => {
            expect(keyMapper.parseKeySequence('jk')).toBe('jk');
        });

        it('should preserve control keys in Vim notation', () => {
            expect(keyMapper.parseKeySequence('<C-a>')).toBe('<C-a>');
            expect(keyMapper.parseKeySequence('<C-w>')).toBe('<C-w>');
            expect(keyMapper.parseKeySequence('<C-u>')).toBe('<C-u>');
        });
    });

    describe('parseMapping', () => {
        it('should parse simple mapping', () => {
            const command: ParsedCommand = {
                type: CommandType.NMAP,
                args: ['j', 'gj'],
                lineNumber: 1,
                raw: 'nmap j gj'
            };
            const config = keyMapper.parseMapping(command);
            expect(config.from).toBe('j');
            expect(config.to).toBe('gj');
            expect(config.mode).toBe(VimMode.NORMAL);
            expect(config.recursive).toBe(true);
        });

        it('should parse mapping with special keys (preserved)', () => {
            const command: ParsedCommand = {
                type: CommandType.IMAP,
                args: ['jk', '<Esc>'],
                lineNumber: 1,
                raw: 'imap jk <Esc>'
            };
            const config = keyMapper.parseMapping(command);
            expect(config.from).toBe('jk');
            expect(config.to).toBe('<Esc>');
            expect(config.mode).toBe(VimMode.INSERT);
        });

        it('should parse non-recursive mapping', () => {
            const command: ParsedCommand = {
                type: CommandType.NNOREMAP,
                args: ['j', 'gj'],
                lineNumber: 1,
                raw: 'nnoremap j gj'
            };
            const config = keyMapper.parseMapping(command);
            expect(config.recursive).toBe(false);
        });

        it('should throw error for invalid mapping', () => {
            const command: ParsedCommand = {
                type: CommandType.NMAP,
                args: ['j'],
                lineNumber: 1,
                raw: 'nmap j'
            };
            expect(() => keyMapper.parseMapping(command)).toThrow();
        });

        it('should join multiple args as target', () => {
            const command: ParsedCommand = {
                type: CommandType.NMAP,
                args: ['<leader>w', ':w', '<CR>'],
                lineNumber: 1,
                raw: 'nmap <leader>w :w <CR>'
            };
            keyMapper.setLeaderKey(' ');
            const config = keyMapper.parseMapping(command);
            expect(config.from).toBe(' w');
            expect(config.to).toBe(':w <CR>');
        });

        it('should parse mapping with control keys', () => {
            const command: ParsedCommand = {
                type: CommandType.NOREMAP,
                args: ['I', '<C-u>zz'],
                lineNumber: 1,
                raw: 'noremap I <C-u>zz'
            };
            const config = keyMapper.parseMapping(command);
            expect(config.from).toBe('I');
            expect(config.to).toBe('<C-u>zz');
            expect(config.mode).toBe(VimMode.ALL);
            expect(config.recursive).toBe(false);
        });
    });

    describe('handle', () => {
        it('should add mapping to list', async () => {
            const command: ParsedCommand = {
                type: CommandType.NMAP,
                args: ['j', 'gj'],
                lineNumber: 1,
                raw: 'nmap j gj'
            };
            await keyMapper.handle(command, mockContext);
            expect(keyMapper.getMappingCount()).toBe(1);
        });

        it('should handle multiple mappings', async () => {
            const commands: ParsedCommand[] = [
                { type: CommandType.NMAP, args: ['j', 'gj'], lineNumber: 1, raw: 'nmap j gj' },
                { type: CommandType.NMAP, args: ['k', 'gk'], lineNumber: 2, raw: 'nmap k gk' },
                { type: CommandType.IMAP, args: ['jk', '<Esc>'], lineNumber: 3, raw: 'imap jk <Esc>' }
            ];
            
            for (const cmd of commands) {
                await keyMapper.handle(cmd, mockContext);
            }
            
            expect(keyMapper.getMappingCount()).toBe(3);
        });
    });

    describe('getMappings', () => {
        it('should return all mappings', async () => {
            const command: ParsedCommand = {
                type: CommandType.NMAP,
                args: ['j', 'gj'],
                lineNumber: 1,
                raw: 'nmap j gj'
            };
            await keyMapper.handle(command, mockContext);
            
            const mappings = keyMapper.getMappings();
            expect(mappings).toHaveLength(1);
            expect(mappings[0].source).toBe('j');
            expect(mappings[0].target).toBe('gj');
            expect(mappings[0].mode).toBe(VimMode.NORMAL);
        });

        it('should return a copy of mappings', async () => {
            const command: ParsedCommand = {
                type: CommandType.NMAP,
                args: ['j', 'gj'],
                lineNumber: 1,
                raw: 'nmap j gj'
            };
            await keyMapper.handle(command, mockContext);
            
            const mappings1 = keyMapper.getMappings();
            const mappings2 = keyMapper.getMappings();
            expect(mappings1).not.toBe(mappings2);
        });
    });

    describe('getMappingsForMode', () => {
        it('should return mappings for specific mode', async () => {
            const commands: ParsedCommand[] = [
                { type: CommandType.NMAP, args: ['j', 'gj'], lineNumber: 1, raw: 'nmap j gj' },
                { type: CommandType.IMAP, args: ['jk', '<Esc>'], lineNumber: 2, raw: 'imap jk <Esc>' },
                { type: CommandType.VMAP, args: ['<', '<gv'], lineNumber: 3, raw: 'vmap < <gv' }
            ];
            
            for (const cmd of commands) {
                await keyMapper.handle(cmd, mockContext);
            }
            
            const normalMappings = keyMapper.getMappingsForMode(VimMode.NORMAL);
            expect(normalMappings).toHaveLength(1);
            expect(normalMappings[0].source).toBe('j');
        });

        it('should include ALL mode mappings', async () => {
            const commands: ParsedCommand[] = [
                { type: CommandType.MAP, args: ['a', 'b'], lineNumber: 1, raw: 'map a b' },
                { type: CommandType.NMAP, args: ['j', 'gj'], lineNumber: 2, raw: 'nmap j gj' }
            ];
            
            for (const cmd of commands) {
                await keyMapper.handle(cmd, mockContext);
            }
            
            const normalMappings = keyMapper.getMappingsForMode(VimMode.NORMAL);
            expect(normalMappings).toHaveLength(2);
        });
    });

    describe('clearMappings', () => {
        it('should clear all mappings', async () => {
            const command: ParsedCommand = {
                type: CommandType.NMAP,
                args: ['j', 'gj'],
                lineNumber: 1,
                raw: 'nmap j gj'
            };
            await keyMapper.handle(command, mockContext);
            expect(keyMapper.getMappingCount()).toBe(1);
            
            keyMapper.clearMappings();
            expect(keyMapper.getMappingCount()).toBe(0);
        });
    });

    describe('removeMapping', () => {
        it('should remove mapping by ID', async () => {
            const command: ParsedCommand = {
                type: CommandType.NMAP,
                args: ['j', 'gj'],
                lineNumber: 1,
                raw: 'nmap j gj'
            };
            await keyMapper.handle(command, mockContext);
            
            const mappings = keyMapper.getMappings();
            const id = mappings[0].id;
            
            const result = keyMapper.removeMapping(id);
            expect(result).toBe(true);
            expect(keyMapper.getMappingCount()).toBe(0);
        });

        it('should return false for non-existent ID', () => {
            const result = keyMapper.removeMapping('non-existent');
            expect(result).toBe(false);
        });
    });

    describe('leader key', () => {
        it('should use default leader key', () => {
            expect(keyMapper.getLeaderKey()).toBe('\\');
        });

        it('should set and get leader key', () => {
            keyMapper.setLeaderKey(',');
            expect(keyMapper.getLeaderKey()).toBe(',');
        });

        it('should use leader key in mappings', async () => {
            keyMapper.setLeaderKey(',');
            const command: ParsedCommand = {
                type: CommandType.NMAP,
                args: ['<leader>w', ':w<CR>'],
                lineNumber: 1,
                raw: 'nmap <leader>w :w<CR>'
            };
            await keyMapper.handle(command, mockContext);
            
            const mappings = keyMapper.getMappings();
            expect(mappings[0].source).toBe(',w');
        });
    });

    describe('cleanup', () => {
        it('should clear all mappings on cleanup', async () => {
            const command: ParsedCommand = {
                type: CommandType.NMAP,
                args: ['j', 'gj'],
                lineNumber: 1,
                raw: 'nmap j gj'
            };
            await keyMapper.handle(command, mockContext);
            
            keyMapper.cleanup();
            expect(keyMapper.getMappingCount()).toBe(0);
        });
    });
});
