"use strict";

const PROJECT_BOUNDS = [
    [43.213181901707514, 39.65029208702538],
    [44.80661416668261, 40.688585809429775]
];

const BASEMAP_LAYER_IDS = [
    "basemap-osm",
    "basemap-satellite",
    "basemap-light"
];

const map = new maplibregl.Map({
    container: "map",

    style: {
        version: 8,

        sources: {
            "basemap-osm-source": {
                type: "raster",
                tiles: [
                    "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                ],
                tileSize: 256,
                attribution: "&copy; OpenStreetMap contributors"
            },

            "basemap-satellite-source": {
                type: "raster",
                tiles: [
                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                ],
                tileSize: 256,
                attribution:
                    "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics and contributors"
            },

            "basemap-light-source": {
                type: "raster",
                tiles: [
                    "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
                    "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
                    "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
                ],
                tileSize: 256,
                attribution:
                    "&copy; OpenStreetMap contributors &copy; CARTO"
            }
        },

        layers: [
            {
                id: "basemap-osm",
                type: "raster",
                source: "basemap-osm-source",
                layout: {
                    visibility: "visible"
                }
            },

            {
                id: "basemap-satellite",
                type: "raster",
                source: "basemap-satellite-source",
                layout: {
                    visibility: "none"
                }
            },

            {
                id: "basemap-light",
                type: "raster",
                source: "basemap-light-source",
                layout: {
                    visibility: "none"
                }
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

function focusProject(options = {}) {
    map.fitBounds(PROJECT_BOUNDS, {
        padding: getProjectPadding(),
        duration: 900,
        ...options
    });
}

function getProjectPadding() {
    const isMobile =
        window.matchMedia("(max-width: 760px)").matches;

    return isMobile
        ? { top: 70, right: 30, bottom: 60, left: 30 }
        : { top: 50, right: 50, bottom: 60, left: 50 };
}

function setBasemap(basemapName) {
    const targetLayerId = `basemap-${basemapName}`;

    BASEMAP_LAYER_IDS.forEach((layerId) => {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(
                layerId,
                "visibility",
                layerId === targetLayerId ? "visible" : "none"
            );
        }
    });
}

const focusProjectButton = document.getElementById("focus-project");
const basemapToggle = document.getElementById("basemap-toggle");
const basemapMenu = document.getElementById("basemap-menu");
const basemapOptions = document.querySelectorAll(".basemap-option");

function setBasemapMenuState(isOpen) {
    if (!basemapMenu || !basemapToggle) {
        return;
    }

    basemapMenu.hidden = !isOpen;
    basemapToggle.setAttribute("aria-expanded", String(isOpen));
}

focusProjectButton?.addEventListener("click", focusProject);

basemapToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    setBasemapMenuState(basemapMenu.hidden);
});

basemapMenu?.addEventListener("click", (event) => {
    event.stopPropagation();
});

basemapOptions.forEach((option) => {
    option.addEventListener("click", () => {
        const basemapName = option.dataset.basemap;

        if (!basemapName) {
            return;
        }

        setBasemap(basemapName);

        basemapOptions.forEach((item) => {
            item.classList.toggle("is-active", item === option);
        });

        setBasemapMenuState(false);
    });
});

document.addEventListener("click", () => {
    setBasemapMenuState(false);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        setBasemapMenuState(false);
    }
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

    const assetLayerToggles =
        document.querySelectorAll(
            ".asset-layer-toggle"
        );

    assetLayerToggles.forEach((toggle) => {
        toggle.addEventListener("change", () => {
            const groupId =
                toggle.dataset.layerGroup;

            if (!groupId) {
                return;
            }

            setAssetLayerVisibility(
                map,
                groupId,
                toggle.checked
            );
        });
    });

    addAssetLayers(map);

    /*
     * Haritayı assets tablosunun kapsadığı alana yaklaştırır.
     */
    focusProject({
        duration: 1000
    });

    /*
     * Tıklanabilir katmanlar.
     * Bu bölüm load bloğu içinde olmalı; çünkü katmanların
     * önce map.addLayer ile oluşturulması gerekiyor.
     */
    const interactiveLayers = getInteractiveAssetLayerIds();

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



    map.on("error", (event) => {
        console.error("MapLibre error:", event.error);
    });

    window.addEventListener("kiad:layout-changed", () => {
        map.resize();
    });
    // Close the initial map "load" event handler
});
