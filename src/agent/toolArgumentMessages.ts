import { z } from 'zod';

/**
 * Builds the tool result text for a call whose arguments parsed correctly
 * but failed schema validation. The schema error details name the offending
 * parameters and describe what was received instead, which is the true
 * diagnostic for this failure class.
 */
export const composeInvalidArgumentsMessage = (toolName: string, errorDetails: string): string =>
    `Invalid arguments for tool '${toolName}': ${errorDetails}. Please correct the arguments and try again.`;

/**
 * Collects the names of the parameters a tool requires, by offering the
 * schema an empty object: every missing required field produces exactly one
 * path entry. Used on the damaged-arguments path, where the replacement
 * stub holds nothing and the tool's contract must be spelled out for the
 * model instead.
 */
export const extractRequiredParameterNames = (schema: z.ZodType<unknown>): string => {
    const parseResult = schema.safeParse({});
    if (parseResult.success) {
        return '';
    }
    const parameterNames = new Set<string>();
    for (const issue of parseResult.error.issues) {
        if (issue.path.length > 0) {
            parameterNames.add(issue.path.join('.'));
        }
    }
    return Array.from(parameterNames).join(', ');
};

/**
 * Builds the tool result text for a call whose streamed arguments text could
 * not be parsed as a JSON object. Schema validation is deliberately skipped
 * for this failure class: run against the replacement stub it would only
 * blame the stub, not the model's intent. The message therefore speaks with
 * the real parse error, the original emitted text and the tool's required
 * parameters, and ends with the single most practical correction advice.
 */
export const composeDamagedArgumentsMessage = (
    toolName: string,
    parseError: string,
    originalArguments: string,
    requiredParameters: string
): string => {
    const lines = [
        `The arguments for tool '${toolName}' could not be parsed as JSON: ${parseError}.`,
        `Original text sent before repair: ${originalArguments}`
    ];
    if (requiredParameters.length > 0) {
        lines.push(`Required parameters: ${requiredParameters}.`);
    }
    lines.push('Re-send with a valid JSON object; escape inner quotes and newlines (\\" \\n).');
    return lines.join('\n');
};
