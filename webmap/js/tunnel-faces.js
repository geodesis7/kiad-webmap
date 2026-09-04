"use strict";

const TUNNEL_FACE_SOURCE_ID = "tunnel-faces-source";
const TUNNEL_FACE_SOURCE_LAYER = "public.web_tunnel_face_points";
const TUNNEL_FACE_LAYER_IDS = [
    "tunnel-faces-halo",
    "tunnel-faces-points",
    "tunnel-faces-labels"
];

let selectedTunnelFaceId = null;
let visibleTunnelFaceAssetIds = null;

map.on("load", () => {
    addTunnelFaceLayers();
    bindTunnelFaceMapEvents();
    applyTunnelFaceAssetSelection();
});

window.addEventListener("kiad:asset-group-selection-changed", (event) => {
    if (event.detail?.groupId !== "tunnels") {
        return;
    }

    visibleTunnelFaceAssetIds = Array.isArray(event.detail.selectedAssetIds)
        ? event.detail.selectedAssetIds.map(Number).filter(Number.isFinite)
        : null;

    applyTunnelFaceAssetSelection();
});

function addTunnelFaceLayers() {
    if (map.getSource(TUNNEL_FACE_SOURCE_ID)) {
        return;
    }

    const style = ASSET_STYLES["tunnel-faces"];
    const selected = ["boolean", ["feature-state", "selected"], false];
    const active = ["boolean", ["get", "is_active"], false];

    map.addSource(TUNNEL_FACE_SOURCE_ID, {
        type: "vector",
        tiles: [
            getVectorTileUrl("public.web_tunnel_face_points")
        ],
        minzoom: 0,
        maxzoom: 22,
        bounds: [
            43.213181901707514,
            39.65029208702538,
            44.80661416668261,
            40.688585809429775
        ],
        promoteId: "face_id"
    });

    map.addLayer({
        id: "tunnel-faces-halo",
        type: "circle",
        source: TUNNEL_FACE_SOURCE_ID,
        "source-layer": TUNNEL_FACE_SOURCE_LAYER,
        minzoom: style.minZoom,
        paint: {
            "circle-radius": ["case", selected, style.selected.haloRadius, 0],
            "circle-color": style.selected.haloColor,
            "circle-opacity": ["case", selected, style.selected.haloOpacity, 0],
            "circle-blur": 0.25
        }
    });

    map.addLayer({
        id: "tunnel-faces-points",
        type: "circle",
        source: TUNNEL_FACE_SOURCE_ID,
        "source-layer": TUNNEL_FACE_SOURCE_LAYER,
        minzoom: style.minZoom,
        paint: {
            "circle-radius": [
                "case",
                selected, style.selected.radius,
                active, style.active.radius,
                style.closed.radius
            ],
            "circle-color": [
                "case",
                selected, style.selected.color,
                active, style.active.color,
                style.closed.color
            ],
            "circle-opacity": [
                "case",
                selected, 1,
                active, style.active.opacity,
                style.closed.opacity
            ],
            "circle-stroke-color": [
                "case",
                selected, style.selected.strokeColor,
                active, style.active.strokeColor,
                style.closed.strokeColor
            ],
            "circle-stroke-width": [
                "case",
                selected, style.selected.strokeWidth,
                active, style.active.strokeWidth,
                style.closed.strokeWidth
            ]
        }
    });

    map.addLayer({
        id: "tunnel-faces-labels",
        type: "symbol",
        source: TUNNEL_FACE_SOURCE_ID,
        "source-layer": TUNNEL_FACE_SOURCE_LAYER,
        minzoom: style.label.minZoom,
        layout: {
            "text-field": [
                "concat",
                ["upcase", ["to-string", ["get", "asset_code"]]],
                " ",
                ["to-string", ["get", style.label.field]]
            ],
            "text-size": style.label.size,
            "text-offset": style.label.offset,
            "text-anchor": "top",
            "text-allow-overlap": style.label.allowOverlap
        },
        paint: {
            "text-color": style.label.color,
            "text-halo-color": style.label.haloColor,
            "text-halo-width": style.label.haloWidth
        }
    });
}

function bindTunnelFaceMapEvents() {
    map.on("mouseenter", "tunnel-faces-points", () => {
        map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "tunnel-faces-points", () => {
        map.getCanvas().style.cursor = "";
    });

    map.on("click", "tunnel-faces-points", (event) => {
        const feature = event.features?.[0];
        const assetId = Number(feature?.properties?.asset_id);
        const faceId = Number(feature?.properties?.face_id);

        if (!Number.isFinite(assetId) || !Number.isFinite(faceId)) {
            return;
        }

        setSelectedTunnelFace(faceId);

        if (typeof openTunnelDetail === "function") {
            openTunnelDetail(assetId, {
                tab: "faces",
                faceId
            });
        }
    });
}

function isTunnelFaceMarkerAtPoint(point) {
    if (!map.getLayer("tunnel-faces-points")) {
        return false;
    }

    return map.queryRenderedFeatures(point, {
        layers: ["tunnel-faces-points"]
    }).length > 0;
}

function focusTunnelFace(face) {
    const faceId = Number(face?.face_id);
    const longitude = Number(face?.longitude);
    const latitude = Number(face?.latitude);

    if (
        !Number.isFinite(faceId) ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude)
    ) {
        return false;
    }

    setSelectedTunnelFace(faceId);
    map.flyTo({
        center: [longitude, latitude],
        zoom: Math.max(map.getZoom(), 16),
        duration: 650,
        essential: true
    });

    return true;
}

function setSelectedTunnelFace(faceId) {
    const normalizedFaceId = Number(faceId);

    if (!Number.isFinite(normalizedFaceId)) {
        clearSelectedTunnelFace();
        return;
    }

    if (selectedTunnelFaceId !== null && selectedTunnelFaceId !== normalizedFaceId) {
        removeTunnelFaceState(selectedTunnelFaceId);
    }

    selectedTunnelFaceId = normalizedFaceId;

    if (map.getSource(TUNNEL_FACE_SOURCE_ID)) {
        map.setFeatureState({
            source: TUNNEL_FACE_SOURCE_ID,
            sourceLayer: TUNNEL_FACE_SOURCE_LAYER,
            id: normalizedFaceId
        }, {
            selected: true
        });
    }
}

function clearSelectedTunnelFace() {
    if (selectedTunnelFaceId !== null) {
        removeTunnelFaceState(selectedTunnelFaceId);
    }

    selectedTunnelFaceId = null;
}

function removeTunnelFaceState(faceId) {
    if (!map.getSource(TUNNEL_FACE_SOURCE_ID)) {
        return;
    }

    map.removeFeatureState({
        source: TUNNEL_FACE_SOURCE_ID,
        sourceLayer: TUNNEL_FACE_SOURCE_LAYER,
        id: faceId
    }, "selected");
}

function applyTunnelFaceAssetSelection() {
    if (!map.getSource(TUNNEL_FACE_SOURCE_ID)) {
        return;
    }

    const hasExplicitSelection = Array.isArray(visibleTunnelFaceAssetIds);
    const isVisible = !hasExplicitSelection || visibleTunnelFaceAssetIds.length > 0;
    const filter = hasExplicitSelection
        ? [
            "in",
            ["get", "asset_id"],
            ["literal", visibleTunnelFaceAssetIds]
        ]
        : null;

    TUNNEL_FACE_LAYER_IDS.forEach((layerId) => {
        if (!map.getLayer(layerId)) {
            return;
        }

        map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
        map.setFilter(layerId, filter);
    });
}
