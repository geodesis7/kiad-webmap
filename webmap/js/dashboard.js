"use strict";

const tunnelDashboard = document.getElementById("tunnel-dashboard");
const dashboardContent = document.getElementById("dashboard-content");
const dashboardToggle = document.getElementById("dashboard-toggle");

let tunnelDashboardData = null;
let tunnelProgressSummaryData = null;
let viaductDashboardData = null;
let dashboardRequestController = null;
let tunnelDashboardChart = null;
let dashboardActiveView = "project";
let dashboardAssetCount = null;

dashboardToggle?.addEventListener("click", () => {
    if (isTunnelDashboardOpen()) {
        closeTunnelDashboard();
    } else {
        openTunnelDashboard();
    }
});

window.addEventListener("kiad:layout-changed", () => {
    tunnelDashboardChart?.resize();
});

window.addEventListener("kiad:assets-loaded", (event) => {
    const count = Number(event.detail?.count);
    dashboardAssetCount = Number.isFinite(count) ? count : dashboardAssetCount;

    if (isTunnelDashboardOpen() && dashboardActiveView === "project") {
        renderActiveDashboard();
    }
});

async function openTunnelDashboard(force = false) {
    if (!tunnelDashboard || !dashboardContent) {
        return;
    }

    showTunnelDashboard();

    if (!force) {
        dashboardActiveView = "project";
    }

    if (!force && tunnelDashboardData && tunnelProgressSummaryData && viaductDashboardData) {
        renderActiveDashboard();
        return;
    }

    dashboardRequestController?.abort();
    dashboardRequestController = new AbortController();
    renderTunnelDashboardLoading();

    try {
        const [tunnelResponse, progressSummaryResponse, viaductResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/dashboard/tunnels`, {
                signal: dashboardRequestController.signal
            }),
            fetch(`${API_BASE_URL}/api/tunnels/progress-summary`, {
                signal: dashboardRequestController.signal
            }),
            fetch(`${API_BASE_URL}/api/dashboard/viaducts`, {
                signal: dashboardRequestController.signal
            })
        ]);

        if (!tunnelResponse.ok || !progressSummaryResponse.ok || !viaductResponse.ok) {
            throw new Error(
                `API isteği başarısız: tunnels=${tunnelResponse.status}, ` +
                `progress=${progressSummaryResponse.status}, viaducts=${viaductResponse.status}`
            );
        }

        [tunnelDashboardData, tunnelProgressSummaryData, viaductDashboardData] = await Promise.all([
            tunnelResponse.json(),
            progressSummaryResponse.json(),
            viaductResponse.json()
        ]);
        dashboardAssetCount = getDashboardAssetCount();

        if (isTunnelDashboardOpen()) {
            renderActiveDashboard();
        }
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        console.error("Tünel dashboard'u yüklenemedi:", error);

        if (isTunnelDashboardOpen()) {
            renderTunnelDashboardError();
        }
    }
}

function showTunnelDashboard() {
    tunnelDashboard.hidden = false;
    tunnelDashboard.setAttribute("aria-hidden", "false");
    dashboardToggle?.setAttribute("aria-expanded", "true");

    window.requestAnimationFrame(() => {
        tunnelDashboard.classList.add("is-open");
        tunnelDashboardChart?.resize();
    });
}

function closeTunnelDashboard() {
    if (!tunnelDashboard) {
        return;
    }

    tunnelDashboard.classList.remove("is-open");
    tunnelDashboard.setAttribute("aria-hidden", "true");
    dashboardToggle?.setAttribute("aria-expanded", "false");

    window.setTimeout(() => {
        if (!tunnelDashboard.classList.contains("is-open")) {
            tunnelDashboard.hidden = true;
        }
    }, 220);
}

function isTunnelDashboardOpen() {
    return Boolean(
        tunnelDashboard &&
        !tunnelDashboard.hidden &&
        tunnelDashboard.classList.contains("is-open")
    );
}

function renderTunnelDashboardLoading() {
    destroyTunnelDashboardChart();
    dashboardContent.innerHTML = `
        ${createTunnelDashboardHeader()}
        <div class="dashboard-state">
            <span class="tunnel-detail-spinner" aria-hidden="true"></span>
            <span>Proje yönetici özeti yükleniyor...</span>
        </div>
    `;
    bindTunnelDashboardCommonEvents();
}

function renderTunnelDashboardError() {
    destroyTunnelDashboardChart();
    dashboardContent.innerHTML = `
        ${createTunnelDashboardHeader()}
        <div class="dashboard-state dashboard-state-error">
            <strong>Dashboard verileri alınamadı</strong>
            <span>Lütfen bağlantıyı kontrol edip yeniden deneyin.</span>
            <button class="dashboard-retry" type="button">Yeniden Dene</button>
        </div>
    `;
    bindTunnelDashboardCommonEvents();
    dashboardContent
        .querySelector(".dashboard-retry")
        ?.addEventListener("click", () => openTunnelDashboard(true));
}

function renderTunnelDashboard(data = {}, progressData = {}) {
    const schematicTunnels = getCanonicalTunnelPortfolio(progressData, data.tunnels);
    const summary = createCanonicalTunnelSummary(schematicTunnels, data.summary);
    const activeFaces = Array.isArray(data.active_faces)
        ? data.active_faces
        : [];
    const dailyProgress = Array.isArray(data.daily_progress)
        ? data.daily_progress
        : [];

    dashboardContent.innerHTML = `
        ${createTunnelDashboardHeader(summary.latest_record_date)}
        ${createDashboardNavigation("tunnels")}
        <div class="dashboard-scroll">
            ${createDashboardKpis(summary)}

            <div class="dashboard-grid">
                <section class="dashboard-card dashboard-tunnels" aria-labelledby="dashboard-tunnels-title">
                    <div class="dashboard-card-heading">
                        <div>
                            <span>Tünel Portföyü</span>
                            <h3 id="dashboard-tunnels-title">Tünel İlerlemesi</h3>
                        </div>
                        <strong>${formatDashboardCount(schematicTunnels.length)}</strong>
                    </div>
                    ${createDashboardTunnelList(schematicTunnels)}
                </section>

                <section class="dashboard-card dashboard-trend" aria-labelledby="dashboard-trend-title">
                    <div class="dashboard-card-heading">
                        <div>
                            <span>Son 7 Gün</span>
                            <h3 id="dashboard-trend-title">Günlük Fiziksel İlerleme</h3>
                        </div>
                        <strong>${formatDashboardLength(summary.last_7_days_progress)}</strong>
                    </div>
                    ${createDashboardChartView(dailyProgress)}
                </section>

                <section class="dashboard-card dashboard-faces" aria-labelledby="dashboard-faces-title">
                    <div class="dashboard-card-heading">
                        <div>
                            <span>Operasyon</span>
                            <h3 id="dashboard-faces-title">Aktif Aynalar</h3>
                        </div>
                        <strong>${formatDashboardCount(activeFaces.length)}</strong>
                    </div>
                    ${createDashboardFaceList(activeFaces)}
                </section>
            </div>
        </div>
    `;

    bindTunnelDashboardCommonEvents();
    bindDashboardTunnelEvents(schematicTunnels);
    bindDashboardFaceEvents(activeFaces);
    renderTunnelDashboardChart(dailyProgress);
}

function createTunnelDashboardHeader(latestRecordDate = null) {
    return `
        <header class="dashboard-header">
            <div>
                <span class="dashboard-eyebrow">Proje Genel Durumu</span>
                <h2 id="dashboard-title">KIAD Yönetici Özeti</h2>
                <p>Tünel ve viyadük operasyonlarının güncel yönetici görünümü</p>
            </div>
            <div class="dashboard-header-actions">
                ${latestRecordDate ? `
                    <span class="dashboard-updated">
                        Son veri ${escapeDashboardHtml(formatDashboardDate(latestRecordDate))}
                    </span>
                ` : ""}
                <button class="dashboard-close" type="button" aria-label="Dashboard'u kapat">×</button>
            </div>
        </header>
    `;
}

function createDashboardNavigation(activeView) {
    const views = [
        ["project", "Proje Genel"],
        ["tunnels", "Tüneller"],
        ["viaducts", "Viyadükler"]
    ];

    return `
        <nav class="dashboard-navigation" aria-label="Dashboard görünümleri">
            ${views.map(([id, label]) => `
                <button class="dashboard-navigation-tab${activeView === id ? " is-active" : ""}"
                    type="button" data-dashboard-view="${id}"
                    aria-current="${activeView === id ? "page" : "false"}">
                    ${escapeDashboardHtml(label)}
                </button>
            `).join("")}
        </nav>
    `;
}

function renderActiveDashboard() {
    if (!tunnelDashboardData || !tunnelProgressSummaryData || !viaductDashboardData) {
        return;
    }

    if (dashboardActiveView === "tunnels") {
        renderTunnelDashboard(tunnelDashboardData, tunnelProgressSummaryData);
    } else if (dashboardActiveView === "viaducts") {
        renderViaductDashboard(viaductDashboardData);
    } else {
        dashboardActiveView = "project";
        renderProjectDashboard(
            tunnelDashboardData,
            viaductDashboardData,
            tunnelProgressSummaryData
        );
    }
}

function renderProjectDashboard(tunnelData = {}, viaductData = {}, progressData = {}) {
    destroyTunnelDashboardChart();

    const tunnelPortfolio = getCanonicalTunnelPortfolio(progressData, tunnelData.tunnels);
    const tunnelSummary = createCanonicalTunnelSummary(
        tunnelPortfolio,
        tunnelData.summary
    );
    const viaductSummary = viaductData.summary ?? {};
    const viaducts = Array.isArray(viaductData.viaducts) ? viaductData.viaducts : [];
    const latestDataDate = getLatestDashboardDate(
        tunnelSummary.latest_record_date,
        viaductSummary.latest_activity_date,
        viaductSummary.latest_import_finished_at
    );

    dashboardContent.innerHTML = `
        ${createTunnelDashboardHeader(latestDataDate)}
        ${createDashboardNavigation("project")}
        <div class="dashboard-scroll">
            ${createProjectDashboardKpis(tunnelSummary, viaductSummary, latestDataDate)}

            <div class="dashboard-project-summaries">
                ${createProjectTunnelSummary(tunnelSummary)}
                ${createProjectViaductSummary(viaductSummary, viaducts)}
            </div>

            <div class="dashboard-project-panels">
                ${createProjectActivityPanel(tunnelSummary, viaductSummary)}
                ${createProjectOperationsPanel(tunnelSummary, viaductSummary)}
                ${createProjectQualityPanel(viaductSummary)}
            </div>
        </div>
    `;

    bindTunnelDashboardCommonEvents();
    bindProjectSummaryEvents();
}

function createProjectDashboardKpis(tunnelSummary, viaductSummary, latestDataDate) {
    const kpis = [
        ["Toplam Varlık", formatDashboardNumber(dashboardAssetCount), "mevcut proje varlıkları"],
        ["Operasyonel Tünel", formatDashboardNumber(tunnelSummary.active_tunnel_count), "veri bulunan"],
        ["Operasyonel Viyadük", formatDashboardNumber(viaductSummary.data_ready_viaduct_count), "veri hazır"],
        ["Aktif Tünel Aynası", formatDashboardNumber(tunnelSummary.active_face_count), "aktif operasyon"],
        ["Son Veri Güncellemesi", formatDashboardDate(latestDataDate), "tünel + viyadük"],
        ["Veri Kalite Uyarısı", formatDashboardNumber(viaductSummary.quality_warning_count), "mevcut viyadük kayıtları"]
    ];

    return `
        <section class="dashboard-kpi-grid dashboard-project-kpis" aria-label="Proje genel göstergeleri">
            ${kpis.map(([label, value, note]) => `
                <article class="dashboard-kpi">
                    <span>${escapeDashboardHtml(label)}</span>
                    <strong>${escapeDashboardHtml(value)}</strong>
                    <small>${escapeDashboardHtml(note)}</small>
                </article>
            `).join("")}
        </section>
    `;
}

function createProjectTunnelSummary(summary = {}) {
    return `
        <button class="dashboard-summary-card" type="button" data-project-summary-view="tunnels">
            <div class="dashboard-card-heading">
                <div>
                    <span>Tünel Operasyonları</span>
                    <h3>Tüneller</h3>
                </div>
                <b aria-hidden="true">→</b>
            </div>
            <dl class="dashboard-summary-metrics">
                ${createDashboardMetric("Toplam Tünel", formatDashboardNumber(summary.total_tunnel_count))}
                ${createDashboardMetric("Operasyonel Tünel", formatDashboardNumber(summary.active_tunnel_count))}
                ${createDashboardMetric("Aktif Ayna", formatDashboardNumber(summary.active_face_count))}
                ${createDashboardProgressMetric(
                    "Kazı İlerlemesi",
                    formatDashboardPrecisePercent(summary.overall_progress_percent),
                    "toplam tünel uzunluğuna oranlı"
                )}
                ${createDashboardMetric("Son 7 Gün", formatDashboardLength(summary.last_7_days_progress))}
                ${createDashboardMetric("En Son Aktivite", formatDashboardDate(summary.latest_record_date))}
            </dl>
        </button>
    `;
}

function createProjectViaductSummary(summary = {}, viaducts = []) {
    const concrete = aggregateDashboardConcreteProgress(viaducts);
    const precast = aggregateDashboardPrecastCoverage(viaducts);

    return `
        <button class="dashboard-summary-card" type="button" data-project-summary-view="viaducts">
            <div class="dashboard-card-heading">
                <div>
                    <span>Viyadük Operasyonları</span>
                    <h3>Viyadükler</h3>
                </div>
                <b aria-hidden="true">→</b>
            </div>
            <dl class="dashboard-summary-metrics">
                ${createDashboardMetric("Toplam / Operasyonel", `${formatDashboardNumber(summary.total_viaduct_count)} / ${formatDashboardNumber(summary.data_ready_viaduct_count)}`)}
                ${createDashboardMetric("Toplam Yapı", formatDashboardNumber(summary.structure_count))}
                ${createDashboardProgressMetric(
                    "Kazık İlerlemesi",
                    formatDashboardPrecisePercent(summary.pile_count_progress_percent),
                    `${formatDashboardNumber(summary.completed_pile_count)} / ${formatDashboardNumber(summary.planned_pile_count)} kazık`
                )}
                ${createDashboardProgressMetric(
                    "Betonarme İlerlemesi",
                    formatDashboardPrecisePercent(concrete.percent),
                    `Kayıt bazlı · ${formatDashboardNumber(concrete.completed)} / ${formatDashboardNumber(concrete.total)}`
                )}
                ${createDashboardProgressMetric(
                    "Prekast İlerlemesi",
                    formatDashboardPrecisePercent(precast.percent),
                    `Üretim kaydı kapsamı · ${formatDashboardNumber(precast.knownCount)} / ${formatDashboardNumber(precast.recordCount)}`
                )}
                ${createDashboardMetric("En Son Aktivite", formatDashboardDate(summary.latest_activity_date))}
            </dl>
        </button>
    `;
}

function createDashboardProgressMetric(label, value, note) {
    return `
        <div class="dashboard-summary-progress">
            <dt>${escapeDashboardHtml(label)}<small>${escapeDashboardHtml(note)}</small></dt>
            <dd>${escapeDashboardHtml(value)}</dd>
        </div>
    `;
}

function aggregateDashboardConcreteProgress(viaducts = []) {
    const totals = viaducts.reduce((result, viaduct) => {
        const counts = getDashboardViaductConcreteCounts(viaduct);
        if (!counts) return result;

        result.completed += counts.completed;
        result.total += counts.completed + counts.in_progress + counts.not_started + counts.unknown;
        return result;
    }, { completed: 0, total: 0 });

    return {
        ...totals,
        percent: totals.total > 0 ? (totals.completed / totals.total) * 100 : null
    };
}

function aggregateDashboardPrecastCoverage(viaducts = []) {
    const totals = viaducts.reduce((result, viaduct) => {
        const coverage = getDashboardViaductPrecastCoverage(viaduct);
        if (!coverage) return result;

        result.knownCount += coverage.knownCount;
        result.recordCount += coverage.recordCount;
        return result;
    }, { knownCount: 0, recordCount: 0 });

    return {
        ...totals,
        percent: totals.recordCount > 0 ? (totals.knownCount / totals.recordCount) * 100 : null
    };
}

function createProjectActivityPanel(tunnelSummary, viaductSummary) {
    return `
        <section class="dashboard-card dashboard-project-panel">
            <div class="dashboard-card-heading">
                <div><span>Güncellik</span><h3>Son Aktivite</h3></div>
            </div>
            <dl class="dashboard-panel-rows">
                ${createDashboardMetric("Tünel son kaydı", formatDashboardDate(tunnelSummary.latest_record_date))}
                ${createDashboardMetric("Viyadük son kaydı", formatDashboardDate(viaductSummary.latest_activity_date))}
                ${createDashboardMetric("Son viyadük importu", formatDashboardDateTime(viaductSummary.latest_import_finished_at))}
            </dl>
        </section>
    `;
}

function createProjectOperationsPanel(tunnelSummary, viaductSummary) {
    return `
        <section class="dashboard-card dashboard-project-panel">
            <div class="dashboard-card-heading">
                <div><span>Operasyon</span><h3>Aktif Operasyonlar</h3></div>
            </div>
            <dl class="dashboard-panel-rows">
                ${createDashboardMetric("Aktif tünel aynası", formatDashboardNumber(tunnelSummary.active_face_count))}
                ${createDashboardMetric("Operasyonel tünel", formatDashboardNumber(tunnelSummary.active_tunnel_count))}
                ${createDashboardMetric("Operasyonel viyadük", formatDashboardNumber(viaductSummary.data_ready_viaduct_count))}
            </dl>
        </section>
    `;
}

function createProjectQualityPanel(viaductSummary) {
    const warningCount = Number(viaductSummary.quality_warning_count) || 0;

    return `
        <section class="dashboard-card dashboard-project-panel${warningCount > 0 ? " has-warning" : ""}">
            <div class="dashboard-card-heading">
                <div><span>Kontrol</span><h3>Veri Kalitesi</h3></div>
                <strong>${escapeDashboardHtml(formatDashboardNumber(warningCount))}</strong>
            </div>
            <dl class="dashboard-panel-rows">
                ${createDashboardMetric("Viyadük uyarıları", formatDashboardNumber(warningCount))}
                ${createDashboardMetric("Tünel uyarı metriği", "Sağlanmıyor")}
            </dl>
        </section>
    `;
}

function createDashboardMetric(label, value) {
    return `
        <div>
            <dt>${escapeDashboardHtml(label)}</dt>
            <dd>${escapeDashboardHtml(value)}</dd>
        </div>
    `;
}

function bindProjectSummaryEvents() {
    dashboardContent?.querySelectorAll("[data-project-summary-view]").forEach((card) => {
        card.addEventListener("click", () => {
            dashboardActiveView = card.dataset.projectSummaryView;
            renderActiveDashboard();
        });
    });
}

function renderViaductDashboard(data = {}) {
    destroyTunnelDashboardChart();

    const summary = data.summary ?? {};
    const viaducts = sortDashboardViaducts(data.viaducts);
    const operationalViaducts = viaducts.filter(
        (viaduct) => viaduct.has_operational_data === true
    );

    dashboardContent.innerHTML = `
        ${createTunnelDashboardHeader(getLatestDashboardDate(
            summary.latest_activity_date,
            summary.latest_import_finished_at
        ))}
        ${createDashboardNavigation("viaducts")}
        <div class="dashboard-scroll">
            ${createViaductDashboardKpis(summary)}
            <section class="dashboard-card dashboard-viaduct-portfolio" aria-labelledby="dashboard-viaduct-title">
                <div class="dashboard-card-heading">
                    <div>
                        <span>Viyadük Portföyü</span>
                        <h3 id="dashboard-viaduct-title">Viyadük Durumu</h3>
                    </div>
                    <strong>${escapeDashboardHtml(formatDashboardNumber(operationalViaducts.length))}</strong>
                </div>
                ${createDashboardViaductList(operationalViaducts, summary)}
            </section>
        </div>
    `;

    bindTunnelDashboardCommonEvents();
    bindDashboardViaductEvents(operationalViaducts);
}

function createViaductDashboardKpis(summary = {}) {
    const kpis = [
        ["Toplam Viyadük", formatDashboardNumber(summary.total_viaduct_count), "adet"],
        ["Veri Hazır Viyadük", formatDashboardNumber(summary.data_ready_viaduct_count), "operasyonel"],
        ["Toplam Uzunluk", formatDashboardLength(summary.portfolio_length_m), "portföy"],
        ["Toplam Yapı", formatDashboardNumber(summary.structure_count), "pier + abutment"],
        ["Planlı Kazık", formatDashboardNumber(summary.planned_pile_count), "adet"],
        ["Tamamlanan Kazık", formatDashboardNumber(summary.completed_pile_count), "adet"],
        ["Kazık Adet İlerlemesi", formatDashboardPrecisePercent(summary.pile_count_progress_percent), "güvenilir metrik"],
        ["Kiriş Kaydı", formatDashboardNumber(summary.girder_record_count), "kayıtlı gerçek veri"],
        ["Son Aktivite", formatDashboardDate(summary.latest_activity_date), "operasyon tarihi"],
        ["Quality Warning", formatDashboardNumber(summary.quality_warning_count), "veri kalitesi"]
    ];

    return `
        <section class="dashboard-kpi-grid dashboard-viaduct-kpis" aria-label="Viyadük genel göstergeleri">
            ${kpis.map(([label, value, note]) => `
                <article class="dashboard-kpi">
                    <span>${escapeDashboardHtml(label)}</span>
                    <strong>${escapeDashboardHtml(value)}</strong>
                    <small>${escapeDashboardHtml(note)}</small>
                </article>
            `).join("")}
        </section>
    `;
}

function createDashboardViaductList(viaducts, portfolioSummary = {}) {
    if (viaducts.length === 0) {
        return createDashboardEmpty("Operasyon verisi bulunan viyadük yok.");
    }

    const soleOperationalSummary = viaducts.length === 1
        ? portfolioSummary
        : null;

    return `
        <div class="dashboard-viaduct-list">
            ${viaducts.map((viaduct) => createDashboardViaductRow(
                viaduct,
                soleOperationalSummary
            )).join("")}
        </div>
    `;
}

function createDashboardViaductRow(viaduct = {}, soleOperationalSummary = null) {
    const concreteCounts = getDashboardViaductConcreteCounts(viaduct);
    const concreteCompletion = getDashboardConcreteCompletion(concreteCounts);
    const precastCoverage = getDashboardViaductPrecastCoverage(viaduct);
    const completedPileCount = viaduct.completed_pile_count
        ?? soleOperationalSummary?.completed_pile_count;
    const plannedPileCount = viaduct.planned_pile_count
        ?? soleOperationalSummary?.planned_pile_count;
    const girderRecordCount = viaduct.girder_record_count
        ?? soleOperationalSummary?.girder_record_count;

    return `
        <article class="dashboard-viaduct-row has-data"
            role="button" tabindex="0" data-dashboard-viaduct-id="${Number(viaduct.asset_id)}"
            aria-label="${escapeDashboardHtml(formatTunnelFallback(viaduct.asset_code))} viyadük detayını aç">
            <header>
                <div class="dashboard-viaduct-title">
                    <span class="dashboard-asset-code">${escapeDashboardHtml(formatTunnelFallback(viaduct.asset_code))}</span>
                    <strong>${escapeDashboardHtml(formatTunnelFallback(viaduct.name))}</strong>
                </div>
                <div class="dashboard-viaduct-header-meta">
                    ${viaduct.has_quality_warnings ? `
                        <span class="dashboard-quality-badge">Veri kalite uyarısı</span>
                    ` : ""}
                    <small>${escapeDashboardHtml(formatDashboardLength(viaduct.length))}</small>
                    <time>${escapeDashboardHtml(formatDashboardDate(viaduct.latest_activity_date))}</time>
                </div>
            </header>

            <div class="dashboard-viaduct-production-list">
                <section class="dashboard-viaduct-production is-piles">
                    <div class="dashboard-production-heading">
                        <div>
                            <span>Güvenilir Fiziksel Metrik</span>
                            <h4>Kazık İlerlemesi</h4>
                        </div>
                        <strong>${escapeDashboardHtml(formatDashboardPrecisePercent(viaduct.pile_count_progress_percent))}</strong>
                    </div>
                    ${createDashboardViaductProgress(viaduct.pile_count_progress_percent)}
                    <div class="dashboard-production-meta">
                        <span>${escapeDashboardHtml(formatDashboardNumber(completedPileCount))} / ${escapeDashboardHtml(formatDashboardNumber(plannedPileCount))} kazık</span>
                        <span>${escapeDashboardHtml(formatDashboardNumber(viaduct.structure_count))} yapı</span>
                    </div>
                </section>

                <section class="dashboard-viaduct-production is-concrete">
                    <div class="dashboard-production-heading">
                        <div>
                            <span>Kayıt bazlı tamamlanma oranı</span>
                            <h4>Betonarme İlerlemesi</h4>
                        </div>
                        ${concreteCompletion
                            ? `<strong>${escapeDashboardHtml(formatDashboardPrecisePercent(concreteCompletion.percent))}</strong>`
                            : ""}
                    </div>
                    ${concreteCounts
                        ? createDashboardConcreteDistribution(concreteCounts)
                        : createDashboardMetricUnavailable(
                            "Statü dağılımı toplu dashboard servisinde sunulmuyor."
                        )}
                </section>

                <section class="dashboard-viaduct-production is-precast">
                    <div class="dashboard-production-heading">
                        <div>
                            <span>Üretim kaydı kapsamı</span>
                            <h4>Prekast İlerlemesi</h4>
                        </div>
                    </div>
                    ${precastCoverage
                        ? createDashboardPrecastCoverage(precastCoverage)
                        : createDashboardMetricUnavailable(
                            `${formatDashboardNumber(girderRecordCount)} kiriş kaydı var; üretim tarihi kapsamı toplu serviste sunulmuyor.`
                        )}
                </section>
            </div>
        </article>
    `;
}

function getDashboardConcreteCompletion(counts) {
    if (!counts) return null;

    const total = counts.completed + counts.in_progress + counts.not_started + counts.unknown;
    return total > 0
        ? { completed: counts.completed, total, percent: (counts.completed / total) * 100 }
        : null;
}

function getDashboardViaductConcreteCounts(viaduct = {}) {
    const counts = viaduct.concrete?.reported_status_counts
        ?? viaduct.reported_status_counts;

    if (!counts || typeof counts !== "object") {
        return null;
    }

    return {
        completed: Number(counts.completed) || 0,
        in_progress: Number(counts.in_progress) || 0,
        not_started: Number(counts.not_started) || 0,
        unknown: Number(counts.unknown) || 0
    };
}

function createDashboardConcreteDistribution(counts) {
    const statuses = [
        ["completed", "Tamamlandı", counts.completed],
        ["in-progress", "Devam Ediyor", counts.in_progress],
        ["not-started", "Başlanmadı", counts.not_started],
        ["unknown", "Bilinmiyor", counts.unknown]
    ];
    const total = statuses.reduce((sum, status) => sum + status[2], 0);
    const visibleStatuses = statuses.filter((status) => status[2] > 0);

    if (total <= 0) {
        return createDashboardMetricUnavailable("Raporlanan betonarme statüsü bulunmuyor.");
    }

    return `
        <div class="dashboard-concrete-summary">
            <strong>${escapeDashboardHtml(formatDashboardNumber(counts.completed))} / ${escapeDashboardHtml(formatDashboardNumber(total))}</strong>
            kayıt tamamlandı
        </div>
        <div class="dashboard-segmented-bar" aria-label="Betonarme statü dağılımı">
            ${visibleStatuses.map(([state, label, count]) => `
                <span class="is-${state}" style="width:${(count / total) * 100}%"
                    title="${escapeDashboardHtml(label)}: ${escapeDashboardHtml(formatDashboardNumber(count))}"></span>
            `).join("")}
        </div>
        <div class="dashboard-segment-legend">
            ${visibleStatuses.map(([state, label, count]) => `
                <span class="is-${state}"><i></i>${escapeDashboardHtml(formatDashboardNumber(count))} ${escapeDashboardHtml(label)}</span>
            `).join("")}
        </div>
    `;
}

function getDashboardViaductPrecastCoverage(viaduct = {}) {
    const knownCount = viaduct.precast?.production_date_known_count
        ?? viaduct.production_date_known_count;
    const recordCount = viaduct.precast?.girder_record_count
        ?? viaduct.girder_record_count;

    if (!Number.isFinite(Number(knownCount)) || !Number.isFinite(Number(recordCount))) {
        return null;
    }

    return {
        knownCount: Number(knownCount),
        recordCount: Number(recordCount)
    };
}

function createDashboardPrecastCoverage(coverage) {
    const percent = coverage.recordCount > 0
        ? (coverage.knownCount / coverage.recordCount) * 100
        : null;

    return `
        <div class="dashboard-production-heading is-compact">
            <span>${escapeDashboardHtml(formatDashboardNumber(coverage.knownCount))} / ${escapeDashboardHtml(formatDashboardNumber(coverage.recordCount))} üretim tarihi kayıtlı</span>
            <strong>${escapeDashboardHtml(formatDashboardPrecisePercent(percent))}</strong>
        </div>
        ${createDashboardViaductProgress(percent, "Üretim tarihi kayıt kapsamı")}
    `;
}

function createDashboardMetricUnavailable(message) {
    return `<div class="dashboard-metric-unavailable">${escapeDashboardHtml(message)}</div>`;
}

function createDashboardViaductProgress(value, label = "Kazık adet ilerlemesi") {
    const numericValue = Number(value);
    const width = Number.isFinite(numericValue)
        ? Math.min(100, Math.max(0, numericValue))
        : 0;

    return `
        <div class="tunnel-progress-track dashboard-viaduct-track" role="progressbar" aria-label="${escapeDashboardHtml(label)}"
            aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Number.isFinite(numericValue) ? numericValue : 0}">
            <span style="width:${width}%"></span>
        </div>
    `;
}

function bindDashboardViaductEvents(viaducts) {
    const viaductsById = new Map(
        viaducts.map((viaduct) => [Number(viaduct.asset_id), viaduct])
    );

    dashboardContent?.querySelectorAll("[data-dashboard-viaduct-id]").forEach((row) => {
        const openViaduct = () => {
            const assetId = Number(row.dataset.dashboardViaductId);
            const viaduct = viaductsById.get(assetId);

            if (!viaduct) {
                return;
            }

            const asset = getDashboardAsset(assetId);

            if (typeof focusAsset === "function") {
                focusAsset(asset ? { ...asset, ...viaduct } : viaduct);
            }

            if (typeof openViaductDetail === "function") {
                openViaductDetail(assetId);
            }
        };

        row.addEventListener("click", openViaduct);
        row.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }

            event.preventDefault();
            openViaduct();
        });
    });
}

function sortDashboardViaducts(value) {
    return Array.isArray(value)
        ? [...value].sort((left, right) => String(left.asset_code ?? "").localeCompare(
            String(right.asset_code ?? ""),
            "tr",
            { numeric: true, sensitivity: "base" }
        ))
        : [];
}

function getDashboardAsset(assetId) {
    return typeof assetsById !== "undefined"
        ? assetsById.get(Number(assetId)) ?? null
        : null;
}

function getDashboardAssetCount() {
    return typeof assetsById !== "undefined" && assetsById.size > 0
        ? assetsById.size
        : dashboardAssetCount;
}

function getLatestDashboardDate(...values) {
    return values
        .filter(Boolean)
        .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function createDashboardKpis(summary) {
    const kpis = [
        ["Toplam Tünel", formatDashboardCount(summary.total_tunnel_count), "adet"],
        ["Aktif Tünel", formatDashboardCount(summary.active_tunnel_count), "operasyonel"],
        ["Toplam Uzunluk", formatDashboardLength(summary.total_tunnel_length), "proje geneli"],
        ["Genel İlerleme", formatDashboardPercent(summary.overall_progress_percent), "ağırlıklı fiziksel"],
        ["Aktif Ayna", formatDashboardCount(summary.active_face_count), "adet"],
        ["Son 7 Gün", formatDashboardLength(summary.last_7_days_progress), "üst yarı ilerlemesi"],
        ["Son Güncelleme", formatDashboardDate(summary.latest_record_date), "veri tarihi"]
    ];

    return `
        <section class="dashboard-kpi-grid" aria-label="Tünel genel göstergeleri">
            ${kpis.map(([label, value, note]) => `
                <article class="dashboard-kpi">
                    <span>${escapeDashboardHtml(label)}</span>
                    <strong>${escapeDashboardHtml(value)}</strong>
                    <small>${escapeDashboardHtml(note)}</small>
                </article>
            `).join("")}
        </section>
    `;
}

function createDashboardTunnelList(tunnels) {
    if (tunnels.length === 0) {
        return createDashboardEmpty("İmalat ilerlemesi bulunan tünel yok.");
    }

    return `
        <div class="dashboard-tunnel-list">
            ${tunnels.map(createDashboardTunnelSchematic).join("")}
        </div>
    `;
}

function createDashboardTunnelSchematic(tunnel) {
    const code = escapeDashboardHtml(formatTunnelFallback(tunnel.asset_code));
    const name = escapeDashboardHtml(formatTunnelFallback(tunnel.asset_name));
    const category = escapeDashboardHtml(formatTunnelFallback(tunnel.tunnel_category));

    return `
        <article class="dashboard-tunnel-schematic" role="button" tabindex="0"
            aria-label="${code} tünel detayını aç"
            data-dashboard-tunnel-id="${Number(tunnel.asset_id)}">
            <header class="dashboard-tunnel-schematic-header">
                <span class="dashboard-asset-code">${code}</span>
                <strong>${name}</strong>
                <small>${category} · ${escapeDashboardHtml(formatDashboardLength(tunnel.tunnel_length_m))}</small>
            </header>

            <div class="dashboard-tunnel-desktop">
                <div class="dashboard-portal-labels" aria-hidden="true">
                    <span>GİRİŞ</span><span>ÇIKIŞ</span>
                </div>
                ${createDashboardStageTrack(tunnel, "upper", "Üst Yarı")}
                ${createDashboardStageTrack(tunnel, "lower", "Alt Yarı")}
                ${createDashboardStageTrack(tunnel, "invert", "Invert")}
            </div>
            <dl class="dashboard-tunnel-canonical-metrics">
                ${createDashboardMetric("Giriş Kazısı", formatDashboardLength(tunnel.entrance_excavation_m))}
                ${createDashboardMetric("Çıkış Kazısı", formatDashboardLength(tunnel.exit_excavation_m))}
                ${createDashboardMetric("Toplam Kazı", formatDashboardLength(tunnel.total_excavation_m))}
                ${createDashboardMetric("Kalan", formatDashboardLength(tunnel.remaining_length_m))}
                ${createDashboardProgressMetric(
                    "Kazı İlerlemesi",
                    formatDashboardPrecisePercent(tunnel.progress_percent),
                    "toplam uzunluğa oranlı"
                )}
            </dl>
        </article>
    `;
}

function createDashboardStageTrack(tunnel, stage, label) {
    const entrance = getDashboardStageMetric(tunnel, "entrance", stage);
    const exit = getDashboardStageMetric(tunnel, "exit", stage);

    return `
        <div class="dashboard-stage-row is-${stage}">
            <span class="dashboard-stage-label">${escapeDashboardHtml(label)}</span>
            <strong class="dashboard-stage-percent is-entrance">
                ${escapeDashboardHtml(formatDashboardPercent(entrance?.percent))}
            </strong>
            <div class="dashboard-stage-track">
                ${createDashboardStageHalf(tunnel, entrance, "entrance", label)}
                ${createDashboardStageHalf(tunnel, exit, "exit", label)}
            </div>
            <strong class="dashboard-stage-percent is-exit">
                ${escapeDashboardHtml(formatDashboardPercent(exit?.percent))}
            </strong>
        </div>
    `;
}

function createDashboardStageHalf(tunnel, metric, side, stageLabel) {
    const width = getDashboardHalfWidth(metric?.percent);
    const tooltip = createDashboardStageTooltip(tunnel, side, stageLabel, metric);

    return `
        <span class="dashboard-stage-half is-${side}">
            ${metric?.meters == null ? "" : `
                <span class="dashboard-stage-fill" style="width:${width}%" tabindex="-1">
                    <span class="dashboard-stage-tooltip" role="tooltip">${tooltip}</span>
                </span>
            `}
        </span>
    `;
}

function createDashboardStageTooltip(tunnel, side, stageLabel, metric) {
    return escapeDashboardHtml(
        createDashboardStageTooltipText(tunnel, side, stageLabel, metric)
    ).replaceAll("\n", "<br>");
}

function createDashboardStageTooltipText(tunnel, side, stageLabel, metric) {
    const sideLabel = side === "entrance" ? "GİRİŞ" : "ÇIKIŞ";
    const face = tunnel.faces?.[side];

    return [
        `${formatTunnelFallback(tunnel.asset_code)} ${sideLabel}`,
        stageLabel,
        `İlerleme: ${formatDashboardLength(metric?.meters)}`,
        `Oran: ${formatDashboardPercent(metric?.percent)}`,
        `Son kayıt: ${formatDashboardDate(face?.latest_record_date)}`
    ].join("\n");
}

function getDashboardStageMetric(tunnel, side, stage) {
    return tunnel?.faces?.[side]?.[stage] ?? null;
}

function getDashboardHalfWidth(percent) {
    const numericPercent = Number(percent);
    return Number.isFinite(numericPercent)
        ? Math.min(100, Math.max(0, numericPercent * 2))
        : 0;
}

function createDashboardChartView(dailyProgress) {
    const hasProgress = dailyProgress.some(
        (row) => Number(row.daily_progress) > 0
    );

    if (!hasProgress) {
        return createDashboardEmpty("Son 7 gün için ilerleme kaydı bulunmuyor.");
    }

    return `
        <div class="dashboard-chart-wrap">
            <canvas id="dashboard-daily-progress-chart" aria-label="Son 7 gün günlük tünel ilerlemesi"></canvas>
        </div>
        <p class="dashboard-chart-note">
            Yalnızca çakışmaları ayıklanmış üst yarı fiziksel ilerlemesi gösterilir.
        </p>
    `;
}

function createDashboardFaceList(faces) {
    if (faces.length === 0) {
        return createDashboardEmpty("Aktif ve haritada konumlandırılmış ayna bulunmuyor.");
    }

    return `
        <div class="dashboard-face-list">
            ${faces.map((face) => `
                <button class="dashboard-face-row" type="button"
                    data-dashboard-face-id="${Number(face.face_id)}">
                    <div>
                        <span class="dashboard-asset-code">${escapeDashboardHtml(formatTunnelFallback(face.asset_code))}</span>
                        <strong>${escapeDashboardHtml(formatTunnelFallback(face.face_code))}</strong>
                        <small>${escapeDashboardHtml(formatTunnelFallback(face.face_name))}</small>
                    </div>
                    <dl>
                        <div><dt>Son KM</dt><dd>${escapeDashboardHtml(formatKilometer(face.latest_km))}</dd></div>
                        <div><dt>Günlük</dt><dd>${escapeDashboardHtml(formatDashboardLength(face.latest_daily_progress))}</dd></div>
                        <div><dt>Son Kayıt</dt><dd>${escapeDashboardHtml(formatDashboardDate(face.latest_record_date))}</dd></div>
                    </dl>
                </button>
            `).join("")}
        </div>
    `;
}

function createDashboardEmpty(message) {
    return `<div class="dashboard-empty">${escapeDashboardHtml(message)}</div>`;
}

function bindTunnelDashboardCommonEvents() {
    dashboardContent
        ?.querySelector(".dashboard-close")
        ?.addEventListener("click", closeTunnelDashboard);

    dashboardContent
        ?.querySelectorAll("[data-dashboard-view]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                dashboardActiveView = button.dataset.dashboardView;
                renderActiveDashboard();
            });
        });
}

function bindDashboardTunnelEvents(tunnels) {
    const tunnelsById = new Map(
        tunnels.map((tunnel) => [Number(tunnel.asset_id), tunnel])
    );

    dashboardContent
        ?.querySelectorAll("[data-dashboard-tunnel-id]")
        .forEach((row) => {
            row.addEventListener("click", () => {
                const tunnel = tunnelsById.get(
                    Number(row.dataset.dashboardTunnelId)
                );

                if (!tunnel) {
                    return;
                }

                if (typeof focusAsset === "function") {
                    focusAsset(tunnel);
                }

                if (typeof openTunnelDetail === "function") {
                    openTunnelDetail(tunnel.asset_id);
                }
            });

            row.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                    return;
                }

                event.preventDefault();
                row.click();
            });
        });
}

function bindDashboardFaceEvents(faces) {
    const facesById = new Map(
        faces.map((face) => [Number(face.face_id), face])
    );

    dashboardContent
        ?.querySelectorAll("[data-dashboard-face-id]")
        .forEach((row) => {
            row.addEventListener("click", () => {
                const face = facesById.get(
                    Number(row.dataset.dashboardFaceId)
                );

                if (!face) {
                    return;
                }

                if (typeof focusTunnelFace === "function") {
                    focusTunnelFace(face);
                }

                if (typeof openTunnelDetail === "function") {
                    openTunnelDetail(face.asset_id, {
                        tab: "faces",
                        faceId: face.face_id
                    });
                }
            });
        });
}

function renderTunnelDashboardChart(dailyProgress) {
    destroyTunnelDashboardChart();

    const canvas = document.getElementById("dashboard-daily-progress-chart");

    if (!canvas || typeof Chart !== "function") {
        return;
    }

    const options = typeof createTunnelChartOptions === "function"
        ? createTunnelChartOptions("m/gün")
        : { responsive: true, maintainAspectRatio: false };

    if (options.plugins?.legend) {
        options.plugins.legend.display = false;
    }

    tunnelDashboardChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: dailyProgress.map((row) => formatDashboardChartDate(row.date)),
            datasets: [{
                label: "Üst Yarı İlerlemesi",
                data: dailyProgress.map((row) => Number(row.daily_progress) || 0),
                backgroundColor: "#21496f",
                borderColor: "#173554",
                borderWidth: 0,
                borderRadius: 5,
                maxBarThickness: 30
            }]
        },
        options
    });
}

function destroyTunnelDashboardChart() {
    tunnelDashboardChart?.destroy();
    tunnelDashboardChart = null;
}

function sortDashboardTunnels(value) {
    const tunnels = Array.isArray(value) ? [...value] : [];

    if (typeof compareTunnelAssets === "function") {
        tunnels.sort(compareTunnelAssets);
    }

    return tunnels;
}

function getCanonicalTunnelPortfolio(progressData = {}, legacyTunnels = []) {
    const legacyRows = Array.isArray(legacyTunnels) ? legacyTunnels : [];
    const legacyById = new Map(
        legacyRows.map((tunnel) => [Number(tunnel.asset_id), tunnel])
    );
    const legacyByCode = new Map(
        legacyRows.map((tunnel) => [normalizeDashboardTunnelCode(tunnel.asset_code), tunnel])
    );
    const items = Array.isArray(progressData.items) ? progressData.items : [];

    return sortDashboardTunnels(items
        .filter(isCanonicalTunnelPortfolioRow)
        .map((tunnel) => {
            const legacy = legacyById.get(Number(tunnel.asset_id))
                ?? legacyByCode.get(normalizeDashboardTunnelCode(tunnel.asset_code))
                ?? {};
            const tunnelLength = Number(tunnel.tunnel_length_m);

            return {
                ...legacy,
                ...tunnel,
                name: tunnel.asset_name,
                length: tunnel.tunnel_length_m,
                has_progress_data: true,
                faces: {
                    entrance: createCanonicalTunnelFace(
                        legacy.faces?.entrance,
                        tunnel.entrance_excavation_m,
                        tunnelLength
                    ),
                    exit: createCanonicalTunnelFace(
                        legacy.faces?.exit,
                        tunnel.exit_excavation_m,
                        tunnelLength
                    )
                }
            };
        }));
}

function isCanonicalTunnelPortfolioRow(tunnel) {
    const includedCategories = new Set(["MAIN", "EMERGENCY", "ESCAPE"]);
    const tunnelLength = Number(tunnel?.tunnel_length_m);
    const totalExcavation = Number(tunnel?.total_excavation_m);
    const progressPercent = Number(tunnel?.progress_percent);

    return includedCategories.has(String(tunnel?.tunnel_category ?? "").toUpperCase())
        && Number.isFinite(tunnelLength)
        && tunnelLength > 0
        && Number.isFinite(totalExcavation)
        && totalExcavation > 0
        && Number.isFinite(progressPercent)
        && progressPercent > 0;
}

function createCanonicalTunnelFace(legacyFace, excavationMeters, tunnelLength) {
    const meters = Number(excavationMeters);
    const percent = Number.isFinite(meters) && tunnelLength > 0
        ? (meters / tunnelLength) * 100
        : null;

    return {
        ...(legacyFace ?? {}),
        upper: {
            ...(legacyFace?.upper ?? {}),
            meters: Number.isFinite(meters) ? meters : null,
            percent
        }
    };
}

function createCanonicalTunnelSummary(tunnels, legacySummary = {}) {
    const portfolio = Array.isArray(tunnels) ? tunnels : [];
    const totalLength = portfolio.reduce(
        (sum, tunnel) => sum + Number(tunnel.tunnel_length_m || 0),
        0
    );
    const totalExcavation = portfolio.reduce(
        (sum, tunnel) => sum + Number(tunnel.total_excavation_m || 0),
        0
    );

    return {
        ...(legacySummary ?? {}),
        total_tunnel_count: portfolio.length,
        active_tunnel_count: portfolio.length,
        total_tunnel_length: totalLength,
        total_excavated_m: totalExcavation,
        overall_progress_percent: totalLength > 0
            ? (totalExcavation / totalLength) * 100
            : null
    };
}

function normalizeDashboardTunnelCode(value) {
    return String(value ?? "").trim().toLowerCase();
}

function formatDashboardChartDate(value) {
    return typeof formatTunnelChartDate === "function"
        ? formatTunnelChartDate(value)
        : formatDashboardDate(value);
}

function formatDashboardLength(value) {
    return typeof formatTunnelLength === "function"
        ? formatTunnelLength(value)
        : formatTunnelFallback(value);
}

function formatDashboardPercent(value) {
    return typeof formatTunnelPercent === "function"
        ? formatTunnelPercent(value)
        : formatTunnelFallback(value);
}

function formatDashboardDate(value) {
    return typeof formatTunnelDate === "function"
        ? formatTunnelDate(value)
        : formatTunnelFallback(value);
}

function formatDashboardCount(value) {
    return typeof formatTunnelCount === "function"
        ? formatTunnelCount(value)
        : formatTunnelFallback(value);
}

function formatDashboardNumber(value) {
    const numericValue = Number(value);

    return value === null || value === undefined || value === "" || !Number.isFinite(numericValue)
        ? "-"
        : numericValue.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
}

function formatDashboardPrecisePercent(value) {
    return typeof formatPercent === "function"
        ? (formatPercent(value, 2) ?? "-")
        : formatDashboardPercent(value);
}

function formatDashboardDateTime(value) {
    return typeof formatPopupDateTime === "function"
        ? (formatPopupDateTime(value) ?? "-")
        : formatDashboardDate(value);
}

function escapeDashboardHtml(value) {
    return typeof escapeTunnelDetailHtml === "function"
        ? escapeTunnelDetailHtml(String(value ?? "-"))
        : String(value ?? "-");
}
