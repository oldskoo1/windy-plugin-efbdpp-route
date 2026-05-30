import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-efbdpp-route',
    version: '0.1.5',
    icon: '✈️',
    title: 'efbDPP Route',
    description: 'Load an efbDPP flight plan and display the first route segment on the Windy map.',
    author: 'Your Name',
    repository: 'https://example.com/your-org/windy-plugin-efbdpp-route',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    routerPath: '/efbdpp-route',
    private: true,
};

export default config;
