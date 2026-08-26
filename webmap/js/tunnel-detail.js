"use strict";

const tunnelDetailDrawer =
    document.getElementById("tunnel-detail-drawer");

const tunnelDetailContent =
    document.getElementById("tunnel-detail-content");

let tunnelDetailRequestController = null;
let tunnelProgressRequestController = null;
let activeTunnelAssetId = null;
let pendingTunnelDetailView = null;

const tunnelDetailCache = new Map();
const tunnelProgressCache = new Map();

window.addEventListener("kiad:tunnel-detail-open", (event) => {
    loadTunnelDetail(event.detail?.assetId, event.detail);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isTunnelDetailDrawerOpen()) {
        closeTunnelDetailDrawer();
    }
});

async function loadTunnelDetail(assetId, options = {}) {
    const normalizedAssetId = Number(assetId);

    if (!Number.isFinite(normalizedAssetId)) {
        return;
    }

    if (typeof window.closeViaductDetailDrawer === "function") {
        window.closeViaductDetailDrawer();
    }

    pendingTunnelDetailView = normalizeTunnelDetailView(options);

    if (
        normalizedAssetId === activeTunnelAssetId &&
        isTunnelDetailDrawerOpen()
    ) {
        applyPendingTunnelDetailView();
        return;
    }

    activeTunnelAssetId = normalizedAssetId;
    showTunnelDetailDrawer();

    if (typeof resetTunnelCharts === "function") {
        resetTunnelCharts(normalizedAssetId);
    }

    tunnelDetailRequestController?.abort();
    tunnelProgressRequestController?.abort();

    if (tunnelDetailCache.has(normalizedAssetId)) {
        renderTunnelDetail(tunnelDetailCache.get(normalizedAssetId));
        return;
    }

    renderTunnelDetailLoading();
    tunnelDetailRequestController = new AbortController();

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/tunnels/${encodeURIComponent(normalizedAssetId)}/summary`,
            {
                signal: tunnelDetailRequestController.signal
            }
        );

        if (!response.ok) {
            throw new Error(`API isteği başarısız: ${response.status}`);
        }

        const tunnel = await response.json();

        if (activeTunnelAssetId !== normalizedAssetId) {
            return;
        }

        tunnelDetailCache.set(normalizedAssetId, tunnel);
        renderTunnelDetail(tunnel);
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        if (activeTunnelAssetId !== normalizedAssetId) {
            return;
        }

        console.error("Tünel detayı yüklenemedi:", error);
        renderTunnelDetailError();
    }
}

function showTunnelDetailDrawer() {
    if (!tunnelDetailDrawer) {
        return;
    }

    tunnelDetailDrawer.hidden = false;
    tunnelDetailDrawer.setAttribute("aria-hidden", "false");

    window.requestAnimationFrame(() => {
        tunnelDetailDrawer.classList.add("is-open");
    });
}

function closeTunnelDetailDrawer() {
    if (!tunnelDetailDrawer) {
        return;
    }

    tunnelDetailRequestController?.abort();
    tunnelProgressRequestController?.abort();

    if (typeof resetTunnelCharts === "function") {
        resetTunnelCharts(null);
    }

    if (typeof clearSelectedTunnelFace === "function") {
        clearSelectedTunnelFace();
    }

    activeTunnelAssetId = null;
    pendingTunnelDetailView = null;
    tunnelDetailDrawer.classList.remove("is-open");
    tunnelDetailDrawer.setAttribute("aria-hidden", "true");

    window.setTimeout(() => {
        if (!tunnelDetailDrawer.classList.contains("is-open")) {
            tunnelDetailDrawer.hidden = true;
        }
    }, 260);
}

function isTunnelDetailDrawerOpen() {
    return Boolean(
        tunnelDetailDrawer &&
        !tunnelDetailDrawer.hidden &&
        tunnelDetailDrawer.classList.contains("is-open")
    );
}

function renderTunnelDetailLoading() {
    if (!tunnelDetailContent) {
        return;
    }

    tunnelDetailContent.innerHTML = `
        ${createTunnelDetailHeader({
            asset_code: "Tünel Detayı",
            name: "Yükleniyor..."
        })}
        <div class="tunnel-detail-state">
            <span class="tunnel-detail-spinner" aria-hidden="true"></span>
            <span>Bilgiler yükleniyor...</span>
        </div>
    `;

    bindTunnelDetailCloseButton();
}

function renderTunnelDetailError() {
    if (!tunnelDetailContent) {
        return;
    }

    tunnelDetailContent.innerHTML = `
        ${createTunnelDetailHeader({
            asset_code: "Tünel Detayı",
            name: "Bilgiler alınamadı"
        })}
        <div class="tunnel-detail-state tunnel-detail-state-error">
            Tünel bilgileri şu anda yüklenemiyor.
        </div>
    `;

    bindTunnelDetailCloseButton();
}

function renderTunnelDetail(tunnel = {}) {
    if (!tunnelDetailContent) {
        return;
    }

    const asset = tunnel.asset ?? {};
    const summary = tunnel.summary ?? {};
    const faces = Array.isArray(tunnel.faces) ? tunnel.faces : [];
    const progress = getTunnelProgress(asset, summary);

    const kpis = [
        ["Toplam Uzunluk", formatTunnelLength(asset.length)],
        ["Genel İlerleme", formatTunnelPercent(progress)],
        ["Aktif Ayna", formatTunnelCount(summary.active_face_count)],
        ["Son Günlük İlerleme", formatTunnelLength(summary.latest_daily_progress)],
        ["Toplam Forepoling", formatTunnelLength(summary.total_forepoling)],
        ["Son Güncelleme", formatTunnelDate(summary.latest_record_date)]
    ];

    const details = [
        ["Kesim", asset.section],
        ["Başlangıç KM", formatKilometer(asset.km_start)],
        ["Bitiş KM", formatKilometer(asset.km_end)],
        ["Uzunluk", formatTunnelLength(asset.length)],
        ["Durum", asset.status]
    ];

    tunnelDetailContent.innerHTML = `
        ${createTunnelDetailHeader(asset)}

        <div class="tunnel-detail-scroll">
            <div class="tunnel-detail-tabs" role="tablist" aria-label="Tünel detay görünümleri">
                <button class="tunnel-detail-tab is-active" type="button" role="tab"
                    aria-selected="true" aria-controls="tunnel-general-panel" data-tunnel-tab="general">
                    Genel
                </button>
                <button class="tunnel-detail-tab" type="button" role="tab"
                    aria-selected="false" aria-controls="tunnel-faces-panel" data-tunnel-tab="faces">
                    Aynalar
                    <span>${faces.length}</span>
                </button>
                <button class="tunnel-detail-tab" type="button" role="tab"
                    aria-selected="false" aria-controls="tunnel-productions-panel" data-tunnel-tab="productions">
                    İmalatlar
                </button>
                <button class="tunnel-detail-tab" type="button" role="tab"
                    aria-selected="false" aria-controls="tunnel-history-panel" data-tunnel-tab="history">
                    Geçmiş
                </button>
                <button class="tunnel-detail-tab" type="button" role="tab"
                    aria-selected="false" aria-controls="tunnel-charts-panel" data-tunnel-tab="charts">
                    Grafikler
                </button>
            </div>

            <div id="tunnel-general-panel" class="tunnel-detail-tab-panel" role="tabpanel" data-tunnel-panel="general">
                <section class="tunnel-detail-section" aria-labelledby="tunnel-kpi-title">
                    <h3 id="tunnel-kpi-title">Özet</h3>
                    <div class="tunnel-kpi-grid">
                        ${kpis.map(([label, value]) => createTunnelKpi(label, value)).join("")}
                    </div>
                </section>

                <section class="tunnel-detail-section" aria-labelledby="tunnel-progress-title">
                    <div class="tunnel-section-heading">
                        <h3 id="tunnel-progress-title">Genel İlerleme</h3>
                        <strong>${escapeTunnelDetailHtml(formatTunnelPercent(progress))}</strong>
                    </div>
                    <div class="tunnel-progress-track" role="progressbar" aria-label="Genel ilerleme"
                        aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress ?? 0}">
                        <span style="width: ${clampTunnelProgress(progress)}%"></span>
                    </div>
                </section>

                <section class="tunnel-detail-section" aria-labelledby="tunnel-info-title">
                    <h3 id="tunnel-info-title">Temel Bilgiler</h3>
                    <dl class="tunnel-info-list">
                        ${details.map(([label, value]) => createTunnelInfoRow(label, value)).join("")}
                    </dl>
                </section>
            </div>

            <div id="tunnel-faces-panel" class="tunnel-detail-tab-panel" role="tabpanel"
                data-tunnel-panel="faces" hidden>
                ${createTunnelFacesView(faces)}
            </div>

            <div id="tunnel-productions-panel" class="tunnel-detail-tab-panel" role="tabpanel"
                data-tunnel-panel="productions" hidden>
                ${createTunnelProductionsView(summary, faces)}
            </div>

            <div id="tunnel-history-panel" class="tunnel-detail-tab-panel" role="tabpanel"
                data-tunnel-panel="history" hidden>
                ${createTunnelHistoryIdle()}
            </div>

            <div id="tunnel-charts-panel" class="tunnel-detail-tab-panel" role="tabpanel"
                data-tunnel-panel="charts" hidden>
                <div class="tunnel-history-state">
                    Grafikler sekme açıldığında yüklenir.
                </div>
            </div>
        </div>
    `;

    bindTunnelDetailCloseButton();
    bindTunnelDetailTabs();
    bindTunnelFaceCards(faces);

    const cachedHistory = tunnelProgressCache.get(Number(asset.asset_id));

    if (cachedHistory) {
        renderTunnelHistory(cachedHistory);
    }

    applyPendingTunnelDetailView();
}

function createTunnelDetailHeader(asset = {}) {
    const assetCode = asset.asset_code || "Tünel";
    const assetName = asset.name || "Tünel Detayı";
    const status = asset.status;

    return `
        <header class="tunnel-detail-header">
            <div class="tunnel-detail-heading">
                <span class="tunnel-detail-code">${escapeTunnelDetailHtml(String(assetCode))}</span>
                <h2 id="tunnel-detail-title">${escapeTunnelDetailHtml(String(assetName))}</h2>
                ${status ? `<span class="tunnel-detail-status">${escapeTunnelDetailHtml(String(status))}</span>` : ""}
            </div>
            <button class="tunnel-detail-close" type="button" aria-label="Tünel detayını kapat">×</button>
        </header>
    `;
}

function bindTunnelDetailCloseButton() {
    tunnelDetailContent
        ?.querySelector(".tunnel-detail-close")
        ?.addEventListener("click", closeTunnelDetailDrawer);
}

function bindTunnelDetailTabs() {
    const tabs = tunnelDetailContent
        ?.querySelectorAll("[data-tunnel-tab]");

    tabs?.forEach((tab) => {
        tab.addEventListener("click", () => {
            activateTunnelDetailTab(tab.dataset.tunnelTab);
        });
    });
}

function activateTunnelDetailTab(target) {
    const targetTab = tunnelDetailContent
        ?.querySelector(`[data-tunnel-tab="${target}"]`);

    if (!targetTab) {
        return false;
    }

    tunnelDetailContent
        .querySelectorAll("[data-tunnel-tab]")
        .forEach((tab) => {
            const isActive = tab === targetTab;
            tab.classList.toggle("is-active", isActive);
            tab.setAttribute("aria-selected", String(isActive));
        });

    tunnelDetailContent
        .querySelectorAll("[data-tunnel-panel]")
        .forEach((panel) => {
            panel.hidden = panel.dataset.tunnelPanel !== target;
        });

    if (target === "history") {
        loadTunnelProgress(activeTunnelAssetId);
    }

    if (
        target === "charts" &&
        typeof loadTunnelCharts === "function"
    ) {
        loadTunnelCharts(activeTunnelAssetId);
    }

    return true;
}

function normalizeTunnelDetailView(options = {}) {
    const faceId = Number(options.faceId);
    const tab = String(options.tab ?? "").trim();

    if (!tab && !Number.isFinite(faceId)) {
        return null;
    }

    return {
        tab: tab || (Number.isFinite(faceId) ? "faces" : "general"),
        faceId: Number.isFinite(faceId) ? faceId : null
    };
}

function applyPendingTunnelDetailView() {
    if (!pendingTunnelDetailView) {
        return;
    }

    const target = pendingTunnelDetailView;

    if (!activateTunnelDetailTab(target.tab)) {
        return;
    }

    if (target.faceId !== null) {
        selectTunnelFaceCard(target.faceId, {
            scroll: true,
            syncMap: true
        });
    }

    pendingTunnelDetailView = null;
}

function openTunnelDetail(assetId, options = {}) {
    loadTunnelDetail(assetId, options);
}

window.openTunnelDetail = openTunnelDetail;

async function loadTunnelProgress(assetId, days = 30, force = false) {
    const normalizedAssetId = Number(assetId);
    const historyPanel = tunnelDetailContent
        ?.querySelector('[data-tunnel-panel="history"]');

    if (!Number.isFinite(normalizedAssetId) || !historyPanel) {
        return;
    }

    const cached = getCachedTunnelProgress(normalizedAssetId, days);

    if (!force && cached) {
        renderTunnelHistory(cached);
        return;
    }

    tunnelProgressRequestController?.abort();
    tunnelProgressRequestController = new AbortController();
    renderTunnelHistoryLoading();

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/tunnels/${encodeURIComponent(normalizedAssetId)}/progress?days=${encodeURIComponent(days)}`,
            {
                signal: tunnelProgressRequestController.signal
            }
        );

        if (!response.ok) {
            throw new Error(`API isteği başarısız: ${response.status}`);
        }

        const history = await response.json();

        if (activeTunnelAssetId !== normalizedAssetId) {
            return;
        }

        cacheTunnelProgressData(history);
        renderTunnelHistory(history);
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        if (activeTunnelAssetId !== normalizedAssetId) {
            return;
        }

        console.error("Tünel geçmişi yüklenemedi:", error);
        renderTunnelHistoryError(days);
    }
}

function getCachedTunnelProgress(assetId, days) {
    const cached = tunnelProgressCache.get(Number(assetId));

    if (!cached) {
        return null;
    }

    return cached.days >= days || cached.has_more === false
        ? cached
        : null;
}

function cacheTunnelProgressData(history) {
    const assetId = Number(history?.asset_id);
    const days = Number(history?.days);

    if (!Number.isFinite(assetId) || !Number.isFinite(days)) {
        return;
    }

    const cached = tunnelProgressCache.get(assetId);

    if (!cached || days >= Number(cached.days)) {
        tunnelProgressCache.set(assetId, history);
    }
}

function createTunnelHistoryIdle() {
    return `
        <div class="tunnel-history-state">
            Geçmiş kayıtları sekme açıldığında yüklenir.
        </div>
    `;
}

function renderTunnelHistoryLoading() {
    const panel = getTunnelHistoryPanel();

    if (!panel) {
        return;
    }

    panel.innerHTML = `
        <div class="tunnel-history-state">
            <span class="tunnel-detail-spinner" aria-hidden="true"></span>
            <span>Geçmiş kayıtları yükleniyor...</span>
        </div>
    `;
}

function renderTunnelHistoryError(days) {
    const panel = getTunnelHistoryPanel();

    if (!panel) {
        return;
    }

    panel.innerHTML = `
        <div class="tunnel-history-state tunnel-history-error">
            <span>Geçmiş kayıtları şu anda yüklenemiyor.</span>
            <button type="button" data-history-retry data-days="${Number(days)}">
                Tekrar Dene
            </button>
        </div>
    `;

    bindTunnelHistoryActions();
}

function renderTunnelHistory(history = {}) {
    const panel = getTunnelHistoryPanel();
    const records = Array.isArray(history.records) ? history.records : [];

    if (!panel) {
        return;
    }

    if (records.length === 0) {
        panel.innerHTML = `
            <div class="tunnel-faces-empty">
                <strong>Geçmiş kaydı bulunamadı</strong>
                <span>Bu tünel için gösterilecek ilerleme kaydı yok.</span>
            </div>
        `;
        return;
    }

    const recordsByDate = groupTunnelRecords(records, "date");

    panel.innerHTML = `
        <div class="tunnel-history-list">
            ${Array.from(recordsByDate.entries()).map(([date, dateRecords]) => {
                return createTunnelHistoryDateGroup(date, dateRecords);
            }).join("")}
        </div>

        ${history.has_more ? `
            <button class="tunnel-history-more" type="button" data-history-more
                data-days="${Number(history.days) + 30}">
                Daha Fazla Göster
            </button>
        ` : ""}
    `;

    bindTunnelHistoryActions();
}

function createTunnelHistoryDateGroup(date, records) {
    const recordsByFace = groupTunnelRecords(records, "face_id");

    return `
        <section class="tunnel-history-date-group">
            <header class="tunnel-history-date">
                <time datetime="${escapeTunnelDetailHtml(date)}">
                    ${escapeTunnelDetailHtml(formatTunnelLongDate(date))}
                </time>
            </header>

            <div class="tunnel-history-face-list">
                ${Array.from(recordsByFace.values()).map(createTunnelHistoryFaceCard).join("")}
            </div>
        </section>
    `;
}

function createTunnelHistoryFaceCard(records) {
    const face = records[0] ?? {};

    return `
        <article class="tunnel-history-face-card">
            <header>
                <strong>${escapeTunnelDetailHtml(formatTunnelFallback(face.face_code))}</strong>
                <span>${escapeTunnelDetailHtml(formatTunnelFallback(face.face_name))}</span>
            </header>

            <div class="tunnel-history-progress-list">
                ${records.map(createTunnelHistoryProgressRow).join("")}
            </div>
        </article>
    `;
}

function createTunnelHistoryProgressRow(record) {
    const supportDetails = [
        ...(Array.isArray(record.support_classes) ? record.support_classes : []),
        ...(Array.isArray(record.support_types) ? record.support_types : [])
    ];

    return `
        <div class="tunnel-history-progress-row">
            <div class="tunnel-history-progress-main">
                <span>${escapeTunnelDetailHtml(formatTunnelProgressType(record.progress_type))}</span>
                <strong>${escapeTunnelDetailHtml(formatTunnelLength(record.daily_progress))}</strong>
            </div>
            <div class="tunnel-history-progress-meta">
                <span>${escapeTunnelDetailHtml(formatTunnelKmRange(record.km_min, record.km_max))}</span>
                ${supportDetails.length > 0 ? `
                    <span>${escapeTunnelDetailHtml(supportDetails.join(" · "))}</span>
                ` : ""}
            </div>
        </div>
    `;
}

function bindTunnelHistoryActions() {
    const panel = getTunnelHistoryPanel();

    panel
        ?.querySelector("[data-history-more]")
        ?.addEventListener("click", (event) => {
            loadTunnelProgress(
                activeTunnelAssetId,
                Number(event.currentTarget.dataset.days),
                true
            );
        });

    panel
        ?.querySelector("[data-history-retry]")
        ?.addEventListener("click", (event) => {
            loadTunnelProgress(
                activeTunnelAssetId,
                Number(event.currentTarget.dataset.days),
                true
            );
        });
}

function getTunnelHistoryPanel() {
    return tunnelDetailContent
        ?.querySelector('[data-tunnel-panel="history"]');
}

function groupTunnelRecords(records, field) {
    return records.reduce((groups, record) => {
        const key = record[field];

        if (!groups.has(key)) {
            groups.set(key, []);
        }

        groups.get(key).push(record);
        return groups;
    }, new Map());
}

function formatTunnelProgressType(value) {
    const labels = {
        TOP_HEADING: "Üst Yarı",
        LEFT_BENCH: "Alt Yarı Sol",
        RIGHT_BENCH: "Alt Yarı Sağ",
        LEFT_INVERT: "Invert Sol",
        RIGHT_INVERT: "Invert Sağ"
    };

    return labels[value] ?? formatTunnelFallback(value);
}

function formatTunnelKmRange(kmMin, kmMax) {
    const start = formatKilometer(kmMin);
    const end = formatKilometer(kmMax);

    if (!start && !end) {
        return "-";
    }

    if (!start || !end || start === end) {
        return start ?? end;
    }

    return `${start} – ${end}`;
}

function formatTunnelLongDate(value) {
    const parts = String(value ?? "").slice(0, 10).split("-");
    const months = [
        "Oca", "Şub", "Mar", "Nis", "May", "Haz",
        "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"
    ];

    if (parts.length !== 3) {
        return formatTunnelFallback(value);
    }

    const month = months[Number(parts[1]) - 1];

    if (!month) {
        return formatTunnelFallback(value);
    }

    return `${Number(parts[2])} ${month} ${parts[0]}`;
}

function createTunnelFacesView(faces) {
    if (faces.length === 0) {
        return `
            <div class="tunnel-faces-empty">
                <strong>Ayna verisi bulunamadı</strong>
                <span>Bu tünel için gösterilecek ayna kaydı yok.</span>
            </div>
        `;
    }

    return `
        <div class="tunnel-face-list">
            ${faces.map(createTunnelFaceCard).join("")}
        </div>
    `;
}

function createTunnelFaceCard(face = {}) {
    const isActive = normalizeBoolean(face.is_active) === true;
    const faceId = Number(face.face_id);
    const longitude = Number(face.longitude);
    const latitude = Number(face.latitude);
    const isMappable =
        Number.isFinite(faceId) &&
        Number.isFinite(longitude) &&
        Number.isFinite(latitude);
    const hasClosure =
        normalizeBoolean(face.has_closure_records) === true ||
        Number(face.closure_record_count) > 0;

    const details = [
        ["Yön", formatTunnelDirection(face.direction)],
        ["Başlangıç KM", formatKilometer(face.km_start)],
        ["Mevcut / Son KM", formatKilometer(face.latest_km)],
        ["Toplam İlerleme", formatTunnelLength(face.total_progress)],
        ["Son Günlük İlerleme", formatTunnelLength(face.latest_daily_progress)],
        ["Toplam Forepoling", formatTunnelLength(face.total_forepoling)],
        ["Son Kayıt", formatTunnelDate(face.latest_record_date)]
    ];

    return `
        <article class="tunnel-face-card${isActive ? " is-active" : ""}${isMappable ? " is-mappable" : ""}"
            data-tunnel-face-id="${Number.isFinite(faceId) ? faceId : ""}"
            ${isMappable ? `role="button" tabindex="0" aria-label="${escapeTunnelDetailHtml(formatTunnelFallback(face.face_name))} aynasını haritada göster"` : ""}>
            <header class="tunnel-face-card-header">
                <div>
                    <span class="tunnel-face-code">${escapeTunnelDetailHtml(formatTunnelFallback(face.face_code))}</span>
                    <h3>${escapeTunnelDetailHtml(formatTunnelFallback(face.face_name))}</h3>
                </div>
                <span class="tunnel-face-state${isActive ? " is-active" : ""}">
                    ${isActive ? "Aktif" : "Kapalı"}
                </span>
            </header>

            <dl class="tunnel-face-details">
                ${details.map(([label, value]) => createTunnelInfoRow(label, value)).join("")}
            </dl>

            ${hasClosure ? createTunnelClosureInfo(face) : ""}
        </article>
    `;
}

function bindTunnelFaceCards(faces) {
    const facesById = new Map(
        faces.map((face) => [Number(face.face_id), face])
    );

    tunnelDetailContent
        ?.querySelectorAll("[data-tunnel-face-id]")
        .forEach((card) => {
            const faceId = Number(card.dataset.tunnelFaceId);
            const face = facesById.get(faceId);
            const longitude = Number(face?.longitude);
            const latitude = Number(face?.latitude);

            if (
                !face ||
                !Number.isFinite(longitude) ||
                !Number.isFinite(latitude)
            ) {
                return;
            }

            const focusFace = (event) => {
                if (event.target.closest("button, input, select, textarea, a")) {
                    return;
                }

                selectTunnelFaceCard(faceId, {
                    scroll: false,
                    syncMap: false
                });

                if (typeof focusTunnelFace === "function") {
                    focusTunnelFace(face);
                }
            };

            card.addEventListener("click", focusFace);
            card.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                    return;
                }

                event.preventDefault();
                focusFace(event);
            });
        });
}

function selectTunnelFaceCard(faceId, options = {}) {
    const normalizedFaceId = Number(faceId);
    const selectedCard = tunnelDetailContent
        ?.querySelector(`[data-tunnel-face-id="${normalizedFaceId}"]`);

    if (!selectedCard) {
        return false;
    }

    tunnelDetailContent
        .querySelectorAll("[data-tunnel-face-id]")
        .forEach((card) => {
            const isSelected = card === selectedCard;
            card.classList.toggle("is-selected", isSelected);
            card.setAttribute("aria-current", isSelected ? "true" : "false");
        });

    if (options.syncMap !== false && typeof setSelectedTunnelFace === "function") {
        setSelectedTunnelFace(normalizedFaceId);
    }

    if (options.scroll === true) {
        selectedCard.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }

    return true;
}

function createTunnelClosureInfo(face) {
    return `
        <div class="tunnel-closure-info">
            <strong>Kapanış Bilgisi</strong>
            <span>Kapanış KM: ${escapeTunnelDetailHtml(formatTunnelFallback(formatKilometer(face.current_closure_km)))}</span>
            <span>Son kapanış: ${escapeTunnelDetailHtml(formatTunnelDate(face.latest_closure_date))}</span>
            <span>Kayıt sayısı: ${escapeTunnelDetailHtml(formatTunnelCount(face.closure_record_count))}</span>
        </div>
    `;
}

function formatTunnelDirection(value) {
    const directionLabels = {
        INCREASING_KM: "Artan KM",
        DECREASING_KM: "Azalan KM",
        UNKNOWN: "Bilinmiyor"
    };

    return directionLabels[value] ?? formatTunnelFallback(value);
}

function createTunnelProductionsView(summary, faces) {
    const excavationValues = [
        summary.total_excavated_m,
        summary.left_bench_m,
        summary.right_bench_m,
        summary.left_invert_m,
        summary.right_invert_m
    ];
    const hasExcavationData = excavationValues.some(hasTunnelValue);
    const hasForepolingData =
        hasTunnelValue(summary.total_forepoling) ||
        hasTunnelValue(summary.forepoling_element_count) ||
        hasTunnelValue(summary.latest_forepoling_date);

    if (!hasExcavationData && !hasForepolingData) {
        return `
            <div class="tunnel-faces-empty">
                <strong>İmalat verisi bulunamadı</strong>
                <span>Bu tünel için gösterilecek güncel imalat kaydı yok.</span>
            </div>
        `;
    }

    const excavationMetrics = [
        ["Üst Yarı / Fiziksel", formatTunnelLength(summary.total_excavated_m)],
        ["Alt Yarı (Sol)", formatTunnelLength(summary.left_bench_m)],
        ["Alt Yarı (Sağ)", formatTunnelLength(summary.right_bench_m)],
        ["Invert (Sol)", formatTunnelLength(summary.left_invert_m)],
        ["Invert (Sağ)", formatTunnelLength(summary.right_invert_m)]
    ];
    const activeFaces = faces.filter(
        (face) => normalizeBoolean(face.is_active) === true
    );

    return `
        <div class="tunnel-production-view">
            <section class="tunnel-production-section">
                <header class="tunnel-production-heading">
                    <div>
                        <span>İmalat Durumu</span>
                        <h3>Kazı</h3>
                    </div>
                    <small>Çakışan fiziksel aralıklar tek sayılmıştır.</small>
                </header>

                <div class="tunnel-production-grid">
                    ${excavationMetrics.map(([label, value]) => createTunnelProductionMetric(label, value)).join("")}
                </div>

                ${createFaceExcavationDetails(faces)}
            </section>

            <section class="tunnel-production-section">
                <header class="tunnel-production-heading">
                    <div>
                        <span>Destek İmalatı</span>
                        <h3>Forepoling</h3>
                    </div>
                </header>

                <div class="tunnel-production-grid">
                    ${createTunnelProductionMetric("Toplam", formatTunnelLength(summary.total_forepoling))}
                    ${createTunnelProductionMetric("Eleman Sayısı", formatTunnelCount(summary.forepoling_element_count))}
                    ${createTunnelProductionMetric("Son Kayıt", formatTunnelDate(summary.latest_forepoling_date))}
                </div>

                ${createActiveFaceForepolingDetails(activeFaces)}
            </section>
        </div>
    `;
}

function createTunnelProductionMetric(label, value) {
    return `
        <div class="tunnel-production-metric">
            <span>${escapeTunnelDetailHtml(label)}</span>
            <strong>${escapeTunnelDetailHtml(value)}</strong>
        </div>
    `;
}

function createFaceExcavationDetails(faces) {
    const facesWithExcavation = faces.filter((face) => {
        return [
            face.total_progress,
            face.left_bench_m,
            face.right_bench_m,
            face.left_invert_m,
            face.right_invert_m
        ].some(hasTunnelValue);
    });

    if (facesWithExcavation.length === 0) {
        return "";
    }

    return `
        <div class="tunnel-production-subsection">
            <h4>Ayna Bazlı Kazı</h4>
            <div class="tunnel-production-face-list">
                ${facesWithExcavation.map((face) => `
                    <article class="tunnel-production-face-card">
                        <div class="tunnel-production-face-title">
                            <strong>${escapeTunnelDetailHtml(formatTunnelFallback(face.face_code))}</strong>
                            <span>${escapeTunnelDetailHtml(formatTunnelFallback(face.face_name))}</span>
                        </div>
                        <dl>
                            ${createTunnelProductionRow("Üst Yarı", formatTunnelLength(face.total_progress))}
                            ${createTunnelProductionRow("Alt Yarı Sol", formatTunnelLength(face.left_bench_m))}
                            ${createTunnelProductionRow("Alt Yarı Sağ", formatTunnelLength(face.right_bench_m))}
                            ${createTunnelProductionRow("Invert Sol", formatTunnelLength(face.left_invert_m))}
                            ${createTunnelProductionRow("Invert Sağ", formatTunnelLength(face.right_invert_m))}
                        </dl>
                    </article>
                `).join("")}
            </div>
        </div>
    `;
}

function createActiveFaceForepolingDetails(activeFaces) {
    if (activeFaces.length === 0) {
        return "";
    }

    return `
        <div class="tunnel-production-subsection">
            <h4>Aktif Aynalar</h4>
            <div class="tunnel-production-face-list">
                ${activeFaces.map((face) => `
                    <article class="tunnel-production-face-card is-active">
                        <div class="tunnel-production-face-title">
                            <strong>${escapeTunnelDetailHtml(formatTunnelFallback(face.face_code))}</strong>
                            <span>${escapeTunnelDetailHtml(formatTunnelFallback(face.face_name))}</span>
                        </div>
                        <dl>
                            ${createTunnelProductionRow("Toplam", formatTunnelLength(face.total_forepoling))}
                            ${createTunnelProductionRow("Eleman", formatTunnelCount(face.forepoling_element_count))}
                            ${createTunnelProductionRow("Son Kayıt", formatTunnelDate(face.latest_forepoling_date))}
                        </dl>
                    </article>
                `).join("")}
            </div>
        </div>
    `;
}

function createTunnelProductionRow(label, value) {
    return `
        <div>
            <dt>${escapeTunnelDetailHtml(label)}</dt>
            <dd>${escapeTunnelDetailHtml(value)}</dd>
        </div>
    `;
}

function hasTunnelValue(value) {
    return value !== null && value !== undefined && value !== "";
}

function createTunnelKpi(label, value) {
    return `
        <article class="tunnel-kpi-card">
            <span>${escapeTunnelDetailHtml(label)}</span>
            <strong>${escapeTunnelDetailHtml(value)}</strong>
        </article>
    `;
}

function createTunnelInfoRow(label, value) {
    return `
        <div class="tunnel-info-row">
            <dt>${escapeTunnelDetailHtml(label)}</dt>
            <dd>${escapeTunnelDetailHtml(formatTunnelFallback(value))}</dd>
        </div>
    `;
}

function getTunnelProgress(asset, summary) {
    const value = asset.progress_percent ?? summary.calculated_excavation_percent;
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

function clampTunnelProgress(value) {
    return Math.min(100, Math.max(0, value ?? 0));
}

function formatTunnelLength(value) {
    if (value === null || value === undefined || value === "") {
        return "-";
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return "-";
    }

    if (Math.abs(numericValue) >= 1000) {
        return `${(numericValue / 1000).toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })} km`;
    }

    return `${numericValue.toLocaleString("tr-TR", {
        maximumFractionDigits: 2
    })} m`;
}

function formatTunnelPercent(value) {
    if (value === null || !Number.isFinite(Number(value))) {
        return "-";
    }

    return `%${Number(value).toLocaleString("tr-TR", {
        maximumFractionDigits: 1
    })}`;
}

function formatTunnelCount(value) {
    if (value === null || value === undefined || value === "") {
        return "-";
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? String(numericValue) : "-";
}

function formatTunnelDate(value) {
    if (!value) {
        return "-";
    }

    const parts = String(value).slice(0, 10).split("-");

    if (parts.length !== 3) {
        return String(value);
    }

    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function formatTunnelFallback(value) {
    return value === null || value === undefined || value === ""
        ? "-"
        : String(value);
}

function escapeTunnelDetailHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
