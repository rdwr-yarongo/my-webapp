from flask import Flask, render_template, request, jsonify
import dns.resolver
import requests

app = Flask(__name__)


def run_gslb_rr_demo():
    target_host = 'app1.radware.lab'
    dns_server = '10.100.1.30'
    attempt_count = 3
    dns_checks = []
    http_results = []
    unique_ips = set()

    # Each attempt performs a fresh DNS query followed by one HTTP request to the chosen IP.
    for attempt in range(1, attempt_count + 1):
        resolver = dns.resolver.Resolver(configure=False)
        resolver.nameservers = [dns_server]
        resolver.port = 53
        resolver.cache = None
        resolver.timeout = 3
        resolver.lifetime = 3

        try:
            answers = resolver.resolve(target_host, 'A')
            ips = [rdata.address for rdata in answers]
            dns_checks.append({'attempt': attempt, 'records': ips})

            for ip in ips:
                unique_ips.add(ip)

            if not ips:
                http_results.append({
                    'attempt': attempt,
                    'error': 'No A records returned for this attempt'
                })
                continue

            chosen_ip = ips[0]
            headers = {
                'Host': target_host,
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }

            try:
                response = requests.get(
                    f'http://{chosen_ip}/',
                    headers=headers,
                    timeout=5,
                    allow_redirects=True
                )
                preview = ' '.join(response.text.split())[:200]
                http_results.append({
                    'attempt': attempt,
                    'target_ip': chosen_ip,
                    'resolved_records': ips,
                    'status_code': response.status_code,
                    'final_url': response.url,
                    'body_preview': preview
                })
            except Exception as exc:
                http_results.append({
                    'attempt': attempt,
                    'target_ip': chosen_ip,
                    'resolved_records': ips,
                    'error': str(exc)
                })
        except Exception as exc:
            dns_checks.append({'attempt': attempt, 'error': str(exc)})
            http_results.append({
                'attempt': attempt,
                'error': f'DNS query failed: {exc}'
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
        'target_host': target_host,
        'dns_server': dns_server,
        'attempt_count': attempt_count,
        'dns_checks': dns_checks,
        'dns_options': sorted(unique_ips),
        'http_results': http_results,
        'warning': warning
    }

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
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/scenario/<scenario_id>', methods=['POST'])
def execute_scenario(scenario_id):
    if scenario_id == 'gslb_rr':
        return jsonify(run_gslb_rr_demo())

    # Placeholder for scenario execution
    # For now, just return a message
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