import fs from 'fs';
import path from 'path';
import {expect, test, type Page} from '@playwright/test';
import {STUDIO_URL, exampleDir} from './constants.mts';
import {startStudio, stopStudio} from './studio-server.mts';

const effectDragError = 'Could not read effect drag data';
const issue8216File = path.join(
	exampleDir,
	'src',
	'Issue8216',
	'Issue8216.tsx',
);

const dropOnTimelineRow = async ({
	page,
	title,
	data,
}: {
	readonly page: Page;
	readonly title: string;
	readonly data: Record<string, string>;
}) => {
	await page
		.locator(`[title="${title}"]`)
		.first()
		.evaluate((element, dropData) => {
			const timelineRow = element.parentElement?.parentElement?.parentElement;
			if (!timelineRow) {
				throw new Error('Could not find timeline row');
			}

			const dataTransfer = new DataTransfer();
			for (const [type, value] of Object.entries(dropData)) {
				dataTransfer.setData(type, value);
			}

			timelineRow.dispatchEvent(
				new DragEvent('drop', {
					bubbles: true,
					cancelable: true,
					dataTransfer,
				}),
			);
		}, data);
};

test.describe('sequence reorder', () => {
	let sourceBefore: string;

	test.beforeEach(async () => {
		sourceBefore = fs.readFileSync(issue8216File, 'utf-8');
		await startStudio();
	});

	test.afterEach(async () => {
		await stopStudio();
		fs.writeFileSync(issue8216File, sourceBefore);
	});

	test('reorders with a vertically constrained pointer preview', async ({
		page,
	}) => {
		await page.goto(`${STUDIO_URL}/issue-8216`);
		await expect(page).toHaveURL(/issue-8216/, {timeout: 15_000});
		await page.waitForFunction(
			() => !document.body.innerText.includes('Loading...'),
			{timeout: 30_000},
		);

		const source = page
			.locator('[title="Background"]')
			.first()
			.locator('xpath=ancestor::*[@data-remotion-sequence-reorder-row][1]');
		const target = page
			.locator('[title="Foreground"]')
			.first()
			.locator('xpath=ancestor::*[@data-remotion-sequence-reorder-row][1]');
		await expect(source).toBeVisible({timeout: 15_000});
		await expect(target).toBeVisible();
		await source.scrollIntoViewIfNeeded();

		const sourceBox = await source.boundingBox();
		const targetBox = await target.boundingBox();
		if (!sourceBox || !targetBox) {
			throw new Error('Expected sequence rows to have bounding boxes');
		}

		const startX = sourceBox.x + sourceBox.width / 2;
		const startY = sourceBox.y + sourceBox.height / 2;
		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.mouse.move(startX + 80, targetBox.y + targetBox.height / 4, {
			steps: 5,
		});

		const preview = page.locator(
			'[data-remotion-sequence-reorder-preview="true"]',
		);
		await expect(preview).toBeVisible();
		const previewBox = await preview.boundingBox();
		expect(previewBox?.x).toBeCloseTo(sourceBox.x, 0);

		await page.mouse.up();
		await expect(preview).toHaveCount(0);
		await expect
			.poll(() => {
				const sourceCode = fs.readFileSync(issue8216File, 'utf-8');
				return (
					sourceCode.indexOf('name="Background"') <
					sourceCode.indexOf('name="Foreground"')
				);
			})
			.toBe(true);
	});

	test('does not parse sequence reorder data as effect drag data', async ({
		page,
	}) => {
		await page.goto(`${STUDIO_URL}/issue-8216`);
		await expect(page).toHaveURL(/issue-8216/, {timeout: 15_000});
		await page.waitForFunction(
			() => !document.body.innerText.includes('Loading...'),
			{timeout: 30_000},
		);

		await expect(page.locator('[title="Background"]').first()).toBeVisible({
			timeout: 15_000,
		});

		await dropOnTimelineRow({
			page,
			title: 'Background',
			data: {
				'text/plain': 'not effect drag data',
			},
		});
		await expect(page.getByText(effectDragError)).toBeHidden();

		await dropOnTimelineRow({
			page,
			title: 'Background',
			data: {
				'application/remotion-sequence-reorder': JSON.stringify({
					nodePath: {nodePath: [0]},
					nodePathKey: 'source',
					trackIndex: 0,
					parentId: null,
					fileName: 'Issue8216.tsx',
				}),
			},
		});

		await expect(page.getByText(effectDragError)).toBeHidden();
	});
});
