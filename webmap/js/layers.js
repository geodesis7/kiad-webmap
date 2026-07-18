"use strict";

const ASSET_SOURCE_ID = "assets-source";
const ASSET_SOURCE_LAYER = "public.assets";

const ASSET_LAYER_GROUPS = [


    {
        id: "alignment",
        label: "Hat Ekseni",
        typeId: 1,
        color: "#ad1414c5"
    },

    {
        id: "tunnels",
        label: "Tüneller",
        typeId: 3,
        color: "#7c3aed"
    },
    {
        id: "cut-cover-tunnels",
        label: "Aç-Kapa Tüneller",
        typeId: 4,
        color: "#d97706"
    },
    {
        id: "viaducts",
        label: "Viyadükler",
        typeId: 5,
        color: "#dc2626"
    },
    {
        id: "bridges",
        label: "Köprüler",
        typeId: 6,
        color: "#2563eb"
    },
    {
        id: "culverts",
        label: "Menfezler",
        typeId: 7,
        color: "#0891b2"
    },
    {
        id: "underpasses",
        label: "Alt Geçitler",
        typeId: 8,
        color: "#059669"
    },
    {
        id: "overpasses",
        label: "Üst Geçitler",
        typeId: 9,
        color: "#be123c"
    }
];

function addAssetLayers(map) {
    ASSET_LAYER_GROUPS.forEach((group) => {
        addAssetPolygonLayer(map, group);
        addAssetLineLayer(map, group);
        addAssetPointLayer(map, group);
    });
}

function addAssetPolygonLayer(map, group) {
    map.addLayer({
        id: `${group.id}-polygons`,
        type: "fill",
        source: ASSET_SOURCE_ID,
        "source-layer": ASSET_SOURCE_LAYER,

        filter: [
            "all",
            ["==", ["geometry-type"], "Polygon"],
            ["==", ["get", "type_id"], group.typeId]
        ],

        layout: {
            visibility: "visible"
        },

        paint: {
            "fill-color": group.color,
            "fill-opacity": 0.42,
            "fill-outline-color": group.color
        }
    });
}

function addAssetLineLayer(map, group) {
    map.addLayer({
        id: `${group.id}-lines`,
        type: "line",
        source: ASSET_SOURCE_ID,
        "source-layer": ASSET_SOURCE_LAYER,

        filter: [
            "all",
            ["==", ["geometry-type"], "LineString"],
            ["==", ["get", "type_id"], group.typeId]
        ],

        layout: {
            visibility: "visible",
            "line-cap": "round",
            "line-join": "round"
        },

        paint: {
            "line-color": group.color,
            "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 2,
                12, 5,
                16, 8
            ]
        }
    });
}

function addAssetPointLayer(map, group) {
    map.addLayer({
        id: `${group.id}-points`,
        type: "circle",
        source: ASSET_SOURCE_ID,
        "source-layer": ASSET_SOURCE_LAYER,

        filter: [
            "all",
            ["==", ["geometry-type"], "Point"],
            ["==", ["get", "type_id"], group.typeId]
        ],

        layout: {
            visibility: "visible"
        },

        paint: {
            "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 4,
                12, 7,
                16, 10
            ],
            "circle-color": group.color,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2
        }
    });
}

function getAssetLayerIds(groupId) {
    return [
        `${groupId}-polygons`,
        `${groupId}-lines`,
        `${groupId}-points`
    ];
}

function setAssetLayerVisibility(map, groupId, isVisible) {
    const visibility = isVisible ? "visible" : "none";

    getAssetLayerIds(groupId).forEach((layerId) => {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(
                layerId,
                "visibility",
                visibility
            );
        }
    });
}

function getInteractiveAssetLayerIds() {
    return ASSET_LAYER_GROUPS.flatMap((group) => {
        return getAssetLayerIds(group.id);
    });
}