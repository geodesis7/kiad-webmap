"use strict";

const map = new maplibregl.Map({
    container: "map",

    style: {
        version: 8,

        sources: {
            basemap: {
                type: "raster",
                tiles: [
                    "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                ],
                tileSize: 256,
                attribution:
                    "&copy; OpenStreetMap contributors"
            }
        },

        layers: [
            {
                id: "basemap",
                type: "raster",
                source: "basemap"
            }
        ]
    },

    center: [43.5, 40.0],
    zoom: 7.5
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

map.on("load", () => {

    // pg_tileserv Vector Tile kaynağı
    map.addSource("assets-source", {
        type: "vector",
        url: "https://kiad.tr/tiles/public.assets.json"
    });

    /*
     * Assets tablosunda farklı geometri tipleri bulunabileceği
     * için ilk aşamada çizgi, poligon ve nokta katmanlarını
     * ayrı ayrı tanımlıyoruz.
     */

    map.addLayer({
        id: "assets-polygons",
        type: "fill",
        source: "assets-source",
        "source-layer": "public.assets",

        filter: [
            "==",
            ["geometry-type"],
            "Polygon"
        ],

        paint: {
            "fill-color": "#d97706",
            "fill-opacity": 0.45,
            "fill-outline-color": "#92400e"
        }
    });

    map.addLayer({
        id: "assets-lines",
        type: "line",
        source: "assets-source",
        "source-layer": "public.assets",

        filter: [
            "==",
            ["geometry-type"],
            "LineString"
        ],

        paint: {
            "line-color": "#c1121f",
            "line-width": 4
        }
    });

    map.addLayer({
        id: "assets-points",
        type: "circle",
        source: "assets-source",
        "source-layer": "public.assets",

        filter: [
            "==",
            ["geometry-type"],
            "Point"
        ],

        paint: {
            "circle-radius": 6,
            "circle-color": "#2563eb",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2
        }
    });

});

    const interactiveLayers = [
        "assets-polygons",
        "assets-lines",
        "assets-points"
    ];

    interactiveLayers.forEach((layerId) => {

        map.on("mouseenter", layerId, () => {
            map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
        });

        map.on("click", layerId, (event) => {

            const feature = event.features?.[0];

            if (!feature) {
                return;
            }

            const properties = feature.properties ?? {};

            const popupHtml = createPopupHtml(properties);

            new maplibregl.Popup({
                closeButton: true,
                closeOnClick: true
            })
                .setLngLat(event.lngLat)
                .setHTML(popupHtml)
                .addTo(map);
        });
    });
});

const assetsToggle = document.getElementById("assets-toggle");

assetsToggle.addEventListener("change", (event) => {

    const visibility = event.target.checked
        ? "visible"
        : "none";

    [
        "assets-polygons",
        "assets-lines",
        "assets-points"
    ].forEach((layerId) => {

        if (map.getLayer(layerId)) {
            map.setLayoutProperty(
                layerId,
                "visibility",
                visibility
            );
        }
    });
});

function createPopupHtml(properties) {

    const assetName =
        properties.asset_name ??
        properties.name ??
        properties.asset_id ??
        "Proje Varlığı";

    const rows = Object.entries(properties)
        .filter(([, value]) => {
            return value !== null &&
                   value !== undefined &&
                   value !== "";
        })
        .slice(0, 10)
        .map(([key, value]) => {

            return `
                <div class="popup-row">
                    <span class="popup-label">
                        ${escapeHtml(key)}
                    </span>

                    <span>
                        ${escapeHtml(String(value))}
                    </span>
                </div>
            `;
        })
        .join("");

    return `
        <div>
            <h3 class="popup-title">
                ${escapeHtml(String(assetName))}
            </h3>

            ${rows}
        </div>
    `;
}

function escapeHtml(value) {

    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

map.on("error", (event) => {
    console.error("MapLibre error:", event.error);
});
