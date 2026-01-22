import Peer, { DataConnection } from 'peerjs';
import { NetworkMessage, Player, GameSession, RoleType } from '../types';

// Unique prefix to namespace this game on the public PeerJS server
const APP_ID_PREFIX = 'entropy-proto-v1-';

export type ConnectionStatus = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

type MessageHandler = (msg: NetworkMessage) => void;
type StatusHandler = (status: ConnectionStatus, error?: string) => void;

class NetworkService {
  private peer: Peer | null = null;
  private hostConn: DataConnection | null = null; // Client's connection to Host
  private clientConns: Map<string, DataConnection> = new Map(); // Host's connections to Clients
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  
  public isHost: boolean = false;
  public myId: string = '';

  constructor() {
    this.myId = Math.random().toString(36).substr(2, 9);
  }

  // --- PUBLIC API ---

  // Initialize as HOST
  async startHost(playerName: string): Promise<string> {
    this.cleanup();
    this.isHost = true;
    
    return new Promise((resolve, reject) => {
      const code = this.generateLobbyCode();
      const peerId = `${APP_ID_PREFIX}${code}`;

      console.log(`[NET] Starting Host on ID: ${peerId}`);

      try {
        this.peer = new Peer(peerId, { debug: 1 });
      } catch (e) {
        this.cleanup();
        reject(e);
        return;
      }

      this.peer.on('open', (id) => {
        console.log('[NET] Host Peer Open:', id);
        this.updateStatus('CONNECTED');
        resolve(code);
      });

      this.peer.on('connection', (conn) => {
        this.handleIncomingConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('[NET] Host Peer Error:', err);
        this.updateStatus('ERROR', err.message);
        // If ID is taken, we might want to retry with a new code, 
        // but for simplicity we just error out.
        if (err.type === 'unavailable-id') {
           this.updateStatus('ERROR', 'Lobby Code collision. Please try again.');
           reject(new Error('Lobby Code collision'));
        }
      });
      
      this.updateStatus('CONNECTING');
    });
  }

  // Initialize as CLIENT
  async joinGame(code: string, playerName: string): Promise<void> {
    this.cleanup();
    this.isHost = false;

    return new Promise((resolve, reject) => {
      // Create a random peer ID for the client
      this.peer = new Peer({ debug: 1 });

      this.peer.on('open', () => {
        const hostPeerId = `${APP_ID_PREFIX}${code}`;
        console.log(`[NET] Connecting to Host: ${hostPeerId}`);
        
        const conn = this.peer!.connect(hostPeerId, { reliable: true });
        
        conn.on('open', () => {
          console.log('[NET] Connected to Host');
          this.hostConn = conn;
          this.setupConnectionEvents(conn);
          this.updateStatus('CONNECTED');
          
          // Send Handshake
          this.send({ 
            type: 'JOIN_REQUEST', 
            payload: { 
              player: { id: this.myId, name: playerName, role: null, isHost: false },
              code 
            } 
          });
          
          resolve();
        });

        conn.on('error', (err) => {
          console.error('[NET] Connection Error:', err);
          this.updateStatus('ERROR', 'Could not connect to host.');
          reject(err);
        });
        
        // Timeout if connection doesn't establish
        setTimeout(() => {
            if (!this.hostConn) {
                this.updateStatus('ERROR', 'Connection timed out. Check Lobby Code.');
                reject(new Error('Timeout'));
            }
        }, 5000);
      });

      this.peer.on('error', (err) => {
         console.error('[NET] Client Peer Error:', err);
         this.updateStatus('ERROR', err.message);
         reject(err);
      });

      this.updateStatus('CONNECTING');
    });
  }

  send(msg: NetworkMessage) {
    if (this.isHost) {
      // Host broadcasts to all clients
      this.clientConns.forEach(conn => {
        if (conn.open) conn.send(msg);
      });
      // Host also "receives" their own message for local state updates if needed,
      // but usually the app handles local state separately. 
      // Current architecture: App updates local state -> sends to net -> net sends to others.
    } else {
      // Client sends to host
      if (this.hostConn && this.hostConn.open) {
        this.hostConn.send(msg);
      }
    }
  }

  subscribe(handler: MessageHandler) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  onStatusChange(handler: StatusHandler) {
    this.statusHandlers.push(handler);
    return () => {
        this.statusHandlers = this.statusHandlers.filter(h => h !== handler);
    };
  }

  disconnect() {
    this.cleanup();
  }

  // --- INTERNAL ---

  private cleanup() {
    if (this.peer) {
        this.peer.destroy();
        this.peer = null;
    }
    this.hostConn = null;
    this.clientConns.clear();
    this.updateStatus('IDLE');
  }

  private handleIncomingConnection(conn: DataConnection) {
    console.log(`[NET] Incoming connection from ${conn.peer}`);
    
    conn.on('open', () => {
      this.clientConns.set(conn.peer, conn);
      this.setupConnectionEvents(conn);
    });

    conn.on('close', () => {
       console.log(`[NET] Connection closed: ${conn.peer}`);
       this.clientConns.delete(conn.peer);
       // We could emit a PLAYER_LEFT message here if we tracked connection IDs to Player IDs
    });
  }

  private setupConnectionEvents(conn: DataConnection) {
    conn.on('data', (data) => {
      const msg = data as NetworkMessage;
      // console.log('[NET] RX:', msg.type);
      this.messageHandlers.forEach(h => h(msg));
    });
    
    conn.on('error', (err) => {
        console.error('[NET] DataConnection Error:', err);
    });
  }

  private updateStatus(status: ConnectionStatus, error?: string) {
      this.statusHandlers.forEach(h => h(status, error));
  }

  private generateLobbyCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  }
}

export const network = new NetworkService();
export const autoAssignRole = (players: Player[]): RoleType | null => {
    const takenRoles = new Set(players.map(p => p.role));
    
    const ESSENTIAL = [RoleType.COMMANDER, RoleType.ENGINEER, RoleType.BIO_SEC, RoleType.COMMS];
    const SUPPORT = [RoleType.SECURITY, RoleType.LOGISTICS];
    
    for (const role of ESSENTIAL) {
        if (!takenRoles.has(role)) return role;
    }
    for (const role of SUPPORT) {
        if (!takenRoles.has(role)) return role;
    }
    return null;
};
