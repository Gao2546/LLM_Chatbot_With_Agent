/**
 * Manufacturing Status Dashboard
 * 3-Column Layout: Machine Errors | Yield Issues | Search/Filters
 */

const API_BASE = window.location.origin;

// ─────────────────────────────────────────
// State
// ─────────────────────────────────────────
let machineData = null;
let errorAnalysisData = null;
let waferFailData = null;
let activeErrorsData = [];  // real-time active errors from monitor
let activeFailsData = [];   // real-time active fails (WAFER_FAIL_CLUSTER, YIELD_VIOLATION)
let failCardItems = [];  // stored for click handling
let waferFailItems = []; // stored for wafer fail Investigate clicks
let refreshTimer = null;
let monitorPollingTimer = null;
let monitorRunning = false;
let currentView = "severity"; // severity | machines
let currentFilter = "all";   // all | critical | warning | ok
let selectedMachines = new Set();
let searchQuery = "";
let mgvFilter = "all"; // all | connected | unknown | disconnected

// ─────────────────────────────────────────
// SVG Icons
// ─────────────────────────────────────────
const ICONS = {
    check: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11.5 7a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"/></svg>',
    wafer: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
};

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
function getSeverityClass(status) {
    switch (status) {
        case "CRITICAL":
        case "ALARM":
        case "YIELD_FAIL":
        case "SITE_FAIL":
            return "critical";
        case "WARNING":
            return "warning";
        default:
            return "ok";
    }
}

function getSeverityLabel(status) {
    switch (status) {
        case "CRITICAL": return "CRITICAL";
        case "ALARM": return "ALARM";
        case "YIELD_FAIL": return "YIELD FAIL";
        case "SITE_FAIL": return "SITE FAIL";
        case "WARNING": return "WARNING";
        default: return "OK";
    }
}

function matchesFilter(machine) {
    const sev = getSeverityClass(machine.status);
    if (currentFilter !== "all" && sev !== currentFilter) return false;
    if (selectedMachines.size > 0 && !selectedMachines.has(machine.id)) return false;
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const searchFields = [
            machine.name, machine.id, machine.ip,
            machine.description, machine.statusLabel,
            machine.yieldNote
        ].filter(Boolean).join(" ").toLowerCase();
        if (!searchFields.includes(q)) return false;
    }
    return true;
}

// ─────────────────────────────────────────
// Data Fetching
// ─────────────────────────────────────────
async function fetchMachines() {
    try {
        const resp = await fetch(`${API_BASE}/api/machines`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        machineData = await resp.json();
        render();
        return machineData;
    } catch (err) {
        console.error("Failed to fetch machines:", err);
        document.getElementById("errorCriticalList").innerHTML =
            `<div class="loading">Failed to connect to backend<br><small>${err.message}</small></div>`;
    }
}

async function fetchErrorAnalysis() {
    try {
        const resp = await fetch(`${API_BASE}/api/error-analysis`);
        if (resp.ok) {
            errorAnalysisData = await resp.json();
            renderErrorSummary();
        }
    } catch (e) { /* ignore */ }
}

async function fetchWaferFails() {
    try {
        const resp = await fetch(`${API_BASE}/api/wafer-fails`);
        if (resp.ok) {
            waferFailData = await resp.json();
        }
    } catch (e) { /* ignore */ }
}

// ─────────────────────────────────────────
// Real-Time Monitor
// ─────────────────────────────────────────

async function fetchActiveErrors() {
    try {
        const resp = await fetch(`${API_BASE}/api/active-errors`);
        if (resp.ok) {
            activeErrorsData = await resp.json();
            // Re-render fail cards with real-time data
            if (machineData) render();
        }
    } catch (e) { /* ignore */ }
}

async function fetchActiveFails() {
    try {
        const resp = await fetch(`${API_BASE}/api/active-fails`);
        if (resp.ok) {
            activeFailsData = await resp.json();
            // Re-render Machine Fail Status with real-time fail data
            if (machineData) render();
        }
    } catch (e) { /* ignore */ }
}

async function fetchMonitorStatus() {
    try {
        const resp = await fetch(`${API_BASE}/api/monitor/status`);
        if (resp.ok) {
            const status = await resp.json();
            monitorRunning = status.running;
            updateMonitorUI(status);
        }
    } catch (e) { /* ignore */ }
}

async function toggleMonitor() {
    const btn = document.getElementById("btnMonitorToggle");
    btn.disabled = true;

    try {
        if (monitorRunning) {
            const resp = await fetch(`${API_BASE}/api/monitor/stop`, { method: "POST" });
            if (resp.ok) {
                monitorRunning = false;
                stopMonitorPolling();
            }
        } else {
            const resp = await fetch(`${API_BASE}/api/monitor/start`, { method: "POST" });
            if (resp.ok) {
                monitorRunning = true;
                startMonitorPolling();
            }
        }
    } catch (e) {
        console.error("Monitor toggle error:", e);
    }

    btn.disabled = false;
    updateMonitorUI({ running: monitorRunning, video_test_mode: false });
}

function startMonitorPolling() {
    if (monitorPollingTimer) clearInterval(monitorPollingTimer);
    // Poll active errors + fails every 5 seconds for responsive live updates
    monitorPollingTimer = setInterval(() => {
        fetchActiveErrors();
        fetchActiveFails();
        fetchMonitorStatus();
    }, 5000);
    // Fetch immediately
    fetchActiveErrors();
    fetchActiveFails();
    fetchMonitorStatus();
}

function stopMonitorPolling() {
    if (monitorPollingTimer) {
        clearInterval(monitorPollingTimer);
        monitorPollingTimer = null;
    }
    activeErrorsData = [];
    activeFailsData = [];
    if (machineData) render();
}

function updateMonitorUI(status) {
    const btn = document.getElementById("btnMonitorToggle");
    const dot = document.getElementById("monitorDot");
    const label = document.getElementById("monitorBtnLabel");
    const videoBtn = document.getElementById("btnVideoTest");
    const videoLabel = document.getElementById("videoTestLabel");

    if (status.running) {
        btn.classList.add("active");
        dot.className = "monitor-dot running";
        label.textContent = "Stop Monitor";
        // Update video test button state
        if (status.video_test_mode) {
            if (videoBtn) { videoBtn.disabled = false; videoBtn.style.background = "#e53e3e"; }
            if (videoLabel) videoLabel.textContent = "⏹ Stop Video";
        }
    } else {
        btn.classList.remove("active");
        dot.className = "monitor-dot stopped";
        dot.style.background = "";
        dot.style.boxShadow = "";
        label.textContent = "Start Monitor";
        // Reset video test button
        if (videoBtn) { videoBtn.disabled = false; videoBtn.style.background = ""; }
        if (videoLabel) videoLabel.textContent = "Video Test";
    }
}

/**
 * Start monitor in Video Test mode.
 * Uses test.mp4 file, cycling frames every 5 seconds.
 */
async function startVideoTest() {
    const videoBtn = document.getElementById("btnVideoTest");
    const videoLabel = document.getElementById("videoTestLabel");

    // If monitor is running, stop it first
    if (monitorRunning) {
        await fetch(`${API_BASE}/api/monitor/stop`, { method: "POST" });
        monitorRunning = false;
        stopMonitorPolling();
        updateMonitorUI({ running: false });
        // Wait a moment for cleanup
        await new Promise(r => setTimeout(r, 500));
    }

    videoBtn.disabled = true;
    videoLabel.textContent = "Starting...";

    try {
        const resp = await fetch(`${API_BASE}/api/monitor/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mode: "video_test",
                source: "test.mp4",
                interval: 5,
                loop: true,
                miss_threshold: 1,
            }),
        });
        const result = await resp.json();
        if (resp.ok) {
            monitorRunning = true;
            startMonitorPolling();
            updateMonitorUI({ running: true, video_test_mode: true });
        } else {
            alert(result.error || "Failed to start video test");
            videoBtn.disabled = false;
            videoLabel.textContent = "Video Test";
        }
    } catch (e) {
        console.error("Video test error:", e);
        videoBtn.disabled = false;
        videoLabel.textContent = "Video Test";
    }
}

function formatDuration(startIso, endIso) {
    if (!startIso) return "";
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : new Date();
    const diff = Math.max(0, Math.floor((end - start) / 1000));
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}h ${m}m`;
}

// ─────────────────────────────────────────
// Quick Scan (Step 3 only — re-detect errors from data_error/)
// ─────────────────────────────────────────
let scanPollingTimer = null;

async function triggerQuickScan() {
    const btn = document.getElementById("btnQuickScan");
    const label = document.getElementById("scanBtnLabel");

    btn.classList.add("scanning");
    btn.classList.remove("done");
    label.textContent = "Scanning...";

    try {
        const resp = await fetch(`${API_BASE}/api/quick-scan`, { method: "POST" });
        if (resp.ok) {
            // Start polling for progress
            startScanPolling();
        } else {
            const err = await resp.json();
            label.textContent = err.error || "Scan Failed";
            btn.classList.remove("scanning");
            setTimeout(() => { label.textContent = "Scan Now"; }, 3000);
        }
    } catch (e) {
        console.error("Quick scan error:", e);
        label.textContent = "Error";
        btn.classList.remove("scanning");
        setTimeout(() => { label.textContent = "Scan Now"; }, 3000);
    }
}

function startScanPolling() {
    if (scanPollingTimer) clearInterval(scanPollingTimer);
    scanPollingTimer = setInterval(async () => {
        try {
            const resp = await fetch(`${API_BASE}/api/quick-scan/status`);
            if (!resp.ok) return;
            const status = await resp.json();

            const btn = document.getElementById("btnQuickScan");
            const label = document.getElementById("scanBtnLabel");

            if (status.running) {
                const pct = status.total > 0 ? Math.round((status.progress / status.total) * 100) : 0;
                label.textContent = `Scanning ${pct}%`;
            } else {
                // Scan finished
                clearInterval(scanPollingTimer);
                scanPollingTimer = null;
                btn.classList.remove("scanning");

                if (status.error) {
                    label.textContent = "Scan Failed";
                    setTimeout(() => { label.textContent = "Scan Now"; }, 3000);
                } else {
                    btn.classList.add("done");
                    const r = status.result || {};
                    label.textContent = `Done! ${r.detected || 0} errors`;

                    // Refresh error analysis data to show new results
                    await fetchErrorAnalysis();
                    render();

                    setTimeout(() => {
                        btn.classList.remove("done");
                        label.textContent = "Scan Now";
                    }, 5000);
                }
            }
        } catch (e) { /* ignore */ }
    }, 2000);
}

// ─────────────────────────────────────────
// Main Render
// ─────────────────────────────────────────
function render() {
    if (!machineData || !machineData.machines) return;

    const machines = machineData.machines.filter(matchesFilter);

    updateHeader(machineData);
    updateSummaryBar(machineData);

    if (currentView === "severity") {
        document.querySelector(".main-content").style.display = "grid";
        document.getElementById("machineGridView").style.display = "none";
        renderSeverityView(machines);
    } else {
        document.querySelector(".main-content").style.display = "none";
        document.getElementById("machineGridView").style.display = "block";
        renderMachineGridView(machines);
    }

    renderSourceFilters(machineData.machines);
}

// ─────────────────────────────────────────
// Header & Summary
// ─────────────────────────────────────────
function updateHeader(data) {
    let ok = 0, warn = 0, crit = 0;
    (data.machines || []).forEach(m => {
        const sev = getSeverityClass(m.status);
        if (sev === "ok") ok++;
        else if (sev === "warning") warn++;
        else crit++;
    });

    document.getElementById("pillOk").textContent = ok;
    document.getElementById("pillWarn").textContent = warn;
    document.getElementById("pillCrit").textContent = crit;
    document.getElementById("lastUpdate").textContent = `Updated: ${data.timestamp || "--"}`;
}

function updateSummaryBar(data) {
    let machCrit = 0, machWarn = 0;
    let yieldCrit = 0, yieldWarn = 0;

    (data.machines || []).forEach(m => {
        const sev = getSeverityClass(m.status);
        if (sev === "critical") {
            if (m.status === "YIELD_FAIL") yieldCrit++;
            else machCrit++;
        } else if (sev === "warning") {
            if (m.yield && m.yield < 95) yieldWarn++;
            else machWarn++;
        }
    });

    // Also count from error analysis data
    if (errorAnalysisData && errorAnalysisData.results) {
        const highCount = errorAnalysisData.results.filter(r => r.severity === "high").length;
        const medCount = errorAnalysisData.results.filter(r => r.severity === "medium").length;
        if (highCount > 0) machCrit = Math.max(machCrit, highCount);
        if (medCount > 0) machWarn = Math.max(machWarn, medCount);
    }

    document.getElementById("sumMachCrit").textContent = `${machCrit} Critical`;
    document.getElementById("sumMachWarn").textContent = `${machWarn} Warning`;
    document.getElementById("sumYieldCrit").textContent = `${yieldCrit} Critical`;
    document.getElementById("sumYieldWarn").textContent = `${yieldWarn} Warning`;
}

// ─────────────────────────────────────────
// Severity View (3-column: Sidebar | Fail Cards | Error Feed)
// ─────────────────────────────────────────
function renderSeverityView(machines) {
    // ── Column 2: Machine Fail Cards ──
    renderFailCards(machines);

    // ── Column 3: Live Machine Error Feed ──
    renderErrorFeed();

    renderSourceFilters(machineData.machines);
}

/**
 * Render fail cards in Column 2 as a 2-column grid.
 * Shows error/fail info from real-time monitor (priority) or batch error analysis.
 */
function renderFailCards(machines) {
    const grid = document.getElementById("failCardsGrid");
    grid.innerHTML = "";

    // Collect all fail items
    const failItems = [];

    // ── Priority 1: Real-time active errors (when monitor is running) ──
    if (monitorRunning && activeErrorsData && activeErrorsData.length > 0) {
        activeErrorsData.forEach(event => {
            const severity = event.severity || "unknown";
            const sevClass = severity === "high" ? "critical" : severity === "medium" ? "warning" : "ok";
            const category = (event.category || "UNKNOWN").replace(/_/g, " ").toUpperCase();

            // Apply filters
            if (selectedMachines.size > 0) {
                const mName = event.machine_id || "";
                const match = Array.from(selectedMachines).some(id => {
                    const machine = (machineData && machineData.machines || []).find(m => m.id === id);
                    return machine && machine.name === mName;
                });
                if (!match) return;
            }
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const fields = [
                    event.machine_id, event.error_id, event.category,
                    event.description, event.handler
                ].filter(Boolean).join(" ").toLowerCase();
                if (!fields.includes(q)) return;
            }

            failItems.push({
                machine: event.machine_name || event.machine_id || "Unknown",
                machineId: event.machine_id || "",
                category,
                errorCode: event.error_id,
                lotnumber: "",
                testmode: "",
                sevClass,
                severity: event.severity,
                description: event.description || "",
                handler: event.handler || "",
                method: event.method || "",
                // Real-time fields
                isLive: true,
                firstSeenAt: event.first_seen_at,
                lastSeenAt: event.last_seen_at,
                seenCount: event.seen_count || 0,
                evidenceImage: event.evidence_image || null,
            });
        });
    }

    // ── Priority 2: Use machine data which is now enriched with latest error
    if (failItems.length === 0 && machineData && machineData.machines) {
        machines.forEach(m => {
            if (m.errorCode && (getSeverityClass(m.status) === 'critical' || getSeverityClass(m.status) === 'warning')) {
                failItems.push({
                    machine: m.name,
                    machineId: m.id,
                    category: m.errorCategory || getSeverityLabel(m.status),
                    errorCode: m.errorCode,
                    lotnumber: "3FTBH497", // Placeholder
                    testmode: "S21P", // Placeholder
                    sevClass: getSeverityClass(m.status),
                    isLive: false, // It's from a snapshot, not a live event stream
                    description: m.errorDescription,
                    severity: m.errorSeverity,
                });
            }
        });
    }

    // Update count
    document.getElementById("failCount").textContent = failItems.length;

    if (failItems.length === 0) {
        grid.innerHTML = '<div class="loading" style="grid-column:1/-1;">No failures detected</div>';
        return;
    }

    // Sort: critical first (use ?? to avoid falsy-zero bug with ||)
    const sevOrder = { critical: 0, warning: 1, ok: 2 };
    failItems.sort((a, b) => (sevOrder[a.sevClass] ?? 2) - (sevOrder[b.sevClass] ?? 2));

    // Store globally for click handling
    failCardItems = failItems;

    failItems.forEach((item, idx) => {
        const card = document.createElement("div");
        card.className = `fail-card ${item.sevClass === "critical" ? "" : item.sevClass}`;

        // Badge icon: X-circle for critical, warning triangle for warning, check-circle for ok
        const badgeIcon = item.sevClass === "ok"
            ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25z"/></svg>'
            : item.sevClass === "warning"
            ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8.22 1.754a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368L8.22 1.754zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM9 11a1 1 0 11-2 0 1 1 0 012 0zm-.25-5.25a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5z"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8z"/></svg>';

        // Live badge + duration for real-time events
        const liveBadgeHtml = item.isLive
            ? `<span class="live-badge"><span class="live-dot"></span>LIVE</span>`
            : '';
        const durationHtml = item.isLive && item.firstSeenAt
            ? `<div class="err-duration">Duration: ${formatDuration(item.firstSeenAt, item.lastSeenAt)} (seen ${item.seenCount}x)</div>`
            : '';
        const evidenceHtml = item.isLive && item.evidenceImage
            ? `<img class="evidence-thumb" src="${API_BASE}/api/evidence/${item.evidenceImage}" alt="Evidence" onerror="this.style.display='none'">`
            : '';

        // Details section differs for live vs batch
        let detailsHtml = '';
        if (item.isLive || item.description) { // Show new details if available
            detailsHtml = `
                <div class="fc-detail-row">
                    <span class="fc-detail-label">Error Code:</span>
                    <span class="fc-detail-value">${item.errorCode}</span>
                </div>
                <div class="fc-detail-row">
                    <span class="fc-detail-label">Description:</span>
                    <span class="fc-detail-value">${item.description || '-'}</span>
                </div>
                <div class="fc-detail-row">
                    <span class="fc-detail-label">Severity:</span>
                    <span class="fc-detail-value">${item.severity || '-'}</span>
                </div>
            `;
        } else {
            detailsHtml = `
                <div class="fc-detail-row">
                    <span class="fc-detail-label">Error Code:</span>
                    <span class="fc-detail-value">${item.errorCode}</span>
                </div>
                <div class="fc-detail-row">
                    <span class="fc-detail-label">Lotnumber:</span>
                    <span class="fc-detail-value">${item.lotnumber}</span>
                </div>
                <div class="fc-detail-row">
                    <span class="fc-detail-label">Testmode:</span>
                    <span class="fc-detail-value">${item.testmode}</span>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="fc-machine">${item.machine} ${liveBadgeHtml}</div>
            <div class="fc-badge">
                <span class="fc-badge-icon">${badgeIcon}</span>
                ${item.category}
            </div>
            ${durationHtml}
            <div class="fc-details">
                ${detailsHtml}
            </div>
            ${evidenceHtml}
            <button class="fc-link" onclick="openErrorDetail(${idx})">View Details &rarr;</button>
        `;

        grid.appendChild(card);
    });
}

/**
 * Render Machine Fail Status in Column 3.
 * Shows: 1) Live wafer/yield fails from monitor, 2) Batch wafer red cluster analysis.
 * Only fail-related data — errors (ALARM, O-codes) shown separately in Fail Cards.
 */
function renderErrorFeed() {
    const list = document.getElementById("errorFeedList");
    list.innerHTML = "";

    // ── Section 1: Live wafer/yield fails from monitor ──
    // Use dedicated activeFailsData from /api/active-fails (separate fail_events table)
    const liveFails = [];

    if (monitorRunning && activeFailsData && activeFailsData.length > 0) {
        activeFailsData.forEach(event => {
            // Apply machine filter
            if (selectedMachines.size > 0) {
                const mName = event.machine_id || "";
                const match = Array.from(selectedMachines).some(id => {
                    const machine = (machineData && machineData.machines || []).find(m => m.id === id);
                    return machine && machine.name === mName;
                });
                if (!match) return;
            }
            // Apply search filter
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const fields = [
                    event.machine_name, event.machine_id, event.error_id || event.fail_id,
                    event.category, event.description
                ].filter(Boolean).join(" ").toLowerCase();
                if (!fields.includes(q)) return;
            }
            liveFails.push(event);
        });
    }

    // Store globally for click handler
    window._liveFailItems = liveFails;

    if (liveFails.length > 0) {
        liveFails.forEach((event, idx) => {
            const sevClass = event.severity === "high" ? "critical" : "warning";
            const machineName = event.machine_name || event.machine_id || "Unknown";
            const statusLabel = event.severity === "high" ? "SEVERE" : "HIGH";

            // Parse method field for fail%/clusters: "visual(fail=12.3%,clusters=2)" or "keyword(score=8)"
            let failPct = "";
            let clusterCount = "";
            const methodStr = event.method || "";
            const failMatch = methodStr.match(/fail=([\d.]+)%/);
            const clusterMatch = methodStr.match(/clusters=(\d+)/);
            if (failMatch) failPct = failMatch[1] + "%";
            if (clusterMatch) clusterCount = clusterMatch[1];

            // Build description line
            let descParts = [];
            descParts.push(event.error_id || event.fail_id);
            if (failPct) descParts.push(`Fail: ${failPct}`);
            if (clusterCount) descParts.push(`${clusterCount} clusters`);
            if (!failPct && !clusterCount) {
                descParts.push(event.description || event.category || "");
            }
            descParts.push(`seen ${event.seen_count || 0}x`);

            const row = document.createElement("div");
            row.className = `error-feed-row ${sevClass === "critical" ? "" : sevClass}`;

            row.innerHTML = `
                <div class="efr-icon">
                    <span class="live-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#e53e3e;animation:pulse 1.5s infinite;"></span>
                </div>
                <div class="efr-info">
                    <div class="efr-machine">${machineName} <span class="live-badge" style="font-size:10px;padding:1px 6px;"><span class="live-dot"></span>LIVE</span></div>
                    <div class="efr-desc">${descParts.join(' · ')}</div>
                </div>
                <span class="efr-badge">${statusLabel}</span>
                <span class="efr-time">${event.first_seen_at ? formatDuration(event.first_seen_at, event.last_seen_at) : ''}</span>
                <button class="efr-action" onclick="openLiveFailDetail(${idx})">Investigate &gt;</button>
            `;
            list.appendChild(row);
        });
    }

    // Header count = live fails only (real-time)
    document.getElementById("errorCount").textContent = liveFails.length;

    // ── Section 2: Batch wafer fail data (SEVERE only — exclude below-threshold) ──
    let fails = [];
    if (waferFailData && waferFailData.fails && waferFailData.fails.length > 0) {
        // Only show wafers that truly meet fail criteria (concern_level >= 2 = SEVERE)
        fails = waferFailData.fails.filter(f => f.concern_level >= 2);

        // Apply machine filter
        if (selectedMachines.size > 0) {
            fails = fails.filter(f => {
                const mName = f.machine || "";
                return Array.from(selectedMachines).some(id => {
                    const machine = (machineData && machineData.machines || []).find(m => m.id === id);
                    return machine && machine.name === mName;
                });
            });
        }
        // Apply search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            fails = fails.filter(f => {
                const fields = [f.machine, f.status, f.location, f.filename].filter(Boolean).join(" ").toLowerCase();
                return fields.includes(q);
            });
        }
    }

    waferFailItems = fails;

    if (fails.length > 0) {
        // Separator with batch count
        const sep = document.createElement("div");
        sep.style.cssText = "padding:8px 16px;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;border-top:1px solid var(--border-color);margin-top:4px;display:flex;justify-content:space-between;align-items:center;";
        sep.innerHTML = `<span>Batch Wafer Analysis</span><span style="background:var(--bg-secondary);padding:2px 8px;border-radius:10px;font-weight:600;">${fails.length}</span>`;
        list.appendChild(sep);

        fails.forEach((item, idx) => {
            const sevClass = item.concern_level >= 2 ? "critical" : "warning";
            const statusLabel = item.status;
            let locationLabel = "Center";
            const loc = (item.location || "center").toLowerCase();
            if (loc === "center") locationLabel = "Center";
            else if (loc.includes("multiple")) locationLabel = "Multiple Edges";
            else if (loc.includes("top")) locationLabel = "Top Edge";
            else if (loc.includes("bottom")) locationLabel = "Bottom Edge";
            else if (loc.includes("left")) locationLabel = "Left Edge";
            else if (loc.includes("right")) locationLabel = "Right Edge";
            else if (loc.includes("edge")) locationLabel = "Edge";
            else locationLabel = "Center";

            const clusterPct = item.largest_cluster_ratio.toFixed(1) + "%";
            const redPct = item.red_ratio.toFixed(1) + "%";

            const row = document.createElement("div");
            row.className = `error-feed-row ${sevClass === "critical" ? "" : sevClass}`;

            row.innerHTML = `
                <div class="efr-icon">
                    ${ICONS.wafer ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>' : ''}
                </div>
                <div class="efr-info">
                    <div class="efr-machine">${item.machine}</div>
                    <div class="efr-desc">Cluster: ${clusterPct} · Red: ${redPct} · ${locationLabel}</div>
                </div>
                <span class="efr-badge">${statusLabel}</span>
                <span class="efr-time">${item.total_clusters} clusters</span>
                <button class="efr-action" onclick="openWaferDetail(${idx})">Investigate &gt;</button>
            `;
            list.appendChild(row);
        });
    }

    if (liveFails.length === 0 && fails.length === 0) {
        list.innerHTML = '<div class="loading" style="padding:30px 0;">No wafer fails detected</div>';
    }
}

/** Open detail modal for a live wafer/yield fail from Machine Fail Status */
async function openLiveFailDetail(index) {
    const event = window._liveFailItems[index];
    if (!event) return;

    const overlay = document.getElementById("modalOverlay");
    const title = document.getElementById("modalTitle");
    const image = document.getElementById("modalImage");
    const info = document.getElementById("modalInfo");
    const gallery = document.getElementById("modalGallery");

    const machineName = event.machine_name || event.machine_id || "Unknown";
    const category = (event.category || "UNKNOWN").replace(/_/g, " ").toUpperCase();
    const sevClass = event.severity === "high" ? "critical" : "warning";
    const statusColor = sevClass === "critical" ? "var(--color-critical)" : "var(--color-warning)";
    const statusLabel = event.severity === "high" ? "SEVERE" : "HIGH";

    title.textContent = `Fail Detection — ${machineName}`;
    gallery.innerHTML = "";

    // Evidence image
    const evidenceUrl = event.evidence_image
        ? `${API_BASE}/api/evidence/${encodeURIComponent(event.evidence_image)}?t=${Date.now()}`
        : '';

    if (evidenceUrl) {
        image.src = evidenceUrl;
        image.style.display = "block";
    } else {
        image.src = "";
        image.style.display = "none";
    }

    // Parse method for fail%/clusters
    const methodStr = event.method || "";
    const failMatch = methodStr.match(/fail=([\d.]+)%/);
    const clusterMatch = methodStr.match(/clusters=(\d+)/);
    const failPct = failMatch ? failMatch[1] + "%" : "-";
    const clusterCount = clusterMatch ? clusterMatch[1] : "-";

    info.innerHTML = `
        <div class="info-row">
            <div><span class="info-label">Machine</span><br><span class="info-value">${machineName}</span></div>
            <div><span class="info-label">Status</span><br><span class="info-value" style="color:${statusColor};font-weight:700;">${statusLabel}</span></div>
            <div><span class="info-label">Error Code</span><br><span class="info-value">${event.error_id}</span></div>
            <div><span class="info-label">Severity</span><br><span class="info-value" style="color:${statusColor}">${(event.severity || "unknown").toUpperCase()}</span></div>
            <div><span class="info-label">Fail Ratio</span><br><span class="info-value">${failPct}</span></div>
            <div><span class="info-label">Clusters</span><br><span class="info-value">${clusterCount}</span></div>
        </div>
        <div style="margin-top:12px;padding:10px 14px;background:var(--bg-card);border-radius:8px;border-left:4px solid ${statusColor};">
            <div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">Live Fail Detail</div>
            <div style="font-size:13px;color:var(--text-secondary);">
                <div>${event.description || '-'}</div>
                <div style="margin-top:4px;">Seen: <strong>${event.seen_count || 0}x</strong></div>
                <div>First: ${event.first_seen_at ? new Date(event.first_seen_at).toLocaleString() : '-'}</div>
                <div>Last: ${event.last_seen_at ? new Date(event.last_seen_at).toLocaleString() : '-'}</div>
                <div>Detection: ${event.method || '-'}</div>
            </div>
        </div>
    `;

    if (evidenceUrl) {
        const thumb = document.createElement("img");
        thumb.src = evidenceUrl;
        thumb.alt = "Evidence";
        thumb.title = "Live Fail Evidence";
        thumb.classList.add("active");
        gallery.appendChild(thumb);
    }

    overlay.classList.add("active");
}

// ─────────────────────────────────────────
// Machine Grid View  (Connection Management)
// ─────────────────────────────────────────

// Track per-machine connection status: { machineId: "connected"|"disconnected"|"unknown"|"testing" }
let machineConnStatus = {};

function renderMachineGridView(machines) {
    // Update topbar count
    const countEl = document.getElementById("mgvCount");
    if (countEl) countEl.textContent = `${machines.length} machine${machines.length !== 1 ? 's' : ''}`;

    // Apply mgv connection-status filter
    const filtered = mgvFilter === "all" ? machines : machines.filter(m => {
        const connSt = machineConnStatus[m.id] || "unknown";
        return connSt === mgvFilter;
    });

    const grid = document.getElementById("machineGrid");
    grid.innerHTML = "";

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="loading">No machines found</div>';
        return;
    }

    filtered.forEach(m => {
        const card = document.createElement("div");
        card.className = "machine-card";
        card.id = `mc-${m.id}`;

        const connSt = machineConnStatus[m.id] || "unknown";
        const connLabel = connSt === "connected" ? "Connected"
            : connSt === "disconnected" ? "Disconnected"
            : connSt === "testing" ? "Testing..."
            : "Unknown";

        const portLabel = m.vnc_port || 5900;
        const ipDisplay = m.ip ? `${m.ip}:${portLabel}` : "—";
        const ipRaw = m.ip || "—";
        const passTag = m.has_password
            ? `<span class="mc-password-tag">🔒 Secured</span>`
            : `<span class="mc-password-tag no-pass">🔓 No Auth</span>`;

        card.innerHTML = `
            <div class="mc-card-top-bar ${connSt}"></div>
            <div class="mc-card-header">
                <div class="mc-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                </div>
                <div class="mc-card-title">
                    <span class="mc-name">${m.name}</span>
                    <span class="mc-status-badge ${connSt}">
                        <span class="mc-status-dot ${connSt}"></span>
                        ${connLabel}
                    </span>
                </div>
            </div>
            <div class="mc-card-body">
                <div class="mc-info-row">
                    <span class="mc-info-label">IP Address</span>
                    <span class="mc-info-value" title="${ipRaw}">${ipRaw}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Machine ID</span>
                    <span class="mc-info-value" title="${m.id}">${m.id}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Port</span>
                    <span class="mc-info-value" title="${portLabel}">${portLabel}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Folder</span>
                    <span class="mc-info-value" title="${m.vnc_id || '—'}">${m.vnc_id || '—'}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Auth</span>
                    ${passTag}
                </div>
            </div>
            <div class="mc-card-secondary">
                <span>IP: ${ipRaw}</span>
                <span>ID: ${m.id}</span>
            </div>
            <div class="mc-card-footer">
                <button class="mc-btn-test" onclick="testVncConnection('${m.id}')" title="Test VNC Connection">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>
                    Test Connection
                </button>
                <button class="mc-btn-edit" onclick="openEditMachine('${m.id}')" title="Edit Properties">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                </button>
                <button class="mc-btn-delete" onclick="confirmDelete('${m.id}', '${m.name.replace(/'/g, "\\'")}')" title="Remove machine">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"/></svg>
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

// ─────────────────────────────────────────
// Source Filters
// ─────────────────────────────────────────

/**
 * Toggle a machine filter checkbox from anywhere (fail cards, error feed, etc.)
 */
function toggleMachineFilter(machineId) {
    if (!machineId) return;
    if (selectedMachines.has(machineId)) {
        selectedMachines.delete(machineId);
    } else {
        selectedMachines.add(machineId);
    }
    // Update checkbox UI
    const cb = document.getElementById(`filter_${machineId}`);
    if (cb) cb.checked = selectedMachines.has(machineId);
    render();
}

function renderSourceFilters(machines) {
    const container = document.getElementById("sourceFilters");
    if (!machines) return;

    // Only render once, not on every refresh
    if (container.children.length === machines.length) return;

    container.innerHTML = "";

    machines.forEach(m => {
        const sev = getSeverityClass(m.status);
        const item = document.createElement("div");
        item.className = "source-filter-item";
        item.innerHTML = `
            <input type="checkbox" id="filter_${m.id}" value="${m.id}" 
                   ${selectedMachines.has(m.id) ? "checked" : ""}>
            <label for="filter_${m.id}">${m.name}</label>
            <span class="filter-status dot ${sev}"></span>
        `;
        item.querySelector("input").addEventListener("change", (e) => {
            if (e.target.checked) {
                selectedMachines.add(m.id);
            } else {
                selectedMachines.delete(m.id);
            }
            render();
        });
        container.appendChild(item);
    });
}

// ─────────────────────────────────────────
// Error Summary (sidebar)
// ─────────────────────────────────────────
function renderErrorSummary() {
    if (!errorAnalysisData || !errorAnalysisData.summary) return;

    const section = document.getElementById("errorSummarySection");
    const container = document.getElementById("errorSummary");
    section.style.display = "block";
    container.innerHTML = "";

    const cats = errorAnalysisData.summary.categories || {};
    const sevs = errorAnalysisData.summary.severities || {};

    // Show severity counts
    for (const [sev, count] of Object.entries(sevs)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity</span>
            <span class="es-count ${sev}">${count}</span>
        `;
        container.appendChild(item);
    }

    // Show category counts
    for (const [cat, count] of Object.entries(cats)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${cat.replace(/_/g, " ")}</span>
            <span class="es-count medium">${count}</span>
        `;
        container.appendChild(item);
    }
}

// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Error Detail Modal (from 3_simple.py error analysis)
// ─────────────────────────────────────────
function getSeverityLabel(status) {
    switch (status) {
        case "CRITICAL": return "CRITICAL";
        case "ALARM": return "ALARM";
        case "YIELD_FAIL": return "YIELD FAIL";
        case "SITE_FAIL": return "SITE FAIL";
        case "WARNING": return "WARNING";
        default: return "OK";
    }
}

async function openErrorDetail(cardIndex) {
    const item = failCardItems[cardIndex];
    if (!item) return;

    const modal = document.getElementById("errorDetailModal");
    const modalBody = document.getElementById("errorDetailBody");
    modalBody.innerHTML = '<div class="loading">Loading details...</div>';
    modal.style.display = "flex";

    // Fetch detailed data
    let detailData = null;
    if (item.machineId) {
        try {
            const response = await fetch(`${API_BASE}/api/machine/detail/${item.machineId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            detailData = await response.json();
        } catch (error) {
            console.error("Failed to fetch machine details:", error);
            modalBody.innerHTML = `<div class="loading error">Failed to load details. ${error.message}</div>`;
            return;
        }
    }

    // --- Data Consolidation ---
    const machineName = detailData?.machine?.name || item.machine;
    const lotNumber = detailData?.job?.lotNumber || item.lotnumber || "N/A";
    const testMode = detailData?.job?.testMode || item.testmode || "N/A";

    const errorCode = detailData?.status?.errorCode || item.errorCode;
    const errorCategory = (detailData?.status?.errorCategory || item.category || "Unknown").replace(/_/g, " ");
    const errorDescription = detailData?.status?.errorDescription || item.description || "No description available.";
    const errorSeverity = detailData?.status?.errorSeverity || item.severity || "Unknown";
    const sevClass = errorSeverity === "high" ? "critical" : errorSeverity === "medium" ? "warning" : "ok";

    const rootCauses = detailData?.errorDetails?.rootCauses || [
        { likelihood: "N/A", description: "Root cause analysis not available." }
    ];
    const resolutionSteps = detailData?.errorDetails?.resolutionSteps || [
        { step: 1, description: "Resolution path not available.", confidence: "N/A" }
    ];

    // --- UI Rendering ---
    const renderRootCauses = (causes) => causes.map(cause => `
        <div class="rca-item">
            <span class="rca-likelihood">${cause.likelihood}</span>
            <span class="rca-description">${cause.description}</span>
        </div>
    `).join('');

    const renderResolutionSteps = (steps) => steps.map(step => `
        <div class="res-item">
            <span class="res-step">Step ${step.step}</span>
            <p class="res-description">${step.description}</p>
            <span class="res-confidence">Confidence: ${step.confidence}</span>
        </div>
    `).join('');

    modalBody.innerHTML = `
        <div class="detail-grid">
            <!-- Error Summary -->
            <div class="detail-card summary-card">
                <div class="detail-header">
                    <h4>Error Summary</h4>
                    <span class="severity-badge ${sevClass}">${errorSeverity}</span>
                </div>
                <div class="detail-content">
                    <div class="summary-item">
                        <label>Error Code</label>
                        <span>${errorCode}</span>
                    </div>
                    <div class="summary-item">
                        <label>Error Category</label>
                        <span>${errorCategory}</span>
                    </div>
                    <div class="summary-item full-width">
                        <label>Description</label>
                        <p>${errorDescription}</p>
                    </div>
                </div>
            </div>

            <!-- Machine & Job Info -->
            <div class="detail-card info-card">
                <div class="detail-header">
                    <h4>Machine & Job Info</h4>
                </div>
                <div class="detail-content">
                    <div class="info-item">
                        <label>Machine</label>
                        <span>${machineName}</span>
                    </div>
                    <div class="info-item">
                        <label>Lot Number</label>
                        <span>${lotNumber}</span>
                    </div>
                    <div class="info-item">
                        <label>Test Mode</label>
                        <span>${testMode}</span>
                    </div>
                </div>
            </div>

            <!-- Root Cause Analysis -->
            <div class="detail-card rca-card">
                <div class="detail-header">
                    <h4>Root Cause Analysis</h4>
                </div>
                <div class="detail-content">
                    ${renderRootCauses(rootCauses)}
                </div>
            </div>

            <!-- Resolution Path -->
            <div class="detail-card resolution-card">
                <div class="detail-header">
                    <h4>Resolution Path</h4>
                </div>
                <div class="detail-content">
                    ${renderResolutionSteps(resolutionSteps)}
                </div>
            </div>

            <!-- AI Suggestions -->
            <div class="detail-card ai-card">
                <div class="detail-header">
                    <h4>AI Suggestions</h4>
                    <span class="ai-badge">Powered by AI</span>
                </div>
                <div class="detail-content">
                    <p>AI-powered suggestions and insights will appear here. This feature is under development.</p>
                    <button class="ai-button" disabled>Generate Suggestion</button>
                </div>
            </div>
        </div>
    `;
}

function closeErrorDetail() {
    const modal = document.getElementById("errorDetailModal");
    modal.style.display = "none";
}

// ─────────────────────────────────────────
// Machine Grid View  (Connection Management)
// ─────────────────────────────────────────

// Track per-machine connection status: { machineId: "connected"|"disconnected"|"unknown"|"testing" }
let machineConnStatus = {};

function renderMachineGridView(machines) {
    // Update topbar count
    const countEl = document.getElementById("mgvCount");
    if (countEl) countEl.textContent = `${machines.length} machine${machines.length !== 1 ? 's' : ''}`;

    // Apply mgv connection-status filter
    const filtered = mgvFilter === "all" ? machines : machines.filter(m => {
        const connSt = machineConnStatus[m.id] || "unknown";
        return connSt === mgvFilter;
    });

    const grid = document.getElementById("machineGrid");
    grid.innerHTML = "";

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="loading">No machines found</div>';
        return;
    }

    filtered.forEach(m => {
        const card = document.createElement("div");
        card.className = "machine-card";
        card.id = `mc-${m.id}`;

        const connSt = machineConnStatus[m.id] || "unknown";
        const connLabel = connSt === "connected" ? "Connected"
            : connSt === "disconnected" ? "Disconnected"
            : connSt === "testing" ? "Testing..."
            : "Unknown";

        const portLabel = m.vnc_port || 5900;
        const ipDisplay = m.ip ? `${m.ip}:${portLabel}` : "—";
        const ipRaw = m.ip || "—";
        const passTag = m.has_password
            ? `<span class="mc-password-tag">🔒 Secured</span>`
            : `<span class="mc-password-tag no-pass">🔓 No Auth</span>`;

        card.innerHTML = `
            <div class="mc-card-top-bar ${connSt}"></div>
            <div class="mc-card-header">
                <div class="mc-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                </div>
                <div class="mc-card-title">
                    <span class="mc-name">${m.name}</span>
                    <span class="mc-status-badge ${connSt}">
                        <span class="mc-status-dot ${connSt}"></span>
                        ${connLabel}
                    </span>
                </div>
            </div>
            <div class="mc-card-body">
                <div class="mc-info-row">
                    <span class="mc-info-label">IP Address</span>
                    <span class="mc-info-value" title="${ipRaw}">${ipRaw}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Machine ID</span>
                    <span class="mc-info-value" title="${m.id}">${m.id}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Port</span>
                    <span class="mc-info-value" title="${portLabel}">${portLabel}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Folder</span>
                    <span class="mc-info-value" title="${m.vnc_id || '—'}">${m.vnc_id || '—'}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Auth</span>
                    ${passTag}
                </div>
            </div>
            <div class="mc-card-secondary">
                <span>IP: ${ipRaw}</span>
                <span>ID: ${m.id}</span>
            </div>
            <div class="mc-card-footer">
                <button class="mc-btn-test" onclick="testVncConnection('${m.id}')" title="Test VNC Connection">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>
                    Test Connection
                </button>
                <button class="mc-btn-edit" onclick="openEditMachine('${m.id}')" title="Edit Properties">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                </button>
                <button class="mc-btn-delete" onclick="confirmDelete('${m.id}', '${m.name.replace(/'/g, "\\'")}')" title="Remove machine">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"/></svg>
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

// ─────────────────────────────────────────
// Source Filters
// ─────────────────────────────────────────

/**
 * Toggle a machine filter checkbox from anywhere (fail cards, error feed, etc.)
 */
function toggleMachineFilter(machineId) {
    if (!machineId) return;
    if (selectedMachines.has(machineId)) {
        selectedMachines.delete(machineId);
    } else {
        selectedMachines.add(machineId);
    }
    // Update checkbox UI
    const cb = document.getElementById(`filter_${machineId}`);
    if (cb) cb.checked = selectedMachines.has(machineId);
    render();
}

function renderSourceFilters(machines) {
    const container = document.getElementById("sourceFilters");
    if (!machines) return;

    // Only render once, not on every refresh
    if (container.children.length === machines.length) return;

    container.innerHTML = "";

    machines.forEach(m => {
        const sev = getSeverityClass(m.status);
        const item = document.createElement("div");
        item.className = "source-filter-item";
        item.innerHTML = `
            <input type="checkbox" id="filter_${m.id}" value="${m.id}" 
                   ${selectedMachines.has(m.id) ? "checked" : ""}>
            <label for="filter_${m.id}">${m.name}</label>
            <span class="filter-status dot ${sev}"></span>
        `;
        item.querySelector("input").addEventListener("change", (e) => {
            if (e.target.checked) {
                selectedMachines.add(m.id);
            } else {
                selectedMachines.delete(m.id);
            }
            render();
        });
        container.appendChild(item);
    });
}

// ─────────────────────────────────────────
// Error Summary (sidebar)
// ─────────────────────────────────────────
function renderErrorSummary() {
    if (!errorAnalysisData || !errorAnalysisData.summary) return;

    const section = document.getElementById("errorSummarySection");
    const container = document.getElementById("errorSummary");
    section.style.display = "block";
    container.innerHTML = "";

    const cats = errorAnalysisData.summary.categories || {};
    const sevs = errorAnalysisData.summary.severities || {};

    // Show severity counts
    for (const [sev, count] of Object.entries(sevs)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity</span>
            <span class="es-count ${sev}">${count}</span>
        `;
        container.appendChild(item);
    }

    // Show category counts
    for (const [cat, count] of Object.entries(cats)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${cat.replace(/_/g, " ")}</span>
            <span class="es-count medium">${count}</span>
        `;
        container.appendChild(item);
    }
}

// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Error Detail Modal (from 3_simple.py error analysis)
// ─────────────────────────────────────────
function getSeverityLabel(status) {
    switch (status) {
        case "CRITICAL": return "CRITICAL";
        case "ALARM": return "ALARM";
        case "YIELD_FAIL": return "YIELD FAIL";
        case "SITE_FAIL": return "SITE FAIL";
        case "WARNING": return "WARNING";
        default: return "OK";
    }
}

async function openErrorDetail(cardIndex) {
    const item = failCardItems[cardIndex];
    if (!item) return;

    const modal = document.getElementById("errorDetailModal");
    const modalBody = document.getElementById("errorDetailBody");
    modalBody.innerHTML = '<div class="loading">Loading details...</div>';
    modal.style.display = "flex";

    // Fetch detailed data
    let detailData = null;
    if (item.machineId) {
        try {
            const response = await fetch(`${API_BASE}/api/machine/detail/${item.machineId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            detailData = await response.json();
        } catch (error) {
            console.error("Failed to fetch machine details:", error);
            modalBody.innerHTML = `<div class="loading error">Failed to load details. ${error.message}</div>`;
            return;
        }
    }

    // --- Data Consolidation ---
    const machineName = detailData?.machine?.name || item.machine;
    const lotNumber = detailData?.job?.lotNumber || item.lotnumber || "N/A";
    const testMode = detailData?.job?.testMode || item.testmode || "N/A";

    const errorCode = detailData?.status?.errorCode || item.errorCode;
    const errorCategory = (detailData?.status?.errorCategory || item.category || "Unknown").replace(/_/g, " ");
    const errorDescription = detailData?.status?.errorDescription || item.description || "No description available.";
    const errorSeverity = detailData?.status?.errorSeverity || item.severity || "Unknown";
    const sevClass = errorSeverity === "high" ? "critical" : errorSeverity === "medium" ? "warning" : "ok";

    const rootCauses = detailData?.errorDetails?.rootCauses || [
        { likelihood: "N/A", description: "Root cause analysis not available." }
    ];
    const resolutionSteps = detailData?.errorDetails?.resolutionSteps || [
        { step: 1, description: "Resolution path not available.", confidence: "N/A" }
    ];

    // --- UI Rendering ---
    const renderRootCauses = (causes) => causes.map(cause => `
        <div class="rca-item">
            <span class="rca-likelihood">${cause.likelihood}</span>
            <span class="rca-description">${cause.description}</span>
        </div>
    `).join('');

    const renderResolutionSteps = (steps) => steps.map(step => `
        <div class="res-item">
            <span class="res-step">Step ${step.step}</span>
            <p class="res-description">${step.description}</p>
            <span class="res-confidence">Confidence: ${step.confidence}</span>
        </div>
    `).join('');

    modalBody.innerHTML = `
        <div class="detail-grid">
            <!-- Error Summary -->
            <div class="detail-card summary-card">
                <div class="detail-header">
                    <h4>Error Summary</h4>
                    <span class="severity-badge ${sevClass}">${errorSeverity}</span>
                </div>
                <div class="detail-content">
                    <div class="summary-item">
                        <label>Error Code</label>
                        <span>${errorCode}</span>
                    </div>
                    <div class="summary-item">
                        <label>Error Category</label>
                        <span>${errorCategory}</span>
                    </div>
                    <div class="summary-item full-width">
                        <label>Description</label>
                        <p>${errorDescription}</p>
                    </div>
                </div>
            </div>

            <!-- Machine & Job Info -->
            <div class="detail-card info-card">
                <div class="detail-header">
                    <h4>Machine & Job Info</h4>
                </div>
                <div class="detail-content">
                    <div class="info-item">
                        <label>Machine</label>
                        <span>${machineName}</span>
                    </div>
                    <div class="info-item">
                        <label>Lot Number</label>
                        <span>${lotNumber}</span>
                    </div>
                    <div class="info-item">
                        <label>Test Mode</label>
                        <span>${testMode}</span>
                    </div>
                </div>
            </div>

            <!-- Root Cause Analysis -->
            <div class="detail-card rca-card">
                <div class="detail-header">
                    <h4>Root Cause Analysis</h4>
                </div>
                <div class="detail-content">
                    ${renderRootCauses(rootCauses)}
                </div>
            </div>

            <!-- Resolution Path -->
            <div class="detail-card resolution-card">
                <div class="detail-header">
                    <h4>Resolution Path</h4>
                </div>
                <div class="detail-content">
                    ${renderResolutionSteps(resolutionSteps)}
                </div>
            </div>

            <!-- AI Suggestions -->
            <div class="detail-card ai-card">
                <div class="detail-header">
                    <h4>AI Suggestions</h4>
                    <span class="ai-badge">Powered by AI</span>
                </div>
                <div class="detail-content">
                    <p>AI-powered suggestions and insights will appear here. This feature is under development.</p>
                    <button class="ai-button" disabled>Generate Suggestion</button>
                </div>
            </div>
        </div>
    `;
}

function closeErrorDetail() {
    const modal = document.getElementById("errorDetailModal");
    modal.style.display = "none";
}

// ─────────────────────────────────────────
// Machine Grid View  (Connection Management)
// ─────────────────────────────────────────

// Track per-machine connection status: { machineId: "connected"|"disconnected"|"unknown"|"testing" }
let machineConnStatus = {};

function renderMachineGridView(machines) {
    // Update topbar count
    const countEl = document.getElementById("mgvCount");
    if (countEl) countEl.textContent = `${machines.length} machine${machines.length !== 1 ? 's' : ''}`;

    // Apply mgv connection-status filter
    const filtered = mgvFilter === "all" ? machines : machines.filter(m => {
        const connSt = machineConnStatus[m.id] || "unknown";
        return connSt === mgvFilter;
    });

    const grid = document.getElementById("machineGrid");
    grid.innerHTML = "";

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="loading">No machines found</div>';
        return;
    }

    filtered.forEach(m => {
        const card = document.createElement("div");
        card.className = "machine-card";
        card.id = `mc-${m.id}`;

        const connSt = machineConnStatus[m.id] || "unknown";
        const connLabel = connSt === "connected" ? "Connected"
            : connSt === "disconnected" ? "Disconnected"
            : connSt === "testing" ? "Testing..."
            : "Unknown";

        const portLabel = m.vnc_port || 5900;
        const ipDisplay = m.ip ? `${m.ip}:${portLabel}` : "—";
        const ipRaw = m.ip || "—";
        const passTag = m.has_password
            ? `<span class="mc-password-tag">🔒 Secured</span>`
            : `<span class="mc-password-tag no-pass">🔓 No Auth</span>`;

        card.innerHTML = `
            <div class="mc-card-top-bar ${connSt}"></div>
            <div class="mc-card-header">
                <div class="mc-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                </div>
                <div class="mc-card-title">
                    <span class="mc-name">${m.name}</span>
                    <span class="mc-status-badge ${connSt}">
                        <span class="mc-status-dot ${connSt}"></span>
                        ${connLabel}
                    </span>
                </div>
            </div>
            <div class="mc-card-body">
                <div class="mc-info-row">
                    <span class="mc-info-label">IP Address</span>
                    <span class="mc-info-value" title="${ipRaw}">${ipRaw}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Machine ID</span>
                    <span class="mc-info-value" title="${m.id}">${m.id}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Port</span>
                    <span class="mc-info-value" title="${portLabel}">${portLabel}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Folder</span>
                    <span class="mc-info-value" title="${m.vnc_id || '—'}">${m.vnc_id || '—'}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Auth</span>
                    ${passTag}
                </div>
            </div>
            <div class="mc-card-secondary">
                <span>IP: ${ipRaw}</span>
                <span>ID: ${m.id}</span>
            </div>
            <div class="mc-card-footer">
                <button class="mc-btn-test" onclick="testVncConnection('${m.id}')" title="Test VNC Connection">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>
                    Test Connection
                </button>
                <button class="mc-btn-edit" onclick="openEditMachine('${m.id}')" title="Edit Properties">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                </button>
                <button class="mc-btn-delete" onclick="confirmDelete('${m.id}', '${m.name.replace(/'/g, "\\'")}')" title="Remove machine">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"/></svg>
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

// ─────────────────────────────────────────
// Source Filters
// ─────────────────────────────────────────

/**
 * Toggle a machine filter checkbox from anywhere (fail cards, error feed, etc.)
 */
function toggleMachineFilter(machineId) {
    if (!machineId) return;
    if (selectedMachines.has(machineId)) {
        selectedMachines.delete(machineId);
    } else {
        selectedMachines.add(machineId);
    }
    // Update checkbox UI
    const cb = document.getElementById(`filter_${machineId}`);
    if (cb) cb.checked = selectedMachines.has(machineId);
    render();
}

function renderSourceFilters(machines) {
    const container = document.getElementById("sourceFilters");
    if (!machines) return;

    // Only render once, not on every refresh
    if (container.children.length === machines.length) return;

    container.innerHTML = "";

    machines.forEach(m => {
        const sev = getSeverityClass(m.status);
        const item = document.createElement("div");
        item.className = "source-filter-item";
        item.innerHTML = `
            <input type="checkbox" id="filter_${m.id}" value="${m.id}" 
                   ${selectedMachines.has(m.id) ? "checked" : ""}>
            <label for="filter_${m.id}">${m.name}</label>
            <span class="filter-status dot ${sev}"></span>
        `;
        item.querySelector("input").addEventListener("change", (e) => {
            if (e.target.checked) {
                selectedMachines.add(m.id);
            } else {
                selectedMachines.delete(m.id);
            }
            render();
        });
        container.appendChild(item);
    });
}

// ─────────────────────────────────────────
// Error Summary (sidebar)
// ─────────────────────────────────────────
function renderErrorSummary() {
    if (!errorAnalysisData || !errorAnalysisData.summary) return;

    const section = document.getElementById("errorSummarySection");
    const container = document.getElementById("errorSummary");
    section.style.display = "block";
    container.innerHTML = "";

    const cats = errorAnalysisData.summary.categories || {};
    const sevs = errorAnalysisData.summary.severities || {};

    // Show severity counts
    for (const [sev, count] of Object.entries(sevs)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity</span>
            <span class="es-count ${sev}">${count}</span>
        `;
        container.appendChild(item);
    }

    // Show category counts
    for (const [cat, count] of Object.entries(cats)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${cat.replace(/_/g, " ")}</span>
            <span class="es-count medium">${count}</span>
        `;
        container.appendChild(item);
    }
}

// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Error Detail Modal (from 3_simple.py error analysis)
// ─────────────────────────────────────────
function getSeverityLabel(status) {
    switch (status) {
        case "CRITICAL": return "CRITICAL";
        case "ALARM": return "ALARM";
        case "YIELD_FAIL": return "YIELD FAIL";
        case "SITE_FAIL": return "SITE FAIL";
        case "WARNING": return "WARNING";
        default: return "OK";
    }
}

async function openErrorDetail(cardIndex) {
    const item = failCardItems[cardIndex];
    if (!item) return;

    const modal = document.getElementById("errorDetailModal");
    const modalBody = document.getElementById("errorDetailBody");
    modalBody.innerHTML = '<div class="loading">Loading details...</div>';
    modal.style.display = "flex";

    // Fetch detailed data
    let detailData = null;
    if (item.machineId) {
        try {
            const response = await fetch(`${API_BASE}/api/machine/detail/${item.machineId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            detailData = await response.json();
        } catch (error) {
            console.error("Failed to fetch machine details:", error);
            modalBody.innerHTML = `<div class="loading error">Failed to load details. ${error.message}</div>`;
            return;
        }
    }

    // --- Data Consolidation ---
    const machineName = detailData?.machine?.name || item.machine;
    const lotNumber = detailData?.job?.lotNumber || item.lotnumber || "N/A";
    const testMode = detailData?.job?.testMode || item.testmode || "N/A";

    const errorCode = detailData?.status?.errorCode || item.errorCode;
    const errorCategory = (detailData?.status?.errorCategory || item.category || "Unknown").replace(/_/g, " ");
    const errorDescription = detailData?.status?.errorDescription || item.description || "No description available.";
    const errorSeverity = detailData?.status?.errorSeverity || item.severity || "Unknown";
    const sevClass = errorSeverity === "high" ? "critical" : errorSeverity === "medium" ? "warning" : "ok";

    const rootCauses = detailData?.errorDetails?.rootCauses || [
        { likelihood: "N/A", description: "Root cause analysis not available." }
    ];
    const resolutionSteps = detailData?.errorDetails?.resolutionSteps || [
        { step: 1, description: "Resolution path not available.", confidence: "N/A" }
    ];

    // --- UI Rendering ---
    const renderRootCauses = (causes) => causes.map(cause => `
        <div class="rca-item">
            <span class="rca-likelihood">${cause.likelihood}</span>
            <span class="rca-description">${cause.description}</span>
        </div>
    `).join('');

    const renderResolutionSteps = (steps) => steps.map(step => `
        <div class="res-item">
            <span class="res-step">Step ${step.step}</span>
            <p class="res-description">${step.description}</p>
            <span class="res-confidence">Confidence: ${step.confidence}</span>
        </div>
    `).join('');

    modalBody.innerHTML = `
        <div class="detail-grid">
            <!-- Error Summary -->
            <div class="detail-card summary-card">
                <div class="detail-header">
                    <h4>Error Summary</h4>
                    <span class="severity-badge ${sevClass}">${errorSeverity}</span>
                </div>
                <div class="detail-content">
                    <div class="summary-item">
                        <label>Error Code</label>
                        <span>${errorCode}</span>
                    </div>
                    <div class="summary-item">
                        <label>Error Category</label>
                        <span>${errorCategory}</span>
                    </div>
                    <div class="summary-item full-width">
                        <label>Description</label>
                        <p>${errorDescription}</p>
                    </div>
                </div>
            </div>

            <!-- Machine & Job Info -->
            <div class="detail-card info-card">
                <div class="detail-header">
                    <h4>Machine & Job Info</h4>
                </div>
                <div class="detail-content">
                    <div class="info-item">
                        <label>Machine</label>
                        <span>${machineName}</span>
                    </div>
                    <div class="info-item">
                        <label>Lot Number</label>
                        <span>${lotNumber}</span>
                    </div>
                    <div class="info-item">
                        <label>Test Mode</label>
                        <span>${testMode}</span>
                    </div>
                </div>
            </div>

            <!-- Root Cause Analysis -->
            <div class="detail-card rca-card">
                <div class="detail-header">
                    <h4>Root Cause Analysis</h4>
                </div>
                <div class="detail-content">
                    ${renderRootCauses(rootCauses)}
                </div>
            </div>

            <!-- Resolution Path -->
            <div class="detail-card resolution-card">
                <div class="detail-header">
                    <h4>Resolution Path</h4>
                </div>
                <div class="detail-content">
                    ${renderResolutionSteps(resolutionSteps)}
                </div>
            </div>

            <!-- AI Suggestions -->
            <div class="detail-card ai-card">
                <div class="detail-header">
                    <h4>AI Suggestions</h4>
                    <span class="ai-badge">Powered by AI</span>
                </div>
                <div class="detail-content">
                    <p>AI-powered suggestions and insights will appear here. This feature is under development.</p>
                    <button class="ai-button" disabled>Generate Suggestion</button>
                </div>
            </div>
        </div>
    `;
}

function closeErrorDetail() {
    const modal = document.getElementById("errorDetailModal");
    modal.style.display = "none";
}

// ─────────────────────────────────────────
// Machine Grid View  (Connection Management)
// ─────────────────────────────────────────

// Track per-machine connection status: { machineId: "connected"|"disconnected"|"unknown"|"testing" }
let machineConnStatus = {};

function renderMachineGridView(machines) {
    // Update topbar count
    const countEl = document.getElementById("mgvCount");
    if (countEl) countEl.textContent = `${machines.length} machine${machines.length !== 1 ? 's' : ''}`;

    // Apply mgv connection-status filter
    const filtered = mgvFilter === "all" ? machines : machines.filter(m => {
        const connSt = machineConnStatus[m.id] || "unknown";
        return connSt === mgvFilter;
    });

    const grid = document.getElementById("machineGrid");
    grid.innerHTML = "";

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="loading">No machines found</div>';
        return;
    }

    filtered.forEach(m => {
        const card = document.createElement("div");
        card.className = "machine-card";
        card.id = `mc-${m.id}`;

        const connSt = machineConnStatus[m.id] || "unknown";
        const connLabel = connSt === "connected" ? "Connected"
            : connSt === "disconnected" ? "Disconnected"
            : connSt === "testing" ? "Testing..."
            : "Unknown";

        const portLabel = m.vnc_port || 5900;
        const ipDisplay = m.ip ? `${m.ip}:${portLabel}` : "—";
        const ipRaw = m.ip || "—";
        const passTag = m.has_password
            ? `<span class="mc-password-tag">🔒 Secured</span>`
            : `<span class="mc-password-tag no-pass">🔓 No Auth</span>`;

        card.innerHTML = `
            <div class="mc-card-top-bar ${connSt}"></div>
            <div class="mc-card-header">
                <div class="mc-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                </div>
                <div class="mc-card-title">
                    <span class="mc-name">${m.name}</span>
                    <span class="mc-status-badge ${connSt}">
                        <span class="mc-status-dot ${connSt}"></span>
                        ${connLabel}
                    </span>
                </div>
            </div>
            <div class="mc-card-body">
                <div class="mc-info-row">
                    <span class="mc-info-label">IP Address</span>
                    <span class="mc-info-value" title="${ipRaw}">${ipRaw}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Machine ID</span>
                    <span class="mc-info-value" title="${m.id}">${m.id}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Port</span>
                    <span class="mc-info-value" title="${portLabel}">${portLabel}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Folder</span>
                    <span class="mc-info-value" title="${m.vnc_id || '—'}">${m.vnc_id || '—'}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Auth</span>
                    ${passTag}
                </div>
            </div>
            <div class="mc-card-secondary">
                <span>IP: ${ipRaw}</span>
                <span>ID: ${m.id}</span>
            </div>
            <div class="mc-card-footer">
                <button class="mc-btn-test" onclick="testVncConnection('${m.id}')" title="Test VNC Connection">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>
                    Test Connection
                </button>
                <button class="mc-btn-edit" onclick="openEditMachine('${m.id}')" title="Edit Properties">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                </button>
                <button class="mc-btn-delete" onclick="confirmDelete('${m.id}', '${m.name.replace(/'/g, "\\'")}')" title="Remove machine">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"/></svg>
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

// ─────────────────────────────────────────
// Source Filters
// ─────────────────────────────────────────

/**
 * Toggle a machine filter checkbox from anywhere (fail cards, error feed, etc.)
 */
function toggleMachineFilter(machineId) {
    if (!machineId) return;
    if (selectedMachines.has(machineId)) {
        selectedMachines.delete(machineId);
    } else {
        selectedMachines.add(machineId);
    }
    // Update checkbox UI
    const cb = document.getElementById(`filter_${machineId}`);
    if (cb) cb.checked = selectedMachines.has(machineId);
    render();
}

function renderSourceFilters(machines) {
    const container = document.getElementById("sourceFilters");
    if (!machines) return;

    // Only render once, not on every refresh
    if (container.children.length === machines.length) return;

    container.innerHTML = "";

    machines.forEach(m => {
        const sev = getSeverityClass(m.status);
        const item = document.createElement("div");
        item.className = "source-filter-item";
        item.innerHTML = `
            <input type="checkbox" id="filter_${m.id}" value="${m.id}" 
                   ${selectedMachines.has(m.id) ? "checked" : ""}>
            <label for="filter_${m.id}">${m.name}</label>
            <span class="filter-status dot ${sev}"></span>
        `;
        item.querySelector("input").addEventListener("change", (e) => {
            if (e.target.checked) {
                selectedMachines.add(m.id);
            } else {
                selectedMachines.delete(m.id);
            }
            render();
        });
        container.appendChild(item);
    });
}

// ─────────────────────────────────────────
// Error Summary (sidebar)
// ─────────────────────────────────────────
function renderErrorSummary() {
    if (!errorAnalysisData || !errorAnalysisData.summary) return;

    const section = document.getElementById("errorSummarySection");
    const container = document.getElementById("errorSummary");
    section.style.display = "block";
    container.innerHTML = "";

    const cats = errorAnalysisData.summary.categories || {};
    const sevs = errorAnalysisData.summary.severities || {};

    // Show severity counts
    for (const [sev, count] of Object.entries(sevs)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity</span>
            <span class="es-count ${sev}">${count}</span>
        `;
        container.appendChild(item);
    }

    // Show category counts
    for (const [cat, count] of Object.entries(cats)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${cat.replace(/_/g, " ")}</span>
            <span class="es-count medium">${count}</span>
        `;
        container.appendChild(item);
    }
}

// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Error Detail Modal (from 3_simple.py error analysis)
// ─────────────────────────────────────────
function getSeverityLabel(status) {
    switch (status) {
        case "CRITICAL": return "CRITICAL";
        case "ALARM": return "ALARM";
        case "YIELD_FAIL": return "YIELD FAIL";
        case "SITE_FAIL": return "SITE FAIL";
        case "WARNING": return "WARNING";
        default: return "OK";
    }
}

async function openErrorDetail(cardIndex) {
    const item = failCardItems[cardIndex];
    if (!item) return;

    const modal = document.getElementById("errorDetailModal");
    const modalBody = document.getElementById("errorDetailBody");
    modalBody.innerHTML = '<div class="loading">Loading details...</div>';
    modal.style.display = "flex";

    // Fetch detailed data
    let detailData = null;
    if (item.machineId) {
        try {
            const response = await fetch(`${API_BASE}/api/machine/detail/${item.machineId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            detailData = await response.json();
        } catch (error) {
            console.error("Failed to fetch machine details:", error);
            modalBody.innerHTML = `<div class="loading error">Failed to load details. ${error.message}</div>`;
            return;
        }
    }

    // --- Data Consolidation ---
    const machineName = detailData?.machine?.name || item.machine;
    const lotNumber = detailData?.job?.lotNumber || item.lotnumber || "N/A";
    const testMode = detailData?.job?.testMode || item.testmode || "N/A";

    const errorCode = detailData?.status?.errorCode || item.errorCode;
    const errorCategory = (detailData?.status?.errorCategory || item.category || "Unknown").replace(/_/g, " ");
    const errorDescription = detailData?.status?.errorDescription || item.description || "No description available.";
    const errorSeverity = detailData?.status?.errorSeverity || item.severity || "Unknown";
    const sevClass = errorSeverity === "high" ? "critical" : errorSeverity === "medium" ? "warning" : "ok";

    const rootCauses = detailData?.errorDetails?.rootCauses || [
        { likelihood: "N/A", description: "Root cause analysis not available." }
    ];
    const resolutionSteps = detailData?.errorDetails?.resolutionSteps || [
        { step: 1, description: "Resolution path not available.", confidence: "N/A" }
    ];

    // --- UI Rendering ---
    const renderRootCauses = (causes) => causes.map(cause => `
        <div class="rca-item">
            <span class="rca-likelihood">${cause.likelihood}</span>
            <span class="rca-description">${cause.description}</span>
        </div>
    `).join('');

    const renderResolutionSteps = (steps) => steps.map(step => `
        <div class="res-item">
            <span class="res-step">Step ${step.step}</span>
            <p class="res-description">${step.description}</p>
            <span class="res-confidence">Confidence: ${step.confidence}</span>
        </div>
    `).join('');

    modalBody.innerHTML = `
        <div class="detail-grid">
            <!-- Error Summary -->
            <div class="detail-card summary-card">
                <div class="detail-header">
                    <h4>Error Summary</h4>
                    <span class="severity-badge ${sevClass}">${errorSeverity}</span>
                </div>
                <div class="detail-content">
                    <div class="summary-item">
                        <label>Error Code</label>
                        <span>${errorCode}</span>
                    </div>
                    <div class="summary-item">
                        <label>Error Category</label>
                        <span>${errorCategory}</span>
                    </div>
                    <div class="summary-item full-width">
                        <label>Description</label>
                        <p>${errorDescription}</p>
                    </div>
                </div>
            </div>

            <!-- Machine & Job Info -->
            <div class="detail-card info-card">
                <div class="detail-header">
                    <h4>Machine & Job Info</h4>
                </div>
                <div class="detail-content">
                    <div class="info-item">
                        <label>Machine</label>
                        <span>${machineName}</span>
                    </div>
                    <div class="info-item">
                        <label>Lot Number</label>
                        <span>${lotNumber}</span>
                    </div>
                    <div class="info-item">
                        <label>Test Mode</label>
                        <span>${testMode}</span>
                    </div>
                </div>
            </div>

            <!-- Root Cause Analysis -->
            <div class="detail-card rca-card">
                <div class="detail-header">
                    <h4>Root Cause Analysis</h4>
                </div>
                <div class="detail-content">
                    ${renderRootCauses(rootCauses)}
                </div>
            </div>

            <!-- Resolution Path -->
            <div class="detail-card resolution-card">
                <div class="detail-header">
                    <h4>Resolution Path</h4>
                </div>
                <div class="detail-content">
                    ${renderResolutionSteps(resolutionSteps)}
                </div>
            </div>

            <!-- AI Suggestions -->
            <div class="detail-card ai-card">
                <div class="detail-header">
                    <h4>AI Suggestions</h4>
                    <span class="ai-badge">Powered by AI</span>
                </div>
                <div class="detail-content">
                    <p>AI-powered suggestions and insights will appear here. This feature is under development.</p>
                    <button class="ai-button" disabled>Generate Suggestion</button>
                </div>
            </div>
        </div>
    `;
}

function closeErrorDetail() {
    const modal = document.getElementById("errorDetailModal");
    modal.style.display = "none";
}

// ─────────────────────────────────────────
// Machine Grid View  (Connection Management)
// ─────────────────────────────────────────

// Track per-machine connection status: { machineId: "connected"|"disconnected"|"unknown"|"testing" }
let machineConnStatus = {};

function renderMachineGridView(machines) {
    // Update topbar count
    const countEl = document.getElementById("mgvCount");
    if (countEl) countEl.textContent = `${machines.length} machine${machines.length !== 1 ? 's' : ''}`;

    // Apply mgv connection-status filter
    const filtered = mgvFilter === "all" ? machines : machines.filter(m => {
        const connSt = machineConnStatus[m.id] || "unknown";
        return connSt === mgvFilter;
    });

    const grid = document.getElementById("machineGrid");
    grid.innerHTML = "";

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="loading">No machines found</div>';
        return;
    }

    filtered.forEach(m => {
        const card = document.createElement("div");
        card.className = "machine-card";
        card.id = `mc-${m.id}`;

        const connSt = machineConnStatus[m.id] || "unknown";
        const connLabel = connSt === "connected" ? "Connected"
            : connSt === "disconnected" ? "Disconnected"
            : connSt === "testing" ? "Testing..."
            : "Unknown";

        const portLabel = m.vnc_port || 5900;
        const ipDisplay = m.ip ? `${m.ip}:${portLabel}` : "—";
        const ipRaw = m.ip || "—";
        const passTag = m.has_password
            ? `<span class="mc-password-tag">🔒 Secured</span>`
            : `<span class="mc-password-tag no-pass">🔓 No Auth</span>`;

        card.innerHTML = `
            <div class="mc-card-top-bar ${connSt}"></div>
            <div class="mc-card-header">
                <div class="mc-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                </div>
                <div class="mc-card-title">
                    <span class="mc-name">${m.name}</span>
                    <span class="mc-status-badge ${connSt}">
                        <span class="mc-status-dot ${connSt}"></span>
                        ${connLabel}
                    </span>
                </div>
            </div>
            <div class="mc-card-body">
                <div class="mc-info-row">
                    <span class="mc-info-label">IP Address</span>
                    <span class="mc-info-value" title="${ipRaw}">${ipRaw}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Machine ID</span>
                    <span class="mc-info-value" title="${m.id}">${m.id}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Port</span>
                    <span class="mc-info-value" title="${portLabel}">${portLabel}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Folder</span>
                    <span class="mc-info-value" title="${m.vnc_id || '—'}">${m.vnc_id || '—'}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Auth</span>
                    ${passTag}
                </div>
            </div>
            <div class="mc-card-secondary">
                <span>IP: ${ipRaw}</span>
                <span>ID: ${m.id}</span>
            </div>
            <div class="mc-card-footer">
                <button class="mc-btn-test" onclick="testVncConnection('${m.id}')" title="Test VNC Connection">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>
                    Test Connection
                </button>
                <button class="mc-btn-edit" onclick="openEditMachine('${m.id}')" title="Edit Properties">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                </button>
                <button class="mc-btn-delete" onclick="confirmDelete('${m.id}', '${m.name.replace(/'/g, "\\'")}')" title="Remove machine">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"/></svg>
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

// ─────────────────────────────────────────
// Source Filters
// ─────────────────────────────────────────

/**
 * Toggle a machine filter checkbox from anywhere (fail cards, error feed, etc.)
 */
function toggleMachineFilter(machineId) {
    if (!machineId) return;
    if (selectedMachines.has(machineId)) {
        selectedMachines.delete(machineId);
    } else {
        selectedMachines.add(machineId);
    }
    // Update checkbox UI
    const cb = document.getElementById(`filter_${machineId}`);
    if (cb) cb.checked = selectedMachines.has(machineId);
    render();
}

function renderSourceFilters(machines) {
    const container = document.getElementById("sourceFilters");
    if (!machines) return;

    // Only render once, not on every refresh
    if (container.children.length === machines.length) return;

    container.innerHTML = "";

    machines.forEach(m => {
        const sev = getSeverityClass(m.status);
        const item = document.createElement("div");
        item.className = "source-filter-item";
        item.innerHTML = `
            <input type="checkbox" id="filter_${m.id}" value="${m.id}" 
                   ${selectedMachines.has(m.id) ? "checked" : ""}>
            <label for="filter_${m.id}">${m.name}</label>
            <span class="filter-status dot ${sev}"></span>
        `;
        item.querySelector("input").addEventListener("change", (e) => {
            if (e.target.checked) {
                selectedMachines.add(m.id);
            } else {
                selectedMachines.delete(m.id);
            }
            render();
        });
        container.appendChild(item);
    });
}

// ─────────────────────────────────────────
// Error Summary (sidebar)
// ─────────────────────────────────────────
function renderErrorSummary() {
    if (!errorAnalysisData || !errorAnalysisData.summary) return;

    const section = document.getElementById("errorSummarySection");
    const container = document.getElementById("errorSummary");
    section.style.display = "block";
    container.innerHTML = "";

    const cats = errorAnalysisData.summary.categories || {};
    const sevs = errorAnalysisData.summary.severities || {};

    // Show severity counts
    for (const [sev, count] of Object.entries(sevs)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity</span>
            <span class="es-count ${sev}">${count}</span>
        `;
        container.appendChild(item);
    }

    // Show category counts
    for (const [cat, count] of Object.entries(cats)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${cat.replace(/_/g, " ")}</span>
            <span class="es-count medium">${count}</span>
        `;
        container.appendChild(item);
    }
}

// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Error Detail Modal (from 3_simple.py error analysis)
// ─────────────────────────────────────────
function getSeverityLabel(status) {
    switch (status) {
        case "CRITICAL": return "CRITICAL";
        case "ALARM": return "ALARM";
        case "YIELD_FAIL": return "YIELD FAIL";
        case "SITE_FAIL": return "SITE FAIL";
        case "WARNING": return "WARNING";
        default: return "OK";
    }
}

async function openErrorDetail(cardIndex) {
    const item = failCardItems[cardIndex];
    if (!item) return;

    const modal = document.getElementById("errorDetailModal");
    const modalBody = document.getElementById("errorDetailBody");
    modalBody.innerHTML = '<div class="loading">Loading details...</div>';
    modal.style.display = "flex";

    // Fetch detailed data
    let detailData = null;
    if (item.machineId) {
        try {
            const response = await fetch(`${API_BASE}/api/machine/detail/${item.machineId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            detailData = await response.json();
        } catch (error) {
            console.error("Failed to fetch machine details:", error);
            modalBody.innerHTML = `<div class="loading error">Failed to load details. ${error.message}</div>`;
            return;
        }
    }

    // --- Data Consolidation ---
    const machineName = detailData?.machine?.name || item.machine;
    const lotNumber = detailData?.job?.lotNumber || item.lotnumber || "N/A";
    const testMode = detailData?.job?.testMode || item.testmode || "N/A";

    const errorCode = detailData?.status?.errorCode || item.errorCode;
    const errorCategory = (detailData?.status?.errorCategory || item.category || "Unknown").replace(/_/g, " ");
    const errorDescription = detailData?.status?.errorDescription || item.description || "No description available.";
    const errorSeverity = detailData?.status?.errorSeverity || item.severity || "Unknown";
    const sevClass = errorSeverity === "high" ? "critical" : errorSeverity === "medium" ? "warning" : "ok";

    const rootCauses = detailData?.errorDetails?.rootCauses || [
        { likelihood: "N/A", description: "Root cause analysis not available." }
    ];
    const resolutionSteps = detailData?.errorDetails?.resolutionSteps || [
        { step: 1, description: "Resolution path not available.", confidence: "N/A" }
    ];

    // --- UI Rendering ---
    const renderRootCauses = (causes) => causes.map(cause => `
        <div class="rca-item">
            <span class="rca-likelihood">${cause.likelihood}</span>
            <span class="rca-description">${cause.description}</span>
        </div>
    `).join('');

    const renderResolutionSteps = (steps) => steps.map(step => `
        <div class="res-item">
            <span class="res-step">Step ${step.step}</span>
            <p class="res-description">${step.description}</p>
            <span class="res-confidence">Confidence: ${step.confidence}</span>
        </div>
    `).join('');

    modalBody.innerHTML = `
        <div class="detail-grid">
            <!-- Error Summary -->
            <div class="detail-card summary-card">
                <div class="detail-header">
                    <h4>Error Summary</h4>
                    <span class="severity-badge ${sevClass}">${errorSeverity}</span>
                </div>
                <div class="detail-content">
                    <div class="summary-item">
                        <label>Error Code</label>
                        <span>${errorCode}</span>
                    </div>
                    <div class="summary-item">
                        <label>Error Category</label>
                        <span>${errorCategory}</span>
                    </div>
                    <div class="summary-item full-width">
                        <label>Description</label>
                        <p>${errorDescription}</p>
                    </div>
                </div>
            </div>

            <!-- Machine & Job Info -->
            <div class="detail-card info-card">
                <div class="detail-header">
                    <h4>Machine & Job Info</h4>
                </div>
                <div class="detail-content">
                    <div class="info-item">
                        <label>Machine</label>
                        <span>${machineName}</span>
                    </div>
                    <div class="info-item">
                        <label>Lot Number</label>
                        <span>${lotNumber}</span>
                    </div>
                    <div class="info-item">
                        <label>Test Mode</label>
                        <span>${testMode}</span>
                    </div>
                </div>
            </div>

            <!-- Root Cause Analysis -->
            <div class="detail-card rca-card">
                <div class="detail-header">
                    <h4>Root Cause Analysis</h4>
                </div>
                <div class="detail-content">
                    ${renderRootCauses(rootCauses)}
                </div>
            </div>

            <!-- Resolution Path -->
            <div class="detail-card resolution-card">
                <div class="detail-header">
                    <h4>Resolution Path</h4>
                </div>
                <div class="detail-content">
                    ${renderResolutionSteps(resolutionSteps)}
                </div>
            </div>

            <!-- AI Suggestions -->
            <div class="detail-card ai-card">
                <div class="detail-header">
                    <h4>AI Suggestions</h4>
                    <span class="ai-badge">Powered by AI</span>
                </div>
                <div class="detail-content">
                    <p>AI-powered suggestions and insights will appear here. This feature is under development.</p>
                    <button class="ai-button" disabled>Generate Suggestion</button>
                </div>
            </div>
        </div>
    `;
}

function closeErrorDetail() {
    const modal = document.getElementById("errorDetailModal");
    modal.style.display = "none";
}

// ─────────────────────────────────────────
// Machine Grid View  (Connection Management)
// ─────────────────────────────────────────

// Track per-machine connection status: { machineId: "connected"|"disconnected"|"unknown"|"testing" }
let machineConnStatus = {};

function renderMachineGridView(machines) {
    // Update topbar count
    const countEl = document.getElementById("mgvCount");
    if (countEl) countEl.textContent = `${machines.length} machine${machines.length !== 1 ? 's' : ''}`;

    // Apply mgv connection-status filter
    const filtered = mgvFilter === "all" ? machines : machines.filter(m => {
        const connSt = machineConnStatus[m.id] || "unknown";
        return connSt === mgvFilter;
    });

    const grid = document.getElementById("machineGrid");
    grid.innerHTML = "";

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="loading">No machines found</div>';
        return;
    }

    filtered.forEach(m => {
        const card = document.createElement("div");
        card.className = "machine-card";
        card.id = `mc-${m.id}`;

        const connSt = machineConnStatus[m.id] || "unknown";
        const connLabel = connSt === "connected" ? "Connected"
            : connSt === "disconnected" ? "Disconnected"
            : connSt === "testing" ? "Testing..."
            : "Unknown";

        const portLabel = m.vnc_port || 5900;
        const ipDisplay = m.ip ? `${m.ip}:${portLabel}` : "—";
        const ipRaw = m.ip || "—";
        const passTag = m.has_password
            ? `<span class="mc-password-tag">🔒 Secured</span>`
            : `<span class="mc-password-tag no-pass">🔓 No Auth</span>`;

        card.innerHTML = `
            <div class="mc-card-top-bar ${connSt}"></div>
            <div class="mc-card-header">
                <div class="mc-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                </div>
                <div class="mc-card-title">
                    <span class="mc-name">${m.name}</span>
                    <span class="mc-status-badge ${connSt}">
                        <span class="mc-status-dot ${connSt}"></span>
                        ${connLabel}
                    </span>
                </div>
            </div>
            <div class="mc-card-body">
                <div class="mc-info-row">
                    <span class="mc-info-label">IP Address</span>
                    <span class="mc-info-value" title="${ipRaw}">${ipRaw}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Machine ID</span>
                    <span class="mc-info-value" title="${m.id}">${m.id}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Port</span>
                    <span class="mc-info-value" title="${portLabel}">${portLabel}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Folder</span>
                    <span class="mc-info-value" title="${m.vnc_id || '—'}">${m.vnc_id || '—'}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Auth</span>
                    ${passTag}
                </div>
            </div>
            <div class="mc-card-secondary">
                <span>IP: ${ipRaw}</span>
                <span>ID: ${m.id}</span>
            </div>
            <div class="mc-card-footer">
                <button class="mc-btn-test" onclick="testVncConnection('${m.id}')" title="Test VNC Connection">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>
                    Test Connection
                </button>
                <button class="mc-btn-edit" onclick="openEditMachine('${m.id}')" title="Edit Properties">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                </button>
                <button class="mc-btn-delete" onclick="confirmDelete('${m.id}', '${m.name.replace(/'/g, "\\'")}')" title="Remove machine">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"/></svg>
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

// ─────────────────────────────────────────
// Source Filters
// ─────────────────────────────────────────

/**
 * Toggle a machine filter checkbox from anywhere (fail cards, error feed, etc.)
 */
function toggleMachineFilter(machineId) {
    if (!machineId) return;
    if (selectedMachines.has(machineId)) {
        selectedMachines.delete(machineId);
    } else {
        selectedMachines.add(machineId);
    }
    // Update checkbox UI
    const cb = document.getElementById(`filter_${machineId}`);
    if (cb) cb.checked = selectedMachines.has(machineId);
    render();
}

function renderSourceFilters(machines) {
    const container = document.getElementById("sourceFilters");
    if (!machines) return;

    // Only render once, not on every refresh
    if (container.children.length === machines.length) return;

    container.innerHTML = "";

    machines.forEach(m => {
        const sev = getSeverityClass(m.status);
        const item = document.createElement("div");
        item.className = "source-filter-item";
        item.innerHTML = `
            <input type="checkbox" id="filter_${m.id}" value="${m.id}" 
                   ${selectedMachines.has(m.id) ? "checked" : ""}>
            <label for="filter_${m.id}">${m.name}</label>
            <span class="filter-status dot ${sev}"></span>
        `;
        item.querySelector("input").addEventListener("change", (e) => {
            if (e.target.checked) {
                selectedMachines.add(m.id);
            } else {
                selectedMachines.delete(m.id);
            }
            render();
        });
        container.appendChild(item);
    });
}

// ─────────────────────────────────────────
// Error Summary (sidebar)
// ─────────────────────────────────────────
function renderErrorSummary() {
    if (!errorAnalysisData || !errorAnalysisData.summary) return;

    const section = document.getElementById("errorSummarySection");
    const container = document.getElementById("errorSummary");
    section.style.display = "block";
    container.innerHTML = "";

    const cats = errorAnalysisData.summary.categories || {};
    const sevs = errorAnalysisData.summary.severities || {};

    // Show severity counts
    for (const [sev, count] of Object.entries(sevs)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity</span>
            <span class="es-count ${sev}">${count}</span>
        `;
        container.appendChild(item);
    }

    // Show category counts
    for (const [cat, count] of Object.entries(cats)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${cat.replace(/_/g, " ")}</span>
            <span class="es-count medium">${count}</span>
        `;
        container.appendChild(item);
    }
}

// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Error Detail Modal (from 3_simple.py error analysis)
// ─────────────────────────────────────────
function getSeverityLabel(status) {
    switch (status) {
        case "CRITICAL": return "CRITICAL";
        case "ALARM": return "ALARM";
        case "YIELD_FAIL": return "YIELD FAIL";
        case "SITE_FAIL": return "SITE FAIL";
        case "WARNING": return "WARNING";
        default: return "OK";
    }
}

async function openErrorDetail(cardIndex) {
    const item = failCardItems[cardIndex];
    if (!item) return;

    const modal = document.getElementById("errorDetailModal");
    const modalBody = document.getElementById("errorDetailBody");
    modalBody.innerHTML = '<div class="loading">Loading details...</div>';
    modal.style.display = "flex";

    // Fetch detailed data
    let detailData = null;
    if (item.machineId) {
        try {
            const response = await fetch(`${API_BASE}/api/machine/detail/${item.machineId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            detailData = await response.json();
        } catch (error) {
            console.error("Failed to fetch machine details:", error);
            modalBody.innerHTML = `<div class="loading error">Failed to load details. ${error.message}</div>`;
            return;
        }
    }

    // --- Data Consolidation ---
    const machineName = detailData?.machine?.name || item.machine;
    const lotNumber = detailData?.job?.lotNumber || item.lotnumber || "N/A";
    const testMode = detailData?.job?.testMode || item.testmode || "N/A";

    const errorCode = detailData?.status?.errorCode || item.errorCode;
    const errorCategory = (detailData?.status?.errorCategory || item.category || "Unknown").replace(/_/g, " ");
    const errorDescription = detailData?.status?.errorDescription || item.description || "No description available.";
    const errorSeverity = detailData?.status?.errorSeverity || item.severity || "Unknown";
    const sevClass = errorSeverity === "high" ? "critical" : errorSeverity === "medium" ? "warning" : "ok";

    const rootCauses = detailData?.errorDetails?.rootCauses || [
        { likelihood: "N/A", description: "Root cause analysis not available." }
    ];
    const resolutionSteps = detailData?.errorDetails?.resolutionSteps || [
        { step: 1, description: "Resolution path not available.", confidence: "N/A" }
    ];

    // --- UI Rendering ---
    const renderRootCauses = (causes) => causes.map(cause => `
        <div class="rca-item">
            <span class="rca-likelihood">${cause.likelihood}</span>
            <span class="rca-description">${cause.description}</span>
        </div>
    `).join('');

    const renderResolutionSteps = (steps) => steps.map(step => `
        <div class="res-item">
            <span class="res-step">Step ${step.step}</span>
            <p class="res-description">${step.description}</p>
            <span class="res-confidence">Confidence: ${step.confidence}</span>
        </div>
    `).join('');

    modalBody.innerHTML = `
        <div class="detail-grid">
            <!-- Error Summary -->
            <div class="detail-card summary-card">
                <div class="detail-header">
                    <h4>Error Summary</h4>
                    <span class="severity-badge ${sevClass}">${errorSeverity}</span>
                </div>
                <div class="detail-content">
                    <div class="summary-item">
                        <label>Error Code</label>
                        <span>${errorCode}</span>
                    </div>
                    <div class="summary-item">
                        <label>Error Category</label>
                        <span>${errorCategory}</span>
                    </div>
                    <div class="summary-item full-width">
                        <label>Description</label>
                        <p>${errorDescription}</p>
                    </div>
                </div>
            </div>

            <!-- Machine & Job Info -->
            <div class="detail-card info-card">
                <div class="detail-header">
                    <h4>Machine & Job Info</h4>
                </div>
                <div class="detail-content">
                    <div class="info-item">
                        <label>Machine</label>
                        <span>${machineName}</span>
                    </div>
                    <div class="info-item">
                        <label>Lot Number</label>
                        <span>${lotNumber}</span>
                    </div>
                    <div class="info-item">
                        <label>Test Mode</label>
                        <span>${testMode}</span>
                    </div>
                </div>
            </div>

            <!-- Root Cause Analysis -->
            <div class="detail-card rca-card">
                <div class="detail-header">
                    <h4>Root Cause Analysis</h4>
                </div>
                <div class="detail-content">
                    ${renderRootCauses(rootCauses)}
                </div>
            </div>

            <!-- Resolution Path -->
            <div class="detail-card resolution-card">
                <div class="detail-header">
                    <h4>Resolution Path</h4>
                </div>
                <div class="detail-content">
                    ${renderResolutionSteps(resolutionSteps)}
                </div>
            </div>

            <!-- AI Suggestions -->
            <div class="detail-card ai-card">
                <div class="detail-header">
                    <h4>AI Suggestions</h4>
                    <span class="ai-badge">Powered by AI</span>
                </div>
                <div class="detail-content">
                    <p>AI-powered suggestions and insights will appear here. This feature is under development.</p>
                    <button class="ai-button" disabled>Generate Suggestion</button>
                </div>
            </div>
        </div>
    `;
}

function closeErrorDetail() {
    const modal = document.getElementById("errorDetailModal");
    modal.style.display = "none";
}

// ─────────────────────────────────────────
// Machine Grid View  (Connection Management)
// ─────────────────────────────────────────

// Track per-machine connection status: { machineId: "connected"|"disconnected"|"unknown"|"testing" }
let machineConnStatus = {};

function renderMachineGridView(machines) {
    // Update topbar count
    const countEl = document.getElementById("mgvCount");
    if (countEl) countEl.textContent = `${machines.length} machine${machines.length !== 1 ? 's' : ''}`;

    // Apply mgv connection-status filter
    const filtered = mgvFilter === "all" ? machines : machines.filter(m => {
        const connSt = machineConnStatus[m.id] || "unknown";
        return connSt === mgvFilter;
    });

    const grid = document.getElementById("machineGrid");
    grid.innerHTML = "";

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="loading">No machines found</div>';
        return;
    }

    filtered.forEach(m => {
        const card = document.createElement("div");
        card.className = "machine-card";
        card.id = `mc-${m.id}`;

        const connSt = machineConnStatus[m.id] || "unknown";
        const connLabel = connSt === "connected" ? "Connected"
            : connSt === "disconnected" ? "Disconnected"
            : connSt === "testing" ? "Testing..."
            : "Unknown";

        const portLabel = m.vnc_port || 5900;
        const ipDisplay = m.ip ? `${m.ip}:${portLabel}` : "—";
        const ipRaw = m.ip || "—";
        const passTag = m.has_password
            ? `<span class="mc-password-tag">🔒 Secured</span>`
            : `<span class="mc-password-tag no-pass">🔓 No Auth</span>`;

        card.innerHTML = `
            <div class="mc-card-top-bar ${connSt}"></div>
            <div class="mc-card-header">
                <div class="mc-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                </div>
                <div class="mc-card-title">
                    <span class="mc-name">${m.name}</span>
                    <span class="mc-status-badge ${connSt}">
                        <span class="mc-status-dot ${connSt}"></span>
                        ${connLabel}
                    </span>
                </div>
            </div>
            <div class="mc-card-body">
                <div class="mc-info-row">
                    <span class="mc-info-label">IP Address</span>
                    <span class="mc-info-value" title="${ipRaw}">${ipRaw}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Machine ID</span>
                    <span class="mc-info-value" title="${m.id}">${m.id}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Port</span>
                    <span class="mc-info-value" title="${portLabel}">${portLabel}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Folder</span>
                    <span class="mc-info-value" title="${m.vnc_id || '—'}">${m.vnc_id || '—'}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Auth</span>
                    ${passTag}
                </div>
            </div>
            <div class="mc-card-secondary">
                <span>IP: ${ipRaw}</span>
                <span>ID: ${m.id}</span>
            </div>
            <div class="mc-card-footer">
                <button class="mc-btn-test" onclick="testVncConnection('${m.id}')" title="Test VNC Connection">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>
                    Test Connection
                </button>
                <button class="mc-btn-edit" onclick="openEditMachine('${m.id}')" title="Edit Properties">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                </button>
                <button class="mc-btn-delete" onclick="confirmDelete('${m.id}', '${m.name.replace(/'/g, "\\'")}')" title="Remove machine">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"/></svg>
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

// ─────────────────────────────────────────
// Source Filters
// ─────────────────────────────────────────

/**
 * Toggle a machine filter checkbox from anywhere (fail cards, error feed, etc.)
 */
function toggleMachineFilter(machineId) {
    if (!machineId) return;
    if (selectedMachines.has(machineId)) {
        selectedMachines.delete(machineId);
    } else {
        selectedMachines.add(machineId);
    }
    // Update checkbox UI
    const cb = document.getElementById(`filter_${machineId}`);
    if (cb) cb.checked = selectedMachines.has(machineId);
    render();
}

function renderSourceFilters(machines) {
    const container = document.getElementById("sourceFilters");
    if (!machines) return;

    // Only render once, not on every refresh
    if (container.children.length === machines.length) return;

    container.innerHTML = "";

    machines.forEach(m => {
        const sev = getSeverityClass(m.status);
        const item = document.createElement("div");
        item.className = "source-filter-item";
        item.innerHTML = `
            <input type="checkbox" id="filter_${m.id}" value="${m.id}" 
                   ${selectedMachines.has(m.id) ? "checked" : ""}>
            <label for="filter_${m.id}">${m.name}</label>
            <span class="filter-status dot ${sev}"></span>
        `;
        item.querySelector("input").addEventListener("change", (e) => {
            if (e.target.checked) {
                selectedMachines.add(m.id);
            } else {
                selectedMachines.delete(m.id);
            }
            render();
        });
        container.appendChild(item);
    });
}

// ─────────────────────────────────────────
// Error Summary (sidebar)
// ─────────────────────────────────────────
function renderErrorSummary() {
    if (!errorAnalysisData || !errorAnalysisData.summary) return;

    const section = document.getElementById("errorSummarySection");
    const container = document.getElementById("errorSummary");
    section.style.display = "block";
    container.innerHTML = "";

    const cats = errorAnalysisData.summary.categories || {};
    const sevs = errorAnalysisData.summary.severities || {};

    // Show severity counts
    for (const [sev, count] of Object.entries(sevs)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity</span>
            <span class="es-count ${sev}">${count}</span>
        `;
        container.appendChild(item);
    }

    // Show category counts
    for (const [cat, count] of Object.entries(cats)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${cat.replace(/_/g, " ")}</span>
            <span class="es-count medium">${count}</span>
        `;
        container.appendChild(item);
    }
}

// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Error Detail Modal (from 3_simple.py error analysis)
// ─────────────────────────────────────────
function getSeverityLabel(status) {
    switch (status) {
        case "CRITICAL": return "CRITICAL";
        case "ALARM": return "ALARM";
        case "YIELD_FAIL": return "YIELD FAIL";
        case "SITE_FAIL": return "SITE FAIL";
        case "WARNING": return "WARNING";
        default: return "OK";
    }
}

async function openErrorDetail(cardIndex) {
    const item = failCardItems[cardIndex];
    if (!item) return;

    const modal = document.getElementById("errorDetailModal");
    const modalBody = document.getElementById("errorDetailBody");
    modalBody.innerHTML = '<div class="loading">Loading details...</div>';
    modal.style.display = "flex";

    // Fetch detailed data
    let detailData = null;
    if (item.machineId) {
        try {
            const response = await fetch(`${API_BASE}/api/machine/detail/${item.machineId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            detailData = await response.json();
        } catch (error) {
            console.error("Failed to fetch machine details:", error);
            modalBody.innerHTML = `<div class="loading error">Failed to load details. ${error.message}</div>`;
            return;
        }
    }

    // --- Data Consolidation ---
    const machineName = detailData?.machine?.name || item.machine;
    const lotNumber = detailData?.job?.lotNumber || item.lotnumber || "N/A";
    const testMode = detailData?.job?.testMode || item.testmode || "N/A";

    const errorCode = detailData?.status?.errorCode || item.errorCode;
    const errorCategory = (detailData?.status?.errorCategory || item.category || "Unknown").replace(/_/g, " ");
    const errorDescription = detailData?.status?.errorDescription || item.description || "No description available.";
    const errorSeverity = detailData?.status?.errorSeverity || item.severity || "Unknown";
    const sevClass = errorSeverity === "high" ? "critical" : errorSeverity === "medium" ? "warning" : "ok";

    const rootCauses = detailData?.errorDetails?.rootCauses || [
        { likelihood: "N/A", description: "Root cause analysis not available." }
    ];
    const resolutionSteps = detailData?.errorDetails?.resolutionSteps || [
        { step: 1, description: "Resolution path not available.", confidence: "N/A" }
    ];

    // --- UI Rendering ---
    const renderRootCauses = (causes) => causes.map(cause => `
        <div class="rca-item">
            <span class="rca-likelihood">${cause.likelihood}</span>
            <span class="rca-description">${cause.description}</span>
        </div>
    `).join('');

    const renderResolutionSteps = (steps) => steps.map(step => `
        <div class="res-item">
            <span class="res-step">Step ${step.step}</span>
            <p class="res-description">${step.description}</p>
            <span class="res-confidence">Confidence: ${step.confidence}</span>
        </div>
    `).join('');

    modalBody.innerHTML = `
        <div class="detail-grid">
            <!-- Error Summary -->
            <div class="detail-card summary-card">
                <div class="detail-header">
                    <h4>Error Summary</h4>
                    <span class="severity-badge ${sevClass}">${errorSeverity}</span>
                </div>
                <div class="detail-content">
                    <div class="summary-item">
                        <label>Error Code</label>
                        <span>${errorCode}</span>
                    </div>
                    <div class="summary-item">
                        <label>Error Category</label>
                        <span>${errorCategory}</span>
                    </div>
                    <div class="summary-item full-width">
                        <label>Description</label>
                        <p>${errorDescription}</p>
                    </div>
                </div>
            </div>

            <!-- Machine & Job Info -->
            <div class="detail-card info-card">
                <div class="detail-header">
                    <h4>Machine & Job Info</h4>
                </div>
                <div class="detail-content">
                    <div class="info-item">
                        <label>Machine</label>
                        <span>${machineName}</span>
                    </div>
                    <div class="info-item">
                        <label>Lot Number</label>
                        <span>${lotNumber}</span>
                    </div>
                    <div class="info-item">
                        <label>Test Mode</label>
                        <span>${testMode}</span>
                    </div>
                </div>
            </div>

            <!-- Root Cause Analysis -->
            <div class="detail-card rca-card">
                <div class="detail-header">
                    <h4>Root Cause Analysis</h4>
                </div>
                <div class="detail-content">
                    ${renderRootCauses(rootCauses)}
                </div>
            </div>

            <!-- Resolution Path -->
            <div class="detail-card resolution-card">
                <div class="detail-header">
                    <h4>Resolution Path</h4>
                </div>
                <div class="detail-content">
                    ${renderResolutionSteps(resolutionSteps)}
                </div>
            </div>

            <!-- AI Suggestions -->
            <div class="detail-card ai-card">
                <div class="detail-header">
                    <h4>AI Suggestions</h4>
                    <span class="ai-badge">Powered by AI</span>
                </div>
                <div class="detail-content">
                    <p>AI-powered suggestions and insights will appear here. This feature is under development.</p>
                    <button class="ai-button" disabled>Generate Suggestion</button>
                </div>
            </div>
        </div>
    `;
}

function closeErrorDetail() {
    const modal = document.getElementById("errorDetailModal");
    modal.style.display = "none";
}

// ─────────────────────────────────────────
// Machine Grid View  (Connection Management)
// ─────────────────────────────────────────

// Track per-machine connection status: { machineId: "connected"|"disconnected"|"unknown"|"testing" }
let machineConnStatus = {};

function renderMachineGridView(machines) {
    // Update topbar count
    const countEl = document.getElementById("mgvCount");
    if (countEl) countEl.textContent = `${machines.length} machine${machines.length !== 1 ? 's' : ''}`;

    // Apply mgv connection-status filter
    const filtered = mgvFilter === "all" ? machines : machines.filter(m => {
        const connSt = machineConnStatus[m.id] || "unknown";
        return connSt === mgvFilter;
    });

    const grid = document.getElementById("machineGrid");
    grid.innerHTML = "";

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="loading">No machines found</div>';
        return;
    }

    filtered.forEach(m => {
        const card = document.createElement("div");
        card.className = "machine-card";
        card.id = `mc-${m.id}`;

        const connSt = machineConnStatus[m.id] || "unknown";
        const connLabel = connSt === "connected" ? "Connected"
            : connSt === "disconnected" ? "Disconnected"
            : connSt === "testing" ? "Testing..."
            : "Unknown";

        const portLabel = m.vnc_port || 5900;
        const ipDisplay = m.ip ? `${m.ip}:${portLabel}` : "—";
        const ipRaw = m.ip || "—";
        const passTag = m.has_password
            ? `<span class="mc-password-tag">🔒 Secured</span>`
            : `<span class="mc-password-tag no-pass">🔓 No Auth</span>`;

        card.innerHTML = `
            <div class="mc-card-top-bar ${connSt}"></div>
            <div class="mc-card-header">
                <div class="mc-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                </div>
                <div class="mc-card-title">
                    <span class="mc-name">${m.name}</span>
                    <span class="mc-status-badge ${connSt}">
                        <span class="mc-status-dot ${connSt}"></span>
                        ${connLabel}
                    </span>
                </div>
            </div>
            <div class="mc-card-body">
                <div class="mc-info-row">
                    <span class="mc-info-label">IP Address</span>
                    <span class="mc-info-value" title="${ipRaw}">${ipRaw}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Machine ID</span>
                    <span class="mc-info-value" title="${m.id}">${m.id}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Port</span>
                    <span class="mc-info-value" title="${portLabel}">${portLabel}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">VNC Folder</span>
                    <span class="mc-info-value" title="${m.vnc_id || '—'}">${m.vnc_id || '—'}</span>
                </div>
                <div class="mc-info-row">
                    <span class="mc-info-label">Auth</span>
                    ${passTag}
                </div>
            </div>
            <div class="mc-card-secondary">
                <span>IP: ${ipRaw}</span>
                <span>ID: ${m.id}</span>
            </div>
            <div class="mc-card-footer">
                <button class="mc-btn-test" onclick="testVncConnection('${m.id}')" title="Test VNC Connection">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>
                    Test Connection
                </button>
                <button class="mc-btn-edit" onclick="openEditMachine('${m.id}')" title="Edit Properties">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                </button>
                <button class="mc-btn-delete" onclick="confirmDelete('${m.id}', '${m.name.replace(/'/g, "\\'")}')" title="Remove machine">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"/></svg>
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

// ─────────────────────────────────────────
// Source Filters
// ─────────────────────────────────────────

/**
 * Toggle a machine filter checkbox from anywhere (fail cards, error feed, etc.)
 */
function toggleMachineFilter(machineId) {
    if (!machineId) return;
    if (selectedMachines.has(machineId)) {
        selectedMachines.delete(machineId);
    } else {
        selectedMachines.add(machineId);
    }
    // Update checkbox UI
    const cb = document.getElementById(`filter_${machineId}`);
    if (cb) cb.checked = selectedMachines.has(machineId);
    render();
}

function renderSourceFilters(machines) {
    const container = document.getElementById("sourceFilters");
    if (!machines) return;

    // Only render once, not on every refresh
    if (container.children.length === machines.length) return;

    container.innerHTML = "";

    machines.forEach(m => {
        const sev = getSeverityClass(m.status);
        const item = document.createElement("div");
        item.className = "source-filter-item";
        item.innerHTML = `
            <input type="checkbox" id="filter_${m.id}" value="${m.id}" 
                   ${selectedMachines.has(m.id) ? "checked" : ""}>
            <label for="filter_${m.id}">${m.name}</label>
            <span class="filter-status dot ${sev}"></span>
        `;
        item.querySelector("input").addEventListener("change", (e) => {
            if (e.target.checked) {
                selectedMachines.add(m.id);
            } else {
                selectedMachines.delete(m.id);
            }
            render();
        });
        container.appendChild(item);
    });
}

// ─────────────────────────────────────────
// Error Summary (sidebar)
// ─────────────────────────────────────────
function renderErrorSummary() {
    if (!errorAnalysisData || !errorAnalysisData.summary) return;

    const section = document.getElementById("errorSummarySection");
    const container = document.getElementById("errorSummary");
    section.style.display = "block";
    container.innerHTML = "";

    const cats = errorAnalysisData.summary.categories || {};
    const sevs = errorAnalysisData.summary.severities || {};

    // Show severity counts
    for (const [sev, count] of Object.entries(sevs)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity</span>
            <span class="es-count ${sev}">${count}</span>
        `;
        container.appendChild(item);
    }

    // Show category counts
    for (const [cat, count] of Object.entries(cats)) {
        const item = document.createElement("div");
        item.className = "error-summary-item";
        item.innerHTML = `
            <span class="es-cat">${cat.replace(/_/g, " ")}</span>
            <span class="es-count medium">${count}</span>
        `;
        container.appendChild(item);
    }
}

// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Error Detail Modal (from 3_simple.py error analysis)
// ─────────────────────────────────────────
function getSeverityLabel(status) {
    switch (status) {
        case "CRITICAL": return "CRITICAL";
        case "ALARM": return "ALARM";
        case "YIELD_FAIL": return "YIELD FAIL";
        case "SITE_FAIL": return "SITE FAIL";
        case "WARNING": return "WARNING";
        default: return "OK";
    }
}

async function openErrorDetail(cardIndex) {
    const item = failCardItems[cardIndex];
    if (!item) return;

    const modal = document.getElementById("errorDetailModal");
    const modalBody = document.getElementById("errorDetailBody");
    modalBody.innerHTML = '<div class="loading">Loading details...</div>';
    modal.style.display = "flex";

    // Fetch detailed data
    let detailData = null;
    if (item.machineId) {
        try {
            const response = await fetch(`${API_BASE}/api/machine/detail/${item.machineId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            detailData = await response.json();
        } catch (error) {
            console.error("Failed to fetch machine details:", error);
            modalBody.innerHTML = `<div class="loading error">Failed to load details. ${error.message}</div>`;
            return;
        }
    }

    // --- Data Consolidation ---
    const machineName = detailData?.machine?.name || item.machine;
    const lotNumber = detailData?.job?.lotNumber || item.lotnumber || "N/A";
    const testMode = detailData?.job?.testMode || item.testmode || "N/A";

    const errorCode = detailData?.status?.errorCode || item.errorCode;
    const errorCategory = (detailData?.status?.errorCategory || item.category || "Unknown").replace(/_/g, " ");
    const errorDescription = detailData?.status?.errorDescription || item.description || "No description available.";
    const errorSeverity = detailData?.status?.errorSeverity || item.severity || "Unknown";
    const sevClass = errorSeverity === "high" ? "critical" : errorSeverity === "medium" ? "warning" : "ok";

    const rootCauses = detailData?.errorDetails?.rootCauses || [
        { likelihood: "N/A", description: "Root cause analysis not available." }
    ];
    const resolutionSteps = detailData?.errorDetails?.resolutionSteps || [
        { step: 1, description: "Resolution path not available.", confidence: "N/A" }
    ];

    // --- UI Rendering ---
    const renderRootCauses = (causes) => causes.map(cause => `
        <div class="rca-item">
            <span class="rca-likelihood">${cause.likelihood}</span>
            <span class="rca-description">${cause.description}</span>
        </div>
    `).join('');

    const renderResolutionSteps =