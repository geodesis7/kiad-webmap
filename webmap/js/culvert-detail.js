"use strict";

const culvertDetailDrawer = document.getElementById("culvert-detail-drawer");
const culvertDetailContent = document.getElementById("culvert-detail-content");

let activeCulvertAssetId = null;
let culvertSummaryController = null;
let culvertStructuresController = null;
let culvertOtherWorksController = null;
let culvertStructuresData = null;
let culvertOtherWorksData = null;
let culvertStructuresLoading = false;
let culvertOtherWorksLoading = false;

const CULVERT_ELEMENT_LABELS = Object.freeze({
    FOUNDATION: "Temel",
    LEFT_WALL: "Sol Perde",
    RIGHT_WALL: "Sağ Perde",
    TOP_SLAB: "Üst Döşeme"
});

window.addEventListener("kiad:culvert-detail-open", (event) => {
    loadCulvertDetail(event.detail?.assetId);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isCulvertDetailDrawerOpen()) {
        closeCulvertDetailDrawer();
    }
});

async function loadCulvertDetail(assetId) {
    const normalizedAssetId = Number(assetId);

    if (!Number.isFinite(normalizedAssetId)) return;

    if (typeof closeTunnelDetailDrawer === "function") closeTunnelDetailDrawer();
    if (typeof closeViaductDetailDrawer === "function") closeViaductDetailDrawer();

    if (normalizedAssetId === activeCulvertAssetId && isCulvertDetailDrawerOpen()) {
        return;
    }

    resetCulvertSession(normalizedAssetId);
    showCulvertDetailDrawer();
    renderCulvertLoading();
    culvertSummaryController = new AbortController();

    try {
        const response = await apiFetch(
            `${API_BASE_URL}/api/culverts/${encodeURIComponent(normalizedAssetId)}/summary`,
            { signal: culvertSummaryController.signal }
        );
        if (!response.ok) throw new Error(`API isteği başarısız: ${response.status}`);

        const data = await response.json();
        if (activeCulvertAssetId === normalizedAssetId) renderCulvertDetail(data);
    } catch (error) {
        if (isAuthSessionError(error) || error.name === "AbortError" || activeCulvertAssetId !== normalizedAssetId) return;
        console.error("Menfez detayı yüklenemedi:", error);
        renderCulvertError();
    }
}

function resetCulvertSession(assetId = null) {
    culvertSummaryController?.abort();
    culvertStructuresController?.abort();
    culvertOtherWorksController?.abort();
    activeCulvertAssetId = assetId;
    culvertStructuresData = null;
    culvertOtherWorksData = null;
    culvertStructuresLoading = false;
    culvertOtherWorksLoading = false;
}

function showCulvertDetailDrawer() {
    if (!culvertDetailDrawer) return;
    culvertDetailDrawer.hidden = false;
    culvertDetailDrawer.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(() => culvertDetailDrawer.classList.add("is-open"));
}

function closeCulvertDetailDrawer() {
    if (!culvertDetailDrawer) return;
    resetCulvertSession();
    culvertDetailDrawer.classList.remove("is-open");
    culvertDetailDrawer.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
        if (!culvertDetailDrawer.classList.contains("is-open")) {
            culvertDetailDrawer.hidden = true;
            if (culvertDetailContent) culvertDetailContent.innerHTML = "";
        }
    }, 260);
}

function isCulvertDetailDrawerOpen() {
    return Boolean(culvertDetailDrawer && !culvertDetailDrawer.hidden && culvertDetailDrawer.classList.contains("is-open"));
}

function renderCulvertLoading() {
    renderCulvertShell({ asset_code: "Menfez Detayı", name: "Yükleniyor..." }, `
        <div class="tunnel-detail-state"><span class="tunnel-detail-spinner" aria-hidden="true"></span><span>Bilgiler yükleniyor...</span></div>`
    );
}

function renderCulvertError() {
    renderCulvertShell({ asset_code: "Menfez Detayı", name: "Bilgiler alınamadı" }, `
        <div class="tunnel-detail-state tunnel-detail-state-error">Menfez bilgileri şu anda yüklenemiyor.</div>`
    );
}

function renderCulvertShell(asset, body) {
    if (!culvertDetailContent) return;
    culvertDetailContent.innerHTML = `${createCulvertHeader(asset)}${body}`;
    bindCulvertCloseButton();
}

function renderCulvertDetail(data = {}) {
    if (!culvertDetailContent) return;
    const asset = data.asset ?? {};
    const summary = data.summary ?? {};
    const kpis = [
        ["Fiziksel Boy", formatCulvertLength(summary.total_physical_length_m)],
        ["Tamamlanan Eşdeğer Boy", formatCulvertLength(summary.equivalent_completed_length_m)],
        ["İlerleme", formatCulvertPercent(summary.progress_percent)],
        ["Toplam Donatı", formatCulvertMetric(summary.total_rebar_quantity_kg, "kg")],
        ["Toplam Beton", formatCulvertMetric(summary.total_concrete_quantity_m3, "m³")],
        ["ANO", formatCulvertCount(summary.ano_count)],
        ["KANAT", formatCulvertCount(summary.kanat_count)]
    ];
    const info = [
        ["Kesim", asset.section],
        ["KM", formatCulvertKm(asset.km)],
        ["Ebat", formatCulvertDimensions(summary.width_m, summary.height_m)],
        ["Eğim", formatCulvertPercent(summary.slope_percent)]
    ];

    culvertDetailContent.innerHTML = `
        ${createCulvertHeader(asset)}
        <div class="tunnel-detail-scroll">
            <div class="tunnel-detail-tabs culvert-detail-tabs" role="tablist" aria-label="Menfez detay görünümleri">
                ${createCulvertTab("general", "Genel", true)}
                ${createCulvertTab("structures", "Yapısal İmalatlar")}
                ${createCulvertTab("other-works", "Diğer İmalatlar")}
            </div>
            <div class="tunnel-detail-tab-panel" data-culvert-panel="general" role="tabpanel">
                <section class="tunnel-detail-section">
                    <h3>İlerleme Özeti</h3>
                    ${createCulvertProgress("Menfez İlerlemesi", summary.progress_percent, `${formatCulvertLength(summary.equivalent_completed_length_m)} / ${formatCulvertLength(summary.total_physical_length_m)}`)}
                    <div class="tunnel-kpi-grid culvert-kpi-grid">${kpis.map(([label, value]) => createCulvertKpi(label, value)).join("")}</div>
                </section>
                <section class="tunnel-detail-section">
                    <h3>Temel Bilgiler</h3>
                    <dl class="tunnel-info-list">${info.map(([label, value]) => createCulvertInfo(label, value)).join("")}</dl>
                </section>
            </div>
            <div class="tunnel-detail-tab-panel" data-culvert-panel="structures" role="tabpanel" hidden>
                ${createCulvertState("Yapısal imalatlar sekme açıldığında yüklenir.")}
            </div>
            <div class="tunnel-detail-tab-panel" data-culvert-panel="other-works" role="tabpanel" hidden>
                ${createCulvertState("Diğer imalatlar sekme açıldığında yüklenir.")}
            </div>
        </div>`;
    bindCulvertCloseButton();
    bindCulvertTabs();
}

function createCulvertHeader(asset = {}) {
    return `<header class="tunnel-detail-header"><div class="tunnel-detail-heading">
        <span class="tunnel-detail-code">${escapeCulvertHtml(asset.asset_code || "Menfez")}</span>
        <h2 id="culvert-detail-title">${escapeCulvertHtml(asset.name || "Menfez Detayı")}</h2>
        ${hasCulvertValue(asset.section) ? `<span class="tunnel-detail-status">${escapeCulvertHtml(asset.section)}</span>` : ""}
    </div><button class="tunnel-detail-close" type="button" aria-label="Menfez detayını kapat">×</button></header>`;
}

function createCulvertTab(id, label, active = false) {
    return `<button class="tunnel-detail-tab${active ? " is-active" : ""}" type="button" role="tab" aria-selected="${active}" data-culvert-tab="${id}">${escapeCulvertHtml(label)}</button>`;
}

function createCulvertKpi(label, value) {
    return `<article class="tunnel-kpi-card"><span>${escapeCulvertHtml(label)}</span><strong>${escapeCulvertHtml(value)}</strong></article>`;
}

function createCulvertInfo(label, value) {
    return `<div class="tunnel-info-row"><dt>${escapeCulvertHtml(label)}</dt><dd>${escapeCulvertHtml(formatCulvertValue(value))}</dd></div>`;
}

function createCulvertProgress(label, percent, detail) {
    const value = clampCulvertPercent(percent);
    return `<div class="culvert-progress-item"><div class="viaduct-progress-heading"><div><strong>${escapeCulvertHtml(label)}</strong><span>${escapeCulvertHtml(detail)}</span></div><b>${escapeCulvertHtml(formatCulvertPercent(percent))}</b></div><div class="tunnel-progress-track" role="progressbar" aria-label="${escapeCulvertHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value ?? 0}"><span style="width:${value ?? 0}%"></span></div></div>`;
}

function bindCulvertCloseButton() {
    culvertDetailContent?.querySelector(".tunnel-detail-close")?.addEventListener("click", closeCulvertDetailDrawer);
}

function bindCulvertTabs() {
    culvertDetailContent?.querySelectorAll("[data-culvert-tab]").forEach((button) => {
        button.addEventListener("click", () => activateCulvertTab(button.dataset.culvertTab));
    });
}

function activateCulvertTab(tabId) {
    culvertDetailContent?.querySelectorAll("[data-culvert-tab]").forEach((tab) => {
        const active = tab.dataset.culvertTab === tabId;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
    });
    culvertDetailContent?.querySelectorAll("[data-culvert-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.culvertPanel !== tabId;
    });
    if (tabId === "structures") loadCulvertStructures();
    if (tabId === "other-works") loadCulvertOtherWorks();
}

async function loadCulvertStructures(force = false) {
    const assetId = activeCulvertAssetId;
    if (!Number.isFinite(assetId)) return;
    if (!force && culvertStructuresData) return renderCulvertStructures(culvertStructuresData);
    if (!force && culvertStructuresLoading) return;
    culvertStructuresLoading = true;
    renderCulvertPanel("structures", createCulvertLoading("Yapısal imalatlar yükleniyor..."));
    culvertStructuresController?.abort();
    culvertStructuresController = new AbortController();
    try {
        const response = await apiFetch(`${API_BASE_URL}/api/culverts/${encodeURIComponent(assetId)}/structures`, { signal: culvertStructuresController.signal });
        if (!response.ok) throw new Error(`API isteği başarısız: ${response.status}`);
        const data = await response.json();
        if (activeCulvertAssetId !== assetId) return;
        culvertStructuresData = data;
        renderCulvertStructures(data);
    } catch (error) {
        if (isAuthSessionError(error) || error.name === "AbortError" || activeCulvertAssetId !== assetId) return;
        console.error("Menfez yapısal imalatları yüklenemedi:", error);
        renderCulvertPanel("structures", createCulvertError("Yapısal imalatlar yüklenemedi.", "structures"));
        bindCulvertRetryButtons();
    } finally {
        if (activeCulvertAssetId === assetId) culvertStructuresLoading = false;
    }
}

function renderCulvertStructures(data = {}) {
    const structures = Array.isArray(data.structures) ? data.structures : [];
    if (!structures.length) return renderCulvertPanel("structures", createCulvertEmpty("Yapısal imalat kaydı bulunmuyor."));
    renderCulvertPanel("structures", `<div class="culvert-structure-list">${structures.map(createCulvertStructureCard).join("")}</div>`);
}

function createCulvertStructureCard(structure = {}) {
    const type = String(structure.structure_type || "").toUpperCase();
    const title = type === "ANO" ? `Ano ${formatCulvertValue(structure.sequence_no)}` : type === "KANAT" ? `Kanat ${formatCulvertValue(structure.sequence_no)}` : formatCulvertValue(structure.structure_type);
    const children = Array.isArray(structure.children) ? structure.children : [];
    return `<details class="culvert-structure-card"><summary><div><span>${escapeCulvertHtml(title)}</span><strong>${escapeCulvertHtml(formatCulvertPercent(structure.progress_percent))}</strong></div><small>${escapeCulvertHtml(formatCulvertLength(structure.equivalent_completed_length_m))} / ${escapeCulvertHtml(formatCulvertLength(structure.physical_length_m))}</small></summary><div class="culvert-structure-body">${createCulvertProgress("İlerleme", structure.progress_percent, "eşdeğer tamamlanan / fiziksel boy")}${children.length ? `<div class="culvert-element-list">${children.map(createCulvertElementCard).join("")}</div>` : createCulvertEmpty("Çocuk eleman kaydı bulunmuyor.")}</div></details>`;
}

function createCulvertElementCard(element = {}) {
    const title = CULVERT_ELEMENT_LABELS[element.element_type] ?? formatCulvertValue(element.element_type);
    const rows = [
        ["Tamamlanan Boy", formatCulvertLength(element.completed_length_m)],
        ["Donatı", formatCulvertMetric(element.rebar_quantity_kg, "kg")],
        ["Donatı Başlangıç", formatCulvertDate(element.rebar_start_date)],
        ["Donatı Bitiş", formatCulvertDate(element.rebar_end_date)],
        ["Beton", formatCulvertMetric(element.concrete_quantity_m3, "m³")],
        ["Beton Başlangıç", formatCulvertDate(element.concrete_start_date)],
        ["Beton Bitiş", formatCulvertDate(element.concrete_end_date)],
        ["Not", element.note]
    ].filter(([, value]) => hasCulvertValue(value) && value !== "-");
    return `<article class="culvert-element-card"><strong>${escapeCulvertHtml(title)}</strong>${rows.length ? `<dl>${rows.map(([label, value]) => `<div><dt>${escapeCulvertHtml(label)}</dt><dd>${escapeCulvertHtml(value)}</dd></div>`).join("")}</dl>` : "<span>Ek imalat detayı bulunmuyor.</span>"}</article>`;
}

async function loadCulvertOtherWorks(force = false) {
    const assetId = activeCulvertAssetId;
    if (!Number.isFinite(assetId)) return;
    if (!force && culvertOtherWorksData) return renderCulvertOtherWorks(culvertOtherWorksData);
    if (!force && culvertOtherWorksLoading) return;
    culvertOtherWorksLoading = true;
    renderCulvertPanel("other-works", createCulvertLoading("Diğer imalatlar yükleniyor..."));
    culvertOtherWorksController?.abort();
    culvertOtherWorksController = new AbortController();
    try {
        const response = await apiFetch(`${API_BASE_URL}/api/culverts/${encodeURIComponent(assetId)}/other-works`, { signal: culvertOtherWorksController.signal });
        if (!response.ok) throw new Error(`API isteği başarısız: ${response.status}`);
        const data = await response.json();
        if (activeCulvertAssetId !== assetId) return;
        culvertOtherWorksData = data;
        renderCulvertOtherWorks(data);
    } catch (error) {
        if (isAuthSessionError(error) || error.name === "AbortError" || activeCulvertAssetId !== assetId) return;
        console.error("Menfez diğer imalatları yüklenemedi:", error);
        renderCulvertPanel("other-works", createCulvertError("Diğer imalatlar yüklenemedi.", "other-works"));
        bindCulvertRetryButtons();
    } finally {
        if (activeCulvertAssetId === assetId) culvertOtherWorksLoading = false;
    }
}

function renderCulvertOtherWorks(data = {}) {
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) return renderCulvertPanel("other-works", createCulvertEmpty("Diğer imalat kaydı bulunmuyor."));
    renderCulvertPanel("other-works", `<div class="culvert-other-work-list">${items.map((item) => {
        const rows = [["Miktar", formatCulvertMetric(item.quantity, item.unit)], ["Durum", item.status], ["Başlangıç", formatCulvertDate(item.start_date)], ["Bitiş", formatCulvertDate(item.finish_date)]].filter(([, value]) => hasCulvertValue(value) && value !== "-");
        return `<article class="culvert-other-work-card"><header><strong>${escapeCulvertHtml(formatCulvertValue(item.work_label || item.work_type))}</strong>${hasCulvertValue(item.work_instance_no) ? `<span>#${escapeCulvertHtml(item.work_instance_no)}</span>` : ""}</header>${rows.length ? `<dl>${rows.map(([label, value]) => `<div><dt>${escapeCulvertHtml(label)}</dt><dd>${escapeCulvertHtml(value)}</dd></div>`).join("")}</dl>` : ""}</article>`;
    }).join("")}</div>`);
}

function renderCulvertPanel(id, html) {
    const panel = culvertDetailContent?.querySelector(`[data-culvert-panel="${id}"]`);
    if (panel) panel.innerHTML = html;
}

function createCulvertState(message) { return `<div class="tunnel-history-state">${escapeCulvertHtml(message)}</div>`; }
function createCulvertLoading(message) { return `<div class="tunnel-history-state"><span class="tunnel-detail-spinner" aria-hidden="true"></span><span>${escapeCulvertHtml(message)}</span></div>`; }
function createCulvertEmpty(message) { return `<div class="tunnel-faces-empty"><span>${escapeCulvertHtml(message)}</span></div>`; }
function createCulvertError(message, requestType) { return `<div class="tunnel-history-state tunnel-history-error"><span>${escapeCulvertHtml(message)}</span><button type="button" data-culvert-retry="${requestType}">Tekrar Dene</button></div>`; }
function bindCulvertRetryButtons() { culvertDetailContent?.querySelectorAll("[data-culvert-retry]").forEach((button) => button.addEventListener("click", () => button.dataset.culvertRetry === "structures" ? loadCulvertStructures(true) : loadCulvertOtherWorks(true))); }

function formatCulvertKm(value) { return typeof formatKilometer === "function" ? formatKilometer(value) ?? "-" : formatCulvertValue(value); }
function formatCulvertLength(value) { return typeof formatLength === "function" ? formatLength(value) ?? "-" : formatCulvertMetric(value, "m"); }
function formatCulvertCount(value) { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString("tr-TR") : "-"; }
function formatCulvertMetric(value, unit) { const n = Number(value); return Number.isFinite(n) ? `${n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}` : "-"; }
function formatCulvertPercent(value) { const n = Number(value); return Number.isFinite(n) ? `%${n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : "-"; }
function clampCulvertPercent(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; }
function formatCulvertDimensions(width, height) { return Number.isFinite(Number(width)) && Number.isFinite(Number(height)) ? `${Number(width).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} × ${Number(height).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m` : "-"; }
function formatCulvertDate(value) { if (!hasCulvertValue(value)) return "-"; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("tr-TR"); }
function formatCulvertValue(value) { return hasCulvertValue(value) ? String(value) : "-"; }
function hasCulvertValue(value) { return value !== null && value !== undefined && value !== ""; }
function escapeCulvertHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

window.openCulvertDetail = loadCulvertDetail;
window.closeCulvertDetailDrawer = closeCulvertDetailDrawer;
