import {afterEach, describe, expect, test} from 'bun:test';
import {Output, WebMOutputFormat, type StreamTargetChunk} from 'mediabunny';
import {createVideoLayerOutput} from '../create-video-layer-output';
import type {VideoLayerOutputOptions} from '../output-target';

const originalNavigator = globalThis.navigator;

type FakeFile = {
	bytes: Uint8Array<ArrayBuffer>;
	position: number;
	closed: boolean;
	aborted: boolean;
	seekPositions: number[];
};

const makeFakeFile = (): FakeFile => ({
	bytes: new Uint8Array(),
	position: 0,
	closed: false,
	aborted: false,
	seekPositions: [],
});

const makeFakeOpfs = ({
	createWritableError,
	closeError,
	abortError,
}: {
	createWritableError?: Error;
	closeError?: Error;
	abortError?: Error;
} = {}) => {
	const files = new Map<string, FakeFile>();
	const removedNames: string[] = [];

	const getFileHandle = (
		name: string,
		options?: FileSystemGetFileOptions,
	): Promise<FileSystemFileHandle> => {
		if (!files.has(name)) {
			if (!options?.create) {
				throw new DOMException('File not found', 'NotFoundError');
			}

			files.set(name, makeFakeFile());
		}

		const file = files.get(name)!;
		return Promise.resolve({
			kind: 'file',
			name,
			isSameEntry: () => Promise.resolve(false),
			createWritable: () => {
				if (createWritableError !== undefined) {
					return Promise.reject(createWritableError);
				}

				return Promise.resolve({
					seek: (position: number) => {
						file.position = position;
						file.seekPositions.push(position);
						return Promise.resolve();
					},
					write: (chunk: StreamTargetChunk) => {
						const end = file.position + chunk.data.byteLength;
						if (end > file.bytes.byteLength) {
							const resized = new Uint8Array(end);
							resized.set(file.bytes);
							file.bytes = resized;
						}

						file.bytes.set(chunk.data, file.position);
						file.position = end;
						return Promise.resolve();
					},
					close: () => {
						file.closed = true;
						return closeError === undefined
							? Promise.resolve()
							: Promise.reject(closeError);
					},
					abort: () => {
						file.aborted = true;
						return abortError === undefined
							? Promise.resolve()
							: Promise.reject(abortError);
					},
				} as unknown as FileSystemWritableFileStream);
			},
			getFile: () => Promise.resolve(new File([file.bytes], name)),
		} as FileSystemFileHandle);
	};

	const directory = {
		kind: 'directory',
		name: '',
		isSameEntry: () => Promise.resolve(false),
		getFileHandle,
		removeEntry: (name: string) => {
			removedNames.push(name);
			if (!files.delete(name)) {
				return Promise.reject(
					new DOMException('File not found', 'NotFoundError'),
				);
			}

			return Promise.resolve();
		},
		async *entries() {
			for (const name of files.keys()) {
				yield [name, await getFileHandle(name)] as const;
			}
		},
	} as unknown as FileSystemDirectoryHandle;

	const seedFile = (name: string) => files.set(name, makeFakeFile());

	return {directory, files, removedNames, seedFile};
};

afterEach(() => {
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		enumerable: true,
		value: originalNavigator,
		writable: true,
	});
});

describe('video layer output targets', () => {
	test('creates an in-memory Blob result', async () => {
		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: {outputTarget: 'arraybuffer'},
		});

		await created.output.start();
		const result = await created.finalize();
		const blob = await result.getBlob();
		await result.dispose();
		await result.dispose();

		expect(blob.type).toBe('application/webm');
		expect(blob.size).toBeGreaterThan(0);
	});

	test('writes to and closes an outputWritable', async () => {
		const chunks: StreamTargetChunk[] = [];
		let closed = false;
		const outputWritable = new WritableStream<StreamTargetChunk>({
			write: (chunk) => {
				chunks.push(chunk);
			},
			close: () => {
				closed = true;
			},
		});
		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: {outputWritable},
		});

		await created.output.start();
		const result = await created.finalize();

		expect(chunks.length).toBeGreaterThan(0);
		expect(closed).toBe(true);
		await expect(result.getBlob()).rejects.toThrow(
			'getBlob() is unavailable when outputWritable is used',
		);
		await result.dispose();
		await result.dispose();
	});

	test('rejects finalization when cancellation is requested during stream close', async () => {
		let cancelOutput: (() => Promise<void>) | null = null;
		let cancellationPromise: Promise<void> | null = null;
		const outputWritable = new WritableStream<StreamTargetChunk>({
			close: () => {
				if (cancelOutput === null) {
					throw new Error('Expected output cancellation to be initialized');
				}

				cancellationPromise = cancelOutput();
			},
		});
		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: {outputWritable},
		});
		cancelOutput = created.cancel;

		await created.output.start();
		await expect(created.finalize()).rejects.toThrow(
			'Video layer output was canceled',
		);
		await Promise.allSettled([cancellationPromise]);
	});

	test('aborts an outputWritable when canceled before starting', async () => {
		let closed = false;
		let abortReason: unknown = null;
		const outputWritable = new WritableStream<StreamTargetChunk>({
			close: () => {
				closed = true;
			},
			abort: (reason) => {
				abortReason = reason;
			},
		});
		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: {outputWritable},
		});

		await created.cancel();
		expect(closed).toBe(false);
		expect(abortReason).toBeInstanceOf(Error);
		expect((abortReason as Error).message).toBe(
			'Video layer output was canceled',
		);
	});

	test('aborts an outputWritable when canceled after starting', async () => {
		let closed = false;
		let abortReason: unknown = null;
		const outputWritable = new WritableStream<StreamTargetChunk>({
			close: () => {
				closed = true;
			},
			abort: (reason) => {
				abortReason = reason;
			},
		});
		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: {outputWritable},
		});
		await created.output.start();

		await created.cancel();
		expect(closed).toBe(false);
		expect(abortReason).toBeInstanceOf(Error);
		expect((abortReason as Error).message).toBe(
			'Video layer output was canceled',
		);
	});

	test('aborts an outputWritable when discarded after starting', async () => {
		let closed = false;
		let abortReason: unknown = null;
		const outputWritable = new WritableStream<StreamTargetChunk>({
			close: () => {
				closed = true;
			},
			abort: (reason) => {
				abortReason = reason;
			},
		});
		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: {outputWritable},
		});
		await created.output.start();

		await created.discard();
		expect(closed).toBe(false);
		expect(abortReason).toBeInstanceOf(Error);
		expect((abortReason as Error).message).toBe(
			'Video layer output was discarded',
		);
	});

	test('uses OPFS automatically and honors positional writes', async () => {
		const {directory, files, removedNames} = makeFakeOpfs();
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			enumerable: true,
			value: {storage: {getDirectory: () => Promise.resolve(directory)}},
			writable: true,
		});

		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: undefined,
		});
		await created.output.start();
		const result = await created.finalize();
		const blob = await result.getBlob();
		const [filename, file] = [...files.entries()][0];

		expect(files.size).toBe(1);
		expect(file.closed).toBe(true);
		expect(file.seekPositions.length).toBeGreaterThan(0);
		expect(blob.size).toBeGreaterThan(0);
		expect(blob.type).toBe('application/webm');
		const bytesBeforeDisposal = new Uint8Array(await blob.arrayBuffer());

		await Promise.all([result.dispose(), result.dispose()]);
		expect(files.size).toBe(0);
		expect(removedNames.filter((name) => name === filename)).toHaveLength(1);
		const blobAfterDisposal = await result.getBlob();
		expect(blobAfterDisposal).toBe(blob);
		expect(new Uint8Array(await blobAfterDisposal.arrayBuffer())).toEqual(
			bytesBeforeDisposal,
		);
	});

	test('does not remove an OPFS output owned by another session', async () => {
		const {directory, files, seedFile} = makeFakeOpfs();
		const otherSessionFilename =
			'__remotion_video_matting:another-session:existing-output';
		seedFile(otherSessionFilename);
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			enumerable: true,
			value: {storage: {getDirectory: () => Promise.resolve(directory)}},
			writable: true,
		});

		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: {outputTarget: 'web-fs'},
		});

		expect(files.has(otherSessionFilename)).toBe(true);
		expect(files.size).toBe(2);
		await created.cancel();
		expect(files.has(otherSessionFilename)).toBe(true);
		expect(files.size).toBe(1);
	});

	test('can discard a finalized OPFS output internally', async () => {
		const {directory, files, removedNames} = makeFakeOpfs();
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			enumerable: true,
			value: {storage: {getDirectory: () => Promise.resolve(directory)}},
			writable: true,
		});

		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: {outputTarget: 'web-fs'},
		});
		await created.output.start();
		await created.finalize();
		const [filename] = files.keys();

		await created.discard();
		await created.discard();
		expect(files.size).toBe(0);
		expect(removedNames.filter((name) => name === filename)).toHaveLength(1);
	});

	test('can retry OPFS disposal after a transient removal failure', async () => {
		const {directory, files} = makeFakeOpfs();
		const removeEntry = directory.removeEntry.bind(directory);
		let removalAttempts = 0;
		Object.defineProperty(directory, 'removeEntry', {
			value: (name: string) => {
				removalAttempts++;
				if (removalAttempts === 1) {
					return Promise.reject(new Error('temporary removal failure'));
				}

				return removeEntry(name);
			},
		});
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			enumerable: true,
			value: {storage: {getDirectory: () => Promise.resolve(directory)}},
			writable: true,
		});

		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: {outputTarget: 'web-fs'},
		});
		await created.output.start();
		const result = await created.finalize();

		await expect(result.dispose()).rejects.toThrow('temporary removal failure');
		expect(files.size).toBe(1);
		await expect(result.dispose()).resolves.toBeUndefined();
		expect(files.size).toBe(0);
		expect(removalAttempts).toBe(2);
	});

	test('removes a partial OPFS output when canceled', async () => {
		const {directory, files} = makeFakeOpfs();
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			enumerable: true,
			value: {storage: {getDirectory: () => Promise.resolve(directory)}},
			writable: true,
		});

		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: {outputTarget: 'web-fs'},
		});
		await created.output.start();
		expect(files.size).toBe(1);

		await created.cancel();
		expect(files.size).toBe(0);
	});

	test('removes an OPFS output even when Mediabunny cancellation fails', async () => {
		const {directory, files} = makeFakeOpfs();
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			enumerable: true,
			value: {storage: {getDirectory: () => Promise.resolve(directory)}},
			writable: true,
		});

		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: {outputTarget: 'web-fs'},
		});
		Object.defineProperty(created.output, 'cancel', {
			value: () => Promise.reject(new Error('cancel failed')),
		});

		await expect(created.cancel()).rejects.toThrow('cancel failed');
		expect(files.size).toBe(0);
	});

	test('removes a partial OPFS output when finalization fails', async () => {
		const {directory, files} = makeFakeOpfs();
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			enumerable: true,
			value: {storage: {getDirectory: () => Promise.resolve(directory)}},
			writable: true,
		});

		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: {outputTarget: 'web-fs'},
		});
		expect(files.size).toBe(1);

		await expect(created.finalize()).rejects.toThrow(
			'Cannot finalize before starting',
		);
		expect(files.size).toBe(0);
	});

	test('removes an OPFS output when close and cancellation both fail', async () => {
		const {directory, files} = makeFakeOpfs({
			closeError: new Error('close failed'),
		});
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			enumerable: true,
			value: {storage: {getDirectory: () => Promise.resolve(directory)}},
			writable: true,
		});

		const created = await createVideoLayerOutput({
			format: new WebMOutputFormat(),
			options: {outputTarget: 'web-fs'},
		});
		await created.output.start();
		Object.defineProperty(created.output, 'cancel', {
			value: () => Promise.reject(new Error('cancel failed')),
		});

		await expect(created.finalize()).rejects.toThrow('close failed');
		expect(files.size).toBe(0);
	});

	test('removes the created OPFS entry if createWritable fails', async () => {
		const {directory, files} = makeFakeOpfs({
			createWritableError: new Error('createWritable failed'),
		});
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			enumerable: true,
			value: {storage: {getDirectory: () => Promise.resolve(directory)}},
			writable: true,
		});

		await expect(
			createVideoLayerOutput({
				format: new WebMOutputFormat(),
				options: {outputTarget: 'web-fs'},
			}),
		).rejects.toThrow('createWritable failed');
		expect(files.size).toBe(0);
	});

	test('rejects conflicting destinations at runtime', async () => {
		await expect(
			createVideoLayerOutput({
				format: new WebMOutputFormat(),
				options: {
					outputTarget: 'arraybuffer',
					outputWritable: new WritableStream<StreamTargetChunk>(),
				} as unknown as VideoLayerOutputOptions,
			}),
		).rejects.toThrow(
			'outputTarget and outputWritable cannot both be specified for a video layer',
		);
	});
});

const acceptOutputOptions = (_options: VideoLayerOutputOptions) => undefined;

acceptOutputOptions({outputTarget: 'arraybuffer'});
acceptOutputOptions({
	outputWritable: new WritableStream<StreamTargetChunk>(),
});
// @ts-expect-error outputTarget and outputWritable are mutually exclusive.
acceptOutputOptions({
	outputTarget: 'web-fs',
	outputWritable: new WritableStream<StreamTargetChunk>(),
});

test('the created output exposes the Mediabunny Output primitive', async () => {
	const created = await createVideoLayerOutput({
		format: new WebMOutputFormat(),
		options: {outputTarget: 'arraybuffer'},
	});

	expect(created.output).toBeInstanceOf(Output);
	await created.cancel();
});
