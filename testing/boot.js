// Shared boot for the manual playgrounds. Load this AFTER the SDK UMD build
// (window.AppExtensionsSDK) and the Mock Host IIFE build (window.PipedriveMockHost).
//
// Starts the Mock Host (with optional config) and initializes the real SDK
// against it, returning { sdk, Command, Event, host }. Resolves the SDK's
// CJS/UMD default-export interop (the global is either the class itself or a
// namespace whose .default is it).
window.bootMockHost = async function bootMockHost(config) {
  const SDKGlobal = window.AppExtensionsSDK;
  const AppExtensionsSDK =
    typeof SDKGlobal === 'function' ? SDKGlobal : SDKGlobal.default;
  const { Command, Event } = SDKGlobal;
  const { startPipedriveMockHost } = window.PipedriveMockHost;

  const host = startPipedriveMockHost(config);
  const sdk = await new AppExtensionsSDK({
    identifier: 'dev-local',
  }).initialize();

  return { sdk, Command, Event, host };
};
