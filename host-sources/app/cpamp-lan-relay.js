'use strict';

const net = require('node:net');

const listenPort = Number(process.argv[2] || 8317);
const listenHost = process.argv[3] || '192.168.1.8';
const targetPort = 8317;
const targetHost = '127.0.0.1';

if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
  throw new Error(`Invalid listen port: ${process.argv[2]}`);
}

const server = net.createServer((client) => {
  const upstream = net.createConnection({ host: targetHost, port: targetPort });

  const closeBoth = () => {
    client.destroy();
    upstream.destroy();
  };

  client.setNoDelay(true);
  upstream.setNoDelay(true);
  client.on('error', closeBoth);
  upstream.on('error', closeBoth);
  client.on('close', () => upstream.destroy());
  upstream.on('close', () => client.destroy());
  client.pipe(upstream);
  upstream.pipe(client);
});

server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});

server.listen(listenPort, listenHost, () => {
  console.log(`${listenHost}:${listenPort} -> ${targetHost}:${targetPort}`);
});

