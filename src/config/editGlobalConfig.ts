import { 
    IExtensionContextMinimal, 
    IPathResolver, 
    IDirectoryReader, 
    IDirectoryCreator, 
    IFileContentWriter, 
    IWindowProvider, 
    IDocumentOpener 
} from "../types.js";

export async function editGlobalConfig(
  context: IExtensionContextMinimal,
  currentConfig: object,
  pathResolver: IPathResolver,
  directoryReader: IDirectoryReader,
  directoryCreator: IDirectoryCreator,
  fileWriter: IFileContentWriter,
  documentOpener: IDocumentOpener,
  windowProvider: IWindowProvider
) {
  const storagePath = context.globalStorageUri.fsPath;
  if (!storagePath) {
      return;
  }
  const configFile = pathResolver.join(storagePath, "config.json");

  // Ensure the file exists, initialized with current config
  if (!directoryReader.exists(configFile)) {
    directoryCreator.mkdir(storagePath, { recursive: true });
    fileWriter.write(configFile, JSON.stringify(currentConfig, null, 2));
  }

  // Open the config file in the editor
  const doc = await documentOpener.openTextDocument(configFile);
  await windowProvider.showTextDocument(doc);
}
