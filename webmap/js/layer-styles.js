"use strict";

const ASSET_STYLES = {

    default: {
        color: "#64748b",

        fill: {
            opacity: 0.35,
            outlineColor: "#475569"
        },

        line: {
            width: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 2,
                12, 4,
                16, 6
            ],
            opacity: 1,
            cap: "round",
            join: "round"
        },

        point: {
            radius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 4,
                12, 7,
                16, 10
            ],
            color: "#64748b",
            opacity: 1,
            strokeColor: "#ffffff",
            strokeWidth: 2
        }
    },


    alignment: {
        color: "#eb0927",

        fill: {
            opacity: 0.20
        },

        line: {
            width: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 2.5,
                12, 2.3,
                16, 2
            ],
            opacity: 1,
            cap: "round",
            join: "round"
        },

        point: {
            radius: 5,
            color: "#111827",
            opacity: 1,
            strokeColor: "#ffffff",
            strokeWidth: 2
        }
    },


    tunnels: {
        color: "#7c3aed",

        fill: {
            opacity: 0.42
        },

        line: {
            width: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 2,
                12, 5,
                16, 8
            ],
            opacity: 1,
            cap: "round",
            join: "round"
        },

        point: {
            radius: 6,
            color: "#7c3aed",
            opacity: 1,
            strokeColor: "#ffffff",
            strokeWidth: 2
        }
    },


    "cut-cover-tunnels": {
        color: "#d97706",

        fill: {
            opacity: 0.42
        },

        line: {
            width: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 2,
                12, 5,
                16, 8
            ],
            opacity: 1,
            cap: "round",
            join: "round"
        },

        point: {
            radius: 6,
            color: "#d97706",
            opacity: 1,
            strokeColor: "#ffffff",
            strokeWidth: 2
        }
    },


    viaducts: {
        color: "#aa549f",

        fill: {
            opacity: 0.40
        },

        line: {
            width: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 2,
                12, 5,
                16, 8
            ],
            opacity: 1,
            cap: "round",
            join: "round"
        },

        point: {
            radius: 6,
            color: "#dc2626",
            opacity: 1,
            strokeColor: "#ffffff",
            strokeWidth: 2
        }
    },


    bridges: {
        color: "#2563eb",

        fill: {
            opacity: 0.40
        },

        line: {
            width: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 2,
                12, 5,
                16, 8
            ],
            opacity: 1,
            cap: "round",
            join: "round"
        },

        point: {
            radius: 6,
            color: "#2563eb",
            opacity: 1,
            strokeColor: "#ffffff",
            strokeWidth: 2
        }
    },


    culverts: {
        color: "#0891b2",

        fill: {
            opacity: 0.38
        },

        line: {
            width: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 1.5,
                12, 4,
                16, 7
            ],
            opacity: 1,
            cap: "round",
            join: "round"
        },

        point: {
            radius: 5,
            color: "#0891b2",
            opacity: 1,
            strokeColor: "#ffffff",
            strokeWidth: 2
        }
    },


    underpasses: {
        color: "#059669",

        fill: {
            opacity: 0.40
        },

        line: {
            width: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 2,
                12, 4,
                16, 7
            ],
            opacity: 1,
            cap: "round",
            join: "round"
        },

        point: {
            radius: 6,
            color: "#059669",
            opacity: 1,
            strokeColor: "#ffffff",
            strokeWidth: 2
        }
    },


    overpasses: {
        color: "#be123c",

        fill: {
            opacity: 0.40
        },

        line: {
            width: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 2,
                12, 4,
                16, 7
            ],
            opacity: 1,
            cap: "round",
            join: "round"
        },

        point: {
            radius: 6,
            color: "#be123c",
            opacity: 1,
            strokeColor: "#ffffff",
            strokeWidth: 2
        }
    },


    stations: {
        color: "#0f766e",

        fill: {
            opacity: 0.45
        },

        line: {
            width: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 2,
                12, 5,
                16, 8
            ],
            opacity: 1,
            cap: "round",
            join: "round"
        },

        point: {
            radius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 5,
                12, 8,
                16, 11
            ],
            color: "#0f766e",
            opacity: 1,
            strokeColor: "#ffffff",
            strokeWidth: 2
        },

        label: {
            geometryType: "Polygon",

            field: "asset_code",

            minZoom: 12,

            size: 18,

            offset: [0, 0],
            anchor: "center",

            color: "#111827",
            opacity: 1,

            haloColor: "#ffffffb9",
            haloWidth: 3,

            allowOverlap: true,
            ignorePlacement: true
        }
    }
};