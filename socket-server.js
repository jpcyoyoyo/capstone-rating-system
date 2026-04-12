import { createServer } from 'http';
import { Server } from 'socket.io';

const PORT = process.env.SOCKET_IO_SERVER_PORT || 6001;

const server = createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/emit-progress') {
        let body = '';

        req.on('data', (chunk) => {
            body += chunk;
        });

        req.on('end', () => {
            try {
                const payload = JSON.parse(body || '{}');
                const room = payload.room || null;
                const event = payload.event || 'progress.update';
                const data = payload.data || {};

                if (room) {
                    io.to(room).emit(event, data);
                    console.log(`[Socket.IO] Emitted ${event} to ${room}`);
                } else {
                    io.emit(event, data);
                    console.log(`[Socket.IO] Emitted ${event} to all`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
            } catch (error) {
                console.error('[Socket.IO] Failed to emit progress:', error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: error.message }));
            }
        });

        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'not found' }));
});

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

io.on('connection', (socket) => {
    console.log('[Socket.IO] Client connected:', socket.id);

    socket.on('join', (room) => {
        socket.join(room);
        console.log(`[Socket.IO] Socket ${socket.id} joined room ${room}`);
    });

    socket.on('disconnect', (reason) => {
        console.log('[Socket.IO] Client disconnected:', socket.id, reason);
    });
});

server.listen(PORT, () => {
    console.log(`[Socket.IO] Server listening on port ${PORT}`);
});
