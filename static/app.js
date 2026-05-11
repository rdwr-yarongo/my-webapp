// Navigation
document.querySelectorAll('.sidebar-nav a').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const section = this.getAttribute('data-section');
        switchSection(section);
        document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
        this.classList.add('active');
        // Auto-expand parent group if sub-link
        const group = this.closest('.nav-group');
        if (group) group.classList.add('open');
    });
});

function toggleNavGroup(header) {
    header.closest('.nav-group').classList.toggle('open');
}

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

function buildIframeDocument(html, baseHref, protocolFallback) {
    const safeBase = String(baseHref || window.location.origin + '/').replace(/"/g, '&quot;');
    const sourceHtml = html || '';
    const safeProtocol = String(protocolFallback || '').replace(/"/g, '&quot;');

    const protocolPatchScript = safeProtocol
        ? `<script>(function(){function apply(){var el=document.getElementById('ProtocolVer');if(!el)return;var v=(el.textContent||'').trim();if(!v||/^Detecting\.\.\.$/i.test(v)||/^Unavailable$/i.test(v)){el.textContent='${safeProtocol}';}}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(apply,150);});}else{setTimeout(apply,150);}})();<\/script>`
        : '';

    function addProtocolPatch(doc) {
        if (!protocolPatchScript) return doc;
        if (/<\/body>/i.test(doc)) {
            return doc.replace(/<\/body>/i, `${protocolPatchScript}</body>`);
        }
        return `${doc}${protocolPatchScript}`;
    }

    if (!sourceHtml) {
        return addProtocolPatch(`<!doctype html><html><head><base href="${safeBase}"></head><body></body></html>`);
    }

    if (/<head[^>]*>/i.test(sourceHtml)) {
        return addProtocolPatch(sourceHtml.replace(/<head([^>]*)>/i, `<head$1><base href="${safeBase}">`));
    }

    if (/<html[^>]*>/i.test(sourceHtml)) {
        return addProtocolPatch(sourceHtml.replace(/<html([^>]*)>/i, `<html$1><head><base href="${safeBase}"></head>`));
    }

    return addProtocolPatch(`<!doctype html><html><head><base href="${safeBase}"></head><body>${sourceHtml}</body></html>`);
}

function createResponseIframe(result) {
    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-same-origin allow-scripts';
    iframe.style.cssText = 'width:100%;height:520px;border:1px solid #555;border-radius:4px;margin-top:8px;background:#fff;';
    const baseHref = window.location.origin + '/';
    iframe.srcdoc = buildIframeDocument(result.body_html || '', baseHref, result.protocol_version || 'HTTP/1.1');
    return iframe;
}

function formatTimestamp(epochSeconds) {
    if (!epochSeconds) {
        return new Date().toLocaleTimeString();
    }
    return new Date(epochSeconds * 1000).toLocaleTimeString();
}

function buildTrafficPanel(result, options = {}) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    const titlePrefix = options.titlePrefix || 'Attempt';

    if (result.dns_error) {
        panel.innerHTML = `<h4>${escapeHtml(titlePrefix)} ${escapeHtml(result.attempt)}</h4><p class="error">DNS Error: ${escapeHtml(result.dns_error)}</p><p><small>${formatTimestamp(result.timestamp)}</small></p>`;
        return panel;
    }

    if (result.http_error) {
        panel.innerHTML = `<h4>${escapeHtml(titlePrefix)} ${escapeHtml(result.attempt)} — ${escapeHtml(result.target_ip || 'n/a')}</h4><p>Resolved: ${escapeHtml((result.resolved_records || []).join(', ') || 'n/a')}</p><p class="error">HTTP Error: ${escapeHtml(result.http_error)}</p><p><small>${formatTimestamp(result.timestamp)}</small></p>`;
        return panel;
    }

    const servedByBadge = result.served_by
        ? `<span class="status-chip success">Served By: ${escapeHtml(result.served_by)}</span>`
        : `<span class="status-chip warning">Served By: unavailable</span>`;
    const wanlinkBadge = result.wanlink
        ? `<span class="status-chip">Wanlink: ${escapeHtml(result.wanlink)}</span>`
        : '';

    panel.innerHTML = `
        <h4>${escapeHtml(titlePrefix)} ${escapeHtml(result.attempt)} — ${escapeHtml(result.target_ip || 'n/a')}</h4>
        <p>Resolved: ${escapeHtml((result.resolved_records || []).join(', ') || 'n/a')} &nbsp;|&nbsp; Status: ${escapeHtml(result.status_code)} &nbsp;|&nbsp; <small>${formatTimestamp(result.timestamp)}</small></p>
        <div class="status-chip-row">${servedByBadge}${wanlinkBadge}</div>
        <p>Server: ${escapeHtml(result.server_name || 'n/a')} &nbsp;|&nbsp; Server IP: ${escapeHtml(result.server_ip || 'n/a')} &nbsp;|&nbsp; URL: ${escapeHtml(result.final_url || 'n/a')}</p>
    `;
    panel.appendChild(createResponseIframe(result));
    return panel;
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

        const wrapper = document.createElement('div');
        wrapper.className = 'panel';
        const servedByLine = result.served_by ? `<p><strong>Served By:</strong> ${escapeHtml(result.served_by)}</p>` : '';
        wrapper.innerHTML = `
            <h4>HTTP Attempt ${escapeHtml(result.attempt)} &mdash; ${escapeHtml(result.target_ip)}</h4>
            <p>Resolved A Records: ${escapeHtml((result.resolved_records || []).join(', ') || 'n/a')}</p>
            <p>Scheme: HTTP &nbsp;|&nbsp; Status: ${escapeHtml(result.status_code)} &nbsp;|&nbsp; URL: ${escapeHtml(result.final_url)}</p>
            ${servedByLine}
        `;
        wrapper.appendChild(createResponseIframe(result));
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
        ${httpResults}
    `;
}

function ensureResultsActionButton(buttonId, label, onClick) {
    const sidebar = document.querySelector('.results-sidebar-header');
    if (!sidebar) return;

    const existing = document.getElementById(buttonId);
    if (existing) {
        existing.onclick = onClick;
        return;
    }

    const button = document.createElement('button');
    button.id = buttonId;
    button.className = 'btn btn-danger';
    button.textContent = label;
    button.style.cssText = 'padding:4px 12px;font-size:12px;';
    button.onclick = onClick;
    sidebar.appendChild(button);
}

function removeResultsActionButton(buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.remove();
    }
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

let gslbEventSource = null;
let haEventSource = null;

function stopGslbStream() {
    if (gslbEventSource) {
        gslbEventSource.close();
        gslbEventSource = null;
    }
    removeResultsActionButton('gslb-stop-btn');
    const indicator = document.getElementById('gslb-live-indicator');
    if (indicator) {
        indicator.style.background = '#dc3545';
        indicator.textContent = '\u25CF STOPPED';
        indicator.id = '';
    }
}

function stopHaStream() {
    if (haEventSource) {
        haEventSource.close();
        haEventSource = null;
    }
    removeResultsActionButton('ha-stop-btn');
}

function startGslbStream() {
    stopHaStream();
    stopGslbStream();
    const resultsContent = document.getElementById('results-content');
    resultsContent.innerHTML = `
        <div class="panel">
            <h3>Round Robin Global Load Balancing — Live</h3>
            <p><strong>Target:</strong> app1.radware.lab &nbsp;|&nbsp; <strong>DNS:</strong> 10.100.1.30</p>
            <span id="gslb-live-indicator" style="display:inline-block;padding:2px 8px;background:#28a745;color:#fff;border-radius:4px;font-size:12px;font-weight:600;">&#9679; LIVE</span>
        </div>
        <div id="gslb-attempts"></div>
    `;

    ensureResultsActionButton('gslb-stop-btn', 'Stop', stopGslbStream);
    gslbEventSource = new EventSource('/api/scenario/gslb_rr/stream');

    gslbEventSource.onmessage = function(event) {
        const result = JSON.parse(event.data);
        const attemptsDiv = document.getElementById('gslb-attempts');
        if (!attemptsDiv) return;
        const panel = buildTrafficPanel(result, { titlePrefix: 'Attempt' });
        attemptsDiv.insertBefore(panel, attemptsDiv.firstChild);
    };

    gslbEventSource.onerror = function() {
        stopGslbStream();
    };
}

function renderHaShell() {
    const resultsContent = document.getElementById('results-content');
    resultsContent.innerHTML = '<div id="ha-attempts"></div>';
}

function renderHaActionError(actionName, errorText) {
    const attemptsDiv = document.getElementById('ha-attempts');
    if (!attemptsDiv) return;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
        <h4>${escapeHtml(actionName.toUpperCase())} command</h4>
        <p class="error">${escapeHtml(errorText)}</p>
        <p><small>${new Date().toLocaleString()}</small></p>
    `;
    attemptsDiv.insertBefore(panel, attemptsDiv.firstChild);
}

function openRedirectScenario() {
    window.open('http://scenario2.radware.lab/', '_blank', 'noopener,noreferrer');
}

function callHaAction(actionName) {
    fetch(`/api/scenario/ha_failover/${actionName}`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            return;
        }
        renderHaActionError(actionName, data.message || 'One or more Alteon API calls failed.');
    })
    .catch(error => {
        renderHaActionError(actionName, `Error: ${error}`);
    });
}

function startHaScenario() {
    stopGslbStream();
    stopHaStream();

    fetch('/api/scenario/ha_failover/start', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            throw new Error(data.error || 'Unable to start HA monitoring');
        }

        renderHaShell();
        ensureResultsActionButton('ha-stop-btn', 'Stop', stopHaStream);
        haEventSource = new EventSource('/api/scenario/ha_failover/stream');

        haEventSource.onmessage = function(event) {
            const result = JSON.parse(event.data);
            const attemptsDiv = document.getElementById('ha-attempts');
            if (!attemptsDiv) return;
            const panel = buildTrafficPanel(result, { titlePrefix: 'HA Attempt' });
            attemptsDiv.insertBefore(panel, attemptsDiv.firstChild);
        };

        haEventSource.onerror = function() {
            stopHaStream();
        };
    })
    .catch(error => {
        document.getElementById('results-content').innerHTML = `<p class="error">Error: ${escapeHtml(error)}</p>`;
    });
}

// Scenario execution
function executeScenario(scenarioId) {
    if (scenarioId === 'gslb_rr') {
        startGslbStream();
        return;
    }
    if (scenarioId === 'ha_failover') {
        startHaScenario();
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
    document.body.setAttribute('data-theme', 'dark');
});
