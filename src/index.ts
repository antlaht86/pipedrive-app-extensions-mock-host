/**
 * pipedrive-app-extensions-sdk-mock
 *
 * Framework-agnostic mock of the Pipedrive App Extensions SDK
 * (`@pipedrive/app-extensions-sdk`). Instead of posting messages to a
 * Pipedrive host window, this mock acts as the host itself and renders real
 * UI elements into the page, so you can develop and test an app extension
 * locally — in any framework or in plain vanilla JS.
 *
 * The actual implementation is added incrementally. This entry point only
 * establishes the public module surface.
 */

/** Package version, kept in sync with package.json by the release process. */
export const VERSION = '0.0.0';
