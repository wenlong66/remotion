import {beforeEach, expect, mock, test} from 'bun:test';

let initializationCount = 0;
let initializationStarted: ((count: number) => void) | null = null;
let initializationGate: Promise<void> | null = null;
let initializationOptions: Record<string, unknown> | null = null;
let initializationEnvironment:
	| {
			remoteHost: string;
			remotePathTemplate: string;
	  }
	| undefined;
let initializationEnvironmentAfterLoading:
	| {
			remoteHost: string;
			remotePathTemplate: string;
	  }
	| undefined;
let initializedModelId: string | null = null;
const initializedModelIds: string[] = [];
const initializedProcessorModelIds: string[] = [];
let pipelineConstructionCount = 0;
let pipelineRunCount = 0;
let livePipelineCount = 0;
let maxLivePipelineCount = 0;
let disposeCalls = 0;
let disposalStarted: ((pipeline: number) => void) | null = null;
let disposalGate: Promise<void> | null = null;
let cacheCheck:
	| {
			task: string;
			modelId: string;
			options: Record<string, unknown>;
	  }
	| undefined;
let cacheCheckEnvironment:
	| {
			remoteHost: string;
			remotePathTemplate: string;
	  }
	| undefined;
let cacheCheckError: Error | null = null;

const originalTransformersEnvironment = {
	remoteHost: 'https://huggingface.co/',
	remotePathTemplate: '{model}/resolve/{revision}/',
};
const transformersEnvironment = {...originalTransformersEnvironment};
const preexistingWhisperModelHostState = {
	activeOperations: 0,
	previousRemoteConfiguration: null as
		| typeof originalTransformersEnvironment
		| null,
};
Object.defineProperty(
	transformersEnvironment,
	Symbol.for('@remotion/whisper-webgpu/model-host-state'),
	{value: preexistingWhisperModelHostState},
);

function FakeBackgroundRemovalPipeline() {
	const pipeline = ++pipelineConstructionCount;
	livePipelineCount++;
	maxLivePipelineCount = Math.max(maxLivePipelineCount, livePipelineCount);

	return Object.assign(
		() => {
			pipelineRunCount++;
			return Promise.resolve({
				data: new Uint8ClampedArray([10, 20, 30, 128]),
				width: 1,
				height: 1,
				channels: 4,
			});
		},
		{
			dispose: async () => {
				disposeCalls++;
				disposalStarted?.(pipeline);
				await disposalGate;
				livePipelineCount--;
			},
		},
	);
}

mock.module('@huggingface/transformers', () => ({
	env: transformersEnvironment,
	AutoModelForImageSegmentation: {
		from_pretrained: async (
			modelId: string,
			options: Record<string, unknown>,
		) => {
			initializationCount++;
			initializedModelId = modelId;
			initializedModelIds.push(modelId);
			initializationOptions = options;
			initializationEnvironment = {...transformersEnvironment};
			initializationStarted?.(initializationCount);
			await initializationGate;
			initializationEnvironmentAfterLoading = {...transformersEnvironment};

			const onProgress = options.progress_callback as
				| ((event: Record<string, unknown>) => void)
				| undefined;
			onProgress?.({
				status: 'progress',
				file: 'config.json',
				loaded: 83,
			});
			onProgress?.({
				status: 'progress',
				file: 'onnx/model.onnx',
				loaded: 25_888_640,
			});
			return {
				dispose: () => Promise.resolve(),
			};
		},
	},
	AutoProcessor: {
		from_pretrained: (modelId: string, options: Record<string, unknown>) => {
			initializedProcessorModelIds.push(modelId);
			const onProgress = options.progress_callback as
				| ((event: Record<string, unknown>) => void)
				| undefined;
			onProgress?.({
				status: 'progress',
				file: 'preprocessor_config.json',
				loaded: 365,
			});
			return Promise.resolve({});
		},
	},
	BackgroundRemovalPipeline: FakeBackgroundRemovalPipeline,
	ModelRegistry: {
		is_pipeline_cached: (
			task: string,
			modelId: string,
			options: Record<string, unknown>,
		) => {
			cacheCheck = {task, modelId, options};
			cacheCheckEnvironment = {...transformersEnvironment};
			if (cacheCheckError) {
				return Promise.reject(cacheCheckError);
			}

			return Promise.resolve(true);
		},
	},
}));

const getRuntime = () => import('../load-video-matting-model');

beforeEach(async () => {
	disposalGate = null;
	initializationGate = null;
	const {disposeVideoMattingModel} = await getRuntime();
	await disposeVideoMattingModel();

	initializationCount = 0;
	initializationStarted = null;
	initializationGate = null;
	initializationOptions = null;
	initializationEnvironment = undefined;
	initializationEnvironmentAfterLoading = undefined;
	initializedModelId = null;
	initializedModelIds.length = 0;
	initializedProcessorModelIds.length = 0;
	pipelineConstructionCount = 0;
	pipelineRunCount = 0;
	livePipelineCount = 0;
	maxLivePipelineCount = 0;
	disposeCalls = 0;
	disposalStarted = null;
	disposalGate = null;
	cacheCheck = undefined;
	cacheCheckEnvironment = undefined;
	cacheCheckError = null;
	preexistingWhisperModelHostState.activeOperations = 0;
	preexistingWhisperModelHostState.previousRemoteConfiguration = null;
	Object.assign(transformersEnvironment, originalTransformersEnvironment);
});

test('removes only legacy pinned Hugging Face models from the shared browser cache', async () => {
	const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
	const cacheEnvironment =
		transformersEnvironment as typeof transformersEnvironment & {
			cacheKey: string;
		};
	cacheEnvironment.cacheKey = 'custom-transformers-cache';
	const legacyModnet = new Request(
		'https://huggingface.co/Xenova/modnet/resolve/fa2fa546052fba4c08921230a26cc69a333fca12/config.json',
	);
	const legacyBen2 = new Request(
		'https://huggingface.co/onnx-community/BEN2-ONNX/resolve/c552aa82688edce09f0ac9d2e31ad53d9d629010/onnx/model_fp16.onnx',
	);
	const sameModelDifferentRevision = new Request(
		'https://huggingface.co/Xenova/modnet/resolve/main/config.json',
	);
	const currentHostedModel = new Request(
		'https://remotion.media/models/modnet-v1/config.json',
	);
	const unrelatedModel = new Request(
		'https://huggingface.co/onnx-community/background-removal/resolve/main/config.json',
	);
	const deleted: string[] = [];
	Object.defineProperty(globalThis, 'caches', {
		configurable: true,
		value: {
			open: (cacheKey: string) => {
				expect(cacheKey).toBe('custom-transformers-cache');
				return Promise.resolve({
					delete: (request: Request) => {
						deleted.push(request.url);
						return Promise.resolve(true);
					},
					keys: () =>
						Promise.resolve([
							legacyModnet,
							legacyBen2,
							sameModelDifferentRevision,
							currentHostedModel,
							unrelatedModel,
						]),
				});
			},
		} as unknown as CacheStorage,
	});

	try {
		const {clearStaleVideoMattingModels} = await import('../index');
		await clearStaleVideoMattingModels();
		expect(deleted).toEqual([legacyModnet.url, legacyBen2.url]);
	} finally {
		Reflect.deleteProperty(cacheEnvironment, 'cacheKey');
		if (originalCaches) {
			Object.defineProperty(globalThis, 'caches', originalCaches);
		} else {
			Reflect.deleteProperty(globalThis, 'caches');
		}
	}
});

test('coalesces initialization and defers disposal until active work is done', async () => {
	const {
		disposeVideoMattingModel,
		loadVideoMattingModel,
		withLoadedVideoMattingPipeline,
	} = await getRuntime();
	const {isVideoMattingModelCached} =
		await import('../is-video-matting-model-cached');

	let releaseInitialization: () => void = () => undefined;
	initializationGate = new Promise<void>((resolve) => {
		releaseInitialization = resolve;
	});
	const started = new Promise<void>((resolve) => {
		initializationStarted = () => resolve();
	});
	const firstProgress: number[] = [];
	const firstLoadedBytes: number[] = [];
	const firstTotalBytes: number[] = [];
	const secondProgress: number[] = [];
	const first = loadVideoMattingModel({
		model: 'modnet',
		onProgress: ({loadedBytes, progress, totalBytes}) => {
			if (progress !== null) {
				firstProgress.push(progress);
			}

			if (loadedBytes !== null) {
				firstLoadedBytes.push(loadedBytes);
			}

			if (totalBytes !== null) {
				firstTotalBytes.push(totalBytes);
			}
		},
	});
	const second = loadVideoMattingModel({
		model: 'modnet',
		onProgress: ({progress}) => {
			if (progress !== null) {
				secondProgress.push(progress);
			}
		},
	});

	await started;
	expect(initializationCount).toBe(1);
	expect(initializedModelId).toBe('modnet-v1');
	expect(initializationEnvironment).toEqual({
		remoteHost: 'https://remotion.media/',
		remotePathTemplate: 'models/{model}/',
	});
	expect(transformersEnvironment).toEqual({
		remoteHost: 'https://remotion.media/',
		remotePathTemplate: 'models/{model}/',
	});
	expect(
		(
			transformersEnvironment as typeof transformersEnvironment &
				Record<symbol, unknown>
		)[Symbol.for('@remotion/whisper-webgpu/model-host-state')],
	).toBe(preexistingWhisperModelHostState);
	expect(preexistingWhisperModelHostState).toMatchObject({
		activeOperations: 1,
		previousRemoteConfiguration: originalTransformersEnvironment,
	});
	expect(await isVideoMattingModelCached({model: 'modnet'})).toBe(true);
	expect(cacheCheck).toEqual({
		task: 'background-removal',
		modelId: 'modnet-v1',
		options: {
			device: 'webgpu',
			dtype: 'fp32',
		},
	});
	expect(cacheCheckEnvironment).toEqual({
		remoteHost: 'https://remotion.media/',
		remotePathTemplate: 'models/{model}/',
	});
	expect(transformersEnvironment).toEqual({
		remoteHost: 'https://remotion.media/',
		remotePathTemplate: 'models/{model}/',
	});
	releaseInitialization();
	expect(await Promise.all([first, second])).toEqual([
		{alreadyLoaded: false},
		{alreadyLoaded: true},
	]);
	expect(initializationEnvironmentAfterLoading).toEqual(
		initializationEnvironment,
	);
	expect(initializationOptions).toMatchObject({
		device: 'webgpu',
		dtype: 'fp32',
	});
	expect(initializationOptions).not.toHaveProperty('revision');
	expect(firstProgress.at(-1)).toBe(1);
	expect(secondProgress.at(-1)).toBe(1);
	expect(Math.max(...firstLoadedBytes)).toBe(25_889_088);
	expect(new Set(firstTotalBytes)).toEqual(new Set([25_889_088]));
	expect(transformersEnvironment).toEqual(originalTransformersEnvironment);

	let releaseUse: () => void = () => undefined;
	const useGate = new Promise<void>((resolve) => {
		releaseUse = resolve;
	});
	let markUseStarted: () => void = () => undefined;
	const useStarted = new Promise<void>((resolve) => {
		markUseStarted = resolve;
	});
	const use = withLoadedVideoMattingPipeline({
		model: 'modnet',
		signal: null,
		run: async (pipeline) => {
			const result = await pipeline({} as OffscreenCanvas);
			markUseStarted();
			await useGate;
			return result;
		},
	});
	await useStarted;
	const disposal = disposeVideoMattingModel({model: 'modnet'});
	await Promise.resolve();
	expect(disposeCalls).toBe(0);

	releaseUse();
	expect(await use).toEqual({
		data: new Uint8ClampedArray([10, 20, 30, 128]),
		width: 1,
		height: 1,
		channels: 4,
	});
	await disposal;
	expect(disposeCalls).toBe(1);
	expect(livePipelineCount).toBe(0);
});

test('loads every public model from its immutable hosted model ID', async () => {
	const {
		disposeVideoMattingModel,
		getAvailableVideoMattingModels,
		loadVideoMattingModel,
	} = await import('../index');
	const models = getAvailableVideoMattingModels();

	for (const model of models) {
		await loadVideoMattingModel({model: model.name});
		await disposeVideoMattingModel({model: model.name});
	}

	expect(initializedProcessorModelIds).toEqual(['modnet-v1', 'ben2-base-v1']);
	expect(initializedModelIds).toEqual(['modnet-v1', 'ben2-base-v1']);
	expect(models.map(({modelId}) => modelId)).toEqual([
		'Xenova/modnet',
		'onnx-community/BEN2-ONNX',
	]);
	expect(models.map(({webGpuDownloadSize}) => webGpuDownloadSize)).toEqual([
		25_889_088, 219_122_146,
	]);
	expect(transformersEnvironment).toEqual(originalTransformersEnvironment);
});

test('keeps the shared hosted environment active for concurrent model loads', async () => {
	const {disposeVideoMattingModel, loadVideoMattingModel} = await getRuntime();
	let releaseInitialization: () => void = () => undefined;
	initializationGate = new Promise<void>((resolve) => {
		releaseInitialization = resolve;
	});
	const bothStarted = new Promise<void>((resolve) => {
		initializationStarted = (count) => {
			if (count === 2) {
				resolve();
			}
		};
	});
	const modnet = loadVideoMattingModel({model: 'modnet'});
	const ben2 = loadVideoMattingModel({model: 'ben2-base'});

	await bothStarted;
	const environmentWithState =
		transformersEnvironment as typeof transformersEnvironment &
			Record<symbol, unknown>;
	const sharedState =
		environmentWithState[
			Symbol.for('@remotion/whisper-webgpu/model-host-state')
		];
	expect(sharedState).toMatchObject({
		activeOperations: 2,
		previousRemoteConfiguration: originalTransformersEnvironment,
	});
	expect(
		environmentWithState[Symbol.for('@remotion/transformers/model-host-state')],
	).toBe(sharedState);
	expect(transformersEnvironment).toEqual({
		remoteHost: 'https://remotion.media/',
		remotePathTemplate: 'models/{model}/',
	});

	releaseInitialization();
	expect(await Promise.all([modnet, ben2])).toEqual([
		{alreadyLoaded: false},
		{alreadyLoaded: false},
	]);
	expect(transformersEnvironment).toEqual(originalTransformersEnvironment);

	await disposeVideoMattingModel();
});

test('restores the Transformers environment after a hosted operation fails', async () => {
	const {isVideoMattingModelCached} =
		await import('../is-video-matting-model-cached');
	cacheCheckError = new Error('Could not read the model cache');

	try {
		await expect(
			isVideoMattingModelCached({model: 'ben2-base'}),
		).rejects.toThrow('Could not read the model cache');
		expect(cacheCheck).toMatchObject({
			modelId: 'ben2-base-v1',
			options: {device: 'webgpu', dtype: 'fp16'},
		});
		expect(cacheCheckEnvironment).toEqual({
			remoteHost: 'https://remotion.media/',
			remotePathTemplate: 'models/{model}/',
		});
		expect(transformersEnvironment).toEqual(originalTransformersEnvironment);
	} finally {
		cacheCheckError = null;
	}
});

test('only restores Transformers environment fields left unchanged by the consumer', async () => {
	const {disposeVideoMattingModel, loadVideoMattingModel} = await getRuntime();
	let releaseInitialization: () => void = () => undefined;
	initializationGate = new Promise<void>((resolve) => {
		releaseInitialization = resolve;
	});
	const started = new Promise<void>((resolve) => {
		initializationStarted = () => resolve();
	});
	const loading = loadVideoMattingModel({model: 'modnet'});

	try {
		await started;
		transformersEnvironment.remoteHost = 'https://models.example.com/';
		releaseInitialization();
		await loading;
		expect(transformersEnvironment).toEqual({
			remoteHost: 'https://models.example.com/',
			remotePathTemplate: '{model}/resolve/{revision}/',
		});
		await disposeVideoMattingModel({model: 'modnet'});
	} finally {
		releaseInitialization();
		initializationGate = null;
		initializationStarted = null;
		Object.assign(transformersEnvironment, originalTransformersEnvironment);
	}
});

test('isolates throwing progress observers from shared loading', async () => {
	const {disposeVideoMattingModel, loadVideoMattingModel} = await getRuntime();

	let throwingObserverCalls = 0;
	const successfulProgress: number[] = [];
	const throwingLoad = loadVideoMattingModel({
		model: 'modnet',
		onProgress: () => {
			throwingObserverCalls++;
			throw new Error('observer failed');
		},
	});
	const successfulLoad = loadVideoMattingModel({
		model: 'modnet',
		onProgress: ({progress}) => {
			if (progress !== null) {
				successfulProgress.push(progress);
			}
		},
	});

	expect(await Promise.all([throwingLoad, successfulLoad])).toEqual([
		{alreadyLoaded: false},
		{alreadyLoaded: true},
	]);
	expect(throwingObserverCalls).toBeGreaterThan(0);
	expect(successfulProgress.at(-1)).toBe(1);
	expect(initializationCount).toBe(1);
	expect(disposeCalls).toBe(0);

	let replayCalls = 0;
	expect(
		await loadVideoMattingModel({
			model: 'modnet',
			onProgress: () => {
				replayCalls++;
				throw new Error('replayed observer failed');
			},
		}),
	).toEqual({alreadyLoaded: true});
	expect(replayCalls).toBe(1);

	await disposeVideoMattingModel({model: 'modnet'});
	expect(disposeCalls).toBe(1);
	expect(livePipelineCount).toBe(0);
});

test('aborts a caller waiting for shared initialization without canceling it', async () => {
	const {
		disposeVideoMattingModel,
		loadVideoMattingModel,
		withLoadedVideoMattingPipeline,
	} = await getRuntime();

	let releaseInitialization: () => void = () => undefined;
	initializationGate = new Promise<void>((resolve) => {
		releaseInitialization = resolve;
	});
	const started = new Promise<void>((resolve) => {
		initializationStarted = () => resolve();
	});
	const controller = new AbortController();
	const abortReason = new Error('stop waiting');
	let runCalls = 0;
	let progressCalls = 0;
	const use = withLoadedVideoMattingPipeline({
		model: 'modnet',
		onProgress: () => {
			progressCalls++;
		},
		signal: controller.signal,
		run: () => {
			runCalls++;
			return Promise.resolve();
		},
	});

	await started;
	const progressCallsBeforeAbort = progressCalls;
	controller.abort(abortReason);
	await expect(use).rejects.toBe(abortReason);
	expect(runCalls).toBe(0);

	const sharedLoad = loadVideoMattingModel({model: 'modnet'});
	releaseInitialization();
	expect(await sharedLoad).toEqual({alreadyLoaded: true});
	expect(initializationCount).toBe(1);
	expect(progressCalls).toBe(progressCallsBeforeAbort);

	const result = await withLoadedVideoMattingPipeline({
		model: 'modnet',
		signal: null,
		run: (pipeline) => pipeline({} as OffscreenCanvas),
	});
	expect(result.data).toEqual(new Uint8ClampedArray([10, 20, 30, 128]));
	expect(pipelineRunCount).toBe(1);

	await disposeVideoMattingModel({model: 'modnet'});
	expect(disposeCalls).toBe(1);
	expect(livePipelineCount).toBe(0);
});

test('waits for disposal before constructing a replacement pipeline', async () => {
	const {disposeVideoMattingModel, loadVideoMattingModel} = await getRuntime();

	await loadVideoMattingModel({model: 'modnet'});
	expect(initializationCount).toBe(1);
	expect(livePipelineCount).toBe(1);

	let releaseDisposal: () => void = () => undefined;
	disposalGate = new Promise<void>((resolve) => {
		releaseDisposal = resolve;
	});
	const disposalHasStarted = new Promise<void>((resolve) => {
		disposalStarted = () => resolve();
	});
	const disposal = disposeVideoMattingModel({model: 'modnet'});
	await disposalHasStarted;

	const replacement = loadVideoMattingModel({model: 'modnet'});
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
	expect(initializationCount).toBe(1);
	expect(pipelineConstructionCount).toBe(1);

	releaseDisposal();
	await Promise.all([disposal, replacement]);
	expect(initializationCount).toBe(2);
	expect(pipelineConstructionCount).toBe(2);
	expect(maxLivePipelineCount).toBe(1);
	expect(livePipelineCount).toBe(1);

	disposalGate = null;
	await disposeVideoMattingModel({model: 'modnet'});
	expect(disposeCalls).toBe(2);
	expect(livePipelineCount).toBe(0);
});
