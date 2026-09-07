export type DragAwareDoubleClickTracker = {
	readonly beginPointerGesture: (event: Pick<PointerEvent, 'button'>) => void;
	readonly endPointerGesture: (wasDragged: boolean) => void;
	readonly consumePointerGestureWasDragged: () => boolean;
	readonly acceptClickAsDoubleClick: (clickCount: number) => boolean;
};

export const createDragAwareDoubleClickTracker =
	(): DragAwareDoubleClickTracker => {
		let pointerGestureWasDragged = false;
		let previousPointerButton: number | null = null;
		let currentPointerButton: number | null = null;

		return {
			beginPointerGesture: (event) => {
				pointerGestureWasDragged = false;
				previousPointerButton = currentPointerButton;
				currentPointerButton = event.button;
			},
			endPointerGesture: (wasDragged) => {
				pointerGestureWasDragged = wasDragged;
			},
			consumePointerGestureWasDragged: () => {
				const wasDragged = pointerGestureWasDragged;
				pointerGestureWasDragged = false;
				return wasDragged;
			},
			acceptClickAsDoubleClick: (clickCount) => {
				return (
					clickCount > 0 &&
					clickCount % 2 === 0 &&
					previousPointerButton === 0 &&
					currentPointerButton === 0
				);
			},
		};
	};
