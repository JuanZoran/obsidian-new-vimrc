/**
 * PluginApi - Public API Service for External Plugins
 *
 * Provides a clean interface for external plugins (e.g., Flash) to:
 * - Define custom motions
 * - Define custom actions
 * - Map keys to motions/actions
 *
 * @module services/PluginApi
 */

import { App, MarkdownView } from 'obsidian';
import type { IVimAdapter } from '../types/services';
import type { VimrcSettings } from '../types/settings';

/** Position in editor */
export interface EditorPosition {
  line: number;
  ch: number;
}

/** Motion callback arguments */
export interface MotionCallbackArgs {
  head: EditorPosition;
  operatorPending: boolean;
  operator?: string;
}

/** Motion callback type */
export type MotionCallback = (
  cm: unknown,
  args: MotionCallbackArgs
) => Promise<EditorPosition | null>;

/** Action callback type */
export type ActionCallback = (cm: unknown, vim: unknown) => void;

/** Vim API type for register operations */
interface VimApiWithRegister {
  getRegisterController?: () => {
    pushText: (registerName: string, operator: string, text: string, linewise: boolean, blockwise: boolean) => void;
  };
  handleKey?: (cm: unknown, key: string, origin: string) => void;
}

/**
 * PluginApi - Handles all public API functionality
 */
export class PluginApi {
  private app: App;
  private vimAdapter: IVimAdapter;
  private getSettings: () => VimrcSettings;

  constructor(app: App, vimAdapter: IVimAdapter, getSettings: () => VimrcSettings) {
    this.app = app;
    this.vimAdapter = vimAdapter;
    this.getSettings = getSettings;
  }

  /** Get the CodeMirror Vim API directly */
  getVimApi(): unknown {
    return (window as unknown as { CodeMirrorAdapter?: { Vim?: unknown } })?.CodeMirrorAdapter?.Vim ?? null;
  }

  /**
   * Define an async motion for plugins like Flash.
   *
   * @param name - Motion name (creates <Plug>(name) mapping)
   * @param callback - Async callback returning target position or null
   */
  defineMotion(name: string, callback: MotionCallback): boolean {
    const internalName = `_plugin_motion_${name}`;
    const plugKey = `<Plug>(${name})`;

    try {
      this.vimAdapter.defineMotion(internalName, (cm: unknown, head: unknown, _motionArgs: unknown) => {
        const vimContext = this.extractVimContext(cm, head);
        const { currentHead, operator, operatorPending, visualMode, inputState, lastEditInputState } = vimContext;

        this.debugLog(`Motion <Plug>(${name}) triggered`, vimContext);

        // Clear operator state to prevent Vim from executing empty operation
        if (inputState && operatorPending) {
          this.debugLog(`Clearing vim operator state, was: ${operator}`);
          inputState.operator = null;
          inputState.operatorArgs = null;
        }

        // Execute async callback
        callback(cm, { head: currentHead, operatorPending, operator })
          .then((target) => {
            if (!target) {
              this.debugLog(`Motion <Plug>(${name}) cancelled`);
              return;
            }

            this.debugLog(`Motion <Plug>(${name}) completed`, { target, operatorPending, operator, visualMode });
            this.executeMotion(cm, currentHead, target, operator, visualMode);

            // Clear lastEditInputState.operator to prevent false detection next time
            if (operatorPending && lastEditInputState) {
              lastEditInputState.operator = null;
              lastEditInputState.operatorArgs = null;
            }
          })
          .catch((error) => {
            console.error(`[Vimrc] Motion <Plug>(${name}) error:`, error);
          });

        return head;
      });

      this.vimAdapter.mapCommand(plugKey, 'motion', internalName);
      this.debugLog(`Defined motion: <Plug>(${name})`);
      return true;
    } catch (error) {
      console.error(`[Vimrc] Failed to define motion <Plug>(${name}):`, error);
      return false;
    }
  }

  /** Define an action (for normal mode, doesn't work with operators) */
  defineAction(name: string, callback: ActionCallback): boolean {
    try {
      this.vimAdapter.defineAction(name, (cm: unknown, _actionArgs: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vimState = (cm as any)?.state?.vim;
        callback(cm, vimState);
      });

      this.debugLog(`Defined action: ${name}`);
      return true;
    } catch (error) {
      console.error(`[Vimrc] Failed to define action ${name}:`, error);
      return false;
    }
  }

  /** Map keys to a motion */
  mapMotion(keys: string, motionName: string): boolean {
    try {
      this.vimAdapter.mapCommand(keys, 'motion', motionName);
      this.debugLog(`Mapped motion: ${keys} -> ${motionName}`);
      return true;
    } catch (error) {
      console.error(`[Vimrc] Failed to map motion ${keys}:`, error);
      return false;
    }
  }

  /** Map keys to an action */
  mapAction(keys: string, actionName: string, contexts?: string[]): boolean {
    try {
      const ctxList = contexts?.length ? contexts : ['normal'];
      for (const context of ctxList) {
        this.vimAdapter.mapCommand(keys, 'action', actionName, undefined, { context });
      }
      this.debugLog(`Mapped action: ${keys} -> ${actionName}`);
      return true;
    } catch (error) {
      console.error(`[Vimrc] Failed to map action ${keys}:`, error);
      return false;
    }
  }

  // ==========================================
  // Private Helper Methods
  // ==========================================

  private extractVimContext(cm: unknown, head: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmAny = cm as any;
    const vimState = cmAny?.state?.vim;
    const inputState = vimState?.inputState;
    const lastEditInputState = vimState?.lastEditInputState;

    const visualMode = !!(vimState?.visualMode);

    let operator: string | undefined;
    if (inputState?.operator) {
      operator = inputState.operator;
    } else if (lastEditInputState?.operator) {
      operator = lastEditInputState.operator;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headPos = head as any;
    const currentHead = { line: headPos.line, ch: headPos.ch };

    return {
      cmAny,
      vimState,
      inputState,
      lastEditInputState,
      visualMode,
      operator,
      operatorPending: !!operator,
      currentHead,
    };
  }

  private executeMotion(
    cm: unknown,
    from: EditorPosition,
    to: EditorPosition,
    operator?: string,
    visualMode?: boolean
  ): void {
    this.debugLog(`executeMotion called`, { from, to, operator, visualMode });

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = activeView?.editor;

    if (!editor) {
      console.error(`[Vimrc] No active editor found!`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cmAny = cm as any;
      if (typeof cmAny?.setCursor === 'function') {
        cmAny.setCursor(to.line, to.ch);
      }
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmAny = cm as any;
    const vimState = cmAny?.state?.vim;

    // Visual mode: extend selection
    if (visualMode && !operator) {
      this.debugLog(`Visual mode, extending selection to`, to);
      const sel = vimState?.sel;
      const anchor = sel?.anchor || from;
      editor.setSelection(anchor, to);
      return;
    }

    // Normal mode: move cursor
    if (!operator) {
      this.debugLog(`No operator, moving cursor to`, to);
      editor.setCursor(to);
      return;
    }

    // Operator-pending mode: execute operation
    const isForward = to.line > from.line || (to.line === from.line && to.ch > from.ch);
    const start = isForward ? from : to;
    const end = isForward ? to : from;

    this.debugLog(`Executing operator ${operator}`, { start, end, isForward });
    this.executeOperator(editor, cmAny, vimState, operator, start, end);
  }

  private executeOperator(
    editor: any,
    cmAny: any,
    vimState: any,
    operator: string,
    start: EditorPosition,
    end: EditorPosition
  ): void {
    switch (operator) {
      case 'd':
      case 'delete':
        this.executeDelete(editor, vimState, start, end);
        break;
      case 'c':
      case 'change':
        this.executeChange(editor, cmAny, vimState, start, end);
        break;
      case 'y':
      case 'yank':
        this.executeYank(editor, vimState, start, end);
        break;
      case '>':
      case 'indent':
        this.executeIndent(editor, start, end, true);
        break;
      case '<':
      case 'outdent':
        this.executeIndent(editor, start, end, false);
        break;
      default:
        editor.setCursor(end);
        console.warn(`[Vimrc] Unknown operator: ${operator}`);
    }
  }

  private executeDelete(editor: any, vimState: any, start: EditorPosition, end: EditorPosition): void {
    const text = editor.getRange(start, end);
    this.debugLog(`Executing delete, text:`, text);
    this.pushToRegister('delete', text, vimState);
    editor.replaceRange('', start, end);
    editor.setCursor(start);
  }

  private executeChange(editor: any, cmAny: any, vimState: any, start: EditorPosition, end: EditorPosition): void {
    const text = editor.getRange(start, end);
    this.pushToRegister('change', text, vimState);
    editor.replaceRange('', start, end);
    editor.setCursor(start);

    // Enter insert mode
    const vimApi = this.getVimApi() as VimApiWithRegister | null;
    if (vimApi?.handleKey) {
      vimApi.handleKey(cmAny, 'i', 'mapping');
    }
  }

  private executeYank(editor: any, vimState: any, start: EditorPosition, end: EditorPosition): void {
    const text = editor.getRange(start, end);
    this.debugLog(`Yanking text:`, text);
    this.pushToRegister('yank', text, vimState);
    navigator.clipboard?.writeText(text);
    console.log(`[Vimrc] Yank completed`);
  }

  private executeIndent(editor: any, start: EditorPosition, end: EditorPosition, indent: boolean): void {
    for (let line = start.line; line <= end.line; line++) {
      const lineContent = editor.getLine(line);
      const newContent = indent
        ? '  ' + lineContent
        : lineContent.replace(/^(\t|  )/, '');
      editor.replaceRange(newContent, { line, ch: 0 }, { line, ch: lineContent.length });
    }
    editor.setCursor(start);
  }

  private pushToRegister(operator: string, text: string, vimState: any): void {
    const vimApi = this.getVimApi() as VimApiWithRegister | null;

    if (vimApi?.getRegisterController) {
      const registerController = vimApi.getRegisterController();
      registerController.pushText('"', operator, text, false, false);
    } else if (vimState) {
      vimState.registers = vimState.registers || {};
      vimState.registers['"'] = { text, linewise: false };
      vimState.registers['0'] = { text, linewise: false };
    }
  }

  private debugLog(message: string, ...args: unknown[]): void {
    if (this.getSettings().debugMode) {
      console.log(`[Vimrc] ${message}`, ...args);
    }
  }
}
