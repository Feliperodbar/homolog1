import requests
import mouse
import time

BASE_URL = 'http://localhost:8010'

def trigger():
    try:
        # Tenta obter posição atual do cursor na tela
        try:
            x, y = mouse.get_position()
        except Exception:
            x, y = None, None
        r = requests.post(f'{BASE_URL}/trigger-add-step', json={'x': x, 'y': y}, timeout=1.5)
        if r.ok:
            print(f"Passo acionado: {r.json().get('ts')}")
        else:
            print('Falha ao acionar passo:', r.status_code)
    except Exception as e:
        print('Erro ao acionar passo:', e)

def main():
    print('Clique com o botão direito para criar um passo.')
    print('Pressione Ctrl+C para sair.')
    mouse.on_right_click(lambda: trigger())
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print('Encerrado.')

if __name__ == '__main__':
    main()
