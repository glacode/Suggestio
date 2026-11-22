import { z } from 'zod';
import { IWorkspaceProvider, IToolDefinition, IPathResolver, IFileContentReader, IToolResult, IEventBus, IWorkspaceScanner } from '../types.js';
import { AGENT_MESSAGES } from '../constants/messages.js';
import { BaseTool } from './baseTool.js';
import { matchesGlob } from '../utils/globMatcher.js';

const GrepSearchSchema = z.object({
    pattern: z.string().describe('The regular expression pattern to search for.'),
    include: z.string().optional().describe('An optional glob pattern to limit the search (e.g., "src/**/*.ts").'),
    exclude: z.string().optional().describe('An optional glob pattern to exclude from the search.'),
    isCaseSensitive: z.boolean().optional().default(false).describe('Whether the search should be case-sensitive.'),
}).strict();

type GrepSearchArgs = z.infer<typeof GrepSearchSchema>;

interface GrepMatch {
    path: string;
    line: number;
    text: string;
}

/**
 * Tool for performing a recursive text search across the workspace using regular expressions.
 */
export class GrepSearchTool extends BaseTool<GrepSearchArgs> {
    private readonly MAX_MATCHES = 100;

    readonly definition: IToolDefinition = {
        name: 'grep_search',
        description: 'Recursively search for a regular expression pattern within file contents across the workspace.',
        parameters: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description: 'The regular expression pattern to search for.',
                },
                include: {
                    type: 'string',
                    description: 'An optional glob pattern to limit the search (e.g., "src/**/*.ts").',
                },
                exclude: {
                    type: 'string',
                    description: 'An optional glob pattern to exclude from the search.',
                },
                isCaseSensitive: {
                    type: 'boolean',
                    description: 'Whether the search should be case-sensitive. Defaults to false.',
                },
            },
            required: ['pattern'],
        },
    };

    readonly schema = GrepSearchSchema;

    constructor(
        private workspaceProvider: IWorkspaceProvider,
        private fileReader: IFileContentReader,
        private pathResolver: IPathResolver,
        private eventBus: IEventBus,
        private workspaceScanner: IWorkspaceScanner,
        public readonly requireUserConfirmation: boolean = true
    ) {
        super();
    }

    formatMessage(args: GrepSearchArgs): string {
        return `Searching for "${args.pattern}" in the workspace`;
    }

    async execute(args: GrepSearchArgs, signal?: AbortSignal, toolCallId?: string): Promise<IToolResult> {
        const rootPath = this.workspaceProvider.rootPath();
        if (!rootPath) {
            return { content: AGENT_MESSAGES.ERROR_NO_WORKSPACE, success: false };
        }

        if (this.requireUserConfirmation && toolCallId) {
            const allowed = await this.confirmSearch(args.pattern, toolCallId, signal);
            if (!allowed) {
                return { content: `Error: User denied permission to perform search.`, success: false };
            }
        }

        try {
            const allFiles = await this.workspaceScanner.scan(rootPath, { recursive: true });
            const candidateFiles = this.filterCandidateFiles(allFiles, args);
            const matches = this.searchFiles(candidateFiles, args, rootPath);

            return { content: this.formatMatches(matches), success: true };
        } catch (error: any) {
            return { content: `Error during search: ${error.message}`, success: false };
        }
    }

    private async confirmSearch(pattern: string, toolCallId: string, signal?: AbortSignal): Promise<boolean> {
        const userDecision = await this.requestUserConfirmation(
            toolCallId,
            this.eventBus,
            `Allow Suggestio to search for "${pattern}" in the workspace?`,
            undefined,
            signal
        );

        return userDecision === 'allow';
    }

    private filterCandidateFiles(allFiles: string[], args: GrepSearchArgs): string[] {
        return allFiles.filter(filePath => {
            if (args.include && !matchesGlob(filePath, args.include)) {
                return false;
            }
            if (args.exclude && matchesGlob(filePath, args.exclude)) {
                return false;
            }
            return !filePath.endsWith('/'); // Only search in files, not directories
        });
    }

    private searchFiles(candidateFiles: string[], args: GrepSearchArgs, rootPath: string): GrepMatch[] {
        const regex = new RegExp(args.pattern, args.isCaseSensitive ? 'g' : 'gi');
        const matches: GrepMatch[] = [];

        for (const relPath of candidateFiles) {
            if (matches.length >= this.MAX_MATCHES) {
                break;
            }

            this.appendFileMatches(matches, relPath, regex, rootPath);
        }

        return matches;
    }

    private appendFileMatches(matches: GrepMatch[], relPath: string, regex: RegExp, rootPath: string): void {
        const fullPath = this.pathResolver.join(rootPath, relPath);
        const content = this.fileReader.read(fullPath);

        if (content === undefined) {
            return;
        }

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!regex.test(line)) {
                continue;
            }

            matches.push({
                path: relPath,
                line: i + 1,
                text: line.trim()
            });
            // test() advances lastIndex on /g regexes; reset so the next line starts fresh.
            regex.lastIndex = 0;

            if (matches.length >= this.MAX_MATCHES) {
                return;
            }
        }
    }

    private formatMatches(matches: GrepMatch[]): string {
        if (matches.length === 0) {
            return 'No matches found.';
        }

        let resultMessage = JSON.stringify(matches, null, 2);
        if (matches.length >= this.MAX_MATCHES) {
            resultMessage += '\n\n(Note: Results were truncated to 100 matches.)';
        }

        return resultMessage;
    }
}
