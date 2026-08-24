"use strict";

const tunnelDashboard = document.getElementById("tunnel-dashboard");
const dashboardContent = document.getElementById("dashboard-content");
const dashboardToggle = document.getElementById("dashboard-toggle");

let tunnelDashboardData = null;
let tunnelDashboardRequestController = null;
let tunnelDashboardChart = null;

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

async function openTunnelDashboard(force = false) {
    if (!tunnelDashboard || !dashboardContent) {
        return;
    }

    showTunnelDashboard();

    if (!force && tunnelDashboardData) {
        renderTunnelDashboard(tunnelDashboardData);
        return;
    }

    tunnelDashboardRequestController?.abort();
    tunnelDashboardRequestController = new AbortController();
    renderTunnelDashboardLoading();

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/dashboard/tunnels`,
            { signal: tunnelDashboardRequestController.signal }
        );

        if (!response.ok) {
            throw new Error(`API isteği başarısız: ${response.status}`);
        }

        const data = await response.json();
        tunnelDashboardData = data;

        if (isTunnelDashboardOpen()) {
            renderTunnelDashboard(data);
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
            <span>Proje tünel verileri yükleniyor...</span>
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

function renderTunnelDashboard(data = {}) {
    const summary = data.summary ?? {};
    const tunnels = sortDashboardTunnels(data.tunnels);
    const schematicTunnels = getDashboardSchematicTunnels(tunnels);
    const activeFaces = Array.isArray(data.active_faces)
        ? data.active_faces
        : [];
    const dailyProgress = Array.isArray(data.daily_progress)
        ? data.daily_progress
        : [];

    dashboardContent.innerHTML = `
        ${createTunnelDashboardHeader(summary.latest_record_date)}
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
                <span class="dashboard-eyebrow">Proje Genel Görünümü</span>
                <h2 id="dashboard-title">Tünel Dashboard</h2>
                <p>Fiziksel kazı ilerlemesi ve aktif ayna operasyonları</p>
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
    const name = escapeDashboardHtml(formatTunnelFallback(tunnel.name));

    return `
        <article class="dashboard-tunnel-schematic" role="button" tabindex="0"
            aria-label="${code} tünel detayını aç"
            data-dashboard-tunnel-id="${Number(tunnel.asset_id)}">
            <header class="dashboard-tunnel-schematic-header">
                <span class="dashboard-asset-code">${code}</span>
                <strong>${name}</strong>
                <small>${escapeDashboardHtml(formatDashboardLength(tunnel.length))}</small>
            </header>

            <div class="dashboard-tunnel-desktop">
                <div class="dashboard-portal-labels" aria-hidden="true">
                    <span>GİRİŞ</span><span>ÇIKIŞ</span>
                </div>
                ${createDashboardStageTrack(tunnel, "upper", "Üst Yarı")}
                ${createDashboardStageTrack(tunnel, "lower", "Alt Yarı")}
                ${createDashboardStageTrack(tunnel, "invert", "Invert")}
            </div>
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

function getDashboardSchematicTunnels(tunnels) {
    return tunnels.filter((tunnel) => {
        const priority = typeof getTunnelSortPriority === "function"
            ? getTunnelSortPriority(tunnel.asset_code)
            : 4;

        return priority < 3 && tunnel.has_progress_data === true;
    });
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

function escapeDashboardHtml(value) {
    return typeof escapeTunnelDetailHtml === "function"
        ? escapeTunnelDetailHtml(String(value ?? "-"))
        : String(value ?? "-");
}
