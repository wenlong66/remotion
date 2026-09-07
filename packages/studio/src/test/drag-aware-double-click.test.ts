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

test('Double clicks require two primary-button pointer gestures', () => {
	const tracker = createDragAwareDoubleClickTracker();

	tracker.beginPointerGesture({button: 2});
	tracker.beginPointerGesture({button: 0});
	expect(tracker.acceptDoubleClick()).toBe(false);

	tracker.beginPointerGesture({button: 0});
	expect(tracker.acceptDoubleClick()).toBe(true);
});

test('A rejected mixed-button double click can recover within the same click succession', () => {
	const tracker = createDragAwareDoubleClickTracker();

	tracker.beginPointerGesture({button: 2});
	expect(tracker.acceptDoubleClick()).toBe(false);

	tracker.beginPointerGesture({button: 0});
	expect(tracker.recoverDoubleClick(3)).toBe(false);
	tracker.beginPointerGesture({button: 0});
	expect(tracker.recoverDoubleClick(4)).toBe(true);
	expect(tracker.recoverDoubleClick(4)).toBe(false);
});
