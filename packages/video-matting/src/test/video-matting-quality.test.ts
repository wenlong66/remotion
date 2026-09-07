import {describe, expect, test} from 'bun:test';
import {resolveVideoMattingQuality} from '../video-matting-quality';

describe('video matting quality', () => {
	test('accepts named qualities and bitrates', () => {
		expect(resolveVideoMattingQuality('very-high')).toBeDefined();
		expect(resolveVideoMattingQuality(2_000_000)).toBeDefined();
	});

	test('rejects invalid numeric bitrates', () => {
		expect(() => resolveVideoMattingQuality(0)).toThrow(
			'A numeric bitrate must be a positive integer.',
		);
		expect(() => resolveVideoMattingQuality(1.5)).toThrow(
			'A numeric bitrate must be a positive integer.',
		);
	});
});
