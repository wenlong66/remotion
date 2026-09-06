import type {
	AwsProvider,
	AwsRegion,
	RuntimePreference,
} from '@remotion/lambda-client';
import type {LogLevel} from '@remotion/renderer';
import type {
	FullClientSpecifics,
	ProviderSpecifics,
} from '@remotion/serverless';
import type {
	DeploySiteOutput,
	InternalDeploySiteInput,
} from './api/deploy-site';
import {internalDeploySite} from './api/deploy-site';
import type {PrintHelp} from './cli/help';
import {executeCommand} from './cli/index';
import {getLayers} from './shared/get-layers';
import type {AwsLayer} from './shared/hosted-layers';

export const LambdaInternals: {
	executeCommand: (
		args: string[],
		remotionRoot: string,
		logLevel: LogLevel,
		providerSpecifics: ProviderSpecifics<AwsProvider> | null,
		fullClientSpecifics: FullClientSpecifics<AwsProvider> | null,
	) => Promise<void>;
	printHelp: (selectedPath: readonly string[], logLevel: LogLevel) => void;
	internalDeploySite: (input: InternalDeploySiteInput) => DeploySiteOutput;
	getLayers: (options: {
		option: RuntimePreference;
		region: AwsRegion;
	}) => AwsLayer[];
} = {
	executeCommand,
	printHelp: (selectedPath, logLevel) => {
		const {printHelp} = require('./cli/help') as {printHelp: PrintHelp};
		printHelp(selectedPath, logLevel);
	},
	internalDeploySite,
	getLayers,
};

export type {OverallRenderProgress as _InternalOverallRenderProgress} from '@remotion/serverless';
