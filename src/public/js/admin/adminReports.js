const REPORTS_API_BASE = '/api/admin/reports';

let currentRange = 'weekly';
let weightTrendChart = null;
let incidentDistributionChart = null;
let zoneEfficiencyChart = null;

Chart.defaults.color = '#6B7280';
Chart.defaults.font.family = "'Inter', sans-serif";

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadReportsAnalytics();
});

function setupEventListeners() {
    document.getElementById('btnReportsWeekly')?.addEventListener('click', async () => {
        if (currentRange === 'weekly') return;
        currentRange = 'weekly';
        setRangeButtonState();
        await loadReportsAnalytics();
    });

    document.getElementById('btnReportsMonthly')?.addEventListener('click', async () => {
        if (currentRange === 'monthly') return;
        currentRange = 'monthly';
        setRangeButtonState();
        await loadReportsAnalytics();
    });

    document.getElementById('btnExportCsv')?.addEventListener('click', () => {
        window.location.href = `${REPORTS_API_BASE}/dataset.csv?range=${encodeURIComponent(currentRange)}`;
    });

    document.getElementById('btnExportPdf')?.addEventListener('click', async () => {
        await exportDetailedPdfReport();
    });

    setRangeButtonState();
}

function setRangeButtonState() {
    const weeklyBtn = document.getElementById('btnReportsWeekly');
    const monthlyBtn = document.getElementById('btnReportsMonthly');

    setSingleRangeButtonState(weeklyBtn, currentRange === 'weekly');
    setSingleRangeButtonState(monthlyBtn, currentRange === 'monthly');
}

function setSingleRangeButtonState(button, isActive) {
    if (!button) return;

    if (isActive) {
        button.classList.add('bg-slate-800', 'text-white', 'shadow-sm');
        button.classList.remove('text-slate-500');
        return;
    }

    button.classList.remove('bg-slate-800', 'text-white', 'shadow-sm');
    button.classList.add('text-slate-500');
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        ...options
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error || 'Request failed.');
    }

    return data;
}

async function loadReportsAnalytics() {
    try {
        setError('');
        const response = await requestJson(`${REPORTS_API_BASE}/analytics?range=${encodeURIComponent(currentRange)}`);
        renderReports(response);
    } catch (error) {
        setError(error.message || 'Failed to load reports analytics.');
    }
}

function renderReports(data) {
    const summary = data?.summary || {};
    const charts = data?.charts || {};
    const performance = data?.performance || {};

    const totalCargoKg = toFiniteNumber(summary.totalCargoKg);
    const totalCargoTons = totalCargoKg / 1000;
    setText('statTotalCargo', totalCargoTons.toFixed(1));
    setText('statAvgEfficiency', toFiniteNumber(summary.avgEfficiencyPct).toFixed(1));
    setText('statAvgTransitTime', toFiniteNumber(summary.avgTransitMins).toFixed(1));
    setText('statActiveAlerts', String(Math.round(toFiniteNumber(summary.activeAlerts))));

    renderIncidentBreakdown(charts.incidentDistribution?.values || []);
    renderPerformance(performance);
    renderCharts(charts);
}

function renderIncidentBreakdown(values) {
    const normal = toFiniteNumber(values[0]);
    const overload = toFiniteNumber(values[1]);
    const loss = toFiniteNumber(values[2]);
    const total = normal + overload + loss;

    const normalPct = total > 0 ? (normal / total) * 100 : 0;
    const overloadPct = total > 0 ? (overload / total) * 100 : 0;
    const lossPct = total > 0 ? (loss / total) * 100 : 0;

    setText('incidentNormalPct', `${Math.round(normalPct)}%`);
    setText('incidentOverloadPct', `${Math.round(overloadPct)}%`);
    setText('incidentLossPct', `${Math.round(lossPct)}%`);

    setBarWidth('incidentNormalBar', normalPct);
    setBarWidth('incidentOverloadBar', overloadPct);
    setBarWidth('incidentLossBar', lossPct);
}

function renderPerformance(performance) {
    const safetyScore = clampPct(performance.safetyScore);
    const deliverySpeed = clampPct(performance.deliverySpeedPct);
    const fuelEfficiency = clampPct(performance.fuelEfficiencyPct);

    setText('safetyScoreValue', `${Math.round(safetyScore)}`);
    setText('deliverySpeedPct', `${Math.round(deliverySpeed)}%`);
    setText('fuelEfficiencyPct', `${Math.round(fuelEfficiency)}%`);

    setBarWidth('deliverySpeedBar', deliverySpeed);
    setBarWidth('fuelEfficiencyBar', fuelEfficiency);

    const progressCircle = document.getElementById('safetyScoreCircle');
    if (progressCircle) {
        const circumference = 314;
        const dashOffset = circumference - ((safetyScore / 100) * circumference);
        progressCircle.setAttribute('stroke-dashoffset', dashOffset.toFixed(0));
    }
}

function renderCharts(charts) {
    renderWeightTrendChart(charts.weightTrend || {});
    renderIncidentDistributionChart(charts.incidentDistribution || {});
    renderZoneEfficiencyChart(charts.zoneEfficiency || {});
}

function renderWeightTrendChart(weightTrend) {
    const canvas = document.getElementById('weightTrendChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const weightGradient = ctx.createLinearGradient(0, 0, 0, 320);
    weightGradient.addColorStop(0, 'rgba(45, 212, 191, 0.2)');
    weightGradient.addColorStop(1, 'rgba(45, 212, 191, 0)');

    const labels = Array.isArray(weightTrend.labels) ? weightTrend.labels : [];
    const initialWeight = Array.isArray(weightTrend.initialWeight) ? weightTrend.initialWeight.map(toFiniteNumber) : [];
    const actualWeight = Array.isArray(weightTrend.actualWeight) ? weightTrend.actualWeight.map(toFiniteNumber) : [];
    const targetWeight = Array.isArray(weightTrend.targetWeight) ? weightTrend.targetWeight.map(toFiniteNumber) : [];

    if (weightTrendChart) {
        weightTrendChart.$initialWeight = initialWeight;
        weightTrendChart.data.labels = labels;
        weightTrendChart.data.datasets[0].data = actualWeight;
        weightTrendChart.data.datasets[1].data = targetWeight;
        weightTrendChart.update();
        return;
    }

    weightTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Actual Weight',
                    data: actualWeight,
                    borderColor: '#22c55e',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    backgroundColor: weightGradient,
                    pointBackgroundColor: (context) => {
                        const idx = context?.dataIndex;
                        if (!Number.isInteger(idx)) return '#22c55e';
                        return isTransportMatch(context.chart, idx) ? '#22c55e' : '#ef4444';
                    },
                    pointBorderColor: '#0B0E14',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    segment: {
                        borderColor: (context) => {
                            const idx = context?.p1DataIndex;
                            if (!Number.isInteger(idx)) return '#22c55e';
                            return isTransportMatch(context.chart, idx) ? '#22c55e' : '#ef4444';
                        }
                    }
                },
                {
                    label: 'Target',
                    data: targetWeight,
                    borderColor: '#374151',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    filter: (context) => context.datasetIndex === 0,
                    callbacks: {
                        labelColor: (context) => {
                            const isMatch = isTransportMatch(context.chart, context.dataIndex);
                            const color = isMatch ? '#22c55e' : '#ef4444';

                            return {
                                borderColor: color,
                                backgroundColor: color
                            };
                        },
                        labelTextColor: (context) => {
                            const isMatch = isTransportMatch(context.chart, context.dataIndex);
                            return isMatch ? '#22c55e' : '#ef4444';
                        },
                        label: (context) => {
                            const byIndex = Array.isArray(context.chart.$initialWeight) ? context.chart.$initialWeight : [];
                            const initial = toFiniteNumber(byIndex[context.dataIndex]);
                            const actual = toFiniteNumber(context.raw);

                            return [
                                `Initial Weight: ${formatWeightKg(initial)}`,
                                `Actual Transported: ${formatWeightKg(actual)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: { grid: { color: '#1F2937' }, border: { display: false } },
                x: { grid: { display: false } }
            }
        }
    });

    weightTrendChart.$initialWeight = initialWeight;
}

function renderIncidentDistributionChart(incidentDistribution) {
    const canvas = document.getElementById('incidentDistributionChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const labels = Array.isArray(incidentDistribution.labels)
        ? incidentDistribution.labels
        : ['Normal', 'Overload', 'Loss'];
    const values = Array.isArray(incidentDistribution.values)
        ? incidentDistribution.values.map(toFiniteNumber)
        : [0, 0, 0];

    if (incidentDistributionChart) {
        incidentDistributionChart.data.labels = labels;
        incidentDistributionChart.data.datasets[0].data = values;
        incidentDistributionChart.update();
        return;
    }

    incidentDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: ['#2DD4BF', '#F59E0B', '#EF4444'],
                borderWidth: 0,
                cutout: '80%',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

function renderZoneEfficiencyChart(zoneEfficiency) {
    const canvas = document.getElementById('zoneEfficiencyChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const labels = Array.isArray(zoneEfficiency.labels) ? zoneEfficiency.labels : [];
    const values = Array.isArray(zoneEfficiency.values) ? zoneEfficiency.values.map(toFiniteNumber) : [];
    const latitudes = Array.isArray(zoneEfficiency.latitudes) ? zoneEfficiency.latitudes.map(toFiniteNumber) : [];
    const longitudes = Array.isArray(zoneEfficiency.longitudes) ? zoneEfficiency.longitudes.map(toFiniteNumber) : [];
    const taskCounts = Array.isArray(zoneEfficiency.taskCounts) ? zoneEfficiency.taskCounts.map(toFiniteNumber) : [];

    if (zoneEfficiencyChart) {
        zoneEfficiencyChart.$zoneLatitudes = latitudes;
        zoneEfficiencyChart.$zoneLongitudes = longitudes;
        zoneEfficiencyChart.$zoneTaskCounts = taskCounts;
        zoneEfficiencyChart.data.labels = labels;
        zoneEfficiencyChart.data.datasets[0].data = values;
        zoneEfficiencyChart.update();
        return;
    }

    zoneEfficiencyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Efficiency %',
                data: values,
                backgroundColor: '#2DD4BF',
                borderRadius: 6,
                barThickness: 24
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const label = items?.[0]?.label || 'Location';
                            return `Dispatch Location: ${label}`;
                        },
                        label: (context) => {
                            const index = context.dataIndex;
                            const lat = toFiniteNumber(context.chart.$zoneLatitudes?.[index]);
                            const lng = toFiniteNumber(context.chart.$zoneLongitudes?.[index]);
                            const tasks = toFiniteNumber(context.chart.$zoneTaskCounts?.[index]);
                            const efficiency = toFiniteNumber(context.raw);

                            return [
                                `Latitude: ${lat.toFixed(4)}`,
                                `Longitude: ${lng.toFixed(4)}`,
                                `Efficiency: ${efficiency.toFixed(0)}%`,
                                `Tasks: ${tasks.toFixed(0)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: { grid: { color: '#1F2937' }, border: { display: false }, min: 0, max: 100 },
                x: { grid: { display: false } }
            }
        }
    });

    zoneEfficiencyChart.$zoneLatitudes = latitudes;
    zoneEfficiencyChart.$zoneLongitudes = longitudes;
    zoneEfficiencyChart.$zoneTaskCounts = taskCounts;
}

function setError(message) {
    const banner = document.getElementById('reportsErrorBanner');
    if (!banner) return;

    if (!message) {
        banner.classList.add('hidden');
        banner.textContent = '';
        return;
    }

    banner.textContent = message;
    banner.classList.remove('hidden');
}

function setText(id, text) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = String(text);
    }
}

function setBarWidth(id, value) {
    const element = document.getElementById(id);
    if (!element) return;

    element.style.width = `${clampPct(value).toFixed(0)}%`;
}

function toFiniteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function clampPct(value) {
    return Math.max(0, Math.min(100, toFiniteNumber(value)));
}

function formatWeightKg(value) {
    return `${Math.round(toFiniteNumber(value)).toLocaleString()} kg`;
}

function isTransportMatch(chart, index) {
    const initial = toFiniteNumber(chart?.$initialWeight?.[index]);
    const actual = toFiniteNumber(chart?.data?.datasets?.[0]?.data?.[index]);

    // Treat tiny floating differences as equal.
    return Math.abs(initial - actual) <= 0.01;
}

async function exportDetailedPdfReport() {
    try {
        setError('');
        const [analytics, details] = await Promise.all([
            requestJson(`${REPORTS_API_BASE}/analytics?range=${encodeURIComponent(currentRange)}`),
            requestJson(`${REPORTS_API_BASE}/details?range=${encodeURIComponent(currentRange)}`)
        ]);

        downloadDetailedPdfReport(analytics, details);
    } catch (error) {
        setError(error.message || 'Failed to export detailed PDF report.');
    }
}

function downloadDetailedPdfReport(analytics, details) {
    const jsPdfModule = window.jspdf;
    if (!jsPdfModule || !jsPdfModule.jsPDF) {
        setError('PDF library failed to load. Please refresh and try again.');
        return;
    }

    const { jsPDF } = jsPdfModule;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    const summary = analytics?.summary || {};
    const charts = analytics?.charts || {};
    const performance = analytics?.performance || {};
    const dataQuality = analytics?.dataQuality || {};
    const detailRows = Array.isArray(details?.rows) ? details.rows : [];

    const totalCargoKg = toFiniteNumber(summary.totalCargoKg);
    const incidentValues = Array.isArray(charts?.incidentDistribution?.values)
        ? charts.incidentDistribution.values.map(toFiniteNumber)
        : [0, 0, 0];
    const incidentsTotal = incidentValues.reduce((sum, value) => sum + value, 0);

    const incidentRows = [
        { label: 'Normal', value: incidentValues[0] || 0 },
        { label: 'Overload', value: incidentValues[1] || 0 },
        { label: 'Loss', value: incidentValues[2] || 0 }
    ].map((row) => {
        const pct = incidentsTotal > 0 ? ((row.value / incidentsTotal) * 100) : 0;
        return [row.label, formatInteger(row.value), formatPct(pct)];
    });

    const zoneLabels = Array.isArray(charts?.zoneEfficiency?.labels) ? charts.zoneEfficiency.labels : [];
    const zoneValues = Array.isArray(charts?.zoneEfficiency?.values) ? charts.zoneEfficiency.values : [];
    const zoneRows = zoneLabels.length > 0
        ? zoneLabels.map((label, index) => [label, formatPct(toFiniteNumber(zoneValues[index]))])
        : [['No location data', '0%']];

    const taskRows = detailRows.length > 0
        ? detailRows.map((row) => [
            formatInteger(row.taskId),
            row.plateNumber || '-',
            row.zoneLabel || 'Unknown Zone',
            row.driverName || '-',
            String(row.taskStatus || '-').toUpperCase(),
            formatKg(row.referenceWeightKg),
            formatKg(row.latestWeightKg),
            row.transitMinutes === null ? '-' : `${Number(row.transitMinutes).toFixed(1)} mins`,
            formatInteger(row.incidentCount),
            formatInteger(row.overloadCount),
            formatInteger(row.lossCount)
        ])
        : [['-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']];

    const generatedAt = details?.generatedAt || new Date().toISOString();
    const rangeLabel = String(analytics?.range || currentRange).toUpperCase();

    const page = {
        width: doc.internal.pageSize.getWidth(),
        height: doc.internal.pageSize.getHeight(),
        margin: 38,
        y: 38
    };

    const contentWidth = page.width - (page.margin * 2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('WeighGuard Detailed Reports and Analytics', page.margin, page.y);
    page.y += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Range: ${rangeLabel}`, page.margin, page.y);
    page.y += 14;
    doc.text(`Generated: ${formatDateTime(generatedAt)}`, page.margin, page.y);
    page.y += 14;
    doc.text(`Total Tasks: ${formatInteger(detailRows.length)}`, page.margin, page.y);
    page.y += 18;

    const summaryItems = [
        ['Total Cargo Moved', `${(totalCargoKg / 1000).toFixed(1)} tons`],
        ['Average Efficiency', formatPct(summary.avgEfficiencyPct)],
        ['Average Transit Time', `${toFiniteNumber(summary.avgTransitMins).toFixed(1)} mins`],
        ['Active Alerts', formatInteger(summary.activeAlerts)],
        ['Safety Score', formatPct(performance.safetyScore)],
        ['Fuel Efficiency', formatPct(performance.fuelEfficiencyPct)]
    ];
    page.y = drawKeyValueGrid(doc, summaryItems, page.margin, page.y, contentWidth, 3);

    page.y += 14;
    page.y = drawTable(doc, {
        title: 'Incident Distribution',
        headers: ['Type', 'Count', 'Share'],
        rows: incidentRows,
        page,
        rowHeight: 18,
        columnWidths: [220, 120, 120]
    });

    page.y += 12;
    page.y = drawTable(doc, {
        title: 'Fleet Efficiency by Dispatch Location',
        headers: ['Location', 'Efficiency'],
        rows: zoneRows,
        page,
        rowHeight: 18,
        columnWidths: [300, 160]
    });

    page.y += 12;
    page.y = drawTable(doc, {
        title: 'Task-Level Detail',
        headers: ['Task', 'Plate', 'Location', 'Driver', 'Status', 'Ref Wt', 'Latest Wt', 'Transit', 'Inc', 'Over', 'Loss'],
        rows: taskRows,
        page,
        rowHeight: 16,
        columnWidths: [36, 56, 56, 58, 50, 52, 52, 42, 26, 28, 28],
        fontSize: 8
    });

    const telemetryNote = dataQuality?.hasIncidentEvidence
        ? `Incident evidence quality: available (${formatInteger(dataQuality.incidentEvidenceCount)} records, avg weight impact ${toFiniteNumber(dataQuality.avgWeightImpactKg).toFixed(2)} kg).`
        : 'Incident evidence quality: no incident weight-impact records in this range.';

    page.y += 8;
    if (page.y > page.height - 40) {
        doc.addPage();
        page.y = page.margin;
    }
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text(telemetryNote, page.margin, page.y);

    const filename = `reports-${currentRange}-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
}

function drawKeyValueGrid(doc, items, x, y, width, columns) {
    const gap = 8;
    const cardWidth = (width - ((columns - 1) * gap)) / columns;
    const cardHeight = 44;

    items.forEach((item, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const cardX = x + (col * (cardWidth + gap));
        const cardY = y + (row * (cardHeight + gap));

        doc.setDrawColor(210, 220, 232);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 4, 4, 'FD');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(String(item[0]), cardX + 8, cardY + 14);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(String(item[1]), cardX + 8, cardY + 30);
    });

    const rows = Math.ceil(items.length / columns);
    return y + (rows * (cardHeight + gap));
}

function drawTable(doc, { title, headers, rows, page, rowHeight, columnWidths, fontSize = 9 }) {
    let y = page.y;
    const startX = page.margin;
    const totalWidth = columnWidths.reduce((sum, val) => sum + val, 0);

    if (totalWidth > (page.width - (page.margin * 2))) {
        columnWidths = scaleColumnWidths(columnWidths, page.width - (page.margin * 2));
    }

    if (y > page.height - 60) {
        doc.addPage();
        y = page.margin;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, startX, y);
    y += 10;

    const renderHeader = () => {
        let x = startX;
        doc.setFillColor(226, 232, 240);
        doc.setDrawColor(203, 213, 225);
        doc.rect(startX, y, columnWidths.reduce((sum, v) => sum + v, 0), rowHeight, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontSize);
        doc.setTextColor(15, 23, 42);
        headers.forEach((header, index) => {
            doc.text(String(header), x + 3, y + rowHeight - 5);
            x += columnWidths[index];
        });
        y += rowHeight;
    };

    renderHeader();

    rows.forEach((row) => {
        if (y > page.height - rowHeight - 24) {
            doc.addPage();
            y = page.margin;
            renderHeader();
        }

        let x = startX;
        doc.setDrawColor(203, 213, 225);
        doc.rect(startX, y, columnWidths.reduce((sum, v) => sum + v, 0), rowHeight);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSize);
        doc.setTextColor(15, 23, 42);

        row.forEach((cell, index) => {
            const text = String(cell ?? '');
            const maxChars = Math.max(3, Math.floor((columnWidths[index] - 6) / (fontSize * 0.55)));
            const clipped = text.length > maxChars ? `${text.slice(0, maxChars - 1)}.` : text;
            doc.text(clipped, x + 3, y + rowHeight - 5);
            x += columnWidths[index];
        });

        y += rowHeight;
    });

    return y;
}

function scaleColumnWidths(widths, targetTotal) {
    const total = widths.reduce((sum, val) => sum + val, 0);
    const ratio = targetTotal / total;
    return widths.map((w) => Math.max(20, Math.floor(w * ratio)));
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatPct(value) {
    return `${Math.round(clampPct(value))}%`;
}

function formatKg(value) {
    return `${toFiniteNumber(value).toFixed(2)} kg`;
}

function formatInteger(value) {
    return `${Math.round(toFiniteNumber(value))}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}