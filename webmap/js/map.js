"use strict";

const TILE_BASE = ["127.0.0.1", "localhost"].includes(window.location.hostname)
    ? "http://127.0.0.1:57801/tiles"
    : `${window.location.origin}/tiles`;

function getVectorTileUrl(sourceLayer) {
    return `${TILE_BASE}/${sourceLayer}/{z}/{x}/{y}.pbf`;
}

const PROJECT_BOUNDS = [
    [43.213181901707514, 39.65029208702538],
    [44.80661416668261, 40.688585809429775]
];

const BASEMAP_DEFINITIONS = Object.freeze({
    satellite: { id: "satellite", type: "raster" },
    terrain: { id: "terrain", type: "raster" },
    "esri-light": { id: "esri-light", type: "raster" },
    osm: { id: "osm", type: "raster" },
    "openfreemap-dark": { id: "openfreemap-dark", type: "vector-style", styleUrl: "https://tiles.openfreemap.org/styles/dark" },
    "openfreemap-fiord": { id: "openfreemap-fiord", type: "vector-style", styleUrl: "https://tiles.openfreemap.org/styles/fiord" }
});
const BASEMAP_LAYER_IDS = Object.freeze(Object.values(BASEMAP_DEFINITIONS)
    .filter(definition => definition.type === "raster")
    .map(definition => `basemap-${definition.id}`));

function createRasterBaseStyle() {
    return {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
            "basemap-osm-source": { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "&copy; OpenStreetMap contributors" },
            "basemap-satellite-source": { type: "raster", tiles: ["https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}"], tileSize: 256, attribution: "Tiles &copy; Google, Map data &copy" },
            "basemap-terrain-source": { type: "raster", tiles: ["https://mt0.google.com/vt/lyrs=p&hl=en&x={x}&y={y}&z={z}"], tileSize: 256, attribution: "Tiles &copy; Google, Map data &copy" },
            "basemap-esri-light-source": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "&copy; Esri, HERE, Garmin, OpenStreetMap contributors, and the GIS user community" }
        },
        layers: BASEMAP_LAYER_IDS.map((id) => ({
            id,
            type: "raster",
            source: `${id}-source`,
            layout: { visibility: id === "basemap-satellite" ? "visible" : "none" }
        }))
    };
}

const map = new maplibregl.Map({
    container: "map",

    style: createRasterBaseStyle(),

    bounds: PROJECT_BOUNDS,
    fitBoundsOptions: {
        padding: getProjectPadding(),
        duration: 0
    }
});

map.addControl(
    new maplibregl.NavigationControl(),
    "top-right"
);

map.addControl(
    new maplibregl.ScaleControl({
        maxWidth: 120,
        unit: "metric"
    }),
    "bottom-right"
);

const coordinateElement =
    document.getElementById("mouse-coordinates");
const zoomElement =
    document.getElementById("map-zoom-level");

function updateZoomDisplay() {
    if (!zoomElement) {
        return;
    }

    const zoom = map.getZoom();

    zoomElement.textContent = Number.isFinite(zoom)
        ? zoom.toFixed(2)
        : "-";
}

map.on("zoom", updateZoomDisplay);
map.on("load", updateZoomDisplay);
updateZoomDisplay();

map.on("mousemove", (event) => {
    if (!coordinateElement) {
        return;
    }

    const longitude = event.lngLat.lng.toFixed(6);
    const latitude = event.lngLat.lat.toFixed(6);

    coordinateElement.textContent =
        `${longitude}, ${latitude}`;
});

map.on("mouseout", () => {
    if (!coordinateElement) {
        return;
    }

    const center = map.getCenter();

    coordinateElement.textContent =
        `${center.lng.toFixed(6)}, ${center.lat.toFixed(6)}`;
});

function focusProject(options = {}) {
    map.fitBounds(PROJECT_BOUNDS, {
        padding: getProjectPadding(),
        duration: 700,
        ...options
    });
}

function getProjectPadding() {
    const isMobile =
        window.matchMedia("(max-width: 760px)").matches;

    return isMobile
        ? { top: 70, right: 30, bottom: 60, left: 30 }
        : { top: 50, right: 50, bottom: 60, left: 50 };
}

function setBasemap(basemapName) {
    if (typeof window.switchKiadBasemap === "function") {
        return window.switchKiadBasemap(basemapName);
    }

    const targetLayerId = `basemap-${basemapName}`;

    BASEMAP_LAYER_IDS.forEach((layerId) => {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(
                layerId,
                "visibility",
                layerId === targetLayerId ? "visible" : "none"
            );
        }
    });
}

const focusProjectButton = document.getElementById("focus-project");
const basemapToggle = document.getElementById("basemap-toggle");
const basemapMenu = document.getElementById("basemap-menu");
const basemapOptions = document.querySelectorAll(".basemap-option");

function setBasemapMenuState(isOpen) {
    if (!basemapMenu || !basemapToggle) {
        return;
    }

    basemapMenu.hidden = !isOpen;
    basemapToggle.setAttribute("aria-expanded", String(isOpen));
}

focusProjectButton?.addEventListener("click", focusProject);

basemapToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    setBasemapMenuState(basemapMenu.hidden);
});

basemapMenu?.addEventListener("click", (event) => {
    event.stopPropagation();
});

basemapOptions.forEach((option) => {
    option.addEventListener("click", () => {
        const basemapName = option.dataset.basemap;

        if (!basemapName) {
            return;
        }

        Promise.resolve(setBasemap(basemapName)).then((didSwitch) => {
            if (didSwitch === false) return;
            basemapOptions.forEach((item) => item.classList.toggle("is-active", item === option));
            setBasemapMenuState(false);
        });
    });
});

document.addEventListener("click", () => {
    setBasemapMenuState(false);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        setBasemapMenuState(false);
    }
});

function ensureAssetSource() {
    if (map.getSource("assets-source")) return;

    /*
     * pg_tileserv üzerinden yayınlanan public.assets
     * vektör tile kaynağı.
     */
    map.addSource("assets-source", {
        type: "vector",
        tiles: [
            getVectorTileUrl("public.web_assets")
        ],
        minzoom: 0,
        maxzoom: 22,
        bounds: [
            43.213181901707514,
            39.65029208702538,
            44.80661416668261,
            40.688585809429775
        ]

    });
}

function rebuildBaseAssetLayers() {
    ensureAssetSource();
    addAssetLayers(map);
}

let assetMapInteractionsBound = false;

function bindAssetMapInteractions() {
    if (assetMapInteractionsBound) return;
    assetMapInteractionsBound = true;
    /*
        const assetLayerToggles =
            document.querySelectorAll(
                ".asset-layer-toggle"
            );
    
        assetLayerToggles.forEach((toggle) => {
            toggle.addEventListener("change", () => {
                const groupId =
                    toggle.dataset.layerGroup;
    
                if (!groupId) {
                    return;
                }
    
                setAssetLayerVisibility(
                    map,
                    groupId,
                    toggle.checked
                );
            });
        });
    */
    /*
     * Tıklanabilir katmanlar.
     * Bu bölüm load bloğu içinde olmalı; çünkü katmanların
     * önce map.addLayer ile oluşturulması gerekiyor.
     */
    const interactiveLayers = getInteractiveAssetLayerIds();

    interactiveLayers.forEach((layerId) => {

        map.on("mouseenter", layerId, () => {
            map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
        });

        map.on("click", layerId, (event) => {

            if (
                typeof isTunnelFaceMarkerAtPoint === "function" &&
                isTunnelFaceMarkerAtPoint(event.point)
            ) {
                return;
            }

            if (
                typeof isDsmPointAtPoint === "function" &&
                isDsmPointAtPoint(event.point)
            ) {
                return;
            }

            const feature = event.features?.[0];

            if (!feature) {
                return;
            }

            const properties = feature.properties ?? {};
            openAssetPopup(map, properties, event.lngLat);
        });
    });
}

map.on("load", () => {
    rebuildBaseAssetLayers();
    bindAssetMapInteractions();
    window.KIAD_MAP_LOAD_HANDLERS?.forEach(initialize => initialize());

    map.once("idle", () => {
        window.KIAD_INITIAL_MAP_IDLE = true;
        window.dispatchEvent(new Event("kiad:initial-map-idle"));
    });



    map.on("error", (event) => {
        console.error("MapLibre error:", event.error);
    });

    window.addEventListener("kiad:layout-changed", () => {
        map.resize();
    });
    // Close the initial map "load" event handler
});

window.KIAD_BASEMAPS = BASEMAP_DEFINITIONS;
window.createKiadRasterBaseStyle = createRasterBaseStyle;
window.rebuildBaseAssetLayers = rebuildBaseAssetLayers;
