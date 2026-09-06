import {expect, test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {getCloudrunHelp} from '../cli/help';

const commandHelpPages = [
	{args: [], documentation: '/docs/cloudrun/cli', option: null},
	{
		args: ['render'],
		documentation: '/docs/cloudrun/cli/render',
		option: '--service-name',
	},
	{
		args: ['still'],
		documentation: '/docs/cloudrun/cli/still',
		option: '--image-format',
	},
	{
		args: ['services'],
		documentation: '/docs/cloudrun/cli/services',
		option: null,
	},
	{
		args: ['services', 'deploy'],
		documentation: '/docs/cloudrun/cli/services/deploy',
		option: '--memoryLimit',
	},
	{
		args: ['services', 'ls'],
		documentation: '/docs/cloudrun/cli/services/ls',
		option: '--quiet',
	},
	{
		args: ['services', 'rm'],
		documentation: '/docs/cloudrun/cli/services/rm',
		option: '--yes',
	},
	{
		args: ['services', 'rmall'],
		documentation: '/docs/cloudrun/cli/services/rmall',
		option: '--yes',
	},
	{args: ['sites'], documentation: '/docs/cloudrun/cli/sites', option: null},
	{
		args: ['sites', 'create'],
		documentation: '/docs/cloudrun/cli/sites/create',
		option: '--site-name',
	},
	{
		args: ['sites', 'ls'],
		documentation: '/docs/cloudrun/cli/sites/ls',
		option: '--all-regions',
	},
	{
		args: ['sites', 'rm'],
		documentation: '/docs/cloudrun/cli/sites/rm',
		option: '--yes',
	},
	{
		args: ['sites', 'rmall'],
		documentation: '/docs/cloudrun/cli/sites/rmall',
		option: '--all-regions',
	},
	{
		args: ['permissions'],
		documentation: '/docs/cloudrun/cli/permissions',
		option: null,
	},
	{
		args: ['regions'],
		documentation: '/docs/cloudrun/cli/regions',
		option: null,
	},
] as const;

test('defines help for every Cloud Run command', () => {
	for (const {args, documentation, option} of commandHelpPages) {
		const lines = getCloudrunHelp(args);
		const output = lines.join('\n');
		const command = `remotion cloudrun${args.length === 0 ? '' : ` ${args.join(' ')}`}`;

		expect(output).toContain(command);
		expect(output).toContain(`https://www.remotion.dev${documentation}`);
		expect(output).toContain('Options:');
		const helpLine = lines.find((line) => line.includes('--help'));
		expect(helpLine).toContain('Show this help.');

		if (option) {
			const optionLine = lines.find((line) => line.includes(option));
			expect(optionLine).toBeDefined();
			expect(optionLine?.length).toBeGreaterThan(option.length + 2);
		}
	}

	const renderHelp = getCloudrunHelp(['render']).join('\n');
	expect(renderHelp).toContain('--buffer-size <value>');
	expect(renderHelp).toContain('--browser-executable <value>');
	expect(renderHelp).toContain('--quiet, -q');

	const stillHelp = getCloudrunHelp(['still']).join('\n');
	expect(stillHelp).toContain('--frame <value>');
	expect(stillHelp).toContain('--height <value>');
	expect(stillHelp).not.toContain('--offthreadvideo-video-threads');

	const createSiteHelp = getCloudrunHelp(['sites', 'create']).join('\n');
	expect(createSiteHelp).toContain('--bundle-cache');
	expect(createSiteHelp).toContain('--disable-ask-ai');
});

test('the Remotion CLI delegates Cloud Run help before loading config', () => {
	const exampleDirectory = path.join(__dirname, '..', '..', '..', 'example');
	const temporaryDirectory = mkdtempSync(
		path.join(exampleDirectory, '.tmp-cloudrun-cli-help-'),
	);
	writeFileSync(path.join(temporaryDirectory, 'package.json'), '{}\n');
	writeFileSync(
		path.join(temporaryDirectory, 'remotion.config.ts'),
		`throw new Error('The config file must not be loaded for --help');\n`,
	);
	const initialFiles = readdirSync(temporaryDirectory);
	const childEnvironment: NodeJS.ProcessEnv = {...process.env, NO_COLOR: '1'};
	delete childEnvironment.FORCE_COLOR;

	try {
		for (const invocation of [
			['cloudrun', 'render', '--help'],
			['help', 'cloudrun', 'render'],
		]) {
			const result = spawnSync(
				'node',
				[
					path.join(exampleDirectory, '..', 'cli', 'remotion-cli.js'),
					...invocation,
					'--log=error',
				],
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
			expect(result.stdout).toStartWith('remotion cloudrun render ');
			expect(result.stdout).not.toContain('©');
			expect(result.stdout).toContain('remotion cloudrun render');
			expect(result.stdout).toContain('--service-name <service-name>');
			expect(result.stdout).toContain(
				'https://www.remotion.dev/docs/cloudrun/cli/render',
			);
		}

		expect(readdirSync(temporaryDirectory)).toEqual(initialFiles);
	} finally {
		rmSync(temporaryDirectory, {recursive: true, force: true});
	}
}, 15_000);
