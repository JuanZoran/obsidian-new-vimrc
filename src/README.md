# Vimrc Plugin Source Code Structure

This directory contains the core implementation of the Vimrc plugin for Obsidian.

## Directory Structure

```
src/
├── types.ts                    # Core type definitions and interfaces
├── index.ts                    # Main exports
├── parser/
│   └── VimrcParser.ts         # Parses vimrc file content
├── mapper/
│   └── KeyMapper.ts           # Handles key mapping commands
├── executor/
│   └── CommandExecutor.ts    # Executes Obsidian commands
├── settings/
│   └── SettingsManager.ts    # Manages plugin settings
└── registry/
    └── CommandRegistry.ts    # Routes commands to handlers
```

## Core Components

### Types (`types.ts`)
Defines all TypeScript interfaces and enums used throughout the plugin:
- `CommandType`: Enum of supported vimrc commands
- `VimMode`: Vim editing modes (normal, insert, visual, all)
- `ParsedCommand`: Represents a parsed vimrc command
- `ParseResult`: Result of parsing a vimrc file
- `MappingConfig`: Configuration for a key mapping
- `VimrcSettings`: Plugin settings interface
- `CommandHandler`: Interface for command handlers

### Parser (`parser/VimrcParser.ts`)
Parses vimrc file content into structured commands:
- Recognizes command types (map, nmap, imap, etc.)
- Handles comments and empty lines
- Supports variable substitution (e.g., `<leader>`)
- Provides error reporting with line numbers

### Mapper (`mapper/KeyMapper.ts`)
Handles key mapping commands:
- Processes all mapping command types
- Parses special key sequences
- Determines mode and recursion settings
- Integrates with CodeMirror Vim

### Executor (`executor/CommandExecutor.ts`)
Executes Obsidian commands:
- Handles `obcommand` and `exmap` directives
- Validates command IDs
- Provides error handling for command execution

### Settings (`settings/SettingsManager.ts`)
Manages plugin configuration:
- Loads and saves settings
- Provides settings UI tab
- Handles vimrc path, notifications, and debug mode

### Registry (`registry/CommandRegistry.ts`)
Routes commands to appropriate handlers:
- Registers command handlers
- Dispatches commands based on type
- Manages handler lifecycle

## Testing

Tests are located in the `tests/` directory at the project root:
- Unit tests for individual components
- Property-based tests using fast-check
- Mock implementations for Obsidian and CodeMirror APIs

Run tests with:
```bash
npm test
```

## Development

The plugin follows these principles:
- **Modular architecture**: Clear separation of concerns
- **Extensibility**: Easy to add new command types
- **Type safety**: Full TypeScript coverage
- **Testability**: Comprehensive test coverage
