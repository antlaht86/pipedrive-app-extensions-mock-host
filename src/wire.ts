/**
 * Wire-protocol constants — internal copies of the Real SDK's enum values, so the
 * host has no runtime dependency on `@pipedrive/app-extensions-sdk` (see ADR-0003
 * and ADR-0004: the shipped bundle must not import the SDK's enum values). The
 * Command intake, Message router and host-effects all speak this vocabulary, so
 * it lives in one shared internal module rather than inside the host closure.
 */

export const MESSAGE_TYPE_COMMAND = 'command';
export const MESSAGE_TYPE_LISTENER = 'listener';
export const MESSAGE_TYPE_TRACK = 'track';
export const COMMAND_INITIALIZE = 'initialize';
export const COMMAND_SHOW_SNACKBAR = 'show_snackbar';
export const COMMAND_SHOW_CONFIRMATION = 'show_confirmation';
export const COMMAND_RESIZE = 'resize';
export const COMMAND_GET_METADATA = 'get_metadata';
export const COMMAND_GET_SIGNED_TOKEN = 'get_signed_token';
export const COMMAND_SET_NOTIFICATION = 'set_notification';
export const COMMAND_SET_FOCUS_MODE = 'set_focus_mode';
export const COMMAND_REDIRECT_TO = 'redirect_to';
export const COMMAND_SHOW_FLOATING_WINDOW = 'show_floating_window';
export const COMMAND_HIDE_FLOATING_WINDOW = 'hide_floating_window';
export const COMMAND_OPEN_MODAL = 'open_modal';
export const COMMAND_CLOSE_MODAL = 'close_modal';
export const EVENT_CLOSE_CUSTOM_MODAL = 'close_custom_modal';
export const EVENT_VISIBILITY = 'visibility';
export const EVENT_USER_SETTINGS_CHANGE = 'user_settings_change';
export const EVENT_PAGE_VISIBILITY_STATE = 'page_visibility_state';

/** Returned by GET_SIGNED_TOKEN when the consumer provides no override. */
export const DEFAULT_SIGNED_TOKEN = 'dev-signed-token';
