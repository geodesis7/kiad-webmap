"use strict";

const TUNNEL_CHART_PERIOD_DAYS = {
    "7": 7,
    "30": 30,
    all: 1000
};

const TUNNEL_CHART_STAGE_ORDER = [
    "TOP_HEADING",
    "LEFT_BENCH",
    "RIGHT_BENCH",
    "LEFT_INVERT",
    "RIGHT_INVERT"
];

const TUNNEL_CHART_COLORS = {
    TOP_HEADING: "#21496f",
    LEFT_BENCH: "#c4861c",
    RIGHT_BENCH: "#d5a54d",
    LEFT_INVERT: "#34816a",
    RIGHT_INVERT: "#73a897"
};

const tunnelChartsDataCache = new Map();

let tunnelChartsAssetId = null;
let tunnelChartsPeriod = "30";
let tunnelChartsRequestController = null;
let tunnelChartInstances = [];

window.addEventListener("kiad:layout-changed", () => {
    tunnelChartInstances.forEach((chart) => chart.resize());
});

function resetTunnelCharts(assetId) {
    tunnelChartsRequestController?.abort();
    tunnelChartsRequestController = null;
    destroyTunnelChartInstances();
    tunnelChartsAssetId = Number.isFinite(Number(assetId))
        ? Number(assetId)
        : null;
    tunnelChartsPeriod = "30";
}

async function loadTunnelCharts(assetId, period = tunnelChartsPeriod) {
    const normalizedAssetId = Number(assetId);
    const normalizedPeriod = Object.hasOwn(TUNNEL_CHART_PERIOD_DAYS, period)
        ? period
        : "30";

    if (!Number.isFinite(normalizedAssetId)) {
        return;
    }

    if (
        tunnelChartsAssetId === normalizedAssetId &&
        tunnelChartsPeriod === normalizedPeriod &&
        tunnelChartInstances.length > 0
    ) {
        tunnelChartInstances.forEach((chart) => chart.resize());
        return;
    }

    tunnelChartsAssetId = normalizedAssetId;
    tunnelChartsPeriod = normalizedPeriod;
    destroyTunnelChartInstances();
    renderTunnelChartsLoading();

    const days = TUNNEL_CHART_PERIOD_DAYS[normalizedPeriod];
    const cacheKey = `${normalizedAssetId}:${days}`;
    const chartCached = tunnelChartsDataCache.get(cacheKey);
    const sharedCached = typeof getCachedTunnelProgress === "function"
        ? getCachedTunnelProgress(normalizedAssetId, days)
        : null;
    const cached = [chartCached, sharedCached].find((item) => {
        return Array.isArray(item?.series);
    });

    if (cached) {
        renderTunnelCharts(cached, normalizedPeriod);
        return;
    }

    tunnelChartsRequestController?.abort();
    tunnelChartsRequestController = new AbortController();

    try {
        const response = await apiFetch(
            `${API_BASE_URL}/api/tunnels/${encodeURIComponent(normalizedAssetId)}/progress?days=${encodeURIComponent(days)}`,
            {
                signal: tunnelChartsRequestController.signal
            }
        );

        if (!response.ok) {
            throw new Error(`API isteği başarısız: ${response.status}`);
        }

        const data = await response.json();

        if (
            tunnelChartsAssetId !== normalizedAssetId ||
            tunnelChartsPeriod !== normalizedPeriod
        ) {
            return;
        }

        tunnelChartsDataCache.set(cacheKey, data);

        if (days <= 30 && typeof cacheTunnelProgressData === "function") {
            cacheTunnelProgressData(data);
        }

        renderTunnelCharts(data, normalizedPeriod);
    } catch (error) {
        if (isAuthSessionError(error)) {
            return;
        }

        if (error.name === "AbortError") {
            return;
        }

        if (tunnelChartsAssetId !== normalizedAssetId) {
            return;
        }

        console.error("Tünel grafikleri yüklenemedi:", error);
        renderTunnelChartsError(normalizedPeriod);
    }
}

function renderTunnelCharts(data, period) {
    const panel = getTunnelChartsPanel();
    const series = Array.isArray(data?.series) ? data.series : [];
    const chartData = buildTunnelChartData(series, period);

    if (!panel) {
        return;
    }

    destroyTunnelChartInstances();

    if (chartData.labels.length === 0 || chartData.stageTypes.length === 0) {
        panel.innerHTML = createTunnelChartsShell(
            period,
            `
                <div class="tunnel-charts-empty">
                    Bu dönem için ilerleme verisi bulunmuyor.
                </div>
            `
        );
        bindTunnelChartPeriodButtons();
        return;
    }

    if (typeof Chart === "undefined") {
        renderTunnelChartsError(period);
        return;
    }

    panel.innerHTML = createTunnelChartsShell(
        period,
        `
            <article class="tunnel-chart-card">
                <header>
                    <span>Metre / gün</span>
                    <h3>Günlük İlerleme</h3>
                </header>
                <div class="tunnel-chart-canvas-wrap">
                    <canvas id="tunnel-daily-progress-chart"></canvas>
                </div>
            </article>

            <article class="tunnel-chart-card">
                <header>
                    <span>Toplam metre</span>
                    <h3>Kümülatif İlerleme</h3>
                </header>
                <div class="tunnel-chart-canvas-wrap">
                    <canvas id="tunnel-cumulative-progress-chart"></canvas>
                </div>
            </article>
        `
    );

    bindTunnelChartPeriodButtons();
    createTunnelChartInstances(chartData);
}

function renderTunnelChartsLoading() {
    const panel = getTunnelChartsPanel();

    if (!panel) {
        return;
    }

    panel.innerHTML = `
        <div class="tunnel-history-state">
            <span class="tunnel-detail-spinner" aria-hidden="true"></span>
            <span>Grafikler yükleniyor...</span>
        </div>
    `;
}

function renderTunnelChartsError(period) {
    const panel = getTunnelChartsPanel();

    if (!panel) {
        return;
    }

    panel.innerHTML = createTunnelChartsShell(
        period,
        `
            <div class="tunnel-history-state tunnel-history-error">
                <span>İlerleme grafikleri şu anda yüklenemiyor.</span>
                <button type="button" data-chart-retry>Tekrar Dene</button>
            </div>
        `
    );

    bindTunnelChartPeriodButtons();
    panel
        .querySelector("[data-chart-retry]")
        ?.addEventListener("click", () => {
            tunnelChartsDataCache.delete(
                `${tunnelChartsAssetId}:${TUNNEL_CHART_PERIOD_DAYS[period]}`
            );
            loadTunnelCharts(tunnelChartsAssetId, period);
        });
}

function createTunnelChartsShell(period, content) {
    return `
        <div class="tunnel-charts-view">
            <header class="tunnel-charts-toolbar">
                <div>
                    <span>Trend Analizi</span>
                    <h3>İlerleme Grafikleri</h3>
                </div>
                <div class="tunnel-chart-periods" aria-label="Grafik dönemi">
                    ${[
                        ["7", "Son 7 Gün"],
                        ["30", "Son 30 Gün"],
                        ["all", "Tümü"]
                    ].map(([value, label]) => `
                        <button class="${value === period ? "is-active" : ""}" type="button"
                            data-chart-period="${value}">
                            ${label}
                        </button>
                    `).join("")}
                </div>
            </header>
            ${content}
        </div>
    `;
}

function bindTunnelChartPeriodButtons() {
    getTunnelChartsPanel()
        ?.querySelectorAll("[data-chart-period]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                loadTunnelCharts(
                    tunnelChartsAssetId,
                    button.dataset.chartPeriod
                );
            });
        });
}

function createTunnelChartInstances(chartData) {
    const dailyCanvas = document.getElementById("tunnel-daily-progress-chart");
    const cumulativeCanvas = document.getElementById("tunnel-cumulative-progress-chart");

    if (!dailyCanvas || !cumulativeCanvas) {
        return;
    }

    const dailyDatasets = chartData.stageTypes.map((stage) => ({
        label: formatTunnelProgressType(stage),
        data: chartData.dailyByStage[stage],
        backgroundColor: TUNNEL_CHART_COLORS[stage],
        borderColor: TUNNEL_CHART_COLORS[stage],
        borderWidth: 0,
        borderRadius: 3,
        maxBarThickness: 14
    }));
    const cumulativeDatasets = chartData.stageTypes.map((stage) => ({
        label: formatTunnelProgressType(stage),
        data: chartData.cumulativeByStage[stage],
        borderColor: TUNNEL_CHART_COLORS[stage],
        backgroundColor: TUNNEL_CHART_COLORS[stage],
        borderWidth: 2,
        pointRadius: chartData.labels.length > 45 ? 0 : 2,
        pointHoverRadius: 4,
        tension: 0.2,
        spanGaps: true
    }));

    tunnelChartInstances = [
        new Chart(dailyCanvas, {
            type: "bar",
            data: {
                labels: chartData.displayLabels,
                datasets: dailyDatasets
            },
            options: createTunnelChartOptions("m/gün")
        }),
        new Chart(cumulativeCanvas, {
            type: "line",
            data: {
                labels: chartData.displayLabels,
                datasets: cumulativeDatasets
            },
            options: createTunnelChartOptions("m")
        })
    ];
}

function createTunnelChartOptions(unit) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: "index",
            intersect: false
        },
        plugins: {
            legend: {
                position: "bottom",
                labels: {
                    boxWidth: 9,
                    boxHeight: 9,
                    usePointStyle: true,
                    font: { size: 9 }
                }
            },
            tooltip: {
                callbacks: {
                    label(context) {
                        if (context.raw === null) {
                            return `${context.dataset.label}: -`;
                        }

                        return `${context.dataset.label}: ${Number(context.raw).toLocaleString("tr-TR", {
                            maximumFractionDigits: 2
                        })} ${unit}`;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: {
                    autoSkip: true,
                    maxTicksLimit: 6,
                    maxRotation: 0,
                    font: { size: 9 }
                }
            },
            y: {
                beginAtZero: true,
                ticks: {
                    font: { size: 9 },
                    callback(value) {
                        return `${value} m`;
                    }
                },
                grid: {
                    color: "rgba(104, 119, 138, 0.12)"
                }
            }
        }
    };
}

function buildTunnelChartData(series, period) {
    const sortedSeries = [...series].sort((a, b) => {
        return String(a.date).localeCompare(String(b.date));
    });
    const labels = getTunnelChartDates(sortedSeries, period);
    const stageTypes = TUNNEL_CHART_STAGE_ORDER.filter((stage) => {
        return sortedSeries.some((item) => item.progress_type === stage);
    });
    const dailyByStage = {};
    const cumulativeByStage = {};

    stageTypes.forEach((stage) => {
        const stagePoints = sortedSeries.filter(
            (item) => item.progress_type === stage
        );
        const pointsByDate = new Map(
            stagePoints.map((item) => [String(item.date), item])
        );

        dailyByStage[stage] = labels.map((date) => {
            const point = pointsByDate.get(date);
            return point
                ? point.daily_progress === null
                    ? null
                    : Number(point.daily_progress)
                : 0;
        });

        const previousPoint = stagePoints
            .filter((item) => String(item.date) <= labels[0])
            .at(-1);
        let lastCumulative = previousPoint?.cumulative_progress === null || !previousPoint
            ? null
            : Number(previousPoint.cumulative_progress);
        cumulativeByStage[stage] = labels.map((date) => {
            const point = pointsByDate.get(date);

            if (point && point.cumulative_progress !== null) {
                lastCumulative = Number(point.cumulative_progress);
            }

            return lastCumulative;
        });
    });

    return {
        labels,
        displayLabels: labels.map(formatTunnelChartDate),
        stageTypes,
        dailyByStage,
        cumulativeByStage
    };
}

function getTunnelChartDates(series, period) {
    if (series.length === 0) {
        return [];
    }

    if (period === "all") {
        return [...new Set(series.map((item) => String(item.date)))];
    }

    const dayCount = TUNNEL_CHART_PERIOD_DAYS[period];
    const lastDate = parseTunnelChartDate(series.at(-1).date);

    if (!lastDate) {
        return [];
    }

    return Array.from({ length: dayCount }, (_, index) => {
        const date = new Date(lastDate);
        date.setUTCDate(date.getUTCDate() - (dayCount - 1 - index));
        return date.toISOString().slice(0, 10);
    });
}

function parseTunnelChartDate(value) {
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatTunnelChartDate(value) {
    const months = [
        "Oca", "Şub", "Mar", "Nis", "May", "Haz",
        "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"
    ];
    const date = parseTunnelChartDate(value);

    if (!date) {
        return "-";
    }

    return `${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
}

function getTunnelChartsPanel() {
    return document.querySelector('[data-tunnel-panel="charts"]');
}

function destroyTunnelChartInstances() {
    tunnelChartInstances.forEach((chart) => chart.destroy());
    tunnelChartInstances = [];
}
