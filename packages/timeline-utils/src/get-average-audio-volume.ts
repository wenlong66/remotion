import {AudioSampleSink, type InputAudioTrack} from 'mediabunny';

/** RMS level over every decoded channel and sample, relative to full scale. */
export const getAverageAudioVolume = async ({
	track,
	signal,
}: {
	track: InputAudioTrack;
	signal: AbortSignal;
}): Promise<number | null> => {
	signal.throwIfAborted();
	if (!(await track.canDecode())) {
		return null;
	}

	let energy = 0;
	let duration = 0;
	let lastYield = performance.now();
	const sink = new AudioSampleSink(track);
	for await (const sample of sink.samples()) {
		try {
			signal.throwIfAborted();
			const data = new Float32Array(sample.numberOfFrames);
			let sumOfSquares = 0;
			for (let channel = 0; channel < sample.numberOfChannels; channel++) {
				sample.copyTo(data, {planeIndex: channel, format: 'f32-planar'});
				for (const value of data) {
					sumOfSquares += value * value;
				}
			}

			// Weight by time so changes in sample rate do not skew the result.
			energy += sumOfSquares / sample.numberOfChannels / sample.sampleRate;
			duration += sample.numberOfFrames / sample.sampleRate;
		} finally {
			sample.close();
		}

		if (performance.now() - lastYield > 50) {
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			lastYield = performance.now();
		}
	}

	signal.throwIfAborted();
	return duration === 0 ? null : 10 * Math.log10(energy / duration);
};

export const formatAverageAudioVolume = (volume: number | null) => {
	if (volume === null) {
		return 'Unavailable';
	}

	return volume === -Infinity
		? '−∞ dBFS (silent)'
		: `${volume.toFixed(1)} dBFS`;
};
