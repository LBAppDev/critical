import Peer, { DataConnection } from 'peerjs';
import { NetworkMessage, Player, GameSession, RoleType, GamePhase } from '../types';
import * as Engine from './engine';
import { INITIAL_SYSTEM_STATE } from '../constants';

const ID_PREFIX = 'ENTROPY-NET-V2-';

export type ConnectionStatus = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'ERROR';
type StateHandler = (session: GameSession, players: Player[]) => void;
type StatusHandler = (status: ConnectionStatus, error?: string) => void;

// --- VIRTUAL SERVER LOGIC (HOST ONLY) ---
class VirtualServer {
  players: Player[] = [];
  session: GameSession;
  
  constructor(lobbyCode: string, hostPlayer: Player) {
    this.players = [hostPlayer];
    this.session = {
      phase: GamePhase.LOBBY,
      round: 1,
      timeRemaining: 90,
      system: JSON.parse(JSON.stringify(INITIAL_SYSTEM_STATE)),
      events: [],
      lobbyCode: lobbyCode
    };
  }

  handleJoin(playerId: string, name: string): Player[] {
    const existing = this.players.find(p => p.id === playerId);
    if (existing) {
      existing.name = name; // Update name
    } else {
      if (this.session.phase !== GamePhase.LOBBY) throw new Error("Game already in progress");
      if (this.players.length >= 8) throw new Error("Lobby full");
      
      this.players.push({
        id: playerId,
        name: name,
        role: null,
        isHost: false
      });
    }
    this.autoAssignRoles();
    return this.players;
  }

  handleStart() {
    this.session.phase = GamePhase.PLAYING;
    this.session.round = 1;
    this.session.timeRemaining = 90;
    return this.session;
  }

  handleAction(actionId: string, playerId: string, targetSectorId?: string) {
    // Logic moved here from App.tsx to centralize "Server" authority
    // We'd import ACTIONS and process it similar to App.tsx
    // For now, we return the session to let App.tsx drive the simulation loop
    // In a full refactor, the simulation loop would live here.
    return { success: true };
  }

  addBot() {
    const id = `BOT-${Math.random().toString(36).substr(2, 5)}`;
    this.players.push({
        id,
        name: `UNIT-${Math.floor(Math.random() * 999)}`,
        role: null,
        isHost: false,
        isBot: true
    });
    this.autoAssignRoles();
    return this.players;
  }

  private autoAssignRoles() {
    const ESSENTIAL = [RoleType.COMMANDER, RoleType.ENGINEER, RoleType.BIO_SEC, RoleType.COMMS];
    const SUPPORT = [RoleType.SECURITY, RoleType.LOGISTICS];
    
    // Clear current roles for re-balancing or keep them? 
    // Let's keep assigned roles and only assign nulls
    const takenRoles = new Set(this.players.map(p => p.role).filter(r => r !== null));
    
    this.players.forEach(p => {
        if (p.role) return;

        let assigned: RoleType | null = null;
        // Try essential first
        for (const r of ESSENTIAL) {
            if (!takenRoles.has(r)) { assigned = r; break; }
        }
        // Then support
        if (!assigned) {
            for (const r of SUPPORT) {
                if (!takenRoles.has(r)) { assigned = r; break; }
            }
        }
        // Fallback
        if (!assigned) assigned = RoleType.SECURITY;

        p.role = assigned;
        takenRoles.add(assigned);
    });
  }
}

// --- NETWORK SERVICE ---
class NetworkService {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null; // For Client
  private connections: Map<string, DataConnection> = new Map(); // For Host
  private server: VirtualServer | null = null;
  
  public isHost: boolean = false;
  public myId: string;
  
  private statusHandlers: StatusHandler[] = [];
  private stateHandlers: StateHandler[] = [];
  private responseWaiters: Map<string, { resolve: (data: any) => void, reject: (err: any) => void }> = new Map();

  constructor() {
    this.myId = 'USER-' + Math.random().toString(36).substr(2, 9).toUpperCase();
  }

  // --- HOST METHODS ---
  
  async createLobby(hostName: string): Promise<string> {
    this.cleanup();
    this.isHost = true;
    this.updateStatus('CONNECTING');

    return new Promise((resolve, reject) => {
      // Generate a Code
      const code = Math.random().toString(36).substring(2, 6).toUpperCase();
      const peerId = `${ID_PREFIX}${code}`;

      console.log(`[HOST] Attempting to bind ID: ${peerId}`);
      
      const peer = new Peer(peerId, { debug: 1 });
      
      peer.on('open', (id) => {
        console.log(`[HOST] Server started on ${id}`);
        this.peer = peer;
        this.server = new VirtualServer(code, { id: this.myId, name: hostName, role: RoleType.COMMANDER, isHost: true });
        
        // Notify local listener immediately
        this.broadcastState();
        this.updateStatus('CONNECTED');
        resolve(code);
      });

      peer.on('connection', (conn) => {
        this.handleIncomingConnection(conn);
      });

      peer.on('error', (err) => {
        console.error('[HOST] Error:', err);
        if (err.type === 'unavailable-id') {
           // Retry logic could go here, but for now just fail
           this.updateStatus('ERROR', 'Lobby code taken. Try again.');
           reject(new Error('Lobby code collision'));
        } else {
           this.updateStatus('ERROR', err.message);
           reject(err);
        }
      });
    });
  }

  hostAddBot() {
      if (!this.isHost || !this.server) return;
      this.server.addBot();
      this.broadcastState();
  }

  // --- CLIENT METHODS ---

  async joinLobby(code: string, playerName: string): Promise<void> {
    this.cleanup();
    this.isHost = false;
    this.updateStatus('CONNECTING');

    return new Promise((resolve, reject) => {
      // Client gets random ID
      const peer = new Peer({ debug: 1 });
      
      peer.on('open', () => {
        this.peer = peer;
        const hostId = `${ID_PREFIX}${code}`;
        console.log(`[CLIENT] Connecting to ${hostId}`);

        const conn = peer.connect(hostId, { reliable: true });
        
        conn.on('open', async () => {
          console.log('[CLIENT] Connection Channel Open');
          this.conn = conn;
          this.setupClientListeners(conn);
          this.updateStatus('CONNECTED');
          
          // Perform RPC Join
          try {
            await this.request('JOIN_REQUEST', { name: playerName, playerId: this.myId });
            resolve();
          } catch (e: any) {
            this.updateStatus('ERROR', e.message || 'Join failed');
            reject(e);
          }
        });

        conn.on('error', (err) => {
            console.error('[CLIENT] Conn Error:', err);
            this.updateStatus('ERROR', 'Could not connect to host');
            reject(err);
        });

        conn.on('close', () => {
            this.updateStatus('ERROR', 'Disconnected from host');
        });
      });

      peer.on('error', (err) => {
         this.updateStatus('ERROR', err.message);
         reject(err);
      });
    });
  }

  // --- RPC INTERFACE ---

  async request(type: 'JOIN_REQUEST' | 'START_REQUEST' | 'ACTION_REQUEST', payload: any): Promise<any> {
     if (this.isHost) {
        // Direct call for Host
        return this.handleHostRequest(type, payload);
     } else {
        // Network call for Client
        if (!this.conn || !this.conn.open) throw new Error("No connection");
        const msgId = Math.random().toString(36);
        
        return new Promise((resolve, reject) => {
           this.responseWaiters.set(msgId, { resolve, reject });
           
           // Timeout
           setTimeout(() => {
              if (this.responseWaiters.has(msgId)) {
                  this.responseWaiters.delete(msgId);
                  reject(new Error("Request timed out"));
              }
           }, 5000);

           this.conn!.send({ type, payload, msgId });
        });
     }
  }

  // --- INTERNAL HANDLING ---

  private handleIncomingConnection(conn: DataConnection) {
      this.connections.set(conn.peer, conn);
      
      conn.on('data', (data: any) => {
          const msg = data as NetworkMessage;
          
          // Request Handling (Host Side)
          if (this.isHost) {
             this.processRequestFromClient(msg, conn);
          }
      });
      
      conn.on('close', () => {
          this.connections.delete(conn.peer);
          // Handle disconnect logic if needed (remove player?)
      });
  }

  private setupClientListeners(conn: DataConnection) {
      conn.on('data', (data: any) => {
          const msg = data as NetworkMessage;

          if (msg.type === 'RESPONSE') {
              const waiter = this.responseWaiters.get(msg.msgId);
              if (waiter) {
                  if (msg.payload.success) waiter.resolve(msg.payload.data);
                  else waiter.reject(new Error(msg.payload.error));
                  this.responseWaiters.delete(msg.msgId);
              }
          } else if (msg.type === 'STATE_UPDATE') {
              this.notifyState(msg.payload.session, msg.payload.players);
          }
      });
  }

  // Mimic Server API Router
  private async processRequestFromClient(msg: NetworkMessage, conn: DataConnection) {
      let responsePayload = { success: false, data: undefined as any, error: undefined as any };
      
      try {
          const result = await this.handleHostRequest(msg.type, msg.payload);
          responsePayload = { success: true, data: result, error: undefined };
      } catch (e: any) {
          responsePayload = { success: false, data: undefined, error: e.message };
      }

      // Send Response
      if ('msgId' in msg) {
          conn.send({ 
              type: 'RESPONSE', 
              payload: responsePayload, 
              msgId: msg.msgId 
          });
      }
  }

  // The "Controller" Logic
  private async handleHostRequest(type: string, payload: any) {
      if (!this.server) throw new Error("Server not ready");

      switch (type) {
          case 'JOIN_REQUEST':
              const players = this.server.handleJoin(payload.playerId, payload.name);
              this.broadcastState(); // Push update to all
              return { players };
          
          case 'START_REQUEST':
              const session = this.server.handleStart();
              this.broadcastState();
              return { session };

          case 'ACTION_REQUEST':
              // In this simplified version, we just let the App drive simulation,
              // but ideally logic is here.
              // For now we just return success to acknowledge receipt.
              return { success: true };
          
          default:
              throw new Error("Unknown Request");
      }
  }

  public broadcastState() {
      if (!this.isHost || !this.server) return;
      
      const payload = { 
          session: this.server.session, 
          players: this.server.players 
      };

      // Notify Local (Host UI)
      this.notifyState(payload.session, payload.players);

      // Notify Clients
      this.connections.forEach(conn => {
          if (conn.open) conn.send({ type: 'STATE_UPDATE', payload });
      });
  }
  
  // App -> Engine Bridge
  // Since we kept simulation in App.tsx for the React loop, we need to allow App to push state updates back to Network
  // so Network can broadcast them.
  public hostPushUpdate(session: GameSession, players: Player[]) {
      if (!this.isHost || !this.server) return;
      this.server.session = session;
      this.server.players = players;
      this.broadcastState();
  }

  // --- EVENTS ---

  onStateUpdate(handler: StateHandler) {
      this.stateHandlers.push(handler);
      // If we already have state, fire immediately
      if (this.server) handler(this.server.session, this.server.players);
      return () => this.stateHandlers = this.stateHandlers.filter(h => h !== handler);
  }

  onStatusChange(handler: StatusHandler) {
      this.statusHandlers.push(handler);
      return () => this.statusHandlers = this.statusHandlers.filter(h => h !== handler);
  }
  
  private notifyState(session: GameSession, players: Player[]) {
      this.stateHandlers.forEach(h => h(session, players));
  }
  
  private updateStatus(status: ConnectionStatus, error?: string) {
      this.statusHandlers.forEach(h => h(status, error));
  }

  private cleanup() {
      if (this.peer) {
          this.peer.destroy();
          this.peer = null;
      }
      this.connections.clear();
      this.server = null;
      this.updateStatus('IDLE');
  }
}

export const network = new NetworkService();