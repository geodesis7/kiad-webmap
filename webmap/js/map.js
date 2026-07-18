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
                attribution: "&copy; OpenStreetMap contributors"
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

    center: [44.009898, 40.169439],
    zoom: 8
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

map.on("load", () => {

    /*
     * pg_tileserv üzerinden yayınlanan public.assets
     * vektör tile kaynağı.
     */
    map.addSource("assets-source", {
        type: "vector",
        tiles: [
            "https://kiad.tr/tiles/public.assets/{z}/{x}/{y}.pbf"
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

    /*
     * Polygon ve MultiPolygon geometrileri.
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

    /*
     * LineString ve MultiLineString geometrileri.
     */
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

    /*
     * Point ve MultiPoint geometrileri.
     */
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

    /*
     * Haritayı assets tablosunun kapsadığı alana yaklaştırır.
     */
    map.fitBounds(
        [
            [43.213181901707514, 39.65029208702538],
            [44.80661416668261, 40.688585809429775]
        ],
        {
            padding: 40,
            duration: 1000
        }
    );

    /*
     * Tıklanabilir katmanlar.
     * Bu bölüm load bloğu içinde olmalı; çünkü katmanların
     * önce map.addLayer ile oluşturulması gerekiyor.
     */
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

if (assetsToggle) {
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
}



map.on("error", (event) => {
    console.error("MapLibre error:", event.error);
});

window.addEventListener("kiad:layout-changed", () => {
    map.resize();
});