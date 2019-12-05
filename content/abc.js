// @ts-check
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const textArea = document.querySelector('textarea');

    const initialState = vscode.getState();
    if (initialState) {
        textArea.value = initialState.value;
    }

    window.addEventListener('message', e => {
        switch (e.data.type) {
            case 'setValue':
                const value = e.data.value;
                textArea.value = value;
                vscode.setState({ value });
                break;
        }
    })

    textArea.addEventListener('input', e => {
        const value = textArea.value;
        vscode.setState({ value });
        vscode.postMessage({
            type: 'edit',
            value: value
        })
    });

    textArea.addEventListener('keydown', e => {
        // Hack to disable, undo/redo in the textarea itelf
        if (e.ctrlKey && (e.key === 'z' || e.key === 'y')) {
            e.preventDefault();
        }
    });
}())
