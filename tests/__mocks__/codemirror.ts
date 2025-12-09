/**
 * Mock CodeMirror API for testing
 */

export class EditorView {
    state: EditorState;

    constructor(config?: any) {
        this.state = new EditorState();
    }

    dispatch(transaction: any): void {
        // Mock implementation
    }
}

export class EditorState {
    doc: any;

    constructor() {
        this.doc = { length: 0 };
    }

    static create(config?: any): EditorState {
        return new EditorState();
    }
}
