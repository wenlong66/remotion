import {describe, expect, test} from 'bun:test';
import {separateVideoLayers} from '../separate-video-layers';

describe('separateVideoLayers() option validation', () => {
	test('rejects an invalid audio destination before loading a model', async () => {
		await expect(
			separateVideoLayers({
				src: 'video.mp4',
				audio: 'background' as never,
			}),
		).rejects.toThrow('audio must be one of base, foreground, both, or none.');
	});

	test('rejects invalid encoding options before loading a model', async () => {
		await expect(
			separateVideoLayers({
				src: 'video.mp4',
				videoBitrate: 0,
			}),
		).rejects.toThrow('A numeric bitrate must be a positive integer.');

		await expect(
			separateVideoLayers({
				src: 'video.mp4',
				keyframeIntervalInSeconds: 0,
			}),
		).rejects.toThrow(
			'keyframeIntervalInSeconds must be a positive finite number.',
		);
	});

	test('rejects conflicting layer destinations before loading a model', async () => {
		await expect(
			separateVideoLayers({
				src: 'video.mp4',
				outputs: {
					base: {
						outputTarget: 'arraybuffer',
						outputWritable: new WritableStream(),
					} as never,
				},
			}),
		).rejects.toThrow(
			'outputs.base cannot specify both outputTarget and outputWritable.',
		);
	});

	test('rejects invalid, locked, and shared output streams before loading a model', async () => {
		await expect(
			separateVideoLayers({
				src: 'video.mp4',
				outputs: {
					base: {outputWritable: {} as WritableStream},
				},
			}),
		).rejects.toThrow('outputs.base.outputWritable must be a WritableStream.');

		const locked = new WritableStream();
		const writer = locked.getWriter();
		try {
			await expect(
				separateVideoLayers({
					src: 'video.mp4',
					outputs: {base: {outputWritable: locked}},
				}),
			).rejects.toThrow(
				'outputs.base.outputWritable must not already be locked.',
			);
		} finally {
			writer.releaseLock();
		}

		const shared = new WritableStream();
		await expect(
			separateVideoLayers({
				src: 'video.mp4',
				outputs: {
					base: {outputWritable: shared},
					foreground: {outputWritable: shared},
				},
			}),
		).rejects.toThrow(
			'outputs.base and outputs.foreground must not use the same outputWritable.',
		);
	});

	test('honors an already-aborted signal before loading a model', async () => {
		const controller = new AbortController();
		controller.abort(new Error('stop now'));

		await expect(
			separateVideoLayers({
				src: 'video.mp4',
				signal: controller.signal,
			}),
		).rejects.toThrow('stop now');
	});
});
