"use strict";

const TUNNEL_LINING_SOURCE_ID = "tunnel-lining-source";
const TUNNEL_LINING_SOURCE_LAYER = "public.web_tunnel_lining_spatial_v1";
const TUNNEL_LINING_LAYER_IDS = Object.freeze({
    INVERT: ["tunnel-lining-invert-fill", "tunnel-lining-invert-outline"],
    ARCH: ["tunnel-lining-arch-outline"]
});
const tunnelLiningStageVisible = { INVERT: true, ARCH: true };
let selectedTunnelLiningAssetIds = null;
let tunnelLiningMapEventsBound = false;

window.KIAD_MAP_LOAD_HANDLERS.push(() => {
    addTunnelLiningLayers();
    bindTunnelLiningMapEvents();
});

window.addEventListener("kiad:asset-group-selection-changed", (event) => {
    if (event.detail?.groupId !== "tunnels") return;
    selectedTunnelLiningAssetIds = Array.isArray(event.detail.selectedAssetIds)
        ? event.detail.selectedAssetIds.map(Number).filter(Number.isFinite)
        : null;
    applyTunnelLiningSelection();
});

// A future import/refresh flow can dispatch this event without adding polling.
window.addEventListener("kiad:tunnel-lining-updated", () => refreshTunnelLiningLayers());

function addTunnelLiningLayers() {
    const style = ASSET_STYLES.tunnelLining;
    if (!map.getSource(TUNNEL_LINING_SOURCE_ID)) {
        map.addSource(TUNNEL_LINING_SOURCE_ID, {
            type: "vector",
            tiles: [getVectorTileUrl(TUNNEL_LINING_SOURCE_LAYER)],
            minzoom: style.minZoom,
            maxzoom: 22,
            promoteId: "feature_id",
            bounds: [43.213181901707514, 39.65029208702538,
                44.80661416668261, 40.688585809429775]
        });
    }

    const beforeId = map.getLayer("tunnel-faces-halo")
        ? "tunnel-faces-halo" : undefined;
    const common = {
        source: TUNNEL_LINING_SOURCE_ID,
        "source-layer": TUNNEL_LINING_SOURCE_LAYER,
        minzoom: style.minZoom
    };
    const definitions = [
        {
            id: TUNNEL_LINING_LAYER_IDS.INVERT[0],
            type: "fill",
            filter: ["==", ["get", "lining_stage"], "INVERT"],
            paint: {
                "fill-color": style.invert.color,
                "fill-opacity": style.invert.opacity
            }
        },
        {
            id: TUNNEL_LINING_LAYER_IDS.INVERT[1],
            type: "line",
            filter: ["==", ["get", "lining_stage"], "INVERT"],
            paint: {
                "line-color": style.invert.outlineColor,
                "line-width": style.invert.outlineWidth,
                "line-opacity": style.invert.outlineOpacity
            }
        },
        {
            id: TUNNEL_LINING_LAYER_IDS.ARCH[0],
            type: "line",
            filter: ["==", ["get", "lining_stage"], "ARCH"],
            paint: {
                "line-color": style.arch.outlineColor,
                "line-width": style.arch.outlineWidth,
                "line-opacity": style.arch.outlineOpacity,
                "line-dasharray": style.arch.dasharray
            }
        }
    ];

    definitions.forEach((definition) => {
        if (!map.getLayer(definition.id)) {
            map.addLayer({ ...common, ...definition }, beforeId);
        }
    });
    applyTunnelLiningSelection();
}

function refreshTunnelLiningLayers() {
    if (!map.isStyleLoaded()) return;
    Object.values(TUNNEL_LINING_LAYER_IDS).flat().forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(TUNNEL_LINING_SOURCE_ID)) {
        map.removeSource(TUNNEL_LINING_SOURCE_ID);
    }
    addTunnelLiningLayers();
}

function setTunnelLiningStageVisibility(stage, visible) {
    if (!(stage in tunnelLiningStageVisible)) return;
    tunnelLiningStageVisible[stage] = Boolean(visible);
    applyTunnelLiningSelection();
}

function isTunnelLiningStageVisible(stage) {
    return tunnelLiningStageVisible[stage] === true;
}

function applyTunnelLiningSelection() {
    for (const [stage, layerIds] of Object.entries(TUNNEL_LINING_LAYER_IDS)) {
        const hasAssets = selectedTunnelLiningAssetIds === null ||
            selectedTunnelLiningAssetIds.length > 0;
        const visibility = tunnelLiningStageVisible[stage] && hasAssets
            ? "visible" : "none";
        const filter = selectedTunnelLiningAssetIds === null
            ? ["==", ["get", "lining_stage"], stage]
            : ["all", ["==", ["get", "lining_stage"], stage],
                ["in", ["get", "asset_id"], ["literal", selectedTunnelLiningAssetIds]]];
        layerIds.forEach((id) => {
            if (!map.getLayer(id)) return;
            map.setLayoutProperty(id, "visibility", visibility);
            if (hasAssets) map.setFilter(id, filter);
        });
    }
}

function getTunnelLiningFeatureAtPoint(point) {
    const layers = [TUNNEL_LINING_LAYER_IDS.ARCH[0], TUNNEL_LINING_LAYER_IDS.INVERT[0]]
        .filter((id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
    return layers.length
        ? map.queryRenderedFeatures(point, { layers })[0] ?? null
        : null;
}

function isTunnelLiningAtPoint(point) {
    return Boolean(getTunnelLiningFeatureAtPoint(point));
}

function bindTunnelLiningMapEvents() {
    if (tunnelLiningMapEventsBound) return;
    tunnelLiningMapEventsBound = true;
    [TUNNEL_LINING_LAYER_IDS.INVERT[0], TUNNEL_LINING_LAYER_IDS.ARCH[0]]
        .forEach((id) => {
            map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
            map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
        });
    map.on("click", (event) => {
        if (typeof isTunnelFaceMarkerAtPoint === "function" &&
            isTunnelFaceMarkerAtPoint(event.point)) return;
        if (typeof isDsmPointAtPoint === "function" && isDsmPointAtPoint(event.point)) return;
        if (typeof isAssetOverviewSymbolAtPoint === "function" &&
            isAssetOverviewSymbolAtPoint(event.point)) return;
        const feature = getTunnelLiningFeatureAtPoint(event.point);
        if (feature) openTunnelLiningPopup(feature.properties ?? {}, event.lngLat);
    });
}

function openTunnelLiningPopup(properties, lngLat) {
    const asset = assetsById.get(Number(properties.asset_id));
    const direction = properties.portal_direction === "GIRIS" ? "Giriş"
        : properties.portal_direction === "CIKIS" ? "Çıkış" : null;
    const stage = properties.lining_stage === "INVERT" ? "İnvert Kaplaması"
        : properties.lining_stage === "ARCH" ? "Kemer Kaplaması" : null;
    const start = formatLiningKilometer(properties.source_km_start);
    const end = formatLiningKilometer(properties.source_km_end);
    const rows = [
        createPopupRow("Tünel Adı", asset?.name),
        createPopupRow("Yön", direction),
        createPopupRow("Aşama", stage),
        createPopupRow("İmalat KM Aralığı", start && end ? `${start} → ${end}` : null),
        createPopupRow("İmalat Uzunluğu", formatMetricValue(properties.lined_length_m, "m")),
        createPopupRow("Ano Adedi", properties.ano_count),
        createPopupRow("Beton Miktarı", formatMetricValue(properties.concrete_volume_m3, "m³"))
    ].join("");
    const qualityNote = properties.spatial_quality === "APPROXIMATE_PORTAL_ANCHORED"
        ? "Yaklaşık konumlu imalat gösterimi"
        : "Konum doğruluğu belirtilmedi";
    activeAssetPopup?.remove();
    const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "360px",
        offset: 12
    }).setLngLat(lngLat).setHTML(`
        <article class="asset-popup">
            <header class="asset-popup-header"><div class="asset-popup-heading">
                <span class="asset-popup-eyebrow">Nihai Kaplama</span>
                <h3 class="popup-title">${escapeHtml(String(properties.asset_code ?? "Tünel").toUpperCase())}</h3>
            </div></header>
            <div class="asset-popup-body">${rows}
                <p class="popup-empty-message">${escapeHtml(qualityNote)}</p>
            </div>
        </article>`).addTo(map);
    activeAssetPopup = popup;
    popup.on("close", () => {
        if (activeAssetPopup === popup) activeAssetPopup = null;
    });
    window.requestAnimationFrame(() => ensurePopupVisible(map, popup));
}
