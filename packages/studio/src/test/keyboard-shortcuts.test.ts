import {expect, test} from 'bun:test';
import {
	defaultKeyboardShortcuts,
	formatKeyboardShortcut,
	formatKeyboardShortcutForAria,
	keyboardEventMatchesShortcut,
} from '../components/keyboard-shortcuts';
import {isMac} from '../helpers/is-mac';

const event = (overrides: Partial<KeyboardEvent>): KeyboardEvent =>
	({
		altKey: false,
		ctrlKey: false,
		key: 'k',
		metaKey: false,
		shiftKey: false,
		...overrides,
	}) as KeyboardEvent;

test('includes the platform redo shortcuts', () => {
	expect(defaultKeyboardShortcuts.redo).toEqual(
		isMac
			? [{key: 'z', commandOrControl: true, shift: true}]
			: [
					{key: 'y', commandOrControl: true},
					{key: 'z', commandOrControl: true, shift: true},
				],
	);
});

test('includes main-row and numeric-keypad zoom-in shortcuts', () => {
	expect(defaultKeyboardShortcuts.zoomIn).toEqual([
		{key: '+', shift: true},
		{key: '+'},
	]);
});

test('matches all shortcut modifiers exactly', () => {
	expect(
		keyboardEventMatchesShortcut({
			event: event(isMac ? {metaKey: true} : {ctrlKey: true}),
			shortcut: {key: 'k', commandOrControl: true},
		}),
	).toBe(true);
	expect(
		keyboardEventMatchesShortcut({
			event: event(
				isMac
					? {metaKey: true, shiftKey: true}
					: {ctrlKey: true, shiftKey: true},
			),
			shortcut: {key: 'k', commandOrControl: true},
		}),
	).toBe(false);
	expect(
		keyboardEventMatchesShortcut({
			event: event({key: ' ', shiftKey: false}),
			shortcut: {key: 'Space'},
		}),
	).toBe(true);
});

test('formats a shortcut for display', () => {
	expect(
		formatKeyboardShortcut({key: 'ArrowLeft', commandOrControl: true}),
	).toEqual([isMac ? '⌘' : 'Ctrl', '←']);
	expect(formatKeyboardShortcut({key: '?', shift: true})).toEqual(['?']);
	expect(formatKeyboardShortcut({key: '+', shift: true})).toEqual(['+']);
	expect(
		formatKeyboardShortcutForAria({
			key: 'k',
			commandOrControl: true,
			shift: true,
		}),
	).toBe(`${isMac ? 'Meta' : 'Control'}+Shift+k`);
});
