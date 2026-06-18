import { Command, Event, MessageType } from '@pipedrive/app-extensions-sdk';
import { expect, test } from 'vitest';
import * as wire from './wire.js';

// ADR-0003/ADR-0004: the host keeps internal copies of the SDK's wire enum values
// so the shipped bundle imports no SDK code at runtime (and the IIFE build works).
// This test is the guard that those copies stay equal to the installed SDK — a
// silent drift (e.g. the SDK renames a command value) would otherwise leave the
// host unable to recognize real messages with no failure until manual testing.
// The test itself is free to import the SDK: tests are never shipped.

const at = (name: string): unknown => (wire as Record<string, unknown>)[name];

// Assert each wire constant equals its SDK enum value, and — for completeness —
// that the mapping covers every member of the enum, so a new SDK command/event
// without a wire copy is noticed too.
const expectWireMatchesEnum = (
  mapping: Record<string, string>,
  sdkEnum: Record<string, string>,
): void => {
  for (const [name, value] of Object.entries(mapping)) {
    expect(at(name)).toBe(value);
  }
  expect(new Set(Object.values(mapping))).toEqual(
    new Set(Object.values(sdkEnum)),
  );
};

test('wire message-type constants equal the SDK MessageType enum', () => {
  expectWireMatchesEnum(
    {
      MESSAGE_TYPE_COMMAND: MessageType.COMMAND,
      MESSAGE_TYPE_LISTENER: MessageType.LISTENER,
      MESSAGE_TYPE_TRACK: MessageType.TRACK,
    },
    MessageType,
  );
});

test('wire command constants equal the SDK Command enum', () => {
  expectWireMatchesEnum(
    {
      COMMAND_INITIALIZE: Command.INITIALIZE,
      COMMAND_SHOW_SNACKBAR: Command.SHOW_SNACKBAR,
      COMMAND_SHOW_CONFIRMATION: Command.SHOW_CONFIRMATION,
      COMMAND_RESIZE: Command.RESIZE,
      COMMAND_GET_METADATA: Command.GET_METADATA,
      COMMAND_GET_SIGNED_TOKEN: Command.GET_SIGNED_TOKEN,
      COMMAND_SET_NOTIFICATION: Command.SET_NOTIFICATION,
      COMMAND_SET_FOCUS_MODE: Command.SET_FOCUS_MODE,
      COMMAND_REDIRECT_TO: Command.REDIRECT_TO,
      COMMAND_SHOW_FLOATING_WINDOW: Command.SHOW_FLOATING_WINDOW,
      COMMAND_HIDE_FLOATING_WINDOW: Command.HIDE_FLOATING_WINDOW,
      COMMAND_OPEN_MODAL: Command.OPEN_MODAL,
      COMMAND_CLOSE_MODAL: Command.CLOSE_MODAL,
    },
    Command,
  );
});

test('wire event constants equal the SDK Event enum', () => {
  expectWireMatchesEnum(
    {
      EVENT_CLOSE_CUSTOM_MODAL: Event.CLOSE_CUSTOM_MODAL,
      EVENT_VISIBILITY: Event.VISIBILITY,
      EVENT_USER_SETTINGS_CHANGE: Event.USER_SETTINGS_CHANGE,
      EVENT_PAGE_VISIBILITY_STATE: Event.PAGE_VISIBILITY_STATE,
    },
    Event,
  );
});
