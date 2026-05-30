import type { FlightPlanRoute, Waypoint } from './efbdppParser';

const LEGACY_STORAGE_KEY = 'efbdpp:lastRoute';
const STORAGE_KEY = 'efbdpp:recentRoutes';
const SCHEMA_VERSION = 2;
const MAX_SAVED_ROUTES = 10;

export interface SavedRoute {
    id: string;
    fileName: string;
    savedAt: string;
    route: FlightPlanRoute;
}

interface StoredRoutes {
    schemaVersion: number;
    routes: SavedRoute[];
}

interface LegacyStoredRoute {
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

const isSavedRoute = (value: unknown): value is SavedRoute => {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const savedRoute = value as Partial<SavedRoute>;

    return (
        typeof savedRoute.id === 'string' &&
        typeof savedRoute.fileName === 'string' &&
        typeof savedRoute.savedAt === 'string' &&
        isRoute(savedRoute.route)
    );
};

const canUseLocalStorage = () => {
    try {
        return typeof window !== 'undefined' && Boolean(window.localStorage);
    } catch {
        return false;
    }
};

const makeSavedRouteId = (route: FlightPlanRoute, savedAt: string) =>
    [
        savedAt,
        route.flightId || 'flight',
        route.flightDate || 'date',
        route.routeId || 'route',
        String(route.waypoints.length),
    ]
        .join(':')
        .replace(/[^a-z0-9:._-]/gi, '-');

const readRoutes = (): SavedRoute[] => {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
        return [];
    }

    const stored = JSON.parse(rawValue) as Partial<StoredRoutes>;

    if (stored.schemaVersion !== SCHEMA_VERSION || !Array.isArray(stored.routes)) {
        return [];
    }

    return stored.routes.filter(isSavedRoute);
};

const writeRoutes = (routes: SavedRoute[]) => {
    const payload: StoredRoutes = {
        schemaVersion: SCHEMA_VERSION,
        routes: routes.slice(0, MAX_SAVED_ROUTES),
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

const updateRoutes = (updater: (routes: SavedRoute[]) => SavedRoute[]) => {
    if (!canUseLocalStorage()) {
        return [];
    }

    try {
        migrateLegacyRoute();
        const routes = updater(readRoutes()).slice(0, MAX_SAVED_ROUTES);
        writeRoutes(routes);
        return routes;
    } catch (error) {
        console.warn('Unable to update saved efbDPP routes.', error);
        return [];
    }
};

const migrateLegacyRoute = () => {
    const legacyRawValue = window.localStorage.getItem(LEGACY_STORAGE_KEY);

    if (!legacyRawValue || window.localStorage.getItem(STORAGE_KEY)) {
        return;
    }

    const legacy = JSON.parse(legacyRawValue) as Partial<LegacyStoredRoute>;

    if (legacy.schemaVersion !== 1 || !legacy.savedAt || !isRoute(legacy.route)) {
        return;
    }

    const savedRoute: SavedRoute = {
        id: makeSavedRouteId(legacy.route, legacy.savedAt),
        fileName: legacy.route.flightId || 'Saved efbDPP route',
        savedAt: legacy.savedAt,
        route: legacy.route,
    };

    writeRoutes([savedRoute]);
};

export const saveRoute = (route: FlightPlanRoute, fileName = 'efbDPP route') => {
    if (!canUseLocalStorage()) {
        return null;
    }

    try {
        migrateLegacyRoute();

        const savedAt = new Date().toISOString();
        const savedRoute: SavedRoute = {
            id: makeSavedRouteId(route, savedAt),
            fileName,
            savedAt,
            route,
        };
        const routes = [savedRoute, ...readRoutes()].slice(0, MAX_SAVED_ROUTES);

        writeRoutes(routes);
        return savedRoute;
    } catch (error) {
        console.warn('Unable to save efbDPP route.', error);
        return null;
    }
};

export const loadSavedRoutes = () => {
    if (!canUseLocalStorage()) {
        return [];
    }

    try {
        migrateLegacyRoute();
        return readRoutes();
    } catch (error) {
        console.warn('Unable to load saved efbDPP routes.', error);
        return [];
    }
};

export const loadLatestSavedRoute = () => loadSavedRoutes()[0] ?? null;

export const deleteSavedRoute = (id: string) =>
    updateRoutes(routes => routes.filter(route => route.id !== id));

export const renameSavedRoute = (id: string, fileName: string) =>
    updateRoutes(routes =>
        routes.map(route => (route.id === id ? { ...route, fileName } : route)),
    );

export const moveSavedRouteToTop = (id: string) =>
    updateRoutes(routes => {
        const route = routes.find(candidate => candidate.id === id);

        if (!route) {
            return routes;
        }

        return [route, ...routes.filter(candidate => candidate.id !== id)];
    });

export const clearSavedRoutes = () => {
    if (!canUseLocalStorage()) {
        return false;
    }

    try {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        return true;
    } catch (error) {
        console.warn('Unable to clear saved efbDPP routes.', error);
        return false;
    }
};
