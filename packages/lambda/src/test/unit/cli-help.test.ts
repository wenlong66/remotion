import {expect, test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {getLambdaHelp} from '../../cli/help';

const commandHelpPages = [
	{args: [], documentation: '/docs/lambda/cli', option: null},
	{
		args: ['render'],
		documentation: '/docs/lambda/cli/render',
		option: '--region',
	},
	{args: ['still'], documentation: '/docs/lambda/cli/still', option: '--frame'},
	{
		args: ['compositions'],
		documentation: '/docs/lambda/cli/compositions',
		option: '--props',
	},
	{
		args: ['functions'],
		documentation: '/docs/lambda/cli/functions',
		option: null,
	},
	{
		args: ['functions', 'deploy'],
		documentation: '/docs/lambda/cli/functions/deploy',
		option: '--memory',
	},
	{
		args: ['functions', 'ls'],
		documentation: '/docs/lambda/cli/functions/ls',
		option: '--compatible-only',
	},
	{
		args: ['functions', 'rm'],
		documentation: '/docs/lambda/cli/functions/rm',
		option: '--yes',
	},
	{
		args: ['functions', 'rmall'],
		documentation: '/docs/lambda/cli/functions/rmall',
		option: '--yes',
	},
	{args: ['sites'], documentation: '/docs/lambda/cli/sites', option: null},
	{
		args: ['sites', 'create'],
		documentation: '/docs/lambda/cli/sites/create',
		option: '--site-name',
	},
	{
		args: ['sites', 'ls'],
		documentation: '/docs/lambda/cli/sites/ls',
		option: '--compatible-only',
	},
	{
		args: ['sites', 'rm'],
		documentation: '/docs/lambda/cli/sites/rm',
		option: '--yes',
	},
	{
		args: ['sites', 'rmall'],
		documentation: '/docs/lambda/cli/sites/rmall',
		option: '--yes',
	},
	{
		args: ['policies'],
		documentation: '/docs/lambda/cli/policies',
		option: null,
	},
	{
		args: ['policies', 'role'],
		documentation: '/docs/lambda/cli/policies',
		option: null,
	},
	{
		args: ['policies', 'user'],
		documentation: '/docs/lambda/cli/policies',
		option: null,
	},
	{
		args: ['policies', 'validate'],
		documentation: '/docs/lambda/cli/policies',
		option: null,
	},
	{
		args: ['regions'],
		documentation: '/docs/lambda/cli/regions',
		option: '--default-only',
	},
	{
		args: ['quotas'],
		documentation: '/docs/lambda/cli/quotas',
		option: '--region',
	},
	{
		args: ['quotas', 'increase'],
		documentation: '/docs/lambda/cli/quotas',
		option: '--force',
	},
] as const;

test('defines help for every Lambda command', () => {
	for (const {args, documentation, option} of commandHelpPages) {
		const lines = getLambdaHelp(args);
		const output = lines.join('\n');
		const command = `remotion lambda${args.length === 0 ? '' : ` ${args.join(' ')}`}`;

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

	const renderHelp = getLambdaHelp(['render']).join('\n');
	expect(renderHelp).toContain('--buffer-size <value>');
	expect(renderHelp).toContain('--enable-multiprocess-on-linux');

	const stillHelp = getLambdaHelp(['still']).join('\n');
	expect(stillHelp).toContain('--function-name <name>');
	expect(stillHelp).toContain('--height <value>');

	const compositionsHelp = getLambdaHelp(['compositions']).join('\n');
	expect(compositionsHelp).toContain('--region <region>');
	expect(compositionsHelp).toContain('--function-name <name>');
	expect(compositionsHelp).not.toContain('--media-cache-size-in-bytes');
	expect(compositionsHelp).not.toContain('--offthreadvideo-video-threads');
	expect(compositionsHelp).not.toContain('--force-path-style');

	const deployFunctionHelp = getLambdaHelp(['functions', 'deploy']).join('\n');
	expect(deployFunctionHelp).toContain('--timeout <seconds>');
	expect(deployFunctionHelp).toContain(
		'--runtime-preference <default|apple-emojis|cjk>',
	);

	const removeFunctionHelp = getLambdaHelp(['functions', 'rm']).join('\n');
	expect(removeFunctionHelp).toContain('--force, -f');

	const createSiteHelp = getLambdaHelp(['sites', 'create']).join('\n');
	expect(createSiteHelp).toContain('--privacy <public|no-acl>');
	expect(createSiteHelp).not.toContain('public|private|no-acl');

	const listSitesHelp = getLambdaHelp(['sites', 'ls']).join('\n');
	expect(listSitesHelp).not.toContain('--force-path-style');

	const policyHelp = getLambdaHelp(['policies', 'validate']).join('\n');
	expect(policyHelp).toContain('--region <region>');
});

test('the Remotion CLI delegates Lambda help before loading config', () => {
	const exampleDirectory = path.join(
		__dirname,
		'..',
		'..',
		'..',
		'..',
		'example',
	);
	const temporaryDirectory = mkdtempSync(
		path.join(exampleDirectory, '.tmp-lambda-cli-help-'),
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
		const result = spawnSync(
			'node',
			[
				path.join(exampleDirectory, '..', 'cli', 'remotion-cli.js'),
				'lambda',
				'render',
				'--help',
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
		expect(result.stdout).toStartWith('remotion lambda render ');
		expect(result.stdout).not.toContain('©');
		expect(result.stdout).toContain('remotion lambda render');
		expect(result.stdout).toContain('--frames-per-lambda <count>');
		expect(result.stdout).toContain(
			'https://www.remotion.dev/docs/lambda/cli/render',
		);
		expect(readdirSync(temporaryDirectory)).toEqual(initialFiles);
	} finally {
		rmSync(temporaryDirectory, {recursive: true, force: true});
	}
}, 15_000);
