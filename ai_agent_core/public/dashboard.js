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
            loadRiskZone(),
            loadRetrainingZone(),
            loadRecommendedActions()
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
        const [analyticsResponse, pendingResponse, unverifiedResponse] = await Promise.all([
            fetch('/api/knowledge-group-analytics'),
            fetch('/api/filter-questions?type=pending-review&limit=1'),
            fetch('/api/filter-questions?type=unverified&limit=1')
        ]);
        
        if (!analyticsResponse.ok) {
            throw new Error('Failed to fetch analytics');
        }
        
        const result = await analyticsResponse.json();
        console.log('Analytics API response:', result);
        
        if (!result.success || !result.data) {
            throw new Error('Invalid analytics response');
        }
        
        const groups = result.data.groupDistribution || [];
        
        // Calculate summary stats from AI analytics
        let totalQuestions = 0;
        let totalRejected = 0;
        let totalAccepted = 0;
        
        groups.forEach(group => {
            totalQuestions += parseInt(group.total_questions) || 0;
            totalRejected += parseInt(group.rejected_count) || 0;
            totalAccepted += parseInt(group.accepted_count) || 0;
        });
        
        // Get pending count from verified_answers (pending-review + unverified)
        let totalPending = 0;
        if (pendingResponse.ok) {
            const pendingData = await pendingResponse.json();
            totalPending += parseInt(pendingData.totalCount) || 0;
        }
        if (unverifiedResponse.ok) {
            const unverifiedData = await unverifiedResponse.json();
            totalPending += parseInt(unverifiedData.totalCount) || 0;
        }
        
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
        
        // Sort by rejected count (high to low) and show top 5
        const sortedData = data
            .filter(item => item.predicted_group && item.predicted_group !== 'Other')
            .map(item => {
                const rejected = parseInt(item.rejected_count) || 0;
                const accepted = parseInt(item.accepted_count) || 0;
                const totalDecisions = rejected + accepted;
                const rejectPct = totalDecisions > 0 ? rejected / totalDecisions : 0;
                return { ...item, rejectPct };
            })
            .sort((a, b) => (parseInt(b.rejected_count) || 0) - (parseInt(a.rejected_count) || 0)) // มากไปน้อย
            .slice(0, 5); // เอา 5 อันดับแรก
        
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
                <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
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
        const avgConf = parseFloat(item.avg_confidence) || 0;
        const confPct = Math.round(avgConf * 100);
        
        // Color coding for cells
        const acceptedColor = accepted > 5 ? '#d4edda' : accepted > 2 ? '#e8f5e9' : accepted > 0 ? '#f1f8f6' : 'transparent';
        const rejectedColor = rejected > 5 ? '#f8d7da' : rejected > 2 ? '#ffcccb' : rejected > 0 ? '#ffe8e8' : 'transparent';
        const confColor = confPct >= 85 ? '#d4edda' : confPct >= 70 ? '#fff3cd' : '#f8d7da';
        
        return `
            <tr>
                <td>
                    <span class="topic-name">${item.predicted_group}</span>
                </td>
                <td><strong>${totalQ}</strong></td>
                <td style="background: ${acceptedColor}; color: ${accepted > 0 ? '#155724' : 'inherit'};">
                    <strong>${accepted}</strong>
                </td>
                <td style="background: ${rejectedColor}; color: ${rejected > 0 ? '#721c24' : 'inherit'};">
                    <strong>${rejected}</strong>
                </td>
                <td>
                    ${rejectPct}%
                </td>
                <td>
                    <span class="confidence-badge" style="background: ${confColor}; color: ${confPct >= 70 ? '#155724' : '#721c24'};">
                        ${confPct}%
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
                <div class="risk-detail" style="font-size: 0.75rem; color: #666;">
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
    
    // Create donut chart using conic-gradient
    const acceptedDeg = (accepted / total) * 360;
    
    const html = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 20px 0;">
            <div style="position: relative; width: 180px; height: 180px;">
                <div style="
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    background: conic-gradient(
                        #009374 0deg ${acceptedDeg}deg,
                        #dc3545 ${acceptedDeg}deg 360deg
                    );
                    position: relative;
                ">
                    <div style="
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        width: 120px;
                        height: 120px;
                        border-radius: 50%;
                        background: white;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                    ">
                        <div style="font-size: 2rem; font-weight: bold; color: #333;">${total}</div>
                        <div style="font-size: 0.8rem; color: #999;">Total Decisions</div>
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 30px; font-size: 0.9rem;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 16px; height: 16px; background: #009374; border-radius: 3px;"></div>
                    <span><strong>Accepted:</strong> ${accepted} (${acceptedPercent}%)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 16px; height: 16px; background: #dc3545; border-radius: 3px;"></div>
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
                    <div style="font-weight: 600; color: #333;">${action.title}</div>
                    <div style="font-size: 0.85rem; color: #666;">${action.description}</div>
                </div>
            </li>
        `;
    });
    
    container.innerHTML = html;
}

// Update last updated time
function updateLastUpdatedTime() {
    const now = new Date();
    const formatted = now.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('lastUpdated').textContent = formatted;
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
