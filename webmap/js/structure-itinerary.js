"use strict";

const itineraryView = document.getElementById("structure-itinerary-view");
const itineraryContent = document.getElementById("structure-itinerary-content");
const ITINERARY_COMPONENT_ORDER = Object.freeze([
    "PILE_GROUP", "FOUNDATION", "ELEVATION_BODY", "CAP", "BEARING_BLOCK", "GIRDER_GROUP"
]);
const ITINERARY_HIDDEN_COMPONENT_TYPES = new Set(["PIER_STAGE"]);
const ITINERARY_STATUS_LABELS = Object.freeze({
    UNKNOWN: "Bilinmiyor", NOT_STARTED: "Başlanmadı", IN_PROGRESS: "Devam ediyor",
    COMPLETED: "Tamamlandı", BLOCKED: "Blokeli", NOT_APPLICABLE: "Uygulanmaz"
});

let itineraryAssetId = null;
let itineraryData = null;
let itineraryController = null;
let itineraryZoom = 1;
let itineraryHistoryOpen = false;

window.addEventListener("popstate", () => {
    if (isStructureItineraryOpen()) closeStructureItinerary({ fromHistory: true });
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isStructureItineraryOpen()) closeStructureItinerary();
});

async function openStructureItinerary(assetId) {
    const normalizedId = Number(assetId);
    if (!Number.isFinite(normalizedId) || !itineraryView || !itineraryContent) return;

    itineraryController?.abort();
    itineraryAssetId = normalizedId;
    itineraryData = null;
    itineraryZoom = 1;
    showStructureItinerary();
    renderItineraryLoading();
    pushItineraryHistory(normalizedId);
    itineraryController = new AbortController();

    try {
        const response = await apiFetch(
            `${API_BASE_URL}/api/viaducts/${encodeURIComponent(normalizedId)}/itinerary`,
            { signal: itineraryController.signal }
        );
        if (!response.ok) throw new Error(`API isteği başarısız: ${response.status}`);

        const data = await response.json();
        if (itineraryAssetId !== normalizedId) return;
        itineraryData = normalizeItineraryData(data);
        renderStructureItinerary(itineraryData);
    } catch (error) {
        if (isAuthSessionError(error) || error.name === "AbortError" || itineraryAssetId !== normalizedId) return;
        renderItineraryError(error);
    }
}

function closeStructureItinerary({ fromHistory = false } = {}) {
    if (!itineraryView) return;
    itineraryController?.abort();
    itineraryController = null;
    itineraryAssetId = null;
    itineraryData = null;
    itineraryView.classList.remove("is-open");
    itineraryView.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
        if (!itineraryView.classList.contains("is-open")) {
            itineraryView.hidden = true;
            itineraryContent.innerHTML = "";
        }
    }, 180);
    if (!fromHistory && itineraryHistoryOpen && history.state?.kiadView === "structure-itinerary") history.back();
    itineraryHistoryOpen = false;
}

function isStructureItineraryOpen() {
    return Boolean(itineraryView && !itineraryView.hidden && itineraryView.classList.contains("is-open"));
}

function showStructureItinerary() {
    itineraryView.hidden = false;
    itineraryView.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => itineraryView.classList.add("is-open"));
}

function pushItineraryHistory(assetId) {
    if (history.state?.kiadView === "structure-itinerary") return;
    history.pushState({ kiadView: "structure-itinerary", assetId }, "");
    itineraryHistoryOpen = true;
}

function normalizeItineraryData(source = {}) {
    const structure = source.structure ?? source.asset ?? {};
    const supports = Array.isArray(source.supports) ? source.supports : [];
    const spans = Array.isArray(source.spans) ? source.spans : [];
    return {
        structure,
        supports: [...supports].sort((a, b) => Number(a.order) - Number(b.order)),
        spans: [...spans].sort((a, b) => Number(a.order) - Number(b.order)),
        quality: source.data_quality?.warnings ?? source.quality ?? source.quality_summary ?? [],
        dataAsOf: source.data_as_of ?? structure.data_as_of ?? null
    };
}

function renderItineraryLoading() {
    itineraryContent.innerHTML = `${createItineraryHeader({ asset_code: "Viyadük", name: "İlerleme İtinereri" })}
        <div class="itinerary-state"><span class="tunnel-detail-spinner" aria-hidden="true"></span><span>İtinerer yükleniyor...</span></div>`;
    bindItineraryControls();
}

function renderItineraryError(error) {
    const unavailable = /404/.test(String(error?.message));
    itineraryContent.innerHTML = `${createItineraryHeader({ asset_code: "Viyadük", name: "İlerleme İtinereri" })}
        <div class="itinerary-state itinerary-state-error">
            <strong>${unavailable ? "İtinerer verisi henüz yayımlanmadı" : "İtinerer verisi alınamadı"}</strong>
            <span>${unavailable
                ? "Canonical structure itinerary API erişime açıldığında bu görünüm gerçek veriyi otomatik kullanacaktır."
                : "Bağlantıyı kontrol edip tekrar deneyin."}</span>
            <button type="button" data-itinerary-retry>Yeniden dene</button>
        </div>`;
    bindItineraryControls();
    itineraryContent.querySelector("[data-itinerary-retry]")?.addEventListener("click", () => openStructureItinerary(itineraryAssetId));
}

function renderStructureItinerary(data) {
    const { structure, supports, spans } = data;
    if (!supports.length) {
        itineraryContent.innerHTML = `${createItineraryHeader(structure)}<div class="itinerary-state"><strong>Yapı verisi bulunmuyor</strong><span>Canonical itinerary projection destek kaydı döndürmedi.</span></div>`;
        bindItineraryControls();
        return;
    }
    itineraryContent.innerHTML = `
        ${createItineraryHeader(structure)}
        <div class="itinerary-toolbar" aria-label="İtinerer araçları">
            <button type="button" data-itinerary-action="fit">Yapıya Sığdır</button>
            <button type="button" data-itinerary-action="zoom-out" aria-label="Uzaklaştır">−</button>
            <button type="button" data-itinerary-action="zoom-in" aria-label="Yakınlaştır">+</button>
            <label>Support'a git <select data-itinerary-support>${supports.map(s => `<option value="${escapeItinerary(s.id)}">${escapeItinerary(s.code)}</option>`).join("")}</select></label>
            ${createProvisionalIndicator(structure, data)}
        </div>
        <div class="itinerary-main">
            <div class="itinerary-canvas" tabindex="0" aria-label="Yapı support ve span ekseni">
                <div class="itinerary-stage" data-itinerary-stage>${createItinerarySvg(supports, spans)}</div>
            </div>
            <aside class="itinerary-detail" aria-live="polite" data-itinerary-detail>${createStructureDetail(structure, data)}</aside>
        </div>`;
    bindItineraryControls();
    bindItinerarySelections(data);
    bindItineraryPan();
}

function createItineraryHeader(structure = {}) {
    const code = structure.asset_code ?? structure.structure_code ?? "Viyadük";
    const name = structure.name ?? "İlerleme İtinereri";
    return `<header class="itinerary-header"><div><span>${escapeItinerary(code)}</span><h2>${escapeItinerary(name)} — İlerleme İtinereri</h2></div><button type="button" class="itinerary-close" aria-label="İtinereri kapat">×</button></header>`;
}

function createProvisionalIndicator(structure, data) {
    const design = structure.design ?? data.design ?? {};
    const version = design.version ?? structure.design_version;
    const state = design.state ?? structure.design_state;
    if (!version && !state) return "";
    return `<button type="button" class="itinerary-provisional" data-itinerary-metadata title="Tasarım bilgisi">Geçici Tasarım Modeli</button>`;
}

function createItinerarySvg(supports, spans) {
    const spacing = 132;
    const width = Math.max(760, (supports.length - 1) * spacing + 160);
    const axisY = 160;
    const byId = new Map(supports.map((support, index) => [String(support.id), { support, index }]));
    return `<svg class="itinerary-svg" viewBox="0 0 ${width} 340" role="img" aria-label="Yapı itinereiri">
        <line class="itinerary-axis" x1="80" y1="${axisY}" x2="${width - 80}" y2="${axisY}" />
        ${spans.map((span, index) => createSpanSvg(span, index, supports, byId, spacing, axisY)).join("")}
        ${supports.map((support, index) => createSupportSvg(support, index, spacing, axisY)).join("")}
    </svg>`;
}

function createSpanSvg(span, index, supports, byId, spacing, axisY) {
    const from = byId.get(String(span.from_support_id));
    const to = byId.get(String(span.to_support_id));
    const start = from ? 80 + from.index * spacing : 80 + index * spacing;
    const end = to ? 80 + to.index * spacing : start + spacing;
    const component = orderComponents(span.components).find(c => c.type === "GIRDER_GROUP") ?? orderComponents(span.components)[0];
    const accessibleLabel = `${span.code ?? "Span"}: ${component?.type ?? "bileşen"} ${statusLabel(component?.status)}`;
    return `<g class="itinerary-span" tabindex="0" role="button" data-itinerary-component="${escapeItinerary(component?.id ?? "")}" aria-label="${escapeItinerary(accessibleLabel)}">
        <path d="M ${start + 14} ${axisY - 12} Q ${(start + end) / 2} ${axisY - 72} ${end - 14} ${axisY - 12}" class="itinerary-span-arc ${statusClass(component?.status)}" />
        <text x="${(start + end) / 2}" y="${axisY - 54}" class="itinerary-span-label">${escapeItinerary(span.code ?? "Span")}</text>
    </g>`;
}

function createSupportSvg(support, index, spacing, axisY) {
    const x = 80 + index * spacing;
    const type = String(support.type ?? support.support_type ?? "OTHER").toUpperCase();
    const height = Number(support.visual_height) > 0 ? Number(support.visual_height) : 98;
    const components = orderComponents(support.components);
    return `<g class="itinerary-support is-${type.toLowerCase()}" tabindex="0" role="button" data-itinerary-support-id="${escapeItinerary(support.id)}" aria-label="${escapeItinerary(`${support.code} ${type}`)}">
        <title>${escapeItinerary(`${support.code} · ${type}`)}</title>
        <path d="M ${x - 27} ${axisY + 130} L ${x - 19} ${axisY + height} L ${x + 19} ${axisY + height} L ${x + 27} ${axisY + 130} Z" class="itinerary-support-body" />
        <line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + height}" class="itinerary-support-stem" />
        <text x="${x}" y="${axisY + 153}" class="itinerary-support-label">${escapeItinerary(support.code)}</text>
        ${components.map((component, componentIndex) => createComponentSvg(component, x, getComponentY(component, axisY, componentIndex), support.code)).join("")}
    </g>`;
}

function getComponentY(component, axisY, fallbackIndex) {
    const positions = {
        CAP: axisY - 28,
        BEARING_BLOCK: axisY - 8,
        ELEVATION_BODY: axisY + 34,
        FOUNDATION: axisY + 86,
        PILE_GROUP: axisY + 114
    };
    return positions[component.type ?? component.component_type] ?? axisY + 14 + fallbackIndex * 22;
}

function createComponentSvg(component, x, y, supportCode) {
    const type = component.type ?? component.component_type ?? "OTHER";
    const accessibleLabel = `${supportCode} ${type}: ${statusLabel(component.status)}`;
    return `<g class="itinerary-component ${statusClass(component.status)} ${qualityClass(component.quality)}" tabindex="0" role="button" data-itinerary-component="${escapeItinerary(component.id)}" aria-label="${escapeItinerary(accessibleLabel)}">
        <rect x="${x - 48}" y="${y}" width="96" height="15" rx="3" />
        <text x="${x}" y="${y + 11}" class="itinerary-component-label">${escapeItinerary(component.label ?? component.type ?? "Bileşen")}</text>
    </g>`;
}

function orderComponents(components) {
    return (Array.isArray(components) ? [...components] : [])
        .filter(component => !ITINERARY_HIDDEN_COMPONENT_TYPES.has(component.type ?? component.component_type))
        .sort((left, right) => {
        const leftOrder = Number(left.design_order);
        const rightOrder = Number(right.design_order);
        if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder)) return leftOrder - rightOrder;
        return ITINERARY_COMPONENT_ORDER.indexOf(left.type ?? left.component_type) - ITINERARY_COMPONENT_ORDER.indexOf(right.type ?? right.component_type);
        });
}

function bindItineraryControls() {
    itineraryContent.querySelector(".itinerary-close")?.addEventListener("click", () => closeStructureItinerary());
    itineraryContent.querySelectorAll("[data-itinerary-action]").forEach(button => button.addEventListener("click", () => {
        const action = button.dataset.itineraryAction;
        if (action === "fit") itineraryZoom = 1;
        if (action === "zoom-in") itineraryZoom = Math.min(2.5, itineraryZoom + .2);
        if (action === "zoom-out") itineraryZoom = Math.max(.7, itineraryZoom - .2);
        applyItineraryZoom();
    }));
    itineraryContent.querySelector("[data-itinerary-support]")?.addEventListener("change", event => selectItinerarySupport(event.target.value));
    itineraryContent.querySelector("[data-itinerary-metadata]")?.addEventListener("click", () => renderItineraryMetadata());
}

function bindItinerarySelections(data) {
    itineraryContent.querySelectorAll("[data-itinerary-support-id]").forEach(node => {
        node.addEventListener("click", () => selectItinerarySupport(node.dataset.itinerarySupportId));
        node.addEventListener("keydown", (event) => activateItineraryKeyboard(event, () => selectItinerarySupport(node.dataset.itinerarySupportId)));
    });
    const allComponents = [...data.supports, ...data.spans].flatMap(item => orderComponents(item.components));
    const byId = new Map(allComponents.map(component => [String(component.id), component]));
    itineraryContent.querySelectorAll("[data-itinerary-component]").forEach(node => {
        const activate = event => { event?.stopPropagation(); selectItineraryComponent(byId.get(String(node.dataset.itineraryComponent))); };
        node.addEventListener("click", activate);
        node.addEventListener("keydown", event => activateItineraryKeyboard(event, () => activate(event)));
    });
    itineraryContent.querySelectorAll("[data-detail-component]").forEach(node => node.addEventListener("click", () => {
        selectItineraryComponent(byId.get(String(node.dataset.detailComponent)));
    }));
}

function activateItineraryKeyboard(event, callback) {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        callback();
    }
}

function bindItineraryPan() {
    const canvas = itineraryContent.querySelector(".itinerary-canvas");
    if (!canvas) return;
    let startX = 0; let startScroll = 0; let dragging = false;
    canvas.addEventListener("pointerdown", event => { dragging = true; startX = event.clientX; startScroll = canvas.scrollLeft; canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener("pointermove", event => { if (dragging) canvas.scrollLeft = startScroll - (event.clientX - startX); });
    canvas.addEventListener("pointerup", () => { dragging = false; });
    canvas.addEventListener("wheel", event => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) { canvas.scrollLeft += event.deltaY; event.preventDefault(); } }, { passive: false });
}

function selectItinerarySupport(id) {
    const support = itineraryData?.supports.find(item => String(item.id) === String(id));
    if (!support) return;
    itineraryContent.querySelectorAll("[data-itinerary-support-id]").forEach(node => node.classList.toggle("is-selected", node.dataset.itinerarySupportId === String(id)));
    const detailPanel = itineraryContent.querySelector("[data-itinerary-detail]");
    detailPanel.innerHTML = createSupportDetail(support, itineraryData);
    detailPanel.querySelectorAll("[data-detail-component]").forEach(node => node.addEventListener("click", () => {
        selectItineraryComponent(findItineraryComponent(node.dataset.detailComponent));
    }));
    itineraryContent.querySelector(`[data-itinerary-support-id="${CSS.escape(String(id))}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

function selectItineraryComponent(component) {
    if (!component) return;
    itineraryContent.querySelector("[data-itinerary-detail]").innerHTML = createComponentDetail(component, itineraryData);
}

function findItineraryComponent(id) {
    return [...(itineraryData?.supports ?? []), ...(itineraryData?.spans ?? [])]
        .flatMap(item => orderComponents(item.components))
        .find(component => String(component.id) === String(id));
}

function renderItineraryMetadata() {
    itineraryContent.querySelector("[data-itinerary-detail]").innerHTML = createStructureDetail(itineraryData.structure, itineraryData);
}

function applyItineraryZoom() {
    const stage = itineraryContent.querySelector("[data-itinerary-stage]");
    if (stage) stage.style.transform = `scale(${itineraryZoom})`;
}

function createStructureDetail(structure, data) {
    const design = structure.design ?? data.design ?? {};
    return `<h3>Tasarım ve Veri Kaynağı</h3><dl class="itinerary-detail-list">
        ${detailRow("Tasarım sürümü", design.version ?? structure.design_version)}
        ${detailRow("Tasarım durumu", design.state ?? structure.design_state ?? "PROVISIONAL")}
        ${detailRow("Veri tarihi", data.dataAsOf)}
        ${detailRow("Kaynak", design.provenance ?? structure.provenance)}
        ${detailRow("Kalite", qualityText(data.quality))}
    </dl><p class="itinerary-detail-note">Bileşen veya support seçerek ayrıntıları görüntüleyin.</p>`;
}

function createSupportDetail(support, data) {
    return `<h3>${escapeItinerary(support.code)}</h3><p class="itinerary-detail-kicker">${escapeItinerary(support.type ?? support.support_type ?? "OTHER")}</p>
        <dl class="itinerary-detail-list">${detailRow("KM", formatItineraryKm(support.chainage ?? support.km))}${detailRow("Tasarım", "Geçici Tasarım Modeli")}${detailRow("Veri tarihi", data.dataAsOf)}</dl>
        <div class="itinerary-component-list">${orderComponents(support.components).map(component => `<button type="button" data-detail-component="${escapeItinerary(component.id)}"><span>${escapeItinerary(component.label ?? component.type)}</span><strong>${escapeItinerary(statusLabel(component.status))}</strong></button>`).join("")}</div>`;
}

function createComponentDetail(component, data) {
    const progress = component.progress ?? {};
    const plannedQuantity = component.planned_quantity ?? progress.planned_count;
    const completedQuantity = component.completed_quantity ?? progress.completed_count;
    return `<h3>${escapeItinerary(component.label ?? component.type ?? "Bileşen")}</h3><p class="itinerary-detail-kicker">${escapeItinerary(component.type ?? "OTHER")}</p><dl class="itinerary-detail-list">
        ${detailRow("Durum", statusLabel(component.status))}${detailRow("Tasarım kapsamı", formatDesignPresence(component.design_presence ?? component.design_state))}${detailRow("Durum nedeni", component.status_reason)}${detailRow("Başlangıç", component.actual_start)}${detailRow("Bitiş", component.actual_finish)}${detailRow("Son aktivite", component.last_activity)}${detailRow("Planlanan miktar", plannedQuantity == null ? null : `${plannedQuantity}${component.unit ? ` ${component.unit}` : ""}`)}${detailRow("Tamamlanan miktar", completedQuantity == null ? null : `${completedQuantity}${component.unit ? ` ${component.unit}` : ""}`)}${detailRow("İlerleme", component.progress_percent == null ? null : `${component.progress_percent}%`)}${detailRow("Kalite", qualityText(component.quality))}${detailRow("Veri tarihi", data.dataAsOf)}</dl>`;
}

function detailRow(label, value) { return value == null || value === "" ? "" : `<div><dt>${escapeItinerary(label)}</dt><dd>${escapeItinerary(String(value))}</dd></div>`; }
function statusLabel(value) { return ITINERARY_STATUS_LABELS[String(value ?? "UNKNOWN").toUpperCase()] ?? String(value ?? "Bilinmiyor"); }
function statusClass(value) { return `is-status-${String(value ?? "UNKNOWN").toLowerCase()}`; }
function qualityClass(value) {
    const levels = Array.isArray(value) ? value.map(item => item?.level) : [typeof value === "object" ? value?.level : value];
    return levels.some(level => level && String(level).toUpperCase() !== "OK") ? "has-quality" : "";
}
function qualityText(value) {
    if (Array.isArray(value)) return value.map(item => typeof item === "object" ? (item.code ?? item.level) : item).filter(Boolean).join(", ") || "-";
    if (typeof value === "object") return value?.code ?? value?.level ?? "-";
    return value ?? "-";
}
function formatDesignPresence(value) {
    if (value === true) return "Tasarımda mevcut";
    if (value === false) return "Tasarımda yok";
    return value ?? "-";
}
function formatItineraryKm(value) { return typeof formatKilometer === "function" ? formatKilometer(value) : (value ?? "-"); }
function escapeItinerary(value) { return String(value ?? "-").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

window.openStructureItinerary = openStructureItinerary;
window.closeStructureItinerary = closeStructureItinerary;
