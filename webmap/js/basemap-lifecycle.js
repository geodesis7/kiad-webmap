"use strict";

let activeKiadBasemapId = "satellite";
let basemapSwitchGeneration = 0;
let activeBasemapKind = "raster";
let openFreeMapMissingImageHandlerBound = false;

function createOpenFreeMapCircleFallback() {
    const size = 11;
    const data = new Uint8Array(size * size * 4);
    const center = (size - 1) / 2;
    const radius = 4.2;

    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const distance = Math.hypot(x - center, y - center);
            if (distance > radius) continue;
            const index = (y * size + x) * 4;
            const edge = distance > radius - 1;
            data[index] = edge ? 255 : 103;
            data[index + 1] = edge ? 255 : 124;
            data[index + 2] = edge ? 255 : 143;
            data[index + 3] = 220;
        }
    }

    return { width: size, height: size, data };
}

function bindOpenFreeMapMissingImageFallback() {
    if (openFreeMapMissingImageHandlerBound) return;
    openFreeMapMissingImageHandlerBound = true;
    map.on("styleimagemissing", (event) => {
        if (event.id !== "circle-11" || map.hasImage(event.id)) return;
        map.addImage(event.id, createOpenFreeMapCircleFallback());
    });
}

function snapshotOperationalState() {
    const assetGroups = [...document.querySelectorAll("[data-group-id]")]
        .filter(group => group.dataset.groupId !== "dsm")
        .map(group => ({
            groupId: group.dataset.groupId,
            assetIds: [...group.querySelectorAll(".layer-asset-toggle:checked")].map(input => Number(input.value))
        }));
    const dsmGroup = document.querySelector('[data-group-id="dsm"]');
    return {
        assetGroups,
        dsmVisible: Boolean(dsmGroup?.querySelector(".dsm-layer-toggle")?.checked),
        dsmSections: [...(dsmGroup?.querySelectorAll(".dsm-section-toggle:checked") ?? [])].map(input => input.value),
        selectedTunnelFaceId: typeof selectedTunnelFaceId === "number" ? selectedTunnelFaceId : null
    };
}

function restoreOperationalState(snapshot) {
    snapshot.assetGroups.forEach(({ groupId, assetIds }) => {
        if (typeof setAssetGroupSelection === "function") {
            setAssetGroupSelection(map, groupId, assetIds);
        }
        window.dispatchEvent(new CustomEvent("kiad:asset-group-selection-changed", {
            detail: { groupId, selectedAssetIds: assetIds }
        }));
    });
    if (typeof setDsmVisibility === "function") setDsmVisibility(map, snapshot.dsmVisible);
    if (typeof setDsmSectionSelection === "function") setDsmSectionSelection(map, snapshot.dsmSections);
    if (Number.isFinite(snapshot.selectedTunnelFaceId) && typeof setSelectedTunnelFace === "function") {
        setSelectedTunnelFace(snapshot.selectedTunnelFaceId);
    }
}

function rebuildOperationalLayers() {
    rebuildBaseAssetLayers();
    addDsmLayers(map);
    setupDsmInteractions(map);
    if (typeof addAlignmentKmLayers === "function") {
        addAlignmentKmLayers();
        applyAlignmentKmSelection();
    }
    addTunnelFaceLayers();
    bindTunnelFaceMapEvents();
    applyTunnelFaceAssetSelection();
}

function switchKiadBasemap(basemapId) {
    const definition = window.KIAD_BASEMAPS?.[basemapId];
    if (!definition) return false;
    if (definition.type === "raster" && activeBasemapKind === "raster") {
        BASEMAP_LAYER_IDS.forEach(layerId => map.setLayoutProperty(layerId, "visibility", layerId === `basemap-${basemapId}` ? "visible" : "none"));
        activeKiadBasemapId = basemapId;
        return true;
    }

    const snapshot = snapshotOperationalState();
    const viewport = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
    const generation = ++basemapSwitchGeneration;
    const nextStyle = definition.type === "vector-style" ? definition.styleUrl : createKiadRasterBaseStyle();

    map.once("style.load", () => {
        if (generation !== basemapSwitchGeneration) return;
        rebuildOperationalLayers();
        restoreOperationalState(snapshot);
        map.jumpTo(viewport);
        activeKiadBasemapId = basemapId;
        activeBasemapKind = definition.type;

        if (definition.type === "vector-style") {
            map.once("render", () => {
                if (generation !== basemapSwitchGeneration) return;
                refreshTunnelFaceLayers();
            });
        }
    });
    map.setStyle(nextStyle, { diff: false });
    return true;
}

window.switchKiadBasemap = switchKiadBasemap;
bindOpenFreeMapMissingImageFallback();

window.addEventListener("kiad:operational-layers-ready", () => {
    if (window.KIAD_INITIAL_MAP_IDLE) {
        rebuildOperationalLayers();
        return;
    }

    window.addEventListener("kiad:initial-map-idle", rebuildOperationalLayers, {
        once: true
    });
}, { once: true });
