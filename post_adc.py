from flask import Flask, request, jsonify
import json

app = Flask(__name__)

@app.route('/')
def post_adc():
    # Display request details
    headers = dict(request.headers)
    method = request.method
    url = request.url
    data = request.get_data(as_text=True)
    args = dict(request.args)
    form = dict(request.form)
    
    response = {
        'method': method,
        'url': url,
        'headers': headers,
        'query_params': args,
        'form_data': form,
        'body': data
    }
    return jsonify(response)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)