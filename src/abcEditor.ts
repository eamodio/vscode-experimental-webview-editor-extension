import * as path from 'path';
import * as vscode from 'vscode';
import { Disposable } from './dispose';

interface Edit {
    readonly value: string;
    readonly version: number;
}

const documents = new Map<string, AbcDocument>();

export class AbcEditor extends Disposable implements vscode.WebviewEditorCapabilities {

    public static readonly viewType = 'testWebviewEditor.abc';

    public readonly editingCapability?: vscode.WebviewEditorEditingCapability;

    private readonly document: AbcDocument;

    constructor(
        private readonly _extensionPath: string,
        private readonly uri: vscode.Uri,
        private readonly panel: vscode.WebviewPanel
    ) {
        super();

        panel.webview.options = {
            enableScripts: true,
        };
        panel.webview.html = this.html;

        panel.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'edit':
                    this.document.applyNewEdit(message.value);
                    break;
            }
        });

        panel.onDidDispose(() => { this.dispose(); })

        this.document = documents.get(uri.toString(true));
        if (this.document === undefined) {
            this.document = new AbcDocument(uri);
            documents.set(uri.toString(true), this.document);
        }

        this.editingCapability = this.document;
        this.document.onDidChangeContents(() => this.update());

        this.setInitialContent(panel);
    }

    private async setInitialContent(panel: vscode.WebviewPanel): Promise<void> {
        await this.document.load();
        this.update();
    }

    private get html() {
        const contentRoot = path.join(this._extensionPath, 'content');
        const scriptUri = vscode.Uri.file(path.join(contentRoot, 'abc.js'));
        const nonce = Date.now() + '';
        return /* html */`<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
                <title>Document</title>
            </head>
            <body>
                <textarea style="width: 300px; height: 300px;"></textarea>
                <script nonce=${nonce} src="${this.panel.webview.asWebviewUri(scriptUri)}"></script>
            </body>
            </html>`;
    }

    private async update() {
        if (this.isDisposed) {
            return;
        }

        return this.panel.webview.postMessage({
            type: 'setValue',
            value: this.document.getContents()
        });
    }
}

class AbcDocument implements vscode.WebviewEditorEditingCapability {
    private readonly _onDidChangeContents = new vscode.EventEmitter<void>();
    public readonly onDidChangeContents = this._onDidChangeContents.event;

    private readonly _onEdit = new vscode.EventEmitter<Edit>();
    public readonly onEdit = this._onEdit.event;

    private readonly _edits: Edit[] = [];
    private initialValue: string | undefined;

    private version = 0;
    private savedVersion = 0;

    constructor(public readonly uri: vscode.Uri) { }

    async load(): Promise<void> {
        if (this.initialValue === undefined) {
            const initialContent = await vscode.workspace.fs.readFile(this.uri);
            this.initialValue = Buffer.from(initialContent).toString('utf8');
        }
    }

    async save(): Promise<void> {
        if (this.version !== this.savedVersion) {
            console.log('save', `version=${this.version}, savedVersion=${this.savedVersion}`);

            const prevSavedVersion = this.savedVersion;
            this.savedVersion = this.version;

            try {
                await vscode.workspace.fs.writeFile(this.uri, Buffer.from(this.getContents()));
            }
            catch (ex) {
                this.savedVersion = prevSavedVersion;
                throw ex;
            }
        }
    }

    async saveAs(_resource: vscode.Uri, targetResource: vscode.Uri): Promise<void> {
        return vscode.workspace.fs.writeFile(targetResource, Buffer.from(this.getContents()));
    }

    async applyNewEdit(value: string): Promise<void> {
        const edit = { value: value, version: ++this.version };
        console.log('applyNewEdit', `${edit.version}: ${edit.value}`);
        this._edits.push(edit);
        this._onEdit.fire(edit);
    }

    async applyEdits(edits: readonly any[]): Promise<void> {
        for (const edit of edits) {
            if (this.version < edit.version) {
                console.log('applyEdits', `${edit.version}: ${edit.value}`);
                this._edits.push(edit);
                this.version = edit.version;
            }
        }

        this._onDidChangeContents.fire();
    }

    async undoEdits(edits: readonly any[]): Promise<void> {
        let tail = this._edits[this._edits.length - 1];
        for (const edit of edits) {
            if (tail === undefined) break;

            if (tail.version === edit.version) {
                console.log('undoEdits', `${edit.version}: ${edit.value}`);
                this._edits.pop();
                tail = this._edits[this._edits.length - 1];
                this.version = tail?.version ?? 0;
            }
        }

        this._onDidChangeContents.fire();
    }

    getContents() {
        return this._edits.length ? this._edits[this._edits.length - 1].value : this.initialValue;
    }
}