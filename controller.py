from flask import Flask, render_template, request, jsonify, Response, stream_with_context
from flask_socketio import SocketIO, emit
import json
import re
import subprocess
import time
import threading
from urllib.parse import quote, urljoin

import dns.resolver
import requests
import urllib3
import paramiko
from requests.auth import HTTPBasicAuth

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins='*')

GSLB_TARGET_HOST = 'app1.radware.lab'
HA_TARGET_HOST = 'app2.radware.lab'
REDIRECT_TARGET_HOST = 'scenario2.radware.lab'
BYPASS_TARGET_HOST = 'site-a-servers.radware.lab'
HTTP2_TARGET_HOST = 'scenario4.radware.lab'
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
        msg = str(exc)
        if 'lifetime expired' in msg or 'timed out' in msg.lower():
            result['dns_error'] = 'DNS timeout'
        elif 'NXDOMAIN' in msg:
            result['dns_error'] = 'DNS: domain not found'
        elif 'NoAnswer' in msg or 'no A records' in msg.lower():
            result['dns_error'] = 'DNS: no A records'
        elif 'NoNameservers' in msg:
            result['dns_error'] = 'DNS: no nameservers available'
        else:
            result['dns_error'] = 'DNS error'

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
    """Fetch scenario2.radware.lab via HTTPS using curl and return body + response headers."""
    try:
        target_ip, _ = resolve_target_ip(REDIRECT_TARGET_HOST)
        result = subprocess.run(
            [
                'curl', '-sk', '-L',
                '-D', '/dev/stderr',
                '-o', '/dev/stdout',
                '-w', '\n__CURL_META__%{http_code}',
                '-H', f'Host: {REDIRECT_TARGET_HOST}',
                '-H', 'Cache-Control: no-cache',
                '-H', 'Pragma: no-cache',
                f'https://{target_ip}/index.php'
            ],
            capture_output=True, text=True, timeout=10
        )
        output = result.stdout
        meta_marker = '__CURL_META__'
        if meta_marker in output:
            body_part, meta_part = output.rsplit(meta_marker, 1)
            status_code = int(meta_part.strip())
        else:
            body_part = output
            status_code = 0
        body_html = rewrite_relative_resource_urls(
            body_part, target_ip, REDIRECT_TARGET_HOST, scheme='https'
        )
        # Parse response headers from stderr (last header block after redirects)
        skip = {'transfer-encoding', 'connection', 'keep-alive', 'te', 'trailers', 'upgrade'}
        headers_list = []
        raw_headers = result.stderr
        blocks = raw_headers.split('HTTP/')
        if len(blocks) > 1:
            last_block = blocks[-1]
            for line in last_block.splitlines()[1:]:
                if ':' in line:
                    name, _, value = line.partition(':')
                    name, value = name.strip(), value.strip()
                    if name and name.lower() not in skip:
                        headers_list.append({'name': name, 'value': value})
        served_by = ''
        xff = ''
        for h in headers_list:
            hn = h['name'].lower()
            if hn == 'server' and not served_by:
                served_by = h['value']
            elif hn == 'x-served-by':
                served_by = h['value']
            elif hn == 'x-forwarded-for':
                xff = h['value']
        return jsonify({
            'success': True,
            'target_host': REDIRECT_TARGET_HOST,
            'status_code': status_code,
            'body_html': body_html,
            'response_headers': headers_list,
            'served_by': served_by,
            'xff': xff
        })
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 502


@app.route('/api/scenario/offloading/bypass')
def offloading_bypass():
    """Fetch site-a-servers.radware.lab directly (bypassing Alteon) using curl."""
    try:
        target_ip, _ = resolve_target_ip(BYPASS_TARGET_HOST)
        result = subprocess.run(
            [
                'curl', '-sk', '-L',
                '-D', '/dev/stderr',
                '-o', '/dev/stdout',
                '-w', '\n__CURL_META__%{http_code}',
                '-H', f'Host: {BYPASS_TARGET_HOST}',
                '-H', 'Cache-Control: no-cache',
                '-H', 'Pragma: no-cache',
                f'https://{target_ip}/index.php'
            ],
            capture_output=True, text=True, timeout=10
        )
        output = result.stdout
        meta_marker = '__CURL_META__'
        if meta_marker in output:
            body_part, meta_part = output.rsplit(meta_marker, 1)
            status_code = int(meta_part.strip())
        else:
            body_part = output
            status_code = 0
        body_html = rewrite_relative_resource_urls(
            body_part, target_ip, BYPASS_TARGET_HOST, scheme='https'
        )
        served_by = ''
        raw_headers = result.stderr
        blocks = raw_headers.split('HTTP/')
        if len(blocks) > 1:
            last_block = blocks[-1]
            for line in last_block.splitlines()[1:]:
                if ':' in line:
                    name, _, value = line.partition(':')
                    name, value = name.strip(), value.strip()
                    if name.lower() == 'server' and not served_by:
                        served_by = value
                    elif name.lower() == 'x-served-by':
                        served_by = value
        return jsonify({
            'success': True,
            'target_host': BYPASS_TARGET_HOST,
            'status_code': status_code,
            'body_html': body_html,
            'served_by': served_by
        })
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 502

@app.route('/api/scenario/gslb_rr/stream')
def gslb_rr_stream():
    max_attempts = request.args.get('max', 10, type=int)
    def generate():
        attempt = 0
        while attempt < max_attempts:
            attempt += 1
            yield f"data: {json.dumps(fetch_target_attempt(attempt, GSLB_TARGET_HOST))}\n\n"
            time.sleep(3)
        yield f"data: {json.dumps({'done': True, 'total': attempt})}\n\n"

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
        while attempt < 10:
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


@app.route('/api/health')
def health_check():
    from concurrent.futures import ThreadPoolExecutor, as_completed
    targets = {
        '10.100.0.51': 'https', '10.100.0.52': 'https', '10.100.0.100': 'https',
        '10.100.0.10': 'http', '10.100.0.20': 'http', '10.100.0.200': 'https',
        '10.100.0.101': 'https', '10.100.0.102': 'https'
    }
    ha_targets = {'10.100.0.51', '10.100.0.52'}

    def check(ip, scheme):
        try:
            requests.get(f'{scheme}://{ip}/', timeout=2, verify=False)
            return ip, 'up'
        except Exception:
            return ip, 'down'

    def check_ha(ip):
        try:
            r = requests.get(f'https://{ip}/config/haSwitchInfoState',
                             auth=ALTEON_AUTH, timeout=3, verify=False)
            if r.status_code == 200:
                body = r.json()
                state_val = body.get('haSwitchInfoState', '')
                ha_map = {'1': 'Init', '2': 'Master', '3': 'Backup', '4': 'Holdoff'}
                return ip, ha_map.get(str(state_val), str(state_val))
            return ip, None
        except Exception:
            return ip, None

    results = {}
    with ThreadPoolExecutor(max_workers=10) as pool:
        health_futures = {pool.submit(check, ip, scheme): ip for ip, scheme in targets.items()}
        ha_futures = {pool.submit(check_ha, ip): ip for ip in ha_targets}
        for f in as_completed(health_futures):
            ip, status = f.result()
            results[ip] = status
        ha_states = {}
        for f in as_completed(ha_futures):
            ip, state = f.result()
            if state:
                ha_states[ip] = state
    for ip in ha_targets:
        status = results.get(ip, 'down')
        results[ip] = {'status': status}
        if ip in ha_states:
            results[ip]['ha_state'] = ha_states[ip]
    return jsonify(results)


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

        # Step 3: Fetch the page through Alteon using curl and return body
        import time as _time
        _time.sleep(1)  # brief pause for apply to take effect
        target_ip, _ = resolve_target_ip(REDIRECT_TARGET_HOST)
        page_result = subprocess.run(
            [
                'curl', '-sk', '-L',
                '-o', '/dev/stdout',
                '-w', '\n__CURL_META__%{http_code}',
                '-H', f'Host: {REDIRECT_TARGET_HOST}',
                '-H', 'Cache-Control: no-cache',
                '-H', 'Pragma: no-cache',
                f'https://{target_ip}/index.php'
            ],
            capture_output=True, text=True, timeout=10
        )
        page_output = page_result.stdout
        meta_marker = '__CURL_META__'
        if meta_marker in page_output:
            page_body, page_meta = page_output.rsplit(meta_marker, 1)
            page_status = int(page_meta.strip())
        else:
            page_body = page_output
            page_status = 0
        body_html = rewrite_relative_resource_urls(
            page_body, target_ip, REDIRECT_TARGET_HOST, scheme='https'
        )

        return jsonify({
            'success': True,
            'header_name': header_name,
            'header_value': header_value,
            'alteon_status_code': put_resp.status_code,
            'apply_ok': apply_ok,
            'apply_raw': apply_resp.text[:200],
            'page_status_code': page_status,
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


@app.route('/api/scenario/http2_gateway')
def http2_gateway():
    """Fetch scenario4.radware.lab via HTTPS/HTTP2 using curl (which supports HTTP/2 natively)."""
    try:
        target_ip, _ = resolve_target_ip(HTTP2_TARGET_HOST)
        result = subprocess.run(
            [
                'curl', '-sk', '--http2',
                '-o', '/dev/stdout',
                '-w', '\n__CURL_META__%{http_version} %{http_code} %{remote_ip}',
                '-H', f'Host: {HTTP2_TARGET_HOST}',
                '-H', 'Cache-Control: no-cache',
                '-H', 'Pragma: no-cache',
                f'https://{target_ip}/index.php'
            ],
            capture_output=True, text=True, timeout=10
        )
        output = result.stdout
        meta_marker = '__CURL_META__'
        if meta_marker in output:
            body_part, meta_part = output.rsplit(meta_marker, 1)
            parts = meta_part.strip().split()
            http_ver = parts[0] if len(parts) > 0 else '1.1'
            status_code = int(parts[1]) if len(parts) > 1 else 0
            remote_ip = parts[2] if len(parts) > 2 else target_ip
            protocol_version = 'HTTP/2' if http_ver == '2' else f'HTTP/{http_ver}'
        else:
            body_part = output
            status_code = 0
            protocol_version = 'unknown'
            remote_ip = target_ip
        body_html = rewrite_relative_resource_urls(
            body_part, target_ip, HTTP2_TARGET_HOST, scheme='https'
        )
        return jsonify({
            'success': True,
            'target_host': HTTP2_TARGET_HOST,
            'target_ip': remote_ip,
            'status_code': status_code,
            'protocol_version': protocol_version,
            'body_html': body_html
        })
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 502


# ═══════════════════════════════════════════════════════════════
#  Alteon WebUI reverse proxy — strips X-Frame-Options so the
#  GWT-based WebUI can be embedded in an iframe (same-origin).
# ═══════════════════════════════════════════════════════════════

ALTEON_WEBUI_AUTH = HTTPBasicAuth('radware', 'Radware1!')
ALTEON_DEVICES = {
    'alteon1': '10.100.0.51',
    'alteon2': '10.100.0.52',
}

@app.route('/alteon-webui/<device>/', defaults={'subpath': ''}, methods=['GET', 'POST', 'PUT', 'DELETE'])
@app.route('/alteon-webui/<device>/<path:subpath>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def alteon_webui_proxy(device, subpath):
    target_ip = ALTEON_DEVICES.get(device)
    if not target_ip:
        return Response('Unknown device', status=404)

    target_url = f'https://{target_ip}/{subpath}'
    if request.query_string:
        target_url += f'?{request.query_string.decode()}'

    fwd_headers = {
        k: v for k, v in request.headers
        if k.lower() not in ('host', 'authorization', 'content-length')
    }
    fwd_headers['Host'] = target_ip

    try:
        resp = requests.request(
            method=request.method,
            url=target_url,
            auth=ALTEON_WEBUI_AUTH,
            headers=fwd_headers,
            data=request.get_data(),
            verify=False,
            timeout=15,
            allow_redirects=False,
            stream=True,
        )
    except Exception as exc:
        return Response(f'Alteon proxy error: {exc}', status=502)

    # Strip headers that block iframe embedding
    excluded = {
        'x-frame-options', 'content-security-policy',
        'transfer-encoding', 'connection', 'keep-alive',
    }
    headers = {
        k: v for k, v in resp.headers.items()
        if k.lower() not in excluded
    }

    # Rewrite redirect Location to stay within the proxy
    if resp.status_code in (301, 302, 307, 308):
        loc = headers.get('Location', '')
        if loc.startswith('/'):
            headers['Location'] = f'/alteon-webui/{device}{loc}'

    return Response(
        resp.content,
        status=resp.status_code,
        headers=headers,
    )


# ── Traffic Generator Monitor ──────────────────────────────────────────────────
TRAFFIC_GEN_HOST = '10.100.0.30'
TRAFFIC_GEN_USER = 'radware'
TRAFFIC_GEN_PASS = 'radware'
TRAFFIC_GEN_TARGET = '10.100.2.2:444'


@app.route('/api/traffic-generator/status')
def traffic_generator_status():
    import datetime
    result = {
        'running': False,
        'pid': None,
        'active_connections': 0,
        'timewait_connections': 0,
        'target': TRAFFIC_GEN_TARGET,
        'host': TRAFFIC_GEN_HOST,
        'reachable': False,
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'
    }
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(TRAFFIC_GEN_HOST, username=TRAFFIC_GEN_USER,
                       password=TRAFFIC_GEN_PASS, timeout=5)
        result['reachable'] = True

        # Check process
        _, stdout, _ = client.exec_command('pgrep -f "ssl_test.sh"')
        pids = stdout.read().decode().strip().split('\n')
        pids = [p for p in pids if p]
        if pids:
            result['running'] = True
            result['pid'] = int(pids[0])

        # Try PID file
        if not result['pid']:
            _, stdout, _ = client.exec_command('cat /var/run/ssltest.pid 2>/dev/null')
            pid_val = stdout.read().decode().strip()
            if pid_val.isdigit():
                result['pid'] = int(pid_val)

        # Count active connections
        _, stdout, _ = client.exec_command(
            'ss -tn state established dst 10.100.2.2:444 2>/dev/null | tail -n +2 | wc -l')
        val = stdout.read().decode().strip()
        if val.isdigit():
            result['active_connections'] = int(val)

        # Count TIME_WAIT connections
        _, stdout, _ = client.exec_command(
            'ss -tn state time-wait dst 10.100.2.2:444 2>/dev/null | tail -n +2 | wc -l')
        val = stdout.read().decode().strip()
        if val.isdigit():
            result['timewait_connections'] = int(val)

        client.close()
    except Exception:
        pass
    return jsonify(result)


# ═══════════════════════════════════════════════════════════════
#  Interactive SSH Terminal (WebSocket via Flask-SocketIO)
# ═══════════════════════════════════════════════════════════════

TERMINAL_HOSTS = {
    '10.100.0.51': {'user': 'radware', 'passwords': ['Radware1!', 'radware']},
    '10.100.0.52': {'user': 'radware', 'passwords': ['Radware1!', 'radware']},
}

_terminal_sessions = {}


@socketio.on('terminal_connect')
def handle_terminal_connect(data):
    host = data.get('host', '')
    initial_cmd = data.get('initialCmd', [])

    if host not in TERMINAL_HOSTS:
        emit('terminal_output', '\r\n\x1b[31mError: Host not allowed.\x1b[0m\r\n')
        return

    creds = TERMINAL_HOSTS[host]
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    connected = False
    for pw in creds['passwords']:
        try:
            ssh.connect(host, username=creds['user'], password=pw, timeout=8,
                        look_for_keys=False, allow_agent=False)
            connected = True
            break
        except paramiko.AuthenticationException:
            continue
        except Exception as exc:
            emit('terminal_output',
                 f'\r\n\x1b[31mConnection error: {exc}\x1b[0m\r\n')
            return

    if not connected:
        emit('terminal_output',
             '\r\n\x1b[31mAuthentication failed for all credentials.\x1b[0m\r\n')
        return

    channel = ssh.invoke_shell(term='xterm-256color', width=120, height=40)
    channel.settimeout(0.1)

    sid = request.sid
    _terminal_sessions[sid] = {'ssh': ssh, 'channel': channel, 'active': True}

    def read_output():
        while _terminal_sessions.get(sid, {}).get('active'):
            try:
                data = channel.recv(4096)
                if not data:
                    break
                socketio.emit('terminal_output', data.decode('utf-8', errors='replace'), to=sid)
            except Exception:
                time.sleep(0.05)
        socketio.emit('terminal_output', '\r\n\x1b[33m[Session closed]\x1b[0m\r\n', to=sid)

    reader = threading.Thread(target=read_output, daemon=True)
    reader.start()

    # Answer the login confirmation prompt, then send initial commands
    time.sleep(2)
    channel.send('y\n')
    if initial_cmd:
        cmds = initial_cmd if isinstance(initial_cmd, list) else [initial_cmd]
        for cmd in cmds:
            time.sleep(2)
            channel.send(cmd + '\n')


@socketio.on('terminal_input')
def handle_terminal_input(data):
    session = _terminal_sessions.get(request.sid)
    if session and session['active']:
        try:
            session['channel'].send(data)
        except Exception:
            pass


@socketio.on('terminal_resize')
def handle_terminal_resize(data):
    session = _terminal_sessions.get(request.sid)
    if session and session['active']:
        try:
            cols = int(data.get('cols', 120))
            rows = int(data.get('rows', 40))
            session['channel'].resize_pty(width=cols, height=rows)
        except Exception:
            pass


@socketio.on('disconnect')
def handle_disconnect():
    session = _terminal_sessions.pop(request.sid, None)
    if session:
        session['active'] = False
        try:
            session['channel'].close()
        except Exception:
            pass
        try:
            session['ssh'].close()
        except Exception:
            pass


if __name__ == '__main__':
    import ssl as _ssl_mod
    import threading as _threading

    _ssl_ctx = _ssl_mod.SSLContext(_ssl_mod.PROTOCOL_TLS_SERVER)
    _ssl_ctx.load_cert_chain(
        '/home/radware/my-webapp/ssl/radware.crt',
        '/home/radware/my-webapp/ssl/radware.key',
        password='radware'
    )

    def _run_http():
        socketio.run(app, host='0.0.0.0', port=5000, use_reloader=False,
                     debug=False, allow_unsafe_werkzeug=True)

    _http_thread = _threading.Thread(target=_run_http, daemon=True)
    _http_thread.start()
    socketio.run(app, host='0.0.0.0', port=443, ssl_context=_ssl_ctx,
                 use_reloader=False, debug=False, allow_unsafe_werkzeug=True)
