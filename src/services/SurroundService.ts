/**
 * SurroundService - Built-in surround support
 *
 * Provides minimal surround actions:
 * - Add surrounding via operator (sa + motion) or visual selection (sa)
 * - Delete surrounding (sd) at cursor
 * - Replace surrounding (sr) at cursor
 */

import { App, Modal, Setting, TextComponent } from 'obsidian';
import type { IVimAdapter } from '../types/services';
import { VimMode } from '../types/mappings';
import { getLogger } from './Logger';

declare const CodeMirror: {
  openDialog?: (
    html: string,
    callback: (value: string) => void,
    options?: { bottom?: boolean; selectValueOnOpen?: boolean }
  ) => void;
};

const log = getLogger('surround');

type SurroundPair = { left: string; right: string };

const SURROUND_PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '<': '>',
};

export class SurroundService {
  private app: App;
  private vimAdapter: IVimAdapter;

  constructor(app: App, vimAdapter: IVimAdapter) {
    this.app = app;
    this.vimAdapter = vimAdapter;
  }

  register(): void {
    this.disableBuiltinS();
    this.registerAddOperator();
    this.registerAddVisual();
    this.registerDelete();
    this.registerReplace();
  }

  cleanup(): void {
    this.vimAdapter.unmap('sa', VimMode.NORMAL);
    this.vimAdapter.unmap('sd', VimMode.NORMAL);
    this.vimAdapter.unmap('sr', VimMode.NORMAL);
    this.vimAdapter.unmap('sa', VimMode.VISUAL);
    this.restoreBuiltinS();
  }

  private registerAddOperator(): void {
    this.vimAdapter.defineOperator('surround_add', (cm: unknown, _args: unknown, ranges: unknown) => {
      const rangeList = Array.isArray(ranges) ? ranges : [];
      if (rangeList.length === 0) {
        log.debug('surround_add: no ranges');
        return;
      }

      this.promptForSurround(cm, 'Surround with:', (pair) => {
        if (!pair) {
          log.debug('surround_add: cancelled');
          return;
        }

        this.applySurroundToRanges(cm, rangeList, pair);
      });
    });

    this.vimAdapter.mapCommand('sa', 'operator', 'surround_add', undefined, { context: 'normal' });
  }

  private registerAddVisual(): void {
    this.vimAdapter.defineAction('surround_add_visual', (cm: any) => {
      const ranges = this.getSelectionsFromCm(cm);
      if (ranges.length === 0) {
        log.debug('surround_add_visual: no ranges');
        return;
      }

      this.promptForSurround(cm, 'Surround with:', (pair) => {
        if (!pair) {
          log.debug('surround_add_visual: cancelled');
          return;
        }

        this.applySurroundToRanges(cm, ranges, pair);
      });
    });

    this.vimAdapter.mapCommand('sa', 'action', 'surround_add_visual', undefined, { context: 'visual' });
  }

  private registerDelete(): void {
    this.vimAdapter.defineAction('surround_delete', (cm: any) => {
      this.promptForSurround(cm, 'Delete surrounding:', (pair) => {
        if (!pair) {
          log.debug('surround_delete: cancelled');
          return;
        }

        this.deleteSurroundAtCursor(cm, pair);
      });
    });

    this.vimAdapter.mapCommand('sd', 'action', 'surround_delete', undefined, { context: 'normal' });
  }

  private registerReplace(): void {
    this.vimAdapter.defineAction('surround_replace', (cm: any) => {
      this.promptForSurround(cm, 'Replace surrounding:', (pair) => {
        if (!pair) {
          log.debug('surround_replace: cancelled');
          return;
        }

        this.promptForSurround(cm, 'Replace with:', (newPair) => {
          if (!newPair) {
            log.debug('surround_replace: cancelled');
            return;
          }

          this.replaceSurroundAtCursor(cm, pair, newPair);
        });
      });
    });

    this.vimAdapter.mapCommand('sr', 'action', 'surround_replace', undefined, { context: 'normal' });
  }

  private disableBuiltinS(): void {
    this.vimAdapter.unmap('s', VimMode.NORMAL);
    this.vimAdapter.unmap('s', VimMode.VISUAL);
  }

  private restoreBuiltinS(): void {
    this.vimAdapter.map('s', 'cl', VimMode.NORMAL);
    this.vimAdapter.map('s', 'c', VimMode.VISUAL);
  }

  private applySurroundToRanges(cm: any, ranges: any[], pair: SurroundPair): void {
    const doc = cm.getDoc ? cm.getDoc() : cm;
    const indexFromPos = doc.indexFromPos?.bind(doc) || cm.indexFromPos?.bind(cm);
    const posFromIndex = doc.posFromIndex?.bind(doc) || cm.posFromIndex?.bind(cm);

    const normalized = ranges
      .map((range) => this.normalizeRange(range.anchor, range.head, indexFromPos))
      .sort((a, b) => b.startIndex - a.startIndex);

    for (const range of normalized) {
      const text = doc.getRange(range.from, range.to);
      doc.replaceRange(pair.left + text + pair.right, range.from, range.to);
    }

    if (normalized.length === 1 && normalized[0].startIndex === normalized[0].endIndex && posFromIndex) {
      const newPos = posFromIndex(normalized[0].startIndex + pair.left.length);
      cm.setCursor?.(newPos);
    }
  }

  private deleteSurroundAtCursor(cm: any, pair: SurroundPair): void {
    const doc = cm.getDoc ? cm.getDoc() : cm;
    const cursor = doc.getCursor();
    const line = doc.getLine(cursor.line);
    const match = this.findSurroundInLine(line, cursor.ch, pair);

    if (!match) {
      log.warn('No surrounding found for delete');
      return;
    }

    doc.replaceRange('', { line: cursor.line, ch: match.rightIndex }, { line: cursor.line, ch: match.rightIndex + pair.right.length });
    doc.replaceRange('', { line: cursor.line, ch: match.leftIndex }, { line: cursor.line, ch: match.leftIndex + pair.left.length });
    cm.setCursor?.({ line: cursor.line, ch: match.leftIndex });
  }

  private replaceSurroundAtCursor(cm: any, pair: SurroundPair, newPair: SurroundPair): void {
    const doc = cm.getDoc ? cm.getDoc() : cm;
    const cursor = doc.getCursor();
    const line = doc.getLine(cursor.line);
    const match = this.findSurroundInLine(line, cursor.ch, pair);

    if (!match) {
      log.warn('No surrounding found for replace');
      return;
    }

    const inner = line.slice(match.leftIndex + pair.left.length, match.rightIndex);
    const replacement = newPair.left + inner + newPair.right;
    doc.replaceRange(
      replacement,
      { line: cursor.line, ch: match.leftIndex },
      { line: cursor.line, ch: match.rightIndex + pair.right.length }
    );
    cm.setCursor?.({ line: cursor.line, ch: match.leftIndex + newPair.left.length });
  }

  private findSurroundInLine(
    line: string,
    cursorCh: number,
    pair: SurroundPair
  ): { leftIndex: number; rightIndex: number } | null {
    if (pair.left === pair.right) {
      const leftIndex = line.lastIndexOf(pair.left, cursorCh - 1);
      const rightIndex = line.indexOf(pair.right, cursorCh);
      if (leftIndex === -1 || rightIndex === -1 || leftIndex >= rightIndex) {
        return null;
      }
      return { leftIndex, rightIndex };
    }

    const leftIndex = line.lastIndexOf(pair.left, cursorCh);
    const rightIndex = line.indexOf(pair.right, Math.max(cursorCh, leftIndex + 1));
    if (leftIndex === -1 || rightIndex === -1 || leftIndex >= rightIndex) {
      return null;
    }
    return { leftIndex, rightIndex };
  }

  private getSelectionsFromCm(cm: any): Array<{ anchor: any; head: any }> {
    if (typeof cm.listSelections === 'function') {
      return cm.listSelections();
    }

    const doc = cm.getDoc ? cm.getDoc() : cm;
    const cursor = doc.getCursor();
    return [{ anchor: cursor, head: cursor }];
  }

  private normalizeRange(anchor: any, head: any, indexFromPos?: (pos: any) => number) {
    if (!indexFromPos) {
      return { from: anchor, to: head, startIndex: 0, endIndex: 0 };
    }

    const anchorIndex = indexFromPos(anchor);
    const headIndex = indexFromPos(head);
    if (anchorIndex <= headIndex) {
      return { from: anchor, to: head, startIndex: anchorIndex, endIndex: headIndex };
    }
    return { from: head, to: anchor, startIndex: headIndex, endIndex: anchorIndex };
  }

  private promptForSurround(cm: any, label: string, callback: (pair: SurroundPair | null) => void): void {
    if (typeof CodeMirror?.openDialog === 'function') {
      const html = `<span>${label} <input type='text'></span>`;
      CodeMirror.openDialog(
        html,
        (value: string) => {
          callback(this.parseSurroundInput(value));
        },
        { bottom: true, selectValueOnOpen: false }
      );
      return;
    }

    const modal = new SurroundInputModal(this.app, label, (value) => {
      callback(this.parseSurroundInput(value ?? ''));
    });
    modal.open();
  }

  private parseSurroundInput(value: string): SurroundPair | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const key = trimmed[0];
    if (SURROUND_PAIRS[key]) {
      return { left: key, right: SURROUND_PAIRS[key] };
    }

    const opener = Object.keys(SURROUND_PAIRS).find((open) => SURROUND_PAIRS[open] === key);
    if (opener) {
      return { left: opener, right: key };
    }

    return { left: key, right: key };
  }
}

class SurroundInputModal extends Modal {
  private label: string;
  private onSubmit: (value: string | null) => void;
  private submitted = false;

  constructor(app: App, label: string, onSubmit: (value: string | null) => void) {
    super(app);
    this.label = label;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h3', { text: this.label });
    const setting = new Setting(contentEl);
    const input = new TextComponent(setting.controlEl);
    input.inputEl.focus();

    const submit = () => {
      if (this.submitted) {
        return;
      }
      this.submitted = true;
      this.onSubmit(input.getValue());
      this.close();
    };

    input.inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });

    new Setting(contentEl).addButton((button) => {
      button.setButtonText('OK');
      button.onClick(submit);
    });
  }

  onClose(): void {
    if (!this.submitted) {
      this.onSubmit(null);
    }
    this.contentEl.empty();
  }
}
