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

        {#if route}
            <div class="summary">
                <strong>{ route.waypoints.length }</strong>
                <span>waypoints loaded</span>
            </div>

            <button class="secondary-button" type="button" on:click={ clearRoute }>
                Clear saved route
            </button>

            <div class="waypoint-list">
                {#each route.waypoints as waypoint, index}
                    <div class="waypoint-card">
                        <button class="waypoint-main" type="button" on:click={ () => focusWaypoint(waypoint) }>
                            <span>{ index + 1 }. { waypoint.name }</span>
                            <small>{ waypoint.latRaw } / { waypoint.lonRaw }</small>
                        </button>
                        <button
                            class="forecast-button"
                            disabled={ loadingForecastKey === waypointKey(waypoint) }
                            type="button"
                            on:click={ () => showForecast(waypoint) }
                        >
                            { loadingForecastKey === waypointKey(waypoint) ? 'Loading' : 'Forecast' }
                        </button>

                        {#if activeForecastKey === waypointKey(waypoint)}
                            <div class="forecast-panel">
                                {#if forecastStatus}
                                    <p class:status-error={ forecastHasError } class="status">
                                        { forecastStatus }
                                    </p>
                                {/if}

                                {#if forecastByWaypoint[waypointKey(waypoint)]}
                                    <div class="forecast-table">
                                        <div class="forecast-row forecast-row--head">
                                            <span>Time</span>
                                            <span>Temp</span>
                                            <span>Wind</span>
                                            <span>Gust</span>
                                            <span>Rain</span>
                                        </div>
                                        {#each forecastByWaypoint[waypointKey(waypoint)].rows as row}
                                            <div class="forecast-row">
                                                <span>{ row.timeLabel }</span>
                                                <span>{ formatForecastValue(row.tempC) }°C</span>
                                                <span>
                                                    { formatForecastValue(row.windKt) } kt
                                                    {#if row.windDir !== null}
                                                        / { formatForecastValue(row.windDir) }°
                                                    {/if}
                                                </span>
                                                <span>{ formatForecastValue(row.gustKt) } kt</span>
                                                <span>{ formatForecastValue(row.precipMm, 1) } mm</span>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/if}
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
    import { clearSavedRoute, loadSavedRoute, saveRoute } from './routeStorage';
    import {
        formatForecastValue,
        loadWaypointForecast,
        waypointKey,
        type WaypointForecast,
    } from './waypointForecast';

    const { title } = config;

    let route: FlightPlanRoute | null = null;
    let status = 'Select an efbDPP file to show the first route segment on the map.';
    let hasError = false;
    let markers: L.Marker[] = [];
    let routeLine: L.Polyline | null = null;
    let forecastByWaypoint: Record<string, WaypointForecast> = {};
    let activeForecastKey = '';
    let loadingForecastKey = '';
    let forecastStatus = '';
    let forecastHasError = false;

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

    const loadFile = async (file: File) => {
        hasError = false;
        status = `Reading ${file.name}...`;

        const buffer = await file.arrayBuffer();
        const nextRoute = await parseEfbdpp(buffer);

        route = nextRoute;
        forecastByWaypoint = {};
        activeForecastKey = '';
        drawRoute(nextRoute);
        const saved = saveRoute(nextRoute);
        status = `${file.name}: loaded first route segment${saved ? ' and saved locally' : ''}.`;
    };

    const restoreSavedRoute = () => {
        const savedRoute = loadSavedRoute();

        if (!savedRoute) {
            return;
        }

        route = savedRoute;
        drawRoute(savedRoute);
        hasError = false;
        status = `Restored saved route with ${savedRoute.waypoints.length} waypoints.`;
    };

    const clearRoute = () => {
        clearSavedRoute();
        clearMap();
        route = null;
        forecastByWaypoint = {};
        activeForecastKey = '';
        forecastStatus = '';
        forecastHasError = false;
        hasError = false;
        status = 'Saved route cleared. Select an efbDPP file to show the first route segment on the map.';
    };

    const showForecast = async (waypoint: Waypoint) => {
        const key = waypointKey(waypoint);
        activeForecastKey = activeForecastKey === key ? '' : key;

        if (!activeForecastKey || forecastByWaypoint[key]) {
            forecastStatus = '';
            forecastHasError = false;
            return;
        }

        loadingForecastKey = key;
        forecastStatus = `Loading forecast for ${waypoint.name || `waypoint ${waypoint.rowIndex}`}...`;
        forecastHasError = false;

        try {
            const forecast = await loadWaypointForecast(waypoint);
            forecastByWaypoint = {
                ...forecastByWaypoint,
                [key]: forecast,
            };
            forecastStatus = '';
        } catch (error) {
            console.error(error);
            forecastHasError = true;
            forecastStatus = error instanceof Error ? error.message : 'Unable to load waypoint forecast.';
        } finally {
            loadingForecastKey = '';
        }
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
        display: grid;
        grid-template-columns: minmax(0, 1fr) 88px;
        gap: 8px;
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

    .forecast-button {
        min-height: 40px;
        align-self: center;
        border: 1px solid rgba(47, 136, 255, 0.7);
        border-radius: 8px;
        background: rgba(47, 136, 255, 0.16);
        color: inherit;
        font-weight: 700;
    }

    .forecast-button:disabled {
        opacity: 0.65;
    }

    .forecast-panel {
        grid-column: 1 / -1;
        overflow-x: auto;
    }

    .forecast-table {
        display: flex;
        min-width: 520px;
        flex-direction: column;
        gap: 1px;
    }

    .forecast-row {
        display: grid;
        grid-template-columns: 1.6fr repeat(4, 1fr);
        gap: 8px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.16);
        padding: 7px 8px;
        font-size: 12px;
        line-height: 1.25;
    }

    .forecast-row--head {
        color: var(--color-grey);
        font-weight: 700;
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
