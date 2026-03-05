// Dashboard JavaScript - Infineon Knowledge Analytics

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    initializeNavigation();
    initializeThemeToggle();
    initializeSidebar();
    await loadDashboard();
    await loadHotTags(); // Load sidebar tags
    updateLastUpdatedTime();
    
    // Auto-refresh every 5 minutes
    setInterval(loadDashboard, 300000);
});

// Initialize theme toggle
function initializeThemeToggle() {
    const themeToggle = document.getElementById('themeToggleBtn');
    if (!themeToggle) return;
    
    const theme = localStorage.getItem('theme') || 'dark';
    updateThemeDisplay(theme);
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = localStorage.getItem('theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        localStorage.setItem('theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        document.body.setAttribute('data-theme', newTheme);
        updateThemeDisplay(newTheme);
    });
}

function updateThemeDisplay(theme) {
    const label = document.getElementById('themeLabel');
    if (label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';
}

// Initialize sidebar
function initializeSidebar() {
    const toggleBtn = document.getElementById('toggleSidebarButton');
    const chatList = document.getElementById('chatList');
    const chatbox = document.getElementById('chatbox');
    const header = document.querySelector('.header1');

    if (!toggleBtn || !chatList) return;

    // Restore sidebar state from localStorage
    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        chatList.classList.add('collapsed');
        if (chatbox) chatbox.classList.add('collapsed');
        if (header) header.classList.add('collapsed');
        toggleBtn.classList.add('collapsed');
    }

    toggleBtn.addEventListener('click', () => {
        chatList.classList.toggle('collapsed');
        if (chatbox) chatbox.classList.toggle('collapsed');
        if (header) header.classList.toggle('collapsed');
        toggleBtn.classList.toggle('collapsed');
        localStorage.setItem('sidebarCollapsed', chatList.classList.contains('collapsed'));
    });
}

// Initialize navigation
function initializeNavigation() {
    // Update active nav button
    const dashboardBtn = document.querySelector('a[href="/dashboard.html"]');
    if (dashboardBtn) {
        dashboardBtn.classList.add('active');
    }
}

// Main dashboard loader
async function loadDashboard() {
    try {
        await Promise.all([
            loadSummaryMetrics(),
            loadKnowledgeGapHeatmap(),
            loadRetrainingZone(),
            loadDepartmentChart()
        ]);
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError('Failed to load dashboard data. Please refresh the page.');
    }
}

// Load summary metrics
async function loadSummaryMetrics() {
    try {
        // Get AI learning analytics
        const analyticsResponse = await fetch('/api/knowledge-group-analytics');
        
        if (!analyticsResponse.ok) {
            throw new Error('Failed to fetch analytics');
        }
        
        const result = await analyticsResponse.json();
        console.log('Analytics API response:', result);
        
        if (!result.success || !result.data) {
            throw new Error('Invalid analytics response');
        }
        
        const groups = result.data.groupDistribution || [];
        const summary = result.data.summary || {};
        
        // Use summary stats from AI analytics (includes pending from ai_suggestions)
        const totalQuestions = summary.totalQuestions || groups.reduce((sum, g) => sum + (parseInt(g.total_questions) || 0), 0);
        const totalRejected = summary.totalRejected || groups.reduce((sum, g) => sum + (parseInt(g.rejected_count) || 0), 0);
        const totalAccepted = summary.totalAccepted || groups.reduce((sum, g) => sum + (parseInt(g.accepted_count) || 0), 0);
        
        // Get pending count from ai_suggestions (decision = 'pending')
        const totalPending = summary.totalPending || groups.reduce((sum, g) => sum + (parseInt(g.pending_count) || 0), 0);
        
        // Update main stats
        document.getElementById('totalQuestions').textContent = totalQuestions;
        document.getElementById('pendingQuestions').textContent = totalPending;
        document.getElementById('acceptedAnswers').textContent = totalAccepted;
        document.getElementById('rejectedAnswers').textContent = totalRejected;
        
        // Render knowledge coverage progress
        renderKnowledgeCoverage(groups);
        
    } catch (error) {
        console.error('Error loading summary metrics:', error);
        document.getElementById('totalQuestions').textContent = '-';
        document.getElementById('pendingQuestions').textContent = '-';
        document.getElementById('acceptedAnswers').textContent = '-';
        document.getElementById('rejectedAnswers').textContent = '-';
    }
}

// Render knowledge coverage
function renderKnowledgeCoverage(data) {
    const container = document.getElementById('knowledgeCoverage');
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-chart-line"></i> No data available</div>';
        return;
    }
    
    const totalQuestions = data.reduce((sum, item) => sum + (parseInt(item.total_questions) || 0), 0);
    
    let html = '';
    data.slice(0, 5).forEach(item => {
        const percentage = totalQuestions > 0 ? Math.round((item.total_questions / totalQuestions) * 100) : 0;
        const topic = item.predicted_group || 'Unknown';
        
        html += `
            <div class="progress-item">
                <div class="progress-label">
                    <span>${topic}</span>
                    <span>${percentage}% (${item.total_questions})</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percentage}%">${percentage > 10 ? percentage + '%' : ''}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Load knowledge gap heatmap
async function loadKnowledgeGapHeatmap() {
    try {
        const response = await fetch('/api/knowledge-group-analytics');
        if (!response.ok) throw new Error('Failed to fetch analytics');
        
        const result = await response.json();
        if (!result.success || !result.data) {
            throw new Error('Invalid analytics response');
        }
        
        const data = result.data.groupDistribution || [];
        
        // Calculate Criticality Score and sort by it
        const filteredData = data.filter(item => item.predicted_group && item.predicted_group !== 'Other');
        
        // 1️⃣ Find max values for normalization
        const maxRejected = Math.max(...filteredData.map(item => parseInt(item.rejected_count) || 0), 1); // min 1 to avoid division by 0
        const maxTotal = Math.max(...filteredData.map(item => parseInt(item.total_questions) || 0), 1);
        
        console.log('📊 Normalization factors:', { maxRejected, maxTotal });
        
        const sortedData = filteredData
            .map(item => {
                const rejected = parseInt(item.rejected_count) || 0;
                const accepted = parseInt(item.accepted_count) || 0;
                const total = parseInt(item.total_questions) || 0;
                const totalDecisions = rejected + accepted;
                
                // Reject % in 0-1 range (not 0-100)
                const rejectPct = totalDecisions > 0 ? rejected / totalDecisions : 0;
                
                // 2️⃣ Normalize values (0-1 range)
                const normalizedRejected = rejected / maxRejected;
                const normalizedTotal = total / maxTotal;
                
                // 3️⃣ Calculate Criticality Score
                // Formula: Score based on rejection rate, only non-zero if there are rejections
                // If no rejections, score = 0
                let criticalityScore = 0;
                if (rejected > 0) {
                    // (Reject % × 0.5) + (Normalized Rejected × 0.3) + (Normalized Total × 0.2)
                    criticalityScore = (rejectPct * 0.5) + (normalizedRejected * 0.3) + (normalizedTotal * 0.2);
                }
                
                console.log(`📈 ${item.predicted_group}:`, {
                    rejected,
                    total,
                    rejectPct: rejectPct.toFixed(3),
                    normalizedRejected: normalizedRejected.toFixed(3),
                    normalizedTotal: normalizedTotal.toFixed(3),
                    criticalityScore: criticalityScore.toFixed(3)
                });
                
                return { 
                    ...item, 
                    rejectPct,
                    normalizedRejected,
                    normalizedTotal,
                    criticalityScore: Math.round(criticalityScore * 100) / 100
                };
            })
            .sort((a, b) => b.criticalityScore - a.criticalityScore)
            .slice(0, 5);
        
        renderHeatmapTable(sortedData);
        
    } catch (error) {
        console.error('Error loading heatmap:', error);
        showTableError();
    }
}

// Render heatmap table - Knowledge Gap style
function renderHeatmapTable(data) {
    const tbody = document.querySelector('#heatmapTable tbody');
    
    if (!data || data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    No classification data available yet. Data will appear after verifications are processed.
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = data.map(item => {
        const totalQ = parseInt(item.total_questions) || 0;
        const rejected = parseInt(item.rejected_count) || 0;
        const accepted = parseInt(item.accepted_count) || 0;
        const totalDecisions = rejected + accepted;
        const rejectPct = totalDecisions > 0 ? Math.round(100 * rejected / totalDecisions) : 0;
        const criticalityScore = item.criticalityScore || 0;
        
        // Determine severity based on criticality score
        let severityClass = 'severity-low';
        let severityLabel = 'Low';
        if (criticalityScore >= 0.5) {
            severityClass = 'severity-critical';
            severityLabel = 'Critical';
        } else if (criticalityScore >= 0.3) {
            severityClass = 'severity-warning';
            severityLabel = 'Warning';
        }
        
        return `
            <tr>
                <td>
                    <span class="topic-name">${item.predicted_group}</span>
                </td>
                <td><strong>${totalQ}</strong></td>
                <td>${accepted}</td>
                <td>${rejected}</td>
                <td>${rejectPct}%</td>
                <td><span class="badge ${criticalityScore >= 0.5 ? 'badge-critical' : criticalityScore >= 0.3 ? 'badge-warning' : 'badge-low'}">${criticalityScore.toFixed(2)}</span></td>
                <td>
                    <span class="severity-badge ${severityClass}">
                        <span class="status-dot ${severityClass === 'severity-critical' ? 'status-critical' : severityClass === 'severity-warning' ? 'status-warning' : 'status-good'}"></span>
                        ${severityLabel}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

// Load AI risk zone
async function loadRiskZone() {
    try {
        const response = await fetch('/api/knowledge-group-analytics');
        if (!response.ok) throw new Error('Failed to fetch analytics');
        
        const result = await response.json();
        if (!result.success || !result.data) {
            throw new Error('Invalid analytics response');
        }
        
        const data = result.data.groupDistribution || [];
        
        // Get top 5 groups with most rejected answers
        const riskItems = data
            .filter(item => {
                const rejected = parseInt(item.rejected_count) || 0;
                return item.predicted_group && 
                       item.predicted_group !== 'Other' &&
                       rejected > 0; // At least 1 rejection
            })
            .sort((a, b) => {
                // Sort by rejected count (descending)
                const rejectedA = parseInt(a.rejected_count) || 0;
                const rejectedB = parseInt(b.rejected_count) || 0;
                return rejectedB - rejectedA;
            })
            .slice(0, 5);
        
        renderRiskZone(riskItems);
        
    } catch (error) {
        console.error('Error loading risk zone:', error);
        renderRiskZone([]);
    }
}

// Render risk zone
function renderRiskZone(items) {
    const container = document.getElementById('riskZone');
    
    if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i> No critical risk areas detected</div>';
        return;
    }
    
    let html = '';
    items.forEach(item => {
        const rejected = parseInt(item.rejected_count) || 0;
        const accepted = parseInt(item.accepted_count) || 0;
        const totalDecisions = rejected + accepted;
        const rejectRate = totalDecisions > 0 ? Math.round(100 * rejected / totalDecisions) : 0;
        const avgConf = Math.round((parseFloat(item.avg_confidence) || 0) * 100);
        
        let riskClass = '';
        if (rejectRate >= 35) riskClass = 'critical';
        else if (rejectRate >= 25) riskClass = 'warning';
        else riskClass = 'good';
        
        // Don't show percentage if it's 100%
        const percentageDisplay = rejectRate === 100 ? '' : `${rejectRate}%`;
        
        html += `
            <div class="risk-item ${riskClass}" style="padding: 8px 12px; margin-bottom: 6px;">
                <div class="risk-header" style="margin-bottom: 2px;">
                    <div class="risk-title" style="font-size: 0.85rem;">${item.predicted_group}</div>
                </div>
                <div class="risk-detail" style="font-size: 0.75rem;">
                    Rejected: ${rejected}/${totalDecisions} | Conf: ${avgConf}%
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Load retraining zone (low confidence topics)
async function loadRetrainingZone() {
    try {
        const response = await fetch('/api/knowledge-group-analytics');
        if (!response.ok) throw new Error('Failed to fetch analytics');
        
        const result = await response.json();
        if (!result.success || !result.data) {
            throw new Error('Invalid analytics response');
        }
        
        const data = result.data.groupDistribution || [];
        
        // Calculate total accepted and rejected
        let totalAccepted = 0;
        let totalRejected = 0;
        
        data.forEach(group => {
            totalAccepted += parseInt(group.accepted_count) || 0;
            totalRejected += parseInt(group.rejected_count) || 0;
        });
        
        renderRetrainingZone({ accepted: totalAccepted, rejected: totalRejected });
        
    } catch (error) {
        console.error('Error loading retraining zone:', error);
        renderRetrainingZone({ accepted: 0, rejected: 0 });
    }
}

// Render retraining zone as donut chart
function renderRetrainingZone(data) {
    const container = document.getElementById('retrainingZone');
    
    const { accepted, rejected } = data;
    const total = accepted + rejected;
    
    if (total === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-chart-pie"></i> No AI decisions yet</div>';
        return;
    }
    
    const acceptedPercent = Math.round((accepted / total) * 100);
    const rejectedPercent = Math.round((rejected / total) * 100);
    // เปลี่ยนสีแดงเป็นน้ำเงิน RGB (38,123,189)
    const blueRGB = 'rgb(38,123,189)';
    // Create donut chart using conic-gradient
    const acceptedDeg = (accepted / total) * 360;
    const html = `
        <div class="donut-chart-container">
            <div class="donut-chart-wrapper">
                <div class="donut-chart" style="
                    background: conic-gradient(
                        #009374 0deg ${acceptedDeg}deg,
                        ${blueRGB} ${acceptedDeg}deg 360deg
                    );
                ">
                    <div class="donut-center">
                        <div class="donut-value">${total}</div>
                        <div class="donut-label">Total Decisions</div>
                    </div>
                </div>
            </div>
            <div class="chart-legend">
                <div class="legend-item">
                    <div class="legend-color" style="background: #009374;"></div>
                    <span><strong>Accepted:</strong> ${accepted} (${acceptedPercent}%)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: ${blueRGB};"></div>
                    <span><strong>Rejected:</strong> ${rejected} (${rejectedPercent}%)</span>
                </div>
            </div>
        </div>
    `;
    container.innerHTML = html;
}

// Load recommended actions
async function loadRecommendedActions() {
    try {
        const response = await fetch('/api/knowledge-group-analytics');
        if (!response.ok) throw new Error('Failed to fetch analytics');
        
        const result = await response.json();
        if (!result.success || !result.data) {
            throw new Error('Invalid analytics response');
        }
        
        const { groupDistribution, summary } = result.data;
        const actions = [];
        
        // Analyze data to generate actions
        const highRejectItems = groupDistribution.filter(item => {
            const rejected = parseInt(item.rejected_count) || 0;
            const accepted = parseInt(item.accepted_count) || 0;
            const totalDecisions = rejected + accepted;
            return totalDecisions > 0 && (rejected / totalDecisions) >= 0.30;
        });
        
        const lowConfItems = groupDistribution.filter(item => {
            const conf = parseFloat(item.avg_confidence) || 0;
            return conf < 0.65;
        });
        
        const pendingItems = groupDistribution.filter(item => {
            return (parseInt(item.pending_count) || 0) > 5;
        });
        
        // Generate actions
        if (highRejectItems.length > 0) {
            actions.push({
                type: 'critical',
                icon: 'fas fa-exclamation-triangle',
                title: `Review ${highRejectItems.length} high-rejection topics`,
                description: `${highRejectItems.map(i => i.predicted_group).join(', ')} need model improvement`,
                priority: 'HIGH'
            });
        }
        
        if (lowConfItems.length > 0) {
            actions.push({
                type: 'warning',
                icon: 'fas fa-chart-line',
                title: `Increase training data for ${lowConfItems.length} topics`,
                description: `Low confidence areas: increase knowledge base coverage`,
                priority: 'MEDIUM'
            });
        }
        
        if (pendingItems.length > 0) {
            actions.push({
                type: 'info',
                icon: 'fas fa-clock',
                title: `Process ${pendingItems.length} pending verifications`,
                description: 'Clear backlog to improve data quality',
                priority: 'MEDIUM'
            });
        }
        
        if (actions.length === 0) {
            actions.push({
                type: 'success',
                icon: 'fas fa-check-circle',
                title: 'System performing well',
                description: 'No immediate actions required',
                priority: 'LOW'
            });
        }
        
        renderRecommendedActions(actions);
        
    } catch (error) {
        console.error('Error loading actions:', error);
        renderRecommendedActions([]);
    }
}

// Render recommended actions
function renderRecommendedActions(actions) {
    const container = document.getElementById('actionsList');
    
    if (!actions || actions.length === 0) {
        container.innerHTML = '<li class="empty-state"><i class="fas fa-tasks"></i> No actions needed</li>';
        return;
    }
    
    let html = '';
    actions.forEach(action => {
        let iconColor = 'action-red';
        if (action.type === 'warning') iconColor = 'action-orange';
        else if (action.type === 'success' || action.type === 'info') iconColor = 'action-green';
        
        html += `
            <li>
                <div class="action-icon ${iconColor}"><i class="fas fa-check"></i></div>
                <div style="flex: 1;">
                    <div class="action-title">${action.title}</div>
                    <div class="action-desc">${action.description}</div>
                </div>
            </li>
        `;
    });
    
    container.innerHTML = html;
}

// Update last updated time
function updateLastUpdatedTime() {
    const element = document.getElementById('lastUpdated');
    if (!element) return; // Exit gracefully if element not found
    
    const now = new Date();
    const formatted = now.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    element.textContent = 'Last updated: ' + formatted;
}

// Error handlers
function showTableError() {
    const tbody = document.querySelector('#heatmapTable tbody');
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><i class="fas fa-exclamation-circle"></i> Failed to load data</td></tr>`;
}

function showError(message) {
    console.error(message);
}

// Filter function for sidebar
function filterByGroup(filter) {
    console.log('Filter by:', filter);
    // Update active link
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // TODO: Implement filtering logic
    // loadDashboard();
}

// Load hot tags for sidebar
async function loadHotTags() {
    try {
        const res = await fetch('/api/hot-tags?limit=8');
        const data = await res.json();
        if (data.success && data.tags.length > 0) {
            const tagsListDiv = document.getElementById('tagsList');
            tagsListDiv.innerHTML = data.tags.map(t => 
                `<span class="sidebar-tag-item" data-tag="${t.tag}">${t.tag}</span>`
            ).join('');
            
            // Attach click handlers for tags (optional - for future filtering)
            document.querySelectorAll('.sidebar-tag-item').forEach(tag => {
                tag.addEventListener('click', () => {
                    tag.classList.toggle('active');
                    // TODO: Implement tag filtering if needed
                });
            });
        }
    } catch (e) {
        console.error('Error loading hot tags:', e);
        const tagsListDiv = document.getElementById('tagsList');
        if (tagsListDiv) {
            tagsListDiv.innerHTML = '<span class="tags-loading">Failed to load tags</span>';
        }
    }
}

// Load Department Request Comparison Chart
async function loadDepartmentChart() {
    try {
        const response = await fetch('/api/department-user-stats');
        if (!response.ok) throw new Error('Failed to fetch user stats');
        
        const result = await response.json();
        console.log('Department user stats response:', result); // Debug log
        
        if (!result.success || !result.data) {
            throw new Error('Invalid user stats response');
        }
        
        const data = result.data || [];
        console.log('Department data:', data); // Debug log
        
        // Get top 5 departments by total active users (include all departments)
        const topDepartments = data
            .filter(item => item.department)
            .map(item => ({
                department: item.department,
                requestUsers: parseInt(item.request_users) || 0,
                verifyUsers: parseInt(item.verify_users) || 0,
                total: parseInt(item.total_active_users) || 0
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);
        
        console.log('Top departments:', topDepartments); // Debug log
        renderDepartmentChart(topDepartments);
        
    } catch (error) {
        console.error('Error loading department chart:', error);
        const container = document.getElementById('departmentChart');
        if (container) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i> Failed to load chart<br><small>${error.message}</small></div>`;
        }
    }
}

// Render Department Comparison Chart
function renderDepartmentChart(data) {
    const container = document.getElementById('departmentChart');
    if (!container) return;
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i> No data available</div>';
        return;
    }
    
    // Find max value for scaling
    const maxValue = Math.max(...data.map(d => Math.max(d.requestUsers, d.verifyUsers)));
    const maxHeight = 200; // pixels
    // สีใหม่สำหรับแท่ง verifications (น้ำเงิน RGB)
    const blueRGB = 'rgb(38,123,189)';
    // Create chart HTML
    let chartHtml = '<div class="bar-chart-container">';
    data.forEach(item => {
        const requestHeight = maxValue > 0 ? (item.requestUsers / maxValue) * maxHeight : 0;
        const verifyHeight = maxValue > 0 ? (item.verifyUsers / maxValue) * maxHeight : 0;
        chartHtml += `
            <div class="bar-group">
                <div class="bars-wrapper">
                    <div class="bar bar-accepted" style="height: ${requestHeight}px;" title="Requests: ${item.requestUsers}">
                        ${item.requestUsers > 0 ? `<span class="bar-label">${item.requestUsers}</span>` : ''}
                    </div>
                    <div class="bar bar-rejected" style="height: ${verifyHeight}px; background: ${blueRGB};" title="Verifications: ${item.verifyUsers}">
                        ${item.verifyUsers > 0 ? `<span class="bar-label">${item.verifyUsers}</span>` : ''}
                    </div>
                </div>
                <div class="bar-group-label">${item.department}</div>
            </div>
        `;
    });
    chartHtml += '</div>';
    // Add legend
    chartHtml += `
        <div class="chart-legend">
            <div class="legend-item">
                <div class="legend-color legend-accepted"></div>
                <span>Requests</span>
            </div>
            <div class="legend-item">
                <div class="legend-color legend-rejected" style="background: ${blueRGB};"></div>
                <span>Verifications</span>
            </div>
        </div>
    `;
    container.innerHTML = chartHtml;
}
