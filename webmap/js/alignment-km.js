"use strict";

const ALIGNMENT_KM_SOURCE_ID = "alignment-km-source";
const ALIGNMENT_KM_SOURCE_LAYER = "public.vw_alignment_km_points_4326";
// DB kilometraj verileri düzeltilene kadar harita gösterimi askıya alındı.
const ALIGNMENT_KM_ENABLED = false;
const ALIGNMENT_KM_LAYER_DEFINITIONS = [
    { id: "alignment-km-50km", minZoom: 8, maxZoom: 10, interval: 50000 },
    { id: "alignment-km-20km", minZoom: 10, maxZoom: 11, interval: 20000 },
    { id: "alignment-km-10km", minZoom: 11, maxZoom: 12, interval: 10000 },
    { id: "alignment-km-5km", minZoom: 12, maxZoom: 13, interval: 5000 },
    { id: "alignment-km-1km", minZoom: 13, maxZoom: 14, interval: 1000 },
    { id: "alignment-km-500m", minZoom: 14, maxZoom: 15, interval: 500 },
    { id: "alignment-km-100m", minZoom: 15, maxZoom: null, interval: 100 }
];

let selectedAlignmentAssetIds = null;

map.on("load", () => {
    if (!ALIGNMENT_KM_ENABLED) {
        return;
    }

    addAlignmentKmLayers();
    applyAlignmentKmSelection();
});

window.addEventListener("kiad:asset-group-selection-changed", (event) => {
    if (event.detail?.groupId !== "alignment") {
        return;
    }

    selectedAlignmentAssetIds = Array.isArray(event.detail.selectedAssetIds)
        ? event.detail.selectedAssetIds.map(Number).filter(Number.isFinite)
        : null;

    applyAlignmentKmSelection();
});

function addAlignmentKmLayers() {
    if (map.getSource(ALIGNMENT_KM_SOURCE_ID)) {
        return;
    }

    const style = ASSET_STYLES.alignmentKmLabels;
    const beforeLayerId = map.getLayer("stations-labels")
        ? "stations-labels"
        : undefined;

    map.addSource(ALIGNMENT_KM_SOURCE_ID, {
        type: "vector",
        tiles: [
            "https://kiad.tr/tiles/public.vw_alignment_km_points_4326/{z}/{x}/{y}.pbf"
        ],
        minzoom: 0,
        maxzoom: 22,
        bounds: [
            43.21334167147683,
            39.663487512844114,
            44.80647320636014,
            40.67516771917663
        ],
        promoteId: "point_id"
    });

    ALIGNMENT_KM_LAYER_DEFINITIONS.forEach((definition) => {
        const layer = {
            id: definition.id,
            type: "symbol",
            source: ALIGNMENT_KM_SOURCE_ID,
            "source-layer": ALIGNMENT_KM_SOURCE_LAYER,
            minzoom: definition.minZoom,
            filter: buildAlignmentKmFilter(definition.interval),
            layout: {
                visibility: "visible",
                "text-field": [
                    "concat",
                    "KM ",
                    ["to-string", ["get", "chainage_label"]]
                ],
                "text-size": style.size,
                "text-offset": style.offset,
                "text-anchor": style.anchor,
                "text-allow-overlap": false,
                "text-ignore-placement": false
            },
            paint: {
                "text-color": style.color,
                "text-opacity": style.opacity,
                "text-halo-color": style.haloColor,
                "text-halo-width": style.haloWidth
            }
        };

        if (definition.maxZoom !== null) {
            layer.maxzoom = definition.maxZoom;
        }

        map.addLayer(layer, beforeLayerId);
    });
}

function buildAlignmentKmFilter(interval, assetIds = null) {
    const filters = [
        [
            "==",
            ["%", ["to-number", ["get", "chainage_m"]], interval],
            0
        ]
    ];

    if (Array.isArray(assetIds)) {
        filters.push([
            "in",
            ["get", "route_asset_id"],
            ["literal", assetIds]
        ]);
    }

    return ["all", ...filters];
}

function applyAlignmentKmSelection() {
    if (!map.getSource(ALIGNMENT_KM_SOURCE_ID)) {
        return;
    }

    const hasExplicitSelection = Array.isArray(selectedAlignmentAssetIds);
    const isVisible = !hasExplicitSelection || selectedAlignmentAssetIds.length > 0;

    ALIGNMENT_KM_LAYER_DEFINITIONS.forEach((definition) => {
        if (!map.getLayer(definition.id)) {
            return;
        }

        map.setLayoutProperty(
            definition.id,
            "visibility",
            isVisible ? "visible" : "none"
        );

        if (isVisible) {
            map.setFilter(
                definition.id,
                buildAlignmentKmFilter(
                    definition.interval,
                    hasExplicitSelection ? selectedAlignmentAssetIds : null
                )
            );
        }
    });
}
