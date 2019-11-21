import * as vscode from 'vscode';

const viewType = 'testWebviewEditor';

export function activate(context: vscode.ExtensionContext) {
    vscode.window.registerWebviewEditorProvider(viewType, {
        resolveWebviewEditor: async (input, panel) => {
            return new Preview(input.resource, panel);
        },
    })
}

interface Edit {
    value: string;
}

class Preview implements vscode.WebviewEditorCapabilities, vscode.WebviewEditorEditingCapability {

    public readonly editingCapability?: vscode.WebviewEditorEditingCapability;

    private readonly _onEdit = new vscode.EventEmitter<Edit>();
    public readonly onEdit = this._onEdit.event;

    private readonly _edits: Edit[] = [];
    private initialValue: string;

    constructor(
        private readonly uri: vscode.Uri,
        private readonly panel: vscode.WebviewPanel
    ) {
        panel.webview.options = {
            enableScripts: true,
        };

        this.setInitialContent(panel);

        panel.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'edit':
                    const edit: Edit = { value: message.value };
                    this._edits.push(edit);
                    this._onEdit.fire(edit);
                    break;
            }
        });

        this.editingCapability = this;
    }

    private async setInitialContent(panel: vscode.WebviewPanel): Promise<void> {
        const initialContent = await vscode.workspace.fs.readFile(this.uri);
        this.initialValue = Buffer.from(initialContent).toString('utf8')

        panel.webview.html = this.getHtml(this.initialValue);
    }

    private getHtml(value: string) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="X-UA-Compatible" content="ie=edge">
            <title>Document</title>
        </head>
        <body>
            <textarea style="width: 300px; height: 300px;"></textarea>
            <script>
                const vscode = acquireVsCodeApi();

                const textArea = document.querySelector('textarea');
                textArea.value = ${JSON.stringify(value)};

                window.addEventListener('message', e => {
                    switch (e.data.type) {
                        case 'apply':
                            textArea.value = e.data.value;
                            break;
                    }
                })

                textArea.addEventListener('input', () => {
                    console.log('change');
                    vscode.postMessage({
                        type: 'edit',
                        value: textArea.value
                    })
                });
            </script>
        </body>
        </html>`;
    }

    save(): Thenable<void> {
        return vscode.workspace.fs.writeFile(this.uri, Buffer.from(this.getContents()))
    }

    hotExit(hotExitPath: vscode.Uri): Thenable<void> {
        throw new Error("Method not implemented.");
    }

    async applyEdits(edits: readonly string[]): Promise<void> {
        this._edits.push(...edits.map(x => typeof x === 'string' ? JSON.parse(x) : x));
        this.update();
    }

    async undoEdits(edits: readonly string[]): Promise<void> {
        this._edits.pop();
        this.update();
    }

    private update() {
        console.log('apply', this.getContents());
        this.panel.webview.postMessage({
            type: 'apply',
            value: this.getContents()
        });
    }

    private getContents() {
        return this._edits.length ? this._edits[this._edits.length - 1].value : this.initialValue;
    }
}