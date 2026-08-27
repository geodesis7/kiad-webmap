"use strict";

const viaductDetailDrawer = document.getElementById("viaduct-detail-drawer");
const viaductDetailContent = document.getElementById("viaduct-detail-content");

let activeViaductAssetId = null;
let activeViaductSummary = null;
let viaductStructuresData = null;
let viaductSpansData = null;
let viaductSummaryController = null;
let viaductStructuresController = null;
let viaductSpansController = null;
let viaductStructuresLoading = false;
let viaductSpansLoading = false;

window.addEventListener("kiad:viaduct-detail-open", (event) => {
    loadViaductDetail(event.detail?.assetId);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isViaductDetailDrawerOpen()) {
        closeViaductDetailDrawer();
    }
});

async function loadViaductDetail(assetId) {
    const normalizedAssetId = Number(assetId);

    if (!Number.isFinite(normalizedAssetId)) {
        return;
    }

    if (typeof closeTunnelDetailDrawer === "function") {
        closeTunnelDetailDrawer();
    }

    if (
        normalizedAssetId === activeViaductAssetId &&
        isViaductDetailDrawerOpen()
    ) {
        return;
    }

    resetViaductSession(normalizedAssetId);
    showViaductDetailDrawer();
    renderViaductLoading();
    viaductSummaryController = new AbortController();

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/viaducts/${encodeURIComponent(normalizedAssetId)}/summary`,
            { signal: viaductSummaryController.signal }
        );

        if (!response.ok) {
            throw new Error(`API isteği başarısız: ${response.status}`);
        }

        const data = await response.json();

        if (activeViaductAssetId !== normalizedAssetId) {
            return;
        }

        activeViaductSummary = data;
        renderViaductDetail(data);
    } catch (error) {
        if (error.name === "AbortError" || activeViaductAssetId !== normalizedAssetId) {
            return;
        }

        console.error("Viyadük detayı yüklenemedi:", error);
        renderViaductError();
    }
}

function resetViaductSession(assetId = null) {
    viaductSummaryController?.abort();
    viaductStructuresController?.abort();
    viaductSpansController?.abort();
    activeViaductAssetId = assetId;
    activeViaductSummary = null;
    viaductStructuresData = null;
    viaductSpansData = null;
    viaductStructuresLoading = false;
    viaductSpansLoading = false;
}

function showViaductDetailDrawer() {
    if (!viaductDetailDrawer) {
        return;
    }

    viaductDetailDrawer.hidden = false;
    viaductDetailDrawer.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(() => viaductDetailDrawer.classList.add("is-open"));
}

function closeViaductDetailDrawer() {
    if (!viaductDetailDrawer) {
        return;
    }

    resetViaductSession();
    viaductDetailDrawer.classList.remove("is-open");
    viaductDetailDrawer.setAttribute("aria-hidden", "true");

    window.setTimeout(() => {
        if (!viaductDetailDrawer.classList.contains("is-open")) {
            viaductDetailDrawer.hidden = true;

            if (viaductDetailContent) {
                viaductDetailContent.innerHTML = "";
            }
        }
    }, 260);
}

function isViaductDetailDrawerOpen() {
    return Boolean(
        viaductDetailDrawer &&
        !viaductDetailDrawer.hidden &&
        viaductDetailDrawer.classList.contains("is-open")
    );
}

function renderViaductLoading() {
    if (!viaductDetailContent) {
        return;
    }

    viaductDetailContent.innerHTML = `
        ${createViaductHeader({ asset_code: "Viyadük Detayı", name: "Yükleniyor..." })}
        <div class="tunnel-detail-state">
            <span class="tunnel-detail-spinner" aria-hidden="true"></span>
            <span>Bilgiler yükleniyor...</span>
        </div>
    `;
    bindViaductCloseButton();
}

function renderViaductError() {
    if (!viaductDetailContent) {
        return;
    }

    viaductDetailContent.innerHTML = `
        ${createViaductHeader({ asset_code: "Viyadük Detayı", name: "Bilgiler alınamadı" })}
        <div class="tunnel-detail-state tunnel-detail-state-error">
            Viyadük bilgileri şu anda yüklenemiyor.
        </div>
    `;
    bindViaductCloseButton();
}

function renderViaductDetail(data = {}) {
    if (!viaductDetailContent) {
        return;
    }

    const asset = data.asset ?? {};
    const summary = data.summary ?? {};

    viaductDetailContent.innerHTML = `
        ${createViaductHeader(asset)}
        <div class="tunnel-detail-scroll">
            <div class="tunnel-detail-tabs viaduct-detail-tabs" role="tablist"
                aria-label="Viyadük detay görünümleri">
                ${createViaductTab("general", "Genel", true)}
                ${createViaductTab("concrete", "Betonarme")}
                ${createViaductTab("piles", "Fore Kazık")}
                ${createViaductTab("precast", "Prekast Kiriş")}
            </div>

            <div class="tunnel-detail-tab-panel" role="tabpanel" data-viaduct-panel="general">
                ${createViaductGeneralView(data)}
            </div>
            <div class="tunnel-detail-tab-panel" role="tabpanel" data-viaduct-panel="concrete" hidden>
                ${createViaductLazyState("Betonarme yapıları sekme açıldığında yüklenir.")}
            </div>
            <div class="tunnel-detail-tab-panel" role="tabpanel" data-viaduct-panel="piles" hidden>
                ${createViaductLazyState("Fore kazık özetleri sekme açıldığında yüklenir.")}
            </div>
            <div class="tunnel-detail-tab-panel" role="tabpanel" data-viaduct-panel="precast" hidden>
                ${createViaductLazyState("Prekast kiriş kayıtları sekme açıldığında yüklenir.")}
            </div>
        </div>
    `;

    bindViaductCloseButton();
    bindViaductTabs();

    if (summary.has_operational_data === false) {
        ["concrete", "piles", "precast"].forEach((tab) => {
            renderViaductPanel(tab, createViaductOperationalEmpty());
        });
    }
}

function createViaductHeader(asset = {}) {
    const assetCode = asset.asset_code || "Viyadük";
    const assetName = asset.name || "Viyadük Detayı";

    return `
        <header class="tunnel-detail-header">
            <div class="tunnel-detail-heading">
                <span class="tunnel-detail-code">${escapeViaductHtml(assetCode)}</span>
                <h2 id="viaduct-detail-title">${escapeViaductHtml(assetName)}</h2>
                ${hasViaductValue(asset.status) ? `
                    <span class="tunnel-detail-status">${escapeViaductHtml(asset.status)}</span>
                ` : ""}
            </div>
            <button class="tunnel-detail-close" type="button" aria-label="Viyadük detayını kapat">×</button>
        </header>
    `;
}

function createViaductTab(id, label, active = false) {
    return `
        <button class="tunnel-detail-tab${active ? " is-active" : ""}" type="button" role="tab"
            aria-selected="${active}" data-viaduct-tab="${id}">
            ${escapeViaductHtml(label)}
        </button>
    `;
}

function createViaductGeneralView(data = {}) {
    const asset = data.asset ?? {};
    const summary = data.summary ?? {};
    const concrete = data.concrete ?? {};
    const piles = data.piles ?? {};
    const precast = data.precast ?? {};
    const quality = data.quality ?? {};
    const hasOperationalData = summary.has_operational_data !== false;
    const concreteCounts = concrete.reported_status_counts ?? {};
    const concreteTotal = toFiniteNumber(concrete.record_count);
    const concreteCompleted = toFiniteNumber(concreteCounts.completed);
    const concreteProgress = concreteTotal > 0 && concreteCompleted !== null
        ? (concreteCompleted / concreteTotal) * 100
        : null;
    const girderCount = toFiniteNumber(precast.girder_record_count);
    const productionDateKnownCount = toFiniteNumber(precast.production_date_known_count);
    const precastCoverage = girderCount > 0 && productionDateKnownCount !== null
        ? (productionDateKnownCount / girderCount) * 100
        : null;
    const kpis = [
        ["Toplam Kazık", formatViaductCount(piles.planned_count), "planlı kazık"],
        ["Betonarme Yapılar", `${formatViaductCount(concrete.record_count)} kayıt`, "imalat kaydı"],
        ["Kiriş Adet", formatViaductCount(precast.girder_record_count), "prekast kiriş kaydı"]
    ];

    return `
        ${hasOperationalData ? `
            <section class="tunnel-detail-section">
                <h3>Operasyon Özeti</h3>
                <div class="tunnel-kpi-grid viaduct-kpi-grid">
                    ${kpis.map(([label, value, note]) => createViaductKpi(label, value, note)).join("")}
                </div>
            </section>

            <section class="tunnel-detail-section">
                <h3>İlerleme Göstergeleri</h3>
                <div class="viaduct-progress-list">
                    ${createViaductProgress(
                        "Kazık Adet İlerlemesi",
                        `${formatViaductCount(piles.completed_count)} / ${formatViaductCount(piles.planned_count)} kazık`,
                        piles.count_progress_percent,
                        "Güvenilir adet ilerlemesi"
                    )}
                    ${createViaductProgress(
                        "Betonarme İlerlemesi",
                        `${formatViaductCount(concreteCompleted)} / ${formatViaductCount(concreteTotal)} kayıt tamamlandı`,
                        concreteProgress,
                        "Kayıt bazlı tamamlanma"
                    )}
                    ${createViaductProgress(
                        "Kiriş Adet İlerlemesi",
                        `${formatViaductCount(productionDateKnownCount)} / ${formatViaductCount(girderCount)} üretim tarihi kayıtlı`,
                        precastCoverage,
                        "Üretim kaydı kapsamı"
                    )}
                </div>
            </section>
        ` : createViaductOperationalEmpty()}

        <section class="tunnel-detail-section">
            <h3>Temel Bilgiler</h3>
            <dl class="tunnel-info-list">
                ${createViaductInfoRow("Kesim", asset.section)}
                ${createViaductInfoRow("Başlangıç KM", formatViaductKm(asset.km_start))}
                ${createViaductInfoRow("Bitiş KM", formatViaductKm(asset.km_end))}
                ${createViaductInfoRow("Uzunluk", formatViaductLength(asset.length))}
                ${createViaductInfoRow("Son Aktivite", formatViaductDate(summary.latest_activity_date))}
            </dl>
        </section>

        ${createViaductQualityNotice(quality)}
    `;
}

function createViaductQualityNotice(quality = {}) {
    if (quality.has_warnings !== true) {
        return "";
    }

    return `
        <section class="viaduct-quality-notice" aria-label="Veri kalitesi uyarısı">
            <div>
                <strong>${escapeViaductHtml(formatViaductCount(quality.warning_count))} veri kalite uyarısı</strong>
                <span>İçe aktarma durumu: ${escapeViaductHtml(formatViaductValue(quality.import_status))}</span>
            </div>
            <time>${escapeViaductHtml(formatViaductDateTime(quality.latest_import_finished_at))}</time>
        </section>
    `;
}

function createViaductKpi(label, value, note = "") {
    return `
        <article class="tunnel-kpi-card">
            <span>${escapeViaductHtml(label)}</span>
            <strong>${escapeViaductHtml(value)}</strong>
            ${note ? `<small>${escapeViaductHtml(note)}</small>` : ""}
        </article>
    `;
}

function createViaductInfoRow(label, value) {
    return `
        <div class="tunnel-info-row">
            <dt>${escapeViaductHtml(label)}</dt>
            <dd>${escapeViaductHtml(formatViaductValue(value))}</dd>
        </div>
    `;
}

function createViaductProgress(label, ratioText, percent, note = "") {
    const value = toFiniteNumber(percent);
    const width = Math.min(100, Math.max(0, value ?? 0));

    return `
        <div class="viaduct-progress-item">
            <div class="viaduct-progress-heading">
                <div>
                    <strong>${escapeViaductHtml(label)}</strong>
                    <span>${escapeViaductHtml(ratioText)}</span>
                </div>
                <b>${escapeViaductHtml(formatViaductPercent(value))}</b>
            </div>
            <div class="tunnel-progress-track" role="progressbar" aria-label="${escapeViaductHtml(label)}"
                aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value ?? 0}">
                <span style="width: ${width}%"></span>
            </div>
            ${note ? `<small class="viaduct-progress-note">${escapeViaductHtml(note)}</small>` : ""}
        </div>
    `;
}

function createViaductStatusGrid(counts = {}) {
    const statuses = [
        ["Tamamlandı", counts.completed, "completed"],
        ["Devam Ediyor", counts.in_progress, "progress"],
        ["Başlanmadı", counts.not_started, "waiting"],
        ["Bilinmiyor", counts.unknown, "unknown"]
    ];

    return `
        <div class="viaduct-status-grid">
            ${statuses.map(([label, value, state]) => `
                <article class="viaduct-status-card is-${state}">
                    <span>${escapeViaductHtml(label)}</span>
                    <strong>${escapeViaductHtml(formatViaductCount(value))}</strong>
                </article>
            `).join("")}
        </div>
    `;
}

function bindViaductCloseButton() {
    viaductDetailContent
        ?.querySelector(".tunnel-detail-close")
        ?.addEventListener("click", closeViaductDetailDrawer);
}

function bindViaductTabs() {
    viaductDetailContent?.querySelectorAll("[data-viaduct-tab]").forEach((tab) => {
        tab.addEventListener("click", () => activateViaductTab(tab.dataset.viaductTab));
    });
}

function activateViaductTab(target) {
    const targetTab = viaductDetailContent?.querySelector(`[data-viaduct-tab="${target}"]`);

    if (!targetTab) {
        return;
    }

    viaductDetailContent.querySelectorAll("[data-viaduct-tab]").forEach((tab) => {
        const isActive = tab === targetTab;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
    });
    viaductDetailContent.querySelectorAll("[data-viaduct-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.viaductPanel !== target;
    });

    if (activeViaductSummary?.summary?.has_operational_data === false) {
        return;
    }

    if (target === "concrete" || target === "piles") {
        loadViaductStructures();
    } else if (target === "precast") {
        loadViaductSpans();
    }
}

async function loadViaductStructures(force = false) {
    const assetId = activeViaductAssetId;

    if (!Number.isFinite(assetId)) {
        return;
    }

    if (!force && viaductStructuresData) {
        renderViaductStructurePanels(viaductStructuresData);
        return;
    }

    if (!force && viaductStructuresLoading) {
        return;
    }

    renderViaductPanel("concrete", createViaductLoadingState("Betonarme yapıları yükleniyor..."));
    renderViaductPanel("piles", createViaductLoadingState("Fore kazık özetleri yükleniyor..."));
    viaductStructuresController?.abort();
    viaductStructuresController = new AbortController();
    viaductStructuresLoading = true;

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/viaducts/${encodeURIComponent(assetId)}/structures`,
            { signal: viaductStructuresController.signal }
        );

        if (!response.ok) {
            throw new Error(`API isteği başarısız: ${response.status}`);
        }

        const data = await response.json();

        if (activeViaductAssetId !== assetId) {
            return;
        }

        viaductStructuresData = data;
        renderViaductStructurePanels(data);
    } catch (error) {
        if (error.name === "AbortError" || activeViaductAssetId !== assetId) {
            return;
        }

        console.error("Viyadük yapıları yüklenemedi:", error);
        const retry = createViaductErrorState("Yapı bilgileri şu anda yüklenemiyor.", "structures");
        renderViaductPanel("concrete", retry);
        renderViaductPanel("piles", retry);
        bindViaductRetryButtons();
    } finally {
        if (activeViaductAssetId === assetId) {
            viaductStructuresLoading = false;
        }
    }
}

function renderViaductStructurePanels(data = {}) {
    const structures = Array.isArray(data.structures) ? data.structures : [];

    if (structures.length === 0) {
        const empty = createViaductOperationalEmpty();
        renderViaductPanel("concrete", empty);
        renderViaductPanel("piles", empty);
        return;
    }

    renderViaductPanel("concrete", `
        <div class="viaduct-card-list">
            ${structures.map(createViaductConcreteCard).join("")}
        </div>
    `);
    renderViaductPanel("piles", `
        <div class="viaduct-card-list">
            ${structures.map(createViaductPileCard).join("")}
        </div>
    `);
    bindViaductConcreteAccordions(structures);
}

function createViaductConcreteCard(structure = {}) {
    const concrete = structure.concrete ?? {};
    const counts = concrete.reported_status_counts ?? {};
    const elementCount = Array.isArray(concrete.elements) ? concrete.elements.length : 0;

    return `
        <details class="viaduct-structure-card" data-concrete-structure="${escapeViaductHtml(structure.structure_id)}">
            <summary>
                <div class="viaduct-card-title">
                    <span>${escapeViaductHtml(formatViaductValue(structure.structure_type))}</span>
                    <strong>${escapeViaductHtml(formatViaductValue(structure.structure_code))}</strong>
                    <small>${escapeViaductHtml(formatViaductKm(structure.km))}</small>
                </div>
                <div class="viaduct-card-summary">
                    <strong>${escapeViaductHtml(formatViaductCount(concrete.record_count))} kayıt</strong>
                    <span>${escapeViaductHtml(formatViaductDate(concrete.latest_activity_date))}</span>
                </div>
            </summary>
            <div class="viaduct-card-body">
                ${createViaductStatusGrid(counts)}
                ${elementCount > 0 ? `
                    <div class="viaduct-elements" data-structure-elements>
                        ${createViaductLoadingState("Eleman detayları hazırlanıyor...")}
                    </div>
                ` : `<div class="viaduct-inline-empty">Betonarme eleman kaydı bulunmuyor.</div>`}
            </div>
        </details>
    `;
}

function bindViaductConcreteAccordions(structures) {
    const byId = new Map(structures.map((structure) => [String(structure.structure_id), structure]));

    viaductDetailContent?.querySelectorAll("[data-concrete-structure]").forEach((details) => {
        details.addEventListener("toggle", () => {
            const container = details.querySelector("[data-structure-elements]");

            if (!details.open || !container || container.dataset.loaded === "true") {
                return;
            }

            const structure = byId.get(details.dataset.concreteStructure);
            const elements = Array.isArray(structure?.concrete?.elements)
                ? structure.concrete.elements
                : [];
            container.innerHTML = elements.map(createViaductElement).join("");
            container.dataset.loaded = "true";
        });
    });
}

function createViaductElement(element = {}) {
    const title = [element.element_type, hasViaductValue(element.stage_no) ? `Etap ${element.stage_no}` : null]
        .filter(Boolean).join(" · ");
    const rows = [
        ["Durum", element.status],
        ["Donatı", formatViaductMetric(element.rebar_quantity_kg, "kg")],
        ["Donatı Başlangıç", formatViaductDate(element.rebar_start_date)],
        ["Donatı Bitiş", formatViaductDate(element.rebar_end_date)],
        ["Beton", formatViaductMetric(element.concrete_quantity_m3, "m³")],
        ["Beton Başlangıç", formatViaductDate(element.concrete_start_date)],
        ["Beton Bitiş", formatViaductDate(element.concrete_end_date)],
        ["Not", element.note ?? element.notes]
    ].filter(([, value]) => hasViaductValue(value) && value !== "-");

    return `
        <article class="viaduct-element-card">
            <strong>${escapeViaductHtml(title || "Betonarme Elemanı")}</strong>
            ${rows.length > 0 ? `
                <dl>${rows.map(([label, value]) => `
                    <div><dt>${escapeViaductHtml(label)}</dt><dd>${escapeViaductHtml(value)}</dd></div>
                `).join("")}</dl>
            ` : `<span>Ek detay bulunmuyor.</span>`}
        </article>
    `;
}

function createViaductPileCard(structure = {}) {
    const piles = structure.piles ?? {};

    return `
        <article class="viaduct-pile-card">
            <header>
                <div>
                    <span>${escapeViaductHtml(formatViaductValue(structure.structure_type))}</span>
                    <strong>${escapeViaductHtml(formatViaductValue(structure.structure_code))}</strong>
                </div>
                ${piles.summary_is_consistent === false ? `
                    <span class="viaduct-warning-badge">Özet uyuşmazlığı</span>
                ` : ""}
            </header>
            ${createViaductProgress(
                "Kazık Adet İlerlemesi",
                `${formatViaductCount(piles.completed_count)} / ${formatViaductCount(piles.planned_count)}`,
                piles.progress_percent
            )}
            <dl class="viaduct-compact-info">
                ${createViaductCompactRow("Çap", formatViaductMetric(piles.diameter_mm, "mm"))}
                ${createViaductCompactRow("Planlanan Boy", formatViaductMeters(piles.planned_length_m))}
                ${createViaductCompactRow("Tamamlanan Boy", formatViaductMeters(piles.completed_length_m))}
                ${createViaductCompactRow("Başlangıç", formatViaductDate(piles.start_date))}
                ${createViaductCompactRow("Bitiş", formatViaductDate(piles.finish_date))}
            </dl>
        </article>
    `;
}

async function loadViaductSpans(force = false) {
    const assetId = activeViaductAssetId;

    if (!Number.isFinite(assetId)) {
        return;
    }

    if (!force && viaductSpansData) {
        renderViaductSpans(viaductSpansData);
        return;
    }

    if (!force && viaductSpansLoading) {
        return;
    }

    renderViaductPanel("precast", createViaductLoadingState("Prekast kiriş kayıtları yükleniyor..."));
    viaductSpansController?.abort();
    viaductSpansController = new AbortController();
    viaductSpansLoading = true;

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/viaducts/${encodeURIComponent(assetId)}/spans`,
            { signal: viaductSpansController.signal }
        );

        if (!response.ok) {
            throw new Error(`API isteği başarısız: ${response.status}`);
        }

        const data = await response.json();

        if (activeViaductAssetId !== assetId) {
            return;
        }

        viaductSpansData = data;
        renderViaductSpans(data);
    } catch (error) {
        if (error.name === "AbortError" || activeViaductAssetId !== assetId) {
            return;
        }

        console.error("Prekast kiriş kayıtları yüklenemedi:", error);
        renderViaductPanel("precast", createViaductErrorState(
            "Prekast kiriş kayıtları şu anda yüklenemiyor.",
            "spans"
        ));
        bindViaductRetryButtons();
    } finally {
        if (activeViaductAssetId === assetId) {
            viaductSpansLoading = false;
        }
    }
}

function renderViaductSpans(data = {}) {
    const spans = Array.isArray(data.spans) ? data.spans : [];

    if (spans.length === 0) {
        renderViaductPanel("precast", createViaductOperationalEmpty());
        return;
    }

    renderViaductPanel("precast", `
        <div class="viaduct-span-list">
            ${spans.map(createViaductSpanCard).join("")}
        </div>
    `);
}

function createViaductSpanCard(span = {}) {
    return `
        <article class="viaduct-span-card">
            <header>
                <strong>${escapeViaductHtml(formatViaductValue(span.span_code))}</strong>
                <span>${escapeViaductHtml(formatViaductCount(span.girder_record_count))} kiriş kaydı</span>
            </header>
            <dl class="viaduct-compact-info">
                ${createViaductCompactRow("Durumu Bilinen", formatViaductCount(span.status_known_count))}
                ${createViaductCompactRow("Durumu Bilinmeyen", formatViaductCount(span.status_unknown_count))}
                ${createViaductCompactRow("Üretim Tarihi Bilinen", formatViaductCount(span.production_date_known_count))}
                ${createViaductCompactRow("Üretim Tarihi Bilinmeyen", formatViaductCount(span.production_date_unknown_count))}
                ${createViaductCompactRow("İlk Üretim", formatViaductDate(span.earliest_production_date))}
                ${createViaductCompactRow("Son Üretim", formatViaductDate(span.latest_production_date))}
                ${createViaductCompactRow("Kayıtlı Miktar", formatViaductMetric(span.recorded_quantity, "adet"))}
                ${createViaductCompactRow("Toplam Boy", formatViaductMeters(span.recorded_total_length_m))}
                ${createViaductCompactRow("Donatı", formatViaductMetric(span.recorded_rebar_quantity_kg, "kg"))}
                ${createViaductCompactRow("Beton", formatViaductMetric(span.recorded_concrete_quantity_m3, "m³"))}
            </dl>
        </article>
    `;
}

function createViaductCompactRow(label, value) {
    if (!hasViaductValue(value) || value === "-") {
        return "";
    }

    return `<div><dt>${escapeViaductHtml(label)}</dt><dd>${escapeViaductHtml(value)}</dd></div>`;
}

function renderViaductPanel(id, html) {
    const panel = viaductDetailContent?.querySelector(`[data-viaduct-panel="${id}"]`);

    if (panel) {
        panel.innerHTML = html;
    }
}

function createViaductLazyState(message) {
    return `<div class="tunnel-history-state">${escapeViaductHtml(message)}</div>`;
}

function createViaductLoadingState(message) {
    return `
        <div class="tunnel-history-state">
            <span class="tunnel-detail-spinner" aria-hidden="true"></span>
            <span>${escapeViaductHtml(message)}</span>
        </div>
    `;
}

function createViaductErrorState(message, requestType) {
    return `
        <div class="tunnel-history-state tunnel-history-error">
            <span>${escapeViaductHtml(message)}</span>
            <button type="button" data-viaduct-retry="${escapeViaductHtml(requestType)}">Tekrar Dene</button>
        </div>
    `;
}

function bindViaductRetryButtons() {
    viaductDetailContent?.querySelectorAll("[data-viaduct-retry]").forEach((button) => {
        button.addEventListener("click", () => {
            if (button.dataset.viaductRetry === "structures") {
                loadViaductStructures(true);
            } else {
                loadViaductSpans(true);
            }
        });
    });
}

function createViaductOperationalEmpty() {
    return `
        <div class="tunnel-faces-empty">
            <strong>Operasyon verisi bulunmuyor</strong>
            <span>Bu viyadük için henüz operasyon verisi bulunmuyor.</span>
        </div>
    `;
}

function formatViaductKm(value) {
    return typeof formatKilometer === "function"
        ? (formatKilometer(value) ?? "-")
        : formatViaductValue(value);
}

function formatViaductLength(value) {
    return typeof formatLength === "function"
        ? (formatLength(value) ?? "-")
        : formatViaductValue(value);
}

function formatViaductMeters(value) {
    return formatViaductMetric(value, "m");
}

function formatViaductMetric(value, unit) {
    return typeof formatMetricValue === "function"
        ? (formatMetricValue(value, unit) ?? "-")
        : formatViaductValue(value);
}

function formatViaductPercent(value) {
    return typeof formatPercent === "function"
        ? (formatPercent(value, 2) ?? "-")
        : formatViaductValue(value);
}

function formatViaductDate(value) {
    return typeof formatPopupDate === "function"
        ? (formatPopupDate(value) ?? "-")
        : formatViaductValue(value);
}

function formatViaductDateTime(value) {
    return typeof formatPopupDateTime === "function"
        ? (formatPopupDateTime(value) ?? "-")
        : formatViaductValue(value);
}

function formatViaductCount(value) {
    const number = toFiniteNumber(value);

    return number === null
        ? "-"
        : number.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
}

function formatViaductValue(value) {
    return hasViaductValue(value) ? String(value) : "-";
}

function hasViaductValue(value) {
    return value !== null && value !== undefined && value !== "";
}

function escapeViaductHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

window.openViaductDetail = loadViaductDetail;
window.closeViaductDetailDrawer = closeViaductDetailDrawer;
