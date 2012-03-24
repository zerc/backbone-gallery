# -*- coding: utf-8 -*-
""" For develop purpose only """
try:
    from http.server import BaseHTTPrequestHandler, HTTPServer # python3
except ImportError:
    from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer # python2
import shutil
import os

class PhotosRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        print self.path
        if self.path.startswith('/media/'):
            path = self.path.replace('/media/', '');

            self.send_response(200);
            self.send_header('content-type', 'text/plain')
            self.end_headers()

            with open(os.path.join(os.path.split(os.path.dirname(os.path.realpath(__file__)))[0], path), 'rb') as f:
                shutil.copyfileobj(f, self.wfile)
        elif self.path.startswith('/example/') or self.path == '/':
            path = self.path.replace('/example/', '').replace('/', 'index.html')
            self.send_response(200);
            self.send_header('content-type', 'text/plain' if self.path.endswith('json') else 'text/html')
            self.end_headers()

            with open(path, 'rb') as f:
                shutil.copyfileobj(f, self.wfile)


server = HTTPServer(("", 8000), PhotosRequestHandler)
server.serve_forever()
