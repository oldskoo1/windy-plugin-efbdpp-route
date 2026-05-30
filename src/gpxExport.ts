import type { FlightPlanRoute, Waypoint } from './efbdppParser';

const escapeXml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

const waypointName = (waypoint: Waypoint, index: number) =>
    [String(index + 1).padStart(3, '0'), waypoint.name || waypoint.sequence || 'Waypoint']
        .join(' ')
        .trim();

const cleanRouteName = (route: FlightPlanRoute, fileName: string) => {
    const fileBase = fileName.replace(/\.[^.]+$/, '').trim();
    const parts = [route.flightId, route.flightDate, fileBase]
        .map(part => String(part ?? '').trim())
        .filter(Boolean);

    return parts[0] || parts[1] || parts[2] || 'efbDPP Route';
};

export const routeToGpx = (route: FlightPlanRoute, name = 'efbDPP route') => {
    const routeName = cleanRouteName(route, name);
    const routePoints = route.waypoints
        .map(
            (waypoint, index) => `    <rtept lat="${waypoint.lat.toFixed(6)}" lon="${waypoint.lon.toFixed(6)}">
      <name>${escapeXml(waypointName(waypoint, index))}</name>
      <desc>${escapeXml(`efbDPP row ${waypoint.rowIndex}; ${waypoint.latRaw} / ${waypoint.lonRaw}`)}</desc>
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
