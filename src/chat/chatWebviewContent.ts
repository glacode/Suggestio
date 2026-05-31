import type { GetChatWebviewContent, IUriLike, IVscodeApiLocal, IFileContentReader, InitialState } from '../types.js';

export interface IChatWebviewContentArgs {
    extensionUri: IUriLike;
    chatJsUri: IUriLike;
    markdownJsUri: IUriLike;
    highlightCssUri: IUriLike;
    chatCssUri: IUriLike;
    initialState: InitialState;
    vscodeApi: IVscodeApiLocal;
    fileReader: IFileContentReader;
    nonce: string;
    cspSource: string;
}

export const getChatWebviewContent: GetChatWebviewContent = (args: IChatWebviewContentArgs) => {
    // 1. Get the path to the chat.html file on disk
    const htmlPath = args.vscodeApi.Uri.joinPath(args.extensionUri, 'media', 'chat.html');
    
    // 2. Read the file content
    let htmlContent = args.fileReader.read(htmlPath.fsPath || '') || '';

    // 3. Replace placeholders with the actual URIs and data
    htmlContent = htmlContent
        .replace('{{chatJsUri}}', args.chatJsUri.toString())
        .replace('{{markdownJsUri}}', args.markdownJsUri.toString())
        .replace('{{highlightCssUri}}', args.highlightCssUri.toString())
        .replace('{{chatCssUri}}', args.chatCssUri.toString())
        .replace('{{cspSource}}', args.cspSource)
        .replace(/{{nonce}}/g, args.nonce)
        .replace('{{initialState}}', JSON.stringify(args.initialState));

    return htmlContent;
};
