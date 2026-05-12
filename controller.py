from flask import Flask, render_template, request, jsonify, Response, stream_with_context
import json
import re
import subprocess
import time
from urllib.parse import quote, urljoin

import dns.resolver
import requests
import urllib3
from requests.auth import HTTPBasicAuth

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)

GSLB_TARGET_HOST = 'app1.radware.lab'
HA_TARGET_HOST = 'app2.radware.lab'
REDIRECT_TARGET_HOST = 'scenario2.radware.lab'
BYPASS_TARGET_HOST = 'site-a-servers.radware.lab'
DNS_SERVER = '10.100.1.30'
ALTEON_1_MGMT_IP = '10.100.0.51'
ALTEON_AUTH = HTTPBasicAuth('admin', 'admin')
ALTEON_HTTPMOD_AUTH = HTTPBasicAuth('radware', 'Radware1!')
ALTEON_TIMEOUT = 2
HA_PORTS = (1, 2, 3)
PACKET_CAPTURE_INTERFACE = 'any'
PACKET_CAPTURE_COUNT = 12
PACKET_CAPTURE_FILTER = 'host {target_ip} and (tcp port 80 or tcp port 443)'
SUDO_PASSWORD = 'radware5?'


def build_request_headers(target_host):
    return {
        'Host': target_host,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    }


def build_backend_resource_url(target_ip, target_host, path, scheme='http'):
    normalized_path = urljoin('/', path or '/')
    return (
        f'/api/backend_resource?target_ip={quote(target_ip)}'
        f'&target_host={quote(target_host)}'
        f'&scheme={quote(scheme)}'
        f'&path={quote(normalized_path, safe="/")}'
    )


def rewrite_relative_resource_urls(body_html, target_ip, target_host, scheme='http'):
    if not body_html or not target_ip or not target_host:
        return body_html

    def replace_attr(match):
        attr_name = match.group(1)
        original_value = match.group(2)

        if (
            original_value.startswith('http://')
            or original_value.startswith('https://')
            or original_value.startswith('data:')
            or original_value.startswith('mailto:')
            or original_value.startswith('#')
            or original_value.startswith('javascript:')
        ):
            return match.group(0)

        proxy_url = build_backend_resource_url(target_ip, target_host, original_value, scheme=scheme)
        return f'{attr_name}="{proxy_url}"'

    return re.sub(r'(src|href|action)="([^"]+)"', replace_attr, body_html, flags=re.IGNORECASE)


def format_http_version(response):
    raw_version = getattr(getattr(response, 'raw', None), 'version', None)
    version_map = {
        9: 'HTTP/0.9',
        10: 'HTTP/1.0',
        11: 'HTTP/1.1',
        20: 'HTTP/2'
    }
    return version_map.get(raw_version, 'HTTP/1.1')


def extract_backend_marker(body_html, label):
    pattern = (
        rf'<tr>\s*<td[^>]*>\s*{re.escape(label)}\s*</td>'
        rf'\s*<td[^>]*class="info-value"[^>]*>(.*?)</td>\s*</tr>'
    )
    match = re.search(pattern, body_html or '', re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    value = re.sub(r'<[^>]+>', '', match.group(1))
    value = re.sub(r'\s+', ' ', value).strip()
    return value or None


def build_resolver():
    resolver = dns.resolver.Resolver(configure=False)
    resolver.nameservers = [DNS_SERVER]
    resolver.port = 53
    resolver.cache = None
    resolver.timeout = 3
    resolver.lifetime = 3
    return resolver


def fetch_target_attempt(attempt, target_host):
    result = {
        'attempt': attempt,
        'timestamp': int(time.time())
    }

    try:
        answers = build_resolver().resolve(target_host, 'A')
        ips = [rdata.address for rdata in answers]
        result['resolved_records'] = ips
        if not ips:
            result['dns_error'] = 'No A records returned'
            return result

        chosen_ip = ips[0]
        result['target_ip'] = chosen_ip

        try:
            response = requests.get(
                f'http://{chosen_ip}/index.php',
                headers=build_request_headers(target_host),
                timeout=5,
                allow_redirects=True
            )
            body_html = response.text
            result.update({
                'status_code': response.status_code,
                'protocol_version': format_http_version(response),
                'final_url': response.url,
                'body_html': rewrite_relative_resource_urls(body_html, chosen_ip, target_host),
                'served_by': extract_backend_marker(body_html, 'Served By'),
                'server_name': extract_backend_marker(body_html, 'Server'),
                'server_ip': extract_backend_marker(body_html, 'Server IP'),
                'wanlink': extract_backend_marker(body_html, 'Wanlink')
            })
        except Exception as exc:
            result['http_error'] = str(exc)
    except Exception as exc:
        result['dns_error'] = str(exc)

    return result


def run_gslb_rr_demo():
    attempt_count = 3
    dns_checks = []
    http_results = []
    unique_ips = set()

    for attempt in range(1, attempt_count + 1):
        result = fetch_target_attempt(attempt, GSLB_TARGET_HOST)
        if result.get('dns_error'):
            dns_checks.append({'attempt': attempt, 'error': result['dns_error']})
            http_results.append({
                'attempt': attempt,
                'error': f"DNS query failed: {result['dns_error']}"
            })
            continue

        ips = result.get('resolved_records', [])
        dns_checks.append({'attempt': attempt, 'records': ips})
        for ip in ips:
            unique_ips.add(ip)

        if result.get('http_error'):
            http_results.append({
                'attempt': attempt,
                'target_ip': result.get('target_ip'),
                'resolved_records': ips,
                'error': result['http_error']
            })
            continue

        http_results.append({
            'attempt': attempt,
            'target_ip': result.get('target_ip'),
            'resolved_records': ips,
            'status_code': result.get('status_code'),
            'protocol_version': result.get('protocol_version'),
            'final_url': result.get('final_url'),
            'body_html': result.get('body_html'),
            'served_by': result.get('served_by'),
            'server_name': result.get('server_name'),
            'server_ip': result.get('server_ip'),
            'wanlink': result.get('wanlink')
        })

    warning = None
    if len(unique_ips) < attempt_count:
        warning = (
            f'Observed {len(unique_ips)} unique A record(s) across {attempt_count} attempts. '
            'Controller-side DNS cache is bypassed per attempt, but upstream DNS behavior may still return the same order.'
        )

    return {
        'success': True,
        'message': 'Round Robin Global Load Balancing executed from controller (HTTP only)',
        'target_host': GSLB_TARGET_HOST,
        'dns_server': DNS_SERVER,
        'attempt_count': attempt_count,
        'dns_checks': dns_checks,
        'dns_options': sorted(unique_ips),
        'http_results': http_results,
        'warning': warning
    }


def alteon_port_api_url(port_number):
    return f'https://{ALTEON_1_MGMT_IP}/config/AgPortOperTable/{port_number}/'


def set_alteon_port_state(port_number, state):
    try:
        response = requests.put(
            alteon_port_api_url(port_number),
            auth=ALTEON_AUTH,
            json={'PortOperState': str(state)},
            timeout=ALTEON_TIMEOUT,
            verify=False
        )
        ok = 200 <= response.status_code < 300
        return {
            'port': port_number,
            'requested_state': str(state),
            'success': ok,
            'status_code': response.status_code,
            'response_body': (response.text or '')[:200]
        }
    except Exception as exc:
        return {
            'port': port_number,
            'requested_state': str(state),
            'success': False,
            'error': str(exc)
        }


def run_ha_action(action_name, target_state):
    port_results = [set_alteon_port_state(port_number, target_state) for port_number in HA_PORTS]
    success_count = sum(1 for result in port_results if result.get('success'))
    total_count = len(port_results)
    all_succeeded = success_count == total_count

    if action_name == 'failover':
        summary = 'Failover command sent to Alteon 1. Links 1, 2, and 3 were instructed to go down.'
    else:
        summary = 'Restore command sent to Alteon 1. Links 1, 2, and 3 were instructed to return to service.'

    if not all_succeeded:
        summary = f'{summary} {success_count}/{total_count} API calls succeeded.'

    return {
        'success': all_succeeded,
        'action': action_name,
        'message': summary,
        'alteon_ip': ALTEON_1_MGMT_IP,
        'ports': port_results,
        'target_host': HA_TARGET_HOST
    }


def resolve_target_ip(target_host):
    answers = build_resolver().resolve(target_host, 'A')
    ips = [rdata.address for rdata in answers]
    if not ips:
        raise ValueError(f'No A records returned for {target_host}')
    return ips[0], ips


def fetch_redirect_proof():
    target_ip, resolved_records = resolve_target_ip(REDIRECT_TARGET_HOST)
    request_headers = build_request_headers(REDIRECT_TARGET_HOST)
    include_packets = request.args.get('include_packets') in {'1', 'true', 'yes'}

    packet_trace_lines = []
    packet_capture_error = None
    tcpdump_process = None

    try:
        if include_packets:
            capture_command = [
                'sudo', '-S', '-p', '',
                'tcpdump',
                '-ni', PACKET_CAPTURE_INTERFACE,
                '-l',
                '-nn',
                '-tttt',
                '-c', str(PACKET_CAPTURE_COUNT),
                PACKET_CAPTURE_FILTER.format(target_ip=target_ip)
            ]
            tcpdump_process = subprocess.Popen(
                capture_command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True
            )
            if tcpdump_process.stdin:
                tcpdump_process.stdin.write(f'{SUDO_PASSWORD}\n')
                tcpdump_process.stdin.flush()
            time.sleep(0.5)

        http_response = requests.get(
            f'http://{target_ip}/index.php',
            headers=request_headers,
            timeout=5,
            allow_redirects=False
        )
        redirect_location = http_response.headers.get('Location')

        https_response = requests.get(
            f'https://{target_ip}/index.php',
            headers=request_headers,
            timeout=5,
            allow_redirects=True,
            verify=False
        )

        if include_packets:
            time.sleep(0.5)
    finally:
        if tcpdump_process is not None:
            try:
                tcpdump_output, _ = tcpdump_process.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                tcpdump_process.terminate()
                try:
                    tcpdump_output, _ = tcpdump_process.communicate(timeout=2)
                except subprocess.TimeoutExpired:
                    tcpdump_process.kill()
                    tcpdump_output, _ = tcpdump_process.communicate()

            packet_trace_lines = [
                line.strip()
                for line in (tcpdump_output or '').splitlines()
                if line.strip()
            ]
            if tcpdump_process.returncode not in (0, 124, 143) and not packet_trace_lines:
                packet_capture_error = 'tcpdump did not return usable output'

    http_exchange_lines = [
        f'GET /index.php HTTP/1.1',
        f'Host: {REDIRECT_TARGET_HOST}',
        f'Cache-Control: no-cache',
        f'Pragma: no-cache',
        '',
        f'{format_http_version(http_response)} {http_response.status_code} {http_response.reason}',
        f'Location: {redirect_location or "n/a"}',
        '',
        f'TLS follow-up: GET https://{target_ip}/index.php with Host: {REDIRECT_TARGET_HOST}',
        f'{format_http_version(https_response)} {https_response.status_code} {https_response.reason}',
        f'Final URL: {https_response.url}'
    ]

    return {
        'success': True,
        'target_host': REDIRECT_TARGET_HOST,
        'target_ip': target_ip,
        'resolved_records': resolved_records,
        'source_url': f'http://{REDIRECT_TARGET_HOST}/index.php',
        'redirect_status_code': http_response.status_code,
        'redirect_location': redirect_location,
        'destination_url': f'https://{REDIRECT_TARGET_HOST}/index.php',
        'final_status_code': https_response.status_code,
        'final_url': https_response.url,
        'http_exchange_lines': http_exchange_lines,
        'packet_trace_lines': packet_trace_lines,
        'packet_capture_error': packet_capture_error
    }


def fetch_redirect_page():
    target_ip, _ = resolve_target_ip(REDIRECT_TARGET_HOST)
    response = requests.get(
        f'https://{target_ip}/index.php',
        headers=build_request_headers(REDIRECT_TARGET_HOST),
        timeout=5,
        allow_redirects=True,
        verify=False
    )
    body_html = rewrite_relative_resource_urls(
        response.text,
        target_ip,
        REDIRECT_TARGET_HOST,
        scheme='https'
    )
    return body_html, target_ip, response.status_code



@app.route('/api/scenario/offloading/data')
def offloading_data():
    """Fetch scenario2.radware.lab via HTTPS and return body + response headers for offloading demo."""
    try:
        target_ip, _ = resolve_target_ip(REDIRECT_TARGET_HOST)
        response = requests.get(
            f'https://{target_ip}/index.php',
            headers=build_request_headers(REDIRECT_TARGET_HOST),
            timeout=5,
            allow_redirects=True,
            verify=False
        )
        body_html = rewrite_relative_resource_urls(
            response.text,
            target_ip,
            REDIRECT_TARGET_HOST,
            scheme='https'
        )
        # Collect response headers (skip hop-by-hop)
        skip = {'transfer-encoding', 'connection', 'keep-alive', 'te', 'trailers', 'upgrade'}
        headers_list = [
            {'name': k, 'value': v}
            for k, v in response.headers.items()
            if k.lower() not in skip
        ]
        return jsonify({
            'success': True,
            'target_host': REDIRECT_TARGET_HOST,
            'status_code': response.status_code,
            'body_html': body_html,
            'response_headers': headers_list
        })
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 502


@app.route('/api/scenario/offloading/bypass')
def offloading_bypass():
    """Fetch site-a-servers.radware.lab directly (bypassing Alteon) and return body HTML."""
    try:
        target_ip, _ = resolve_target_ip(BYPASS_TARGET_HOST)
        response = requests.get(
            f'https://{target_ip}/index.php',
            headers=build_request_headers(BYPASS_TARGET_HOST),
            timeout=5,
            allow_redirects=True,
            verify=False
        )
        body_html = rewrite_relative_resource_urls(
            response.text,
            target_ip,
            BYPASS_TARGET_HOST,
            scheme='https'
        )
        return jsonify({
            'success': True,
            'target_host': BYPASS_TARGET_HOST,
            'status_code': response.status_code,
            'body_html': body_html
        })
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 502

@app.route('/api/scenario/gslb_rr/stream')
def gslb_rr_stream():
    def generate():
        attempt = 0
        while True:
            attempt += 1
            yield f"data: {json.dumps(fetch_target_attempt(attempt, GSLB_TARGET_HOST))}\n\n"
            time.sleep(3)

    return Response(
        stream_with_context(generate()),
        content_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )


@app.route('/api/scenario/ha_failover/start', methods=['POST'])
def ha_failover_start():
    return jsonify({
        'success': True,
        'message': 'HA failover monitoring started. Alteon 1 is expected to begin as the active unit.',
        'target_host': HA_TARGET_HOST,
        'dns_server': DNS_SERVER,
        'alteon_primary_ip': ALTEON_1_MGMT_IP,
        'ports': list(HA_PORTS)
    })


@app.route('/api/scenario/ha_failover/failover', methods=['POST'])
def ha_failover_trigger():
    return jsonify(run_ha_action('failover', 2))


@app.route('/api/scenario/ha_failover/restore', methods=['POST'])
def ha_failover_restore():
    return jsonify(run_ha_action('restore', 1))


@app.route('/api/backend_resource')
def backend_resource():
    target_ip = request.args.get('target_ip', '').strip()
    target_host = request.args.get('target_host', '').strip()
    path = request.args.get('path', '/').strip() or '/'
    scheme = request.args.get('scheme', 'http').strip().lower() or 'http'

    if not target_ip or not target_host:
        return Response('Missing target parameters', status=400)
    if scheme not in ('http', 'https'):
        return Response('Unsupported scheme', status=400)

    if not path.startswith('/'):
        path = '/' + path

    upstream_url = f'{scheme}://{target_ip}{path}'
    upstream_headers = build_request_headers(target_host)

    try:
        upstream_response = requests.get(
            upstream_url,
            headers=upstream_headers,
            timeout=5,
            allow_redirects=True,
            verify=(scheme == 'http')
        )
    except Exception as exc:
        return Response(f'Upstream fetch failed: {exc}', status=502)

    passthrough_headers = {}
    content_type = upstream_response.headers.get('Content-Type')
    cache_control = upstream_response.headers.get('Cache-Control')
    if content_type:
        passthrough_headers['Content-Type'] = content_type
    if cache_control:
        passthrough_headers['Cache-Control'] = cache_control

    return Response(
        upstream_response.content,
        status=upstream_response.status_code,
        headers=passthrough_headers
    )


@app.route('/api/scenario/http_redirect/proof')
def http_redirect_proof():
    try:
        return jsonify(fetch_redirect_proof())
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 502


@app.route('/api/scenario/http_redirect/page')
def http_redirect_page():
    try:
        body_html, target_ip, status_code = fetch_redirect_page()
    except Exception as exc:
        return Response(f'Unable to fetch HTTPS page: {exc}', status=502)

    html_document = (
        '<!doctype html><html><head>'
        '<meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '</head><body>'
        f'{body_html}'
        '</body></html>'
    )
    return Response(
        html_document,
        status=status_code,
        headers={
            'Content-Type': 'text/html; charset=utf-8',
            'X-Redirect-Target-IP': target_ip
        }
    )


@app.route('/api/scenario/ha_failover/stream')
def ha_failover_stream():
    def generate():
        attempt = 0
        while True:
            attempt += 1
            result = fetch_target_attempt(attempt, HA_TARGET_HOST)
            result['scenario'] = 'ha_failover'
            yield f"data: {json.dumps(result)}\n\n"
            time.sleep(3)

    return Response(
        stream_with_context(generate()),
        content_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/dns_lookup', methods=['POST'])
def dns_lookup():
    data = request.get_json()
    domain = data.get('domain', 'example.com')
    try:
        answers = dns.resolver.resolve(domain, 'A')
        records = [str(rdata) for rdata in answers]
        return jsonify({'success': True, 'records': records})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)})


@app.route('/api/scenario/<scenario_id>', methods=['POST'])
def execute_scenario(scenario_id):
    if scenario_id == 'gslb_rr':
        return jsonify(run_gslb_rr_demo())

    scenarios = {
        'dns': 'DNS lookup executed',
        'header_injection': 'HTTP Header Injection scenario simulated',
        'body_modification': 'HTTP Body Modification scenario simulated',
        'compression': 'Compression Offloading scenario simulated',
        'content_based': 'Content Based Load Balancing scenario simulated',
        'http2': 'HTTP2 Gateway scenario simulated',
        'analytics': 'Advanced Analytics scenario simulated',
        'ha': 'Local and Global High Availability executed',
        'direct': 'Browse Directly to Web Server executed',
        'body_mod': 'HTTP Body Modification executed',
        'http_content': 'HTTP Content Based Rules executed',
        'https_content': 'HTTPS Content Based Rules executed'
    }
    message = scenarios.get(scenario_id, 'Unknown scenario')
    return jsonify({'success': True, 'message': message})


@app.route('/api/scenario/offloading/set_header', methods=['POST'])
def offloading_set_header():
    """Update Alteon HTTP mod rule header name/value, apply config, then fetch page."""
    import re as _re
    data = request.get_json(force=True, silent=True) or {}
    header_name = str(data.get('header_name', '')).strip()
    header_value = str(data.get('header_value', '')).strip()

    # Validate header name: printable ASCII, no control chars or separators
    if not header_name:
        return jsonify({'success': False, 'error': 'header_name is required'}), 400
    if len(header_name) > 64:
        return jsonify({'success': False, 'error': 'header_name too long (max 64)'}), 400
    if not _re.match(r'^[A-Za-z0-9\-_]+$', header_name):
        return jsonify({'success': False, 'error': 'header_name must contain only letters, digits, hyphens or underscores'}), 400
    if len(header_value) > 256:
        return jsonify({'success': False, 'error': 'header_value too long (max 256)'}), 400

    alteon_base = f'https://{ALTEON_1_MGMT_IP}'
    rule_url = f'{alteon_base}/config/Layer7NewCfgHttpmodRuleTable/Scenario2/10'
    hdr_url = f'{alteon_base}/config/Layer7NewCfgHttpmodRuleHdrTable/Scenario2/10'
    apply_url = f'{alteon_base}/config?action=apply'

    try:
        # Step 1: Ensure rule direction is Request (Directn=1)
        requests.put(rule_url, auth=ALTEON_HTTPMOD_AUTH,
                     json={'Directn': 1}, timeout=5, verify=False)

        # Step 2: Update the header name/value on Alteon
        put_resp = requests.put(
            hdr_url,
            auth=ALTEON_HTTPMOD_AUTH,
            json={'Insert': header_name, 'Value': header_value},
            timeout=5,
            verify=False
        )
        alteon_ok = 200 <= put_resp.status_code < 300 and '"ok"' in put_resp.text
        if not alteon_ok:
            return jsonify({
                'success': False,
                'error': f'Alteon PUT failed (HTTP {put_resp.status_code})',
                'alteon_raw': put_resp.text[:500]
            }), 502

        # Step 2: Apply the pending config
        apply_resp = requests.post(
            apply_url,
            auth=ALTEON_HTTPMOD_AUTH,
            timeout=10,
            verify=False
        )
        apply_ok = '"ok"' in apply_resp.text

        # Step 3: Fetch the page through Alteon and return body
        import time as _time
        _time.sleep(1)  # brief pause for apply to take effect
        target_ip, _ = resolve_target_ip(REDIRECT_TARGET_HOST)
        page_resp = requests.get(
            f'https://{target_ip}/index.php',
            headers=build_request_headers(REDIRECT_TARGET_HOST),
            timeout=8,
            allow_redirects=True,
            verify=False
        )
        body_html = rewrite_relative_resource_urls(
            page_resp.text,
            target_ip,
            REDIRECT_TARGET_HOST,
            scheme='https'
        )

        return jsonify({
            'success': True,
            'header_name': header_name,
            'header_value': header_value,
            'alteon_status_code': put_resp.status_code,
            'apply_ok': apply_ok,
            'apply_raw': apply_resp.text[:200],
            'page_status_code': page_resp.status_code,
            'body_html': body_html
        })

    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 502


CONTENT_SWITCH_HOSTS = {
    'Scenario3-dev.radware.lab': 'dev',
    'Scenario3-stg.radware.lab': 'stg',
    'Scenario3.radware.lab':     'prod',
}

@app.route('/api/scenario/content_switch', methods=['POST'])
def content_switch():
    """Fetch content-switching VIP with the given Host header, return body HTML."""
    data = request.get_json(force=True, silent=True) or {}
    host = str(data.get('host', '')).strip()
    scheme = str(data.get('scheme', 'http')).strip().lower()
    if host not in CONTENT_SWITCH_HOSTS:
        return jsonify({'success': False, 'error': f'Unknown host: {host}'}), 400
    if scheme not in ('http', 'https'):
        scheme = 'http'
    try:
        target_ip, _ = resolve_target_ip(host)
        response = requests.get(
            f'{scheme}://{target_ip}/index.php',
            headers=build_request_headers(host),
            timeout=8,
            allow_redirects=True,
            verify=False
        )
        body_html = rewrite_relative_resource_urls(
            response.text,
            target_ip,
            host,
            scheme=scheme
        )
        return jsonify({
            'success': True,
            'host': host,
            'scheme': scheme,
            'env': CONTENT_SWITCH_HOSTS[host],
            'target_ip': target_ip,
            'status_code': response.status_code,
            'body_html': body_html
        })
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 502


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
