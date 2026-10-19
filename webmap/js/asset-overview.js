"use strict";

const ASSET_OVERVIEW_SOURCE_ID = "asset-overview-source";
const ASSET_OVERVIEW_SOURCE_LAYER = "public.web_asset_overview_points";
const ASSET_OVERVIEW_LAYER_ID = "asset-overview-symbols";
const ASSET_OVERVIEW_BOUNDS = [
    43.42006166697776, 39.668352841657054,
    44.78142667537558, 40.63049171095339
];
const ASSET_OVERVIEW_GROUP_CATEGORIES = Object.freeze({
    tunnels: "TUNNEL",
    viaducts: "VIADUCT",
    stations: "STATION"
});
const ASSET_OVERVIEW_IMAGE_PATHS = Object.freeze({
    TUNNEL: "./assets/icons/overview/overview-tunnel.svg?v=1",
    VIADUCT: "./assets/icons/overview/overview-viaduct.svg?v=1",
    STATION: "./assets/icons/overview/overview-station.svg?v=1"
});
const ASSET_OVERVIEW_STATION_CODES = Object.freeze(
    Object.fromEntries(Array.from({ length: 7 }, (_, index) => {
        const number = String(index + 1).padStart(2, "0");
        return [`ISTASYON-${number}`, `İ${number}`];
    }))
);

const selectedOverviewAssetIds = new Map();
let overviewImagePromise = null;
let overviewBuildGeneration = 0;
let overviewInteractionsBound = false;

function isAssetOverviewEnabled() {
    return ["127.0.0.1", "localhost", "kiad.tr"].includes(window.location.hostname);
}

window.addEventListener("kiad:asset-group-selection-changed", (event) => {
    const groupId = event.detail?.groupId;
    if (!(groupId in ASSET_OVERVIEW_GROUP_CATEGORIES)) return;

    selectedOverviewAssetIds.set(
        groupId,
        Array.isArray(event.detail.selectedAssetIds)
            ? event.detail.selectedAssetIds.map(Number).filter(Number.isFinite)
            : null
    );
    applyAssetOverviewSelection();
});

if (isAssetOverviewEnabled()) {
    window.KIAD_MAP_LOAD_HANDLERS.push(() => {
        void addAssetOverviewLayers();
    });
}

function loadAssetOverviewImage(path) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = 32;
                canvas.height = 32;
                const context = canvas.getContext("2d");
                if (!context) throw new Error("Canvas 2D context oluşturulamadı");
                context.drawImage(image, 0, 0, 32, 32);
                resolve(context.getImageData(0, 0, 32, 32));
            } catch (error) {
                reject(error);
            }
        };
        image.onerror = () => reject(new Error(`SVG yüklenemedi: ${path}`));
        image.src = path;
    });
}

function getAssetOverviewImages() {
    if (!overviewImagePromise) {
        overviewImagePromise = Promise.all(
            Object.entries(ASSET_OVERVIEW_IMAGE_PATHS).map(async ([category, path]) => [
                category,
                await loadAssetOverviewImage(path)
            ])
        ).catch((error) => {
            overviewImagePromise = null;
            throw error;
        });
    }
    return overviewImagePromise;
}

function getAssetOverviewTextExpression() {
    const stationCode = ["to-string", ["get", "symbol_code"]];
    const stationLabels = Object.entries(ASSET_OVERVIEW_STATION_CODES).flat();
    return [
        "case",
        ["==", ["get", "symbol_category"], "STATION"],
        ["match", stationCode, ...stationLabels, stationCode],
        stationCode
    ];
}

async function addAssetOverviewLayers() {
    if (!isAssetOverviewEnabled()) return;
    const generation = ++overviewBuildGeneration;

    try {
        const images = await getAssetOverviewImages();
        if (generation !== overviewBuildGeneration) return;
        if (!map.isStyleLoaded()) {
            map.once("idle", () => {
                if (generation === overviewBuildGeneration) void addAssetOverviewLayers();
            });
            return;
        }

        const style = ASSET_STYLES.assetOverview;
        images.forEach(([category, image]) => {
            const imageId = style.categories[category];
            if (!map.hasImage(imageId)) map.addImage(imageId, image, { pixelRatio: 1 });
        });

        if (!map.getSource(ASSET_OVERVIEW_SOURCE_ID)) {
            map.addSource(ASSET_OVERVIEW_SOURCE_ID, {
                type: "vector",
                tiles: [getVectorTileUrl(ASSET_OVERVIEW_SOURCE_LAYER)],
                minzoom: 0,
                maxzoom: 22,
                bounds: ASSET_OVERVIEW_BOUNDS,
                promoteId: "asset_id"
            });
        }

        if (!map.getLayer(ASSET_OVERVIEW_LAYER_ID)) {
            const opacity = [
                "interpolate", ["linear"], ["zoom"],
                style.fadeStartZoom, 1,
                style.maxZoom, 0
            ];
            const layer = {
                id: ASSET_OVERVIEW_LAYER_ID,
                type: "symbol",
                source: ASSET_OVERVIEW_SOURCE_ID,
                "source-layer": ASSET_OVERVIEW_SOURCE_LAYER,
                minzoom: style.minZoom,
                maxzoom: style.maxZoom,
                layout: {
                    "symbol-sort-key": ["match", ["get", "symbol_category"],
                        ...Object.entries(style.collisionPriority).flat(), 3],
                    "icon-image": ["match", ["get", "symbol_category"],
                        ...Object.entries(style.categories).flat(), ""],
                    "icon-size": style.iconSize,
                    "icon-allow-overlap": false,
                    "icon-optional": false,
                    "text-field": getAssetOverviewTextExpression(),
                    "text-font": ["Noto Sans Bold"],
                    "text-size": style.textSize,
                    "text-anchor": "center",
                    "text-allow-overlap": false,
                    "text-optional": false
                },
                paint: {
                    "icon-opacity": opacity,
                    "text-opacity": opacity,
                    "text-color": style.textColor
                }
            };
            const beforeId = ["alignment-km-50km", "dsm-points", "tunnel-faces-halo"]
                .find((id) => map.getLayer(id));
            map.addLayer(layer, beforeId);
        }

        applyAssetOverviewSelection();
        bindAssetOverviewInteractions();
    } catch (error) {
        console.error("Asset overview katmanı yüklenemedi:", error);
    }
}

function applyAssetOverviewSelection() {
    if (!map.getLayer(ASSET_OVERVIEW_LAYER_ID)) return;

    const categoryFilters = Object.entries(ASSET_OVERVIEW_GROUP_CATEGORIES).map(
        ([groupId, category]) => {
            const filters = [["==", ["get", "symbol_category"], category]];
            const ids = selectedOverviewAssetIds.get(groupId);
            if (Array.isArray(ids)) {
                filters.push(["in", ["get", "asset_id"], ["literal", ids]]);
            }
            return ["all", ...filters];
        }
    );
    map.setFilter(ASSET_OVERVIEW_LAYER_ID, ["any", ...categoryFilters]);
}

function isAssetOverviewSymbolAtPoint(point) {
    return Boolean(map.getLayer(ASSET_OVERVIEW_LAYER_ID) &&
        map.queryRenderedFeatures(point, { layers: [ASSET_OVERVIEW_LAYER_ID] }).length);
}

function bindAssetOverviewInteractions() {
    if (overviewInteractionsBound) return;
    overviewInteractionsBound = true;

    map.on("mouseenter", ASSET_OVERVIEW_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", ASSET_OVERVIEW_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
    });
    map.on("click", ASSET_OVERVIEW_LAYER_ID, (event) => {
        if ((typeof isTunnelFaceMarkerAtPoint === "function" && isTunnelFaceMarkerAtPoint(event.point)) ||
            (typeof isDsmPointAtPoint === "function" && isDsmPointAtPoint(event.point))) return;

        const assetId = Number(event.features?.[0]?.properties?.asset_id);
        const asset = Number.isFinite(assetId) ? assetsById.get(assetId) : null;
        if (asset) focusAssetAndOpenPopup(asset);
    });
}
