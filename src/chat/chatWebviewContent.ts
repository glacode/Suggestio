import type { GetChatWebviewContent, IUriLike, IVscodeApiLocal, IFileContentReader } from '../types.js';

export interface IChatWebviewContentArgs {
    extensionUri: IUriLike;
    scriptUri: IUriLike;
    highlightCssUri: IUriLike;
    models: string[];
    activeModel: string;
    vscodeApi: IVscodeApiLocal;
    fileReader: IFileContentReader;
}

export const getChatWebviewContent: GetChatWebviewContent = (args: IChatWebviewContentArgs) => {
    // 1. Get the path to the chat.html file on disk
    const htmlPath = args.vscodeApi.Uri.joinPath(args.extensionUri, 'media', 'chat.html');
    
    // 2. Read the file content
    let htmlContent = args.fileReader.read(htmlPath.fsPath || '') || '';

    // 3. Replace placeholders with the actual URIs
    htmlContent = htmlContent
        .replace('{{scriptUri}}', args.scriptUri.toString())
        .replace('{{highlightCssUri}}', args.highlightCssUri.toString())
        .replace('{{models}}', JSON.stringify(args.models))
        .replace('{{activeModel}}', args.activeModel);

    return htmlContent;
};