import type { FlightPlanRoute, Waypoint } from './efbdppParser';

const STORAGE_KEY = 'efbdpp:lastRoute';
const SCHEMA_VERSION = 1;

interface StoredRoute {
    schemaVersion: number;
    savedAt: string;
    route: FlightPlanRoute;
}

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isWaypoint = (value: unknown): value is Waypoint => {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const waypoint = value as Partial<Waypoint>;

    return (
        typeof waypoint.routeId === 'string' &&
        isFiniteNumber(waypoint.rowIndex) &&
        typeof waypoint.sequence === 'string' &&
        typeof waypoint.name === 'string' &&
        typeof waypoint.latRaw === 'string' &&
        typeof waypoint.lonRaw === 'string' &&
        isFiniteNumber(waypoint.lat) &&
        isFiniteNumber(waypoint.lon)
    );
};

const isRoute = (value: unknown): value is FlightPlanRoute => {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const route = value as Partial<FlightPlanRoute>;

    return (
        typeof route.flightId === 'string' &&
        typeof route.flightDate === 'string' &&
        typeof route.routeId === 'string' &&
        Array.isArray(route.waypoints) &&
        route.waypoints.length > 0 &&
        route.waypoints.every(isWaypoint)
    );
};

const canUseLocalStorage = () => {
    try {
        return typeof window !== 'undefined' && Boolean(window.localStorage);
    } catch {
        return false;
    }
};

export const saveRoute = (route: FlightPlanRoute) => {
    if (!canUseLocalStorage()) {
        return false;
    }

    const payload: StoredRoute = {
        schemaVersion: SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        route,
    };

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch (error) {
        console.warn('Unable to save efbDPP route.', error);
        return false;
    }
};

export const loadSavedRoute = () => {
    if (!canUseLocalStorage()) {
        return null;
    }

    try {
        const rawValue = window.localStorage.getItem(STORAGE_KEY);

        if (!rawValue) {
            return null;
        }

        const stored = JSON.parse(rawValue) as Partial<StoredRoute>;

        if (stored.schemaVersion !== SCHEMA_VERSION || !isRoute(stored.route)) {
            return null;
        }

        return stored.route;
    } catch (error) {
        console.warn('Unable to load saved efbDPP route.', error);
        return null;
    }
};

export const clearSavedRoute = () => {
    if (!canUseLocalStorage()) {
        return false;
    }

    try {
        window.localStorage.removeItem(STORAGE_KEY);
        return true;
    } catch (error) {
        console.warn('Unable to clear saved efbDPP route.', error);
        return false;
    }
};
