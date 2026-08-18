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
        const response = await fetch(
            `${API_BASE_URL}/api/assets`
        );

        if (!response.ok) {
            throw new Error(
                `API isteği başarısız: ${response.status}`
            );
        }

        const assets = await response.json();

        renderLayerTree(assets);

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
function renderLayerTree(assets) {
    if (!Array.isArray(assets)) {
        return;
    }

    assetsById.clear();

    assets.forEach((asset) => {
        assetsById.set(
            Number(asset.asset_id),
            asset
        );
    });

    const groups = ASSET_LAYER_GROUPS
        .map((group) => {

            const groupAssets = assets
                .filter((asset) => {
                    return (
                        Number(asset.type_id) ===
                        Number(group.typeId)
                    );
                })
                .sort(compareAssets);

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
            String(groups.length);
    }


    if (groups.length === 0) {
        layerTree.innerHTML = `
            <div class="layer-tree-empty">
                Gösterilecek proje varlığı bulunamadı.
            </div>
        `;

        return;
    }


    layerTree.innerHTML =
        groups
            .map(createLayerGroupHtml)
            .join("");


    bindLayerTreeEvents(groups);
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
                            ${escapeAttribute(group.color)};
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

                ${
                    secondaryLabel
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

                    focusAsset(asset);
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

            return;
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

        return;
    }


    console.warn(
        "Asset için konum bilgisi bulunamadı:",
        asset.asset_id
    );
}