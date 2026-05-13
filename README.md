# Windy efbDPP Route Plugin

Private Windy plugin for loading `.efbDPP` flight plan files and displaying the first route segment on the Windy map.

Windy plugins are web applications that run inside the Windy.com and Windy mobile app environment. This plugin uses:

- `desktopUI: 'rhpane'` for desktop.
- `mobileUI: 'fullscreen'` for iPhone and iPad.
- `private: true` so the plugin is not listed publicly by default.

## Local Development

```bash
npm install
npm start
```

The dev server builds and serves the plugin at:

```text
https://localhost:9999/plugin.js
```

Open that URL once in your browser and accept the self-signed certificate. Then open:

```text
https://www.windy.com/developer-mode
```

Install the local plugin URL from developer mode.

## iOS Usage

To use this in the Windy iPhone/iPad app, publish it as a private Windy plugin first. Windy requires published plugins to be served from the `windy-plugins.com` domain.

1. Create a Windy Plugins API key at `https://api.windy.com/keys`.
2. Publish the plugin with the official workflow or upload process.
3. Install the private plugin URL in Windy.
4. Open it from Windy on iPhone or iPad.

After opening the plugin on iPhone or iPad, choose an `.efbDPP` file from Files. The plugin reads `DigitalFlightPlan`, extracts only the first `Company_EnRoute_ID`, keeps the original `Lat` and `Long` values for inspection, converts them to decimal coordinates, and draws markers plus a route line. SQLite parsing is implemented in the plugin for this file format, so no WASM or external parser asset is required.

This does not embed Windy inside your own native iOS app. For a separate iOS app, use Windy API products instead of the Windy plugin system.

## Main Files

- `src/pluginConfig.ts`: plugin metadata, route, desktop layout, mobile layout, privacy.
- `src/plugin.svelte`: file picker, map drawing, marker cleanup, and iOS-friendly fullscreen UI.
- `src/efbdppParser.ts`: browser-side SQLite parsing and coordinate conversion.
- `rollup.config.js`: official Windy template build configuration.
