import {expect, test} from 'bun:test';
import {createDragAwareDoubleClickTracker} from '../helpers/drag-aware-double-click';

test('Drag-aware double clicks consume the drag from the current pointer gesture', () => {
	const tracker = createDragAwareDoubleClickTracker();

	tracker.beginPointerGesture({button: 0});
	tracker.endPointerGesture(true);
	expect(tracker.consumePointerGestureWasDragged()).toBe(true);
	expect(tracker.consumePointerGestureWasDragged()).toBe(false);

	tracker.beginPointerGesture({button: 0});
	tracker.endPointerGesture(true);
	tracker.beginPointerGesture({button: 0});
	tracker.endPointerGesture(false);
	expect(tracker.consumePointerGestureWasDragged()).toBe(false);
});

test('Double clicks require an even click count and two primary-button pointer gestures', () => {
	const tracker = createDragAwareDoubleClickTracker();

	tracker.beginPointerGesture({button: 2});
	tracker.beginPointerGesture({button: 0});
	expect(tracker.acceptClickAsDoubleClick(2)).toBe(false);

	tracker.beginPointerGesture({button: 0});
	expect(tracker.acceptClickAsDoubleClick(1)).toBe(false);
	expect(tracker.acceptClickAsDoubleClick(2)).toBe(true);
});

test('A mixed-button click succession can recover on the next primary double click', () => {
	const tracker = createDragAwareDoubleClickTracker();

	tracker.beginPointerGesture({button: 2});
	expect(tracker.acceptClickAsDoubleClick(2)).toBe(false);

	tracker.beginPointerGesture({button: 0});
	expect(tracker.acceptClickAsDoubleClick(3)).toBe(false);
	tracker.beginPointerGesture({button: 0});
	expect(tracker.acceptClickAsDoubleClick(4)).toBe(true);
});
