# Vimrc Support Plugin - API Documentation

This document describes the public API that other Obsidian plugins can use to extend Vim functionality.

## Getting the Plugin Instance

```typescript
// In your plugin's onload() method
const vimrcPlugin = this.app.plugins.plugins['vimrc-support'] as any;

// Check if the plugin is available
if (!vimrcPlugin) {
    console.warn('Vimrc Support plugin is not installed');
    return;
}
```

## Types

```typescript
interface CmPos {
    line: number;  // 0-indexed line number
    ch: number;    // 0-indexed character position
}

interface MotionArgs {
    repeat?: number;           // Number of times to repeat (e.g., 3w)
    forward?: boolean;         // Direction of motion
    selectedCharacter?: string; // Character for f/t motions
    linewise?: boolean;        // Whether motion is linewise
    inclusive?: boolean;       // Whether motion is inclusive
}
```

## Motion API

### defineMotion(name, callback)

Define a custom motion that can be used with operators (d, c, y, etc.).

```typescript
vimrcPlugin.defineMotion('nextHeading', (cm, head, motionArgs) => {
    const doc = cm.getDoc();
    let line = head.line + 1;
    const repeat = motionArgs.repeat || 1;
    let found = 0;
    
    while (line < doc.lineCount() && found < repeat) {
        if (doc.getLine(line).startsWith('#')) {
            found++;
            if (found === repeat) {
                return { line, ch: 0 };
            }
        }
        line++;
    }
    return head; // No heading found, stay in place
});
```

**Parameters:**
- `name: string` - Unique name for the motion
- `callback: (cm, head, motionArgs, vim) => CmPos` - Function that returns the new cursor position

**Returns:** `boolean` - true if successful

### mapMotion(keys, motionName, args?)

Map a key sequence to a defined motion.

```typescript
vimrcPlugin.mapMotion('gh', 'nextHeading');
vimrcPlugin.mapMotion('gH', 'nextHeading', { forward: false });
```

**Parameters:**
- `keys: string` - Key sequence (e.g., 'gh', '<C-n>')
- `motionName: string` - Name of the motion (must be defined first)
- `args?: MotionArgs` - Optional motion arguments

**Returns:** `boolean` - true if successful

**Usage after mapping:**
- `gh` - Move to next heading
- `dgh` - Delete to next heading
- `cgh` - Change to next heading
- `ygh` - Yank to next heading
- `3gh` - Move to 3rd next heading

---

## Async Motion API

For interactive motions that require user input (like EasyMotion/flash-jump).

### defineAsyncMotion(name, callback)

Define an async motion for interactive cursor movement.

```typescript
vimrcPlugin.defineAsyncMotion('flashJump', async (cm, vim, operatorPending) => {
    // Show visual hints
    const hints = await showJumpHints(cm);
    
    // Wait for user selection
    const selected = await waitForUserInput(hints);
    
    if (selected) {
        return { line: selected.line, ch: selected.ch };
    }
    return null; // Cancel - stay in place
});
```

**Parameters:**
- `name: string` - Unique name for the async motion
- `callback: (cm, vim, operatorPending) => Promise<CmPos | null>` - Async function
  - `cm` - CodeMirror instance
  - `vim` - Vim state object
  - `operatorPending: boolean` - true if an operator (d, c, y) is waiting

**Returns:** `boolean` - true if successful

### mapAsyncMotion(keys, motionName, contexts?)

Map a key sequence to an async motion.

```typescript
// Map to normal and visual modes (default)
vimrcPlugin.mapAsyncMotion('s', 'flashJump');

// Map to specific modes
vimrcPlugin.mapAsyncMotion('s', 'flashJump', ['normal']);
vimrcPlugin.mapAsyncMotion('<C-s>', 'flashJump', ['normal', 'visual', 'insert']);
```

**Parameters:**
- `keys: string` - Key sequence
- `motionName: string` - Name of the async motion
- `contexts?: ('normal' | 'visual' | 'insert')[]` - Mode contexts (default: ['normal', 'visual'])

**Returns:** `boolean` - true if successful

---

## Action API

Actions are commands that don't take a motion.

### defineAction(name, callback)

Define a custom action.

```typescript
vimrcPlugin.defineAction('toggleSidebar', (cm, actionArgs, vim) => {
    this.app.commands.executeCommandById('app:toggle-left-sidebar');
});

vimrcPlugin.defineAction('insertDate', (cm) => {
    const date = new Date().toISOString().split('T')[0];
    cm.replaceSelection(date);
});
```

**Parameters:**
- `name: string` - Unique name for the action
- `callback: (cm, actionArgs, vim) => void` - Function to execute

**Returns:** `boolean` - true if successful

### mapAction(keys, actionName, context?)

Map a key sequence to an action.

```typescript
vimrcPlugin.mapAction('<C-b>', 'toggleSidebar', 'normal');
vimrcPlugin.mapAction('<C-d>', 'insertDate', 'insert');
```

**Parameters:**
- `keys: string` - Key sequence
- `actionName: string` - Name of the action
- `context?: 'normal' | 'visual' | 'insert'` - Mode context (default: 'normal')

**Returns:** `boolean` - true if successful

---

## Operator API

Operators are commands that take a motion (like d, c, y).

### defineOperator(name, callback)

Define a custom operator.

```typescript
vimrcPlugin.defineOperator('surround', (cm, operatorArgs, ranges, oldAnchor, newHead) => {
    const doc = cm.getDoc();
    // Process ranges in reverse to maintain positions
    for (let i = ranges.length - 1; i >= 0; i--) {
        const range = ranges[i];
        const text = doc.getRange(range.anchor, range.head);
        doc.replaceRange(`[${text}]`, range.anchor, range.head);
    }
});

vimrcPlugin.defineOperator('uppercase', (cm, operatorArgs, ranges) => {
    const doc = cm.getDoc();
    for (let i = ranges.length - 1; i >= 0; i--) {
        const range = ranges[i];
        const text = doc.getRange(range.anchor, range.head);
        doc.replaceRange(text.toUpperCase(), range.anchor, range.head);
    }
});
```

**Parameters:**
- `name: string` - Unique name for the operator
- `callback: (cm, operatorArgs, ranges, oldAnchor, newHead) => void` - Function to execute
  - `ranges` - Array of {anchor, head} positions

**Returns:** `boolean` - true if successful

### mapOperator(keys, operatorName)

Map a key sequence to an operator.

```typescript
vimrcPlugin.mapOperator('gs', 'surround');
vimrcPlugin.mapOperator('gU', 'uppercase');
```

**Usage after mapping:**
- `gsiw` - Surround inner word with brackets
- `gs$` - Surround to end of line
- `gUiw` - Uppercase inner word

---

## Ex Command API

### defineExCommand(name, callback)

Define a command that can be called with `:name`.

```typescript
vimrcPlugin.defineExCommand('hello', (cm, params) => {
    console.log('Hello!', params.args);
});

vimrcPlugin.defineExCommand('goto', (cm, params) => {
    const line = parseInt(params.args[0]) - 1;
    if (!isNaN(line)) {
        cm.setCursor({ line, ch: 0 });
    }
});
```

**Parameters:**
- `name: string` - Command name (without the colon)
- `callback: (cm, params) => void` - Function to execute
  - `params.args` - Array of arguments passed to the command

**Returns:** `boolean` - true if successful

**Usage:** `:hello world` or `:goto 42`

---

## Utility Methods

### getVimApiPublic()

Get the raw CodeMirror Vim API for advanced usage.

```typescript
const vimApi = vimrcPlugin.getVimApiPublic();
if (vimApi) {
    // Direct access to all Vim API methods
    vimApi.map('jj', '<Esc>', 'insert');
}
```

### getActiveCodeMirror()

Get the current editor's CodeMirror instance.

```typescript
const cm = vimrcPlugin.getActiveCodeMirror();
if (cm) {
    const cursor = cm.getCursor();
    const line = cm.getLine(cursor.line);
    console.log('Current line:', line);
}
```

### executeVimCommand(command)

Execute a Vim command string.

```typescript
vimrcPlugin.executeVimCommand(':w');      // Save
vimrcPlugin.executeVimCommand('dd');      // Delete line
vimrcPlugin.executeVimCommand(':set nu'); // Show line numbers
```

---

## Complete Example: Flash Jump Plugin

```typescript
import { Plugin } from 'obsidian';

export default class FlashJumpPlugin extends Plugin {
    private vimrcPlugin: any;

    async onload() {
        // Wait for vimrc plugin to load
        this.app.workspace.onLayoutReady(() => {
            this.setupVimIntegration();
        });
    }

    setupVimIntegration() {
        this.vimrcPlugin = this.app.plugins.plugins['vimrc-support'];
        
        if (!this.vimrcPlugin) {
            console.log('Vimrc Support plugin not found');
            return;
        }

        // Define the flash jump motion
        this.vimrcPlugin.defineAsyncMotion('flashJump', async (cm, vim, operatorPending) => {
            return this.performFlashJump(cm, operatorPending);
        });

        // Map keys
        this.vimrcPlugin.mapAsyncMotion('s', 'flashJump', ['normal', 'visual']);
        this.vimrcPlugin.mapAsyncMotion('S', 'flashJumpBackward', ['normal', 'visual']);
    }

    async performFlashJump(cm: any, operatorPending: boolean): Promise<{line: number, ch: number} | null> {
        // 1. Get visible range
        const viewport = cm.getViewport();
        
        // 2. Find all jump targets
        const targets = this.findJumpTargets(cm, viewport);
        
        // 3. Show hints
        const hints = this.showHints(cm, targets);
        
        // 4. Wait for user input
        const selected = await this.waitForSelection(hints);
        
        // 5. Clean up hints
        this.removeHints(hints);
        
        // 6. Return selected position or null
        return selected;
    }

    // ... implement helper methods
}
```

---

## Notes

1. **Plugin Load Order**: Make sure to check if the vimrc plugin is loaded before using its API. Use `onLayoutReady` to ensure all plugins are loaded.

2. **Error Handling**: All API methods return `boolean` indicating success. Check the return value and handle failures gracefully.

3. **Mode Contexts**: 
   - `'normal'` - Normal mode (default for most operations)
   - `'visual'` - Visual selection mode
   - `'insert'` - Insert mode

4. **Key Notation**: Use Vim-style key notation:
   - `<C-a>` - Ctrl+A
   - `<S-Tab>` - Shift+Tab
   - `<CR>` - Enter
   - `<Esc>` - Escape
   - `<Space>` - Space
   - `<leader>` - Leader key (default: `\`)

5. **CodeMirror API**: The `cm` parameter in callbacks is a CodeMirror 5 instance. See [CodeMirror documentation](https://codemirror.net/5/doc/manual.html) for available methods.
