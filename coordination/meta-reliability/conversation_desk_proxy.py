"""Loopback-only bridge to the dedicated, fixed-site WSGI test process."""
import argparse
import http.client
import http.server

parser = argparse.ArgumentParser()
parser.add_argument("container_ip")
args = parser.parse_args()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        self.proxy()

    def do_POST(self):
        self.proxy()

    def proxy(self):
        upstream = http.client.HTTPConnection(args.container_ip, 18145, timeout=45)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in {"connection", "accept-encoding"}}
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        try:
            upstream.request(self.command, self.path, body=body, headers=headers)
            response = upstream.getresponse()
            content = response.read()
            self.send_response(response.status)
            for key, value in response.getheaders():
                if key.lower() not in {"transfer-encoding", "connection", "content-length"}:
                    self.send_header(key, value)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except (BrokenPipeError, ConnectionResetError):
            pass  # The proof deliberately drops one committed response.
        finally:
            upstream.close()


http.server.ThreadingHTTPServer(("127.0.0.1", 18146), Handler).serve_forever()
