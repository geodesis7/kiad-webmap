"use strict";


const layerTree =
    document.getElementById("layer-tree");

const layerGroupCount =
    document.getElementById("layer-group-count");


const API_BASE_URL =
    ["localhost", "127.0.0.1"].includes(
        window.location.hostname
    )
        ? "http://127.0.0.1:8000"
        : "";


const assetsById = new Map();

/*
 * API'den asset listesini yükler.
 */
async function loadLayerPanel() {
    if (!layerTree) {
        return;
    }

    try {
        const [assetResponse, dsmSectionResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/assets`),
            fetch(`${API_BASE_URL}/api/dsm/sections`)
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

    } catch (error) {
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
function renderLayerTree(assets, dsmSections = []) {
    if (!Array.isArray(assets) || !Array.isArray(dsmSections)) {
        return;
    }

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
                assets: groupAssets
            };
        })
        /*
         * Veritabanında hiç kaydı olmayan grubu
         * şimdilik sidebar'da göstermiyoruz.
         */
        .filter((group) => {
            return group.assets.length > 0;
        });


    if (layerGroupCount) {
        layerGroupCount.textContent =
            String(groups.length + 1);
    }


    layerTree.innerHTML = [
        ...groups.map(createLayerGroupHtml),
        createDsmLayerHtml(dsmSections)
    ].join("");


    bindLayerTreeEvents(groups);
    bindDsmLayerEvents(dsmSections);
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
        <section class="layer-group layer-group-operation is-open" data-group-id="dsm">
            <div class="layer-group-header">
                <button class="layer-group-expand" type="button" aria-expanded="true">
                    <span class="layer-group-chevron">›</span>
                </button>
                <label class="layer-group-checkbox" title="DSM noktalarını ve etiketlerini göster veya gizle">
                    <input class="dsm-layer-toggle" type="checkbox" checked>
                    <span class="custom-checkbox"></span>
                </label>
                <button class="layer-group-title dsm-group-title" type="button">
                    <span class="layer-symbol" style="--layer-color: ${escapeAttribute(layerColor)};"></span>
                    <span class="layer-group-name">DSM</span>
                </button>
                <span class="layer-group-count">${totalCount}</span>
            </div>
            <div class="layer-group-assets dsm-section-list">
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
                <input class="dsm-section-toggle" type="checkbox" value="${escapeAttribute(sectionCode)}" checked>
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
        const isOpen = !sectionContainer.hidden;
        sectionContainer.hidden = isOpen;
        groupElement.classList.toggle("is-open", !isOpen);
        expandButton?.setAttribute("aria-expanded", String(!isOpen));
    };

    expandButton?.addEventListener("click", toggleAccordion);
    titleButton?.addEventListener("click", toggleAccordion);

    groupToggle?.addEventListener("change", () => {
        sectionToggles.forEach((toggle) => {
            toggle.checked = groupToggle.checked;
        });
        groupToggle.indeterminate = false;
        updateDsmMapSelection(groupToggle, sectionToggles);
    });

    sectionToggles.forEach((toggle) => {
        toggle.addEventListener("change", () => {
            updateParentCheckbox(groupToggle, sectionToggles);
            updateDsmMapSelection(groupToggle, sectionToggles);
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
    const assetRows =
        group.assets
            .map((asset) => {
                return createAssetRowHtml(
                    group,
                    asset
                );
            })
            .join("");

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
        >

            <div class="layer-group-header">

                <button
                    class="layer-group-expand"
                    type="button"
                    aria-expanded="false"
                >
                    <span class="layer-group-chevron">
                        ›
                    </span>
                </button>


                <label
                    class="layer-group-checkbox"
                    title="Tüm grubu göster veya gizle"
                >
                    <input
                        class="layer-group-toggle"
                        type="checkbox"
                        checked
                    >

                    <span class="custom-checkbox"></span>
                </label>


                <button
                    class="layer-group-title"
                    type="button"
                >
                    <span
                        class="layer-symbol"
                        style="
                            --layer-color:
                            ${escapeAttribute(layerColor)};
                        "
                    ></span>

                    <span class="layer-group-name">
                        ${escapeHtml(group.label)}
                    </span>
                </button>


                <span class="layer-group-count">
                    ${group.assets.length}
                </span>

            </div>


            <div
                class="layer-group-assets"
                hidden
            >
                ${assetRows}
            </div>

        </section>
    `;
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

            const isOpen =
                !assetContainer.hidden;

            assetContainer.hidden =
                isOpen;

            groupElement.classList.toggle(
                "is-open",
                !isOpen
            );

            expandButton?.setAttribute(
                "aria-expanded",
                String(!isOpen)
            );
        };


        expandButton?.addEventListener(
            "click",
            toggleAccordion
        );

        titleButton?.addEventListener(
            "click",
            toggleAccordion
        );


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
                    duration: 900,
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
            duration: 900
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
