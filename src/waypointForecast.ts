import { getPointForecastData } from '@windy/fetch';

import type { DataHash } from '@windy/interfaces.d';
import type { Products } from '@windy/rootScope.d';

import type { Waypoint } from './efbdppParser';

const DEFAULT_FORECAST_MODEL: Products = 'ecmwf';
const FORECAST_STEP = 3;
const MAX_FORECAST_ROWS = 6;

export interface WaypointForecastRow {
    timestamp: number;
    timeLabel: string;
    tempC: number | null;
    windKt: number | null;
    gustKt: number | null;
    windDir: number | null;
    precipMm: number | null;
}

export interface WaypointForecast {
    waypointKey: string;
    model: Products;
    rows: WaypointForecastRow[];
}

export const waypointKey = (waypoint: Waypoint) =>
    `${waypoint.routeId}:${waypoint.rowIndex}:${waypoint.lat.toFixed(6)}:${waypoint.lon.toFixed(6)}`;

const finiteOrNull = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const kelvinToCelsius = (value: number | null) => (value === null ? null : value - 273.15);
const msToKnots = (value: number | null) => (value === null ? null : value * 1.943844);

const formatTime = (timestamp: number) =>
    new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp));

export const formatForecastValue = (value: number | null, digits = 0) =>
    value === null ? 'n/a' : value.toFixed(digits);

export const loadWaypointForecast = async (
    waypoint: Waypoint,
    model: Products = DEFAULT_FORECAST_MODEL,
): Promise<WaypointForecast> => {
    const { data: payload } = await getPointForecastData<DataHash>(
        model,
        {
            lat: waypoint.lat,
            lon: waypoint.lon,
            step: FORECAST_STEP,
            interpolate: true,
        },
        { source: 'windy-plugin-efbdpp-route' },
    );
    const data = payload.data;
    const rows = data.ts.slice(0, MAX_FORECAST_ROWS).map((timestamp, index) => {
        const tempK = finiteOrNull(data.temp[index]);
        const wind = finiteOrNull(data.wind[index]);
        const gust = finiteOrNull(data.gust[index]);

        return {
            timestamp,
            timeLabel: formatTime(timestamp),
            tempC: kelvinToCelsius(tempK),
            windKt: msToKnots(wind),
            gustKt: msToKnots(gust),
            windDir: finiteOrNull(data.windDir[index]),
            precipMm: finiteOrNull(data.mm[index]),
        };
    });

    return {
        waypointKey: waypointKey(waypoint),
        model,
        rows,
    };
};
