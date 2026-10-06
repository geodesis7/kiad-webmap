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
    })
});

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
