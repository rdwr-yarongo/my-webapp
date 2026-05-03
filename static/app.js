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

function buildIframeDocument(html, baseHref) {
    const safeBase = String(baseHref || '').replace(/"/g, '&quot;');
    const sourceHtml = html || '';

    if (!sourceHtml) {
        return `<!doctype html><html><head><base href="${safeBase}"></head><body></body></html>`;
    }

    if (/<head[^>]*>/i.test(sourceHtml)) {
        return sourceHtml.replace(/<head([^>]*)>/i, `<head$1><base href="${safeBase}">`);
    }

    if (/<html[^>]*>/i.test(sourceHtml)) {
        return sourceHtml.replace(/<html([^>]*)>/i, `<html$1><head><base href="${safeBase}"></head>`);
    }

    return `<!doctype html><html><head><base href="${safeBase}"></head><body>${sourceHtml}</body></html>`;
}

function getGslbConceptDiagramHtml() {
    return `
        <div class="panel">
            <h3>How GSLB Works (Behind The Scenes)</h3>
            <svg viewBox="0 0 900 310" width="100%" height="260" role="img" aria-label="GSLB flow diagram">
                <defs>
                    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L9,3 z" fill="#111"></path>
                    </marker>
                </defs>
                <rect x="20" y="120" width="140" height="70" rx="6" fill="#f4f6f8" stroke="#607080"/>
                <text x="90" y="160" text-anchor="middle" fill="#1f2d3d" font-size="16">Lab Controller</text>

                <rect x="250" y="105" width="130" height="100" rx="6" fill="#f4f6f8" stroke="#607080"/>
                <text x="315" y="160" text-anchor="middle" fill="#1f2d3d" font-size="16">DNS Server</text>

                <rect x="560" y="35" width="140" height="55" rx="6" fill="#f4f6f8" stroke="#607080"/>
                <text x="630" y="67" text-anchor="middle" fill="#1f2d3d" font-size="14">Site B / Alteon</text>

                <rect x="560" y="128" width="140" height="55" rx="6" fill="#f4f6f8" stroke="#607080"/>
                <text x="630" y="160" text-anchor="middle" fill="#1f2d3d" font-size="14">Site A / Alteon #1</text>

                <rect x="560" y="220" width="140" height="55" rx="6" fill="#f4f6f8" stroke="#607080"/>
                <text x="630" y="252" text-anchor="middle" fill="#1f2d3d" font-size="14">Site A / Alteon #2</text>

                <line x1="160" y1="145" x2="248" y2="145" stroke="#111" stroke-width="3" marker-end="url(#arrow)"/>
                <line x1="248" y1="172" x2="160" y2="172" stroke="#111" stroke-width="3" marker-end="url(#arrow)"/>

                <line x1="380" y1="125" x2="558" y2="62" stroke="#111" stroke-width="3" stroke-dasharray="7 5" marker-end="url(#arrow)"/>
                <line x1="380" y1="155" x2="558" y2="155" stroke="#111" stroke-width="3" stroke-dasharray="7 5" marker-end="url(#arrow)"/>
                <line x1="380" y1="185" x2="558" y2="248" stroke="#111" stroke-width="3" stroke-dasharray="7 5" marker-end="url(#arrow)"/>

                <text x="450" y="22" fill="#334" font-size="16">Repeated attempts = repeated DNS decisions</text>
            </svg>
            <p><small>Flow: Controller asks DNS for app1.radware.lab, DNS returns one destination per attempt based on GSLB policy, controller then sends HTTP to that selected target.</small></p>
        </div>
    `;
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

        const iframe = document.createElement('iframe');
        iframe.sandbox = 'allow-same-origin';
        iframe.style.cssText = 'width:100%;height:520px;border:1px solid #555;border-radius:4px;margin-top:8px;background:#fff;';
        const baseHref = result.final_url || (result.target_ip ? `http://${result.target_ip}/` : '');
        iframe.srcdoc = buildIframeDocument(result.body_html || '', baseHref);
        const wrapper = document.createElement('div');
        wrapper.className = 'panel';
        wrapper.innerHTML = `
            <h4>HTTP Attempt ${escapeHtml(result.attempt)} &mdash; ${escapeHtml(result.target_ip)}</h4>
            <p>Resolved A Records: ${escapeHtml((result.resolved_records || []).join(', ') || 'n/a')}</p>
            <p>Scheme: HTTP &nbsp;|&nbsp; Status: ${escapeHtml(result.status_code)} &nbsp;|&nbsp; URL: ${escapeHtml(result.final_url)}</p>
        `;
        wrapper.appendChild(iframe);
        return wrapper.outerHTML;
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
        ${getGslbConceptDiagramHtml()}
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

// Active SSE source for GSLB streaming
let gslbEventSource = null;

function stopGslbStream() {
    if (gslbEventSource) {
        gslbEventSource.close();
        gslbEventSource = null;
    }
    const btn = document.getElementById('gslb-stop-btn');
    if (btn) btn.remove();
    const indicator = document.getElementById('gslb-live-indicator');
    if (indicator) {
        indicator.style.background = '#dc3545';
        indicator.textContent = '\u25CF STOPPED';
        indicator.id = '';
    }
}

function startGslbStream() {
    stopGslbStream();
    const resultsContent = document.getElementById('results-content');
    resultsContent.innerHTML = `
        <div class="panel">
            <h3>Round Robin Global Load Balancing — Live</h3>
            <p><strong>Target:</strong> app1.radware.lab &nbsp;|&nbsp; <strong>DNS:</strong> 10.100.1.30</p>
            <span id="gslb-live-indicator" style="display:inline-block;padding:2px 8px;background:#28a745;color:#fff;border-radius:4px;font-size:12px;font-weight:600;">&#9679; LIVE</span>
        </div>
        ${getGslbConceptDiagramHtml()}
        <div id="gslb-attempts"></div>
    `;
    const sidebar = document.querySelector('.results-sidebar-header');
    if (sidebar && !document.getElementById('gslb-stop-btn')) {
        const btn = document.createElement('button');
        btn.id = 'gslb-stop-btn';
        btn.className = 'btn btn-danger';
        btn.textContent = 'Stop';
        btn.style.cssText = 'padding:4px 12px;font-size:12px;';
        btn.onclick = stopGslbStream;
        sidebar.appendChild(btn);
    }

    gslbEventSource = new EventSource('/api/scenario/gslb_rr/stream');

    gslbEventSource.onmessage = function(event) {
        const result = JSON.parse(event.data);
        const attemptsDiv = document.getElementById('gslb-attempts');
        if (!attemptsDiv) return;
        const panel = document.createElement('div');
        panel.className = 'panel';
        if (result.dns_error) {
            panel.innerHTML = `<h4>Attempt ${escapeHtml(result.attempt)}</h4><p class="error">DNS Error: ${escapeHtml(result.dns_error)}</p><p><small>${new Date().toLocaleTimeString()}</small></p>`;
        } else if (result.http_error) {
            panel.innerHTML = `<h4>Attempt ${escapeHtml(result.attempt)} — ${escapeHtml(result.target_ip)}</h4><p>Resolved: ${escapeHtml((result.resolved_records || []).join(', '))}</p><p class="error">HTTP Error: ${escapeHtml(result.http_error)}</p><p><small>${new Date().toLocaleTimeString()}</small></p>`;
        } else {
            panel.innerHTML = `<h4>Attempt ${escapeHtml(result.attempt)} — ${escapeHtml(result.target_ip)}</h4><p>Resolved: ${escapeHtml((result.resolved_records || []).join(', '))} &nbsp;|&nbsp; Status: ${escapeHtml(result.status_code)} &nbsp;|&nbsp; <small>${new Date().toLocaleTimeString()}</small></p>`;
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-same-origin';
            iframe.style.cssText = 'width:100%;height:520px;border:1px solid #555;border-radius:4px;margin-top:6px;background:#fff;';
            const baseHref = result.final_url || (result.target_ip ? `http://${result.target_ip}/` : '');
            iframe.srcdoc = buildIframeDocument(result.body_html || '', baseHref);
            panel.appendChild(iframe);
        }
        attemptsDiv.insertBefore(panel, attemptsDiv.firstChild);
    };

    gslbEventSource.onerror = function() {
        stopGslbStream();
    };
}

// Scenario execution
function executeScenario(scenarioId) {
    if (scenarioId === 'gslb_rr') {
        startGslbStream();
        return;
    }
    fetch('/api/scenario/' + scenarioId, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        const resultsContent = document.getElementById('results-content');
        if (data.success) {
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