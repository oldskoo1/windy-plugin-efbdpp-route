import type { FlightPlanRoute, Waypoint } from './efbdppParser';

const escapeXml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

const waypointName = (waypoint: Waypoint, index: number) =>
    waypoint.name || waypoint.sequence || `Waypoint ${index + 1}`;

export const routeToGpx = (route: FlightPlanRoute, name = 'efbDPP route') => {
    const routeName = route.flightId || name;
    const routePoints = route.waypoints
        .map(
            (waypoint, index) => `    <rtept lat="${waypoint.lat}" lon="${waypoint.lon}">
      <name>${escapeXml(waypointName(waypoint, index))}</name>
      <desc>${escapeXml(`${waypoint.latRaw} / ${waypoint.lonRaw}`)}</desc>
    </rtept>`,
        )
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="windy-plugin-efbdpp-route" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(routeName)}</name>
  </metadata>
  <rte>
    <name>${escapeXml(routeName)}</name>
${routePoints}
  </rte>
</gpx>`;
};
