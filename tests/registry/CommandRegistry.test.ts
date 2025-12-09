import { 
    CommandRegistry, 
    MAPPING_COMMAND_TYPES,
    EXECUTOR_COMMAND_TYPES 
} from '../../src/registry/CommandRegistry';
import { CommandType, ParsedCommand } from '../../src/types/commands';
import { ICommandHandler } from '../../src/types/commands';

/**
 * Mock command handler for testing
 */
class MockHandler implements ICommandHandler {
    readonly supportedTypes: CommandType[];
    public handledCommands: ParsedCommand[] = [];
    public cleanupCalled = false;
    private canHandleTypes: CommandType[];

    constructor(supportedTypes: CommandType[], canHandleTypes?: CommandType[]) {
        this.supportedTypes = supportedTypes;
        this.canHandleTypes = canHandleTypes || supportedTypes;
    }

    canHandle(command: ParsedCommand): boolean {
        return this.canHandleTypes.includes(command.type);
    }

    async handle(command: ParsedCommand): Promise<void> {
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

describe('CommandRegistry', () => {
    let registry: CommandRegistry;

    beforeEach(() => {
        registry = new CommandRegistry();
    });

    describe('register', () => {
        it('should register a handler for its supported types', () => {
            const handler = new MockHandler([CommandType.MAP]);
            registry.register(handler);

            expect(registry.hasHandler(CommandType.MAP)).toBe(true);
        });

        it('should register handler for multiple supported types', () => {
            const handler = new MockHandler([CommandType.MAP, CommandType.NMAP, CommandType.IMAP]);
            registry.register(handler);

            expect(registry.hasHandler(CommandType.MAP)).toBe(true);
            expect(registry.hasHandler(CommandType.NMAP)).toBe(true);
            expect(registry.hasHandler(CommandType.IMAP)).toBe(true);
            expect(registry.getRegisteredTypeCount()).toBe(3);
        });

        it('should track unique handlers', () => {
            const handler = new MockHandler([CommandType.MAP, CommandType.NMAP]);
            registry.register(handler);

            // Should only appear once in allHandlers
            expect(registry.getHandlers()).toHaveLength(1);
        });

        it('should allow multiple handlers for the same type', () => {
            const handler1 = new MockHandler([CommandType.MAP]);
            const handler2 = new MockHandler([CommandType.MAP]);

            registry.register(handler1);
            registry.register(handler2);

            expect(registry.getHandlers()).toHaveLength(2);
        });
    });

    describe('unregister', () => {
        it('should remove handler from all its types', () => {
            const handler = new MockHandler([CommandType.MAP, CommandType.NMAP]);
            registry.register(handler);
            registry.unregister(handler);

            expect(registry.hasHandler(CommandType.MAP)).toBe(false);
            expect(registry.hasHandler(CommandType.NMAP)).toBe(false);
            expect(registry.getHandlers()).toHaveLength(0);
        });
    });

    describe('route', () => {
        it('should route command to the correct handler', async () => {
            const mapHandler = new MockHandler([CommandType.MAP]);
            const obcommandHandler = new MockHandler([CommandType.OBCOMMAND]);

            registry.register(mapHandler);
            registry.register(obcommandHandler);

            const command = createMockCommand(CommandType.MAP, ['jk', '<Esc>']);
            await registry.route(command);

            expect(mapHandler.handledCommands).toHaveLength(1);
            expect(mapHandler.handledCommands[0]).toBe(command);
            expect(obcommandHandler.handledCommands).toHaveLength(0);
        });

        it('should use canHandle to find the right handler', async () => {
            const handler1 = new MockHandler([CommandType.MAP], []); // Can't handle anything
            const handler2 = new MockHandler([CommandType.MAP], [CommandType.MAP]);

            registry.register(handler1);
            registry.register(handler2);

            const command = createMockCommand(CommandType.MAP, ['jk', '<Esc>']);
            await registry.route(command);

            expect(handler1.handledCommands).toHaveLength(0);
            expect(handler2.handledCommands).toHaveLength(1);
        });

        it('should log warning when no handler found', async () => {
            // Logger uses console.warn internally, so we spy on it
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            const command = createMockCommand(CommandType.UNKNOWN, []);
            await registry.route(command);

            // Logger formats messages with prefix, so check for the message content
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Vimrc'),
                expect.stringContaining('No handler found')
            );

            consoleSpy.mockRestore();
        });

        it('should isolate errors and not throw', async () => {
            const errorHandler: ICommandHandler = {
                supportedTypes: [CommandType.MAP],
                canHandle: () => true,
                handle: async () => {
                    throw new Error('Test error');
                },
                cleanup: () => {}
            };

            registry.register(errorHandler);

            const command = createMockCommand(CommandType.MAP, ['jk', '<Esc>']);
            
            // Should not throw - error isolation
            await expect(registry.route(command)).resolves.toBeUndefined();
        });
    });

    describe('hasHandler', () => {
        it('should return false for unregistered types', () => {
            expect(registry.hasHandler(CommandType.MAP)).toBe(false);
        });

        it('should return true for registered types', () => {
            registry.register(new MockHandler([CommandType.MAP]));
            expect(registry.hasHandler(CommandType.MAP)).toBe(true);
        });
    });

    describe('getHandlers', () => {
        it('should return empty array when no handlers registered', () => {
            expect(registry.getHandlers()).toEqual([]);
        });

        it('should return all unique handlers', () => {
            const handler1 = new MockHandler([CommandType.MAP]);
            const handler2 = new MockHandler([CommandType.OBCOMMAND]);

            registry.register(handler1);
            registry.register(handler2);

            const handlers = registry.getHandlers();
            expect(handlers).toHaveLength(2);
            expect(handlers).toContain(handler1);
            expect(handlers).toContain(handler2);
        });
    });

    describe('cleanup', () => {
        it('should remove all handlers', () => {
            registry.register(new MockHandler([CommandType.MAP]));
            registry.register(new MockHandler([CommandType.OBCOMMAND]));

            registry.cleanup();

            expect(registry.getHandlers()).toHaveLength(0);
            expect(registry.hasHandler(CommandType.MAP)).toBe(false);
            expect(registry.hasHandler(CommandType.OBCOMMAND)).toBe(false);
        });

        it('should call cleanup on all handlers', () => {
            const handler1 = new MockHandler([CommandType.MAP]);
            const handler2 = new MockHandler([CommandType.OBCOMMAND]);

            registry.register(handler1);
            registry.register(handler2);

            registry.cleanup();

            expect(handler1.cleanupCalled).toBe(true);
            expect(handler2.cleanupCalled).toBe(true);
        });

        it('should call cleanup only once per unique handler', () => {
            const handler = new MockHandler([CommandType.MAP, CommandType.NMAP]);
            let cleanupCount = 0;
            handler.cleanup = () => { cleanupCount++; };

            registry.register(handler);
            registry.cleanup();

            expect(cleanupCount).toBe(1);
        });
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
