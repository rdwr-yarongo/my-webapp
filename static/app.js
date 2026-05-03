// Navigation
document.querySelectorAll('.sidebar-nav a').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const section = this.getAttribute('data-section');
        switchSection(section);
        document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
        this.classList.add('active');
    });
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const tab = this.getAttribute('data-tab');
        switchTab(tab);
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
    });
});

function switchSection(section) {
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(section).classList.add('active');
}

function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(tab + '-tab').classList.add('active');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderGslbResults(data, scenarioId) {
    const resultsContent = document.getElementById('results-content');
    const dnsOptions = (data.dns_options || []).map(ip => `<li>${escapeHtml(ip)}</li>`).join('');
    const dnsChecks = (data.dns_checks || []).map(check => {
        if (check.error) {
            return `<li>Attempt ${escapeHtml(check.attempt)}: Error - ${escapeHtml(check.error)}</li>`;
        }
        const records = (check.records || []).map(ip => escapeHtml(ip)).join(', ');
        return `<li>Attempt ${escapeHtml(check.attempt)}: ${records || 'No records'}</li>`;
    }).join('');

    const httpResults = (data.http_results || []).map(result => {
        if (result.error) {
            return `
                <div class="panel">
                    <h4>HTTP Attempt ${escapeHtml(result.attempt)} (${escapeHtml(result.target_ip)})</h4>
                    <p class="error">Error: ${escapeHtml(result.error)}</p>
                </div>
            `;
        }

        return `
            <div class="panel">
                <h4>HTTP Attempt ${escapeHtml(result.attempt)} (${escapeHtml(result.target_ip)})</h4>
                <p>Resolved A Records: ${escapeHtml((result.resolved_records || []).join(', ') || 'n/a')}</p>
                <p>Scheme: HTTP</p>
                <p>Status: ${escapeHtml(result.status_code)}</p>
                <p>Final URL: ${escapeHtml(result.final_url)}</p>
                <p>Body Preview: ${escapeHtml(result.body_preview || '')}</p>
            </div>
        `;
    }).join('');

    resultsContent.innerHTML = `
        <div class="panel">
            <h3>Scenario Executed: ${escapeHtml(scenarioId)}</h3>
            <p>${escapeHtml(data.message || '')}</p>
            <p><strong>Target Host:</strong> ${escapeHtml(data.target_host || '')}</p>
            <p><strong>DNS Server Used:</strong> ${escapeHtml(data.dns_server || 'n/a')}</p>
            <p><strong>Attempt Count:</strong> ${escapeHtml(data.attempt_count || 3)}</p>
            <p><strong>Discovered DNS Options:</strong></p>
            <ul>${dnsOptions || '<li>No A records discovered</li>'}</ul>
            <p><strong>DNS Resolution Checks:</strong></p>
            <ul>${dnsChecks || '<li>No DNS checks available</li>'}</ul>
            ${data.warning ? `<p class="error">${escapeHtml(data.warning)}</p>` : ''}
            <p><small>Executed at: ${new Date().toLocaleString()}</small></p>
        </div>
        ${httpResults}
    `;
}

// DNS Lookup
function performDnsLookup() {
    const domain = document.getElementById('dns-domain').value;
    fetch('/api/dns_lookup', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ domain: domain })
    })
    .then(response => response.json())
    .then(data => {
        const resultDiv = document.getElementById('dns-result');
        if (data.success) {
            resultDiv.innerHTML = `
                <h4>A Records for ${domain}:</h4>
                <ul>
                    ${data.records.map(record => `<li>${record}</li>`).join('')}
                </ul>
            `;
        } else {
            resultDiv.innerHTML = `<p class="error">Error: ${data.error}</p>`;
        }
    })
    .catch(error => {
        document.getElementById('dns-result').innerHTML = `<p class="error">Error: ${error}</p>`;
    });
}

// Scenario execution
function executeScenario(scenarioId) {
    fetch('/api/scenario/' + scenarioId, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        const resultsContent = document.getElementById('results-content');
        if (data.success) {
            if (scenarioId === 'gslb_rr' && Array.isArray(data.http_results)) {
                renderGslbResults(data, scenarioId);
                return;
            }
            resultsContent.innerHTML = `
                <div class="panel">
                    <h3>Scenario Executed: ${scenarioId}</h3>
                    <p>${data.message}</p>
                    <p><small>Executed at: ${new Date().toLocaleString()}</small></p>
                </div>
            `;
        } else {
            resultsContent.innerHTML = `<p class="error">Error: ${data.error}</p>`;
        }
    })
    .catch(error => {
        document.getElementById('results-content').innerHTML = `<p class="error">Error: ${error}</p>`;
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Dark mode only
    document.body.setAttribute('data-theme', 'dark');
});