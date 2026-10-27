"""Build the Claude artifact version of Fridge from index.html.

Usage: python3 tools/build-artifact.py OUTPUT.html

The artifact runs the same app code. Inside Claude it uses Claude for AI and the
artifact's shared storage for sync, so the website-only parts are dropped here:
the home-screen app tags, the service worker config file, the Content Security
Policy (the artifact host sets its own) and the Worker settings file.
"""
import re
import sys
from pathlib import Path

src = (Path(__file__).resolve().parent.parent / 'index.html').read_text(encoding='utf-8')
head = re.search(r'<head>\n(.*?)</head>', src, re.S).group(1)
body = re.search(r'<body>\n(.*?)</body>', src, re.S).group(1)

DROP = re.compile(r'^<(meta (charset|name="(viewport|description|apple-[^"]*|mobile-web-app-capable|theme-color|referrer)"|http-equiv)|link rel="(apple-touch-icon|icon|manifest)")')
out = []
for line in head.split('\n'):
    if DROP.match(line.strip()):
        continue
    out.append(line)
    if line.strip().startswith('<title>'):
        out.append('<meta name="claude:viewport-fit-sides" content="cover">')
body = body.replace('<script src="config.js"></script>\n', '')
assert '<script src="config.js">' not in body and 'Content-Security-Policy' not in '\n'.join(out)
Path(sys.argv[1]).write_text('\n'.join(out).strip() + '\n' + body, encoding='utf-8')
print('wrote', sys.argv[1])
