/**
 * PeliPlus Backend — Entry Point (PROMPT MAESTRO)
 *
 * Express server with Socket.io for real-time upload progress,
 * all module routers, and differentiated rate limiting.
 */
import { Server as SocketIOServer } from 'socket.io';
declare const app: import("express-serve-static-core").Express;
declare const httpServer: import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
declare const io: SocketIOServer<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
import './workers/video.worker';
export { app, httpServer, io };
//# sourceMappingURL=index.d.ts.map