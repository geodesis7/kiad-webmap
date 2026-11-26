"use strict";

// The forecast API is the canonical owner of all calculations.  This module
// deliberately only maps and formats its response for the two UI surfaces.
const TUNNEL_FORECAST_PRESENTATION = Object.freeze({
    trends: Object.freeze({
        ACCELERATING: { label: "Hızlanıyor", symbol: "↑" },
        STABLE: { label: "Stabil", symbol: "→" },
        SLOWING: { label: "Yavaşlıyor", symbol: "↓" }
    }),
    confidence: Object.freeze({
        HIGH: "Yüksek",
        MEDIUM: "Orta",
        LOW: "Düşük"
    }),
    states: Object.freeze({
        INSUFFICIENT_HISTORY: "Yeterli geçmiş veri yok",
        NO_ACTIVE_EXCAVATION: "Aktif kazı ilerlemesi yok",
        EXCAVATION_COMPLETED: "Kazı tamamlandı",
        MISSING_FACE_MAPPING: "Kazı aynası verisi henüz hazır değil",
        MISSING_GEOMETRY: "Geometri verisi eksik",
        INVALID_PROGRESS_HISTORY: "İlerleme verisi doğrulanmalı",
        STALE_SOURCE_DATA: "Kaynak veri güncel değil",
        NOT_APPLICABLE: "Tahmin uygulanmaz"
    }),
    qualityFlags: Object.freeze({
        SINGLE_ACTIVE_FACE: "Tek aktif ayna",
        PARTIAL_WINDOW_30: "Sınırlı geçmiş veri",
        VOLATILE_RATE: "Değişken ilerleme hızı",
        INACTIVE_MAPPED_FACE: "Bir ayna son dönemde ilerlemiyor"
    }),
    technicalQualityFlags: Object.freeze({
        ASSET_STATUS_CONFLICT: "Varlık durumu ile kaynak kayıtları farklı"
    }),
    blockReasons: Object.freeze({
        IMPORT_NOT_SUCCEEDED: "Son veri aktarımı tamamlanamadı.",
        IMPORT_RUN_MISMATCH: "Veri aktarımı ile doğrulama kaydı eşleşmiyor.",
        IMPORT_ARCHIVE_MISSING: "Aktarımın kaynak arşivi bulunamadı.",
        IMPORT_ARCHIVE_SIZE_OR_SHA_MISMATCH: "Kaynak arşivin boyutu veya özeti doğrulama kaydıyla eşleşmiyor.",
        IMPORT_STAGING_COUNT_MISMATCH: "Aktarılan satır sayısı beklenen değerle eşleşmiyor.",
        INVALID_STAGING_VALUE: "Aktarılan ilerleme verisinde geçersiz değer var.",
        FACE_INTERVAL_OVERLAP: "Bir kazı aynasının ilerleme aralıkları çakışıyor.",
        DUPLICATE_CANONICAL_MATCH: "Bir ilerleme kaydı birden fazla kez eşleşiyor.",
        MISSING_OR_AMBIGUOUS_CANONICAL_MATCH: "Bazı ilerleme kayıtları kaynakla tekil olarak eşleştirilemedi.",
        INVALID_FACE_HEALTH: "Kazı aynası ilerleme kayıtları doğrulanamadı.",
        MISSING_MATCH_OR_CROSS_FACE_OVERLAP: "İlerleme kayıtlarında eksik eşleşme veya kazı aynaları arasında örtüşme var."
    })
});

function getTunnelForecastPresentation(response) {
    const { asset_id, freshness_status, candidate_status, block_reason } = response;
    if (asset_id !== 1011 || !freshness_status) {
        return { forecast: response, notice: "", sourceLabel: "", technicalNote: "" };
    }

    const blocked = candidate_status === "BLOCKED";
    const pending = candidate_status === "PENDING";
    if (freshness_status === "CURRENT" && !blocked && !pending) {
        return { forecast: response, notice: "", sourceLabel: "", technicalNote: "" };
    }

    const forecast = response.last_verified_forecast ?? null;
    let notice;
    if (blocked) {
        const reason = TUNNEL_FORECAST_PRESENTATION.blockReasons[block_reason?.code]
            ?? "Kaynak veri doğrulanamadı.";
        notice = `Güncel tahmin oluşturulamadı. ${reason}`;
    } else if (pending) {
        notice = "Güncel kaynak doğrulama bekliyor.";
    } else if (freshness_status === "STALE") {
        notice = "Tahmin güncel değil.";
    } else {
        notice = "Henüz güncel tahmin yok.";
    }

    const technicalNote = getTunnelForecastBlockDetails(block_reason);
    if (!forecast) {
        return {
            forecast, notice: `${notice} Doğrulanmış tahmin bulunmuyor.`, sourceLabel: "",
            technicalNote
        };
    }

    const sourceDate = formatTunnelForecastDate(
        response.last_verified_source_synced_at ?? forecast.source_synced_at ?? forecast.data_as_of
    );
    return {
        forecast,
        notice,
        sourceLabel: sourceDate === "—"
            ? "Son doğrulanmış tarihsel tahmin"
            : `Son doğrulanmış tarihsel tahmin · Kaynak tarihi ${sourceDate}`,
        technicalNote
    };
}

function getTunnelForecastBlockDetails(reason) {
    if (!reason) {
        return "";
    }

    const errors = Array.isArray(reason.errors) ? reason.errors : [];
    const overlappingFaces = reason.code === "FACE_INTERVAL_OVERLAP" && Array.isArray(reason.health)
        ? reason.health : [];
    return [
        reason.code,
        ...errors.map(({ sheet, row, field, raw_value, reason: errorCode }) =>
            `${sheet} · Satır ${row} · ${field} · Ham değer ${JSON.stringify(raw_value)} · ${errorCode}`
        ),
        ...overlappingFaces.map(([faceId, , , , , overlap]) =>
            `Ayna ${faceId} · Fiziksel örtüşme ${formatTunnelForecastMeters(overlap)}`
        ),
        reason.expected != null && reason.actual != null
            ? `Beklenen ${reason.expected} · Gelen ${reason.actual}` : "",
        reason.cross_face_overlap_m != null
            ? `Aynalar arası örtüşme ${formatTunnelForecastMeters(reason.cross_face_overlap_m)}` : ""
    ].filter(Boolean).join(" · ");
}

function isTunnelForecastAvailable(forecast = {}) {
    return String(forecast.forecast_state ?? "").toUpperCase() === "AVAILABLE";
}

function getTunnelForecastStateLabel(forecast = {}) {
    const state = String(forecast.forecast_state ?? "").toUpperCase();
    return TUNNEL_FORECAST_PRESENTATION.states[state] ?? "Tahmin bilgisi henüz hazır değil";
}

function getTunnelForecastTrend(forecast = {}) {
    const trend = String(forecast.trend ?? "").toUpperCase();
    return TUNNEL_FORECAST_PRESENTATION.trends[trend] ?? null;
}

function getTunnelForecastConfidenceLabel(forecast = {}) {
    const confidence = String(forecast.confidence ?? "").toUpperCase();
    return TUNNEL_FORECAST_PRESENTATION.confidence[confidence] ?? null;
}

function getTunnelForecastQualityNotes(forecast = {}) {
    const flags = Array.isArray(forecast.quality_flags) ? forecast.quality_flags : [];
    return flags
        .map((flag) => TUNNEL_FORECAST_PRESENTATION.qualityFlags[String(flag).toUpperCase()])
        .filter(Boolean);
}

function getTunnelForecastTechnicalNotes(forecast = {}) {
    const flags = Array.isArray(forecast.quality_flags) ? forecast.quality_flags : [];
    return flags
        .map((flag) => TUNNEL_FORECAST_PRESENTATION.technicalQualityFlags[String(flag).toUpperCase()])
        .filter(Boolean);
}

function formatTunnelForecastNumber(value, maximumFractionDigits = 2) {
    const numericValue = Number(value);
    return value === null || value === undefined || value === "" || !Number.isFinite(numericValue)
        ? "—"
        : numericValue.toLocaleString("tr-TR", { maximumFractionDigits });
}

function formatTunnelForecastMeters(value) {
    const formatted = formatTunnelForecastNumber(value);
    return formatted === "—" ? formatted : `${formatted} m`;
}

function formatTunnelForecastRate(value) {
    const formatted = formatTunnelForecastNumber(value);
    return formatted === "—" ? formatted : `${formatted} m/gün`;
}

function formatTunnelForecastDate(value, long = false) {
    if (!value) {
        return "—";
    }

    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return new Intl.DateTimeFormat("tr-TR", long
        ? { day: "numeric", month: "long", year: "numeric" }
        : { day: "2-digit", month: "2-digit", year: "numeric" }
    ).format(date);
}

window.TUNNEL_FORECAST_PRESENTATION = TUNNEL_FORECAST_PRESENTATION;
window.isTunnelForecastAvailable = isTunnelForecastAvailable;
window.getTunnelForecastStateLabel = getTunnelForecastStateLabel;
window.getTunnelForecastTrend = getTunnelForecastTrend;
window.getTunnelForecastConfidenceLabel = getTunnelForecastConfidenceLabel;
window.getTunnelForecastQualityNotes = getTunnelForecastQualityNotes;
window.getTunnelForecastTechnicalNotes = getTunnelForecastTechnicalNotes;
window.formatTunnelForecastNumber = formatTunnelForecastNumber;
window.formatTunnelForecastMeters = formatTunnelForecastMeters;
window.formatTunnelForecastRate = formatTunnelForecastRate;
window.formatTunnelForecastDate = formatTunnelForecastDate;
