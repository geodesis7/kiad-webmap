"use strict";

const bridgeDetailDrawer = document.getElementById("bridge-detail-drawer");
const bridgeDetailContent = document.getElementById("bridge-detail-content");

let activeBridgeAssetId = null;
let bridgeSummaryController = null;

const BRIDGE_COMPONENT_LABELS = Object.freeze({
    BLINDING_CONCRETE: "Grobeton",
    FOUNDATION: "Temel",
    ELEVATION_BODY: "Elevasyon",
    PIER_STAGE: "Elevasyon Kademesi",
    CAP: "Başlık Kirişi",
    BEARING_BLOCK: "Mesnet / Takoz",
    PILE_GROUP: "Kazık Grubu",
    PILE: "Kazık"
});

const BRIDGE_SUBTYPE_LABELS = Object.freeze({
    SEISMIC_BLOCK: "Deprem Takozu",
    TEMPORARY_BEARING_BLOCK: "Geçici Mesnet Takozu"
});

const BRIDGE_STATUS_LABELS = Object.freeze({
    COMPLETED: "Tamamlandı",
    IN_PROGRESS: "Devam Ediyor",
    NOT_STARTED: "Başlamadı"
});

window.addEventListener("kiad:bridge-detail-open", (event) => {
    loadBridgeDetail(event.detail?.assetId);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isBridgeDetailDrawerOpen()) {
        closeBridgeDetailDrawer();
    }
});

async function loadBridgeDetail(assetId) {
    const normalizedAssetId = Number(assetId);
    if (!Number.isFinite(normalizedAssetId)) return;

    window.closeAllDetailDrawers?.("bridge");

    if (normalizedAssetId === activeBridgeAssetId && isBridgeDetailDrawerOpen()) {
        return;
    }

    resetBridgeSession(normalizedAssetId);
    showBridgeDetailDrawer();
    renderBridgeLoading();
    bridgeSummaryController = new AbortController();

    try {
        const response = await apiFetch(
            `${API_BASE_URL}/api/bridges/${encodeURIComponent(normalizedAssetId)}/summary`,
            { signal: bridgeSummaryController.signal }
        );
        if (!response.ok) throw new Error(`API isteği başarısız: ${response.status}`);

        const data = await response.json();
        if (activeBridgeAssetId === normalizedAssetId) renderBridgeDetail(data);
    } catch (error) {
        if (isAuthSessionError(error) || error.name === "AbortError" || activeBridgeAssetId !== normalizedAssetId) return;
        console.error("Köprü detayı yüklenemedi:", error);
        renderBridgeError();
    }
}

function resetBridgeSession(assetId = null) {
    bridgeSummaryController?.abort();
    bridgeSummaryController = null;
    activeBridgeAssetId = assetId;
}

function showBridgeDetailDrawer() {
    if (!bridgeDetailDrawer) return;
    bridgeDetailDrawer.hidden = false;
    bridgeDetailDrawer.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(() => bridgeDetailDrawer.classList.add("is-open"));
}

function closeBridgeDetailDrawer() {
    if (!bridgeDetailDrawer) return;
    resetBridgeSession();
    bridgeDetailDrawer.classList.remove("is-open");
    bridgeDetailDrawer.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
        if (!bridgeDetailDrawer.classList.contains("is-open")) {
            bridgeDetailDrawer.hidden = true;
            if (bridgeDetailContent) bridgeDetailContent.innerHTML = "";
        }
    }, 260);
}

function isBridgeDetailDrawerOpen() {
    return Boolean(bridgeDetailDrawer && !bridgeDetailDrawer.hidden && bridgeDetailDrawer.classList.contains("is-open"));
}

function renderBridgeLoading() {
    renderBridgeShell({ asset_code: "Köprü Detayı", asset_name: "Yükleniyor..." }, `
        <div class="tunnel-detail-state"><span class="tunnel-detail-spinner" aria-hidden="true"></span><span>İlerleme verileri yükleniyor...</span></div>`
    );
}

function renderBridgeError() {
    renderBridgeShell({ asset_code: "Köprü Detayı", asset_name: "Bilgiler alınamadı" }, `
        <div class="tunnel-detail-state tunnel-detail-state-error">Köprü ilerleme bilgileri şu anda yüklenemiyor.</div>`
    );
}

function renderBridgeShell(asset, body) {
    if (!bridgeDetailContent) return;
    bridgeDetailContent.innerHTML = `${createBridgeHeader(asset)}${body}`;
    bridgeDetailContent.querySelector(".tunnel-detail-close")?.addEventListener("click", closeBridgeDetailDrawer);
}

function renderBridgeDetail(data = {}) {
    if (!bridgeDetailContent) return;

    const asset = data.asset ?? {};
    const supports = Array.isArray(data.supports) ? data.supports : [];
    const metrics = getBridgePresentationMetrics(supports);
    const overview = [
        ["Toplam Kazık", formatBridgeCount(metrics.piles.plannedCount)],
        ["Betonarme Kayıt", formatBridgeCount(metrics.concrete.totalCount)],
        ["Destek", formatBridgeCount(data.support_count)],
        ["Veri Tarihi", formatBridgeDate(getLatestBridgeDate(supports))]
    ];
    const basicInfo = [
        ["Başlangıç KM", formatBridgeKm(asset.km_start)],
        ["Bitiş KM", formatBridgeKm(asset.km_end)]
    ].filter(([, value]) => hasBridgeValue(value) && value !== "—");

    bridgeDetailContent.innerHTML = `
        ${createBridgeHeader(asset)}
        <div class="tunnel-detail-scroll bridge-detail-scroll">
            <section class="tunnel-detail-section bridge-summary-section">
                <h3>Operasyon Özeti</h3>
                <div class="tunnel-kpi-grid bridge-kpi-grid">
                    ${overview.map(([label, value]) => createBridgeKpi(label, value)).join("")}
                </div>
                ${createBridgeReferenceMeta(basicInfo)}
            </section>
            <section class="tunnel-detail-section bridge-progress-section">
                <h3>İlerleme Göstergeleri</h3>
                <div class="bridge-progress-list">
                    ${createBridgeProgress(
                        "Kazık Adet İlerlemesi",
                        metrics.piles.hasReliableCounts
                            ? `${formatBridgeCount(metrics.piles.completedCount)} / ${formatBridgeCount(metrics.piles.plannedCount)} kazık`
                            : "Planlı ve tamamlanan kazık adedi bulunmuyor",
                        metrics.piles.percent,
                        metrics.piles.hasReliableCounts ? "Canonical kazık grup kayıtları" : "Veri yok"
                    )}
                    ${createBridgeProgress(
                        "Betonarme İlerlemesi",
                        metrics.concrete.totalCount !== null
                            ? `${formatBridgeCount(metrics.concrete.completedCount)} / ${formatBridgeCount(metrics.concrete.totalCount)} kayıt tamamlandı`
                            : "Betonarme kayıtları bulunmuyor",
                        metrics.concrete.percent,
                        metrics.concrete.totalCount !== null ? "Kayıt bazlı tamamlanma" : "Veri yok"
                    )}
                </div>
            </section>
            <section class="tunnel-detail-section">
                <div class="bridge-section-heading"><h3>Destek ve İmalatlar</h3><span>${escapeBridgeHtml(formatBridgeCount(supports.length))} destek</span></div>
                ${supports.length ? `<div class="bridge-support-list">${supports.map(createBridgeSupportCard).join("")}</div>` : createBridgeEmpty("Bu köprü için canonical ilerleme kaydı bulunmuyor.")}
            </section>
        </div>`;
    bridgeDetailContent.querySelector(".tunnel-detail-close")?.addEventListener("click", closeBridgeDetailDrawer);
}

function getBridgePresentationMetrics(supports = []) {
    const records = supports.flatMap((support) => Array.isArray(support.records) ? support.records : []);
    const pileGroups = records.filter((record) => record.component_type === "PILE_GROUP");
    const concreteRecords = records.filter((record) => !isBridgePileRecord(record));
    const pileCounts = pileGroups.map((record) => {
        const quantities = record.quantities && typeof record.quantities === "object" ? record.quantities : {};
        return {
            planned: toBridgeFiniteNumber(quantities.planned_pile_count ?? quantities.planned_count),
            completed: toBridgeFiniteNumber(quantities.completed_pile_count ?? quantities.completed_count)
        };
    });
    const hasReliablePileCounts = pileCounts.length > 0 && pileCounts.every(
        ({ planned, completed }) => planned !== null && completed !== null && planned >= 0 && completed >= 0
    );
    const plannedCount = hasReliablePileCounts
        ? pileCounts.reduce((sum, value) => sum + value.planned, 0)
        : null;
    const completedCount = hasReliablePileCounts
        ? pileCounts.reduce((sum, value) => sum + value.completed, 0)
        : null;
    const concreteTotalCount = concreteRecords.length || null;
    const concreteCompletedCount = concreteTotalCount === null
        ? null
        : concreteRecords.filter((record) => record.canonical_status === "COMPLETED").length;

    return {
        piles: {
            hasReliableCounts: hasReliablePileCounts && plannedCount > 0,
            plannedCount,
            completedCount,
            percent: getBridgeRatioPercent(completedCount, plannedCount)
        },
        concrete: {
            totalCount: concreteTotalCount,
            completedCount: concreteCompletedCount,
            percent: getBridgeRatioPercent(concreteCompletedCount, concreteTotalCount)
        }
    };
}

function createBridgeHeader(asset = {}) {
    return `<header class="tunnel-detail-header"><div class="tunnel-detail-heading">
        <span class="tunnel-detail-code">${escapeBridgeHtml(asset.asset_code || "Köprü")}</span>
        <h2 id="bridge-detail-title">${escapeBridgeHtml(asset.asset_name || asset.name || "Köprü Detayı")}</h2>
        <span class="tunnel-detail-status">Köprü</span>
    </div><button class="tunnel-detail-close" type="button" aria-label="Köprü detayını kapat">×</button></header>`;
}

function createBridgeSupportCard(support = {}) {
    const records = Array.isArray(support.records) ? support.records : [];
    const pileGroupRecords = records.filter((record) => record.component_type === "PILE_GROUP");
    const individualPileRecords = records.filter((record) => record.component_type === "PILE");
    const componentRecords = records.filter((record) => !isBridgePileRecord(record));
    const supportLabel = formatBridgeValue(support.support_code) || "Destek";

    return `<details class="bridge-support-card">
        <summary><div><strong>${escapeBridgeHtml(supportLabel)}</strong><span>${escapeBridgeHtml(formatBridgeCount(records.length))} imalat kaydı</span></div></summary>
        <div class="bridge-support-body">
            ${componentRecords.length ? `<section><h4>Betonarme Bileşenleri</h4><div class="bridge-component-list">${componentRecords.map(createBridgeRecordCard).join("")}</div></section>` : ""}
            ${pileGroupRecords.length ? `<section><h4>Kazık İlerlemesi</h4><div class="bridge-component-list">${pileGroupRecords.map(createBridgeRecordCard).join("")}</div></section>` : ""}
            ${individualPileRecords.length ? `<details class="bridge-individual-piles"><summary>Tekil kazık kayıtları <span>${escapeBridgeHtml(formatBridgeCount(individualPileRecords.length))}</span></summary><div class="bridge-component-list">${individualPileRecords.map(createBridgeRecordCard).join("")}</div></details>` : ""}
            ${!records.length ? createBridgeEmpty("Bu destek için ilerleme kaydı bulunmuyor.") : ""}
        </div>
    </details>`;
}

function createBridgeRecordCard(record = {}) {
    const label = getBridgeRecordLabel(record);
    const subtitle = getBridgeRecordSubtitle(record);
    const rows = [
        ["Durum", formatBridgeStatus(record.canonical_status)],
        ["İlerleme", formatBridgePercent(record.progress_percent)],
        ["Başlangıç", formatBridgeDate(record.actual_start_date)],
        ["Bitiş", formatBridgeDate(record.actual_end_date)],
        ["Son Aktivite", formatBridgeDate(record.last_activity_date)]
    ].filter(([, value]) => hasBridgeValue(value) && value !== "—");
    const quantityRows = createBridgeQuantityRows(record.quantities);
    const quality = formatBridgeValue(record.quality_message);

    return `<article class="bridge-component-card">
        <header><div><strong>${escapeBridgeHtml(label)}</strong>${subtitle ? `<span>${escapeBridgeHtml(subtitle)}</span>` : ""}</div>${hasBridgeValue(record.progress_percent) ? `<b>${escapeBridgeHtml(formatBridgePercent(record.progress_percent))}</b>` : ""}</header>
        ${rows.length || quantityRows.length ? `<dl>${[...rows, ...quantityRows].map(([key, value]) => `<div><dt>${escapeBridgeHtml(key)}</dt><dd>${escapeBridgeHtml(value)}</dd></div>`).join("")}</dl>` : `<span class="bridge-record-empty">Ek ilerleme bilgisi bulunmuyor.</span>`}
        ${quality ? `<p class="bridge-quality-note">${escapeBridgeHtml(quality)}</p>` : ""}
    </article>`;
}

function getBridgeRecordLabel(record = {}) {
    return BRIDGE_COMPONENT_LABELS[record.component_type] ?? "Diğer İmalat";
}

function getBridgeRecordSubtitle(record = {}) {
    const parts = [];
    const subtype = BRIDGE_SUBTYPE_LABELS[record.component_subtype];
    if (subtype) parts.push(subtype);
    if (record.component_type === "PIER_STAGE" && Number.isFinite(Number(record.stage_index))) {
        parts.push(`${Number(record.stage_index)}. Kademe`);
    }
    return parts.join(" · ");
}

function isBridgePileRecord(record = {}) {
    return record.component_type === "PILE_GROUP" || record.component_type === "PILE";
}

function createBridgeQuantityRows(quantities) {
    if (!quantities || typeof quantities !== "object" || Array.isArray(quantities)) return [];
    const planned = quantities.planned_pile_count ?? quantities.planned_count;
    const completed = quantities.completed_pile_count ?? quantities.completed_count;
    return [
        ["Planlanan Kazık", formatBridgeCount(planned)],
        ["Tamamlanan Kazık", formatBridgeCount(completed)]
    ].filter(([, value]) => value !== "—");
}

function createBridgeKpi(label, value) {
    return `<article class="tunnel-kpi-card"><span>${escapeBridgeHtml(label)}</span><strong>${escapeBridgeHtml(value)}</strong></article>`;
}

function createBridgeReferenceMeta(items = []) {
    if (!items.length) return "";
    return `<div class="bridge-reference-meta">${items.map(([label, value]) => `<span><b>${escapeBridgeHtml(label)}</b>${escapeBridgeHtml(value)}</span>`).join("")}</div>`;
}

function createBridgeProgress(label, ratioText, percent, note = "") {
    const value = toBridgeFiniteNumber(percent);
    const hasPercent = value !== null;
    const width = Math.min(100, Math.max(0, value ?? 0));
    return `<div class="bridge-progress-item">
        <div class="bridge-progress-heading"><div><strong>${escapeBridgeHtml(label)}</strong><span>${escapeBridgeHtml(ratioText)}</span></div><b>${hasPercent ? escapeBridgeHtml(formatBridgePercent(value)) : "—"}</b></div>
        <div class="bridge-progress-track" role="progressbar" aria-label="${escapeBridgeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value ?? 0}"><span style="width: ${width}%"></span></div>
        ${note ? `<small class="bridge-progress-note">${escapeBridgeHtml(note)}</small>` : ""}
    </div>`;
}

function createBridgeEmpty(message) {
    return `<div class="tunnel-faces-empty"><span>${escapeBridgeHtml(message)}</span></div>`;
}

function getLatestBridgeDate(supports = []) {
    const dates = supports.flatMap((support) => Array.isArray(support.records) ? support.records : [])
        .flatMap((record) => [record.data_as_of, record.last_activity_date])
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((value) => !Number.isNaN(value.valueOf()));
    return dates.length ? new Date(Math.max(...dates.map((date) => date.valueOf()))).toISOString() : null;
}

function formatBridgeStatus(value) { return BRIDGE_STATUS_LABELS[value] ?? ""; }
function toBridgeFiniteNumber(value) { const numeric = Number(value); return value === null || value === undefined || value === "" || !Number.isFinite(numeric) ? null : numeric; }
function getBridgeRatioPercent(completed, planned) { return completed === null || planned === null || planned <= 0 ? null : (completed / planned) * 100; }
function formatBridgePercent(value) { return Number.isFinite(Number(value)) ? `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(value))}` : "—"; }
function formatBridgeCount(value) { return Number.isFinite(Number(value)) ? new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Number(value)) : "—"; }
function formatBridgeDate(value) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(date); }
function formatBridgeKm(value) { return typeof formatKilometer === "function" ? formatKilometer(value) ?? "—" : formatBridgeValue(value) || "—"; }
function formatBridgeValue(value) { return value === null || value === undefined || value === "" ? "" : String(value); }
function hasBridgeValue(value) { return value !== null && value !== undefined && value !== ""; }
function escapeBridgeHtml(value) { const element = document.createElement("div"); element.textContent = String(value ?? ""); return element.innerHTML; }

window.openBridgeDetail = loadBridgeDetail;
window.closeBridgeDetailDrawer = closeBridgeDetailDrawer;
