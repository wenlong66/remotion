import {expect, test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const cliPath = path.join(__dirname, '..', '..', 'remotion-cli.js');

const commandHelpPages: readonly {
	args: readonly string[];
	documentation: string;
	options: readonly string[];
	excludedOptions?: readonly string[];
}[] = [
	{
		args: ['render'],
		documentation: '/docs/cli/render',
		options: ['--codec', '--sequence', '--public-path', '--public-license-key'],
	},
	{
		args: ['studio'],
		documentation: '/docs/cli/studio',
		options: ['--editor', '--port'],
	},
	{
		args: ['preview'],
		documentation: '/docs/cli/studio',
		options: ['--editor', '--port'],
	},
	{
		args: ['still'],
		documentation: '/docs/cli/still',
		options: ['--frame', '--image-format', '--height', '--audio-latency-hint'],
	},
	{
		args: ['compositions'],
		documentation: '/docs/cli/compositions',
		options: ['--props', '--browser-executable', '--gl'],
	},
	{args: ['lambda'], documentation: '/docs/lambda/cli', options: []},
	{
		args: ['bundle'],
		documentation: '/docs/cli/bundle',
		options: ['--out-dir', '--bundle-cache', '--quiet'],
	},
	{args: ['browser'], documentation: '/docs/cli/browser', options: []},
	{
		args: ['browser', 'ensure'],
		documentation: '/docs/cli/browser/ensure',
		options: ['--browser-executable', '--quiet'],
		excludedOptions: ['--chrome-mode'],
	},
	{args: ['cloudrun'], documentation: '/docs/cloudrun/cli', options: []},
	{
		args: ['benchmark'],
		documentation: '/docs/cli/benchmark',
		options: ['--runs', '--concurrencies', '--concurrency', '--x264-preset'],
		excludedOptions: ['--audio-codec'],
	},
	{args: ['skills'], documentation: '/docs/cli/skills', options: []},
	{args: ['skills', 'add'], documentation: '/docs/cli/skills', options: []},
	{args: ['skills', 'update'], documentation: '/docs/cli/skills', options: []},
	{args: ['versions'], documentation: '/docs/cli/versions', options: []},
	{
		args: ['upgrade'],
		documentation: '/docs/cli/upgrade',
		options: ['--package-manager'],
	},
	{
		args: ['add'],
		documentation: '/docs/cli/add',
		options: ['--package-manager'],
	},
	{
		args: ['gpu'],
		documentation: '/docs/cli/gpu',
		options: ['--gl', '--browser-executable', '--timeout', '--quiet'],
	},
	{args: ['ffmpeg'], documentation: '/docs/cli/ffmpeg', options: []},
	{args: ['ffprobe'], documentation: '/docs/cli/ffprobe', options: []},
	{args: ['help'], documentation: '/docs/cli/help', options: []},
] as const;

test('prints command-specific help without running the command', () => {
	const temporaryDirectory = mkdtempSync(
		path.join(tmpdir(), 'remotion-cli-help-'),
	);
	writeFileSync(
		path.join(temporaryDirectory, 'remotion.config.ts'),
		`throw new Error('The config file must not be loaded for --help');\n`,
	);
	const initialFiles = readdirSync(temporaryDirectory);
	const childEnvironment: NodeJS.ProcessEnv = {...process.env, NO_COLOR: '1'};
	delete childEnvironment.FORCE_COLOR;

	try {
		for (const {
			args,
			documentation,
			options,
			excludedOptions = [],
		} of commandHelpPages) {
			const result = spawnSync(
				'node',
				[cliPath, ...args, '--help', '--log=error'],
				{
					cwd: temporaryDirectory,
					encoding: 'utf8',
					env: childEnvironment,
					stdio: ['ignore', 'pipe', 'pipe'],
					timeout: 10_000,
				},
			);

			if (result.error) {
				throw result.error;
			}

			expect(result.signal).toBeNull();
			expect(result.status).toBe(0);
			expect(result.stderr).toBe('');
			expect(result.stdout).toContain(`remotion ${args.join(' ')}`);
			expect(result.stdout).toContain(
				`https://www.remotion.dev${documentation}`,
			);
			expect(result.stdout).not.toContain('Available commands:');
			expect(result.stdout).toContain('Options:');
			for (const option of ['--help', ...options]) {
				const optionLine = result.stdout.split('\n').find((line) => {
					const trimmed = line.trimStart();
					return (
						trimmed.startsWith(`${option} `) || trimmed.startsWith(`${option},`)
					);
				});
				if (!optionLine) {
					throw new Error(
						`Expected \`remotion ${args.join(' ')} --help\` to document ${option}`,
					);
				}
			}

			for (const option of excludedOptions) {
				expect(result.stdout).not.toContain(option);
			}
		}

		expect(readdirSync(temporaryDirectory)).toEqual(initialFiles);
	} finally {
		rmSync(temporaryDirectory, {recursive: true, force: true});
	}
}, 60_000);
