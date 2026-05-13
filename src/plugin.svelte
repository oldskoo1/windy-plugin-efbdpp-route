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

            <div class="waypoint-list">
                {#each route.waypoints as waypoint, index}
                    <button type="button" on:click={ () => focusWaypoint(waypoint) }>
                        <span>{ index + 1 }. { waypoint.name }</span>
                        <small>{ waypoint.latRaw } / { waypoint.lonRaw }</small>
                    </button>
                {/each}
            </div>
        {/if}
    </div>
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import { map } from '@windy/map';
    import { onDestroy } from 'svelte';

    import { parseEfbdpp, type FlightPlanRoute, type Waypoint } from './efbdppParser';
    import config from './pluginConfig';

    const { title } = config;

    let route: FlightPlanRoute | null = null;
    let status = 'Select an efbDPP file to show the first route segment on the map.';
    let hasError = false;
    let markers: L.Marker[] = [];
    let routeLine: L.Polyline | null = null;

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
        drawRoute(nextRoute);
        status = `${file.name}: loaded first route segment.`;
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

    .waypoint-list {
        display: flex;
        max-height: 45vh;
        flex-direction: column;
        gap: 8px;
        overflow: auto;
    }

    .waypoint-list button {
        display: flex;
        min-height: 48px;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.06);
        color: inherit;
        padding: 8px 10px;
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
