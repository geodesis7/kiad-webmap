"use strict";

let activeAssetPopup = null;

/**
 * Harita ve katman listesinin paylaştığı tek popup açma noktasıdır.
 *
 * @param {maplibregl.Map} mapInstance
 * @param {Record<string, unknown>} properties
 * @param {maplibregl.LngLatLike} lngLat
 * @returns {maplibregl.Popup}
 */
function openAssetPopup(mapInstance, properties, lngLat) {
    if (typeof clearPendingAssetPopup === "function") {
        clearPendingAssetPopup();
    }

    activeAssetPopup?.remove();

    const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "360px",
        offset: 12
    })
        .setLngLat(lngLat)
        .setHTML(createPopupHtml(properties))
        .addTo(mapInstance);

    activeAssetPopup = popup;
    bindPopupActions(popup, properties);

    popup.on("close", () => {
        if (activeAssetPopup === popup) {
            activeAssetPopup = null;
        }
    });

    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            ensurePopupVisible(mapInstance, popup);
        });
    });

    return popup;
}

function openDsmPopup(mapInstance, properties, lngLat) {
    if (typeof clearPendingAssetPopup === "function") {
        clearPendingAssetPopup();
    }

    activeAssetPopup?.remove();

    const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "360px",
        offset: 12
    })
        .setLngLat(lngLat)
        .setHTML(createDsmPopupHtml(properties))
        .addTo(mapInstance);

    activeAssetPopup = popup;

    popup.on("close", () => {
        if (activeAssetPopup === popup) {
            activeAssetPopup = null;
        }
    });

    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            ensurePopupVisible(mapInstance, popup);
        });
    });

    return popup;
}

function createDsmPopupHtml(properties = {}) {
    const dsmCode = getFirstValue(properties.column_name, properties.column_id) ?? "DSM";
    const rows = [
        createPopupRow("DSM Kodu", properties.column_name),
        createPopupRow("Kesim", properties.section_code),
        createPopupRow("İmalat Tarihi", formatPopupDate(properties.production_date)),
        createPopupRow("Vardiya", properties.shift_type),
        createPopupRow("Makine", properties.machine_code),
        createPopupRow("Proje Boyu", formatMetricValue(properties.design_length_m, "m")),
        createPopupRow("İmal Edilen Boy", formatMetricValue(properties.constructed_length_m, "m")),
        createPopupRow("Çimento Sarfiyatı", formatMetricValue(properties.cement_consumption_kg_m, "kg/m")),
        createPopupRow("Dozaj", formatMetricValue(properties.dosage_kg_m3, "kg/m³")),
        createPopupRow("Easting", formatCoordinate(properties.easting)),
        createPopupRow("Northing", formatCoordinate(properties.northing)),
        createPopupRow("Açıklama", properties.notes)
    ].filter(Boolean).join("");

    return `
        <article class="asset-popup dsm-popup">
            <header class="asset-popup-header">
                <div class="asset-popup-heading">
                    <span class="asset-popup-eyebrow">DSM</span>
                    <h3 class="popup-title">${escapeHtml(String(dsmCode))}</h3>
                </div>
            </header>
            <div class="asset-popup-body">
                ${rows || createEmptyPopupMessage()}
            </div>
        </article>
    `;
}

function formatPopupDate(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const date = new Date(String(value));

    return Number.isNaN(date.getTime())
        ? String(value)
        : date.toLocaleDateString("tr-TR");
}

function formatMetricValue(value, unit) {
    const number = toFiniteNumber(value);

    return number === null
        ? null
        : `${number.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${unit}`;
}

function formatCoordinate(value) {
    const number = toFiniteNumber(value);

    return number === null
        ? null
        : number.toLocaleString("tr-TR", {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3
        });
}

/**
 * Popup taşan kenarlar kadar haritayı kaydırarak tüm içeriği görünür tutar.
 *
 * @param {maplibregl.Map} mapInstance
 * @param {maplibregl.Popup} popup
 */
function ensurePopupVisible(mapInstance, popup) {
    const popupElement = popup.getElement();
    const mapElement = mapInstance.getContainer();

    if (!popupElement || !mapElement) {
        return;
    }

    const popupRect = popupElement.getBoundingClientRect();
    const mapRect = mapElement.getBoundingClientRect();
    const safeGap = 12;
    const visibleBounds = {
        top: mapRect.top + safeGap,
        right: mapRect.right - safeGap,
        bottom: mapRect.bottom - safeGap,
        left: mapRect.left + safeGap
    };

    const sidebar = document.getElementById("sidebar");

    if (sidebar && !sidebar.classList.contains("is-closed")) {
        const sidebarRect = sidebar.getBoundingClientRect();

        if (sidebarRect.right > mapRect.left) {
            visibleBounds.left = Math.max(
                visibleBounds.left,
                sidebarRect.right + safeGap
            );
        }
    }

    const drawer = document.getElementById("tunnel-detail-drawer");

    if (
        drawer &&
        !drawer.hidden &&
        drawer.classList.contains("is-open")
    ) {
        const drawerRect = drawer.getBoundingClientRect();

        visibleBounds.right = Math.min(
            visibleBounds.right,
            drawerRect.left - safeGap
        );
    }

    if (
        visibleBounds.right <= visibleBounds.left ||
        visibleBounds.bottom <= visibleBounds.top
    ) {
        return;
    }

    const leftOverflow = Math.max(
        visibleBounds.left - popupRect.left,
        0
    );
    const rightOverflow = Math.max(
        popupRect.right - visibleBounds.right,
        0
    );
    const topOverflow = Math.max(
        visibleBounds.top - popupRect.top,
        0
    );
    const bottomOverflow = Math.max(
        popupRect.bottom - visibleBounds.bottom,
        0
    );
    const panX = rightOverflow - leftOverflow;
    const panY = bottomOverflow - topOverflow;

    if (panX === 0 && panY === 0) {
        return;
    }

    mapInstance.panBy([panX, panY], {
        duration: 280,
        essential: true
    });
}

/**
 * Varlık bilgilerini kullanıcı dostu popup HTML'ine dönüştürür.
 *
 * @param {Record<string, unknown>} properties
 * @returns {string}
 */
function createPopupHtml(properties = {}) {
    const assetName =
        getFirstValue(
            properties.name,
            properties.asset_name,
            properties.asset_code,
            properties.asset_id
        ) ?? "Proje Varlığı";

    const assetCode =
        getFirstValue(
            properties.asset_code,
            properties.code
        );

    const typeLabel =
        getFirstValue(
            properties.type_name,
            properties.type_code
        );

    const statusLabel =
        getFirstValue(
            properties.status_name,
            properties.status_code
        );

    const sectionLabel =
        getFirstValue(
            properties.section_code,
            properties.section_name
        );

    const tunnelDetailAction =
        createTunnelDetailAction(properties);

    const rows = [
        createPopupRow(
            "Varlık Kodu",
            properties.asset_code
        ),

        createPopupRow(
            "Yapı Türü",
            typeLabel
        ),

        createPopupRow(
            "Kesim",
            sectionLabel
        ),

        createPopupRow(
            "Başlangıç Km",
            formatKilometer(properties.km_start)
        ),

        createPopupRow(
            "Bitiş Km",
            formatKilometer(properties.km_end)
        ),

        createPopupRow(
            "Uzunluk",
            formatLength(properties.length)
        ),

        createPopupRow(
            "İlerleme",
            formatProgress(properties.progress_percent)
        ),

        createPopupRow(
            "Durum",
            statusLabel
        )
    ]
        .filter(Boolean)
        .join("");

    return `
        <article class="asset-popup">

            <header class="asset-popup-header">

                <div class="asset-popup-heading">

                    <span class="asset-popup-eyebrow">
                        Proje Varlığı
                    </span>

                    <h3 class="popup-title">
                        ${escapeHtml(String(assetName))}
                    </h3>

                </div>

                ${statusLabel
            ? `
                            <span class="popup-status-badge">
                                ${escapeHtml(statusLabel)}
                            </span>
                        `
            : ""
        }

            </header>

            <div class="asset-popup-body">
                ${rows || createEmptyPopupMessage()}
            </div>

            ${tunnelDetailAction}

        </article>
    `;
}

/**
 * Yalnızca tünel varlıkları için detay aksiyonu oluşturur.
 *
 * @param {Record<string, unknown>} properties
 * @returns {string}
 */
function createTunnelDetailAction(properties = {}) {
    const typeId = toFiniteNumber(properties.type_id);
    const assetId = toFiniteNumber(properties.asset_id);

    if (typeId !== 3 || assetId === null) {
        return "";
    }

    return `
        <footer class="asset-popup-actions">
            <button
                class="tunnel-detail-button"
                type="button"
                data-popup-action="open-tunnel-detail"
            >
                Tünel Detayını Aç
            </button>
        </footer>
    `;
}

/**
 * Popup içindeki aksiyonları ilgili varlığa bağlar.
 *
 * @param {maplibregl.Popup} popup
 * @param {Record<string, unknown>} properties
 */
function bindPopupActions(popup, properties = {}) {
    const button = popup
        .getElement()
        ?.querySelector('[data-popup-action="open-tunnel-detail"]');

    if (!button) {
        return;
    }

    button.addEventListener("click", () => {
        openTunnelDetailDrawer(properties.asset_id);
    });
}

/**
 * Gelecekte eklenecek drawer bileşenine tünel kimliğini iletir.
 * Drawer bu olayı dinleyerek görünür hâle gelebilir ve verisini yükleyebilir.
 *
 * @param {unknown} assetId
 */
function openTunnelDetailDrawer(assetId) {
    const normalizedAssetId = toFiniteNumber(assetId);

    if (normalizedAssetId === null) {
        return;
    }

    window.dispatchEvent(
        new CustomEvent("kiad:tunnel-detail-open", {
            detail: {
                assetId: normalizedAssetId
            }
        })
    );
}

/**
 * Popup bilgi satırı oluşturur.
 *
 * @param {string} label
 * @param {unknown} value
 * @returns {string}
 */
function createPopupRow(label, value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "";
    }

    return `
        <div class="popup-row">

            <span class="popup-label">
                ${escapeHtml(label)}
            </span>

            <span class="popup-value">
                ${escapeHtml(String(value))}
            </span>

        </div>
    `;
}

/**
 * Kilometre değerini 67+560 biçimine dönüştürür.
 *
 * Beklenen ham değer örneği:
 * 67560 -> 67+560
 *
 * @param {unknown} value
 * @returns {string | null}
 */
function formatKilometer(value) {
    const numericValue = toFiniteNumber(value);

    if (numericValue === null) {
        return null;
    }

    const roundedValue = Math.round(numericValue);
    const kilometer = Math.floor(roundedValue / 1000);
    const meter = Math.abs(roundedValue % 1000);

    return `${kilometer}+${String(meter).padStart(3, "0")}`;
}

/**
 * Uzunluğu metre veya kilometre biçiminde gösterir.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
function formatLength(value) {
    const numericValue = toFiniteNumber(value);

    if (numericValue === null) {
        return null;
    }

    if (numericValue >= 1000) {
        const kilometerValue = numericValue / 1000;

        return `${kilometerValue.toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })} km`;
    }

    return `${numericValue.toLocaleString("tr-TR", {
        maximumFractionDigits: 2
    })} m`;
}

/**
 * Section adı varsa onu, yoksa section_id değerini gösterir.
 *
 * @param {unknown} sectionName
 * @param {unknown} sectionId
 * @returns {string | null}
 */
function formatSection(sectionName, sectionId) {
    const name = getFirstValue(sectionName);

    if (name !== null) {
        return String(name);
    }

    const id = getFirstValue(sectionId);

    if (id === null) {
        return null;
    }

    return `Kesim ${id}`;
}

/**
 * Durum alanlarını yorumlar.
 *
 * Öncelik:
 * status_name -> status -> is_deleted
 *
 * @param {Record<string, unknown>} properties
 * @returns {string | null}
 */
function getStatusLabel(properties) {
    const explicitStatus =
        getFirstValue(
            properties.status_name,
            properties.status
        );

    if (explicitStatus !== null) {
        return String(explicitStatus);
    }

    const isDeleted = normalizeBoolean(
        properties.is_deleted
    );

    if (isDeleted === true) {
        return "Pasif";
    }

    if (isDeleted === false) {
        return "Aktif";
    }

    return null;
}

/**
 * İlk dolu değeri döndürür.
 *
 * @param {...unknown} values
 * @returns {unknown | null}
 */
function getFirstValue(...values) {
    for (const value of values) {
        if (
            value !== null &&
            value !== undefined &&
            value !== ""
        ) {
            return value;
        }
    }

    return null;
}

/**
 * Sayıya güvenli dönüşüm yapar.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
function toFiniteNumber(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue)
        ? numericValue
        : null;
}

/**
 * Boolean benzeri verileri dönüştürür.
 *
 * @param {unknown} value
 * @returns {boolean | null}
 */
function normalizeBoolean(value) {
    if (
        value === true ||
        value === 1 ||
        value === "1" ||
        value === "true"
    ) {
        return true;
    }

    if (
        value === false ||
        value === 0 ||
        value === "0" ||
        value === "false"
    ) {
        return false;
    }

    return null;
}

/**
 * Gösterilecek veri bulunamadığında kullanılır.
 *
 * @returns {string}
 */
function createEmptyPopupMessage() {
    return `
        <p class="popup-empty-message">
            Bu varlık için gösterilebilir bilgi bulunamadı.
        </p>
    `;
}

/**
 * HTML enjeksiyonuna karşı metni güvenli hâle getirir.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatProgress(value) {
    const numericValue = toFiniteNumber(value);

    if (numericValue === null) {
        return null;
    }

    return `%${numericValue.toLocaleString("tr-TR", {
        maximumFractionDigits: 1
    })}`;
}
