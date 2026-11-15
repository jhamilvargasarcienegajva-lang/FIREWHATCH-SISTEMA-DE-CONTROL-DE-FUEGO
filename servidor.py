"""Servidor local y consulta de observaciones NASA FIRMS para FireWatch."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import datetime, timezone
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import StringIO
import json
import math
import os
from pathlib import Path
import re
import threading
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
import webbrowser

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'docs'
AREA = (-66.74, -17.56, -65.9, -16.9)
AREA_PATH = ','.join(f'{value:g}' for value in AREA)
FIRMS = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv'
PRODUCTS = ('MODIS_NRT', 'VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT')
SATELLITES = {'VIIRS_SNPP_NRT': 'Suomi-NPP', 'VIIRS_NOAA20_NRT': 'NOAA-20', 'VIIRS_NOAA21_NRT': 'NOAA-21'}


class FirmsError(ValueError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def key_from_request(value):
    if not isinstance(value, str):
        raise FirmsError('La MAP_KEY debe ser texto.')
    local_file = ROOT / '.firms_key'
    key = value.strip() or os.environ.get('FIRMS_MAP_KEY', '').strip()
    if not key and local_file.is_file():
        key = local_file.read_text(encoding='utf-8-sig').strip()
    if not re.fullmatch(r'[0-9a-fA-F]{32}', key):
        raise FirmsError('Introduce una MAP_KEY de NASA FIRMS de 32 caracteres hexadecimales.')
    return key


def download_firms(key, product, days):
    request = Request(f'{FIRMS}/{key}/{product}/{AREA_PATH}/{days}',
                      headers={'User-Agent': 'FireWatch-Bolivia-X/1.0', 'Accept': 'text/csv'})
    try:
        with build_opener(NoRedirect()).open(request, timeout=18) as response:
            raw = response.read(6_000_001)
            if len(raw) > 6_000_000:
                raise FirmsError(f'{product}: respuesta demasiado extensa.')
            text = raw.decode('utf-8-sig')
    except HTTPError as err:
        raise FirmsError(f'{product}: NASA respondió HTTP {err.code}. Revisa la clave, la red o el cupo de consultas.') from None
    except (URLError, TimeoutError, OSError, UnicodeError):
        raise FirmsError(f'{product}: no se pudo leer la respuesta de NASA FIRMS.') from None
    if text.strip().lower().rstrip('.') == 'no data found':
        return []
    reader = csv.DictReader(StringIO(text))
    if not set(reader.fieldnames or ()) >= {'latitude','longitude','acq_date','acq_time'}:
        raise FirmsError(f'{product}: FIRMS no devolvió un CSV válido.')
    return list(reader)


def normalized(product, rows):
    west, south, east, north = AREA
    sensor = product.split('_', 1)[0]
    confidence = {'l': .3, 'n': .7, 'h': .95, 'low': .3, 'nominal': .7, 'high': .95}
    for row in rows:
        try:
            lat, lon = float(row['latitude']), float(row['longitude'])
            if not (west <= lon <= east and south <= lat <= north):
                continue
            raw_time = str(row['acq_time']).strip().zfill(4)
            if not raw_time.isdecimal() or len(raw_time) != 4:
                continue
            acquired = datetime.fromisoformat(row['acq_date']+'T'+raw_time[:2]+':'+raw_time[2:]+':00+00:00').isoformat()
            satellite = (row.get('satellite') or SATELLITES.get(product, '')).strip()
            satellite = {'N':'Suomi-NPP', 'N20':'NOAA-20', 'N21':'NOAA-21', 'T':'Terra', 'A':'Aqua'}.get(satellite, satellite)
            quality_raw = (row.get('confidence') or '').strip().lower()
            quality = confidence.get(quality_raw)
            if quality_raw.isdecimal() and 0 <= int(quality_raw) <= 100:
                quality = int(quality_raw)/100
            frp = float(row['frp']) if row.get('frp') else None
            if frp is not None and not math.isfinite(frp):
                frp = None
        except (ValueError, TypeError, KeyError):
            continue
        yield lat, lon, acquired, sensor, satellite, frp, quality


def query(key, days, downloader=download_firms):
    if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= 5:
        raise FirmsError('Selecciona entre uno y cinco días.')
    with ThreadPoolExecutor(max_workers=len(PRODUCTS)) as pool:
        results = list(pool.map(lambda product: downloader(key, product, days), PRODUCTS))
    counts = {product: len(raw) for product, raw in zip(PRODUCTS, results)}
    detections = {}
    for product, raw in zip(PRODUCTS, results):
        for row in normalized(product, raw):
            detections.setdefault(row[:5], row)
    rows = [[f'FIRMS-{idx:05d}', *row, ''] for idx, row in enumerate(detections.values(),1)]
    return {'rows': rows, 'info': {'box': AREA, 'at': utc_now(), 'days': days, 'counts': counts, 'count': len(rows)}}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def log_message(self, *args):
        return

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        super().end_headers()

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/api/estado':
            return self.send_json(200, {'service':'firewatch-firms'})
        return super().do_GET()

    def do_POST(self):
        if self.path != '/api/firms':
            return self.send_json(404, {'error':'Ruta no disponible.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 4096 or self.headers.get_content_type() != 'application/json':
                raise ValueError
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError
        except (ValueError, UnicodeError):
            return self.send_json(400, {'error':'Solicitud inválida.'})
        try:
            key = key_from_request(body.get('key',''))
            days = body.get('days',2)
            if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= 5:
                raise FirmsError('Selecciona entre uno y cinco días.')
        except (FirmsError,OSError) as err:
            return self.send_json(400, {'error': str(err) if isinstance(err,FirmsError) else 'No se pudo leer la clave local.'})
        try:
            self.send_json(200, query(key, days))
        except FirmsError as err:
            self.send_json(502, {'error':str(err)})

    def list_directory(self, path):
        self.send_error(HTTPStatus.NOT_FOUND)
        return None


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--abrir', action='store_true')
    arguments = parser.parse_args()
    with ThreadingHTTPServer(('127.0.0.1',arguments.port), Handler) as server:
        address = f'http://127.0.0.1:{server.server_port}/'
        print(f'FireWatch Bolivia X · {address} · Ctrl+C para salir', flush=True)
        if arguments.abrir:
            threading.Timer(.5,partial(webbrowser.open,address)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
