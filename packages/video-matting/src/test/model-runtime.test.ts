import {beforeEach, expect, mock, test} from 'bun:test';

let initializationCount = 0;
let initializationStarted: ((count: number) => void) | null = null;
let initializationGate: Promise<void> | null = null;
let initializationOptions: Record<string, unknown> | null = null;
let initializedModelId: string | null = null;
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
	AutoModelForImageSegmentation: {
		from_pretrained: async (
			modelId: string,
			options: Record<string, unknown>,
		) => {
			initializationCount++;
			initializedModelId = modelId;
			initializationOptions = options;
			initializationStarted?.(initializationCount);
			await initializationGate;

			const onProgress = options.progress_callback as
				| ((event: Record<string, unknown>) => void)
				| undefined;
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
		from_pretrained: (_modelId: string, options: Record<string, unknown>) => {
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
	initializedModelId = null;
	pipelineConstructionCount = 0;
	pipelineRunCount = 0;
	livePipelineCount = 0;
	maxLivePipelineCount = 0;
	disposeCalls = 0;
	disposalStarted = null;
	disposalGate = null;
	cacheCheck = undefined;
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
	const secondProgress: number[] = [];
	const first = loadVideoMattingModel({
		model: 'modnet',
		onProgress: ({loadedBytes, progress}) => {
			if (progress !== null) {
				firstProgress.push(progress);
			}

			if (loadedBytes !== null) {
				firstLoadedBytes.push(loadedBytes);
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
	releaseInitialization();
	expect(await Promise.all([first, second])).toEqual([
		{alreadyLoaded: false},
		{alreadyLoaded: true},
	]);
	expect(initializedModelId).toBe('Xenova/modnet');
	expect(initializationOptions).toMatchObject({
		device: 'webgpu',
		dtype: 'fp32',
		revision: 'fa2fa546052fba4c08921230a26cc69a333fca12',
	});
	expect(firstProgress.at(-1)).toBe(1);
	expect(secondProgress.at(-1)).toBe(1);
	expect(Math.max(...firstLoadedBytes)).toBe(25_888_640);

	expect(await isVideoMattingModelCached({model: 'modnet'})).toBe(true);
	expect(cacheCheck).toEqual({
		task: 'background-removal',
		modelId: 'Xenova/modnet',
		options: {
			device: 'webgpu',
			dtype: 'fp32',
			revision: 'fa2fa546052fba4c08921230a26cc69a333fca12',
		},
	});

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
