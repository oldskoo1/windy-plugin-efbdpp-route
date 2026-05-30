import { getPointForecastData } from '@windy/fetch';

import type { DataHash } from '@windy/interfaces.d';
import type { Products } from '@windy/rootScope.d';

import type { Waypoint } from './efbdppParser';

const DEFAULT_FORECAST_MODEL: Products = 'ecmwf';
const FORECAST_STEP = 1;
const MAX_FORECAST_ROWS = 8;

export interface WaypointForecastRow {
    timestamp: number;
    timeLabel: string;
    tempC: number | null;
    windKt: number | null;
    gustKt: number | null;
    windDir: number | null;
    precipMm: number | null;
    pressureHpa: number | null;
    humidityPct: number | null;
    dewPointC: number | null;
    cloudBaseFt: number | null;
    icing: number | null;
    turbulence: number | null;
    weatherCode: string | null;
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
const paToHpa = (value: number | null) => (value === null ? null : value / 100);
const metersToFeet = (value: number | null) => (value === null ? null : value * 3.28084);

const formatTime = (timestamp: number) =>
    new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp));

export const formatForecastValue = (value: number | null, digits = 0) =>
    value === null ? 'n/a' : value.toFixed(digits);

export const formatForecastCode = (value: string | null) => value || 'n/a';

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
        const pressure = finiteOrNull(data.pressure[index]);
        const dewPointK = finiteOrNull(data.dewPoint[index]);
        const cloudBase = finiteOrNull(data.cbase?.[index]);

        return {
            timestamp,
            timeLabel: formatTime(timestamp),
            tempC: kelvinToCelsius(tempK),
            windKt: msToKnots(wind),
            gustKt: msToKnots(gust),
            windDir: finiteOrNull(data.windDir[index]),
            precipMm: finiteOrNull(data.mm[index]),
            pressureHpa: paToHpa(pressure),
            humidityPct: finiteOrNull(data.rh[index]),
            dewPointC: kelvinToCelsius(dewPointK),
            cloudBaseFt: metersToFeet(cloudBase),
            icing: finiteOrNull(data.icing?.[index]),
            turbulence: finiteOrNull(data.turbulence?.[index]),
            weatherCode: typeof data.weathercode?.[index] === 'string' ? data.weathercode[index] : null,
        };
    });

    return {
        waypointKey: waypointKey(waypoint),
        model,
        rows,
    };
};
