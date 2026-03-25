import esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log(`[watch] build started: ${build.initialOptions.outfile}`);
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				if (location) {
					console.error(`    ${location.file}:${location.line}:${location.column}:`);
				}
			});
			console.log(`[watch] build finished: ${build.initialOptions.outfile}`);
		});
	},
};

async function main() {
	// Extension Host Build
	const extensionCtx = await esbuild.context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		format: 'esm',
		packages: 'bundle',
		minify: production,
		sourcemap: !production,
		sourcesContent: true,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin],
	});

	// Webview UI Build (Main Chat)
	const webviewChatCtx = await esbuild.context({
		entryPoints: ['src/webView/main.ts'],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		platform: 'browser',
		outfile: 'builtResources/chat.js',
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin],
	});

	// Webview Utility Build (Markdown)
	const webviewMarkdownCtx = await esbuild.context({
		entryPoints: ['src/webView/renderMarkDown.ts'],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		platform: 'browser',
		outfile: 'builtResources/renderMarkDown.js',
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin],
	});

	const contexts = [extensionCtx, webviewChatCtx, webviewMarkdownCtx];

	if (watch) {
		await Promise.all(contexts.map(ctx => ctx.watch()));
	} else {
		await Promise.all(contexts.map(ctx => ctx.rebuild()));
		await Promise.all(contexts.map(ctx => ctx.dispose()));
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
