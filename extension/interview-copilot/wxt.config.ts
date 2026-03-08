import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Astrax Interview Copilot',
    description: 'AI-powered real-time interview assistant for Google Meet and Zoom.',
    version: '1.1.0',

    permissions: ['storage', 'tabs', 'activeTab', 'sidePanel'],

    // ── CRITICAL FIX ──────────────────────────────────────────────────────────
    // Previously ONLY '127.0.0.1' was listed here. Without Meet/Zoom patterns,
    // Chrome refuses to inject the content script on those pages entirely —
    // meaning TOGGLE_RECORDING messages never reach the page and nothing works.
    host_permissions: [
      'http://127.0.0.1/*',
      'http://localhost/*',
      '*://meet.google.com/*',
      '*://*.zoom.us/j/*',
    ],

    side_panel: {
      // WXT compiles entrypoints/sidepanel/ → sidepanel.html (already correct)
      default_path: 'sidepanel.html',
    },

    action: {
      // Empty popup means toolbar icon click fires chrome.action.onClicked,
      // which background.ts uses to open the side panel instead of a popup.
      default_popup: '',
      default_title: 'Open Astrax Interview Copilot',
    },
  },
});