import os
from flask import Flask, send_from_directory, request
from flask_cors import CORS
# Removido: geração e download de arquivos (DOCX/ZIP)
import time

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Estado simples em memória para gatilho de criação de passo
trigger_state = { 'ts': 0, 'x': None, 'y': None }


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory('.', path)


@app.route('/health')
def health():
    return {'status': 'ok'}


# Removido: rotas de exportação (DOCX/ZIP)

@app.route('/trigger-add-step', methods=['POST'])
def trigger_add_step():
    global trigger_state
    payload = request.get_json(silent=True) or {}
    x = payload.get('x')
    y = payload.get('y')
    trigger_state['ts'] = int(time.time() * 1000)
    trigger_state['x'] = x if isinstance(x, (int, float)) else None
    trigger_state['y'] = y if isinstance(y, (int, float)) else None
    return { 'ok': True, **trigger_state }

@app.route('/trigger-state', methods=['GET'])
def trigger_state():
    return trigger_state


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8010))
    app.run(host='0.0.0.0', port=port)
