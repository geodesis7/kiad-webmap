"use strict";

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
            properties.asset_type,
            properties.type
        );

    const statusLabel =
        getStatusLabel(properties);

    const rows = [
        createPopupRow(
            "Varlık Kodu",
            assetCode
        ),

        createPopupRow(
            "Yapı Türü",
            typeLabel
        ),

        createPopupRow(
            "Kesim",
            formatSection(
                properties.section_name,
                properties.section_id
            )
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

        </article>
    `;
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