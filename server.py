import base64
import io
import time
import os
from flask import Flask, send_from_directory, request, send_file
from flask_cors import CORS
# Removido: geração de DOCX no backend
import zipfile

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

@app.route('/download-steps-zip', methods=['POST'])
def download_steps_zip():
    data = request.get_json(silent=True) or {}
    steps = data.get('steps', [])

    # Monta ZIP em memória com steps.json e imagens
    out = io.BytesIO()
    with zipfile.ZipFile(out, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
        try:
            import json
            zf.writestr('steps.json', json.dumps(steps, ensure_ascii=False, indent=2))
        except Exception:
            zf.writestr('steps.json', '[]')

        for i, s in enumerate(steps, 1):
            img_data_url = s.get('imageDataUrl')
            if not img_data_url:
                continue
            try:
                header, b64 = img_data_url.split(',', 1)
                img_bytes = base64.b64decode(b64)
                zf.writestr(f'images/step_{i}.png', img_bytes)
            except Exception:
                # Se falhar, coloca um marcador vazio
                zf.writestr(f'images/step_{i}.txt', 'Imagem indisponível')

    out.seek(0)
    filename = f"passos_{int(time.time())}.zip"
    return send_file(
        out,
        mimetype='application/zip',
        as_attachment=True,
        download_name=filename,
    )


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8010))
    app.run(host='0.0.0.0', port=port)
