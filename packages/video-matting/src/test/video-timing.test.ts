import {describe, expect, test} from 'bun:test';
import {
	getClippedVideoFrameTiming,
	getVideoProcessingProgress,
	rebaseVideoTimestamp,
} from '../video-timing';

describe('video timing', () => {
	test('rebases a non-zero input timeline without rounding', () => {
		expect(
			rebaseVideoTimestamp({
				timestamp: 4.979,
				firstVideoTimestamp: 4.045,
			}),
		).toBeCloseTo(0.934, 12);
	});

	test('uses frame timestamps and durations for VFR progress', () => {
		expect(
			getVideoProcessingProgress({
				timestamp: 10.125,
				duration: 0.125,
				firstVideoTimestamp: 10,
				durationInSeconds: 1,
			}),
		).toEqual({processedDurationInSeconds: 0.25, progress: 0.25});
	});

	test('clamps the final frame to the video duration', () => {
		expect(
			getVideoProcessingProgress({
				timestamp: 2.9,
				duration: 0.2,
				firstVideoTimestamp: 2,
				durationInSeconds: 1,
			}),
		).toEqual({processedDurationInSeconds: 1, progress: 1});
	});

	test('discards frames outside the presentation range', () => {
		expect(
			getClippedVideoFrameTiming({
				timestamp: -0.5,
				duration: 0.25,
				videoStartTimestamp: 0,
				videoEndTimestamp: 1,
			}),
		).toBeNull();
	});

	test('clips frames crossing the start and end boundaries', () => {
		expect(
			getClippedVideoFrameTiming({
				timestamp: -0.25,
				duration: 0.5,
				videoStartTimestamp: 0,
				videoEndTimestamp: 1,
			}),
		).toEqual({timestamp: 0, duration: 0.25});

		expect(
			getClippedVideoFrameTiming({
				timestamp: 0.875,
				duration: 0.25,
				videoStartTimestamp: 0,
				videoEndTimestamp: 1,
			}),
		).toEqual({timestamp: 0.875, duration: 0.125});
	});

	test('preserves a frame inside a positive VFR presentation range', () => {
		expect(
			getClippedVideoFrameTiming({
				timestamp: 4.25,
				duration: 0.125,
				videoStartTimestamp: 4,
				videoEndTimestamp: 5,
			}),
		).toEqual({timestamp: 0.25, duration: 0.125});
	});
});
