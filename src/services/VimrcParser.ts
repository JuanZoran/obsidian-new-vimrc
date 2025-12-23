import { CommandType, ParsedCommand, ParseResult, ParseError, ParseWarning } from '../types';

/**
 * Parser for vimrc configuration files
 */
export class VimrcParser {
    private variables: Map<string, string>;

    constructor() {
        this.variables = new Map();
    }

    /**
     * Parse vimrc file content
     */
    parse(content: string): ParseResult {
        const commands: ParsedCommand[] = [];
        const errors: ParseError[] = [];
        const warnings: ParseWarning[] = [];

        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const lineNumber = i + 1;
            const line = lines[i].trim();

            // Skip empty lines
            if (line.length === 0) {
                continue;
            }

            // Skip comment lines
            if (line.startsWith('"')) {
                continue;
            }

            try {
                const command = this.parseLine(line, lineNumber);
                if (command.type !== CommandType.COMMENT) {
                    // Generate warning for unknown commands
                    if (command.type === CommandType.UNKNOWN) {
                        const cmdName = line.split(/\s+/)[0];
                        warnings.push({
                            lineNumber,
                            message: `Unknown command: ${cmdName}`,
                            raw: line
                        });
                        // Still add the command so it can be tracked
                        commands.push(command);
                        continue;
                    }
                    
                    // Process let commands to store variables
                    if (command.type === CommandType.LET) {
                        this.processLetCommand(command);
                    }
                    commands.push(command);
                }
            } catch (error) {
                errors.push({
                    lineNumber,
                    message: error instanceof Error ? error.message : String(error),
                    raw: line
                });
            }
        }

        return { commands, errors, warnings };
    }

    /**
     * Get summary of parse results
     */
    getSummary(result: ParseResult): string {
        const successCount = result.commands.filter(c => c.type !== CommandType.UNKNOWN).length;
        const warningCount = result.warnings.length;
        const errorCount = result.errors.length;
        
        let summary = `Loaded ${successCount} mapping(s)`;
        if (warningCount > 0) {
            summary += `, ${warningCount} warning(s)`;
        }
        if (errorCount > 0) {
            summary += `, ${errorCount} error(s)`;
        }
        return summary;
    }

    /**
     * Parse a single line from vimrc
     */
    private parseLine(line: string, lineNumber: number): ParsedCommand {
        // Remove inline comments - find " that's preceded by whitespace
        const cleanLine = this.removeInlineComment(line);

        if (cleanLine.length === 0) {
            return {
                type: CommandType.COMMENT,
                args: [],
                lineNumber,
                raw: line
            };
        }

        const { command, args } = this.extractCommand(cleanLine);

        // Determine command type
        const commandUpper = command.toUpperCase();
        let type: CommandType;

        switch (commandUpper) {
            case 'MAP':
                type = CommandType.MAP;
                break;
            case 'NMAP':
                type = CommandType.NMAP;
                break;
            case 'IMAP':
                type = CommandType.IMAP;
                break;
            case 'VMAP':
                type = CommandType.VMAP;
                break;
            case 'OMAP':
                type = CommandType.OMAP;
                break;
            case 'NOREMAP':
                type = CommandType.NOREMAP;
                break;
            case 'NNOREMAP':
                type = CommandType.NNOREMAP;
                break;
            case 'INOREMAP':
                type = CommandType.INOREMAP;
                break;
            case 'VNOREMAP':
                type = CommandType.VNOREMAP;
                break;
            case 'ONOREMAP':
                type = CommandType.ONOREMAP;
                break;
            case 'OBCOMMAND':
                type = CommandType.OBCOMMAND;
                break;
            case 'EXMAP':
                type = CommandType.EXMAP;
                break;
            // obmap commands - direct mapping to Obsidian commands
            case 'OBMAP':
                type = CommandType.OBMAP;
                break;
            case 'NOBMAP':
                type = CommandType.NOBMAP;
                break;
            case 'IOBMAP':
                type = CommandType.IOBMAP;
                break;
            case 'VOBMAP':
                type = CommandType.VOBMAP;
                break;
            // unmap commands
            case 'UNMAP':
                type = CommandType.UNMAP;
                break;
            case 'NUNMAP':
                type = CommandType.NUNMAP;
                break;
            case 'IUNMAP':
                type = CommandType.IUNMAP;
                break;
            case 'VUNMAP':
                type = CommandType.VUNMAP;
                break;
            case 'LET':
                type = CommandType.LET;
                break;
            default:
                type = CommandType.UNKNOWN;
        }

        // Substitute variables in args
        const substitutedArgs = args.map(arg => this.substituteVariables(arg));

        return {
            type,
            args: substitutedArgs,
            lineNumber,
            raw: line
        };
    }

    /**
     * Extract command and arguments from a line
     */
    private extractCommand(line: string): { command: string; args: string[] } {
        const parts = line.split(/\s+/);
        const command = parts[0];
        const args = parts.slice(1);

        return { command, args };
    }

    /**
     * Remove inline comment from a line
     * Inline comments start with " preceded by whitespace
     * We need to be careful to preserve quoted string values
     */
    private removeInlineComment(line: string): string {
        // Track if we're inside a quoted string
        let inQuote = false;
        let quoteChar = '';
        let commentStart = -1;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const prevChar = i > 0 ? line[i - 1] : '';
            
            // Handle quote characters - only start quote after = sign
            if ((char === '"' || char === "'") && !inQuote) {
                // Check if this is a string start (preceded by =)
                // Look back to find if there's an = before this quote
                const beforeQuote = line.substring(0, i).trim();
                if (beforeQuote.endsWith('=')) {
                    inQuote = true;
                    quoteChar = char;
                    continue;
                }
            } else if (char === quoteChar && inQuote) {
                inQuote = false;
                quoteChar = '';
                continue;
            }
            
            // If we're not in a quote and we see " preceded by whitespace, it's a comment
            if (!inQuote && char === '"' && (prevChar === ' ' || prevChar === '\t')) {
                commentStart = i;
                break;
            }
        }
        
        if (commentStart > 0) {
            return line.substring(0, commentStart).trim();
        }
        
        return line.trim();
    }

    /**
     * Substitute variables in text (e.g., <leader>)
     */
    private substituteVariables(text: string): string {
        let result = text;

        // Replace variables from the variables map
        this.variables.forEach((value, key) => {
            const placeholder = `<${key}>`;
            result = result.replace(new RegExp(placeholder, 'g'), value);
        });

        return result;
    }

    /**
     * Process a let command and store the variable
     * Handles formats like:
     * - let mapleader = " "
     * - let mapleader=" "
     * - let mapleader = ","
     */
    private processLetCommand(command: ParsedCommand): void {
        const args = command.args;
        if (args.length === 0) {
            return;
        }

        // Join args and parse the assignment
        const assignmentStr = args.join(' ');
        
        // Match patterns like: varname = "value" or varname="value" or varname = value
        // Use a more careful regex that captures content inside quotes including spaces
        const quotedMatch = assignmentStr.match(/^(\w+)\s*=\s*["'](.*)["']$/);
        const unquotedMatch = assignmentStr.match(/^(\w+)\s*=\s*(\S+)$/);
        
        const match = quotedMatch || unquotedMatch;
        if (match) {
            const varName = match[1];
            const varValue = match[2];
            
            // Handle special case for mapleader
            if (varName === 'mapleader') {
                this.variables.set('leader', varValue);
            }
            
            // Store the variable with its original name too
            this.variables.set(varName, varValue);
        }
    }

    /**
     * Store a variable (e.g., from let command)
     */
    setVariable(name: string, value: string): void {
        this.variables.set(name, value);
    }

    /**
     * Get a variable value
     */
    getVariable(name: string): string | undefined {
        return this.variables.get(name);
    }

    /**
     * Clear all variables
     */
    clearVariables(): void {
        this.variables.clear();
    }
}
