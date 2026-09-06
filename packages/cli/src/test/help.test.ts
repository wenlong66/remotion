import {expect, test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const cliPath = path.join(__dirname, '..', '..', 'remotion-cli.js');

const commandHelpPages = [
	{args: ['render'], documentation: '/docs/cli/render'},
	{args: ['studio'], documentation: '/docs/cli/studio'},
	{args: ['preview'], documentation: '/docs/cli/studio'},
	{args: ['still'], documentation: '/docs/cli/still'},
	{args: ['compositions'], documentation: '/docs/cli/compositions'},
	{args: ['lambda'], documentation: '/docs/lambda/cli'},
	{args: ['bundle'], documentation: '/docs/cli/bundle'},
	{args: ['browser'], documentation: '/docs/cli/browser'},
	{args: ['browser', 'ensure'], documentation: '/docs/cli/browser'},
	{args: ['cloudrun'], documentation: '/docs/cloudrun/cli'},
	{args: ['benchmark'], documentation: '/docs/cli/benchmark'},
	{args: ['skills'], documentation: '/docs/cli/skills'},
	{args: ['skills', 'add'], documentation: '/docs/cli/skills'},
	{args: ['skills', 'update'], documentation: '/docs/cli/skills'},
	{args: ['versions'], documentation: '/docs/cli/versions'},
	{args: ['upgrade'], documentation: '/docs/cli/upgrade'},
	{args: ['add'], documentation: '/docs/cli/add'},
	{args: ['gpu'], documentation: '/docs/cli/gpu'},
	{args: ['ffmpeg'], documentation: '/docs/cli/ffmpeg'},
	{args: ['ffprobe'], documentation: '/docs/cli/ffprobe'},
	{args: ['help'], documentation: '/docs/cli/help'},
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

	try {
		for (const {args, documentation} of commandHelpPages) {
			const result = spawnSync(
				'node',
				[cliPath, ...args, '--help', '--log=error'],
				{
					cwd: temporaryDirectory,
					encoding: 'utf8',
					env: {...process.env, NO_COLOR: '1'},
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
			expect(result.stdout).toContain(`remotion ${args[0]}`);
			expect(result.stdout).toContain(
				`https://www.remotion.dev${documentation}`,
			);
			expect(result.stdout).not.toContain('Available commands:');
		}

		expect(readdirSync(temporaryDirectory)).toEqual(initialFiles);
	} finally {
		rmSync(temporaryDirectory, {recursive: true, force: true});
	}
}, 30_000);
