import {afterEach, expect, test} from 'bun:test';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {subscribeToWaveformPeaks} from '@remotion/timeline-utils';
import {cleanup, render, screen} from '@testing-library/react';
import {AssetAudioVolume} from '../components/AssetAudioVolume';

afterEach(cleanup);

test('automatically shares waveform analysis and reuses cached volume on remount', async () => {
	// Two seconds: left channel at half scale for one second, then silence;
	// right channel silent throughout. Mean square = 0.5² / 2 / 2.
	const frames = 16000;
	const wav = new Uint8Array(44 + frames * 4);
	const view = new DataView(wav.buffer);
	for (const [offset, text] of [
		[0, 'RIFF'],
		[8, 'WAVE'],
		[12, 'fmt '],
		[36, 'data'],
	] as const) {
		wav.set(new TextEncoder().encode(text), offset);
	}

	view.setUint32(4, wav.length - 8, true);
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 2, true);
	view.setUint32(24, 8000, true);
	view.setUint32(28, 32000, true);
	view.setUint16(32, 4, true);
	view.setUint16(34, 16, true);
	view.setUint32(40, frames * 4, true);
	for (let frame = 0; frame < frames / 2; frame++) {
		view.setInt16(44 + frame * 4, frame % 2 === 0 ? 16384 : -16384, true);
	}

	let requests = 0;
	const server = createServer((request, response) => {
		requests++;
		const range = request.headers.range?.match(/bytes=(\d+)-(\d*)/);
		const start = range ? Number(range[1]) : 0;
		const end = range?.[2]
			? Math.min(Number(range[2]), wav.length - 1)
			: wav.length - 1;
		response.writeHead(range ? 206 : 200, {
			'Content-Type': 'audio/wav',
			'Content-Length': end - start + 1,
			'Accept-Ranges': 'bytes',
			'Content-Range': `bytes ${start}-${end}/${wav.length}`,
		});
		response.end(wav.slice(start, end + 1));
	});
	await new Promise<void>((resolve) => server.listen(0, resolve));
	const src = `http://localhost:${(server.address() as AddressInfo).port}/stereo.wav`;
	let unsubscribe = () => {};
	try {
		const waveform = new Promise<void>((resolve, reject) => {
			unsubscribe = subscribeToWaveformPeaks({
				src,
				waveformSampleRate: 100,
				onPeaks: (peaks, final, volume) => {
					if (!final) return;
					expect(peaks.length).toBe(200);
					expect(volume!).toBeCloseTo(-12.0412, 3);
					resolve();
				},
				onError: reject,
			});
		});
		const mounted = render(
			<AssetAudioVolume src={src} waveformSampleRate={100} />,
		);
		expect(screen.queryByRole('button', {name: 'Calculate'})).toBeNull();
		expect(await screen.findByText('-12.0 dBFS')).toBeTruthy();
		await waveform;
		expect(requests).toBe(1);
		mounted.unmount();
		render(<AssetAudioVolume src={src} waveformSampleRate={100} />);
		expect(await screen.findByText('-12.0 dBFS')).toBeTruthy();
		expect(requests).toBe(1);
	} finally {
		unsubscribe();
		cleanup();
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
