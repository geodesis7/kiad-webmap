"use strict";


const layerTree =
    document.getElementById("layer-tree");

const layerGroupCount =
    document.getElementById("layer-group-count");


const API_BASE_URL =
    window.KIAD_API_BASE_URL ?? "";


const assetsById = new Map();
const LAYER_DISPLAY_ORDER = [
    "alignment", "tunnels", "viaducts", "bridges", "cut-cover-tunnels",
    "culverts", "underpasses", "overpasses", "excavations", "fills",
    "dsm", "stations"
];
const LAYER_CATEGORIES = {
    all: { label: "Tümü", groups: LAYER_DISPLAY_ORDER },
    route: { label: "Güzergâh", groups: ["alignment", "stations"] },
    tunnels: { label: "Tüneller", groups: ["tunnels", "cut-cover-tunnels"] },
    structures: { label: "Sanat Yapıları", groups: ["viaducts", "bridges", "culverts", "underpasses", "overpasses"] },
    earthworks: { label: "Toprak İşleri", groups: ["excavations", "fills"] },
    geotechnical: { label: "Jeoteknik", groups: ["dsm"] }
};
const TUNNEL_SUBGROUPS = [
    { id: "main", label: "Ana Tüneller", categories: ["MAIN"] },
    { id: "safety", label: "Emniyet ve Kaçış", categories: ["EMERGENCY", "ESCAPE"] },
    { id: "connection", label: "Bağlantı Tünelleri", categories: ["CONNECTION"] }
];
const layerSearch = document.getElementById("layer-search");
const layerCategoryTabs = document.getElementById("layer-category-tabs");
const layerVisibilityFilter = document.getElementById("layer-visibility-filter");
const layerSelected = document.getElementById("layer-selected");
let activeLayerCategory = "all";
let selectedLayerAssetId = null;
let filterFrame = null;

/*
 * API'den asset listesini yükler.
 */
async function loadLayerPanel() {
    if (!layerTree) {
        return;
    }

    try {
        const tunnelCategoriesPromise = apiFetch(`${API_BASE_URL}/api/tunnels/forecast`)
            .then((response) => response.ok ? response.json() : null)
            .catch((error) => {
                if (!isAuthSessionError(error)) {
                    console.warn("Tünel alt grup sınıfları yüklenemedi:", error);
                }
                return null;
            });
        const [assetResponse, dsmSectionResponse] = await Promise.all([
            apiFetch(`${API_BASE_URL}/api/assets`),
            apiFetch(`${API_BASE_URL}/api/dsm/sections`)
        ]);

        if (!assetResponse.ok || !dsmSectionResponse.ok) {
            throw new Error(
                `API isteği başarısız: assets=${assetResponse.status}, dsm=${dsmSectionResponse.status}`
            );
        }

        const [assets, dsmSections] = await Promise.all([
            assetResponse.json(),
            dsmSectionResponse.json()
        ]);

        renderLayerTree(assets, dsmSections);
        void tunnelCategoriesPromise.then((data) => {
            if (Array.isArray(data?.items) && data.items.length > 0) {
                applyTunnelCategoryGrouping(data.items);
            }
        });

    } catch (error) {
        if (isAuthSessionError(error)) {
            return;
        }

        console.error(
            "Katman paneli yüklenemedi:",
            error
        );

        layerTree.innerHTML = `
            <div class="layer-tree-error">
                Katmanlar yüklenemedi.
            </div>
        `;
    }
}


/*
 * API'den gelen assetleri layers.js içindeki
 * MapLibre gruplarına göre organize eder.
 */
function renderLayerTree(assets, dsmSections = [], tunnelCategories = []) {
    if (!Array.isArray(assets) || !Array.isArray(dsmSections)) {
        return;
    }

    const tunnelCategoryById = new Map(
        (Array.isArray(tunnelCategories) ? tunnelCategories : [])
            .map((item) => [Number(item.asset_id), String(item.tunnel_category || "").toUpperCase()])
    );

    assetsById.clear();

    assets.forEach((asset) => {
        assetsById.set(
            Number(asset.asset_id),
            asset
        );
    });

    window.dispatchEvent(
        new CustomEvent("kiad:assets-loaded", {
            detail: {
                count: assetsById.size
            }
        })
    );

    const groups = ASSET_LAYER_GROUPS
        .map((group) => {

            const groupAssets = assets
                .filter((asset) => {
                    return (
                        Number(asset.type_id) ===
                        Number(group.typeId)
                    );
                })
                .sort(
                    group.id === "tunnels"
                        ? compareTunnelAssets
                        : compareAssets
                );

            return {
                ...group,
                assets: groupAssets,
                tunnelCategoryById
            };
        })
        /*
         * Veritabanında hiç kaydı olmayan grubu
         * şimdilik sidebar'da göstermiyoruz.
         */
        .filter((group) => {
            return group.assets.length > 0;
        })
        .sort((left, right) => LAYER_DISPLAY_ORDER.indexOf(left.id) - LAYER_DISPLAY_ORDER.indexOf(right.id));


    if (layerGroupCount) {
        layerGroupCount.textContent =
            String(groups.length + 1);
    }


    const groupById = new Map(groups.map((group) => [group.id, group]));
    groupById.set("dsm", { id: "dsm", html: createDsmLayerHtml(dsmSections) });
    layerTree.innerHTML = LAYER_DISPLAY_ORDER
        .map((id) => groupById.get(id))
        .filter(Boolean)
        .map((group) => group.html || createLayerGroupHtml(group))
        .join("");


    bindLayerTreeEvents(groups);
    bindDsmLayerEvents(dsmSections);
    bindLayerPanelFilters();
    updateLayerPanelCounts();
    applyLayerPanelFilters();
}

function createDsmLayerHtml(sections) {
    const layerColor = ASSET_STYLES.dsm?.color ?? "#0e7490";
    const totalCount = sections.reduce(
        (total, section) => total + Number(section.count || 0),
        0
    );
    const sectionRows = sections
        .map(createDsmSectionRowHtml)
        .join("");

    return `
        <section class="layer-group layer-group-operation" data-group-id="dsm" data-open="false">
            <div class="layer-group-header">
                <span class="layer-symbol" style="--layer-color: ${escapeAttribute(layerColor)};" aria-hidden="true"></span>
                <button class="layer-group-title dsm-group-title" type="button" aria-expanded="false">
                    <span class="layer-group-name">DSM</span>
                    <span class="layer-group-subtitle">${totalCount.toLocaleString("tr-TR")} nokta</span>
                </button>
                <label class="layer-group-checkbox" title="DSM noktalarını ve etiketlerini göster veya gizle">
                    <input class="dsm-layer-toggle" type="checkbox" checked aria-label="DSM görünürlüğü">
                    <span class="custom-checkbox"></span>
                </label>
                <button class="layer-group-expand" type="button" aria-label="DSM genişlet veya daralt" aria-expanded="false"><span class="layer-group-chevron">›</span></button>
            </div>
            <div class="layer-group-assets dsm-section-list" hidden>
                ${sectionRows || '<div class="layer-tree-empty">DSM kısmı bulunamadı.</div>'}
            </div>
        </section>
    `;
}

function createDsmSectionRowHtml(section) {
    const sectionCode = String(section.section_code ?? "");
    const sectionLabel = formatDsmSectionLabel(sectionCode);

    return `
        <div class="layer-asset dsm-section-row" data-section-code="${escapeAttribute(sectionCode)}">
            <label class="layer-asset-checkbox" title="${escapeAttribute(sectionLabel)} DSM noktalarını göster veya gizle">
                <input class="dsm-section-toggle" type="checkbox" value="${escapeAttribute(sectionCode)}" checked aria-label="${escapeAttribute(sectionLabel)} DSM görünürlüğü">
                <span class="custom-checkbox"></span>
            </label>
            <button class="layer-asset-name dsm-section-name" type="button" data-section-code="${escapeAttribute(sectionCode)}">
                <span class="layer-asset-primary">${escapeHtml(sectionLabel)}</span>
                <span class="layer-asset-secondary">${escapeHtml(sectionCode)}</span>
            </button>
            <span class="layer-group-count dsm-section-count">${Number(section.count || 0)}</span>
        </div>
    `;
}

function formatDsmSectionLabel(sectionCode) {
    const numericMatch = String(sectionCode).match(/(\d+)\s*$/);

    return numericMatch
        ? `Kısım ${Number(numericMatch[1])}`
        : String(sectionCode);
}

function bindDsmLayerEvents(sections) {
    const groupElement = layerTree?.querySelector('[data-group-id="dsm"]');

    if (!groupElement) {
        return;
    }

    const expandButton = groupElement.querySelector(".layer-group-expand");
    const titleButton = groupElement.querySelector(".dsm-group-title");
    const sectionContainer = groupElement.querySelector(".dsm-section-list");
    const groupToggle = groupElement.querySelector(".dsm-layer-toggle");
    const sectionToggles = Array.from(groupElement.querySelectorAll(".dsm-section-toggle"));

    const toggleAccordion = () => {
        groupElement.dataset.open = String(groupElement.dataset.open !== "true");
        applyLayerPanelFilters();
    };

    expandButton?.addEventListener("click", toggleAccordion);
    titleButton?.addEventListener("click", toggleAccordion);

    groupToggle?.addEventListener("change", () => {
        sectionToggles.forEach((toggle) => {
            toggle.checked = groupToggle.checked;
        });
        groupToggle.indeterminate = false;
        updateDsmMapSelection(groupToggle, sectionToggles);
        updateLayerPanelCounts();
        applyLayerPanelFilters();
    });

    sectionToggles.forEach((toggle) => {
        toggle.addEventListener("change", () => {
            updateParentCheckbox(groupToggle, sectionToggles);
            updateDsmMapSelection(groupToggle, sectionToggles);
            updateLayerPanelCounts();
            applyLayerPanelFilters();
        });
    });

    groupElement.querySelectorAll(".dsm-section-name").forEach((button) => {
        button.addEventListener("click", () => {
            const section = sections.find(
                (candidate) => String(candidate.section_code) === button.dataset.sectionCode
            );

            if (section && typeof focusDsmSection === "function") {
                focusDsmSection(map, section.bbox);
            }
        });
    });

    updateDsmMapSelection(groupToggle, sectionToggles);
}

function updateDsmMapSelection(groupToggle, sectionToggles) {
    const selectedSectionCodes = sectionToggles
        .filter((toggle) => toggle.checked)
        .map((toggle) => toggle.value);

    if (typeof setDsmVisibility === "function") {
        setDsmVisibility(map, Boolean(groupToggle?.checked || groupToggle?.indeterminate));
    }

    if (typeof setDsmSectionSelection === "function") {
        setDsmSectionSelection(map, selectedSectionCodes);
    }
}


/*
 * Bir accordion grubunun HTML'ini oluşturur.
 */
function createLayerGroupHtml(group) {
    const assetRows = group.id === "tunnels"
        ? createTunnelSubgroupHtml(group)
        : group.assets.map((asset) => createAssetRowHtml(group, asset)).join("");

    const style =
        typeof getAssetStyle === "function"
            ? getAssetStyle(group.id)
            : null;

    const layerColor =
        style?.color ?? "#64748b";


    return `
        <section
            class="layer-group"
            data-group-id="${escapeAttribute(group.id)}"
            data-open="false"
        >

            <div class="layer-group-header">

                <span class="layer-symbol" style="--layer-color:${escapeAttribute(layerColor)}" aria-hidden="true"></span>
                <button
                    class="layer-group-title"
                    type="button"
                    aria-expanded="false"
                >
                    <span class="layer-group-name">
                        ${escapeHtml(group.id === "cut-cover-tunnels" ? "Aç-Kapalar" : group.label)}
                    </span>
                    <span class="layer-group-subtitle"><span class="layer-group-selected-count">${group.assets.length}</span>/${group.assets.length} kontrol açık</span>
                </button>
                <span class="layer-group-count">${group.assets.length}</span>
                <label class="layer-group-checkbox" title="Tüm grubu göster veya gizle">
                    <input class="layer-group-toggle" type="checkbox" checked aria-label="${escapeAttribute(group.label)} tümünü göster veya gizle">
                    <span class="custom-checkbox"></span>
                </label>
                <button class="layer-group-expand" type="button" aria-label="${escapeAttribute(group.label)} genişlet veya daralt" aria-expanded="false"><span class="layer-group-chevron">›</span></button>
            </div>


            <div
                class="layer-group-assets"
                hidden
            >
                ${group.id === "tunnels" ? createTunnelLiningControlsHtml() : ""}
                ${assetRows}
            </div>

        </section>
    `;
}

function createTunnelSubgroupHtml(group) {
    if (group.tunnelCategoryById.size === 0) {
        return createTunnelSubgroupSection("pending", "Tüm Tüneller", group.assets, group);
    }
    const classifiedIds = new Set();
    const sections = TUNNEL_SUBGROUPS.map((subgroup) => {
        const members = group.assets.filter((asset) => {
            const matches = subgroup.categories.includes(group.tunnelCategoryById.get(Number(asset.asset_id)));
            if (matches) classifiedIds.add(Number(asset.asset_id));
            return matches;
        });
        return createTunnelSubgroupSection(subgroup.id, subgroup.label, members, group);
    });
    const unclassified = group.assets.filter((asset) => !classifiedIds.has(Number(asset.asset_id)));
    if (unclassified.length) {
        sections.push(createTunnelSubgroupSection("other", "Diğer Tüneller", unclassified, group));
    }
    return sections.join("");
}

function applyTunnelCategoryGrouping(categories) {
    const group = layerTree.querySelector('[data-group-id="tunnels"]');
    const container = group?.querySelector(".layer-group-assets");
    if (!container) return;

    const rows = Array.from(container.querySelectorAll(".layer-asset[data-asset-id]"));
    const categoryById = new Map(categories.map((item) => [
        Number(item.asset_id), String(item.tunnel_category || "").toUpperCase()
    ]));
    const wasOpen = container.querySelector(".tunnel-subgroup")?.dataset.open === "true";
    const classifiedIds = new Set();
    const sections = [];

    function addSection(id, label, members) {
        if (!members.length) return;
        const section = document.createElement("section");
        section.className = "tunnel-subgroup";
        section.dataset.subgroupId = id;
        section.dataset.open = String(wasOpen);
        section.innerHTML = `<button class="tunnel-subgroup-title" type="button" aria-expanded="${wasOpen}">
            <span class="tunnel-subgroup-chevron" aria-hidden="true">›</span>
            <span>${escapeHtml(label)}</span><span class="tunnel-subgroup-count">${members.length}</span>
        </button><div class="tunnel-subgroup-assets" ${wasOpen ? "" : "hidden"}></div>`;
        section.querySelector(".tunnel-subgroup-assets").append(...members);
        sections.push(section);
    }

    TUNNEL_SUBGROUPS.forEach((subgroup) => {
        const members = rows.filter((row) => {
            const assetId = Number(row.dataset.assetId);
            const matches = subgroup.categories.includes(categoryById.get(assetId));
            if (matches) classifiedIds.add(assetId);
            return matches;
        });
        addSection(subgroup.id, subgroup.label, members);
    });
    addSection("other", "Diğer Tüneller", rows.filter((row) => !classifiedIds.has(Number(row.dataset.assetId))));
    container.replaceChildren(...sections);
    applyLayerPanelFilters();
}

function createTunnelSubgroupSection(id, label, assets, group) {
    if (!assets.length) return "";
    return `<section class="tunnel-subgroup" data-subgroup-id="${id}" data-open="false">
        <button class="tunnel-subgroup-title" type="button" aria-expanded="false">
            <span class="tunnel-subgroup-chevron" aria-hidden="true">›</span>
            <span>${escapeHtml(label)}</span>
            <span class="tunnel-subgroup-count">${assets.length}</span>
        </button>
        <div class="tunnel-subgroup-assets" hidden>${assets.map((asset) => createAssetRowHtml(group, asset)).join("")}</div>
    </section>`;
}

function createTunnelLiningControlsHtml() {
    const stages = [
        ["INVERT", "İnvert Kaplaması", ASSET_STYLES.tunnelLining.invert.color],
        ["ARCH", "Kemer Kaplaması", ASSET_STYLES.tunnelLining.arch.outlineColor]
    ];
    return `<div class="tunnel-lining-controls" aria-label="Nihai Kaplama katmanları">
        <strong>Nihai Kaplama</strong>
        ${stages.map(([stage, label, color]) => `
            <label class="tunnel-lining-control">
                <input class="tunnel-lining-stage-toggle" type="checkbox"
                    value="${stage}" ${isTunnelLiningStageVisible(stage) ? "checked" : ""}>
                <span class="tunnel-lining-swatch" style="--lining-color:${color}"></span>
                <span>${escapeHtml(label)}</span>
            </label>`).join("")}
        <small>Yaklaşık konumlu imalat gösterimi</small>
    </div>`;
}


/*
 * Tek asset satırını oluşturur.
 */
function createAssetRowHtml(group, asset) {
    const primaryLabel =
        asset.asset_code ||
        asset.name ||
        `Asset ${asset.asset_id}`;

    const secondaryLabel =
        asset.asset_code &&
            asset.name &&
            asset.asset_code !== asset.name
            ? asset.name
            : "";


    return `
        <div
            class="layer-asset"
            data-asset-id="${Number(asset.asset_id)}"
        >

            <label class="layer-asset-checkbox">

                <input
                    class="layer-asset-toggle"
                    type="checkbox"
                    value="${Number(asset.asset_id)}"
                    checked
                    aria-label="${escapeAttribute(primaryLabel)} görünürlüğü"
                >

                <span class="custom-checkbox"></span>

            </label>


            <button
                class="layer-asset-name"
                type="button"
                data-asset-id="${Number(asset.asset_id)}"
            >

                <span class="layer-asset-primary">
                    ${escapeHtml(primaryLabel)}
                </span>

                ${secondaryLabel
            ? `
                            <span class="layer-asset-secondary">
                                ${escapeHtml(secondaryLabel)}
                            </span>
                        `
            : ""
        }
                ${asset.section_code ? `<span class="layer-asset-section">${escapeHtml(asset.section_code)}</span>` : ""}

            </button>

        </div>
    `;
}


/*
 * Oluşturulan DOM elemanlarının click/change
 * eventlerini bağlar.
 */
function bindLayerTreeEvents(groups) {

    groups.forEach((group) => {

        const groupElement =
            layerTree.querySelector(
                `[data-group-id="${group.id}"]`
            );

        if (!groupElement) {
            return;
        }

        if (group.id === "tunnels") {
            groupElement.querySelectorAll(".tunnel-lining-stage-toggle").forEach((toggle) => {
                toggle.addEventListener("change", () => {
                    setTunnelLiningStageVisibility(toggle.value, toggle.checked);
                });
            });
        }


        const expandButton =
            groupElement.querySelector(
                ".layer-group-expand"
            );

        const titleButton =
            groupElement.querySelector(
                ".layer-group-title"
            );

        const assetContainer =
            groupElement.querySelector(
                ".layer-group-assets"
            );

        const groupToggle =
            groupElement.querySelector(
                ".layer-group-toggle"
            );

        const assetToggles =
            Array.from(
                groupElement.querySelectorAll(
                    ".layer-asset-toggle"
                )
            );

        const assetNameButtons =
            Array.from(
                groupElement.querySelectorAll(
                    ".layer-asset-name"
                )
            );


        /*
         * Accordion aç / kapat.
         */
        const toggleAccordion = () => {
            groupElement.dataset.open = String(groupElement.dataset.open !== "true");
            applyLayerPanelFilters();
        };


        expandButton?.addEventListener(
            "click",
            toggleAccordion
        );

        titleButton?.addEventListener(
            "click",
            toggleAccordion
        );

        if (group.id === "tunnels") {
            groupElement.addEventListener("click", (event) => {
                const button = event.target.closest(".tunnel-subgroup-title");
                if (!button || !groupElement.contains(button)) return;
                const subgroup = button.closest(".tunnel-subgroup");
                subgroup.dataset.open = String(subgroup.dataset.open !== "true");
                applyLayerPanelFilters();
            });
        }


        /*
         * Grup checkbox:
         *
         * Tüneller checkbox kapatılırsa
         * bütün tünel asset checkboxları kapanır.
         */
        groupToggle?.addEventListener(
            "change",
            () => {

                assetToggles.forEach(
                    (toggle) => {
                        toggle.checked =
                            groupToggle.checked;
                    }
                );

                groupToggle.indeterminate =
                    false;

                updateMapGroupSelection(
                    group.id,
                    assetToggles
                );
                updateLayerPanelCounts();
                applyLayerPanelFilters();
            }
        );


        /*
         * Tekil asset checkbox.
         */
        assetToggles.forEach((toggle) => {

            toggle.addEventListener(
                "change",
                () => {

                    updateParentCheckbox(
                        groupToggle,
                        assetToggles
                    );

                    updateMapGroupSelection(
                        group.id,
                        assetToggles
                    );
                    updateLayerPanelCounts();
                    applyLayerPanelFilters();
                }
            );
        });

        assetNameButtons.forEach((button) => {

            button.addEventListener(
                "click",
                () => {

                    const assetId =
                        Number(
                            button.dataset.assetId
                        );

                    const asset =
                        assetsById.get(assetId);

                    if (!asset) {
                        console.warn(
                            "Asset bulunamadı:",
                            assetId
                        );

                        return;
                    }

                    selectedLayerAssetId = assetId;
                    renderSelectedLayerAsset();
                    focusAssetAndOpenPopup(asset);
                }
            );
        });

    });
}


/*
 * Alt checkboxların durumuna göre üst checkbox:
 *
 * ☑ tümü açık
 * ☐ tümü kapalı
 * ◩ bazıları açık
 */
function updateParentCheckbox(
    groupToggle,
    assetToggles
) {
    const checkedCount =
        assetToggles.filter(
            (toggle) => toggle.checked
        ).length;


    groupToggle.checked =
        checkedCount ===
        assetToggles.length;


    groupToggle.indeterminate =
        checkedCount > 0 &&
        checkedCount < assetToggles.length;
}


/*
 * Seçili asset_id listesini MapLibre'a gönderir.
 */
function updateMapGroupSelection(
    groupId,
    assetToggles
) {
    const selectedAssetIds =
        assetToggles
            .filter(
                (toggle) => toggle.checked
            )
            .map(
                (toggle) => Number(toggle.value)
            );


    if (
        typeof setAssetGroupSelection ===
        "function"
    ) {
        setAssetGroupSelection(
            map,
            groupId,
            selectedAssetIds
        );
    }

    window.dispatchEvent(new CustomEvent(
        "kiad:asset-group-selection-changed",
        {
            detail: {
                groupId,
                selectedAssetIds
            }
        }
    ));
}


/*
 * Assetleri kullanıcıya daha doğal sırada gösterir.
 *
 * asset_code varsa önce onu kullanır.
 */
function compareAssets(a, b) {
    const labelA =
        String(
            a.asset_code ||
            a.name ||
            a.asset_id
        );

    const labelB =
        String(
            b.asset_code ||
            b.name ||
            b.asset_id
        );


    return labelA.localeCompare(
        labelB,
        "tr",
        {
            numeric: true,
            sensitivity: "base"
        }
    );
}


function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function escapeAttribute(value) {
    return escapeHtml(value);
}

let layerFiltersBound = false;

function bindLayerPanelFilters() {
    if (layerFiltersBound) return;
    layerFiltersBound = true;

    layerCategoryTabs.innerHTML = Object.entries(LAYER_CATEGORIES).map(([id, category]) =>
        `<button class="layer-category-tab" type="button" data-category="${id}" aria-pressed="${id === "all"}">${escapeHtml(category.label)}</button>`
    ).join("");

    layerCategoryTabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-category]");
        if (!button) return;
        activeLayerCategory = button.dataset.category;
        applyLayerPanelFilters();
    });
    layerSearch?.addEventListener("input", () => {
        if (filterFrame !== null) window.cancelAnimationFrame(filterFrame);
        filterFrame = window.requestAnimationFrame(() => {
            filterFrame = null;
            applyLayerPanelFilters();
        });
    });
    layerVisibilityFilter?.addEventListener("change", applyLayerPanelFilters);
}

function normalizeLayerSearch(value) {
    return String(value ?? "")
        .toLocaleLowerCase("tr-TR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replaceAll("ı", "i")
        .trim();
}

function applyLayerPanelFilters() {
    if (!layerTree) return;
    const query = normalizeLayerSearch(layerSearch?.value);
    const visibility = layerVisibilityFilter?.value || "all";
    let visibleGroups = 0;

    layerCategoryTabs?.querySelectorAll("[data-category]").forEach((button) => {
        const active = button.dataset.category === activeLayerCategory;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
    });

    layerTree.querySelectorAll(".layer-group").forEach((group) => {
        const inCategory = LAYER_CATEGORIES[activeLayerCategory].groups.includes(group.dataset.groupId);
        let matchCount = 0;
        group.querySelectorAll(".layer-asset, .dsm-section-row").forEach((row) => {
            const toggle = row.querySelector(".layer-asset-toggle, .dsm-section-toggle");
            const asset = assetsById.get(Number(row.dataset.assetId));
            const compactCode = String(asset?.asset_code || "");
            const paddedCpCode = /^cp\d+$/i.test(compactCode)
                ? `cp${compactCode.slice(2).padStart(2, "0")}`
                : "";
            const searchable = asset
                ? [asset.asset_code, paddedCpCode, asset.name, asset.section_code, asset.section_name].join(" ")
                : row.textContent;
            const matchesQuery = !query || normalizeLayerSearch(searchable).includes(query);
            const matchesVisibility = visibility === "all" || (visibility === "visible" ? toggle?.checked : !toggle?.checked);
            row.hidden = !(matchesQuery && matchesVisibility);
            if (!row.hidden) matchCount++;
        });

        group.hidden = !inCategory || matchCount === 0;
        if (group.hidden) return;
        visibleGroups++;
        const open = group.dataset.open === "true" || Boolean(query);
        group.classList.toggle("is-open", open);
        group.querySelector(".layer-group-assets").hidden = !open;
        group.querySelectorAll(".layer-group-expand, .layer-group-title").forEach((button) => {
            button.setAttribute("aria-expanded", String(open));
        });

        group.querySelectorAll(".tunnel-subgroup").forEach((subgroup) => {
            const matches = subgroup.querySelectorAll(".layer-asset:not([hidden])").length;
            subgroup.hidden = matches === 0;
            const subgroupOpen = subgroup.dataset.open === "true" || Boolean(query);
            subgroup.querySelector(".tunnel-subgroup-assets").hidden = !subgroupOpen;
            subgroup.querySelector(".tunnel-subgroup-title").setAttribute("aria-expanded", String(subgroupOpen));
        });
    });
    const noResults = document.getElementById("layer-no-results");
    if (noResults) noResults.hidden = visibleGroups > 0;
}

function updateLayerPanelCounts() {
    const toggles = Array.from(layerTree.querySelectorAll(".layer-asset-toggle, .dsm-section-toggle"));
    const checked = toggles.filter((toggle) => toggle.checked).length;
    const visibleCount = document.getElementById("layer-visible-count");
    const totalCount = document.getElementById("layer-total-count");
    if (visibleCount) visibleCount.textContent = checked.toLocaleString("tr-TR");
    if (totalCount) totalCount.textContent = toggles.length.toLocaleString("tr-TR");
    layerTree.querySelectorAll(".layer-group:not([data-group-id='dsm'])").forEach((group) => {
        const all = group.querySelectorAll(".layer-asset-toggle");
        const count = Array.from(all).filter((toggle) => toggle.checked).length;
        const element = group.querySelector(".layer-group-selected-count");
        if (element) element.textContent = String(count);
    });
    renderSelectedLayerAsset();
}

function renderSelectedLayerAsset() {
    if (!layerSelected) return;
    const asset = assetsById.get(selectedLayerAssetId);
    layerSelected.hidden = !asset;
    if (!asset) return;
    const row = layerTree.querySelector(`.layer-asset[data-asset-id="${selectedLayerAssetId}"]`);
    const isVisible = Boolean(row?.querySelector(".layer-asset-toggle")?.checked);
    layerTree.querySelectorAll(".layer-asset.is-selected").forEach((item) => item.classList.remove("is-selected"));
    row?.classList.add("is-selected");
    layerSelected.innerHTML = `<div class="layer-selected-header"><strong>SEÇİLİ VARLIK</strong><button type="button" aria-label="Seçimi kapat">×</button></div>
        <div class="layer-selected-body"><strong>${escapeHtml(asset.asset_code || asset.name || asset.asset_id)}</strong>
        <span>${escapeHtml(asset.name || "")}${asset.section_code ? ` · ${escapeHtml(asset.section_code)}` : ""}</span>
        <em>${isVisible ? "Görünür" : "Gizli"}</em></div>
        <button class="layer-selected-find" type="button">Listede bul</button>`;
    layerSelected.querySelector(".layer-selected-header button").addEventListener("click", () => {
        selectedLayerAssetId = null;
        renderSelectedLayerAsset();
    });
    layerSelected.querySelector(".layer-selected-find").addEventListener("click", () => {
        activeLayerCategory = "all";
        layerVisibilityFilter.value = "all";
        layerSearch.value = asset.asset_code || asset.name || "";
        applyLayerPanelFilters();
        row?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
}


/*
 * Sayfa yüklendiğinde API çağrısını başlat.
 */
loadLayerPanel();


let pendingAssetPopup = null;


function focusAssetAndOpenPopup(asset) {
    const popupLngLat = getAssetPopupLngLat(asset);

    clearPendingAssetPopup();

    if (!popupLngLat) {
        focusAsset(asset);
        return;
    }

    let hasOpened = false;

    const openPopup = () => {
        if (hasOpened) {
            return;
        }

        hasOpened = true;
        clearPendingAssetPopup();
        openAssetPopup(map, asset, popupLngLat);
    };

    const moveEndHandler = () => {
        openPopup();
    };

    pendingAssetPopup = {
        handler: moveEndHandler,
        timerId: null
    };

    map.once("moveend", moveEndHandler);

    const hasFocused = focusAsset(asset);

    if (!hasFocused) {
        openPopup();
        return;
    }

    if (pendingAssetPopup?.handler === moveEndHandler) {
        pendingAssetPopup.timerId = window.setTimeout(
            openPopup,
            1200
        );
    }
}


function clearPendingAssetPopup() {
    if (!pendingAssetPopup) {
        return;
    }

    map.off("moveend", pendingAssetPopup.handler);

    if (pendingAssetPopup.timerId !== null) {
        window.clearTimeout(pendingAssetPopup.timerId);
    }

    pendingAssetPopup = null;
}


function getAssetPopupLngLat(asset) {
    const longitude = Number(asset.center_lon);
    const latitude = Number(asset.center_lat);

    if (
        Number.isFinite(longitude) &&
        Number.isFinite(latitude)
    ) {
        return [longitude, latitude];
    }

    const bbox = Array.isArray(asset.bbox)
        ? asset.bbox.map(Number)
        : null;

    if (
        bbox?.length === 4 &&
        bbox.every(Number.isFinite)
    ) {
        return [
            (bbox[0] + bbox[2]) / 2,
            (bbox[1] + bbox[3]) / 2
        ];
    }

    return null;
}

function focusAsset(asset) {

    const bbox =
        Array.isArray(asset.bbox)
            ? asset.bbox.map(Number)
            : null;


    /*
     * Öncelikle bbox kullan.
     * Çizgi ve polygon geometrilerinde objenin
     * tamamını ekrana sığdırır.
     */
    if (
        bbox &&
        bbox.length === 4 &&
        bbox.every(Number.isFinite)
    ) {

        const [
            west,
            south,
            east,
            north
        ] = bbox;


        /*
         * Eğer bbox gerçek bir alan oluşturuyorsa
         * fitBounds kullan.
         */
        if (
            west !== east ||
            south !== north
        ) {

            map.fitBounds(
                [
                    [west, south],
                    [east, north]
                ],
                {
                    padding: {
                        top: 70,
                        right: 80,
                        bottom: 70,
                        left: 80
                    },
                    duration: 700,
                    maxZoom: 16
                }
            );

            return true;
        }
    }


    /*
     * Nokta geometrisi veya bbox kullanılamayan
     * bir durum varsa merkez koordinatına git.
     */
    const longitude =
        Number(asset.center_lon);

    const latitude =
        Number(asset.center_lat);


    if (
        Number.isFinite(longitude) &&
        Number.isFinite(latitude)
    ) {

        map.flyTo({
            center: [
                longitude,
                latitude
            ],
            zoom: 16,
            duration: 700
        });

        return true;
    }


    console.warn(
        "Asset için konum bilgisi bulunamadı:",
        asset.asset_id
    );

    return false;
}


/*
 * Yalnızca tunnels grubu için ana tünel ailelerini
 * istenen sıraya yerleştirir.
 */
function compareTunnelAssets(a, b) {
    const codeA = String(a.asset_code ?? "");
    const codeB = String(b.asset_code ?? "");
    const priorityDifference =
        getTunnelSortPriority(codeA) -
        getTunnelSortPriority(codeB);

    return priorityDifference || compareAssets(a, b);
}


function getTunnelSortPriority(assetCode) {
    const normalizedCode = String(assetCode)
        .trim()
        .toLocaleLowerCase("tr");

    if (/^t\d+$/.test(normalizedCode)) {
        return 0;
    }

    if (/^emt\d+$/.test(normalizedCode)) {
        return 1;
    }

    if (/^kt\d+$/.test(normalizedCode)) {
        return 2;
    }

    if (/^cp\d+$/.test(normalizedCode)) {
        return 3;
    }

    return 4;
}
