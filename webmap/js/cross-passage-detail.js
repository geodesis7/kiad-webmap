"use strict";

const CROSS_PASSAGE_STAGE_LABELS = Object.freeze({
    TOP_HEADING: "Üst Yarı",
    RIGHT_BENCH: "Sağ Alt Yarı",
    LEFT_BENCH: "Sol Alt Yarı",
    INVERT: "İnvert",
    SUPPORT: "Destek",
    FACE_CLOSURE: "Ayna Kapama"
});
const CROSS_PASSAGE_STAGE_ORDER = Object.freeze(Object.keys(CROSS_PASSAGE_STAGE_LABELS));
const CROSS_PASSAGE_STATUS = Object.freeze({
    NOT_STARTED: { label: "Henüz Başlanmadı", className: "is-not-started" },
    IN_PROGRESS: { label: "Kazı Devam Ediyor", className: "is-progress" },
    COMPLETED: { label: "Kazı Tamamlandı", className: "is-complete" },
    NO_DATA: { label: "Veri Yok", className: "is-no-data" }
});

let crossPassageList = null;
let crossPassageListPromise = null;
let crossPassageDrawer = null;
let crossPassageContent = null;
let activeCrossPassageId = null;
let crossPassageDetailController = null;

function crossPassageStatus(value) {
    return CROSS_PASSAGE_STATUS[value] ?? { label: "Durum bilgisi yok", className: "is-no-data" };
}

function crossPassageNumber(value, unit = "") {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return `${number.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
}

function crossPassageDate(value) {
    return value ? (formatPopupDate(value) ?? "—") : "—";
}

function crossPassageKm(value) {
    return value === null || value === undefined ? "—" : (formatKilometer(value) ?? "—");
}

function crossPassageEscape(value) {
    return escapeHtml(String(value ?? ""));
}

async function getCrossPassageList() {
    if (crossPassageList) return crossPassageList;
    if (!crossPassageListPromise) {
        crossPassageListPromise = apiFetch(`${API_BASE_URL}/api/cross-passages`)
            .then((response) => {
                if (!response.ok) throw new Error(`Cross Passage listesi alınamadı: ${response.status}`);
                return response.json();
            })
            .then((data) => {
                crossPassageList = Array.isArray(data.cross_passages) ? data.cross_passages : [];
                return crossPassageList;
            })
            .finally(() => { crossPassageListPromise = null; });
    }
    return crossPassageListPromise;
}

async function getCrossPassagePopupItem(assetId) {
    const items = await getCrossPassageList();
    return items.find((item) => Number(item.asset_id) === Number(assetId)) ?? null;
}

function ensureCrossPassageDrawer() {
    if (crossPassageDrawer) return;
    crossPassageDrawer = document.createElement("aside");
    crossPassageDrawer.id = "cross-passage-detail-drawer";
    crossPassageDrawer.className = "tunnel-detail-drawer cross-passage-detail-drawer";
    crossPassageDrawer.setAttribute("aria-labelledby", "cross-passage-detail-title");
    crossPassageDrawer.setAttribute("aria-hidden", "true");
    crossPassageDrawer.hidden = true;
    crossPassageDrawer.innerHTML = '<div class="tunnel-detail-content" id="cross-passage-detail-content" aria-live="polite"></div>';
    document.body.append(crossPassageDrawer);
    crossPassageContent = crossPassageDrawer.querySelector("#cross-passage-detail-content");
}

function renderCrossPassageShell(code, body) {
    crossPassageContent.innerHTML = `<header class="tunnel-detail-header"><div class="tunnel-detail-heading"><span class="tunnel-detail-code">${crossPassageEscape(code)}</span><h2 id="cross-passage-detail-title">Bağlantı Tüneli</h2></div><button class="tunnel-detail-close" type="button" aria-label="Bağlantı tüneli detayını kapat">×</button></header>${body}`;
    crossPassageContent.querySelector(".tunnel-detail-close")?.addEventListener("click", closeCrossPassageDetailDrawer);
}

async function openCrossPassageDetailDrawer(assetId) {
    const id = Number(assetId);
    if (!Number.isSafeInteger(id)) return;
    ensureCrossPassageDrawer();
    window.closeAllDetailDrawers?.("cross-passage");
    crossPassageDetailController?.abort();
    activeCrossPassageId = id;
    crossPassageDrawer.hidden = false;
    crossPassageDrawer.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(() => crossPassageDrawer?.classList.add("is-open"));
    renderCrossPassageShell("Cross Passage", '<div class="tunnel-detail-state"><span class="tunnel-detail-spinner" aria-hidden="true"></span><span>Kazı faaliyetleri yükleniyor...</span></div>');
    const controller = new AbortController();
    crossPassageDetailController = controller;
    try {
        const response = await apiFetch(`${API_BASE_URL}/api/cross-passages/${encodeURIComponent(id)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Cross Passage detayı alınamadı: ${response.status}`);
        const data = await response.json();
        if (activeCrossPassageId !== id || controller.signal.aborted) return;
        renderCrossPassageDetail(data);
    } catch (error) {
        if (isAuthSessionError(error) || error.name === "AbortError" || activeCrossPassageId !== id) return;
        console.error("Bağlantı tüneli kazı detayı yüklenemedi:", error);
        renderCrossPassageShell("Cross Passage", '<div class="tunnel-detail-state tunnel-detail-state-error">Kazı bilgileri şu anda yüklenemiyor.</div>');
    }
}

function closeCrossPassageDetailDrawer() {
    if (!crossPassageDrawer) return;
    crossPassageDetailController?.abort();
    crossPassageDetailController = null;
    activeCrossPassageId = null;
    crossPassageDrawer.classList.remove("is-open");
    crossPassageDrawer.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
        if (!crossPassageDrawer?.classList.contains("is-open")) {
            crossPassageDrawer.hidden = true;
            crossPassageContent.innerHTML = "";
        }
    }, 260);
}

function crossPassageInfoRow(label, value) {
    if (value === null || value === undefined || value === "") return "";
    return `<div class="tunnel-info-row"><dt>${crossPassageEscape(label)}</dt><dd>${crossPassageEscape(value)}</dd></div>`;
}

function renderCrossPassageDetail(data = {}) {
    const asset = data.asset ?? {};
    const status = crossPassageStatus(asset.excavation_status);
    const relationship = [asset.main_tunnel_asset_code, asset.safety_tunnel_asset_code].filter(Boolean).map((code) => String(code).toUpperCase()).join(" ↔ ");
    const info = [
        crossPassageInfoRow("Varlık Adı", asset.name),
        crossPassageInfoRow("Varlık Kodu", asset.asset_code),
        crossPassageInfoRow("Ana Hat KM", crossPassageKm(asset.mainline_km)),
        crossPassageInfoRow("Fiziksel Uzunluk", asset.physical_length_m == null ? null : formatLength(asset.physical_length_m)),
        crossPassageInfoRow("Bağlantı", relationship),
        crossPassageInfoRow("Kesim", asset.section_code || asset.section_name)
    ].join("");
    const stages = new Map((Array.isArray(data.stages) ? data.stages : []).map((stage) => [stage.stage, stage]));
    renderCrossPassageShell(asset.cp_code ?? asset.asset_code ?? "Cross Passage", `<div class="tunnel-detail-scroll cross-passage-scroll">
        <section class="tunnel-detail-section"><h3>Temel Bilgiler</h3><dl class="tunnel-info-list">${info}</dl></section>
        <section class="tunnel-detail-section"><h3>Kazı Özeti</h3><div class="cross-passage-summary"><span class="cross-passage-status ${status.className}">${crossPassageEscape(status.label)}</span><span>Son Faaliyet <strong>${crossPassageEscape(crossPassageDate(asset.latest_activity_date))}</strong></span><span>Toplam Olay <strong>${crossPassageEscape(crossPassageNumber(asset.excavation_event_count) ?? "—")}</strong></span></div></section>
        <section class="tunnel-detail-section"><h3>Kazı Faaliyetleri</h3><div class="cross-passage-stages">${CROSS_PASSAGE_STAGE_ORDER.map((key) => renderCrossPassageStage(key, stages.get(key))).join("")}</div></section>
    </div>`);
}

function renderCrossPassageStage(key, stage) {
    const events = Array.isArray(stage?.events) ? stage.events : [];
    const label = CROSS_PASSAGE_STAGE_LABELS[key];
    return `<details class="cross-passage-stage"><summary><strong>${crossPassageEscape(label)}</strong><span>${events.length ? `${crossPassageEscape(crossPassageNumber(events.length))} kayıt` : "Kayıt yok"}</span></summary><div class="cross-passage-stage-body">${events.length ? events.map(renderCrossPassageEvent).join("") : '<p class="cross-passage-empty">Kayıt yok</p>'}</div></details>`;
}

function renderCrossPassageEvent(event = {}) {
    const start = crossPassageNumber(event.local_chainage_start_m, "m");
    const end = crossPassageNumber(event.local_chainage_end_m, "m");
    const interval = start && end ? `${start} – ${end}` : start || end;
    const fields = [
        crossPassageInfoRow("Yerel Kazı Aralığı", interval),
        crossPassageInfoRow("Kazı Miktarı", crossPassageNumber(event.progress_m, "m")),
        crossPassageInfoRow("İksa No", event.support_no),
        crossPassageInfoRow("Tur No", event.round_no),
        crossPassageInfoRow("Destek Tipi", event.support_type),
        crossPassageInfoRow("Kaynak Sınıfı", event.source_class_code),
        crossPassageInfoRow("Süren 4 m", event.suren_4m_count),
        crossPassageInfoRow("Süren 6 m", event.suren_6m_count),
        crossPassageInfoRow("Robot 9 m", event.robot_9m_count),
        crossPassageInfoRow("Ayna Kapama Yerel KM", event.face_closure_chainage_km)
    ].join("");
    return `<article class="cross-passage-event"><header><strong>${crossPassageEscape(crossPassageDate(event.work_date))}</strong><small>${crossPassageEscape(event.source_sheet ?? "")}${event.source_row != null ? ` · Satır ${crossPassageEscape(event.source_row)}` : ""}</small></header>${fields ? `<dl class="tunnel-info-list">${fields}</dl>` : ""}</article>`;
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && crossPassageDrawer && !crossPassageDrawer.hidden) closeCrossPassageDetailDrawer();
});

window.getCrossPassageList = getCrossPassageList;
window.getCrossPassagePopupItem = getCrossPassagePopupItem;
window.openCrossPassageDetailDrawer = openCrossPassageDetailDrawer;
window.closeCrossPassageDetailDrawer = closeCrossPassageDetailDrawer;
window.crossPassageStatus = crossPassageStatus;
