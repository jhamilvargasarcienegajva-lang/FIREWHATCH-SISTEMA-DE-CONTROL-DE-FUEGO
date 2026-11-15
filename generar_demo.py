"""Genera una demostración portátil a partir del código del visor."""
from base64 import b64encode
from mimetypes import guess_type
from pathlib import Path
import argparse
import re


FRONTEND = Path(__file__).resolve().parent / 'docs'


def data_url(path):
    content_type = guess_type(path)[0] or 'application/octet-stream'
    return f'data:{content_type};base64,{b64encode(path.read_bytes()).decode()}'


def inline_styles(match):
    css_path = FRONTEND / match[1]
    css = css_path.read_text(encoding='utf-8')
    css = re.sub(r'url\((?:["\']?)(images/[^)"\']+)(?:["\']?)\)',
                 lambda asset: 'url(' + data_url(css_path.parent / asset[1]) + ')', css)
    css = re.sub(r'/\*# sourceMappingURL=.*?\*/', '', css)
    return '<style>\n' + css + '\n</style>'


def inline_script(name):
    script = (FRONTEND / name).read_text(encoding='utf-8')
    script = re.sub(r'^//# sourceMappingURL=.*$', '', script, flags=re.MULTILINE)
    safe_script = script.replace('</script', '<\\/script')
    return '<script>\n' + safe_script + '\n</script>'


def generate(target):
    content = (FRONTEND / 'index.html').read_text(encoding='utf-8')
    content = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_styles, content)
    scripts = re.findall(r'<script defer src="([^"]+)"></script>', content)
    script_tags = ''.join(inline_script(name) for name in scripts)
    content = re.sub(r'^[ \t]*<script defer src="[^"]+"></script>\n', '', content, flags=re.MULTILINE)
    content = content.replace('firewatch.png', data_url(FRONTEND / 'firewatch.png'))
    content = content.replace('</body>', script_tags+'\n</body>')
    target.write_text(content, encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archivo', nargs='?', type=Path, default=Path('ABRIR_DEMO.html'))
    generate(parser.parse_args().archivo)
