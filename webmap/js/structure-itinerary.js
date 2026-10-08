"use strict";

const itineraryView = document.getElementById("structure-itinerary-view");
const itineraryContent = document.getElementById("structure-itinerary-content");
const ITINERARY_COMPONENT_ORDER = Object.freeze([
    "PILE_GROUP", "FOUNDATION", "ELEVATION_BODY", "CAP", "BEARING_BLOCK", "GIRDER_GROUP", "DECK_SLAB"
]);
const ITINERARY_HIDDEN_COMPONENT_TYPES = new Set(["PIER_STAGE"]);
const ITINERARY_COMPONENT_PRESENTATION = Object.freeze({
    PILE_GROUP: { label: "Kazıklar", kind: "piles" },
    BLINDING_CONCRETE: { label: "Grobeton", kind: "blinding" },
    FOUNDATION: { label: "Temel", kind: "foundation" },
    ELEVATION_BODY: { label: "Elevasyon", kind: "elevation" },
    CAP: { label: "Başlık Kirişi", kind: "cap" },
    BEARING_BLOCK: { label: "Mesnet Bloğu", kind: "bearing" },
    GIRDER_GROUP: { label: "Prekast Kirişler", kind: "girder" },
    DECK: { label: "Tabliye Betonu", kind: "deck" },
    DECK_SLAB: { label: "Tabliye Betonu", kind: "deck" }
});
const ITINERARY_STATUS_LABELS = Object.freeze({
    UNKNOWN: "Bilinmiyor", NOT_STARTED: "Başlanmadı", IN_PROGRESS: "Devam ediyor",
    COMPLETED: "Tamamlandı", BLOCKED: "Blokeli", NOT_APPLICABLE: "Uygulanmaz"
});

let itineraryAssetId = null;
let itineraryAssetKind = "viaduct";
let itineraryData = null;
let itineraryController = null;
let itineraryZoom = 1;
let itineraryHistoryOpen = false;

window.addEventListener("popstate", () => {
    if (isStructureItineraryOpen()) closeStructureItinerary({ fromHistory: true });
});

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isStructureItineraryOpen()) return;
    if (closeItineraryInfoPanel()) {
        event.preventDefault();
        return;
    }
    closeStructureItinerary();
});

async function openStructureItinerary(assetId, options = {}) {
    const normalizedId = Number(assetId);
    if (!Number.isFinite(normalizedId) || !itineraryView || !itineraryContent) return;
    const assetKind = options.assetKind === "bridge" ? "bridge" : "viaduct";

    itineraryController?.abort();
    itineraryAssetId = normalizedId;
    itineraryAssetKind = assetKind;
    itineraryData = null;
    itineraryZoom = 1;
    showStructureItinerary();
    renderItineraryLoading();
    pushItineraryHistory(normalizedId, assetKind);
    itineraryController = new AbortController();

    try {
        const response = await apiFetch(
            `${API_BASE_URL}/api/${assetKind === "bridge" ? "bridges" : "viaducts"}/${encodeURIComponent(normalizedId)}/itinerary`,
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
    itineraryAssetKind = "viaduct";
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

function pushItineraryHistory(assetId, assetKind) {
    if (history.state?.kiadView === "structure-itinerary") return;
    history.pushState({ kiadView: "structure-itinerary", assetId, assetKind }, "");
    itineraryHistoryOpen = true;
}

function normalizeItineraryData(source = {}) {
    const structure = source.structure ?? source.asset ?? {};
    const supports = Array.isArray(source.supports) ? source.supports : [];
    const spans = Array.isArray(source.spans) ? source.spans : [];
    return {
        structure,
        supports: orderItineraryItems(supports),
        spans: orderItineraryItems(spans),
        quality: source.data_quality?.warnings ?? source.quality ?? source.quality_summary ?? [],
        dataAsOf: source.data_as_of ?? structure.data_as_of ?? null
    };
}

function orderItineraryItems(items = []) {
    return items.map((item, index) => ({ item, index })).sort((left, right) => {
        const leftOrder = Number(left.item?.order);
        const rightOrder = Number(right.item?.order);
        if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder)) return leftOrder - rightOrder;
        return left.index - right.index;
    }).map(({ item }) => item);
}

function renderItineraryLoading() {
    itineraryContent.innerHTML = `${createItineraryHeader({ asset_code: itineraryAssetKind === "bridge" ? "Köprü" : "Viyadük", name: "İlerleme İtinereri" })}
        <div class="itinerary-state"><span class="tunnel-detail-spinner" aria-hidden="true"></span><span>İtinerer yükleniyor...</span></div>`;
    bindItineraryControls();
}

function renderItineraryError(error) {
    const unavailable = /404/.test(String(error?.message));
    itineraryContent.innerHTML = `${createItineraryHeader({ asset_code: itineraryAssetKind === "bridge" ? "Köprü" : "Viyadük", name: "İlerleme İtinereri" })}
        <div class="itinerary-state itinerary-state-error">
            <strong>${unavailable ? "İtinerer verisi henüz yayımlanmadı" : "İtinerer verisi alınamadı"}</strong>
            <span>${unavailable
                ? "Canonical structure itinerary API erişime açıldığında bu görünüm gerçek veriyi otomatik kullanacaktır."
                : "Bağlantıyı kontrol edip tekrar deneyin."}</span>
            <button type="button" data-itinerary-retry>Yeniden dene</button>
        </div>`;
    bindItineraryControls();
    itineraryContent.querySelector("[data-itinerary-retry]")?.addEventListener("click", () => openStructureItinerary(itineraryAssetId, { assetKind: itineraryAssetKind }));
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
        </div>
        <section class="itinerary-bottom-panel" aria-live="polite" data-itinerary-panel hidden>
            <header><span>Seçili öğe bilgisi</span><button type="button" data-itinerary-panel-close aria-label="Bilgi panelini kapat">×</button></header>
            <div class="itinerary-detail" data-itinerary-detail></div>
        </section>`;
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
    return `<button type="button" class="itinerary-provisional" data-itinerary-metadata title="Tasarım bilgisi">${escapeItinerary(formatDesignState(state))}</button>`;
}

function createItinerarySvg(supports, spans) {
    const spacing = 132;
    const width = Math.max(760, (supports.length - 1) * spacing + 160);
    const axisY = 88;
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
    const components = orderComponents(span.components);
    const component = components.find(c => c.type === "GIRDER_GROUP") ?? components[0];
    const deck = components.find(c => ["DECK", "DECK_SLAB"].includes(c.type ?? c.component_type));
    const componentLabel = componentPresentation(component).label;
    const accessibleLabel = `${span.code ?? "Span"}: ${componentLabel} ${componentStatusLabel(component)}`;
    return `<g class="itinerary-span" tabindex="0" role="button" data-itinerary-span-id="${escapeItinerary(span.id)}" aria-label="${escapeItinerary(accessibleLabel)}">
        ${deck ? createSpanDeckSvg(deck, start, end, axisY) : ""}
        <rect x="${start + 10}" y="${axisY - 18}" width="${Math.max(20, end - start - 20)}" height="15" rx="2" class="itinerary-girder-beam ${statusClass(component?.status)}" />
        <text x="${(start + end) / 2}" y="${axisY - 28}" class="itinerary-span-label">${escapeItinerary(formatSpanLabel(span))}</text>
    </g>`;
}

function createSpanDeckSvg(component, start, end, axisY) {
    const label = componentPresentation(component).label;
    const width = Math.max(20, end - start - 12);
    return `<g class="itinerary-component is-deck ${statusClass(component.status)} ${qualityClass(component.quality)}" tabindex="0" role="button" data-itinerary-component="${escapeItinerary(component.id)}" aria-label="${escapeItinerary(`${label}: ${componentStatusLabel(component)}`)}">
        <rect x="${start + 6}" y="${axisY - 42}" width="${width}" height="8" rx="1"/>
        <text x="${(start + end) / 2}" y="${axisY - 35}" class="itinerary-component-label">${escapeItinerary(label)}</text>
    </g>`;
}

function createSupportSvg(support, index, spacing, axisY) {
    const x = 80 + index * spacing;
    const type = String(support.type ?? support.support_type ?? "OTHER").toUpperCase();
    const components = orderComponents(support.components);
    return `<g class="itinerary-support is-${type.toLowerCase()}" tabindex="0" role="button" data-itinerary-support-id="${escapeItinerary(support.id)}" aria-label="${escapeItinerary(`${support.code} ${type}`)}">
        <title>${escapeItinerary(`${support.code} · ${type}`)}</title>
        <line x1="${x}" y1="${axisY - 2}" x2="${x}" y2="${axisY + 196}" class="itinerary-support-guide" />
        ${components.map((component, componentIndex) => createComponentSvg(component, x, axisY, componentIndex, support.code)).join("")}
        <text x="${x}" y="${axisY + 220}" class="itinerary-support-label">${escapeItinerary(support.code)}</text>
    </g>`;
}

function createComponentSvg(component, x, axisY, fallbackIndex, supportCode) {
    const type = component.type ?? component.component_type ?? "OTHER";
    const presentation = componentPresentation(component);
    const accessibleLabel = `${supportCode} ${presentation.label}: ${componentStatusLabel(component)}`;
    const common = `class="itinerary-component is-${presentation.kind} ${statusClass(component.status)} ${qualityClass(component.quality)}" tabindex="0" role="button" data-itinerary-component="${escapeItinerary(component.id)}" aria-label="${escapeItinerary(accessibleLabel)}"`;
    const label = y => `<text x="${x}" y="${y}" class="itinerary-component-label">${escapeItinerary(presentation.label)}</text>`;
    const marker = y => `<text x="${x + 48}" y="${y}" class="itinerary-status-mark">${statusMark(component.status)}</text>`;

    if (presentation.kind === "piles") {
        return `<g ${common}><line x1="${x - 22}" y1="${axisY + 168}" x2="${x - 22}" y2="${axisY + 206}"/><line x1="${x}" y1="${axisY + 168}" x2="${x}" y2="${axisY + 206}"/><line x1="${x + 22}" y1="${axisY + 168}" x2="${x + 22}" y2="${axisY + 206}"/><line x1="${x - 32}" y1="${axisY + 168}" x2="${x + 32}" y2="${axisY + 168}"/>${label(axisY + 188)}${marker(axisY + 188)}</g>`;
    }
    if (presentation.kind === "blinding") {
        return `<g ${common}><rect x="${x - 46}" y="${axisY + 160}" width="92" height="8" rx="1"/>${label(axisY + 167)}${marker(axisY + 167)}</g>`;
    }
    if (presentation.kind === "foundation") {
        return `<g ${common}><rect x="${x - 43}" y="${axisY + 137}" width="86" height="23" rx="2"/>${label(axisY + 152)}${marker(axisY + 152)}</g>`;
    }
    if (presentation.kind === "elevation") {
        return `<g ${common}><rect x="${x - 20}" y="${axisY + 51}" width="40" height="86" rx="2"/>${label(axisY + 96)}${marker(axisY + 96)}</g>`;
    }
    if (presentation.kind === "cap") {
        return `<g ${common}><rect x="${x - 48}" y="${axisY + 31}" width="96" height="20" rx="2"/>${label(axisY + 45)}${marker(axisY + 45)}</g>`;
    }
    if (presentation.kind === "bearing") {
        return `<g ${common}><rect x="${x - 31}" y="${axisY + 15}" width="62" height="16" rx="2"/>${label(axisY + 27)}${marker(axisY + 27)}</g>`;
    }
    if (presentation.kind === "deck") {
        return `<g ${common}><rect x="${x - 52}" y="${axisY - 4}" width="104" height="8" rx="1"/>${label(axisY + 3)}${marker(axisY + 3)}</g>`;
    }
    const y = axisY + 28 + fallbackIndex * 22;
    return `<g ${common}><rect x="${x - 42}" y="${y}" width="84" height="16" rx="2"/>${label(y + 12)}${marker(y + 12)}</g>`;
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
    itineraryContent.querySelector("[data-itinerary-panel-close]")?.addEventListener("click", () => closeItineraryInfoPanel());
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
    itineraryContent.querySelectorAll("[data-itinerary-span-id]").forEach(node => {
        node.addEventListener("click", () => selectItinerarySpan(node.dataset.itinerarySpanId));
        node.addEventListener("keydown", (event) => activateItineraryKeyboard(event, () => selectItinerarySpan(node.dataset.itinerarySpanId)));
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
    canvas.addEventListener("pointermove", event => { if (dragging) setItineraryScrollLeft(canvas, startScroll - (event.clientX - startX)); });
    canvas.addEventListener("pointerup", () => { dragging = false; });
    canvas.addEventListener("wheel", event => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) { setItineraryScrollLeft(canvas, canvas.scrollLeft + event.deltaY); event.preventDefault(); } }, { passive: false });
    canvas.addEventListener("scroll", () => clampItineraryScroll(canvas));
}

function selectItinerarySupport(id) {
    const support = itineraryData?.supports.find(item => String(item.id) === String(id));
    if (!support) return;
    itineraryContent.querySelectorAll("[data-itinerary-support-id]").forEach(node => node.classList.toggle("is-selected", node.dataset.itinerarySupportId === String(id)));
    const detailPanel = openItineraryInfoPanel(createSupportDetail(support, itineraryData));
    detailPanel.querySelectorAll("[data-detail-component]").forEach(node => node.addEventListener("click", () => {
        selectItineraryComponent(findItineraryComponent(node.dataset.detailComponent));
    }));
    itineraryContent.querySelector(`[data-itinerary-support-id="${CSS.escape(String(id))}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

function selectItineraryComponent(component) {
    if (!component) return;
    openItineraryInfoPanel(createComponentDetail(component, itineraryData));
}

function selectItinerarySpan(id) {
    const span = itineraryData?.spans.find(item => String(item.id) === String(id));
    if (!span) return;
    const detailPanel = openItineraryInfoPanel(createSpanDetail(span, itineraryData));
    detailPanel.querySelectorAll("[data-detail-component]").forEach(node => node.addEventListener("click", () => {
        selectItineraryComponent(findItineraryComponent(node.dataset.detailComponent));
    }));
}

function findItineraryComponent(id) {
    return [...(itineraryData?.supports ?? []), ...(itineraryData?.spans ?? [])]
        .flatMap(item => orderComponents(item.components))
        .find(component => String(component.id) === String(id));
}

function renderItineraryMetadata() {
    openItineraryInfoPanel(createStructureDetail(itineraryData.structure, itineraryData));
}

function applyItineraryZoom() {
    const stage = itineraryContent.querySelector("[data-itinerary-stage]");
    if (!stage) return;
    stage.style.transform = `scale(${itineraryZoom})`;
    requestAnimationFrame(() => clampItineraryScroll());
}

function getItineraryScrollBounds(canvas = itineraryContent.querySelector(".itinerary-canvas")) {
    const svg = canvas?.querySelector(".itinerary-svg");
    if (!canvas || !svg) return { min: 0, max: 0 };
    const canvasBox = canvas.getBoundingClientRect();
    const svgBox = svg.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    const leftPadding = Number.parseFloat(style.paddingLeft) || 0;
    const rightPadding = Number.parseFloat(style.paddingRight) || 0;
    const contentLeft = canvas.scrollLeft + svgBox.left - canvasBox.left;
    const contentRight = contentLeft + svgBox.width;
    return {
        min: Math.max(0, contentLeft - leftPadding),
        max: Math.max(0, contentRight - canvas.clientWidth + rightPadding)
    };
}

function setItineraryScrollLeft(canvas, value) {
    const bounds = getItineraryScrollBounds(canvas);
    canvas.scrollLeft = Math.min(bounds.max, Math.max(bounds.min, value));
}

function clampItineraryScroll(canvas = itineraryContent.querySelector(".itinerary-canvas")) {
    if (!canvas) return;
    setItineraryScrollLeft(canvas, canvas.scrollLeft);
}

function openItineraryInfoPanel(content) {
    const panel = itineraryContent.querySelector("[data-itinerary-panel]");
    const detail = itineraryContent.querySelector("[data-itinerary-detail]");
    if (!panel || !detail) return null;
    detail.innerHTML = content;
    panel.hidden = false;
    return detail;
}

function closeItineraryInfoPanel() {
    const panel = itineraryContent?.querySelector?.("[data-itinerary-panel]");
    if (!panel || panel.hidden) return false;
    panel.hidden = true;
    return true;
}

function createStructureDetail(structure, data) {
    const design = structure.design ?? data.design ?? {};
    return `<h3>Tasarım ve Veri Kaynağı</h3><dl class="itinerary-detail-list">
        ${detailRow("Tasarım sürümü", design.version ?? structure.design_version)}
        ${detailRow("Tasarım durumu", formatDesignState(design.state ?? structure.design_state))}
        ${detailRow("Veri tarihi", data.dataAsOf)}
        ${detailRow("Kaynak", design.provenance ?? structure.provenance)}
        ${detailRow("Kalite", qualityText(data.quality))}
    </dl><p class="itinerary-detail-note">Bileşen veya support seçerek ayrıntıları görüntüleyin.</p>`;
}

function createSupportDetail(support, data) {
    return `<h3>${escapeItinerary(support.code)}</h3><p class="itinerary-detail-kicker">${escapeItinerary(support.type ?? support.support_type ?? "OTHER")}</p>
        <dl class="itinerary-detail-list">${detailRow("KM", formatItineraryKm(support.chainage ?? support.km))}${detailRow("Tasarım", formatDesignState(data.structure?.design?.state ?? data.structure?.design_state))}${detailRow("Veri tarihi", data.dataAsOf)}</dl>
        <div class="itinerary-component-list">${orderComponents(support.components).map(component => `<button type="button" data-detail-component="${escapeItinerary(component.id)}"><span>${escapeItinerary(componentPresentation(component).label)}</span><strong>${escapeItinerary(componentStatusLabel(component))}</strong></button>`).join("")}</div>`;
}

function createSpanDetail(span, data) {
    const supportsById = new Map(data.supports.map(support => [String(support.id), support]));
    const from = supportsById.get(String(span.from_support_id));
    const to = supportsById.get(String(span.to_support_id));
    const spanLength = formatSpanLength(span);
    return `<h3>${escapeItinerary(span.code ?? "Açıklık")}</h3><p class="itinerary-detail-kicker">Açıklık</p>
        <dl class="itinerary-detail-list">${detailRow("Başlangıç desteği", from?.code)}${detailRow("Bitiş desteği", to?.code)}${detailRow("Uzunluk", spanLength)}${detailRow("Veri tarihi", data.dataAsOf)}</dl>
        <div class="itinerary-component-list">${orderComponents(span.components).map(component => `<button type="button" data-detail-component="${escapeItinerary(component.id)}"><span>${escapeItinerary(componentPresentation(component).label)}</span><strong>${escapeItinerary(componentStatusLabel(component))}</strong></button>`).join("")}</div>`;
}

function createComponentDetail(component, data) {
    const progress = component.progress ?? {};
    const plannedQuantity = component.planned_quantity ?? progress.planned_count;
    const completedQuantity = component.completed_quantity ?? progress.completed_count;
    const typeKicker = data.structure?.type === "BRIDGE" ? "" : (component.type ?? "OTHER");
    return `<h3>${escapeItinerary(componentPresentation(component).label)}</h3><p class="itinerary-detail-kicker">${escapeItinerary(typeKicker)}</p><dl class="itinerary-detail-list">
        ${detailRow("Durum", componentStatusLabel(component))}${detailRow("Tasarım kapsamı", formatDesignPresence(component.design_presence ?? component.design_state))}${detailRow("Durum nedeni", formatStatusReason(component.status_reason))}${detailRow("Başlangıç", component.actual_start)}${detailRow("Bitiş", component.actual_finish)}${detailRow("Son aktivite", component.last_activity)}${detailRow("Planlanan miktar", plannedQuantity == null ? null : `${plannedQuantity}${component.unit ? ` ${component.unit}` : ""}`)}${detailRow("Tamamlanan miktar", completedQuantity == null ? null : `${completedQuantity}${component.unit ? ` ${component.unit}` : ""}`)}${detailRow("İlerleme", component.progress_percent == null ? null : `${component.progress_percent}%`)}${detailRow("Kalite", qualityText(component.quality))}${detailRow("Veri tarihi", data.dataAsOf)}</dl>`;
}

function detailRow(label, value) { return value == null || value === "" ? "" : `<div><dt>${escapeItinerary(label)}</dt><dd>${escapeItinerary(String(value))}</dd></div>`; }
function statusLabel(value) { return ITINERARY_STATUS_LABELS[String(value ?? "UNKNOWN").toUpperCase()] ?? String(value ?? "Bilinmiyor"); }
function componentStatusLabel(component = {}) {
    if (String(component.status ?? "").toUpperCase() === "UNKNOWN" && String(component.status_reason ?? "").toUpperCase() === "DESIGN_PRESENT_NO_PROGRESS") return "İlerleme verisi yok";
    return statusLabel(component.status);
}
function statusClass(value) { return `is-status-${String(value ?? "UNKNOWN").toLowerCase()}`; }
function statusMark(value) {
    const marks = { COMPLETED: "✓", IN_PROGRESS: "●", NOT_STARTED: "–", BLOCKED: "!", NOT_APPLICABLE: "×", UNKNOWN: "?" };
    return marks[String(value ?? "UNKNOWN").toUpperCase()] ?? "?";
}
function componentPresentation(component = {}) {
    const type = String(component.type ?? component.component_type ?? "OTHER").toUpperCase();
    const bridgeLabels = itineraryData?.structure?.type === "BRIDGE" ? {
        PILE_GROUP: "Kazık", GIRDER_GROUP: "Prekast Kiriş Grubu", DECK_SLAB: "Döşeme"
    } : {};
    const presentation = ITINERARY_COMPONENT_PRESENTATION[type] ?? { label: component.label ?? type, kind: "other" };
    return { ...presentation, label: bridgeLabels[type] ?? presentation.label };
}
function qualityClass(value) {
    const levels = Array.isArray(value) ? value.map(item => item?.level) : [typeof value === "object" ? value?.level : value];
    return levels.some(level => level && String(level).toUpperCase() !== "OK") ? "has-quality" : "";
}
function qualityText(value) {
    const values = Array.isArray(value) ? value : [value];
    const labels = values.map(item => typeof item === "object" ? (item.code ?? item.level) : item)
        .map(item => itineraryData?.structure?.type === "BRIDGE" ? formatStatusReason(item) : item)
        .filter(Boolean);
    return labels.join(", ") || "-";
}
function formatDesignPresence(value) {
    if (value === true) return "Tasarımda mevcut";
    if (value === false) return "Tasarımda yok";
    return value ?? "-";
}
function formatDesignState(value) {
    const normalized = String(value ?? "").toUpperCase();
    if (normalized === "AUTHORITATIVE_USER_PROJECT_CONFIRMED") return "Proje/topoloji doğrulandı";
    if (normalized === "PROVISIONAL") return "Geçici tasarım modeli";
    if (normalized === "ACTIVE" || normalized === "APPROVED") return "Tasarım doğrulandı";
    return value ?? "-";
}
function formatStatusReason(value) {
    if (String(value ?? "").toUpperCase() === "DESIGN_PRESENT_NO_PROGRESS") return "İlerleme verisi yok";
    return null;
}
function formatSpanLength(span = {}) {
    if (span.span_length_m === null || span.span_length_m === undefined || span.span_length_m === "") return null;
    const value = Number(span.span_length_m);
    return Number.isFinite(value) ? `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)} m` : null;
}
function formatSpanLabel(span = {}) {
    const length = formatSpanLength(span);
    return length ? `${span.code ?? "Açıklık"} · ${length}` : (span.code ?? "Açıklık");
}
function formatItineraryKm(value) { return typeof formatKilometer === "function" ? formatKilometer(value) : (value ?? "-"); }
function escapeItinerary(value) { return String(value ?? "-").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

window.openStructureItinerary = openStructureItinerary;
window.closeStructureItinerary = closeStructureItinerary;
