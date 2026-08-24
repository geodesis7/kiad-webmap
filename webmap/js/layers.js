"use strict";

const ASSET_SOURCE_ID = "assets-source";
const ASSET_SOURCE_LAYER = "public.web_assets";

const ASSET_LAYER_GROUPS = [


    {
        id: "alignment",
        label: "Hat Ekseni",
        typeId: 1
    },

    {
        id: "tunnels",
        label: "Tüneller",
        typeId: 3
    },
    {
        id: "cut-cover-tunnels",
        label: "Aç-Kapa Tüneller",
        typeId: 4
    },
    {
        id: "viaducts",
        label: "Viyadükler",
        typeId: 5
    },
    {
        id: "bridges",
        label: "Köprüler",
        typeId: 6
    },
    {
        id: "culverts",
        label: "Menfezler",
        typeId: 7
    },
    {
        id: "underpasses",
        label: "Alt Geçitler",
        typeId: 8
    },
    {
        id: "overpasses",
        label: "Üst Geçitler",
        typeId: 9
    },

    {
        id: "stations",
        label: "İstasyonlar",
        typeId: 2
    }
];

function getAssetStyle(groupId) {
    const style = ASSET_STYLES[groupId];

    if (!style) {
        console.warn(
            "Katman stili bulunamadı:",
            groupId
        );

        return ASSET_STYLES.default;
    }

    return style;
}

function addAssetLayers(map) {
    ASSET_LAYER_GROUPS.forEach((group) => {
        addAssetPolygonLayer(map, group);
        addAssetLineLayer(map, group);
        addAssetPointLayer(map, group);
        addAssetLabelLayer(map, group);
    });
}

function addAssetPolygonLayer(map, group) {
    const style = getAssetStyle(group.id);

    map.addLayer({
        id: `${group.id}-polygons`,
        type: "fill",

        source: ASSET_SOURCE_ID,
        "source-layer": ASSET_SOURCE_LAYER,

        filter: buildAssetFilter(
            group,
            "Polygon"
        ),

        layout: {
            visibility: "visible"
        },

        paint: {
            "fill-color": style.color,

            "fill-opacity":
                style.fill?.opacity ?? 0.35,

            "fill-outline-color":
                style.fill?.outlineColor ??
                style.color
        }
    });
}

function addAssetLineLayer(map, group) {
    const style = getAssetStyle(group.id);

    map.addLayer({
        id: `${group.id}-lines`,
        type: "line",

        source: ASSET_SOURCE_ID,
        "source-layer": ASSET_SOURCE_LAYER,

        filter: buildAssetFilter(
            group,
            style.line?.geometryType ?? "LineString"
        ),

        layout: {
            visibility: "visible",

            "line-cap":
                style.line?.cap ?? "round",

            "line-join":
                style.line?.join ?? "round"
        },

        paint: {
            "line-color": style.color,

            "line-width":
                style.line?.width ?? 3,

            "line-opacity":
                style.line?.opacity ?? 1
        }
    });
}

function addAssetPointLayer(map, group) {
    const style = getAssetStyle(group.id);

    map.addLayer({
        id: `${group.id}-points`,
        type: "circle",

        source: ASSET_SOURCE_ID,
        "source-layer": ASSET_SOURCE_LAYER,

        filter: buildAssetFilter(
            group,
            "Point"
        ),

        layout: {
            visibility: "visible"
        },

        paint: {
            "circle-radius":
                style.point?.radius ?? 6,

            "circle-color":
                style.point?.color ??
                style.color,

            "circle-opacity":
                style.point?.opacity ?? 1,

            "circle-stroke-color":
                style.point?.strokeColor ??
                "#ffffff",

            "circle-stroke-width":
                style.point?.strokeWidth ?? 2
        }
    });


}

function addAssetLabelLayer(map, group) {
    const style = getAssetStyle(group.id);
    const label = style.label;

    if (!label) {
        return;
    }

    map.addLayer({
        id: `${group.id}-labels`,
        type: "symbol",

        source: ASSET_SOURCE_ID,
        "source-layer": ASSET_SOURCE_LAYER,

        filter: buildAssetFilter(
            group,
            label.geometryType ?? "Polygon"
        ),

        minzoom:
            label.minZoom ?? 0,

        layout: {
            visibility: "visible",

            "text-field": [
                "get",
                label.field ?? "name"
            ],

            "text-size":
                label.size ?? 14,

            "text-offset":
                label.offset ?? [0, 0],

            "text-anchor":
                label.anchor ?? "center",

            "text-allow-overlap":
                label.allowOverlap ?? false,

            "text-ignore-placement":
                label.ignorePlacement ?? false
        },

        paint: {
            "text-color":
                label.color ?? style.color,

            "text-opacity":
                label.opacity ?? 1,

            "text-halo-color":
                label.haloColor ?? "#ffffff",

            "text-halo-width":
                label.haloWidth ?? 1
        }
    });
}


function getAssetLayerIds(groupId) {
    return [
        `${groupId}-polygons`,
        `${groupId}-lines`,
        `${groupId}-points`,
        `${groupId}-labels`
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

function getAssetGroup(groupId) {
    return ASSET_LAYER_GROUPS.find(
        (group) => group.id === groupId
    );
}


function buildAssetFilter(
    group,
    geometryType,
    selectedAssetIds = null
) {
    const filters = [
        ["==", ["geometry-type"], geometryType],
        ["==", ["get", "type_id"], group.typeId]
    ];

    /*
     * selectedAssetIds null ise:
     * grubun bütün assetleri gösterilir.
     *
     * Bir array verilmişse:
     * yalnızca seçili asset_id değerleri gösterilir.
     */
    if (Array.isArray(selectedAssetIds)) {
        filters.push([
            "in",
            ["get", "asset_id"],
            ["literal", selectedAssetIds]
        ]);
    }

    return [
        "all",
        ...filters
    ];
}


function setAssetGroupSelection(
    map,
    groupId,
    selectedAssetIds
) {
    const group = getAssetGroup(groupId);

    if (!group) {
        console.warn(
            "Katman grubu bulunamadı:",
            groupId
        );

        return;
    }

    const style = getAssetStyle(group.id);

    const layerDefinitions = [
        {
            layerId: `${group.id}-polygons`,
            geometryType: "Polygon"
        },
        {
            layerId: `${group.id}-lines`,
            geometryType:
                style.line?.geometryType ?? "LineString"
        },
        {
            layerId: `${group.id}-points`,
            geometryType: "Point"
        }
    ];

    if (style.label) {
        layerDefinitions.push({
            layerId: `${group.id}-labels`,
            geometryType:
                style.label.geometryType ?? "Point"
        });
    }

    /*
     * Hiç asset seçili değilse katmanları gizlemek,
     * boş bir filter expression oluşturmaktan daha temiz.
     */
    const hasSelection =
        selectedAssetIds.length > 0;

    layerDefinitions.forEach(
        ({ layerId, geometryType }) => {

            if (!map.getLayer(layerId)) {
                return;
            }

            map.setLayoutProperty(
                layerId,
                "visibility",
                hasSelection
                    ? "visible"
                    : "none"
            );

            if (!hasSelection) {
                return;
            }

            map.setFilter(
                layerId,
                buildAssetFilter(
                    group,
                    geometryType,
                    selectedAssetIds
                )
            );
        }
    );
}
