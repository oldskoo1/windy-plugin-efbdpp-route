<div class="plugin__mobile-header">
    { title }
</div>
<section class="plugin__content">
    <div
        class="plugin__title plugin__title--chevron-back"
        on:click={ () => bcast.emit('rqstOpen', 'menu') }
    >
        { title }
    </div>

    <div class="panel">
        <label class="file-picker">
            <span>Open efbDPP file</span>
            <input accept=".efbDPP,.efbdpp" type="file" on:change={ handleFileChange } />
        </label>

        {#if status}
            <p class:status-error={ hasError } class="status">{ status }</p>
        {/if}

        {#if savedRoutes.length > 0}
            <div class="route-library">
                <strong>Recent routes</strong>
                <div class="route-file-list">
                    {#each savedRoutes as savedRoute}
                        <div
                            class:route-file--active={ savedRoute.id === selectedSavedRouteId }
                            class="route-file"
                        >
                            <button class="route-file-main" type="button" on:click={ () => loadSavedRoute(savedRoute) }>
                                <span>{ savedRoute.fileName }</span>
                                <small>
                                    { savedRoute.route.waypoints.length } pts · { formatSavedTime(savedRoute.savedAt) }
                                </small>
                            </button>
                            <div class="route-file-actions">
                                <button type="button" on:click={ () => renameRoute(savedRoute) }>
                                    Rename
                                </button>
                                <button type="button" on:click={ () => removeSavedRoute(savedRoute) }>
                                    Delete
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
                <small>Latest { savedRoutes.length } of 10 uploads are kept on this device.</small>
            </div>
        {/if}

        {#if route}
            <div class="summary">
                <strong>{ route.waypoints.length }</strong>
                <span>waypoints loaded</span>
            </div>

            <button class="primary-action" type="button" on:click={ openRoutePlanner }>
                Open in Route Planner
            </button>

            <button class="secondary-button" type="button" on:click={ clearRoute }>
                Clear saved routes
            </button>

            <div class="waypoint-list">
                {#each route.waypoints as waypoint, index}
                    <div class="waypoint-card">
                        <button class="waypoint-main" type="button" on:click={ () => focusWaypoint(waypoint) }>
                            <span>{ index + 1 }. { waypoint.name }</span>
                            <small>{ waypoint.latRaw } / { waypoint.lonRaw }</small>
                        </button>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import { map } from '@windy/map';
    import { onDestroy, onMount } from 'svelte';

    import { parseEfbdpp, type FlightPlanRoute, type Waypoint } from './efbdppParser';
    import config from './pluginConfig';
    import { routeToGpx } from './gpxExport';
    import {
        clearSavedRoutes,
        deleteSavedRoute,
        loadLatestSavedRoute,
        loadSavedRoutes,
        moveSavedRouteToTop,
        renameSavedRoute,
        saveRoute,
        type SavedRoute,
    } from './routeStorage';

    const { title } = config;

    let route: FlightPlanRoute | null = null;
    let status = 'Select an efbDPP file to show the first route segment on the map.';
    let hasError = false;
    let markers: L.Marker[] = [];
    let routeLine: L.Polyline | null = null;
    let savedRoutes: SavedRoute[] = [];
    let selectedSavedRouteId = '';

    const formatSavedTime = (savedAt: string) =>
        new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(savedAt));

    const clearMap = () => {
        markers.forEach(marker => marker.remove());
        markers = [];

        if (routeLine) {
            routeLine.remove();
            routeLine = null;
        }
    };

    const markerIcon = (index: number) =>
        L.divIcon({
            className: 'efbdpp-marker',
            html: `<span>${index + 1}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
        });

    const drawRoute = (nextRoute: FlightPlanRoute) => {
        clearMap();

        const latLngs = nextRoute.waypoints.map(waypoint => [waypoint.lat, waypoint.lon] as [number, number]);

        routeLine = L.polyline(latLngs, {
            color: '#2f88ff',
            weight: 3,
            opacity: 0.9,
        }).addTo(map);

        markers = nextRoute.waypoints.map((waypoint, index) => {
            const marker = L.marker([waypoint.lat, waypoint.lon], {
                icon: markerIcon(index),
                title: waypoint.name,
            }).addTo(map);

            marker.bindPopup(`
                <strong>${waypoint.name}</strong><br>
                ${waypoint.latRaw} / ${waypoint.lonRaw}<br>
                ${waypoint.lat.toFixed(6)}, ${waypoint.lon.toFixed(6)}
            `);

            return marker;
        });

        const bounds = L.latLngBounds(latLngs);
        map.fitBounds(bounds, { padding: [32, 32] });
    };

    const focusWaypoint = (waypoint: Waypoint) => {
        map.setView([waypoint.lat, waypoint.lon], Math.max(map.getZoom(), 8), { animate: true });
    };

    const setActiveRoute = (savedRoute: SavedRoute, source: 'saved' | 'uploaded') => {
        route = savedRoute.route;
        selectedSavedRouteId = savedRoute.id;
        drawRoute(savedRoute.route);
        hasError = false;
        status =
            source === 'uploaded'
                ? `${savedRoute.fileName}: loaded first route segment and saved locally.`
                : `${savedRoute.fileName}: restored ${savedRoute.route.waypoints.length} waypoints.`;
    };

    const refreshSavedRoutes = () => {
        savedRoutes = loadSavedRoutes();
    };

    const loadSavedRoute = (savedRoute: SavedRoute) => {
        savedRoutes = moveSavedRouteToTop(savedRoute.id);
        setActiveRoute(savedRoute, 'saved');
    };

    const renameRoute = (savedRoute: SavedRoute) => {
        const nextName = window.prompt('Rename saved route', savedRoute.fileName)?.trim();

        if (!nextName || nextName === savedRoute.fileName) {
            return;
        }

        savedRoutes = renameSavedRoute(savedRoute.id, nextName);
        const renamedRoute = savedRoutes.find(candidate => candidate.id === savedRoute.id);

        if (renamedRoute && selectedSavedRouteId === savedRoute.id) {
            setActiveRoute(renamedRoute, 'saved');
        }
    };

    const removeSavedRoute = (savedRoute: SavedRoute) => {
        savedRoutes = deleteSavedRoute(savedRoute.id);

        if (selectedSavedRouteId !== savedRoute.id) {
            return;
        }

        const nextRoute = savedRoutes[0] ?? null;

        if (nextRoute) {
            setActiveRoute(nextRoute, 'saved');
            return;
        }

        clearMap();
        route = null;
        selectedSavedRouteId = '';
        hasError = false;
        status = 'Saved route deleted. Select an efbDPP file to show the first route segment on the map.';
    };

    const openRoutePlanner = () => {
        if (!route) {
            return;
        }

        try {
            const activeSavedRoute = savedRoutes.find(candidate => candidate.id === selectedSavedRouteId);
            const content = routeToGpx(route, activeSavedRoute?.fileName);

            bcast.emit('rqstOpen', 'rplanner', {
                source: 'api',
                import: true,
                content,
            } as never);
        } catch (error) {
            console.error(error);
            hasError = true;
            status = error instanceof Error ? error.message : 'Unable to open Windy Route Planner.';
        }
    };

    const loadFile = async (file: File) => {
        hasError = false;
        status = `Reading ${file.name}...`;

        const buffer = await file.arrayBuffer();
        const nextRoute = await parseEfbdpp(buffer);

        const savedRoute = saveRoute(nextRoute, file.name);

        refreshSavedRoutes();

        if (savedRoute) {
            setActiveRoute(savedRoute, 'uploaded');
            return;
        }

        route = nextRoute;
        selectedSavedRouteId = '';
        drawRoute(nextRoute);
        status = `${file.name}: loaded first route segment, but local storage was unavailable.`;
    };

    const restoreSavedRoute = () => {
        refreshSavedRoutes();
        const savedRoute = loadLatestSavedRoute();

        if (!savedRoute) {
            return;
        }

        setActiveRoute(savedRoute, 'saved');
    };

    const clearRoute = () => {
        clearSavedRoutes();
        clearMap();
        route = null;
        savedRoutes = [];
        selectedSavedRouteId = '';
        hasError = false;
        status = 'Saved routes cleared. Select an efbDPP file to show the first route segment on the map.';
    };

    const handleFileChange = async (event: Event) => {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];

        if (!file) {
            return;
        }

        try {
            await loadFile(file);
        } catch (error) {
            console.error(error);
            clearMap();
            route = null;
            hasError = true;
            status = error instanceof Error ? error.message : 'Unable to parse this efbDPP file.';
        } finally {
            input.value = '';
        }
    };

    export const onopen = () => {
        status = route
            ? `${route.waypoints.length} waypoints loaded.`
            : 'Select an efbDPP file to show the first route segment on the map.';
    };

    onMount(() => {
        restoreSavedRoute();
    });

    onDestroy(() => {
        clearMap();
    });
</script>

<style lang="less">
    .panel {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 16px 0 24px;
    }

    .file-picker {
        display: flex;
        min-height: 44px;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: #2f88ff;
        color: #fff;
        font-weight: 700;
    }

    .file-picker input {
        display: none;
    }

    .status {
        margin: 0;
        line-height: 1.45;
    }

    .status-error {
        color: #ff6f61;
    }

    .summary {
        display: flex;
        gap: 8px;
        align-items: baseline;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        padding: 12px;
    }

    .summary strong {
        font-size: 24px;
    }

    .route-library {
        display: flex;
        flex-direction: column;
        gap: 8px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        padding: 10px;
    }

    .route-file-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .route-file {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.06);
        padding: 8px;
    }

    .route-file-main {
        display: flex;
        min-height: 44px;
        min-width: 0;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        border: 0;
        background: transparent;
        color: inherit;
        padding: 0;
        text-align: left;
    }

    .route-file--active {
        border-color: rgba(47, 136, 255, 0.85);
        background: rgba(47, 136, 255, 0.18);
    }

    .route-file-main span {
        max-width: 100%;
        overflow: hidden;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .route-file-actions {
        display: flex;
        gap: 6px;
    }

    .route-file-actions button {
        min-height: 34px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.22);
        color: inherit;
        padding: 0 8px;
        font-weight: 700;
    }

    .route-library small {
        color: var(--color-grey);
        line-height: 1.35;
    }

    .primary-action {
        min-height: 44px;
        border: 1px solid rgba(47, 136, 255, 0.7);
        border-radius: 8px;
        background: #2f88ff;
        color: #fff;
        font-weight: 700;
    }

    .secondary-button {
        min-height: 40px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        font-weight: 700;
    }

    .waypoint-list {
        display: flex;
        max-height: 45vh;
        flex-direction: column;
        gap: 8px;
        overflow: auto;
    }

    .waypoint-card {
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.06);
        padding: 8px;
    }

    .waypoint-main {
        display: flex;
        min-height: 48px;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        border: 0;
        background: transparent;
        color: inherit;
        padding: 0 2px;
        text-align: left;
    }

    .waypoint-list small {
        color: var(--color-grey);
    }

    :global(.efbdpp-marker) {
        border: 2px solid #fff;
        border-radius: 50%;
        background: #2f88ff;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        line-height: 24px;
        text-align: center;
    }
</style>
