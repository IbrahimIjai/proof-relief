import { Buffer } from 'buffer';

// Midnight.js expects a few Node globals in the browser.
globalThis.Buffer ??= Buffer;
(globalThis as { process?: unknown }).process ??= { env: {}, version: '', versions: {} };
