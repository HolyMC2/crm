"""Loopback-only static/proxy server; no source/config/credential files exposed."""
import http.client
import http.server
import mimetypes
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path('/home/holymc2/muelle-worktrees/crm-standalone-20260909/crm/public/frontend').resolve()
BACKEND = '172.18.0.15'
PREFIX = '/assets/crm/frontend/'

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self): self.handle_request()
    def do_POST(self): self.handle_request()
    def do_PUT(self): self.handle_request()
    def do_DELETE(self): self.handle_request()
    def handle_request(self):
        path = urlsplit(self.path).path
        if path.startswith(PREFIX):
            filename = (ROOT / unquote(path[len(PREFIX):])).resolve()
            if not filename.is_relative_to(ROOT) or not filename.is_file():
                self.send_error(404); return
            body = filename.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', mimetypes.guess_type(filename)[0] or 'application/octet-stream')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        connection = http.client.HTTPConnection(BACKEND,18131,timeout=30)
        headers = {k:v for k,v in self.headers.items() if k.lower() not in {'connection','accept-encoding'}}
        body = self.rfile.read(int(self.headers.get('Content-Length','0')))
        try:
            connection.request(self.command,self.path,body=body,headers=headers)
            response = connection.getresponse(); output = response.read()
            self.send_response(response.status)
            for k,v in response.getheaders():
                if k.lower() not in {'transfer-encoding','connection','content-length'}: self.send_header(k,v)
            self.send_header('Content-Length',str(len(output))); self.end_headers(); self.wfile.write(output)
        finally: connection.close()

http.server.ThreadingHTTPServer(('127.0.0.1',18132),Handler).serve_forever()
