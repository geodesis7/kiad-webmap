"use strict";

const CUT_COVER_COMPONENT_LABELS = Object.freeze({
    FOUNDATION: "Temel",
    LEFT_WALL: "Sol Perde",
    RIGHT_WALL: "Sağ Perde",
    TOP_SLAB: "Üst Döşeme"
});

const CUT_COVER_WORK_LABELS = Object.freeze({
    LEAN_CONCRETE: "Grobeton",
    INSULATION: "İzolasyon",
    BITUMEN_COATING: "Katran Badana",
    CUSHION_CONCRETE: "Yastık Betonu",
    DRAINAGE_PROTECTION_CONCRETE: "Drenaj Koruma Betonu",
    WALKWAY: "Yürüme Yolu"
});

let cutCoverDrawer = null;
let cutCoverContent = null;
let activeCutCoverAssetId = null;
let cutCoverSummary = null;
let cutCoverDetails = null;
let cutCoverSummaryController = null;
let cutCoverDetailsController = null;
let cutCoverDetailsLoading = false;
let cutCoverPopupItemsById = new Map();
let cutCoverPopupItemsPromise = null;
let cutCoverPopupItemsLoaded = false;

window.addEventListener("kiad:cut-cover-dashboard-data", (event) => {
    setCutCoverPopupItems(event.detail?.items);
});

window.addEventListener("kiad:cut-cover-detail-open", (event) => {
    openCutCoverDetail(event.detail?.assetId);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isCutCoverDrawerOpen()) closeCutCoverDetailDrawer();
});

function ensureCutCoverDrawer() {
    if (cutCoverDrawer) return;
    cutCoverDrawer = document.createElement("aside");
    cutCoverDrawer.id = "cut-cover-detail-drawer";
    cutCoverDrawer.className = "tunnel-detail-drawer cut-cover-detail-drawer";
    cutCoverDrawer.setAttribute("aria-labelledby", "cut-cover-detail-title");
    cutCoverDrawer.setAttribute("aria-hidden", "true");
    cutCoverDrawer.hidden = true;
    cutCoverDrawer.innerHTML = '<div id="cut-cover-detail-content" class="tunnel-detail-content cut-cover-detail-content" aria-live="polite"></div>';
    document.body.append(cutCoverDrawer);
    cutCoverContent = cutCoverDrawer.querySelector("#cut-cover-detail-content");
}

async function openCutCoverDetail(assetId) {
    const normalizedAssetId = Number(assetId);
    if (!Number.isSafeInteger(normalizedAssetId)) return;
    ensureCutCoverDrawer();
    window.closeAllDetailDrawers?.("cut-cover");
    if (normalizedAssetId === activeCutCoverAssetId && isCutCoverDrawerOpen()) return;

    resetCutCoverSession(normalizedAssetId);
    cutCoverDrawer.hidden = false;
    cutCoverDrawer.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(() => cutCoverDrawer?.classList.add("is-open"));
    renderCutCoverLoading();
    cutCoverSummaryController = new AbortController();

    try {
        const response = await apiFetch(`${API_BASE_URL}/api/cut-covers/${encodeURIComponent(normalizedAssetId)}/summary`, {
            signal: cutCoverSummaryController.signal
        });
        if (!response.ok) throw new Error(`API isteği başarısız: ${response.status}`);
        const data = await response.json();
        if (activeCutCoverAssetId !== normalizedAssetId) return;
        cutCoverSummary = data;
        renderCutCoverDetail(data);
    } catch (error) {
        if (isAuthSessionError(error) || error.name === "AbortError" || activeCutCoverAssetId !== normalizedAssetId) return;
        console.error("Aç-kapa detayı yüklenemedi:", error);
        renderCutCoverError();
    }
}

function resetCutCoverSession(assetId = null) {
    cutCoverSummaryController?.abort();
    cutCoverDetailsController?.abort();
    activeCutCoverAssetId = assetId;
    cutCoverSummary = null;
    cutCoverDetails = null;
    cutCoverDetailsLoading = false;
}

function closeCutCoverDetailDrawer() {
    if (!cutCoverDrawer) return;
    resetCutCoverSession();
    cutCoverDrawer.classList.remove("is-open");
    cutCoverDrawer.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
        if (!cutCoverDrawer?.classList.contains("is-open")) {
            cutCoverDrawer.hidden = true;
            if (cutCoverContent) cutCoverContent.innerHTML = "";
        }
    }, 260);
}

function isCutCoverDrawerOpen() {
    return Boolean(cutCoverDrawer && !cutCoverDrawer.hidden && cutCoverDrawer.classList.contains("is-open"));
}

function setCutCoverPopupItems(items) {
    if (!Array.isArray(items)) return;
    cutCoverPopupItemsById = new Map(items.map((item) => [Number(item.asset_id), item]));
    cutCoverPopupItemsLoaded = true;
}

async function getCutCoverPopupItem(assetId) {
    const normalizedAssetId = Number(assetId);
    if (!Number.isSafeInteger(normalizedAssetId)) return null;
    if (cutCoverPopupItemsById.has(normalizedAssetId)) return cutCoverPopupItemsById.get(normalizedAssetId);
    if (cutCoverPopupItemsLoaded) return null;

    if (!cutCoverPopupItemsPromise) {
        cutCoverPopupItemsPromise = apiFetch(`${window.KIAD_API_BASE_URL ?? ""}/api/cut-covers`)
            .then((response) => {
                if (!response.ok) throw new Error(`API isteği başarısız: ${response.status}`);
                return response.json();
            })
            .then((data) => {
                setCutCoverPopupItems(data.cut_covers);
                return cutCoverPopupItemsById;
            })
            .finally(() => {
                cutCoverPopupItemsPromise = null;
            });
    }

    const itemsById = await cutCoverPopupItemsPromise;
    return itemsById.get(normalizedAssetId) ?? null;
}

function renderCutCoverLoading() {
    renderCutCoverShell({ asset_code: "Aç-Kapa", name: "Yükleniyor..." }, '<div class="tunnel-detail-state"><span class="tunnel-detail-spinner" aria-hidden="true"></span><span>Aç-kapa bilgileri yükleniyor...</span></div>');
}

function renderCutCoverError() {
    renderCutCoverShell({ asset_code: "Aç-Kapa", name: "Bilgiler alınamadı" }, '<div class="tunnel-detail-state tunnel-detail-state-error">Aç-kapa bilgileri şu anda yüklenemiyor.</div>');
}

function renderCutCoverShell(asset, body) {
    if (!cutCoverContent) return;
    cutCoverContent.innerHTML = `${createCutCoverHeader(asset)}${body}`;
    bindCutCoverClose();
}

function renderCutCoverDetail(data = {}) {
    const asset = data.asset ?? {};
    const ready = asset.data_ready === true;
    const percent = asset.structural_progress_percent;
    const activityNote = ready && percent === 0 && asset.status === "UNKNOWN" && asset.latest_activity_date
        ? "Diğer imalatlarda faaliyet mevcut"
        : null;
    const infoRows = [
        ["Kesim", asset.section_code || asset.section_name],
        ["Başlangıç KM", asset.km_start],
        ["Bitiş KM", asset.km_end],
        ["Uzunluk", asset.length],
        ["Son Aktivite", asset.latest_activity_date]
    ].filter(([, value]) => value !== null && value !== undefined && value !== "");

    cutCoverContent.innerHTML = `
        ${createCutCoverHeader(asset)}
        <div class="tunnel-detail-scroll">
            <div class="tunnel-detail-tabs cut-cover-tabs" role="tablist" aria-label="Aç-kapa detay görünümleri">
                ${createCutCoverTab("general", "Genel", true)}
                ${createCutCoverTab("segments", "Ano ve Bileşenler")}
                ${createCutCoverTab("other-works", "Diğer İmalatlar")}
            </div>
            <div class="tunnel-detail-tab-panel" data-cut-cover-panel="general" role="tabpanel">
                <section class="tunnel-detail-section">
                    <h3>İlerleme Özeti</h3>
                    ${ready && percent !== null && percent !== undefined ? createCutCoverProgress("Betonarme İlerlemesi", percent) : `<div class="cut-cover-neutral-state">${ready ? "Betonarme ilerleme değeri bildirilmedi." : "Henüz operasyonel takip verisi yok."}</div>`}
                    ${activityNote ? `<p class="cut-cover-muted-note">${escapeCutCoverHtml(activityNote)} · ${escapeCutCoverHtml(cutCoverDate(asset.latest_activity_date))}</p>` : ""}
                    ${ready ? `<div class="cut-cover-counts"><span>${escapeCutCoverHtml(cutCoverCount(data.segment_count))} Ano</span><span>${escapeCutCoverHtml(cutCoverCount(data.component_count))} bileşen</span><span>${escapeCutCoverHtml(cutCoverCount(data.other_work_count))} diğer imalat</span></div>` : ""}
                </section>
                <section class="tunnel-detail-section"><h3>Temel Bilgiler</h3><dl class="tunnel-info-list">${infoRows.map(([label, value]) => createCutCoverInfo(label, value)).join("")}</dl></section>
            </div>
            <div class="tunnel-detail-tab-panel" data-cut-cover-panel="segments" role="tabpanel" hidden><div class="tunnel-history-state">Ano ve bileşen ayrıntıları sekme açıldığında yüklenir.</div></div>
            <div class="tunnel-detail-tab-panel" data-cut-cover-panel="other-works" role="tabpanel" hidden><div class="tunnel-history-state">Diğer imalatlar sekme açıldığında yüklenir.</div></div>
        </div>`;
    bindCutCoverClose();
    bindCutCoverTabs();
}

function createCutCoverHeader(asset = {}) {
    const section = asset.section_code || asset.section_name;
    return `<header class="tunnel-detail-header"><div class="tunnel-detail-heading"><span class="tunnel-detail-code">${escapeCutCoverHtml(cutCoverValue(asset.asset_code, "Aç-Kapa"))}</span><h2 id="cut-cover-detail-title">${escapeCutCoverHtml(cutCoverValue(asset.name, "Aç-Kapa Detayı"))}</h2>${section ? `<span class="tunnel-detail-status">${escapeCutCoverHtml(section)}</span>` : ""}</div><button class="tunnel-detail-close" type="button" aria-label="Aç-kapa detayını kapat">×</button></header>`;
}

function createCutCoverTab(id, label, active = false) {
    return `<button class="tunnel-detail-tab${active ? " is-active" : ""}" type="button" role="tab" aria-selected="${active}" data-cut-cover-tab="${id}">${escapeCutCoverHtml(label)}</button>`;
}

function createCutCoverProgress(label, percent, note = null) {
    const numeric = Number(percent);
    const clamped = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : null;
    return `<div class="cut-cover-progress"><div><strong>${escapeCutCoverHtml(label)}</strong><b>${escapeCutCoverHtml(cutCoverPercent(percent))}</b></div><div class="tunnel-progress-track" role="progressbar" aria-label="${escapeCutCoverHtml(label)}" aria-valuemin="0" aria-valuemax="100"${clamped === null ? "" : ` aria-valuenow="${clamped}"`}><span style="width:${clamped ?? 0}%"></span></div>${note ? `<small>${escapeCutCoverHtml(note)}</small>` : ""}</div>`;
}

function createCutCoverInfo(label, value) {
    return `<div class="tunnel-info-row"><dt>${escapeCutCoverHtml(label)}</dt><dd>${escapeCutCoverHtml(cutCoverFormatInfo(label, value))}</dd></div>`;
}

function cutCoverFormatInfo(label, value) {
    if (label.includes("KM")) return typeof formatKilometer === "function" ? (formatKilometer(value) ?? "—") : cutCoverValue(value);
    if (label === "Uzunluk") return typeof formatLength === "function" ? (formatLength(value) ?? "—") : `${cutCoverNumber(value)} m`;
    if (label === "Son Aktivite") return cutCoverDate(value);
    return cutCoverValue(value);
}

function bindCutCoverClose() {
    cutCoverContent?.querySelector(".tunnel-detail-close")?.addEventListener("click", closeCutCoverDetailDrawer);
}

function bindCutCoverTabs() {
    cutCoverContent?.querySelectorAll("[data-cut-cover-tab]").forEach((button) => button.addEventListener("click", () => activateCutCoverTab(button.dataset.cutCoverTab)));
}

function activateCutCoverTab(tabId) {
    cutCoverContent?.querySelectorAll("[data-cut-cover-tab]").forEach((tab) => {
        const active = tab.dataset.cutCoverTab === tabId;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
    });
    cutCoverContent?.querySelectorAll("[data-cut-cover-panel]").forEach((panel) => { panel.hidden = panel.dataset.cutCoverPanel !== tabId; });
    if (tabId === "segments" || tabId === "other-works") loadCutCoverDetails();
}

async function loadCutCoverDetails(force = false) {
    const assetId = activeCutCoverAssetId;
    if (!Number.isSafeInteger(assetId)) return;
    if (!force && cutCoverDetails) return renderCutCoverDetails(cutCoverDetails);
    if (!force && cutCoverDetailsLoading) return;
    cutCoverDetailsLoading = true;
    renderCutCoverPanel("segments", createCutCoverState("Ano ve bileşen ayrıntıları yükleniyor...", true));
    renderCutCoverPanel("other-works", createCutCoverState("Diğer imalatlar yükleniyor...", true));
    cutCoverDetailsController?.abort();
    cutCoverDetailsController = new AbortController();
    try {
        const response = await apiFetch(`${API_BASE_URL}/api/cut-covers/${encodeURIComponent(assetId)}/details`, { signal: cutCoverDetailsController.signal });
        if (!response.ok) throw new Error(`API isteği başarısız: ${response.status}`);
        const data = await response.json();
        if (activeCutCoverAssetId !== assetId) return;
        cutCoverDetails = data;
        renderCutCoverDetails(data);
    } catch (error) {
        if (isAuthSessionError(error) || error.name === "AbortError" || activeCutCoverAssetId !== assetId) return;
        console.error("Aç-kapa detay imalatları yüklenemedi:", error);
        renderCutCoverPanel("segments", createCutCoverState("Ano ve bileşen bilgileri yüklenemedi.", false, "segments"));
        renderCutCoverPanel("other-works", createCutCoverState("Diğer imalatlar yüklenemedi.", false, "other-works"));
        bindCutCoverRetry();
    } finally {
        if (activeCutCoverAssetId === assetId) cutCoverDetailsLoading = false;
    }
}

function renderCutCoverDetails(data = {}) {
    const segments = Array.isArray(data.segments) ? data.segments : [];
    const otherWorks = Array.isArray(data.other_works) ? data.other_works : [];
    renderCutCoverPanel("segments", segments.length ? `<div class="cut-cover-segment-list">${segments.map(createCutCoverSegment).join("")}</div>` : createCutCoverEmpty("Ano / bileşen kaydı bulunmuyor."));
    renderCutCoverPanel("other-works", otherWorks.length ? createCutCoverOtherWorks(otherWorks) : createCutCoverEmpty("Diğer imalat kaydı bulunmuyor."));
}

function createCutCoverSegment(segment = {}) {
    const components = Array.isArray(segment.components) ? segment.components : [];
    const length = segment.segment_length_m == null ? null : (typeof formatLength === "function" ? formatLength(segment.segment_length_m) : `${cutCoverNumber(segment.segment_length_m)} m`);
    return `<details class="cut-cover-segment"><summary><span><strong>${escapeCutCoverHtml(cutCoverValue(segment.ano_code))}</strong>${segment.source_label ? `<small>${escapeCutCoverHtml(segment.source_label)}</small>` : ""}</span><b>${escapeCutCoverHtml(length ?? "—")}</b></summary><div class="cut-cover-segment-body">${components.length ? components.map(createCutCoverComponent).join("") : `<p class="cut-cover-muted-note">Bu Ano için bileşen kaydı bulunmuyor.</p>`}</div></details>`;
}

function createCutCoverComponent(component = {}) {
    const label = CUT_COVER_COMPONENT_LABELS[component.component_type] || humanizeCutCoverEnum(component.component_type);
    const rows = [
        ["Tamamlanan Boy", cutCoverLength(component.completed_length_m)],
        ["Planlanan Boy", cutCoverLength(component.planned_length_m)],
        ["Donatı", cutCoverQuantity(component.reinforcement_quantity, "kg")],
        ["Beton", cutCoverQuantity(component.concrete_quantity, "m³")],
        ["Donatı Tarihleri", cutCoverDateRange(component.reinforcement_start_date, component.reinforcement_finish_date)],
        ["Beton Tarihleri", cutCoverDateRange(component.concrete_start_date, component.concrete_finish_date)],
        ["Durum", cutCoverStatus(component.status)],
        ["Son Aktivite", cutCoverDate(component.last_activity_date)]
    ].filter(([, value]) => value !== null);
    return `<article class="cut-cover-component"><header><strong>${escapeCutCoverHtml(label)}</strong>${component.status ? `<span>${escapeCutCoverHtml(cutCoverStatus(component.status))}</span>` : ""}</header>${rows.length ? `<dl>${rows.filter(([name]) => name !== "Durum").map(([name, value]) => `<div><dt>${escapeCutCoverHtml(name)}</dt><dd>${escapeCutCoverHtml(value)}</dd></div>`).join("")}</dl>` : `<small>Ek imalat detayı bulunmuyor.</small>`}</article>`;
}

function createCutCoverOtherWorks(items) {
    const grouped = new Map();
    items.forEach((item) => {
        const key = item.work_type || "OTHER";
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(item);
    });
    return `<div class="cut-cover-work-groups">${[...grouped.entries()].map(([type, rows]) => `<details class="cut-cover-work-group"><summary><strong>${escapeCutCoverHtml(CUT_COVER_WORK_LABELS[type] || humanizeCutCoverEnum(type))}</strong><span>${escapeCutCoverHtml(cutCoverCount(rows.length))} kayıt</span></summary><div class="cut-cover-work-table-wrap"><table class="cut-cover-work-table"><thead><tr><th>Konum</th><th>Yön</th><th>Miktar / Boy</th><th>Durum</th><th>Son Aktivite</th></tr></thead><tbody>${rows.map(createCutCoverWorkRow).join("")}</tbody></table></div></details>`).join("")}</div>`;
}

function createCutCoverWorkRow(item = {}) {
    const quantity = item.quantity != null ? cutCoverQuantity(item.quantity, null) : cutCoverLength(item.completed_length_m);
    return `<tr><td>${escapeCutCoverHtml(cutCoverValue(item.source_segment_label))}</td><td>${escapeCutCoverHtml(cutCoverDirection(item.side_direction))}</td><td>${escapeCutCoverHtml(quantity ?? "—")}</td><td>${escapeCutCoverHtml(cutCoverStatus(item.status))}</td><td>${escapeCutCoverHtml(cutCoverDate(item.last_activity_date))}</td></tr>`;
}

function renderCutCoverPanel(id, html) {
    const panel = cutCoverContent?.querySelector(`[data-cut-cover-panel="${id}"]`);
    if (panel) panel.innerHTML = html;
}

function createCutCoverState(message, loading, retryTab = null) {
    return `<div class="tunnel-history-state">${loading ? '<span class="tunnel-detail-spinner" aria-hidden="true"></span>' : ""}<span>${escapeCutCoverHtml(message)}</span>${retryTab ? `<button type="button" data-cut-cover-retry="${retryTab}">Tekrar Dene</button>` : ""}</div>`;
}

function createCutCoverEmpty(message) { return `<div class="tunnel-faces-empty"><span>${escapeCutCoverHtml(message)}</span></div>`; }

function bindCutCoverRetry() {
    cutCoverContent?.querySelectorAll("[data-cut-cover-retry]").forEach((button) => button.addEventListener("click", () => loadCutCoverDetails(true)));
}

function cutCoverLength(value) {
    if (value === null || value === undefined || value === "") return null;
    return typeof formatLength === "function" ? formatLength(value) : `${cutCoverNumber(value)} m`;
}

function cutCoverQuantity(value, unit) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return `${number.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
}

function cutCoverPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? (typeof formatPercent === "function" ? formatPercent(number, 2) : `%${number.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`) : "—";
}

function cutCoverDate(value) {
    if (value === null || value === undefined || value === "") return "—";
    return typeof formatPopupDate === "function" ? formatPopupDate(value) : String(value);
}

function cutCoverDateRange(start, end) {
    if (!start && !end) return null;
    if (start && end) return `${cutCoverDate(start)} – ${cutCoverDate(end)}`;
    return cutCoverDate(start || end);
}

function cutCoverStatus(value) {
    const labels = { COMPLETED: "Tamamlandı", IN_PROGRESS: "Devam Ediyor", NOT_STARTED: "Başlamadı", UNKNOWN: "Belirsiz" };
    return value ? (labels[value] || humanizeCutCoverEnum(value)) : "—";
}

function cutCoverDirection(value) {
    const directions = { LEFT: "Sol", RIGHT: "Sağ", BOTH: "İki taraf", CENTER: "Orta" };
    if (!value) return "—";
    const normalized = String(value).toUpperCase();
    return directions[normalized] || humanizeCutCoverEnum(value);
}

function humanizeCutCoverEnum(value) {
    return String(value || "").toLocaleLowerCase("tr-TR").replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase("tr-TR"));
}

function cutCoverCount(value) {
    const number = Number(value);
    return value === null || value === undefined || value === "" || !Number.isFinite(number) ? "0" : number.toLocaleString("tr-TR");
}

function cutCoverNumber(value) {
    return Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

function cutCoverValue(value, fallback = "—") { return value === null || value === undefined || value === "" ? fallback : String(value); }
function escapeCutCoverHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

window.openCutCoverDetail = openCutCoverDetail;
window.openCutCoverDetailDrawer = (assetId) => window.dispatchEvent(new CustomEvent("kiad:cut-cover-detail-open", { detail: { assetId: Number(assetId) } }));
window.closeCutCoverDetailDrawer = closeCutCoverDetailDrawer;
window.getCutCoverPopupItem = getCutCoverPopupItem;
