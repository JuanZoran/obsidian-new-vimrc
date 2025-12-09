/**
 * Integration tests for VimrcPlugin
 * Tests the complete load-parse-apply flow
 * 
 * Requirements:
 * - 6.4: Components communicate through well-defined interfaces
 */

import { VimrcParser } from '../../src/parser/VimrcParser';
import { KeyMapper } from '../../src/mapper/KeyMapper';
import { CommandExecutor } from '../../src/executor/CommandExecutor';
import { CommandRegistry, createConfiguredRegistry } from '../../src/registry/CommandRegistry';
import { ErrorHandler, ErrorSeverity } from '../../src/errors/ErrorHandler';
import { DEFAULT_SETTINGS, VimrcSettings, CommandType, VimMode, HandlerContext } from '../../src/types';

// Mock Obsidian App
const mockApp = {
    commands: {
        commands: {
            'editor:follow-link': { id: 'editor:follow-link', name: 'Follow link' },
            'app:go-back': { id: 'app:go-back', name: 'Go back' }
        },
        executeCommandById: jest.fn().mockResolvedValue(true)
    },
    vault: {
        getAbstractFileByPath: jest.fn(),
        read: jest.fn()
    }
};

describe('VimrcPlugin Integration', () => {
    let parser: VimrcParser;
    let keyMapper: KeyMapper;
    let commandExecutor: CommandExecutor;
    let registry: CommandRegistry;
    let errorHandler: ErrorHandler;
    let settings: VimrcSettings;

    beforeEach(() => {
        jest.clearAllMocks();
        settings = { ...DEFAULT_SETTINGS };
        
        // Initialize all components
        parser = new VimrcParser();
        keyMapper = new KeyMapper();
        commandExecutor = new CommandExecutor(mockApp as any);
        registry = createConfiguredRegistry(keyMapper, commandExecutor);
        errorHandler = new ErrorHandler(settings);
    });

    afterEach(() => {
        keyMapper.clearMappings();
        commandExecutor.cleanup();
        parser.clearVariables();
        errorHandler.clearErrorLog();
    });

    describe('Complete load-parse-apply flow', () => {
        it('should parse and apply a simple vimrc configuration', async () => {
            const vimrcContent = `
" This is a comment
nmap j gj
nmap k gk
imap jk <Esc>
`;
            // Parse
            const result = parser.parse(vimrcContent);
            
            // Verify parsing
            expect(result.errors).toHaveLength(0);
            expect(result.warnings).toHaveLength(0);
            expect(result.commands.filter(c => c.type !== CommandType.COMMENT)).toHaveLength(3);

            // Apply through registry
            const context: HandlerContext = {
                plugin: { applyMappingToVim: jest.fn() },
                settings
            };

            for (const command of result.commands) {
                if (command.type !== CommandType.COMMENT && command.type !== CommandType.UNKNOWN) {
                    await registry.execute(command, context);
                }
            }

            // Verify mappings were created
            expect(keyMapper.getMappingCount()).toBe(3);
            
            const mappings = keyMapper.getMappings();
            expect(mappings[0].source).toBe('j');
            expect(mappings[0].target).toBe('gj');
            expect(mappings[0].mode).toBe(VimMode.NORMAL);
        });


        it('should handle leader key substitution across components', async () => {
            const vimrcContent = `
let mapleader = " "
nmap <leader>w :w<CR>
nmap <leader>q :q<CR>
`;
            // Parse
            const result = parser.parse(vimrcContent);
            
            expect(result.errors).toHaveLength(0);
            
            // Apply through registry
            const context: HandlerContext = {
                plugin: { applyMappingToVim: jest.fn() },
                settings
            };

            for (const command of result.commands) {
                if (command.type !== CommandType.COMMENT && 
                    command.type !== CommandType.UNKNOWN &&
                    command.type !== CommandType.LET) {
                    await registry.execute(command, context);
                }
            }

            // Verify leader was substituted
            const mappings = keyMapper.getMappings();
            expect(mappings).toHaveLength(2);
            expect(mappings[0].source).toBe(' w'); // Space + w
            expect(mappings[1].source).toBe(' q'); // Space + q
        });

        it('should handle exmap commands with obcommand', async () => {
            const vimrcContent = `
exmap followLink obcommand editor:follow-link
exmap back obcommand app:go-back
`;
            // Parse
            const result = parser.parse(vimrcContent);
            
            expect(result.errors).toHaveLength(0);
            
            // Apply through registry
            const context: HandlerContext = {
                plugin: {},
                settings
            };

            for (const command of result.commands) {
                if (command.type !== CommandType.COMMENT && command.type !== CommandType.UNKNOWN) {
                    await registry.execute(command, context);
                }
            }

            // Verify exmaps were registered
            expect(commandExecutor.getExmapCount()).toBe(2);
            expect(commandExecutor.getExmapDefinition('followLink')).toBeDefined();
            expect(commandExecutor.getExmapDefinition('back')).toBeDefined();
        });

        it('should handle mixed commands in a realistic vimrc', async () => {
            const vimrcContent = `
" Vimrc configuration for Obsidian
let mapleader = ","

" Basic navigation
nmap j gj
nmap k gk

" Quick escape
imap jk <Esc>

" Obsidian commands
exmap followLink obcommand editor:follow-link
nmap gf :followLink<CR>

" Visual mode
vmap < <gv
vmap > >gv
`;
            // Parse
            const result = parser.parse(vimrcContent);
            
            expect(result.errors).toHaveLength(0);
            
            // Apply through registry
            const context: HandlerContext = {
                plugin: { applyMappingToVim: jest.fn() },
                settings
            };

            for (const command of result.commands) {
                if (command.type !== CommandType.COMMENT && 
                    command.type !== CommandType.UNKNOWN &&
                    command.type !== CommandType.LET) {
                    await registry.execute(command, context);
                }
            }

            // Verify all mappings
            expect(keyMapper.getMappingCount()).toBe(6);
            expect(commandExecutor.getExmapCount()).toBe(1);
        });
    });

    describe('Error handling integration', () => {
        it('should collect errors and warnings through ErrorHandler', () => {
            const vimrcContent = `
nmap j gj
unknowncommand foo bar
nmap k gk
`;
            // Parse
            const result = parser.parse(vimrcContent);
            
            // Handle through ErrorHandler
            errorHandler.handleParseWarnings(result.warnings);
            
            expect(result.warnings).toHaveLength(1);
            expect(errorHandler.hasWarnings()).toBe(true);
            expect(errorHandler.getErrorCount(ErrorSeverity.WARNING)).toBe(1);
        });

        it('should continue processing after encountering unknown commands', async () => {
            const vimrcContent = `
nmap j gj
badcommand test
nmap k gk
`;
            // Parse
            const result = parser.parse(vimrcContent);
            
            // Should have 2 valid commands + 1 unknown
            const validCommands = result.commands.filter(c => c.type !== CommandType.UNKNOWN);
            expect(validCommands).toHaveLength(2);
            
            // Apply valid commands
            const context: HandlerContext = {
                plugin: { applyMappingToVim: jest.fn() },
                settings
            };

            for (const command of result.commands) {
                if (command.type !== CommandType.COMMENT && command.type !== CommandType.UNKNOWN) {
                    await registry.execute(command, context);
                }
            }

            // Both valid mappings should be applied
            expect(keyMapper.getMappingCount()).toBe(2);
        });
    });

    describe('Component cleanup', () => {
        it('should properly cleanup all components', async () => {
            const vimrcContent = `
let mapleader = " "
nmap <leader>w :w<CR>
exmap test obcommand editor:follow-link
`;
            // Parse and apply
            const result = parser.parse(vimrcContent);
            const context: HandlerContext = {
                plugin: { applyMappingToVim: jest.fn() },
                settings
            };

            for (const command of result.commands) {
                if (command.type !== CommandType.COMMENT && 
                    command.type !== CommandType.UNKNOWN &&
                    command.type !== CommandType.LET) {
                    await registry.execute(command, context);
                }
            }

            // Verify state before cleanup
            expect(keyMapper.getMappingCount()).toBe(1);
            expect(commandExecutor.getExmapCount()).toBe(1);
            expect(parser.getVariable('leader')).toBe(' ');

            // Cleanup all components
            keyMapper.clearMappings();
            commandExecutor.cleanup();
            parser.clearVariables();

            // Verify state after cleanup
            expect(keyMapper.getMappingCount()).toBe(0);
            expect(commandExecutor.getExmapCount()).toBe(0);
            expect(parser.getVariable('leader')).toBeUndefined();
        });
    });

    describe('Registry routing', () => {
        it('should route commands to correct handlers', async () => {
            const context: HandlerContext = {
                plugin: { applyMappingToVim: jest.fn() },
                settings
            };

            // Test mapping commands go to KeyMapper
            const nmapCommand = {
                type: CommandType.NMAP,
                args: ['j', 'gj'],
                lineNumber: 1,
                raw: 'nmap j gj'
            };
            await registry.execute(nmapCommand, context);
            expect(keyMapper.getMappingCount()).toBe(1);

            // Test exmap commands go to CommandExecutor
            const exmapCommand = {
                type: CommandType.EXMAP,
                args: ['test', 'obcommand', 'editor:follow-link'],
                lineNumber: 2,
                raw: 'exmap test obcommand editor:follow-link'
            };
            await registry.execute(exmapCommand, context);
            expect(commandExecutor.getExmapCount()).toBe(1);
        });

        it('should handle all mapping command types', async () => {
            const context: HandlerContext = {
                plugin: { applyMappingToVim: jest.fn() },
                settings
            };

            const commandTypes = [
                { type: CommandType.MAP, expectedMode: VimMode.ALL },
                { type: CommandType.NMAP, expectedMode: VimMode.NORMAL },
                { type: CommandType.IMAP, expectedMode: VimMode.INSERT },
                { type: CommandType.VMAP, expectedMode: VimMode.VISUAL },
                { type: CommandType.NOREMAP, expectedMode: VimMode.ALL },
                { type: CommandType.NNOREMAP, expectedMode: VimMode.NORMAL },
                { type: CommandType.INOREMAP, expectedMode: VimMode.INSERT },
                { type: CommandType.VNOREMAP, expectedMode: VimMode.VISUAL }
            ];

            for (let i = 0; i < commandTypes.length; i++) {
                const { type, expectedMode } = commandTypes[i];
                const command = {
                    type,
                    args: [`key${i}`, `target${i}`],
                    lineNumber: i + 1,
                    raw: `${type} key${i} target${i}`
                };
                await registry.execute(command, context);
            }

            expect(keyMapper.getMappingCount()).toBe(8);
            
            const mappings = keyMapper.getMappings();
            for (let i = 0; i < commandTypes.length; i++) {
                expect(mappings[i].mode).toBe(commandTypes[i].expectedMode);
            }
        });
    });
});
