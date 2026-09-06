import type {LogLevel} from '@remotion/renderer';
import {BROWSER_COMMAND} from './browser';
import {chalk} from './chalk';
import {GPU_COMMAND} from './gpu';
import {Log} from './log';
import {VERSIONS_COMMAND} from './versions';

const packagejson = require('../package.json');

type CommandHelp = {
	name: string;
	aliases: readonly string[];
	args: string;
	description: string;
	documentation: string;
};

const commandHelp: readonly CommandHelp[] = [
	{
		name: 'studio',
		aliases: ['preview'],
		args: ' <entry-point>?',
		description: 'Start the Remotion Studio.',
		documentation: 'https://www.remotion.dev/docs/cli/studio',
	},
	{
		name: 'render',
		aliases: [],
		args: ' <entry-point|serve-url>? <composition-id> <output-location>',
		description: 'Render video, audio or an image sequence.',
		documentation: 'https://www.remotion.dev/docs/cli/render',
	},
	{
		name: 'still',
		aliases: [],
		args: ' <serve-url|entry-point>? [<composition-id>] [<output-location>]',
		description: 'Render a still frame and save it as an image.',
		documentation: 'https://www.remotion.dev/docs/cli/still',
	},
	{
		name: 'compositions',
		aliases: [],
		args: ' <serve-url|entry-file>?',
		description: 'Prints the available compositions.',
		documentation: 'https://www.remotion.dev/docs/cli/compositions',
	},
	{
		name: 'lambda',
		aliases: [],
		args: ' <command>',
		description: 'Control Remotion Lambda.',
		documentation: 'https://www.remotion.dev/docs/lambda/cli',
	},
	{
		name: 'bundle',
		aliases: [],
		args: ' <serve-url|entry-file>?',
		description: 'Create a Remotion bundle to be deployed to the web.',
		documentation: 'https://www.remotion.dev/docs/cli/bundle',
	},
	{
		name: BROWSER_COMMAND,
		aliases: [],
		args: ' <command>',
		description: 'Ensure Remotion has a browser it can use for rendering.',
		documentation: 'https://www.remotion.dev/docs/cli/browser',
	},
	{
		name: 'cloudrun',
		aliases: [],
		args: ' <command>',
		description: 'Control Remotion Cloud Run.',
		documentation: 'https://www.remotion.dev/docs/cloudrun/cli',
	},
	{
		name: 'benchmark',
		aliases: [],
		args: ' <entry-point> [composition-ids]',
		description:
			'Benchmarks rendering a composition. Same options as for render.',
		documentation: 'https://www.remotion.dev/docs/cli/benchmark',
	},
	{
		name: 'skills',
		aliases: [],
		args: ' <add | update>',
		description: 'Install or update skills from remotion-dev/skills.',
		documentation: 'https://www.remotion.dev/docs/cli/skills',
	},
	{
		name: VERSIONS_COMMAND,
		aliases: [],
		args: '',
		description: 'Prints and validates versions of all Remotion packages.',
		documentation: 'https://www.remotion.dev/docs/cli/versions',
	},
	{
		name: 'upgrade',
		aliases: [],
		args: '',
		description: 'Ensure Remotion is on the newest version.',
		documentation: 'https://www.remotion.dev/docs/cli/upgrade',
	},
	{
		name: 'add',
		aliases: [],
		args: ' <package-name...>',
		description: 'Add Remotion packages with the correct version.',
		documentation: 'https://www.remotion.dev/docs/cli/add',
	},
	{
		name: GPU_COMMAND,
		aliases: [],
		args: '',
		description: 'Prints information about how Chrome uses the GPU.',
		documentation: 'https://www.remotion.dev/docs/cli/gpu',
	},
	{
		name: 'ffmpeg',
		aliases: [],
		args: ' <arguments...>',
		description: 'Execute an FFmpeg command.',
		documentation: 'https://www.remotion.dev/docs/cli/ffmpeg',
	},
	{
		name: 'ffprobe',
		aliases: [],
		args: ' <arguments...>',
		description: 'Execute an FFprobe command.',
		documentation: 'https://www.remotion.dev/docs/cli/ffprobe',
	},
	{
		name: 'help',
		aliases: [],
		args: '',
		description: 'Print available commands and flags for the Remotion CLI.',
		documentation: 'https://www.remotion.dev/docs/cli/help',
	},
];

const printCommandHelp = ({
	command,
	displayName,
	logLevel,
}: {
	command: CommandHelp;
	displayName: string;
	logLevel: LogLevel;
}) => {
	Log.info(
		{indent: false, logLevel},
		chalk.blue(`remotion ${displayName}`) + chalk.gray(command.args),
	);
	Log.info({indent: false, logLevel}, command.description);
	Log.info({indent: false, logLevel}, chalk.gray(command.documentation));
};

export const printHelp = (
	logLevel: LogLevel,
	selectedCommand: string | null,
) => {
	Log.info({indent: false, logLevel}, `@remotion/cli ${packagejson.version}`);
	Log.info(
		{indent: false, logLevel},
		`© ${new Date().getFullYear()} Remotion AG`,
	);

	if (selectedCommand !== null) {
		const selectedCommandHelp = commandHelp.find(
			(command) =>
				command.name === selectedCommand ||
				command.aliases.includes(selectedCommand),
		);
		if (selectedCommandHelp) {
			Log.info({indent: false, logLevel});
			printCommandHelp({
				command: selectedCommandHelp,
				displayName: selectedCommand,
				logLevel,
			});
			return;
		}
	}

	Log.info({indent: false, logLevel});
	Log.info({indent: false, logLevel}, 'Available commands:');

	for (const command of commandHelp) {
		Log.info({indent: false, logLevel});
		printCommandHelp({command, displayName: command.name, logLevel});
	}

	Log.info({indent: false, logLevel});
	Log.info(
		{indent: false, logLevel},
		'Visit https://www.remotion.dev/docs/cli for browsable CLI documentation.',
	);
};
