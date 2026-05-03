from flask import Flask, render_template, request, jsonify
import dns.resolver
import subprocess
import json

app = Flask(__name__)

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
        'gslb_rr': 'Round Robin Global Load Balancing executed',
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