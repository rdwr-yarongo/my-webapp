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

// ── Scroll hint: fade + arrow + text ──
function updateScrollHint() {
    const section = document.querySelector('.content-section.active');
    const hint = document.getElementById('scroll-hint');
    if (!section || !hint) return;
    const hasMore = section.scrollHeight - section.scrollTop - section.clientHeight > 80;
    const atTop = section.scrollTop < 50;
    if (hasMore && atTop) {
        hint.classList.remove('hidden');
    } else {
        hint.classList.add('hidden');
    }
}
function bindScrollHint() {
    document.querySelectorAll('.content-section').forEach(function(sec) {
        sec.addEventListener('scroll', updateScrollHint, { passive: true });
    });
    setTimeout(updateScrollHint, 500);
}
bindScrollHint();

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
    // Reset scroll and show scroll hint if section has scrollable content
    var sec = document.getElementById(section);
    if (sec) sec.scrollTop = 0;
    setTimeout(updateScrollHint, 100);
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
    resetGslbDnsFlow();
    resetHttpFlow();
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
    resetHaDiagram();
}

// ─────────────────────────────────────────────────────────
// HA LIVE TOPOLOGY DIAGRAM
// ─────────────────────────────────────────────────────────
let _haCounts = { a1: 0, a2: 0 };
let _haTotal  = 0;
let _haPhase  = 'normal'; // 'normal' | 'failover' | 'restored'

function _detectHaAlteon(result) {
    var info = (result.served_by || result.wanlink || '').toLowerCase();
    if (info.indexOf('alteon 2') !== -1 || info.indexOf('alteon2') !== -1) return 'a2';
    if (info.indexOf('alteon 1') !== -1 || info.indexOf('alteon1') !== -1) return 'a1';
    // Fallback: check server_ip or target_ip
    var sip = result.server_ip || result.target_ip || '';
    if (sip.indexOf('.52') !== -1) return 'a2';
    return 'a1';
}

function initHaDiagram() {
    _haCounts = { a1: 0, a2: 0 };
    _haTotal  = 0;
    _haPhase  = 'normal';

    // Reset nodes
    ['ha-node-a1', 'ha-node-a2'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.setAttribute('opacity', '0.45'); el.style.filter = ''; }
    });
    // Reset paths
    ['ha-path-a1', 'ha-path-a2', 'ha-path-srv1', 'ha-path-srv2'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.setAttribute('stroke', '#cbd5e1');
            el.setAttribute('stroke-width', '2');
            el.setAttribute('opacity', '0.5');
            el.setAttribute('marker-end', 'url(#ha-live-arr-idle)');
            el.classList.remove('gslb-path-active');
        }
    });
    // Reset counters
    var ca1 = document.getElementById('ha-count-a1');
    var ca2 = document.getElementById('ha-count-a2');
    var pa1 = document.getElementById('ha-pct-a1');
    var pa2 = document.getElementById('ha-pct-a2');
    if (ca1) ca1.textContent = '0\xD7';
    if (ca2) ca2.textContent = '0\xD7';
    if (pa1) pa1.textContent = '\u2014';
    if (pa2) pa2.textContent = '\u2014';
    // Reset phase
    var phaseBg = document.getElementById('ha-phase-bg');
    var phaseText = document.getElementById('ha-phase-text');
    if (phaseBg) phaseBg.setAttribute('fill', '#e2e8f0');
    if (phaseText) { phaseText.textContent = 'Streaming \u2014 waiting\u2026'; phaseText.setAttribute('fill', '#64748b'); }
    // Reset other labels
    var attemptText = document.getElementById('ha-attempt-text');
    if (attemptText) attemptText.textContent = '\u2014';
    var srvStatus = document.getElementById('ha-srv-status');
    if (srvStatus) srvStatus.textContent = '\u2014';
    var a1Role = document.getElementById('ha-a1-role');
    var a2Role = document.getElementById('ha-a2-role');
    if (a1Role) a1Role.textContent = 'Active \u00b7 HA primary';
    if (a2Role) a2Role.textContent = 'Standby \u00b7 HA secondary';
    // Reset status + strip
    var status = document.getElementById('ha-status-text');
    if (status) { status.textContent = 'Streaming \u2014 waiting for first attempt\u2026'; status.style.color = '#64748b'; }
    var strip = document.getElementById('ha-history-strip');
    if (strip) strip.innerHTML = '';
}

function updateHaDiagram(result) {
    var status = document.getElementById('ha-status-text');
    var strip  = document.getElementById('ha-history-strip');

    if (result.dns_error || result.http_error) {
        var errMsg = result.dns_error || result.http_error;
        if (status) { status.textContent = 'Attempt #' + result.attempt + ' \u2014 \u26A0 ' + errMsg; status.style.color = '#ef4444'; }
        _haAppendDot(strip, '#ef4444', '#' + result.attempt + ': ' + errMsg);
        return;
    }

    var alteon = _detectHaAlteon(result);
    _haTotal++;
    _haCounts[alteon] = (_haCounts[alteon] || 0) + 1;

    // Detect phase transitions
    var prevPhase = _haPhase;
    if (alteon === 'a2' && prevPhase === 'normal') _haPhase = 'failover';
    if (alteon === 'a1' && prevPhase === 'failover') _haPhase = 'restored';

    // Deactivate all paths + nodes
    ['ha-node-a1', 'ha-node-a2'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.setAttribute('opacity', '0.45'); el.style.filter = ''; }
    });
    ['ha-path-a1', 'ha-path-a2', 'ha-path-srv1', 'ha-path-srv2'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.setAttribute('stroke', '#cbd5e1');
            el.setAttribute('stroke-width', '2');
            el.setAttribute('opacity', '0.5');
            el.setAttribute('marker-end', 'url(#ha-live-arr-idle)');
            el.classList.remove('gslb-path-active');
        }
    });

    // Activate the correct Alteon path
    var color = alteon === 'a1' ? '#3b82f6' : '#f59e0b';
    var nodeId = alteon === 'a1' ? 'ha-node-a1' : 'ha-node-a2';
    var pathIn = alteon === 'a1' ? 'ha-path-a1' : 'ha-path-a2';
    var pathOut = alteon === 'a1' ? 'ha-path-srv1' : 'ha-path-srv2';
    var arrIn = alteon === 'a1' ? 'ha-live-arr-a1' : 'ha-live-arr-a2';

    var activeNode = document.getElementById(nodeId);
    if (activeNode) {
        activeNode.setAttribute('opacity', '1');
        activeNode.style.filter = 'drop-shadow(0 0 8px ' + color + ')';
    }

    var activePathIn = document.getElementById(pathIn);
    if (activePathIn) {
        activePathIn.setAttribute('stroke', color);
        activePathIn.setAttribute('stroke-width', '3');
        activePathIn.setAttribute('opacity', '1');
        activePathIn.setAttribute('marker-end', 'url(#' + arrIn + ')');
        activePathIn.classList.add('gslb-path-active');
    }

    var activePathOut = document.getElementById(pathOut);
    if (activePathOut) {
        activePathOut.setAttribute('stroke', '#10b981');
        activePathOut.setAttribute('stroke-width', '3');
        activePathOut.setAttribute('opacity', '1');
        activePathOut.setAttribute('marker-end', 'url(#ha-live-arr-srv)');
        activePathOut.classList.add('gslb-path-active');
    }

    // WebApp server glow
    var srvNode = document.getElementById('ha-node-srv');
    if (srvNode) srvNode.style.filter = 'drop-shadow(0 0 6px #10b981)';

    // Update counters
    var ca1 = document.getElementById('ha-count-a1');
    var ca2 = document.getElementById('ha-count-a2');
    var pa1 = document.getElementById('ha-pct-a1');
    var pa2 = document.getElementById('ha-pct-a2');
    if (ca1) ca1.textContent = _haCounts.a1 + '\xD7';
    if (ca2) ca2.textContent = _haCounts.a2 + '\xD7';
    if (pa1) pa1.textContent = _haTotal > 0 ? Math.round(_haCounts.a1 / _haTotal * 100) + '%' : '\u2014';
    if (pa2) pa2.textContent = _haTotal > 0 ? Math.round(_haCounts.a2 / _haTotal * 100) + '%' : '\u2014';

    // Update phase indicator
    var phaseBg = document.getElementById('ha-phase-bg');
    var phaseText = document.getElementById('ha-phase-text');
    if (_haPhase === 'normal') {
        if (phaseBg) phaseBg.setAttribute('fill', '#dbeafe');
        if (phaseText) { phaseText.textContent = '\u25CF Normal — Alteon 1 serving'; phaseText.setAttribute('fill', '#1d4ed8'); }
    } else if (_haPhase === 'failover') {
        if (phaseBg) phaseBg.setAttribute('fill', '#fef3c7');
        if (phaseText) { phaseText.textContent = '\u26A0 Failover — Alteon 2 active'; phaseText.setAttribute('fill', '#b45309'); }
    } else if (_haPhase === 'restored') {
        if (phaseBg) phaseBg.setAttribute('fill', '#d1fae5');
        if (phaseText) { phaseText.textContent = '\u2714 Restored — Alteon 1 back'; phaseText.setAttribute('fill', '#047857'); }
    }

    // Update role labels based on phase
    var a1Role = document.getElementById('ha-a1-role');
    var a2Role = document.getElementById('ha-a2-role');
    if (_haPhase === 'failover') {
        if (a1Role) a1Role.textContent = 'Ports DOWN \u00b7 failover triggered';
        if (a2Role) a2Role.textContent = 'Active \u00b7 serving traffic';
    } else if (_haPhase === 'restored') {
        if (a1Role) a1Role.textContent = 'Active \u00b7 restored';
        if (a2Role) a2Role.textContent = 'Standby \u00b7 HA secondary';
    } else {
        if (a1Role) a1Role.textContent = 'Active \u00b7 HA primary';
        if (a2Role) a2Role.textContent = 'Standby \u00b7 HA secondary';
    }

    // Attempt + server info
    var attemptText = document.getElementById('ha-attempt-text');
    if (attemptText) attemptText.textContent = '#' + result.attempt;
    var srvStatus = document.getElementById('ha-srv-status');
    var servedBy = result.served_by || result.wanlink || '';
    if (srvStatus) srvStatus.textContent = servedBy ? 'Via: ' + servedBy : '\u2014';

    // Status line
    if (status) {
        var label = alteon === 'a1' ? 'Alteon 1' : 'Alteon 2';
        status.textContent = 'Attempt #' + result.attempt + ' \u2192 ' + label + (servedBy ? ' \u00b7 ' + servedBy : '');
        status.style.color = color;
    }

    // History dot
    _haAppendDot(strip, color, '#' + result.attempt + ': ' + (alteon === 'a1' ? 'Alteon 1' : 'Alteon 2'));
}

function _haAppendDot(strip, color, title) {
    if (!strip) return;
    var dot = document.createElement('span');
    dot.className = 'gslb-history-dot';
    dot.style.background = color;
    dot.title = title;
    strip.appendChild(dot);
    while (strip.children.length > 30) strip.removeChild(strip.firstChild);
}

function resetHaDiagram() {
    ['ha-path-a1', 'ha-path-a2', 'ha-path-srv1', 'ha-path-srv2'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('gslb-path-active');
    });
    var srvNode = document.getElementById('ha-node-srv');
    if (srvNode) srvNode.style.filter = '';
    ['ha-node-a1', 'ha-node-a2'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.filter = '';
    });
    var status = document.getElementById('ha-status-text');
    if (status && _haTotal > 0) {
        status.textContent = 'Stopped after ' + _haTotal + ' attempt' + (_haTotal !== 1 ? 's' : '');
        status.style.color = '#94a3b8';
    }
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
            node.setAttribute('opacity', '0.45');
            node.classList.remove('gslb-node-active');
            node.style.filter = '';
        }
        if (path) {
            path.classList.remove('gslb-path-active');
            path.setAttribute('stroke', '#cbd5e1');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('opacity', '0.5');
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
    if (dnsPath) { dnsPath.setAttribute('stroke', '#64748b'); dnsPath.setAttribute('opacity', '0.8'); }
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

// ─────────────────────────────────────────────────────────
// GSLB DNS DELEGATION FLOW DIAGRAM
// ─────────────────────────────────────────────────────────
const GD_NS_NODES  = ['gd-node-alt1', 'gd-node-alt2', 'gd-node-alt3'];
const GD_NS_PATHS  = ['gd-path-ns1',  'gd-path-ns2',  'gd-path-ns3'];
const GD_NS_COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6'];
const GD_NS_LABELS = ['Alteon 1 (Site A)', 'Alteon 2 (Site A)', 'Alteon 3 (DR)'];
const GD_NS_COUNT  = ['gd-ns1-count', 'gd-ns2-count', 'gd-ns3-count'];
const GD_NS_PCT    = ['gd-ns1-pct',   'gd-ns2-pct',   'gd-ns3-pct'];
const GD_VIP_MAP   = {
    '10.100.4.54':  { nodeId: 'gd-node-v1', countId: 'gd-v1-count', pctId: 'gd-v1-pct', color: '#3b82f6', suffix: 'v1' },
    '10.100.5.54':  { nodeId: 'gd-node-v2', countId: 'gd-v2-count', pctId: 'gd-v2-pct', color: '#06b6d4', suffix: 'v2' },
    '10.100.7.103': { nodeId: 'gd-node-vb', countId: 'gd-vb-count', pctId: 'gd-vb-pct', color: '#a78bfa', suffix: 'vb' }
};
const GD_GSLB_PATHS = [
    'gd-path-a1v1','gd-path-a1v2','gd-path-a1vb',
    'gd-path-a2v1','gd-path-a2v2','gd-path-a2vb',
    'gd-path-a3v1','gd-path-a3v2','gd-path-a3vb'
];

let _gdNsCounts  = [0, 0, 0];
let _gdVipCounts = {};
let _gdTotal     = 0;
let _gdNsIndex   = 0;

function initGslbDnsFlow() {
    _gdNsCounts  = [0, 0, 0];
    _gdVipCounts = { '10.100.4.54': 0, '10.100.5.54': 0, '10.100.7.103': 0 };
    _gdTotal     = 0;
    _gdNsIndex   = 0;

    // Reset NS nodes
    GD_NS_NODES.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.setAttribute('opacity', '0.45'); el.style.filter = ''; }
    });
    // Reset NS paths
    GD_NS_PATHS.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.setAttribute('stroke', '#cbd5e1'); el.setAttribute('opacity', '0.3'); el.setAttribute('marker-end', 'url(#gd-arr-idle)'); el.classList.remove('gslb-path-active'); }
    });
    // Reset GSLB paths
    GD_GSLB_PATHS.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.setAttribute('stroke', '#cbd5e1'); el.setAttribute('stroke-width', '1'); el.setAttribute('opacity', '0.12'); el.classList.remove('gslb-path-active'); }
    });
    // Reset VIP nodes
    Object.values(GD_VIP_MAP).forEach(v => {
        const el = document.getElementById(v.nodeId);
        if (el) { el.setAttribute('opacity', '0.45'); el.style.filter = ''; }
    });
    // Reset query path
    const qp = document.getElementById('gd-path-q');
    if (qp) { qp.setAttribute('stroke', '#cbd5e1'); qp.setAttribute('opacity', '0.5'); qp.setAttribute('marker-end', 'url(#gd-arr-idle)'); }

    // Reset counters
    GD_NS_COUNT.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '0\xD7'; });
    GD_NS_PCT.forEach(id   => { const el = document.getElementById(id); if (el) el.textContent = '\u2014'; });
    Object.values(GD_VIP_MAP).forEach(v => {
        const c = document.getElementById(v.countId); if (c) c.textContent = '0\xD7';
        const p = document.getElementById(v.pctId);   if (p) p.textContent = '\u2014';
    });

    // Reset text elements
    const phaseText = document.getElementById('gd-phase-text');
    const phaseBg   = document.getElementById('gd-phase-bg');
    if (phaseText) phaseText.textContent = 'Streaming \u2014 waiting for first attempt\u2026';
    if (phaseBg)   phaseBg.setAttribute('fill', '#e2e8f0');
    const clientAttempt = document.getElementById('gd-client-attempt');
    if (clientAttempt) clientAttempt.textContent = '\u2014';
    const dnsStatus = document.getElementById('gd-dns-status');
    if (dnsStatus) dnsStatus.textContent = '\u2014';
    const statusText = document.getElementById('gd-status-text');
    if (statusText) { statusText.textContent = 'Streaming \u2014 waiting for first attempt\u2026'; statusText.style.color = '#64748b'; }
    const strip = document.getElementById('gd-history-strip');
    if (strip) strip.innerHTML = '';
}

function updateGslbDnsFlow(result) {
    if (result.dns_error || result.http_error) return;

    const ip = (result.target_ip || '').trim();
    const vip = GD_VIP_MAP[ip];
    if (!vip) return;

    const ns = _gdNsIndex;
    _gdNsIndex = (_gdNsIndex + 1) % 3;
    _gdTotal++;
    _gdNsCounts[ns]++;
    _gdVipCounts[ip] = (_gdVipCounts[ip] || 0) + 1;

    // --- Deactivate all ---
    GD_NS_NODES.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.setAttribute('opacity', '0.45'); el.style.filter = ''; }
    });
    GD_NS_PATHS.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.setAttribute('stroke', '#cbd5e1'); el.setAttribute('opacity', '0.3'); el.setAttribute('marker-end', 'url(#gd-arr-idle)'); el.classList.remove('gslb-path-active'); }
    });
    GD_GSLB_PATHS.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.setAttribute('stroke', '#cbd5e1'); el.setAttribute('stroke-width', '1'); el.setAttribute('opacity', '0.12'); el.classList.remove('gslb-path-active'); }
    });
    Object.values(GD_VIP_MAP).forEach(v => {
        const el = document.getElementById(v.nodeId);
        if (el) { el.setAttribute('opacity', '0.45'); el.style.filter = ''; }
    });

    // --- 1. Query path ---
    const qp = document.getElementById('gd-path-q');
    if (qp) { qp.setAttribute('stroke', '#3b82f6'); qp.setAttribute('opacity', '1'); qp.setAttribute('marker-end', 'url(#gd-arr-query)'); }

    // --- 2. NS delegation path ---
    const nsPath = document.getElementById(GD_NS_PATHS[ns]);
    if (nsPath) { nsPath.setAttribute('stroke', '#f59e0b'); nsPath.setAttribute('opacity', '1'); nsPath.setAttribute('marker-end', 'url(#gd-arr-ns)'); nsPath.classList.add('gslb-path-active'); }

    // --- 3. NS node glow ---
    const nsNode = document.getElementById(GD_NS_NODES[ns]);
    if (nsNode) { nsNode.setAttribute('opacity', '1'); nsNode.style.filter = `drop-shadow(0 0 8px ${GD_NS_COLORS[ns]})`; }

    // --- 4. GSLB answer path (NS → VIP) ---
    const gslbPathId = `gd-path-a${ns + 1}${vip.suffix}`;
    const gslbPath = document.getElementById(gslbPathId);
    if (gslbPath) { gslbPath.setAttribute('stroke', '#10b981'); gslbPath.setAttribute('stroke-width', '2.5'); gslbPath.setAttribute('opacity', '1'); gslbPath.setAttribute('marker-end', 'url(#gd-arr-gslb)'); gslbPath.classList.add('gslb-path-active'); }

    // --- 5. VIP node glow ---
    const vipNode = document.getElementById(vip.nodeId);
    if (vipNode) { vipNode.setAttribute('opacity', '1'); vipNode.style.filter = `drop-shadow(0 0 8px ${vip.color})`; }

    // --- 6. NS counters ---
    GD_NS_COUNT.forEach((id, i) => { const el = document.getElementById(id); if (el) el.textContent = `${_gdNsCounts[i]}\xD7`; });
    GD_NS_PCT.forEach((id, i)   => { const el = document.getElementById(id); if (el) el.textContent = _gdTotal > 0 ? `${Math.round(_gdNsCounts[i] / _gdTotal * 100)}%` : '\u2014'; });

    // --- 7. VIP counters ---
    Object.entries(GD_VIP_MAP).forEach(([vipIp, v]) => {
        const n = _gdVipCounts[vipIp] || 0;
        const c = document.getElementById(v.countId); if (c) c.textContent = `${n}\xD7`;
        const p = document.getElementById(v.pctId);   if (p) p.textContent = _gdTotal > 0 ? `${Math.round(n / _gdTotal * 100)}%` : '\u2014';
    });

    // --- 8. Phase pill ---
    const phaseText = document.getElementById('gd-phase-text');
    const phaseBg   = document.getElementById('gd-phase-bg');
    if (phaseText) phaseText.textContent = `#${_gdTotal} \u2192 ${GD_NS_LABELS[ns]} \u2192 ${ip}`;
    if (phaseBg)   phaseBg.setAttribute('fill', '#dbeafe');

    // --- 9. Client attempt ---
    const clientAttempt = document.getElementById('gd-client-attempt');
    if (clientAttempt) clientAttempt.textContent = `Attempt #${_gdTotal}`;

    // --- 10. DNS status ---
    const dnsStatus = document.getElementById('gd-dns-status');
    if (dnsStatus) dnsStatus.textContent = `NS \u2192 ${GD_NS_LABELS[ns]}`;

    // --- 11. Status text ---
    const statusText = document.getElementById('gd-status-text');
    if (statusText) { statusText.textContent = `#${_gdTotal} via ${GD_NS_LABELS[ns]} \u2192 VIP ${ip}`; statusText.style.color = vip.color; }

    // --- 12. History dot ---
    const strip = document.getElementById('gd-history-strip');
    if (strip) {
        const dot = document.createElement('span');
        dot.className = 'gslb-history-dot';
        dot.style.background = vip.color;
        dot.title = `#${_gdTotal}: ${ip} via ${GD_NS_LABELS[ns]}`;
        strip.appendChild(dot);
        while (strip.children.length > 20) strip.removeChild(strip.firstChild);
    }
}

function resetGslbDnsFlow() {
    GD_NS_PATHS.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('gslb-path-active'); });
    GD_GSLB_PATHS.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('gslb-path-active'); });
    GD_NS_NODES.forEach(id => { const el = document.getElementById(id); if (el) el.style.filter = ''; });
    Object.values(GD_VIP_MAP).forEach(v => { const el = document.getElementById(v.nodeId); if (el) el.style.filter = ''; });
    const statusText = document.getElementById('gd-status-text');
    if (statusText && _gdTotal > 0) { statusText.textContent = `Stopped after ${_gdTotal} attempt${_gdTotal !== 1 ? 's' : ''}`; statusText.style.color = '#94a3b8'; }
    const phaseText = document.getElementById('gd-phase-text');
    if (phaseText && _gdTotal > 0) phaseText.textContent = `Stopped \u2014 ${_gdTotal} attempts`;
}

// ═══════════════ HTTP Traffic Flow ═══════════════
const HF_VIP_MAP = {
    '10.100.4.54':  { nodeId:'hf-node-v1', countId:'hf-v1-count', pctId:'hf-v1-pct', wanlinkId:'hf-v1-wanlink', color:'#3b82f6', clientPath:'hf-path-cv1', poolPath:'hf-path-v1sa', pool:'sa' },
    '10.100.5.54':  { nodeId:'hf-node-v2', countId:'hf-v2-count', pctId:'hf-v2-pct', wanlinkId:'hf-v2-wanlink', color:'#06b6d4', clientPath:'hf-path-cv2', poolPath:'hf-path-v2sa', pool:'sa' },
    '10.100.7.103': { nodeId:'hf-node-vb', countId:'hf-vb-count', pctId:'hf-vb-pct', wanlinkId:'hf-vb-wanlink', color:'#a78bfa', clientPath:'hf-path-cvb', poolPath:'hf-path-vbdr', pool:'dr' }
};
const HF_POOL_MAP = {
    'sa': { nodeId:'hf-node-sa', countId:'hf-sa-count', pctId:'hf-sa-pct', selectedId:'hf-sa-selected', srvIpId:'hf-sa-srv-ip', color:'#10b981' },
    'dr': { nodeId:'hf-node-dr', countId:'hf-dr-count', pctId:'hf-dr-pct', selectedId:'hf-dr-selected', srvIpId:'hf-dr-srv-ip', color:'#f59e0b' }
};
const HF_CLIENT_PATHS = ['hf-path-cv1','hf-path-cv2','hf-path-cvb'];
const HF_POOL_PATHS   = ['hf-path-v1sa','hf-path-v2sa','hf-path-vbdr'];
let _hfVipCounts = {}, _hfPoolCounts = {}, _hfTotal = 0;

function _hfResetPath(id, w, op) {
    const el = document.getElementById(id); if (!el) return;
    el.setAttribute('stroke','#cbd5e1'); el.setAttribute('stroke-width', w);
    el.setAttribute('opacity', op); el.setAttribute('marker-end','url(#hf-arr-idle)');
    el.classList.remove('gslb-path-active');
}
function _hfActivatePath(id, color, w, mid) {
    const el = document.getElementById(id); if (!el) return;
    el.setAttribute('stroke', color); el.setAttribute('stroke-width', w);
    el.setAttribute('opacity','1'); el.setAttribute('marker-end','url(#' + mid + ')');
    el.classList.add('gslb-path-active');
}
function _hfResetNode(id) { const el = document.getElementById(id); if (!el) return; el.setAttribute('opacity','0.45'); el.style.filter = ''; }
function _hfGlowNode(id, color) { const el = document.getElementById(id); if (!el) return; el.setAttribute('opacity','1'); el.style.filter = 'drop-shadow(0 0 8px ' + color + ')'; }

function initHttpFlow() {
    _hfVipCounts = { '10.100.4.54':0, '10.100.5.54':0, '10.100.7.103':0 };
    _hfPoolCounts = { sa:0, dr:0 };
    _hfTotal = 0;
    HF_CLIENT_PATHS.forEach(id => _hfResetPath(id, 2, 0.3));
    HF_POOL_PATHS.forEach(id => _hfResetPath(id, 1.5, 0.15));
    Object.values(HF_VIP_MAP).forEach(v => { _hfResetNode(v.nodeId); const c = document.getElementById(v.countId); if (c) c.textContent = '0\u00D7'; const p = document.getElementById(v.pctId); if (p) p.textContent = '\u2014'; const w = document.getElementById(v.wanlinkId); if (w) w.textContent = '\u2014'; });
    Object.values(HF_POOL_MAP).forEach(p => { _hfResetNode(p.nodeId); const c = document.getElementById(p.countId); if (c) c.textContent = '0\u00D7'; const pc = document.getElementById(p.pctId); if (pc) pc.textContent = '\u2014'; const s = document.getElementById(p.selectedId); if (s) s.textContent = '\u2014'; const ip = document.getElementById(p.srvIpId); if (ip) ip.textContent = 'waiting\u2026'; });
    const badge = document.getElementById('hf-http-badge'); if (badge) { badge.textContent = '\u2014'; badge.setAttribute('fill','#94a3b8'); }
    const badgeBg = document.getElementById('hf-http-badge-bg'); if (badgeBg) { badgeBg.setAttribute('fill','#e2e8f0'); badgeBg.setAttribute('opacity','0.5'); }
    const phase = document.getElementById('hf-phase-text'); if (phase) phase.textContent = 'Waiting for execution\u2026';
    const phaseBg = document.getElementById('hf-phase-bg'); if (phaseBg) phaseBg.setAttribute('fill','#e2e8f0');
    const clientLabel = document.getElementById('hf-client-label'); if (clientLabel) clientLabel.textContent = '\u2014';
    const status = document.getElementById('hf-status-text'); if (status) { status.textContent = 'Click "Execute Scenario 1" to start the HTTP traffic animation.'; status.style.color = '#64748b'; }
    const strip = document.getElementById('hf-history-strip'); if (strip) strip.innerHTML = '';
}

function updateHttpFlow(result) {
    if (!result) return;
    const ip = result.target_ip;
    const vip = HF_VIP_MAP[ip];
    if (!vip) return;
    _hfTotal++;
    _hfVipCounts[ip] = (_hfVipCounts[ip] || 0) + 1;
    const poolKey = vip.pool;
    _hfPoolCounts[poolKey] = (_hfPoolCounts[poolKey] || 0) + 1;
    const pool = HF_POOL_MAP[poolKey];

    // Reset all
    HF_CLIENT_PATHS.forEach(id => _hfResetPath(id, 2, 0.3));
    HF_POOL_PATHS.forEach(id => _hfResetPath(id, 1.5, 0.15));
    Object.values(HF_VIP_MAP).forEach(v => _hfResetNode(v.nodeId));
    Object.values(HF_POOL_MAP).forEach(p => _hfResetNode(p.nodeId));

    // Activate paths
    _hfActivatePath(vip.clientPath, '#f59e0b', 2.5, 'hf-arr-req');
    _hfGlowNode(vip.nodeId, vip.color);
    _hfActivatePath(vip.poolPath, '#10b981', 2.5, 'hf-arr-resp');
    _hfGlowNode(pool.nodeId, pool.color);

    // Selected server
    const srvName = result.server_name || 'unknown';
    const srvIp = result.server_ip || '';
    const selEl = document.getElementById(pool.selectedId); if (selEl) selEl.textContent = srvName;
    const ipEl = document.getElementById(pool.srvIpId); if (ipEl) ipEl.textContent = srvIp;

    // VIP counters
    Object.entries(HF_VIP_MAP).forEach(([vIp, v]) => {
        const n = _hfVipCounts[vIp] || 0;
        const c = document.getElementById(v.countId); if (c) c.textContent = n + '\u00D7';
        const p = document.getElementById(v.pctId); if (p) p.textContent = _hfTotal > 0 ? Math.round(n / _hfTotal * 100) + '%' : '\u2014';
    });
    // Pool counters
    Object.entries(HF_POOL_MAP).forEach(([pk, p]) => {
        const n = _hfPoolCounts[pk] || 0;
        const c = document.getElementById(p.countId); if (c) c.textContent = n + '\u00D7';
        const pc = document.getElementById(p.pctId); if (pc) pc.textContent = _hfTotal > 0 ? Math.round(n / _hfTotal * 100) + '%' : '\u2014';
    });
    // WAN link
    if (result.wanlink) { const wl = document.getElementById(vip.wanlinkId); if (wl) wl.textContent = 'WAN: ' + result.wanlink; }
    // HTTP badge
    const badge = document.getElementById('hf-http-badge');
    const badgeBg = document.getElementById('hf-http-badge-bg');
    const sc = result.status_code || 0;
    if (badge) { badge.textContent = sc + (sc === 200 ? ' OK' : ''); badge.setAttribute('fill', sc === 200 ? '#10b981' : '#ef4444'); }
    if (badgeBg) { badgeBg.setAttribute('fill', sc === 200 ? '#ecfdf5' : '#fef2f2'); badgeBg.setAttribute('opacity','1'); }
    // Phase pill
    const phase = document.getElementById('hf-phase-text'); if (phase) phase.textContent = '#' + _hfTotal + ' \u2192 ' + ip + ' \u2192 ' + srvName + ' (' + srvIp + ') \u2014 ' + sc;
    const phaseBg = document.getElementById('hf-phase-bg'); if (phaseBg) phaseBg.setAttribute('fill','#fef3c7');
    // Client label
    const clientLabel = document.getElementById('hf-client-label'); if (clientLabel) clientLabel.textContent = 'Req #' + _hfTotal + ' \u2192 ' + ip;
    // Status
    const st = document.getElementById('hf-status-text'); if (st) { st.textContent = '#' + _hfTotal + ' HTTP \u2192 ' + ip + ' \u2192 ' + srvName + ' (' + srvIp + ')'; st.style.color = vip.color; }
    // History dot
    const strip = document.getElementById('hf-history-strip');
    if (strip) {
        const dot = document.createElement('span');
        dot.className = 'gslb-history-dot';
        dot.style.background = pool.color;
        dot.title = '#' + _hfTotal + ': ' + ip + ' \u2192 ' + srvName + ' (' + srvIp + ')';
        strip.appendChild(dot);
        while (strip.children.length > 20) strip.removeChild(strip.firstChild);
    }
}

function resetHttpFlow() {
    HF_CLIENT_PATHS.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('gslb-path-active'); });
    HF_POOL_PATHS.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('gslb-path-active'); });
    Object.values(HF_VIP_MAP).forEach(v => { const el = document.getElementById(v.nodeId); if (el) el.style.filter = ''; });
    Object.values(HF_POOL_MAP).forEach(p => { const el = document.getElementById(p.nodeId); if (el) el.style.filter = ''; });
    const st = document.getElementById('hf-status-text');
    if (st && _hfTotal > 0) { st.textContent = 'Stopped after ' + _hfTotal + ' request' + (_hfTotal !== 1 ? 's' : ''); st.style.color = '#94a3b8'; }
    const phase = document.getElementById('hf-phase-text');
    if (phase && _hfTotal > 0) phase.textContent = 'Stopped \u2014 ' + _hfTotal + ' requests';
}
// ─────────────────────────────────────────────────────────

function startGslbStream() {
    stopHaStream();
    stopGslbStream();
    initGslbDiagram();
    initGslbDnsFlow();
    initHttpFlow();
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
        updateGslbDnsFlow(result);
        updateHttpFlow(result);
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

/* ═══════════════════════════════════════════════════════════
   REDIRECT LIVE DIAGRAM — step-by-step animation
   ═══════════════════════════════════════════════════════════ */

var _redirAnimTimer = null;

function initRedirDiagram() {
    /* Reset all paths to idle */
    ['redir-path-http', 'redir-path-307', 'redir-path-https', 'redir-path-fwd'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.setAttribute('stroke', '#cbd5e1');
            el.setAttribute('stroke-width', '2');
            el.setAttribute('opacity', '0.5');
            el.setAttribute('marker-end', 'url(#redir-live-arr-idle)');
            el.classList.remove('gslb-path-active');
        }
    });
    /* Reset step labels */
    ['redir-label-1', 'redir-label-2', 'redir-label-3', 'redir-label-4'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.setAttribute('fill', '#94a3b8'); el.setAttribute('opacity', '0.6'); }
    });
    /* Reset step dots */
    ['redir-dot-1', 'redir-dot-2', 'redir-dot-3', 'redir-dot-4'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.setAttribute('fill', '#e2e8f0'); el.setAttribute('stroke', '#94a3b8'); }
    });
    var stepFlow = document.getElementById('redir-step-flow');
    if (stepFlow) stepFlow.setAttribute('opacity', '0.4');
    /* Reset node dynamic elements */
    var protoBg   = document.getElementById('redir-proto-bg');
    var protoText = document.getElementById('redir-proto-text');
    var lockIcon  = document.getElementById('redir-lock-icon');
    var codeBg    = document.getElementById('redir-code-bg');
    var codeText  = document.getElementById('redir-code-text');
    var locText   = document.getElementById('redir-location-text');
    var alteonIp  = document.getElementById('redir-alteon-ip');
    var finalBg   = document.getElementById('redir-final-bg');
    var finalText = document.getElementById('redir-final-text');
    var serverIp  = document.getElementById('redir-server-ip');
    var stepText  = document.getElementById('redir-step-text');
    if (protoBg)   { protoBg.setAttribute('opacity', '0'); protoBg.setAttribute('fill', '#fee2e2'); }
    if (protoText) { protoText.setAttribute('opacity', '0'); protoText.textContent = 'HTTP'; protoText.setAttribute('fill', '#dc2626'); }
    if (lockIcon)  { lockIcon.textContent = '\uD83D\uDD13'; lockIcon.setAttribute('opacity', '0.3'); lockIcon.setAttribute('fill', '#94a3b8'); }
    if (codeBg)    codeBg.setAttribute('opacity', '0');
    if (codeText)  codeText.setAttribute('opacity', '0');
    if (locText)   { locText.setAttribute('opacity', '0'); locText.textContent = 'Location: https://…'; }
    if (alteonIp)  alteonIp.textContent = '—';
    if (finalBg)   finalBg.setAttribute('opacity', '0');
    if (finalText) finalText.setAttribute('opacity', '0');
    if (serverIp)  serverIp.textContent = '—';
    if (stepText)  stepText.textContent = '—';
    /* Reset node glows */
    var nodeAlteon = document.getElementById('redir-node-alteon');
    var nodeServer = document.getElementById('redir-node-server');
    if (nodeAlteon) nodeAlteon.querySelector('rect').style.filter = '';
    if (nodeServer) nodeServer.querySelector('rect').style.filter = '';
    /* Phase pill */
    var phaseBg   = document.getElementById('redir-phase-bg');
    var phaseText = document.getElementById('redir-phase-text');
    if (phaseBg)   phaseBg.setAttribute('fill', '#e2e8f0');
    if (phaseText) { phaseText.textContent = 'Waiting for demo launch…'; phaseText.setAttribute('fill', '#64748b'); }
    /* Status text */
    var statusText = document.getElementById('redir-status-text');
    if (statusText) { statusText.textContent = 'Initializing redirect proof…'; statusText.style.color = '#64748b'; }
}

function animateRedirStep(step, data) {
    var phaseBg   = document.getElementById('redir-phase-bg');
    var phaseText = document.getElementById('redir-phase-text');
    var statusText = document.getElementById('redir-status-text');

    if (step === 1) {
        /* ── Step 1: HTTP request sent ── */
        var pathHttp  = document.getElementById('redir-path-http');
        var label1    = document.getElementById('redir-label-1');
        var dot1      = document.getElementById('redir-dot-1');
        var protoBg   = document.getElementById('redir-proto-bg');
        var protoText = document.getElementById('redir-proto-text');
        var lockIcon  = document.getElementById('redir-lock-icon');
        var stepText  = document.getElementById('redir-step-text');

        if (pathHttp) {
            pathHttp.setAttribute('stroke', '#f97316');
            pathHttp.setAttribute('stroke-width', '3');
            pathHttp.setAttribute('opacity', '1');
            pathHttp.setAttribute('marker-end', 'url(#redir-live-arr-http)');
            pathHttp.classList.add('gslb-path-active');
        }
        if (label1) { label1.setAttribute('fill', '#f97316'); label1.setAttribute('opacity', '1'); }
        if (dot1)   { dot1.setAttribute('fill', '#fff7ed'); dot1.setAttribute('stroke', '#f97316'); }
        if (protoBg)   { protoBg.setAttribute('fill', '#fee2e2'); protoBg.setAttribute('opacity', '1'); }
        if (protoText) { protoText.textContent = 'HTTP'; protoText.setAttribute('fill', '#dc2626'); protoText.setAttribute('opacity', '1'); }
        if (lockIcon)  { lockIcon.textContent = '\uD83D\uDD13'; lockIcon.setAttribute('opacity', '1'); lockIcon.setAttribute('fill', '#dc2626'); }
        if (stepText)  stepText.textContent = 'Sending HTTP…';
        if (phaseBg)   phaseBg.setAttribute('fill', '#fff7ed');
        if (phaseText) { phaseText.textContent = '① Sending HTTP request…'; phaseText.setAttribute('fill', '#c2410c'); }
        if (statusText) { statusText.textContent = 'HTTP GET http://scenario2.radware.lab/index.php'; statusText.style.color = '#f97316'; }

    } else if (step === 2) {
        /* ── Step 2: 307 redirect received ── */
        var path307   = document.getElementById('redir-path-307');
        var label2    = document.getElementById('redir-label-2');
        var dot2      = document.getElementById('redir-dot-2');
        var codeBg    = document.getElementById('redir-code-bg');
        var codeText  = document.getElementById('redir-code-text');
        var locText   = document.getElementById('redir-location-text');
        var alteonIp  = document.getElementById('redir-alteon-ip');

        /* Keep step 1 active but dim it slightly */
        var pathHttp = document.getElementById('redir-path-http');
        if (pathHttp) { pathHttp.classList.remove('gslb-path-active'); pathHttp.setAttribute('opacity', '0.7'); }

        if (path307) {
            path307.setAttribute('stroke', '#f59e0b');
            path307.setAttribute('stroke-width', '3');
            path307.setAttribute('opacity', '1');
            path307.setAttribute('marker-end', 'url(#redir-live-arr-307)');
            path307.classList.add('gslb-path-active');
        }
        if (label2) { label2.setAttribute('fill', '#f59e0b'); label2.setAttribute('opacity', '1'); }
        if (dot2)   { dot2.setAttribute('fill', '#fffbeb'); dot2.setAttribute('stroke', '#f59e0b'); }
        if (codeBg)   codeBg.setAttribute('opacity', '1');
        if (codeText) { codeText.textContent = data ? data.redirect_status_code : '307'; codeText.setAttribute('opacity', '1'); }
        if (locText)  { locText.textContent = 'Location: ' + (data && data.redirect_location ? data.redirect_location : 'https://…'); locText.setAttribute('opacity', '1'); }
        if (alteonIp && data) alteonIp.textContent = 'VIP → ' + (data.target_ip || '');

        /* Glow Alteon node */
        var nodeAlteon = document.getElementById('redir-node-alteon');
        if (nodeAlteon) nodeAlteon.querySelector('rect').style.filter = 'drop-shadow(0 0 8px #f59e0b)';

        if (phaseBg)   phaseBg.setAttribute('fill', '#fef3c7');
        if (phaseText) { phaseText.textContent = '\u26A0 ' + (data ? data.redirect_status_code : '307') + ' Redirect received'; phaseText.setAttribute('fill', '#b45309'); }
        if (statusText) { statusText.textContent = (data ? data.redirect_status_code : '307') + ' Redirect → ' + (data && data.redirect_location ? data.redirect_location : 'https://…'); statusText.style.color = '#f59e0b'; }

    } else if (step === 3) {
        /* ── Step 3: HTTPS follow-up ── */
        var pathHttps = document.getElementById('redir-path-https');
        var label3    = document.getElementById('redir-label-3');
        var dot3      = document.getElementById('redir-dot-3');
        var protoBg   = document.getElementById('redir-proto-bg');
        var protoText = document.getElementById('redir-proto-text');
        var lockIcon  = document.getElementById('redir-lock-icon');
        var stepText  = document.getElementById('redir-step-text');

        /* Dim step 2 */
        var path307 = document.getElementById('redir-path-307');
        if (path307) { path307.classList.remove('gslb-path-active'); path307.setAttribute('opacity', '0.7'); }

        if (pathHttps) {
            pathHttps.setAttribute('stroke', '#10b981');
            pathHttps.setAttribute('stroke-width', '3');
            pathHttps.setAttribute('opacity', '1');
            pathHttps.setAttribute('marker-end', 'url(#redir-live-arr-https)');
            pathHttps.classList.add('gslb-path-active');
        }
        if (label3) { label3.setAttribute('fill', '#10b981'); label3.setAttribute('opacity', '1'); }
        if (dot3)   { dot3.setAttribute('fill', '#ecfdf5'); dot3.setAttribute('stroke', '#10b981'); }
        /* Upgrade protocol badge to HTTPS */
        if (protoBg)   { protoBg.setAttribute('fill', '#d1fae5'); protoBg.setAttribute('opacity', '1'); }
        if (protoText) { protoText.textContent = 'HTTPS 🔒'; protoText.setAttribute('fill', '#047857'); protoText.setAttribute('opacity', '1'); }
        if (lockIcon)  { lockIcon.textContent = '\uD83D\uDD12'; lockIcon.setAttribute('opacity', '1'); lockIcon.setAttribute('fill', '#047857'); }
        if (stepText)  stepText.textContent = 'Secure connection';
        if (phaseBg)   phaseBg.setAttribute('fill', '#d1fae5');
        if (phaseText) { phaseText.textContent = '③ Following redirect to HTTPS…'; phaseText.setAttribute('fill', '#047857'); }
        if (statusText) { statusText.textContent = 'HTTPS GET https://scenario2.radware.lab/index.php'; statusText.style.color = '#10b981'; }

    } else if (step === 4) {
        /* ── Step 4: Backend forward + final response ── */
        var pathFwd   = document.getElementById('redir-path-fwd');
        var label4    = document.getElementById('redir-label-4');
        var dot4      = document.getElementById('redir-dot-4');
        var finalBg   = document.getElementById('redir-final-bg');
        var finalText = document.getElementById('redir-final-text');
        var serverIp  = document.getElementById('redir-server-ip');

        /* Dim step 3 */
        var pathHttps = document.getElementById('redir-path-https');
        if (pathHttps) { pathHttps.classList.remove('gslb-path-active'); pathHttps.setAttribute('opacity', '0.7'); }

        if (pathFwd) {
            pathFwd.setAttribute('stroke', '#10b981');
            pathFwd.setAttribute('stroke-width', '3');
            pathFwd.setAttribute('opacity', '1');
            pathFwd.setAttribute('marker-end', 'url(#redir-live-arr-https)');
            pathFwd.classList.add('gslb-path-active');
        }
        if (label4) { label4.setAttribute('fill', '#10b981'); label4.setAttribute('opacity', '1'); }
        if (dot4)   { dot4.setAttribute('fill', '#ecfdf5'); dot4.setAttribute('stroke', '#10b981'); }
        if (finalBg)   finalBg.setAttribute('opacity', '1');
        if (finalText) { finalText.textContent = data ? data.final_status_code + ' OK' : '200 OK'; finalText.setAttribute('opacity', '1'); }
        if (serverIp && data)  serverIp.textContent = data.target_ip || '';

        /* Glow server node */
        var nodeServer = document.getElementById('redir-node-server');
        if (nodeServer) nodeServer.querySelector('rect').style.filter = 'drop-shadow(0 0 8px #10b981)';

        if (phaseBg)   phaseBg.setAttribute('fill', '#d1fae5');
        if (phaseText) { phaseText.textContent = '\u2714 Secure page loaded successfully'; phaseText.setAttribute('fill', '#047857'); }
        if (statusText) {
            statusText.textContent = 'Complete — HTTP redirected to HTTPS via Alteon' + (data && data.target_ip ? ' (' + data.target_ip + ')' : '');
            statusText.style.color = '#047857';
        }

    } else if (step === 'error') {
        if (phaseBg)   phaseBg.setAttribute('fill', '#fee2e2');
        if (phaseText) { phaseText.textContent = '\u26A0 Redirect proof failed'; phaseText.setAttribute('fill', '#dc2626'); }
        if (statusText) { statusText.textContent = 'Error: ' + (data && data.error ? data.error : 'Unknown'); statusText.style.color = '#ef4444'; }
    }
}

function resetRedirDiagram() {
    ['redir-path-http', 'redir-path-307', 'redir-path-https', 'redir-path-fwd'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('gslb-path-active');
    });
    var nodeAlteon = document.getElementById('redir-node-alteon');
    var nodeServer = document.getElementById('redir-node-server');
    if (nodeAlteon) nodeAlteon.querySelector('rect').style.filter = '';
    if (nodeServer) nodeServer.querySelector('rect').style.filter = '';
}

function launchEmbeddedRedirectDemo() {
    renderRedirectResultsShell();

    const iframe = document.getElementById('redirect-demo-frame');
    const proof = document.getElementById('redirect-proof');
    if (!iframe || !proof) return;

    redirectScenarioState.launched = true;
    redirectScenarioState.proofLoaded = false;

    /* ── Start redirect diagram animation ── */
    initRedirDiagram();
    animateRedirStep(1, null);

    setRedirectBrowserState('http://scenario2.radware.lab/index.php', 'Requesting HTTP page...', 'http');
    proof.innerHTML = '<p>Checking redirect proof and loading the secure destination...</p>';
    iframe.src = 'about:blank';

    fetch('/api/scenario/http_redirect/proof')
        .then(response => response.json())
        .then(data => {
            renderRedirectProof(data);
            if (!data.success) {
                animateRedirStep('error', data);
                throw new Error(data.error || 'Unable to validate redirect flow');
            }

            /* ── Steps 2→3→4 animate in sequence ── */
            setTimeout(function() { animateRedirStep(2, data); }, 400);
            setTimeout(function() { animateRedirStep(3, data); }, 1000);
            setTimeout(function() { animateRedirStep(4, data); }, 1600);

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

/* ── Alteon WebUI Side Drawer ───────────────────────────── */
const alteonDeviceLabels = {
    alteon1: 'Alteon 1 (10.100.0.51)',
    alteon2: 'Alteon 2 (10.100.0.52)',
};

/* Saved navTarget so A1/A2 header buttons re-use the same page */
var _alteonNavTarget = 'ha';

function toggleAlteonWebUI(device, navTarget) {
    device = device || 'alteon1';
    if (navTarget) _alteonNavTarget = navTarget;
    var target = navTarget || _alteonNavTarget || 'ha';

    const drawer = document.getElementById('alteon-drawer');
    const backdrop = document.getElementById('alteon-drawer-backdrop');
    const frame = document.getElementById('alteon-webui-frame');
    const label = document.getElementById('alteon-webui-device-label');
    const targetSrc = `/alteon-webui/${device}/webui/default.html`;

    /* If drawer is open on the same device, close it */
    if (drawer.classList.contains('open') && frame.src.includes(device)) {
        hideAlteonWebUI();
        return;
    }

    label.textContent = alteonDeviceLabels[device] || device;
    frame.src = targetSrc;
    drawer.classList.add('open');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';

    /* Auto-navigate after GWT loads */
    frame.onload = function () {
        function gwtClick(el) {
            if (!el) return;
            el.scrollIntoView && el.scrollIntoView({ block: 'center' });
            var rect = el.getBoundingClientRect();
            var cx = rect.left + rect.width / 2;
            var cy = rect.top + rect.height / 2;
            var opts = { bubbles: true, cancelable: true, view: frame.contentWindow, clientX: cx, clientY: cy };
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            el.dispatchEvent(new MouseEvent('mouseup', opts));
            el.dispatchEvent(new MouseEvent('click', opts));
        }
        function gwtDblClick(el) {
            if (!el) return;
            var rect = el.getBoundingClientRect();
            var opts = { bubbles: true, cancelable: true, view: frame.contentWindow, detail: 2, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
            el.dispatchEvent(new MouseEvent('dblclick', opts));
        }
        function retryClick(doc, id, attempts, cb) {
            var el = doc.getElementById(id);
            if (el) { gwtClick(el); if (cb) cb(); return; }
            if (attempts > 0) setTimeout(function () { retryClick(doc, id, attempts - 1, cb); }, 800);
        }
        setTimeout(function () {
            try {
                var doc = frame.contentDocument || frame.contentWindow.document;
                if (target === 'gslb-dns-rules') {
                    /* Application Delivery → Global Traffic Redirection → DNS Redirection Rules → Rule 10 */
                    gwtClick(doc.getElementById('gwt-debug-TopicsStack_Configuration.Application_Delivery'));
                    setTimeout(function () {
                        retryClick(doc, 'gwt-debug-TopicsNode_Application_Delivery.tree.Global_Traffic_Redirection41-content', 5, function () {
                            setTimeout(function () {
                                retryClick(doc, 'gwt-debug-TopicsNode_Application_Delivery.tree.Global_Traffic_Redirection41.Rules-content', 5, function () {
                                    setTimeout(function () {
                                        var row = doc.getElementById('gwt-debug-gslbNewCfgRuleTable_RowID_1');
                                        if (row) { gwtClick(row); setTimeout(function () { gwtDblClick(row); }, 500); }
                                    }, 1500);
                                });
                            }, 1500);
                        });
                    }, 2000);
                } else if (target === 'vs-scenario2-http') {
                    /* Application Delivery → Virtual Services → Scenario2 → Application: HTTP */
                    gwtClick(doc.getElementById('gwt-debug-TopicsStack_Configuration.Application_Delivery'));
                    setTimeout(function () {
                        retryClick(doc, 'gwt-debug-TopicsNode_Application_Delivery.tree.Node0-content', 5, function () {
                            setTimeout(function () {
                                /* Click Scenario2 row in Virtual Servers table */
                                var s2Row = doc.getElementById('gwt-debug-slbNewCfgEnhVirtServerTable_RowID_6');
                                if (s2Row) { gwtClick(s2Row); }
                                setTimeout(function () {
                                    /* Click + dblclick the HTTP virtual service row */
                                    var httpRow = doc.getElementById('gwt-debug-slbNewCfgEnhVirtServicesTable_RowID_1');
                                    if (httpRow) { gwtClick(httpRow); setTimeout(function () { gwtDblClick(httpRow); }, 500); }
                                }, 2000);
                            }, 2000);
                        });
                    }, 2000);
                } else if (target === 'vs-scenario2-https-contentmod') {
                    /* Application Delivery → Virtual Services → Scenario2 → HTTPS → HTTP Content Modification */
                    gwtClick(doc.getElementById('gwt-debug-TopicsStack_Configuration.Application_Delivery'));
                    setTimeout(function () {
                        retryClick(doc, 'gwt-debug-TopicsNode_Application_Delivery.tree.Node0-content', 5, function () {
                            setTimeout(function () {
                                /* Click Scenario2 row */
                                var s2Row = doc.getElementById('gwt-debug-slbNewCfgEnhVirtServerTable_RowID_6');
                                if (s2Row) { gwtClick(s2Row); }
                                setTimeout(function () {
                                    /* Click + dblclick the HTTPS virtual service row (RowID_0) */
                                    var httpsRow = doc.getElementById('gwt-debug-slbNewCfgEnhVirtServicesTable_RowID_0');
                                    if (httpsRow) { gwtClick(httpsRow); setTimeout(function () { gwtDblClick(httpsRow); }, 500); }
                                    /* Click the HTTP Content Modification tab */
                                    setTimeout(function () {
                                        var tab = doc.getElementById('gwt-debug-ApplicationDelivery.VirtualServicesmockup.Column_5_Tab');
                                        if (tab) { gwtClick(tab); }
                                    }, 2000);
                                }, 2000);
                            }, 2000);
                        });
                    }, 2000);
                } else if (target === 'vs-scenario3-cbr') {
                    /* Application Delivery → Virtual Services → Scenario3 → Content Based Rules */
                    gwtClick(doc.getElementById('gwt-debug-TopicsStack_Configuration.Application_Delivery'));
                    setTimeout(function () {
                        retryClick(doc, 'gwt-debug-TopicsNode_Application_Delivery.tree.Node0-content', 5, function () {
                            setTimeout(function () {
                                /* Click Scenario3 row (RowID_7) */
                                var s3Row = doc.getElementById('gwt-debug-slbNewCfgEnhVirtServerTable_RowID_7');
                                if (s3Row) { gwtClick(s3Row); }
                                setTimeout(function () {
                                    /* Click + dblclick the SSL virtual service row (RowID_0) */
                                    var sslRow = doc.getElementById('gwt-debug-slbNewCfgEnhVirtServicesTable_RowID_0');
                                    if (sslRow) { gwtClick(sslRow); setTimeout(function () { gwtDblClick(sslRow); }, 500); }
                                    /* Click the Content Based Rules tab */
                                    setTimeout(function () {
                                        var tab = doc.getElementById('gwt-debug-ApplicationDelivery.VirtualServicesmockup.Column_17_Tab');
                                        if (tab) { gwtClick(tab); }
                                    }, 2000);
                                }, 2000);
                            }, 2000);
                        });
                    }, 2000);
                } else {
                    /* Default: Network → High Availability */
                    gwtClick(doc.getElementById('gwt-debug-TopicsStack_Configuration.Network'));
                    retryClick(doc, 'gwt-debug-TopicsNode_Network.tree.High_Availability8-content', 5);
                }
            } catch (e) { /* cross-origin safety */ }
        }, 4000);
    };
}

function hideAlteonWebUI() {
    document.getElementById('alteon-drawer').classList.remove('open');
    document.getElementById('alteon-drawer-backdrop').classList.remove('open');
    document.body.style.overflow = '';
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
        initHaDiagram();
        haEventSource = new EventSource('/api/scenario/ha_failover/stream');

        haEventSource.onmessage = function(event) {
            const result = JSON.parse(event.data);
            updateHaDiagram(result);
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


// ── Offloading Flow Diagram ────────────────────────────────────────────────────

let _offReqCount = 0;

function initOffFlow() {
    _offReqCount = 0;
    // Reset paths
    var cv = document.getElementById('off-path-cv');
    if (cv) { cv.setAttribute('stroke','#cbd5e1'); cv.setAttribute('stroke-width','2'); cv.setAttribute('opacity','0.3'); cv.setAttribute('marker-end','url(#off-arr-idle)'); cv.classList.remove('gslb-path-active'); }
    var vb = document.getElementById('off-path-vb');
    if (vb) { vb.setAttribute('stroke','#cbd5e1'); vb.setAttribute('stroke-width','2'); vb.setAttribute('opacity','0.3'); vb.setAttribute('marker-end','url(#off-arr-idle)'); vb.classList.remove('gslb-path-active'); }
    var bp = document.getElementById('off-path-bypass');
    if (bp) { bp.setAttribute('stroke','#cbd5e1'); bp.setAttribute('stroke-width','2'); bp.setAttribute('opacity','0.15'); bp.setAttribute('marker-end','url(#off-arr-idle)'); bp.classList.remove('gslb-path-active'); }
    // Reset nodes
    ['off-node-vip','off-node-backend'].forEach(function(id) { var el = document.getElementById(id); if (!el) return; el.setAttribute('opacity','0.45'); el.style.filter = ''; });
    // Reset labels
    var hl = document.getElementById('off-host-label'); if (hl) { hl.textContent = 'Host: ?'; hl.setAttribute('fill','#94a3b8'); }
    var cl = document.getElementById('off-client-label'); if (cl) cl.textContent = '\u2014';
    var vs = document.getElementById('off-vip-status'); if (vs) vs.textContent = '\u2014';
    var bl = document.getElementById('off-backend-label'); if (bl) bl.textContent = '\u2014';
    var byl = document.getElementById('off-bypass-label'); if (byl) { byl.setAttribute('fill','#94a3b8'); byl.setAttribute('opacity','0.5'); }
    // Reset protocol badges
    var plBg = document.getElementById('off-proto-left-bg'); if (plBg) { plBg.setAttribute('fill','#e2e8f0'); plBg.setAttribute('opacity','0.5'); }
    var pl = document.getElementById('off-proto-left'); if (pl) { pl.textContent = 'HTTPS :443'; pl.setAttribute('fill','#94a3b8'); }
    var prBg = document.getElementById('off-proto-right-bg'); if (prBg) { prBg.setAttribute('fill','#e2e8f0'); prBg.setAttribute('opacity','0.5'); }
    var pr = document.getElementById('off-proto-right'); if (pr) { pr.textContent = 'HTTP :80'; pr.setAttribute('fill','#94a3b8'); }
    // Reset modification icons
    ['off-mod-ssl-icon','off-mod-body-icon','off-mod-xff-icon','off-mod-hdr-icon'].forEach(function(id) { var el = document.getElementById(id); if (el) { el.textContent = '\u25CB'; el.setAttribute('fill','#94a3b8'); } });
    ['off-mod-ssl','off-mod-body','off-mod-xff','off-mod-hdr'].forEach(function(id) { var el = document.getElementById(id); if (el) { el.setAttribute('fill','#94a3b8'); el.style.textDecoration = ''; } });
    // Reset badge & counter
    var badge = document.getElementById('off-http-badge'); if (badge) { badge.textContent = '\u2014'; badge.setAttribute('fill','#94a3b8'); }
    var badgeBg = document.getElementById('off-http-badge-bg'); if (badgeBg) { badgeBg.setAttribute('fill','#e2e8f0'); badgeBg.setAttribute('opacity','0.5'); }
    var rc = document.getElementById('off-req-count'); if (rc) rc.textContent = '0';
    var phase = document.getElementById('off-phase-text'); if (phase) phase.textContent = 'Click a button to send a request\u2026';
    var phaseBg = document.getElementById('off-phase-bg'); if (phaseBg) phaseBg.setAttribute('fill','#e2e8f0');
    var st = document.getElementById('off-status-text'); if (st) { st.textContent = 'Click a button below to animate the offloading flow.'; st.style.color = '#64748b'; }
    var strip = document.getElementById('off-history-strip'); if (strip) strip.innerHTML = '';
}

function updateOffFlow(data) {
    if (!data) return;
    _offReqCount++;
    var mode = data.mode || 'alteon'; // 'alteon' or 'bypass'
    var sc = data.status_code || 0;
    var host = data.target_host || '';
    var customHdr = data.custom_header_name || '';
    var customVal = data.custom_header_value || '';
    var isAlteon = (mode === 'alteon');
    var pathColor = isAlteon ? '#3b82f6' : '#ef4444';

    // Reset all paths
    var cv = document.getElementById('off-path-cv');
    if (cv) { cv.setAttribute('stroke','#cbd5e1'); cv.setAttribute('stroke-width','2'); cv.setAttribute('opacity','0.3'); cv.setAttribute('marker-end','url(#off-arr-idle)'); cv.classList.remove('gslb-path-active'); }
    var vb = document.getElementById('off-path-vb');
    if (vb) { vb.setAttribute('stroke','#cbd5e1'); vb.setAttribute('stroke-width','2'); vb.setAttribute('opacity','0.3'); vb.setAttribute('marker-end','url(#off-arr-idle)'); vb.classList.remove('gslb-path-active'); }
    var bp = document.getElementById('off-path-bypass');
    if (bp) { bp.setAttribute('stroke','#cbd5e1'); bp.setAttribute('stroke-width','2'); bp.setAttribute('opacity','0.15'); bp.setAttribute('marker-end','url(#off-arr-idle)'); bp.classList.remove('gslb-path-active'); }
    ['off-node-vip','off-node-backend'].forEach(function(id) { var el = document.getElementById(id); if (!el) return; el.setAttribute('opacity','0.45'); el.style.filter = ''; });

    if (isAlteon) {
        // Activate top path: Client → VIP → Backend
        if (cv) { cv.setAttribute('stroke','#3b82f6'); cv.setAttribute('stroke-width','2.5'); cv.setAttribute('opacity','1'); cv.setAttribute('marker-end','url(#off-arr-alteon)'); cv.classList.add('gslb-path-active'); }
        if (vb) { vb.setAttribute('stroke','#16a34a'); vb.setAttribute('stroke-width','2.5'); vb.setAttribute('opacity','1'); vb.setAttribute('marker-end','url(#off-arr-http)'); vb.classList.add('gslb-path-active'); }
        // Glow VIP + Backend
        var vipEl = document.getElementById('off-node-vip');
        if (vipEl) { vipEl.setAttribute('opacity','1'); vipEl.style.filter = 'drop-shadow(0 0 8px #3b82f6)'; }
        var beEl = document.getElementById('off-node-backend');
        if (beEl) { beEl.setAttribute('opacity','1'); beEl.style.filter = 'drop-shadow(0 0 8px #f59e0b)'; }
        // Protocol badges
        var plBg = document.getElementById('off-proto-left-bg'); if (plBg) { plBg.setAttribute('fill','#dbeafe'); plBg.setAttribute('opacity','1'); }
        var pl = document.getElementById('off-proto-left'); if (pl) { pl.textContent = 'HTTPS :443'; pl.setAttribute('fill','#1d4ed8'); }
        var prBg = document.getElementById('off-proto-right-bg'); if (prBg) { prBg.setAttribute('fill','#dcfce7'); prBg.setAttribute('opacity','1'); }
        var pr = document.getElementById('off-proto-right'); if (pr) { pr.textContent = 'HTTP :80'; pr.setAttribute('fill','#166534'); }
        // Modification checkmarks — all green
        ['off-mod-ssl-icon','off-mod-body-icon','off-mod-xff-icon'].forEach(function(id) { var el = document.getElementById(id); if (el) { el.textContent = '\u2714'; el.setAttribute('fill','#16a34a'); } });
        ['off-mod-ssl','off-mod-body','off-mod-xff'].forEach(function(id) { var el = document.getElementById(id); if (el) { el.setAttribute('fill','#1e293b'); el.style.textDecoration = ''; } });
        // Custom header: green check if set, else gray circle
        var hdrIcon = document.getElementById('off-mod-hdr-icon');
        var hdrText = document.getElementById('off-mod-hdr');
        if (customHdr) {
            if (hdrIcon) { hdrIcon.textContent = '\u2714'; hdrIcon.setAttribute('fill','#16a34a'); }
            if (hdrText) { hdrText.textContent = '+ ' + customHdr + ': ' + customVal; hdrText.setAttribute('fill','#1e293b'); hdrText.style.textDecoration = ''; }
        } else {
            if (hdrIcon) { hdrIcon.textContent = '\u25CB'; hdrIcon.setAttribute('fill','#94a3b8'); }
            if (hdrText) { hdrText.textContent = '+ Custom header (via API)'; hdrText.setAttribute('fill','#94a3b8'); hdrText.style.textDecoration = ''; }
        }
        // VIP status
        var vs = document.getElementById('off-vip-status'); if (vs) vs.textContent = 'HTTPS \u2192 HTTP (offloaded)';
        // Host label
        var hl = document.getElementById('off-host-label'); if (hl) { hl.textContent = 'Host: ' + host; hl.setAttribute('fill','#3b82f6'); }
        // Client label
        var cl = document.getElementById('off-client-label'); if (cl) cl.textContent = 'https://' + host;
        // Backend label
        var bl = document.getElementById('off-backend-label'); if (bl) bl.textContent = 'HTTP :80 \u2190 Alteon';
        // Bypass label dim
        var byl = document.getElementById('off-bypass-label'); if (byl) { byl.setAttribute('fill','#94a3b8'); byl.setAttribute('opacity','0.3'); }
        // Phase pill
        var phase = document.getElementById('off-phase-text');
        if (phase) phase.textContent = '#' + _offReqCount + ' HTTPS \u2192 Alteon \u2192 HTTP :80 \u2192 Backend \u2014 ' + sc;
        var phaseBg = document.getElementById('off-phase-bg'); if (phaseBg) phaseBg.setAttribute('fill','#dbeafe');
        // Status text
        var st = document.getElementById('off-status-text');
        if (st) { st.textContent = '#' + _offReqCount + ' Via Alteon \u2014 SSL offloaded + content modified \u2014 ' + sc; st.style.color = '#3b82f6'; }
    } else {
        // BYPASS mode: activate bottom path
        if (bp) { bp.setAttribute('stroke','#ef4444'); bp.setAttribute('stroke-width','2.5'); bp.setAttribute('opacity','1'); bp.setAttribute('marker-end','url(#off-arr-bypass)'); bp.classList.add('gslb-path-active'); }
        // Glow backend only, VIP stays dim
        var beEl2 = document.getElementById('off-node-backend');
        if (beEl2) { beEl2.setAttribute('opacity','1'); beEl2.style.filter = 'drop-shadow(0 0 8px #ef4444)'; }
        // Protocol badges dim
        var plBg2 = document.getElementById('off-proto-left-bg'); if (plBg2) { plBg2.setAttribute('fill','#e2e8f0'); plBg2.setAttribute('opacity','0.3'); }
        var pl2 = document.getElementById('off-proto-left'); if (pl2) pl2.setAttribute('fill','#94a3b8');
        var prBg2 = document.getElementById('off-proto-right-bg'); if (prBg2) { prBg2.setAttribute('fill','#e2e8f0'); prBg2.setAttribute('opacity','0.3'); }
        var pr2 = document.getElementById('off-proto-right'); if (pr2) pr2.setAttribute('fill','#94a3b8');
        // Modification icons — all crossed out
        ['off-mod-ssl-icon','off-mod-body-icon','off-mod-xff-icon','off-mod-hdr-icon'].forEach(function(id) { var el = document.getElementById(id); if (el) { el.textContent = '\u2717'; el.setAttribute('fill','#ef4444'); } });
        ['off-mod-ssl','off-mod-body','off-mod-xff','off-mod-hdr'].forEach(function(id) { var el = document.getElementById(id); if (el) { el.setAttribute('fill','#94a3b8'); el.style.textDecoration = 'line-through'; } });
        // VIP status
        var vs2 = document.getElementById('off-vip-status'); if (vs2) vs2.textContent = 'BYPASSED';
        // Host label
        var hl2 = document.getElementById('off-host-label'); if (hl2) { hl2.textContent = 'Host: ?'; hl2.setAttribute('fill','#94a3b8'); }
        // Client label
        var cl2 = document.getElementById('off-client-label'); if (cl2) cl2.textContent = 'https://' + host;
        // Backend label
        var bl2 = document.getElementById('off-backend-label'); if (bl2) bl2.textContent = 'HTTPS direct \u2014 no mods';
        // Bypass label bright
        var byl2 = document.getElementById('off-bypass-label'); if (byl2) { byl2.setAttribute('fill','#ef4444'); byl2.setAttribute('opacity','1'); }
        // Phase pill
        var phase2 = document.getElementById('off-phase-text');
        if (phase2) phase2.textContent = '#' + _offReqCount + ' BYPASS \u2192 ' + host + ' \u2014 no modifications \u2014 ' + sc;
        var phaseBg2 = document.getElementById('off-phase-bg'); if (phaseBg2) phaseBg2.setAttribute('fill','#fee2e2');
        // Status text
        var st2 = document.getElementById('off-status-text');
        if (st2) { st2.textContent = '#' + _offReqCount + ' Bypass \u2014 direct to server, no offloading \u2014 ' + sc; st2.style.color = '#ef4444'; }
    }

    // HTTP badge (shared)
    var badge = document.getElementById('off-http-badge');
    var badgeBg = document.getElementById('off-http-badge-bg');
    if (badge) { badge.textContent = sc + (sc === 200 ? ' OK' : ''); badge.setAttribute('fill', sc === 200 ? '#10b981' : '#ef4444'); }
    if (badgeBg) { badgeBg.setAttribute('fill', sc === 200 ? '#ecfdf5' : '#fef2f2'); badgeBg.setAttribute('opacity','1'); }

    // Request counter
    var rc = document.getElementById('off-req-count'); if (rc) rc.textContent = _offReqCount;

    // History dot
    var strip = document.getElementById('off-history-strip');
    if (strip) {
        var dot = document.createElement('span');
        dot.className = 'gslb-history-dot';
        dot.style.background = isAlteon ? '#3b82f6' : '#ef4444';
        dot.title = '#' + _offReqCount + ': ' + (isAlteon ? 'Via Alteon' : 'Bypass') + ' \u2014 ' + sc;
        strip.appendChild(dot);
        while (strip.children.length > 20) strip.removeChild(strip.firstChild);
    }
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
            updateOffFlow({ mode: 'alteon', status_code: data.status_code, target_host: data.target_host || 'scenario2.radware.lab' });
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-same-origin allow-scripts';
            iframe.style.cssText = 'width:100%;height:820px;border:1px solid #555;border-radius:4px;margin-top:8px;background:#fff;';
            iframe.srcdoc = buildIframeDocument(data.body_html || '', window.location.origin + '/', 'HTTP/1.1');
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
            updateOffFlow({ mode: 'bypass', status_code: data.status_code, target_host: data.target_host || 'site-a-servers.radware.lab' });
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-same-origin allow-scripts';
            iframe.style.cssText = 'width:100%;height:820px;border:1px solid #555;border-radius:4px;margin-top:8px;background:#fff;';
            iframe.srcdoc = buildIframeDocument(data.body_html || '', window.location.origin + '/', 'HTTP/1.1');
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
        updateOffFlow({ mode: 'alteon', status_code: data.page_status_code, target_host: 'scenario2.radware.lab', custom_header_name: data.header_name, custom_header_value: data.header_value });
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
        iframe.srcdoc = buildIframeDocument(data.body_html || '', window.location.origin + '/', 'HTTP/1.1');
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

// ═══════════════ Content-Switching Flow Diagram ═══════════════
const CS_ENV_MAP = {
    'dev':  { nodeId:'cs-node-dev',  countId:'cs-dev-count',  pctId:'cs-dev-pct',  pathId:'cs-path-dev',  color:'#7c3aed', arrId:'cs-arr-dev'  },
    'stg':  { nodeId:'cs-node-stg',  countId:'cs-stg-count',  pctId:'cs-stg-pct',  pathId:'cs-path-stg',  color:'#b45309', arrId:'cs-arr-stg'  },
    'prod': { nodeId:'cs-node-prod', countId:'cs-prod-count', pctId:'cs-prod-pct', pathId:'cs-path-prod', color:'#16a34a', arrId:'cs-arr-prod' }
};
const CS_ALL_PATHS = ['cs-path-dev','cs-path-stg','cs-path-prod'];
let _csCounts = { dev:0, stg:0, prod:0 }, _csTotal = 0;

function initCsFlow() {
    _csCounts = { dev:0, stg:0, prod:0 }; _csTotal = 0;
    // Reset client path
    var cv = document.getElementById('cs-path-cv');
    if (cv) { cv.setAttribute('stroke','#cbd5e1'); cv.setAttribute('stroke-width','2'); cv.setAttribute('opacity','0.3'); cv.setAttribute('marker-end','url(#cs-arr-idle)'); cv.classList.remove('gslb-path-active'); }
    // Reset backend paths
    CS_ALL_PATHS.forEach(function(id) { var el = document.getElementById(id); if (!el) return; el.setAttribute('stroke','#cbd5e1'); el.setAttribute('stroke-width','1.5'); el.setAttribute('opacity','0.15'); el.setAttribute('marker-end','url(#cs-arr-idle)'); el.classList.remove('gslb-path-active'); });
    // Reset nodes
    ['cs-node-vip','cs-node-dev','cs-node-stg','cs-node-prod'].forEach(function(id) { var el = document.getElementById(id); if (!el) return; el.setAttribute('opacity','0.45'); el.style.filter = ''; });
    // Reset counters
    Object.values(CS_ENV_MAP).forEach(function(e) { var c = document.getElementById(e.countId); if (c) c.textContent = '0'; var p = document.getElementById(e.pctId); if (p) p.textContent = '\u2014'; });
    // Reset labels
    var hl = document.getElementById('cs-host-label'); if (hl) hl.textContent = 'Host: ?';
    var cl = document.getElementById('cs-client-label'); if (cl) cl.textContent = '\u2014';
    var vs = document.getElementById('cs-vip-status'); if (vs) vs.textContent = '\u2014';
    var badge = document.getElementById('cs-http-badge'); if (badge) { badge.textContent = '\u2014'; badge.setAttribute('fill','#94a3b8'); }
    var badgeBg = document.getElementById('cs-http-badge-bg'); if (badgeBg) { badgeBg.setAttribute('fill','#e2e8f0'); badgeBg.setAttribute('opacity','0.5'); }
    var phase = document.getElementById('cs-phase-text'); if (phase) phase.textContent = 'Click a button to send a request\u2026';
    var phaseBg = document.getElementById('cs-phase-bg'); if (phaseBg) phaseBg.setAttribute('fill','#e2e8f0');
    var st = document.getElementById('cs-status-text'); if (st) { st.textContent = 'Click a button below to animate the content-switching flow.'; st.style.color = '#64748b'; }
    var strip = document.getElementById('cs-history-strip'); if (strip) strip.innerHTML = '';
}

function updateCsFlow(data) {
    if (!data || !data.env) return;
    var envKey = data.env;
    var env = CS_ENV_MAP[envKey];
    if (!env) return;
    _csTotal++;
    _csCounts[envKey] = (_csCounts[envKey] || 0) + 1;
    var host = data.host || '';
    var scheme = data.scheme || 'http';
    var sc = data.status_code || 0;
    var targetIp = data.target_ip || '';

    // Reset all paths & nodes
    var cv = document.getElementById('cs-path-cv');
    if (cv) { cv.setAttribute('stroke','#cbd5e1'); cv.setAttribute('stroke-width','2'); cv.setAttribute('opacity','0.3'); cv.setAttribute('marker-end','url(#cs-arr-idle)'); cv.classList.remove('gslb-path-active'); }
    CS_ALL_PATHS.forEach(function(id) { var el = document.getElementById(id); if (!el) return; el.setAttribute('stroke','#cbd5e1'); el.setAttribute('stroke-width','1.5'); el.setAttribute('opacity','0.15'); el.setAttribute('marker-end','url(#cs-arr-idle)'); el.classList.remove('gslb-path-active'); });
    ['cs-node-vip','cs-node-dev','cs-node-stg','cs-node-prod'].forEach(function(id) { var el = document.getElementById(id); if (!el) return; el.setAttribute('opacity','0.45'); el.style.filter = ''; });

    // Activate Controller → VIP
    if (cv) { cv.setAttribute('stroke','#f59e0b'); cv.setAttribute('stroke-width','2.5'); cv.setAttribute('opacity','1'); cv.setAttribute('marker-end','url(#cs-arr-req)'); cv.classList.add('gslb-path-active'); }
    var vipEl = document.getElementById('cs-node-vip');
    if (vipEl) { vipEl.setAttribute('opacity','1'); vipEl.style.filter = 'drop-shadow(0 0 8px #3b82f6)'; }

    // Activate VIP → Backend
    var pathEl = document.getElementById(env.pathId);
    if (pathEl) { pathEl.setAttribute('stroke', env.color); pathEl.setAttribute('stroke-width','2.5'); pathEl.setAttribute('opacity','1'); pathEl.setAttribute('marker-end','url(#' + env.arrId + ')'); pathEl.classList.add('gslb-path-active'); }
    var nodeEl = document.getElementById(env.nodeId);
    if (nodeEl) { nodeEl.setAttribute('opacity','1'); nodeEl.style.filter = 'drop-shadow(0 0 8px ' + env.color + ')'; }

    // Host header label
    var hl = document.getElementById('cs-host-label'); if (hl) { hl.textContent = 'Host: ' + host.toLowerCase(); hl.setAttribute('fill', env.color); }

    // Counters
    Object.entries(CS_ENV_MAP).forEach(function(pair) {
        var k = pair[0], e = pair[1];
        var n = _csCounts[k] || 0;
        var c = document.getElementById(e.countId); if (c) c.textContent = n;
        var p = document.getElementById(e.pctId); if (p) p.textContent = _csTotal > 0 ? Math.round(n / _csTotal * 100) + '%' : '\u2014';
    });

    // VIP status
    var vs = document.getElementById('cs-vip-status'); if (vs) vs.textContent = scheme.toUpperCase() + ' \u2192 ' + envKey.toUpperCase();

    // Client label
    var cl = document.getElementById('cs-client-label'); if (cl) cl.textContent = scheme + '://' + host.toLowerCase();

    // HTTP badge
    var badge = document.getElementById('cs-http-badge');
    var badgeBg = document.getElementById('cs-http-badge-bg');
    if (badge) { badge.textContent = sc + (sc === 200 ? ' OK' : ''); badge.setAttribute('fill', sc === 200 ? '#10b981' : '#ef4444'); }
    if (badgeBg) { badgeBg.setAttribute('fill', sc === 200 ? '#ecfdf5' : '#fef2f2'); badgeBg.setAttribute('opacity','1'); }

    // Phase pill
    var phase = document.getElementById('cs-phase-text'); if (phase) phase.textContent = '#' + _csTotal + ' ' + scheme.toUpperCase() + ' \u2192 ' + host.toLowerCase() + ' \u2192 ' + envKey.toUpperCase() + ' \u2014 ' + sc;
    var phaseBg = document.getElementById('cs-phase-bg'); if (phaseBg) phaseBg.setAttribute('fill','#fef3c7');

    // Status text
    var st = document.getElementById('cs-status-text');
    if (st) { st.textContent = '#' + _csTotal + ' ' + scheme + '://' + host.toLowerCase() + ' \u2192 ' + envKey.toUpperCase() + ' (' + targetIp + ') \u2014 ' + sc; st.style.color = env.color; }

    // History dot
    var strip = document.getElementById('cs-history-strip');
    if (strip) {
        var dot = document.createElement('span');
        dot.className = 'gslb-history-dot';
        dot.style.background = env.color;
        dot.title = '#' + _csTotal + ': ' + host.toLowerCase() + ' \u2192 ' + envKey.toUpperCase();
        strip.appendChild(dot);
        while (strip.children.length > 20) strip.removeChild(strip.firstChild);
    }
}

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
        updateCsFlow(data);
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

// ═══════════════ HTTP/2 Gateway Flow Diagram ═══════════════
let _h2ReqCount = 0;

function initH2Flow() {
    _h2ReqCount = 0;
    var cv = document.getElementById('h2-path-cv');
    if (cv) { cv.setAttribute('stroke','#cbd5e1'); cv.setAttribute('stroke-width','2'); cv.setAttribute('opacity','0.3'); cv.setAttribute('marker-end','url(#h2-arr-idle)'); cv.classList.remove('gslb-path-active'); }
    var vb = document.getElementById('h2-path-vb');
    if (vb) { vb.setAttribute('stroke','#cbd5e1'); vb.setAttribute('stroke-width','2'); vb.setAttribute('opacity','0.3'); vb.setAttribute('marker-end','url(#h2-arr-idle)'); vb.classList.remove('gslb-path-active'); }
    ['h2-node-vip','h2-node-backend'].forEach(function(id) { var el = document.getElementById(id); if (!el) return; el.setAttribute('opacity','0.45'); el.style.filter = ''; });
    var hl = document.getElementById('h2-host-label'); if (hl) { hl.textContent = 'Host: ?'; hl.setAttribute('fill','#94a3b8'); }
    var cl = document.getElementById('h2-client-label'); if (cl) cl.textContent = '\u2014';
    var vs = document.getElementById('h2-vip-status'); if (vs) vs.textContent = 'TLS termination + multiplexing';
    var vi = document.getElementById('h2-vip-ip'); if (vi) vi.textContent = '\u2014';
    var bi = document.getElementById('h2-backend-ip'); if (bi) bi.textContent = '\u2014';
    var badge = document.getElementById('h2-http-badge'); if (badge) { badge.textContent = '\u2014'; badge.setAttribute('fill','#94a3b8'); }
    var badgeBg = document.getElementById('h2-http-badge-bg'); if (badgeBg) { badgeBg.setAttribute('fill','#e2e8f0'); badgeBg.setAttribute('opacity','0.5'); }
    var phase = document.getElementById('h2-phase-text'); if (phase) phase.textContent = 'Click the button to send an HTTP/2 request\u2026';
    var phaseBg = document.getElementById('h2-phase-bg'); if (phaseBg) phaseBg.setAttribute('fill','#e2e8f0');
    var rc = document.getElementById('h2-req-count'); if (rc) rc.textContent = '0';
    var st = document.getElementById('h2-status-text'); if (st) { st.textContent = 'Click the button below to animate the HTTP/2 gateway flow.'; st.style.color = '#64748b'; }
    var strip = document.getElementById('h2-history-strip'); if (strip) strip.innerHTML = '';
}

function updateH2Flow(data) {
    if (!data) return;
    _h2ReqCount++;
    var sc = data.status_code || 0;
    var proto = data.protocol_version || 'HTTP/1.1';
    var host = data.target_host || 'scenario4.radware.lab';
    var clientProto = proto; // curl now reports actual HTTP/2

    // Reset paths
    var cv = document.getElementById('h2-path-cv');
    if (cv) { cv.setAttribute('stroke','#cbd5e1'); cv.setAttribute('stroke-width','2'); cv.setAttribute('opacity','0.3'); cv.setAttribute('marker-end','url(#h2-arr-idle)'); cv.classList.remove('gslb-path-active'); }
    var vb = document.getElementById('h2-path-vb');
    if (vb) { vb.setAttribute('stroke','#cbd5e1'); vb.setAttribute('stroke-width','2'); vb.setAttribute('opacity','0.3'); vb.setAttribute('marker-end','url(#h2-arr-idle)'); vb.classList.remove('gslb-path-active'); }
    ['h2-node-vip','h2-node-backend'].forEach(function(id) { var el = document.getElementById(id); if (!el) return; el.setAttribute('opacity','0.45'); el.style.filter = ''; });

    // Activate Client → VIP (green, HTTP/2)
    if (cv) { cv.setAttribute('stroke','#16a34a'); cv.setAttribute('stroke-width','2.5'); cv.setAttribute('opacity','1'); cv.setAttribute('marker-end','url(#h2-arr-h2)'); cv.classList.add('gslb-path-active'); }

    // Activate VIP → Backend (orange, HTTP/1.1)
    if (vb) { vb.setAttribute('stroke','#f59e0b'); vb.setAttribute('stroke-width','2.5'); vb.setAttribute('opacity','1'); vb.setAttribute('marker-end','url(#h2-arr-h1)'); vb.classList.add('gslb-path-active'); }

    // Glow VIP + Backend
    var vipEl = document.getElementById('h2-node-vip');
    if (vipEl) { vipEl.setAttribute('opacity','1'); vipEl.style.filter = 'drop-shadow(0 0 8px #3b82f6)'; }
    var beEl = document.getElementById('h2-node-backend');
    if (beEl) { beEl.setAttribute('opacity','1'); beEl.style.filter = 'drop-shadow(0 0 8px #f59e0b)'; }

    // Host label
    var hl = document.getElementById('h2-host-label'); if (hl) { hl.textContent = 'Host: ' + host; hl.setAttribute('fill','#16a34a'); }
    var cl = document.getElementById('h2-client-label'); if (cl) cl.textContent = 'https://' + host;

    // VIP status
    var vs = document.getElementById('h2-vip-status');
    if (vs) vs.textContent = clientProto + ' \u2192 HTTP/1.1 translated';

    // Protocol badges
    var pc = document.getElementById('h2-proto-client'); if (pc) pc.textContent = clientProto;

    // Counter
    var rc = document.getElementById('h2-req-count'); if (rc) rc.textContent = _h2ReqCount;

    // HTTP badge
    var badge = document.getElementById('h2-http-badge');
    var badgeBg = document.getElementById('h2-http-badge-bg');
    if (badge) { badge.textContent = sc + (sc === 200 ? ' OK' : ''); badge.setAttribute('fill', sc === 200 ? '#10b981' : '#ef4444'); }
    if (badgeBg) { badgeBg.setAttribute('fill', sc === 200 ? '#ecfdf5' : '#fef2f2'); badgeBg.setAttribute('opacity','1'); }

    // Phase pill
    var phase = document.getElementById('h2-phase-text');
    if (phase) phase.textContent = '#' + _h2ReqCount + ' HTTPS \u2192 ' + host + ' \u2014 ' + clientProto + ' \u2192 HTTP/1.1 \u2014 ' + sc;
    var phaseBg = document.getElementById('h2-phase-bg'); if (phaseBg) phaseBg.setAttribute('fill','#dcfce7');

    // Status text
    var st = document.getElementById('h2-status-text');
    if (st) { st.textContent = '#' + _h2ReqCount + ' https://' + host + ' — ' + clientProto + ' gateway \u2192 HTTP/1.1 backend \u2014 ' + sc; st.style.color = '#16a34a'; }

    // History dot
    var strip = document.getElementById('h2-history-strip');
    if (strip) {
        var dot = document.createElement('span');
        dot.className = 'gslb-history-dot';
        dot.style.background = sc === 200 ? '#16a34a' : '#ef4444';
        dot.title = '#' + _h2ReqCount + ': ' + clientProto + ' \u2192 HTTP/1.1 \u2014 ' + sc;
        strip.appendChild(dot);
        while (strip.children.length > 20) strip.removeChild(strip.firstChild);
    }
}

function loadHttp2Gateway() {
    var resultsContent = document.getElementById('results-content');
    if (!resultsContent) return;
    var btn = document.getElementById('h2-send-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Loading\u2026'; }
    resultsContent.innerHTML = '<p>Loading\u2026</p>';

    fetch('/api/scenario/http2_gateway')
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-lightning-charge"></i> Send HTTPS Request \u2192 scenario4.radware.lab'; }
        if (!data.success) {
            resultsContent.innerHTML = '<p class="error">Error: ' + escapeHtml(data.error) + '</p>';
            return;
        }
        updateH2Flow(data);
        var proto = data.protocol_version || 'HTTP/1.1';
        var label = document.createElement('p');
        label.style.cssText = 'margin:0 0 6px 0;font-size:13px;';
        label.innerHTML = '<span style="display:inline-block;padding:2px 10px;border-radius:12px;background:#16a34a;color:#fff;font-size:12px;font-weight:700;">HTTP/2 \u2192 HTTP/1.1</span> https://<strong>' + escapeHtml(data.target_host) + '</strong> \u2014 Status ' + escapeHtml(String(data.status_code));
        resultsContent.innerHTML = '';
        resultsContent.appendChild(label);
        resultsContent.appendChild(createResponseIframe(data));
    })
    .catch(function(err) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-lightning-charge"></i> Send HTTPS Request \u2192 scenario4.radware.lab'; }
        resultsContent.innerHTML = '<p class="error">Request failed: ' + escapeHtml(err.message) + '</p>';
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

function toggleTopoPanel(header) {
    var body = document.getElementById('topo-collapsible');
    var arrow = header.querySelector('.collapsible-arrow');
    if (body.style.display === 'none') {
        body.style.display = 'block';
        arrow.classList.remove('bi-chevron-right');
        arrow.classList.add('bi-chevron-down');
    } else {
        body.style.display = 'none';
        arrow.classList.remove('bi-chevron-down');
        arrow.classList.add('bi-chevron-right');
    }
}

function showDiagramTab(btn, viewId) {
    document.querySelectorAll('.dview').forEach(function(d) { d.style.display = 'none'; });
    document.querySelectorAll('.dtab').forEach(function(t) { t.classList.remove('dtab-active'); });
    document.getElementById(viewId).style.display = 'block';
    btn.classList.add('dtab-active');
}

// ── Diagram Lightbox (full-screen expand) ─────────────────────────────────────
function openDiagramLightbox(svgId, title) {
    var src = document.getElementById(svgId);
    if (!src) return;
    var svg = src.tagName === 'svg' ? src : src.querySelector('svg');
    if (!svg) return;
    var clone = svg.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.width = '100%';
    clone.style.maxHeight = 'calc(92vh - 80px)';
    clone.style.height = 'auto';
    var body = document.getElementById('diagram-lightbox-body');
    body.innerHTML = '';
    body.appendChild(clone);
    document.getElementById('diagram-lightbox-title').textContent = title || '';
    document.getElementById('diagram-lightbox-backdrop').classList.add('open');
    document.getElementById('diagram-lightbox').classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closeDiagramLightbox() {
    document.getElementById('diagram-lightbox-backdrop').classList.remove('open');
    document.getElementById('diagram-lightbox').classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function() {
        document.getElementById('diagram-lightbox-body').innerHTML = '';
    }, 300);
}
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeDiagramLightbox();
});

// ── Health Monitor ────────────────────────────────────────────────────────────
function pollHealth() {
    fetch('/api/health')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            Object.keys(data).forEach(function(ip) {
                var val = data[ip];
                var status = (typeof val === 'object') ? val.status : val;
                var haState = (typeof val === 'object') ? (val.ha_state || null) : null;

                // Update quick-link-card dots (existing)
                document.querySelectorAll('.quick-link-card[data-ip="' + ip + '"] .health-dot').forEach(function(dot) {
                    dot.classList.remove('up', 'down');
                    if (status === 'up') dot.classList.add('up');
                    else if (status === 'down') dot.classList.add('down');
                });

                // Update top bar dot
                var barItem = document.querySelector('.htb-item[data-htb-ip="' + ip + '"]');
                if (barItem) {
                    var barDot = barItem.querySelector('.htb-dot');
                    if (barDot) {
                        barDot.classList.remove('up', 'down');
                        if (status === 'up') barDot.classList.add('up');
                        else if (status === 'down') barDot.classList.add('down');
                    }
                }

                // Update HA badge
                if (haState) {
                    var badgeId = ip === '10.100.0.51' ? 'ha-badge-51' : (ip === '10.100.0.52' ? 'ha-badge-52' : null);
                    if (badgeId) {
                        var badge = document.getElementById(badgeId);
                        if (badge) {
                            var hsLower = haState.toLowerCase();
                            badge.className = 'htb-ha-badge';
                            if (hsLower === 'master') { badge.classList.add('master'); badge.textContent = 'MASTER'; }
                            else if (hsLower === 'backup') { badge.classList.add('standby'); badge.textContent = 'STANDBY'; }
                            else { badge.classList.add(hsLower); badge.textContent = haState.toUpperCase(); }
                        }
                    }
                }
            });
        })
        .catch(function() {});
}
pollHealth();
setInterval(pollHealth, 30000);
