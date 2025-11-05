import base64
import io
import time
import os
from flask import Flask, send_from_directory, request, send_file
from flask_cors import CORS
# Removido: geração de DOCX no backend

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory('.', path)


@app.route('/health')
def health():
    return {'status': 'ok'}


# Removido: rota /export-docx


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8010))
    app.run(host='0.0.0.0', port=port)
