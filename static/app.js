// Navigation
document.querySelectorAll('.sidebar-nav a').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const section = this.getAttribute('data-section');
        switchSection(section);
        clearNavActive();
        this.classList.add('active');
        // Auto-expand parent group
        const group = this.closest('.nav-group-flat');
        if (group) group.classList.add('open');
    });
});

function clearNavActive() {
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
}

function toggleFlatGroup(id) {
    const g = document.getElementById(id);
    if (g) g.classList.toggle('open');
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
    const sidebar = document.getElementById('results-sidebar');
    if (sidebar) sidebar.style.display = (section === 'home') ? 'none' : '';
    const resultsContent = document.getElementById('results-content');
    if (resultsContent && section === 'scenario-http2-gateway') {
        resultsContent.innerHTML = '<p style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">Browser connects directly to <code>https://scenario4.radware.lab/index.php</code> over HTTP/2.</p><iframe src="https://scenario4.radware.lab/index.php" style="width:100%;height:820px;border:1px solid #555;border-radius:4px;background:#fff;" title="scenario4.radware.lab/index.php"></iframe>';
    } else if (resultsContent && section !== 'scenario-http2-gateway') {
        if (resultsContent.querySelector('iframe[src*="scenario4"]')) {
            resultsContent.innerHTML = '<p>No results yet. Execute a scenario to see results here.</p>';
        }
    }
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
        ? `<script>(function(){function apply(){var el=document.getElementById('ProtocolVer');if(!el)return;el.textContent='${safeProtocol}';}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(apply,150);});}else{setTimeout(apply,150);}})();<\/script>`
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
    iframe.style.cssText = 'width:100%;height:820px;border:1px solid #555;border-radius:4px;margin-top:8px;background:#fff;';
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
        panel.innerHTML = `<h4>${escapeHtml(titlePrefix)} ${escapeHtml(result.attempt)}</h4><div class="status-chip-row"><span class="status-chip error">⚠️ ${escapeHtml(result.dns_error)}</span><span style="margin-left:8px;font-size:12px;color:#6b7280;">${formatTimestamp(result.timestamp)}</span></div>`;
        return panel;
    }

    if (result.http_error) {
        panel.innerHTML = `<h4>${escapeHtml(titlePrefix)} ${escapeHtml(result.attempt)} — ${escapeHtml(result.target_ip || 'n/a')}</h4><p>Resolved: ${escapeHtml((result.resolved_records || []).join(', ') || 'n/a')}</p><p class="error">HTTP Error: ${escapeHtml(result.http_error)}</p><p><small>${formatTimestamp(result.timestamp)}</small></p>`;
        return panel;
    }

    const servedByBadge = result.served_by
        ? `<span class="status-chip success">Served By: ${escapeHtml(result.served_by)}</span>`
        : '';
    const wanlinkBadge = result.wanlink
        ? `<span class="status-chip" style="background:#f59e0b;color:#1a1a1a;">${escapeHtml(result.wanlink)}</span>`
        : '';

    panel.innerHTML = `
        <h4>${escapeHtml(titlePrefix)} ${escapeHtml(result.attempt)} — ${escapeHtml(result.target_ip || 'n/a')}</h4>
        <div class="status-chip-row">${servedByBadge}${wanlinkBadge}</div>
        <details class="ha-details"><summary>Details</summary>
        <p>Resolved: ${escapeHtml((result.resolved_records || []).join(', ') || 'n/a')} &nbsp;|&nbsp; Status: ${escapeHtml(result.status_code)} &nbsp;|&nbsp; <small>${formatTimestamp(result.timestamp)}</small></p>
        <p>Server: ${escapeHtml(result.server_name || 'n/a')} &nbsp;|&nbsp; Server IP: ${escapeHtml(result.server_ip || 'n/a')} &nbsp;|&nbsp; URL: ${escapeHtml(result.final_url || 'n/a')}</p>
        </details>
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
    button.style.cssText = 'padding:10px 24px;font-size:15px;font-weight:700;border-radius:6px;min-width:90px;';
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
const redirectScenarioState = {
    launched: false,
    proofLoaded: false
};

function stopGslbStream() {
    if (gslbEventSource) {
        gslbEventSource.close();
        gslbEventSource = null;
    }
    removeResultsActionButton('gslb-stop-btn');
    resetGslbDiagram();
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

// ─────────────────────────────────────────────────────────
// GSLB LIVE TOPOLOGY DIAGRAM
// ─────────────────────────────────────────────────────────
const GSLB_VIP_MAP = {
    '10.100.4.54':  { nodeId: 'gslb-node-a1', pathId: 'gslb-path-a1', countId: 'gslb-count-a1', pctId: 'gslb-pct-a1', color: '#3b82f6' },
    '10.100.5.54':  { nodeId: 'gslb-node-a2', pathId: 'gslb-path-a2', countId: 'gslb-count-a2', pctId: 'gslb-pct-a2', color: '#06b6d4' },
    '10.100.7.103': { nodeId: 'gslb-node-b',  pathId: 'gslb-path-b',  countId: 'gslb-count-b',  pctId: 'gslb-pct-b',  color: '#a78bfa' }
};
let _gslbCounts = {};
let _gslbTotal  = 0;

function initGslbDiagram() {
    _gslbCounts = { '10.100.4.54': 0, '10.100.5.54': 0, '10.100.7.103': 0 };
    _gslbTotal  = 0;

    Object.values(GSLB_VIP_MAP).forEach(m => {
        const node = document.getElementById(m.nodeId);
        const path = document.getElementById(m.pathId);
        if (node) {
            node.setAttribute('opacity', '0.35');
            node.classList.remove('gslb-node-active');
            node.style.filter = '';
        }
        if (path) {
            path.classList.remove('gslb-path-active');
            path.setAttribute('stroke', '#334155');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('opacity', '0.4');
            path.setAttribute('marker-end', 'url(#gslb-arr-idle)');
        }
        const cEl = document.getElementById(m.countId);
        const pEl = document.getElementById(m.pctId);
        if (cEl) cEl.textContent = '0\xD7';
        if (pEl) pEl.textContent = '\u2014';
    });

    const dnsNode = document.getElementById('gslb-node-dns');
    if (dnsNode) dnsNode.style.filter = '';

    const status = document.getElementById('gslb-status-text');
    if (status) { status.textContent = 'Streaming \u2014 waiting for first attempt\u2026'; status.style.color = '#64748b'; }

    const strip = document.getElementById('gslb-history-strip');
    if (strip) strip.innerHTML = '';
}

function updateGslbDiagram(result) {
    const status = document.getElementById('gslb-status-text');
    const strip  = document.getElementById('gslb-history-strip');

    if (result.dns_error || result.http_error) {
        const errMsg = result.dns_error || result.http_error;
        const dnsNode = document.getElementById('gslb-node-dns');
        if (dnsNode) dnsNode.style.filter = 'drop-shadow(0 0 6px #ef4444)';
        if (status) { status.textContent = `Attempt #${result.attempt} \u2014 \u26A0 ${errMsg}`; status.style.color = '#ef4444'; }
        _gslbAppendDot(strip, '#ef4444', `#${result.attempt}: ${errMsg}`);
        return;
    }

    const ip  = (result.target_ip || '').trim();
    const vip = GSLB_VIP_MAP[ip];
    if (!vip) return;

    _gslbTotal++;
    _gslbCounts[ip] = (_gslbCounts[ip] || 0) + 1;

    // Deactivate all
    Object.values(GSLB_VIP_MAP).forEach(m => {
        const node = document.getElementById(m.nodeId);
        const path = document.getElementById(m.pathId);
        if (node) {
            node.setAttribute('opacity', '0.35');
            node.classList.remove('gslb-node-active');
            node.style.filter = '';
        }
        if (path) {
            path.classList.remove('gslb-path-active');
            path.setAttribute('stroke', '#334155');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('opacity', '0.4');
            path.setAttribute('marker-end', 'url(#gslb-arr-idle)');
        }
    });

    // Activate selected node
    const activeNode = document.getElementById(vip.nodeId);
    if (activeNode) {
        activeNode.setAttribute('opacity', '1');
        activeNode.classList.add('gslb-node-active');
        activeNode.style.filter = `drop-shadow(0 0 10px ${vip.color})`;
    }

    // Activate selected path
    const activePath = document.getElementById(vip.pathId);
    if (activePath) {
        activePath.setAttribute('stroke', vip.color);
        activePath.setAttribute('stroke-width', '3');
        activePath.setAttribute('opacity', '1');
        const arrowId = ip === '10.100.4.54' ? 'gslb-arr-a1' : ip === '10.100.5.54' ? 'gslb-arr-a2' : 'gslb-arr-b';
        activePath.setAttribute('marker-end', `url(#${arrowId})`);
        activePath.classList.add('gslb-path-active');
    }

    // Also pulse the DNS→Client path on every attempt
    const dnsPath = document.getElementById('gslb-path-dns');
    if (dnsPath) { dnsPath.setAttribute('stroke', '#94a3b8'); dnsPath.setAttribute('opacity', '0.8'); }
    const dnsNode = document.getElementById('gslb-node-dns');
    if (dnsNode) dnsNode.style.filter = 'drop-shadow(0 0 6px #3b82f6)';

    // Update all counters + percentages
    Object.entries(GSLB_VIP_MAP).forEach(([vipIp, m]) => {
        const n   = _gslbCounts[vipIp] || 0;
        const cEl = document.getElementById(m.countId);
        const pEl = document.getElementById(m.pctId);
        if (cEl) cEl.textContent = `${n}\xD7`;
        if (pEl) pEl.textContent = _gslbTotal > 0 ? `${Math.round(n / _gslbTotal * 100)}%` : '\u2014';
    });

    // Status line
    const servedBy = result.served_by ? ` \u00B7 ${result.served_by}` : '';
    const wanlink  = result.wanlink   ? ` \u00B7 WAN: ${result.wanlink}` : '';
    if (status) {
        status.textContent = `Attempt #${result.attempt} \u2192 ${ip}${servedBy}${wanlink}`;
        status.style.color = vip.color;
    }

    // History dot
    _gslbAppendDot(strip, vip.color, `#${result.attempt}: ${ip}`);
}

function _gslbAppendDot(strip, color, title) {
    if (!strip) return;
    const dot = document.createElement('span');
    dot.className = 'gslb-history-dot';
    dot.style.background = color;
    dot.title = title;
    strip.appendChild(dot);
    while (strip.children.length > 20) strip.removeChild(strip.firstChild);
}

function resetGslbDiagram() {
    Object.values(GSLB_VIP_MAP).forEach(m => {
        const path = document.getElementById(m.pathId);
        if (path) path.classList.remove('gslb-path-active');
    });
    const dnsNode = document.getElementById('gslb-node-dns');
    if (dnsNode) dnsNode.style.filter = '';
    const status = document.getElementById('gslb-status-text');
    if (status && _gslbTotal > 0) {
        status.textContent = `Stopped after ${_gslbTotal} attempt${_gslbTotal !== 1 ? 's' : ''}`;
        status.style.color = '#94a3b8';
    }
}
// ─────────────────────────────────────────────────────────

function startGslbStream() {
    stopHaStream();
    stopGslbStream();
    initGslbDiagram();
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
        updateGslbDiagram(result);
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
    window.open('http://scenario2.radware.lab/index.php', '_blank', 'noopener,noreferrer');
}

function renderRedirectResultsShell() {
    const resultsContent = document.getElementById('results-content');
    if (!resultsContent) return;

    resultsContent.innerHTML = `
        <div class="panel">
            <h3>Scenario 2 - HTTP Redirection</h3>
            <p>Start from <strong>http://scenario2.radware.lab/index.php</strong> and verify the redirect to <strong>https://scenario2.radware.lab/index.php</strong> inside the embedded browser.</p>
        </div>
        <div class="panel">
            <div id="redirect-browser-shell" class="browser-shell" data-state="idle">
                <div class="browser-toolbar">
                    <div class="browser-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <div id="redirect-url-display" class="browser-url">http://scenario2.radware.lab/index.php</div>
                    <div id="redirect-status-text" class="browser-status">Ready to launch redirect demo</div>
                </div>
                <iframe
                    id="redirect-demo-frame"
                    class="browser-frame"
                    title="Scenario 2 redirect demo"
                    sandbox="allow-same-origin allow-scripts allow-forms"
                    src="about:blank"></iframe>
            </div>
            <div id="redirect-proof" class="redirect-proof">
                <p>Checking redirect proof will appear here before the secure page loads.</p>
            </div>
        </div>
    `;
}

function renderRedirectTraceShell() {
    const resultsContent = document.getElementById('results-content');
    if (!resultsContent) return;

    resultsContent.innerHTML = `
        <div class="panel">
            <h3>Scenario 2 - TCPDump</h3>
            <p>Collect a short packet summary for <strong>scenario2.radware.lab</strong> and show the raw redirect exchange from the controller.</p>
        </div>
        <div class="panel">
            <div id="redirect-proof" class="redirect-proof">
                <p>Collecting HTTP exchange and packet summary...</p>
            </div>
        </div>
    `;
}

function setRedirectBrowserState(url, statusText, mode) {
    const urlBar = document.getElementById('redirect-url-display');
    const status = document.getElementById('redirect-status-text');
    const shell = document.getElementById('redirect-browser-shell');
    if (urlBar) {
        urlBar.textContent = url;
    }
    if (status) {
        status.textContent = statusText;
    }
    if (shell) {
        shell.dataset.state = mode || 'idle';
    }
}

function renderRedirectProof(data) {
    const proof = document.getElementById('redirect-proof');
    if (!proof) return;

    if (!data.success) {
        proof.innerHTML = `<p class="error">Proof check failed: ${escapeHtml(data.error || 'Unknown error')}</p>`;
        return;
    }

    proof.innerHTML = `
        <div class="redirect-proof-grid">
            <div class="status-chip">Source: ${escapeHtml(data.source_url)}</div>
            <div class="status-chip warning">Redirect: ${escapeHtml(data.redirect_status_code)}</div>
            <div class="status-chip success">Destination: ${escapeHtml(data.destination_url)}</div>
            <div class="status-chip">Final Status: ${escapeHtml(data.final_status_code)}</div>
        </div>
        <p><strong>Resolved IP:</strong> ${escapeHtml(data.target_ip || 'n/a')} &nbsp;|&nbsp; <strong>Location Header:</strong> ${escapeHtml(data.redirect_location || 'n/a')}</p>
    `;
}

function renderRedirectTrace(data) {
    const proof = document.getElementById('redirect-proof');
    if (!proof) return;

    if (!data.success) {
        proof.innerHTML = `<p class="error">TCPDump check failed: ${escapeHtml(data.error || 'Unknown error')}</p>`;
        return;
    }

    const httpExchange = (data.http_exchange_lines || []).map(line => escapeHtml(line)).join('\n');
    const packetTrace = (data.packet_trace_lines || []).map(line => escapeHtml(line)).join('\n');

    proof.innerHTML = `
        <div class="redirect-proof-grid">
            <div class="status-chip">Source: ${escapeHtml(data.source_url)}</div>
            <div class="status-chip warning">Redirect: ${escapeHtml(data.redirect_status_code)}</div>
            <div class="status-chip success">Destination: ${escapeHtml(data.destination_url)}</div>
            <div class="status-chip">Final Status: ${escapeHtml(data.final_status_code)}</div>
        </div>
        <p><strong>Resolved IP:</strong> ${escapeHtml(data.target_ip || 'n/a')} &nbsp;|&nbsp; <strong>Location Header:</strong> ${escapeHtml(data.redirect_location || 'n/a')}</p>
        <div class="trace-grid">
            <div class="trace-panel">
                <h4>HTTP Exchange</h4>
                <pre class="trace-block">${httpExchange || 'No HTTP exchange captured.'}</pre>
            </div>
            <div class="trace-panel">
                <h4>Packet Summary</h4>
                <pre class="trace-block">${packetTrace || escapeHtml(data.packet_capture_error || 'No packet trace captured.')}</pre>
            </div>
        </div>
    `;
}

function launchEmbeddedRedirectDemo() {
    renderRedirectResultsShell();

    const iframe = document.getElementById('redirect-demo-frame');
    const proof = document.getElementById('redirect-proof');
    if (!iframe || !proof) return;

    redirectScenarioState.launched = true;
    redirectScenarioState.proofLoaded = false;

    setRedirectBrowserState('http://scenario2.radware.lab/index.php', 'Requesting HTTP page...', 'http');
    proof.innerHTML = '<p>Checking redirect proof and loading the secure destination...</p>';
    iframe.src = 'about:blank';

    fetch('/api/scenario/http_redirect/proof')
        .then(response => response.json())
        .then(data => {
            renderRedirectProof(data);
            if (!data.success) {
                throw new Error(data.error || 'Unable to validate redirect flow');
            }

            redirectScenarioState.proofLoaded = true;
            setRedirectBrowserState('https://scenario2.radware.lab/index.php', `Redirect ${data.redirect_status_code} observed. Secure page loaded.`, 'https');
            iframe.src = '/api/scenario/http_redirect/page';
        })
        .catch(error => {
            setRedirectBrowserState('http://scenario2.radware.lab/index.php', 'Redirect validation failed', 'error');
            proof.innerHTML = `<p class="error">Error: ${escapeHtml(error)}</p>`;
        });
}

function runRedirectTcpdump() {
    renderRedirectTraceShell();

    fetch('/api/scenario/http_redirect/proof?include_packets=1')
        .then(response => response.json())
        .then(data => {
            renderRedirectTrace(data);
        })
        .catch(error => {
            const proof = document.getElementById('redirect-proof');
            if (proof) {
                proof.innerHTML = `<p class="error">Error: ${escapeHtml(error)}</p>`;
            }
        });
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


// ── Offloading Demo ───────────────────────────────────────────────────────────

function loadOffloadingDemo() {
    const btn = document.getElementById('off-load-btn');
    const resultsContent = document.getElementById('results-content');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Loading…'; }
    if (resultsContent) resultsContent.innerHTML = '<p>Loading page from <strong>https://scenario2.radware.lab/index.php</strong> via Alteon…</p>';

    fetch('/api/scenario/offloading/data')
        .then(r => r.json())
        .then(data => {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Reload'; }
            if (!data.success) {
                if (resultsContent) resultsContent.innerHTML = `<p class="error">Error: ${escapeHtml(data.error)}</p>`;
                return;
            }
            if (!resultsContent) return;
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-same-origin allow-scripts';
            iframe.style.cssText = 'width:100%;height:820px;border:1px solid #555;border-radius:4px;margin-top:8px;background:#fff;';
            iframe.srcdoc = buildIframeDocument(data.body_html || '', window.location.origin + '/', '');
            resultsContent.innerHTML = '';
            resultsContent.appendChild(iframe);
        })
        .catch(err => {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-play-fill"></i> Load Page via Alteon'; }
            if (resultsContent) resultsContent.innerHTML = `<p class="error">Request failed: ${escapeHtml(err.message)}</p>`;
        });
}


// ── Bypass Demo ───────────────────────────────────────────────────────────────

function loadBypassDemo() {
    const btn = document.getElementById('bypass-btn');
    const resultsContent = document.getElementById('results-content');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Loading…'; }
    if (resultsContent) resultsContent.innerHTML = '<p>Loading page directly from <strong>https://site-a-servers.radware.lab/index.php</strong> (bypassing Alteon)…</p>';

    fetch('/api/scenario/offloading/bypass')
        .then(r => r.json())
        .then(data => {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Reload Bypass'; }
            if (!data.success) {
                if (resultsContent) resultsContent.innerHTML = `<p class="error">Error: ${escapeHtml(data.error)}</p>`;
                return;
            }
            if (!resultsContent) return;
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-same-origin allow-scripts';
            iframe.style.cssText = 'width:100%;height:820px;border:1px solid #555;border-radius:4px;margin-top:8px;background:#fff;';
            iframe.srcdoc = buildIframeDocument(data.body_html || '', window.location.origin + '/', '');
            resultsContent.innerHTML = '';
            resultsContent.appendChild(iframe);
        })
        .catch(err => {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-shield-x"></i> Bypass Alteon (Direct)'; }
            if (resultsContent) resultsContent.innerHTML = `<p class="error">Request failed: ${escapeHtml(err.message)}</p>`;
        });
}


// ── Custom Header Injection ───────────────────────────────────────────────────

function applyCustomHeader() {
    const nameInput = document.getElementById('hdr-name-input');
    const valueInput = document.getElementById('hdr-value-input');
    const btn = document.getElementById('inject-hdr-btn');
    const resultsContent = document.getElementById('results-content');

    const headerName = (nameInput ? nameInput.value.trim() : '');
    const headerValue = (valueInput ? valueInput.value.trim() : '');

    if (!headerName) {
        if (nameInput) nameInput.focus();
        if (resultsContent) resultsContent.innerHTML = '<p class="error">Please enter a Header Name.</p>';
        return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Applying…'; }
    if (resultsContent) resultsContent.innerHTML =
        `<p>Sending header <strong>${escapeHtml(headerName)}: ${escapeHtml(headerValue)}</strong> to Alteon, then fetching page…</p>`;

    fetch('/api/scenario/offloading/set_header', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({header_name: headerName, header_value: headerValue})
    })
    .then(r => r.json())
    .then(data => {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-send-fill"></i> Apply Header & Fetch Page'; }
        if (!data.success) {
            const raw = data.alteon_raw ? `<pre style="font-size:11px;margin-top:8px;overflow:auto;">${escapeHtml(data.alteon_raw)}</pre>` : '';
            if (resultsContent) resultsContent.innerHTML =
                `<p class="error">Error: ${escapeHtml(data.error)}</p>${raw}`;
            return;
        }
        if (!resultsContent) return;
        const applyNote = data.apply_ok
            ? `<span style="color:#16a34a;font-weight:600;">&#x2713; Config applied</span>`
            : `<span style="color:#f59e0b;font-weight:600;">&#x26a0; Apply status uncertain</span>`;
        const label = document.createElement('p');
        label.style.cssText = 'margin:0 0 6px 0;font-size:13px;';
        label.innerHTML =
            `Alteon injected header <strong>${escapeHtml(data.header_name)}: ${escapeHtml(data.header_value)}</strong> &mdash; ${applyNote}`;
        const iframe = document.createElement('iframe');
        iframe.sandbox = 'allow-same-origin allow-scripts';
        iframe.style.cssText = 'width:100%;height:820px;border:1px solid #555;border-radius:4px;margin-top:4px;background:#fff;';
        iframe.srcdoc = buildIframeDocument(data.body_html || '', window.location.origin + '/', '');
        resultsContent.innerHTML = '';
        resultsContent.appendChild(label);
        resultsContent.appendChild(iframe);
    })
    .catch(err => {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-send-fill"></i> Apply Header & Fetch Page'; }
        if (resultsContent) resultsContent.innerHTML =
            `<p class="error">Request failed: ${escapeHtml(err.message)}</p>`;
    });
}


// ── Content-Switching Demo ────────────────────────────────────────────────────

const CS_BTN_LABELS = {
    'Scenario3-dev.radware.lab': '<i class="bi bi-code-slash"></i> DEV &mdash; scenario3-dev.radware.lab',
    'Scenario3-stg.radware.lab': '<i class="bi bi-layers"></i> STG &mdash; scenario3-stg.radware.lab',
    'Scenario3.radware.lab':     '<i class="bi bi-globe2"></i> PROD &mdash; scenario3.radware.lab'
};

const CS_ENV_COLORS = { dev: '#7c3aed', stg: '#b45309', prod: '#16a34a' };

function loadContentSwitch(host, btnId, scheme) {
    scheme = scheme || 'http';
    const resultsContent = document.getElementById('results-content');
    if (!resultsContent) return;
    const btn = document.getElementById(btnId);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Loading…'; }
    resultsContent.innerHTML = '<p>Loading…</p>';

    fetch('/api/scenario/content_switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: host, scheme: scheme })
    })
    .then(r => r.json())
    .then(data => {
        if (btn) { btn.disabled = false; btn.innerHTML = CS_BTN_LABELS[host] || host; }
        if (!data.success) {
            resultsContent.innerHTML = `<p class="error">Error: ${escapeHtml(data.error)}</p>`;
            return;
        }
        const envKey = (data.env || 'prod');
        const color = CS_ENV_COLORS[envKey] || '#1a56db';
        const badge = `<span style="display:inline-block;padding:2px 10px;border-radius:12px;background:${color};color:#fff;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">${envKey.toUpperCase()}</span>`;
        const label = document.createElement('p');
        label.style.cssText = 'margin:0 0 6px 0;font-size:13px;';
        label.innerHTML = `${badge} ${escapeHtml(scheme)}://<strong>${escapeHtml(host.toLowerCase())}</strong> → ${escapeHtml(data.target_ip)} — Status ${escapeHtml(data.status_code)}`;
        resultsContent.innerHTML = '';
        resultsContent.appendChild(label);
        resultsContent.appendChild(createResponseIframe(data));
    })
    .catch(err => {
        if (btn) { btn.disabled = false; btn.innerHTML = CS_BTN_LABELS[host] || host; }
        resultsContent.innerHTML = `<p class="error">Request failed: ${escapeHtml(err.message)}</p>`;
    });
}



// Initialize
function navToSection(sectionId) {
    switchSection(sectionId);
    clearNavActive();
    const link = document.querySelector('.sidebar-nav a[data-section="' + sectionId + '"]');
    if (link) {
        link.classList.add('active');
        const group = link.closest('.nav-group-flat');
        if (group) group.classList.add('open');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    document.body.setAttribute('data-theme', 'dark');
    setRedirectBrowserState('http://scenario2.radware.lab/index.php', 'Ready to launch redirect demo', 'idle');

    // Sidebar header click → go to home
    const sidebarHeader = document.getElementById('sidebar-home-btn');
    if (sidebarHeader) {
        sidebarHeader.style.cursor = 'pointer';
        sidebarHeader.addEventListener('click', function() {
            switchSection('home');
            clearNavActive();
        });
    }
});

function showDiagramTab(btn, viewId) {
    document.querySelectorAll('.dview').forEach(function(d) { d.style.display = 'none'; });
    document.querySelectorAll('.dtab').forEach(function(t) { t.classList.remove('dtab-active'); });
    document.getElementById(viewId).style.display = 'block';
    btn.classList.add('dtab-active');
}

// ── Health Monitor ────────────────────────────────────────────────────────────
function pollHealth() {
    fetch('/api/health')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            document.querySelectorAll('.quick-link-card[data-ip]').forEach(function(card) {
                var ip = card.getAttribute('data-ip');
                var dot = card.querySelector('.health-dot');
                if (!dot) return;
                dot.classList.remove('up', 'down');
                if (data[ip] === 'up') dot.classList.add('up');
                else if (data[ip] === 'down') dot.classList.add('down');
            });
        })
        .catch(function() {});
}
pollHealth();
setInterval(pollHealth, 30000);
