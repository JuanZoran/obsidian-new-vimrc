# Vimrc Plugin Source Code Structure

This directory contains the core implementation of the Vimrc plugin for Obsidian.

## Architecture Overview

The plugin follows a layered, event-driven architecture with dependency injection:

```
┌─────────────────────────────────────────────────────────────┐
│                      VimrcPlugin (main.ts)                  │
│                    (Lifecycle & Bootstrap)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     ServiceContainer                         │
│              (Dependency Injection & Wiring)                │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   EventBus    │    │ ConfigManager │    │  ErrorHandler │
│   (Events)    │    │  (Settings)   │    │   (Errors)    │
└───────────────┘    └───────────────┘    └───────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  FileWatcher  │    │ VimrcLoader   │    │  VimAdapter   │
│ (File Events) │    │  (Load/Parse) │    │  (Vim API)    │
└───────────────┘    └───────────────┘    └───────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     CommandRegistry                          │
│                   (Handler Routing)                          │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ MappingHandler│    │ ObmapHandler  │    │ ExmapHandler  │
│  (map/nmap)   │    │  (obmap)      │    │   (exmap)     │
└───────────────┘    └───────────────┘    └───────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      MappingStore                            │
│                  (Mapping Storage)                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     MappingApplier                           │
│              (Apply via VimAdapter)                          │
└─────────────────────────────────────────────────────────────┘
```

## Design Principles

1. **Single Responsibility** - Each module handles one clear function
2. **Dependency Inversion** - High-level modules depend on abstractions, not implementations
3. **Open/Closed Principle** - Open for extension, closed for modification
4. **Event-Driven** - Components communicate through events to reduce coupling

## Directory Structure

```
src/
├── index.ts                      # Main exports
├── types.ts                      # Legacy type definitions (deprecated)
├── types/
│   ├── index.ts                  # Type exports
│   ├── commands.ts               # Command-related types
│   ├── events.ts                 # Event type definitions
│   ├── mappings.ts               # Mapping-related types
│   ├── services.ts               # Service interface types
│   └── settings.ts               # Settings types
├── core/
│   ├── ServiceContainer.ts       # Dependency injection container
│   └── EventBus.ts               # Event bus for component communication
├── infrastructure/
│   ├── ConfigManager.ts          # Configuration management
│   └── ErrorHandler.ts           # Error handling and recovery
├── services/
│   ├── VimAdapter.ts             # CodeMirror Vim API adapter
│   ├── VimrcLoader.ts            # Vimrc file loading coordinator
│   └── VimrcParser.ts            # Vimrc file parser
├── handlers/
│   ├── index.ts                  # Handler exports
│   ├── BaseHandler.ts            # Abstract base handler
│   ├── MappingHandler.ts         # map/nmap/imap/vmap commands
│   ├── ObmapHandler.ts           # obmap commands
│   ├── ExmapHandler.ts           # exmap/obcommand commands
│   ├── AmapHandler.ts            # amap commands
│   └── LetHandler.ts             # let commands (variables)
├── stores/
│   └── MappingStore.ts           # Mapping data storage
├── appliers/
│   └── MappingApplier.ts         # Apply mappings to Vim
├── registry/
│   └── CommandRegistry.ts        # Command routing registry
├── settings/
│   └── SettingsManager.ts        # Settings management (legacy)
└── ui/
    └── SettingsTab.ts            # Settings UI tab
```

## Core Components

### ServiceContainer (`core/ServiceContainer.ts`)

Dependency injection container that manages service creation and lifecycle:
- Registers services with factory functions
- Supports singleton and transient services
- Provides lazy initialization
- Detects circular dependencies

### EventBus (`core/EventBus.ts`)

Type-safe event bus for component communication:
- Supports typed events with payloads
- Provides sync and async event emission
- Manages subscriptions with unsubscribe functions
- Clears all subscriptions on cleanup

### ConfigManager (`infrastructure/ConfigManager.ts`)

Reactive configuration management:
- Loads and saves plugin settings
- Emits settings-changed events
- Validates settings against schema
- Provides default values for missing settings

### ErrorHandler (`infrastructure/ErrorHandler.ts`)

Comprehensive error handling:
- Categorizes errors by severity and type
- Implements recovery strategies
- Aggregates errors for batch operations
- Emits error events through EventBus

### VimAdapter (`services/VimAdapter.ts`)

Adapter layer for CodeMirror Vim API:
- Isolates all Vim API interactions
- Provides clean interfaces for mappings, motions, actions, ex commands
- Queues operations when API is unavailable
- Exposes typed interface matching Vim capabilities

### VimrcLoader (`services/VimrcLoader.ts`)

Coordinates vimrc file loading:
- Detects vimrc file location
- Coordinates parsing and command execution
- Provides load results with error reporting

### VimrcParser (`services/VimrcParser.ts`)

Parses vimrc file content:
- Recognizes all supported command types
- Handles comments and empty lines
- Supports variable substitution
- Reports errors with line numbers

### CommandRegistry (`registry/CommandRegistry.ts`)

Routes commands to appropriate handlers:
- Registers command handlers
- Routes commands based on type
- Isolates handler errors
- Emits error events without crashing

### Command Handlers (`handlers/`)

Pluggable command handlers:
- **MappingHandler**: Handles map, nmap, imap, vmap, noremap variants, unmap commands
- **ObmapHandler**: Handles obmap commands for Obsidian-specific mappings
- **ExmapHandler**: Handles exmap and obcommand for ex commands
- **AmapHandler**: Handles amap commands
- **LetHandler**: Handles let commands for variable assignment

### MappingStore (`stores/MappingStore.ts`)

Stores mapping configurations:
- CRUD operations for mappings
- Query by mode, source, or target
- Emits mapping events through EventBus

### MappingApplier (`appliers/MappingApplier.ts`)

Applies stored mappings to Vim:
- Reads from MappingStore
- Applies via VimAdapter
- Detects and reports conflicts

## Event Types

The system uses typed events for communication:

- **File Events**: `file:changed`, `file:created`, `file:deleted`
- **Settings Events**: `settings:changed`
- **Vimrc Events**: `vimrc:loading`, `vimrc:loaded`, `vimrc:error`
- **Mapping Events**: `mapping:added`, `mapping:removed`, `mapping:applied`, `mappings:cleared`
- **Error Events**: `error:occurred`, `error:recovered`

## Testing

Tests are located in the `tests/` directory at the project root:

```
tests/
├── unit/           # Unit tests for individual components
├── property/       # Property-based tests using fast-check
├── integration/    # Integration tests
├── mocks/          # Mock implementations
└── factories/      # Test data factories
```

Run tests with:
```bash
npm test
```

## Adding New Command Types

To add a new command type:

1. Create a new handler in `handlers/` extending `BaseHandler`
2. Implement `supportedTypes`, `canHandle()`, and `handle()` methods
3. Register the handler in the ServiceContainer bootstrap
4. The CommandRegistry will automatically route commands to your handler

Example:
```typescript
export class MyCommandHandler extends BaseHandler {
  readonly supportedTypes = [CommandType.MY_COMMAND];
  
  canHandle(command: ParsedCommand): boolean {
    return command.type === CommandType.MY_COMMAND;
  }
  
  async handle(command: ParsedCommand): Promise<void> {
    // Handle the command
  }
}
```
