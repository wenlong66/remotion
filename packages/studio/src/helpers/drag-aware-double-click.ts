export type DragAwareDoubleClickTracker = {
	readonly beginPointerGesture: (event: Pick<PointerEvent, 'button'>) => void;
	readonly endPointerGesture: (wasDragged: boolean) => void;
	readonly consumePointerGestureWasDragged: () => boolean;
	readonly acceptDoubleClick: () => boolean;
	readonly recoverDoubleClick: (clickCount: number) => boolean;
};

export const createDragAwareDoubleClickTracker =
	(): DragAwareDoubleClickTracker => {
		let pointerGestureWasDragged = false;
		let previousPointerButton: number | null = null;
		let currentPointerButton: number | null = null;
		let mixedButtonDoubleClickWasRejected = false;

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
			acceptDoubleClick: () => {
				const isPrimary =
					previousPointerButton === 0 && currentPointerButton === 0;
				mixedButtonDoubleClickWasRejected = !isPrimary;
				return isPrimary;
			},
			recoverDoubleClick: (clickCount) => {
				if (clickCount < 3) {
					mixedButtonDoubleClickWasRejected = false;
					return false;
				}

				if (
					!mixedButtonDoubleClickWasRejected ||
					previousPointerButton !== 0 ||
					currentPointerButton !== 0
				) {
					return false;
				}

				mixedButtonDoubleClickWasRejected = false;
				return true;
			},
		};
	};
