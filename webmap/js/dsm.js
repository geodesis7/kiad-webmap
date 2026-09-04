"use strict";

const DSM_SOURCE_ID = "dsm-source";
const DSM_SOURCE_LAYER = "public.web_dsm_columns";
const DSM_POINT_LAYER_ID = "dsm-points";
const DSM_LABEL_LAYER_ID = "dsm-labels";
const DSM_LAYER_IDS = [DSM_POINT_LAYER_ID, DSM_LABEL_LAYER_ID];
let dsmVisible = true;
let selectedDsmSectionCodes = null;

map.on("load", () => {
    addDsmLayers(map);
    setupDsmInteractions(map);
});

function addDsmLayers(mapInstance) {
    if (mapInstance.getSource(DSM_SOURCE_ID)) {
        return;
    }

    const style = ASSET_STYLES.dsm;

    mapInstance.addSource(DSM_SOURCE_ID, {
        type: "vector",
        tiles: [
            getVectorTileUrl("public.web_dsm_columns")
        ],
        minzoom: 0,
        maxzoom: 22,
        bounds: [
            44.26924277481454,
            39.96014537320165,
            44.28619992534147,
            39.965532432267274
        ],
        promoteId: "column_id"
    });

    mapInstance.addLayer({
        id: DSM_POINT_LAYER_ID,
        type: "circle",
        source: DSM_SOURCE_ID,
        "source-layer": DSM_SOURCE_LAYER,
        minzoom: style.minZoom,
        layout: {
            visibility: dsmVisible ? "visible" : "none"
        },
        paint: {
            "circle-radius": style.point.radius,
            "circle-color": style.color,
            "circle-opacity": style.point.opacity,
            "circle-stroke-color": style.point.strokeColor,
            "circle-stroke-width": style.point.strokeWidth
        }
    });

    const labelBeforeLayerId = mapInstance.getLayer("stations-labels")
        ? "stations-labels"
        : undefined;

    mapInstance.addLayer({
        id: DSM_LABEL_LAYER_ID,
        type: "symbol",
        source: DSM_SOURCE_ID,
        "source-layer": DSM_SOURCE_LAYER,
        minzoom: style.label.minZoom,
        layout: {
            visibility: dsmVisible ? "visible" : "none",
            "text-field": ["get", style.label.field],
            "text-size": style.label.size,
            "text-offset": style.label.offset,
            "text-anchor": style.label.anchor,
            "text-allow-overlap": style.label.allowOverlap
        },
        paint: {
            "text-color": style.label.color,
            "text-halo-color": style.label.haloColor,
            "text-halo-width": style.label.haloWidth
        }
    }, labelBeforeLayerId);
}

function setDsmVisibility(mapInstance, isVisible) {
    dsmVisible = Boolean(isVisible);
    applyDsmVisibilityAndFilter(mapInstance);
}

function setDsmSectionSelection(mapInstance, sectionCodes) {
    selectedDsmSectionCodes = Array.isArray(sectionCodes)
        ? sectionCodes.map(String)
        : null;

    applyDsmVisibilityAndFilter(mapInstance);
}

function applyDsmVisibilityAndFilter(mapInstance) {
    const hasSelection =
        selectedDsmSectionCodes === null ||
        selectedDsmSectionCodes.length > 0;
    const visibility = dsmVisible && hasSelection
        ? "visible"
        : "none";
    const filter = selectedDsmSectionCodes === null
        ? null
        : [
            "in",
            ["get", "section_code"],
            ["literal", selectedDsmSectionCodes]
        ];

    DSM_LAYER_IDS.forEach((layerId) => {
        if (mapInstance.getLayer(layerId)) {
            mapInstance.setLayoutProperty(layerId, "visibility", visibility);
            mapInstance.setFilter(layerId, filter);
        }
    });
}

function focusDsmSection(mapInstance, bbox) {
    const normalizedBbox = Array.isArray(bbox)
        ? bbox.map(Number)
        : null;

    if (
        normalizedBbox?.length !== 4 ||
        !normalizedBbox.every(Number.isFinite)
    ) {
        return false;
    }

    mapInstance.fitBounds(
        [
            [normalizedBbox[0], normalizedBbox[1]],
            [normalizedBbox[2], normalizedBbox[3]]
        ],
        {
            padding: {
                top: 70,
                right: 80,
                bottom: 70,
                left: 80
            },
            duration: 700,
            maxZoom: 17
        }
    );

    return true;
}

function setupDsmInteractions(mapInstance) {
    mapInstance.on("mouseenter", DSM_POINT_LAYER_ID, () => {
        mapInstance.getCanvas().style.cursor = "pointer";
    });

    mapInstance.on("mouseleave", DSM_POINT_LAYER_ID, () => {
        mapInstance.getCanvas().style.cursor = "";
    });

    mapInstance.on("click", DSM_POINT_LAYER_ID, (event) => {
        if (
            typeof isTunnelFaceMarkerAtPoint === "function" &&
            isTunnelFaceMarkerAtPoint(event.point)
        ) {
            return;
        }

        const feature = event.features?.[0];

        if (!feature) {
            return;
        }

        openDsmPopup(mapInstance, feature.properties ?? {}, event.lngLat);
    });
}

function isDsmPointAtPoint(point) {
    if (!map.getLayer(DSM_POINT_LAYER_ID)) {
        return false;
    }

    return map.queryRenderedFeatures(point, {
        layers: [DSM_POINT_LAYER_ID]
    }).length > 0;
}
