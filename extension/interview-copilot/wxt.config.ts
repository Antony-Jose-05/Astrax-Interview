import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['storage', 'tabs', 'activeTab', 'sidePanel'],
    host_permissions: ['http://127.0.0.1/*'],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_popup: '',
    },
  },
});
