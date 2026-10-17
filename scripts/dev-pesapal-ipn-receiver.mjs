import http from 'node:http'

if (process.env.NODE_ENV === 'production') {
  process.stderr.write('PesaPal test receiver is development-only.\n')
  process.exit(1)
}

const server = http.createServer((request, response) => {
  if (request.url !== '/pesapal-ipn' || !['GET', 'POST'].includes(request.method || '')) {
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end('{"error":"not found"}')
    return
  }

  let size = 0
  request.on('data', (chunk) => {
    size += chunk.length
    if (size > 16_384) request.destroy()
  })
  request.on('end', () => {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end('{"acknowledged":true}')
  })
})

server.listen(3013, '127.0.0.1', () => {
  process.stdout.write('PesaPal sandbox IPN receiver listening on 127.0.0.1:3013/pesapal-ipn\n')
})
