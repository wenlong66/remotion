import {expect, test} from 'bun:test';
import {extraPackages} from '@remotion/studio-shared';
import {EXTRA_PACKAGES} from '../extra-packages';

test('uses the shared recommended versions for auxiliary packages', () => {
	for (const {name, version} of extraPackages) {
		expect(EXTRA_PACKAGES[name]).toBe(version);
	}

	expect(EXTRA_PACKAGES['@huggingface/transformers']).toBe('4.2.0');
});
