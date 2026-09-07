import {expect, test} from 'bun:test';
import {
	ALL_FORMATS,
	BlobSource,
	BufferSource,
	BufferTarget,
	EncodedPacket,
	EncodedVideoPacketSource,
	Input,
	Output,
	StreamTarget,
	type StreamTargetChunk,
	WebMOutputFormat,
} from 'mediabunny';
import {prepareAudio} from '../prepare-audio';

test('packet-copies Opus audio to both outputs and rebases its timestamps', async () => {
	const fixture = Bun.file(
		new URL('../../../example/public/opus.webm', import.meta.url),
	);
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(fixture),
	});
	const inputAudioTrack = await input.getPrimaryAudioTrack();
	expect(inputAudioTrack).not.toBeNull();
	const audioStartTimestamp = await inputAudioTrack!.getFirstTimestamp();

	const baseTarget = new BufferTarget();
	const foregroundTarget = new BufferTarget();
	const baseOutput = new Output({
		format: new WebMOutputFormat(),
		target: baseTarget,
	});
	const foregroundOutput = new Output({
		format: new WebMOutputFormat(),
		target: foregroundTarget,
	});
	const audio = await prepareAudio({
		input,
		baseOutput,
		foregroundOutput,
		destination: 'both',
		videoStartTimestamp: audioStartTimestamp,
		videoEndTimestamp: audioStartTimestamp + 0.25,
		audioQuality: null,
		forceTranscode: false,
	});

	await Promise.all([baseOutput.start(), foregroundOutput.start()]);
	await audio.prime();
	await audio.writeAudioUntil(0);
	await audio.finishAudio();
	await Promise.all([baseOutput.finalize(), foregroundOutput.finalize()]);

	expect(baseTarget.buffer).not.toBeNull();
	expect(foregroundTarget.buffer).not.toBeNull();
	for (const buffer of [baseTarget.buffer!, foregroundTarget.buffer!]) {
		const outputInput = new Input({
			formats: ALL_FORMATS,
			source: new BufferSource(buffer),
		});
		const outputAudioTrack = await outputInput.getPrimaryAudioTrack();
		expect(await outputAudioTrack?.getCodec()).toBe('opus');
		expect(await outputAudioTrack?.getFirstTimestamp()).toBe(0);
		outputInput.dispose();
	}

	input.dispose();
});

test('primes delayed audio so queued video data can be muxed', async () => {
	const fixture = Bun.file(
		new URL('../../../example/public/opus.webm', import.meta.url),
	);
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(fixture),
	});
	const inputAudioTrack = await input.getPrimaryAudioTrack();
	expect(inputAudioTrack).not.toBeNull();
	const audioStartTimestamp = await inputAudioTrack!.getFirstTimestamp();

	let bytesWritten = 0;
	const baseOutput = new Output({
		format: new WebMOutputFormat(),
		target: new StreamTarget(
			new WritableStream<StreamTargetChunk>({
				write: (chunk) => {
					bytesWritten += chunk.data.byteLength;
				},
			}),
		),
	});
	const foregroundOutput = new Output({
		format: new WebMOutputFormat(),
		target: new BufferTarget(),
	});
	const videoSource = new EncodedVideoPacketSource('vp9');
	const videoDecoderConfig: VideoDecoderConfig = {
		codec: 'vp09.00.10.08',
		codedWidth: 2,
		codedHeight: 2,
	};
	baseOutput.addVideoTrack(videoSource, {
		decoderConfig: videoDecoderConfig,
	});
	const audio = await prepareAudio({
		input,
		baseOutput,
		foregroundOutput,
		destination: 'base',
		videoStartTimestamp: audioStartTimestamp - 1,
		videoEndTimestamp: audioStartTimestamp + 0.25,
		audioQuality: null,
		forceTranscode: false,
	});

	await baseOutput.start();
	await videoSource.add(
		new EncodedPacket(new Uint8Array([0]), 'key', 0, 0.04),
		{decoderConfig: videoDecoderConfig},
	);
	await Promise.resolve();
	const bytesWrittenBeforePrime = bytesWritten;

	await audio.prime();
	await Promise.resolve();

	expect(bytesWritten).toBeGreaterThan(bytesWrittenBeforePrime);
	await audio.cancel();
	await Promise.all([baseOutput.cancel(), foregroundOutput.cancel()]);
	input.dispose();
});

test('cancel is idempotent before the outputs start', async () => {
	const fixture = Bun.file(
		new URL('../../../example/public/opus.webm', import.meta.url),
	);
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(fixture),
	});
	const inputAudioTrack = await input.getPrimaryAudioTrack();
	expect(inputAudioTrack).not.toBeNull();
	const audioStartTimestamp = await inputAudioTrack!.getFirstTimestamp();
	const baseOutput = new Output({
		format: new WebMOutputFormat(),
		target: new BufferTarget(),
	});
	const foregroundOutput = new Output({
		format: new WebMOutputFormat(),
		target: new BufferTarget(),
	});
	const audio = await prepareAudio({
		input,
		baseOutput,
		foregroundOutput,
		destination: 'both',
		videoStartTimestamp: audioStartTimestamp,
		videoEndTimestamp: audioStartTimestamp + 0.25,
		audioQuality: null,
		forceTranscode: false,
	});

	await audio.cancel();
	await audio.cancel();
	await Promise.all([baseOutput.cancel(), foregroundOutput.cancel()]);

	expect(baseOutput.state).toBe('canceled');
	expect(foregroundOutput.state).toBe('canceled');
	input.dispose();
});

test('does not attach audio when it does not overlap the video', async () => {
	const fixture = Bun.file(
		new URL('../../../example/public/opus.webm', import.meta.url),
	);
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(fixture),
	});
	const inputAudioTrack = await input.getPrimaryAudioTrack();
	expect(inputAudioTrack).not.toBeNull();
	const audioEndTimestamp = await inputAudioTrack!.computeDuration();
	const baseOutput = new Output({
		format: new WebMOutputFormat(),
		target: new BufferTarget(),
	});
	const foregroundOutput = new Output({
		format: new WebMOutputFormat(),
		target: new BufferTarget(),
	});
	const audio = await prepareAudio({
		input,
		baseOutput,
		foregroundOutput,
		destination: 'both',
		videoStartTimestamp: audioEndTimestamp + 1,
		videoEndTimestamp: audioEndTimestamp + 2,
		audioQuality: null,
		forceTranscode: false,
	});

	expect(baseOutput.tracks).toHaveLength(0);
	expect(foregroundOutput.tracks).toHaveLength(0);
	await audio.prime();
	await audio.finishAudio();
	await Promise.all([baseOutput.cancel(), foregroundOutput.cancel()]);
	input.dispose();
});

test('explicit bitrate requests force transcoding instead of Opus packet copy', async () => {
	const fixture = Bun.file(
		new URL('../../../example/public/opus.webm', import.meta.url),
	);
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(fixture),
	});
	const inputAudioTrack = await input.getPrimaryAudioTrack();
	expect(inputAudioTrack).not.toBeNull();
	const audioStartTimestamp = await inputAudioTrack!.getFirstTimestamp();
	let decodeChecks = 0;
	Object.defineProperty(inputAudioTrack, 'canDecode', {
		value: () => {
			decodeChecks++;
			return Promise.resolve(false);
		},
	});
	const baseOutput = new Output({
		format: new WebMOutputFormat(),
		target: new BufferTarget(),
	});
	const foregroundOutput = new Output({
		format: new WebMOutputFormat(),
		target: new BufferTarget(),
	});

	await expect(
		prepareAudio({
			input,
			baseOutput,
			foregroundOutput,
			destination: 'base',
			videoStartTimestamp: audioStartTimestamp,
			videoEndTimestamp: audioStartTimestamp + 0.25,
			audioQuality: null,
			forceTranscode: true,
		}),
	).rejects.toThrow('cannot be decoded');
	expect(decodeChecks).toBe(1);
	await Promise.all([baseOutput.cancel(), foregroundOutput.cancel()]);
	input.dispose();
});
