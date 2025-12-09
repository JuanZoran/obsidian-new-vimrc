import { 
    CommandRegistry, 
    createConfiguredRegistry,
    MAPPING_COMMAND_TYPES,
    EXECUTOR_COMMAND_TYPES 
} from '../../src/registry/CommandRegistry';
import { 
    CommandType, 
    ParsedCommand, 
    HandlerContext, 
    CommandHandler,
    VimrcSettings,
    DEFAULT_SETTINGS
} from '../../src/types';

/**
 * Mock command handler for testing
 */
class MockHandler implements CommandHandler {
    readonly commandType: CommandType;
    public handledCommands: ParsedCommand[] = [];
    public cleanupCalled = false;
    private canHandleTypes: CommandType[];

    constructor(commandType: CommandType, canHandleTypes?: CommandType[]) {
        this.commandType = commandType;
        this.canHandleTypes = canHandleTypes || [commandType];
    }

    canHandle(command: ParsedCommand): boolean {
        return this.canHandleTypes.includes(command.type);
    }

    async handle(command: ParsedCommand, context: HandlerContext): Promise<void> {
        this.handledCommands.push(command);
    }

    cleanup(): void {
        this.cleanupCalled = true;
    }
}

/**
 * Create a mock parsed command
 */
function createMockCommand(type: CommandType, args: string[] = []): ParsedCommand {
    return {
        type,
        args,
        lineNumber: 1,
        raw: `${type} ${args.join(' ')}`
    };
}

/**
 * Create a mock handler context
 */
function createMockContext(): HandlerContext {
    return {
        plugin: {},
        settings: { ...DEFAULT_SETTINGS }
    };
}

describe('CommandRegistry', () => {
    let registry: CommandRegistry;

    beforeEach(() => {
        registry = new CommandRegistry();
    });

    describe('register', () => {
        it('should register a handler for a command type', () => {
            const handler = new MockHandler(CommandType.MAP);
            registry.register(CommandType.MAP, handler);

            expect(registry.hasHandler(CommandType.MAP)).toBe(true);
            expect(registry.getHandlersForType(CommandType.MAP)).toContain(handler);
        });

        it('should allow multiple handlers for the same command type', () => {
            const handler1 = new MockHandler(CommandType.MAP);
            const handler2 = new MockHandler(CommandType.MAP);

            registry.register(CommandType.MAP, handler1);
            registry.register(CommandType.MAP, handler2);

            const handlers = registry.getHandlersForType(CommandType.MAP);
            expect(handlers).toHaveLength(2);
            expect(handlers).toContain(handler1);
            expect(handlers).toContain(handler2);
        });

        it('should track unique handlers', () => {
            const handler = new MockHandler(CommandType.MAP);
            
            // Register same handler for multiple types
            registry.register(CommandType.MAP, handler);
            registry.register(CommandType.NMAP, handler);

            // Should only appear once in allHandlers
            expect(registry.getHandlers()).toHaveLength(1);
        });
    });

    describe('registerForTypes', () => {
        it('should register a handler for multiple command types', () => {
            const handler = new MockHandler(CommandType.MAP, [
                CommandType.MAP,
                CommandType.NMAP,
                CommandType.IMAP
            ]);

            registry.registerForTypes(
                [CommandType.MAP, CommandType.NMAP, CommandType.IMAP],
                handler
            );

            expect(registry.hasHandler(CommandType.MAP)).toBe(true);
            expect(registry.hasHandler(CommandType.NMAP)).toBe(true);
            expect(registry.hasHandler(CommandType.IMAP)).toBe(true);
            expect(registry.getRegisteredTypeCount()).toBe(3);
        });
    });

    describe('execute', () => {
        it('should route command to the correct handler', async () => {
            const mapHandler = new MockHandler(CommandType.MAP);
            const obcommandHandler = new MockHandler(CommandType.OBCOMMAND);

            registry.register(CommandType.MAP, mapHandler);
            registry.register(CommandType.OBCOMMAND, obcommandHandler);

            const command = createMockCommand(CommandType.MAP, ['jk', '<Esc>']);
            await registry.execute(command, createMockContext());

            expect(mapHandler.handledCommands).toHaveLength(1);
            expect(mapHandler.handledCommands[0]).toBe(command);
            expect(obcommandHandler.handledCommands).toHaveLength(0);
        });

        it('should use canHandle to find the right handler', async () => {
            const handler1 = new MockHandler(CommandType.MAP, []); // Can't handle anything
            const handler2 = new MockHandler(CommandType.MAP, [CommandType.MAP]);

            registry.register(CommandType.MAP, handler1);
            registry.register(CommandType.MAP, handler2);

            const command = createMockCommand(CommandType.MAP, ['jk', '<Esc>']);
            await registry.execute(command, createMockContext());

            expect(handler1.handledCommands).toHaveLength(0);
            expect(handler2.handledCommands).toHaveLength(1);
        });

        it('should log warning when no handler found', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            const command = createMockCommand(CommandType.UNKNOWN, []);
            await registry.execute(command, createMockContext());

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('No handler found')
            );

            consoleSpy.mockRestore();
        });

        it('should propagate errors from handlers', async () => {
            const errorHandler: CommandHandler = {
                commandType: CommandType.MAP,
                canHandle: () => true,
                handle: async () => {
                    throw new Error('Test error');
                }
            };

            registry.register(CommandType.MAP, errorHandler);

            const command = createMockCommand(CommandType.MAP, ['jk', '<Esc>']);
            
            await expect(registry.execute(command, createMockContext()))
                .rejects.toThrow('Test error');
        });
    });

    describe('hasHandler', () => {
        it('should return false for unregistered types', () => {
            expect(registry.hasHandler(CommandType.MAP)).toBe(false);
        });

        it('should return true for registered types', () => {
            registry.register(CommandType.MAP, new MockHandler(CommandType.MAP));
            expect(registry.hasHandler(CommandType.MAP)).toBe(true);
        });
    });

    describe('getHandlers', () => {
        it('should return empty array when no handlers registered', () => {
            expect(registry.getHandlers()).toEqual([]);
        });

        it('should return all unique handlers', () => {
            const handler1 = new MockHandler(CommandType.MAP);
            const handler2 = new MockHandler(CommandType.OBCOMMAND);

            registry.register(CommandType.MAP, handler1);
            registry.register(CommandType.OBCOMMAND, handler2);

            const handlers = registry.getHandlers();
            expect(handlers).toHaveLength(2);
            expect(handlers).toContain(handler1);
            expect(handlers).toContain(handler2);
        });
    });

    describe('clear', () => {
        it('should remove all handlers', () => {
            registry.register(CommandType.MAP, new MockHandler(CommandType.MAP));
            registry.register(CommandType.OBCOMMAND, new MockHandler(CommandType.OBCOMMAND));

            registry.clear();

            expect(registry.getHandlers()).toHaveLength(0);
            expect(registry.hasHandler(CommandType.MAP)).toBe(false);
            expect(registry.hasHandler(CommandType.OBCOMMAND)).toBe(false);
        });

        it('should call cleanup on all handlers', () => {
            const handler1 = new MockHandler(CommandType.MAP);
            const handler2 = new MockHandler(CommandType.OBCOMMAND);

            registry.register(CommandType.MAP, handler1);
            registry.register(CommandType.OBCOMMAND, handler2);

            registry.clear();

            expect(handler1.cleanupCalled).toBe(true);
            expect(handler2.cleanupCalled).toBe(true);
        });

        it('should call cleanup only once per unique handler', () => {
            const handler = new MockHandler(CommandType.MAP, [
                CommandType.MAP,
                CommandType.NMAP
            ]);
            let cleanupCount = 0;
            handler.cleanup = () => { cleanupCount++; };

            registry.register(CommandType.MAP, handler);
            registry.register(CommandType.NMAP, handler);

            registry.clear();

            expect(cleanupCount).toBe(1);
        });
    });
});

describe('createConfiguredRegistry', () => {
    it('should create registry with KeyMapper registered for mapping types', () => {
        const keyMapper = new MockHandler(CommandType.MAP, MAPPING_COMMAND_TYPES);
        const commandExecutor = new MockHandler(CommandType.OBCOMMAND, EXECUTOR_COMMAND_TYPES);

        const registry = createConfiguredRegistry(keyMapper, commandExecutor);

        // Check all mapping types are registered
        for (const type of MAPPING_COMMAND_TYPES) {
            expect(registry.hasHandler(type)).toBe(true);
            expect(registry.getHandlersForType(type)).toContain(keyMapper);
        }
    });

    it('should create registry with CommandExecutor registered for executor types', () => {
        const keyMapper = new MockHandler(CommandType.MAP, MAPPING_COMMAND_TYPES);
        const commandExecutor = new MockHandler(CommandType.OBCOMMAND, EXECUTOR_COMMAND_TYPES);

        const registry = createConfiguredRegistry(keyMapper, commandExecutor);

        // Check executor types are registered
        for (const type of EXECUTOR_COMMAND_TYPES) {
            expect(registry.hasHandler(type)).toBe(true);
            expect(registry.getHandlersForType(type)).toContain(commandExecutor);
        }
    });

    it('should route commands to correct handlers', async () => {
        const keyMapper = new MockHandler(CommandType.MAP, MAPPING_COMMAND_TYPES);
        const commandExecutor = new MockHandler(CommandType.OBCOMMAND, EXECUTOR_COMMAND_TYPES);

        const registry = createConfiguredRegistry(keyMapper, commandExecutor);
        const context = createMockContext();

        // Test mapping command
        const mapCommand = createMockCommand(CommandType.NMAP, ['jk', '<Esc>']);
        await registry.execute(mapCommand, context);
        expect(keyMapper.handledCommands).toHaveLength(1);

        // Test executor command
        const obCommand = createMockCommand(CommandType.OBCOMMAND, ['editor:save']);
        await registry.execute(obCommand, context);
        expect(commandExecutor.handledCommands).toHaveLength(1);
    });
});

describe('MAPPING_COMMAND_TYPES', () => {
    it('should include all mapping command types', () => {
        expect(MAPPING_COMMAND_TYPES).toContain(CommandType.MAP);
        expect(MAPPING_COMMAND_TYPES).toContain(CommandType.NMAP);
        expect(MAPPING_COMMAND_TYPES).toContain(CommandType.IMAP);
        expect(MAPPING_COMMAND_TYPES).toContain(CommandType.VMAP);
        expect(MAPPING_COMMAND_TYPES).toContain(CommandType.NOREMAP);
        expect(MAPPING_COMMAND_TYPES).toContain(CommandType.NNOREMAP);
        expect(MAPPING_COMMAND_TYPES).toContain(CommandType.INOREMAP);
        expect(MAPPING_COMMAND_TYPES).toContain(CommandType.VNOREMAP);
    });
});

describe('EXECUTOR_COMMAND_TYPES', () => {
    it('should include obcommand and exmap', () => {
        expect(EXECUTOR_COMMAND_TYPES).toContain(CommandType.OBCOMMAND);
        expect(EXECUTOR_COMMAND_TYPES).toContain(CommandType.EXMAP);
    });
});
