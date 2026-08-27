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
        color: "#1e3a8a",

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
        color: "#d97706ab",

        fill: {
            opacity: 0.62
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
            opacity: [
                "step",
                ["zoom"],
                0.80,
                6, 0.60,
                10, 0.40
            ]
        },

        line: {
            geometryType: "Polygon",
            width: [
                "step",
                ["zoom"],
                5,
                6, 2,
                10, 4
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
    },


    alignmentKmLabels: {
        minZoom: 8,
        size: [
            "interpolate",
            ["linear"],
            ["zoom"],
            8, 9,
            12, 10,
            15, 11
        ],
        offset: [0, 0.8],
        anchor: "top",
        color: "#475569",
        opacity: 0.94,
        haloColor: "rgba(255, 255, 255, 0.88)",
        haloWidth: 1.25
    },


    dsm: {
        color: "#0e7490",
        minZoom: 14,

        point: {
            radius: [
                "interpolate",
                ["exponential", 2],
                ["zoom"],
                0, 2,
                17, 2,
                18, 2.18,
                19, 4.37,
                20, 8.74,
                22, 34.96
            ],
            opacity: 0.88,
            strokeColor: "#ffffff",
            strokeWidth: 0.9
        },

        label: {
            field: "column_name",
            minZoom: 18,
            size: 10,
            offset: [0, 1.05],
            anchor: "top",
            color: "#164e63",
            haloColor: "rgba(255, 255, 255, 0.94)",
            haloWidth: 1.1,
            allowOverlap: false
        }
    },


    excavations: {
        color: "#b45309",

        fill: {
            opacity: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 0.14,
                12, 0.20,
                16, 0.27
            ],
            outlineColor: "#92400e"
        },

        line: {
            width: 1.5,
            opacity: 0.72,
            cap: "round",
            join: "round"
        },

        point: {
            radius: 5,
            color: "#b45309",
            opacity: 0.92,
            strokeColor: "#fff7ed",
            strokeWidth: 1.5
        }
    },


    fills: {
        color: "#65752f",

        fill: {
            opacity: [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, 0.13,
                12, 0.19,
                16, 0.26
            ],
            outlineColor: "#4d5f24"
        },

        line: {
            width: 1.5,
            opacity: 0.72,
            cap: "round",
            join: "round"
        },

        point: {
            radius: 5,
            color: "#65752f",
            opacity: 0.92,
            strokeColor: "#f7fee7",
            strokeWidth: 1.5
        }
    },


    "tunnel-faces": {
        minZoom: 11,

        active: {
            color: "#16a36a",
            radius: 7,
            opacity: 0.96,
            strokeColor: "#ffffff",
            strokeWidth: 2.5
        },

        closed: {
            color: "#64748b",
            radius: 5,
            opacity: 0.58,
            strokeColor: "#ffffff",
            strokeWidth: 1.5
        },

        selected: {
            color: "#f59e0b",
            radius: 10,
            strokeColor: "#7c2d12",
            strokeWidth: 3,
            haloColor: "#fbbf24",
            haloRadius: 15,
            haloOpacity: 0.28
        },

        label: {
            minZoom: 14,
            field: "face_code",
            size: 12,
            offset: [0, 1.35],
            color: "#172554",
            haloColor: "#ffffff",
            haloWidth: 2,
            allowOverlap: false
        }
    }
};
