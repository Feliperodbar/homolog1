"""
Servidor Flask para captura de tela e documentação de passos de teste.

Endpoints:
  GET  /          - Serve index.html
  GET  /health    - Verifica saúde da aplicação
  POST /trigger-add-step - Registra trigger para adicionar passo
  GET  /trigger-state    - Retorna estado do último trigger
"""

import os
import logging
from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
import time

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='.', static_url_path='')

# Configurar CORS com restrições básicas (melhorar em produção)
CORS(app, resources={
    r"/trigger-*": {"origins": ["localhost", "127.0.0.1"]},
    r"/health": {"origins": "*"}
})

# Estado simples em memória para gatilho de criação de passo
_trigger_state = {
    'ts': 0,
    'x': None,
    'y': None
}


@app.route('/')
def index():
    """Serve o arquivo HTML principal."""
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def static_proxy(path):
    """Serve arquivos estáticos (CSS, JS, imagens)."""
    return send_from_directory('.', path)


@app.route('/health')
def health():
    """Verifica saúde da aplicação."""
    return jsonify({'status': 'ok', 'timestamp': int(time.time() * 1000)})


def _is_valid_coordinate(value):
    """Valida se é um número válido para coordenada."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


@app.route('/trigger-add-step', methods=['POST'])
def trigger_add_step():
    """
    Registra um novo trigger para adicionar passo.
    
    Payload esperado:
    {
        "x": <número opcional>,
        "y": <número opcional>
    }
    
    Resposta:
    {
        "ok": true,
        "ts": <timestamp_ms>,
        "x": <x ou null>,
        "y": <y ou null>
    }
    """
    try:
        payload = request.get_json(silent=True) or {}
        
        # Validar e extrair coordenadas
        x = payload.get('x')
        y = payload.get('y')
        
        # Apenas aceitar números válidos
        if x is not None and not _is_valid_coordinate(x):
            x = None
        if y is not None and not _is_valid_coordinate(y):
            y = None
        
        # Atualizar estado global
        _trigger_state['ts'] = int(time.time() * 1000)
        _trigger_state['x'] = x
        _trigger_state['y'] = y
        
        logger.info(f"Trigger registrado: ts={_trigger_state['ts']}, x={x}, y={y}")
        
        return jsonify({
            'ok': True,
            'ts': _trigger_state['ts'],
            'x': x,
            'y': y
        })
    
    except Exception as e:
        logger.error(f"Erro ao processar /trigger-add-step: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 400


@app.route('/trigger-state', methods=['GET'])
def get_trigger_state():
    """Retorna o estado atual do último trigger."""
    return jsonify(_trigger_state)


@app.errorhandler(404)
def not_found(error):
    """Redireciona 404 para index.html (para suporte a SPA)."""
    return send_from_directory('.', 'index.html'), 200


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8010))
    debug = os.environ.get('FLASK_ENV') == 'development'
    logger.info(f"Iniciando servidor na porta {port} (debug={debug})")
    app.run(host='0.0.0.0', port=port, debug=debug)
