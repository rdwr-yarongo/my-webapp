from flask import Flask, render_template, request, jsonify, Response, stream_with_context
import json
import re
import time

import dns.resolver
import requests
import urllib3
from requests.auth import HTTPBasicAuth

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)

TARGET_HOST = 'app1.radware.lab'
DNS_SERVER = '10.100.1.30'
HTTP_HEADERS = {
    'Host': TARGET_HOST,
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
}
ALTEON_1_MGMT_IP = '10.100.0.51'
ALTEON_AUTH = HTTPBasicAuth('admin', 'admin')
ALTEON_TIMEOUT = 2
HA_PORTS = (1, 2, 3)


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


def fetch_target_attempt(attempt):
    result = {
        'attempt': attempt,
        'timestamp': int(time.time())
    }

    try:
        answers = build_resolver().resolve(TARGET_HOST, 'A')
        ips = [rdata.address for rdata in answers]
        result['resolved_records'] = ips
        if not ips:
            result['dns_error'] = 'No A records returned'
            return result

        chosen_ip = ips[0]
        result['target_ip'] = chosen_ip

        try:
            response = requests.get(
                f'http://{chosen_ip}/',
                headers=HTTP_HEADERS,
                timeout=5,
                allow_redirects=True
            )
            body_html = response.text
            result.update({
                'status_code': response.status_code,
                'protocol_version': format_http_version(response),
                'final_url': response.url,
                'body_html': body_html,
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
        result = fetch_target_attempt(attempt)
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
        'target_host': TARGET_HOST,
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
        'target_host': TARGET_HOST
    }


@app.route('/api/scenario/gslb_rr/stream')
def gslb_rr_stream():
    def generate():
        attempt = 0
        while True:
            attempt += 1
            yield f"data: {json.dumps(fetch_target_attempt(attempt))}\\n\\n"
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
        'target_host': TARGET_HOST,
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


@app.route('/api/scenario/ha_failover/stream')
def ha_failover_stream():
    def generate():
        attempt = 0
        while True:
            attempt += 1
            result = fetch_target_attempt(attempt)
            result['scenario'] = 'ha_failover'
            yield f"data: {json.dumps(result)}\\n\\n"
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


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
