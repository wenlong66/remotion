import {afterEach, expect, test} from 'bun:test';
import {cleanup, render, screen} from '@testing-library/react';
import {ALL_FORMATS, BufferSource, Input} from 'mediabunny';
import {ContainerOverview} from '../app/components/ContainerOverview';

afterEach(cleanup);

test('calculates full-track stereo RMS in Convert, including silence', async () => {
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

	const input = new Input({
		formats: ALL_FORMATS,
		source: new BufferSource(wav),
	});
	try {
		const audioTrack = await input.getPrimaryAudioTrack();
		const mounted = render(
			<ContainerOverview
				dimensions={null}
				durationInSeconds={2}
				videoCodec={null}
				audioCodec="pcm-s16"
				size={wav.length}
				frameRate={null}
				container={null}
				isHdr={false}
				metadata={null}
				isAudioOnly
				audioTrack={audioTrack}
				sampleRate={8000}
			/>,
		);
		expect(screen.getByText('Average volume')).toBeTruthy();
		expect(screen.queryByRole('button', {name: 'Calculate'})).toBeNull();
		expect(await screen.findByText('-12.0 dBFS')).toBeTruthy();
		mounted.unmount();
	} finally {
		input.dispose();
	}

	wav.fill(0, 44);
	const silentInput = new Input({
		formats: ALL_FORMATS,
		source: new BufferSource(wav),
	});
	try {
		const audioTrack = await silentInput.getPrimaryAudioTrack();
		render(
			<ContainerOverview
				dimensions={null}
				durationInSeconds={2}
				videoCodec={null}
				audioCodec="pcm-s16"
				size={wav.length}
				frameRate={null}
				container={null}
				isHdr={false}
				metadata={null}
				isAudioOnly
				audioTrack={audioTrack}
				sampleRate={8000}
			/>,
		);
		expect(screen.queryByRole('button', {name: 'Calculate'})).toBeNull();
		expect(await screen.findByText('−∞ dBFS (silent)')).toBeTruthy();
	} finally {
		cleanup();
		silentInput.dispose();
	}
});
