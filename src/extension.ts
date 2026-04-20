import * as vscode from 'vscode';
import axios from 'axios';

interface FileInfo {
    file_hash: string;
    filename: string;
    mime: string;
    size: number;
    public: boolean;
}

function getLanguageFromMime(mime: string): string {
    const mimeToLanguage: { [key: string]: string } = {
        'text/plain': 'plaintext',
        'text/html': 'html',
        'text/css': 'css',
        'text/javascript': 'javascript',
        'application/javascript': 'javascript',
        'application/json': 'json',
        'application/xml': 'xml',
        'text/xml': 'xml',
        'text/markdown': 'markdown',
        'text/yaml': 'yaml',
        'text/x-yaml': 'yaml',
        'application/x-python': 'python',
        'text/x-python': 'python',
        'text/x-java': 'java',
        'text/x-c++': 'cpp',
        'text/x-c': 'c',
        'text/x-php': 'php',
        'text/x-ruby': 'ruby',
        'text/x-rust': 'rust',
        'text/x-go': 'go',
        'text/x-typescript': 'typescript',
        'application/typescript': 'typescript',
        'text/x-shellscript': 'shellscript',
        'text/x-sql': 'sql'
    };

    return mimeToLanguage[mime] || 'plaintext';
}

async function openFileWithMimeType(content: string | Buffer, mime: string, fileHash: string) {
    if (mime.startsWith('image/')) {
        const tempDir = vscode.Uri.file(vscode.workspace.rootPath || '');
        const tempFile = vscode.Uri.joinPath(tempDir, `${fileHash}.${mime.split('/')[1]}`);
        
        const buffer = typeof content === 'string' ? 
            Buffer.from(content, 'base64') : 
            content;
        
        await vscode.workspace.fs.writeFile(tempFile, buffer);
        await vscode.commands.executeCommand('vscode.open', tempFile);
    } else {
        const language = getLanguageFromMime(mime);
        
        const textContent = typeof content === 'string' ? 
            Buffer.from(content, 'base64').toString('utf-8') : 
            content.toString('utf-8');
            
        const document = await vscode.workspace.openTextDocument({
            content: textContent,
            language: language
        });
        await vscode.window.showTextDocument(document);
    }
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('lp2ln-extension.connect', async () => {
        const config = vscode.workspace.getConfiguration('lp2ln');
        const host = config.get('host') as string;
        const port = config.get('port') as number;

        try {
            const response = await axios.get(`http://${host}:${port}/api/info`);
            vscode.window.showInformationMessage(`Подключено к P2P серверу: ${response.data.node_id}`);
        } catch (error) {
            vscode.window.showErrorMessage('Ошибка подключения к серверу');
        }
    });

    let uploadFile = vscode.commands.registerCommand('lp2ln-extension.uploadFile', async () => {
        const config = vscode.workspace.getConfiguration('lp2ln');
        const host = config.get('host') as string;
        const port = config.get('port') as number;

        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false
        });

        if (!fileUri || fileUri.length === 0) {
            return;
        }

        try {
            const fileContent = await vscode.workspace.fs.readFile(fileUri[0]);
            const filename = fileUri[0].path.split('/').pop() || '';

            const response = await axios.post(`http://${host}:${port}/api/upload`, {
                filename: filename,
                contents: Buffer.from(fileContent).toString('base64'),
                public: true,
                encrypted: false,
                compressed: false,
                auto_decompress: false,
                token: ''
            });

            vscode.window.showInformationMessage(`Файл загружен. Хеш: ${response.data.file_hash}`);
        } catch (error) {
            vscode.window.showErrorMessage('Ошибка при загрузке файла');
        }
    });

    let listFiles = vscode.commands.registerCommand('lp2ln-extension.listFiles', async () => {
        const config = vscode.workspace.getConfiguration('lp2ln');
        const host = config.get('host') as string;
        const port = config.get('port') as number;

        try {
            const response = await axios.get(`http://${host}:${port}/api/files`);
            const files: FileInfo[] = response.data;

            const items = files.map(file => ({
                label: file.filename,
                description: `Хеш: ${file.file_hash}`,
                detail: `Размер: ${file.size} байт, MIME: ${file.mime}`
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Выберите файл для просмотра'
            });

            if (selected) {
                const fileHash = selected.description?.split(': ')[1];
                const fileMime = selected.detail?.split('MIME: ')[1];
                if (fileHash && fileMime) {
                    const fileResponse = await axios.get(`http://${host}:8080/${fileHash}`, {
                        responseType: 'arraybuffer'
                    });
                    await openFileWithMimeType(fileResponse.data, fileMime, fileHash);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage('Ошибка при получении списка файлов');
        }
    });

    let deleteFile = vscode.commands.registerCommand('lp2ln-extension.deleteFile', async () => {
        const config = vscode.workspace.getConfiguration('lp2ln');
        const host = config.get('host') as string;
        const port = config.get('port') as number;

        try {
            const response = await axios.get(`http://${host}:${port}/api/files`);
            const files: FileInfo[] = response.data;

            const items = files.map(file => ({
                label: file.filename,
                description: `Хеш: ${file.file_hash}`,
                detail: `Размер: ${file.size} байт, MIME: ${file.mime}`
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Выберите файл для удаления'
            });

            if (selected) {
                const fileHash = selected.description?.split(': ')[1];
                if (fileHash) {
                    await axios.delete(`http://${host}:${port}/api/file/${fileHash}`);
                    vscode.window.showInformationMessage('Файл успешно удален');
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage('Ошибка при удалении файла');
        }
    });

    let editFile = vscode.commands.registerCommand('lp2ln-extension.editFile', async () => {
        const config = vscode.workspace.getConfiguration('lp2ln');
        const host = config.get('host') as string;
        const port = config.get('port') as number;

        try {
            const response = await axios.get(`http://${host}:${port}/api/files`);
            const files: FileInfo[] = response.data;

            const items = files.filter(file => file.mime.startsWith('text/')).map(file => ({
                label: file.filename,
                description: `Хеш: ${file.file_hash}`,
                detail: `Размер: ${file.size} байт, MIME: ${file.mime}`
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Выберите файл для редактирования'
            });

            if (selected) {
                const fileHash = selected.description?.split(': ')[1];
                const fileMime = selected.detail?.split('MIME: ')[1];
                if (fileHash && fileMime) {
                    const fileResponse = await axios.get(`http://${host}:8080/${fileHash}`, {
                        responseType: 'arraybuffer'
                    });
                    
                    const content = Buffer.from(fileResponse.data).toString('utf-8');
                    
                    const document = await vscode.workspace.openTextDocument({
                        content: content,
                        language: getLanguageFromMime(fileMime)
                    });
                    
                    const editor = await vscode.window.showTextDocument(document);
                    
                    vscode.window.showInformationMessage('Файл открыт для редактирования. Используйте Ctrl+S для сохранения.');
                    
                    const disposable = vscode.workspace.onDidSaveTextDocument(async (savedDocument) => {
                        if (savedDocument === document) {
                            try {
                                const updatedContent = Buffer.from(savedDocument.getText()).toString('base64');
                                const updateResponse = await axios.post(`http://${host}:${port}/api/update`, {
                                    file_hash: fileHash,
                                    contents: updatedContent,
                                    public: true,
                                    encrypted: false,
                                    compressed: false,
                                    auto_decompress: false,
                                    token: ''
                                });
                                
                                vscode.window.showInformationMessage(
                                    `Файл обновлен. Новый хеш: ${updateResponse.data.new_hash}`
                                );
                            } catch (error) {
                                console.error('Ошибка при обновлении:', error);
                                vscode.window.showErrorMessage('Ошибка при обновлении файла');
                            }
                        }
                    });
                    
                    context.subscriptions.push(disposable);
                }
            }
        } catch (error) {
            console.error('Ошибка при редактировании:', error);
            vscode.window.showErrorMessage('Ошибка при редактировании файла');
        }
    });

    let getFileByHash = vscode.commands.registerCommand('lp2ln-extension.getFileByHash', async () => {
        const config = vscode.workspace.getConfiguration('lp2ln');
        const host = config.get('host') as string;
        const port = config.get('port') as number;

        const fileHash = await vscode.window.showInputBox({
            prompt: 'Введите хеш файла',
            placeHolder: 'Например: abc123...'
        });

        if (!fileHash) {
            return;
        }

        try {
            const filesResponse = await axios.get(`http://${host}:${port}/api/files`);
            const files: FileInfo[] = filesResponse.data;
            const fileInfo = files.find(f => f.file_hash === fileHash);

            if (fileInfo) {
                const fileResponse = await axios.get(`http://${host}:8080/${fileHash}`, {
                    responseType: 'arraybuffer'
                });
                await openFileWithMimeType(fileResponse.data, fileInfo.mime, fileHash);
            } else {
                vscode.window.showErrorMessage('Файл не найден');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Ошибка при получении файла');
        }
    });

    context.subscriptions.push(disposable, uploadFile, listFiles, deleteFile, editFile, getFileByHash);
}

export function deactivate() {} 