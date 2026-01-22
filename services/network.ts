import { GameSession, Player, RoleType, GamePhase, Action } from '../types';
import { INITIAL_SYSTEM_STATE, ACTIONS } from '../constants';
import * as Engine from './engine';

const STORAGE_KEY_PREFIX = 'entropy_room_';

export type ConnectionStatus = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

// --- MOCK BACKEND SERVER (Running in Browser Memory/LocalStorage) ---
// This allows multiple tabs to see the same state (Local Multiplayer)
class MockServer {
  private getRoomKey(code: string) {
    return `${STORAGE_KEY_PREFIX}${code.toUpperCase()}`;
  }

  private loadRoom(code: string): { session: GameSession, players: Player[] } | null {
    const raw = localStorage.getItem(this.getRoomKey(code));
    return raw ? JSON.parse(raw) : null;
  }

  private saveRoom(code: string, data: { session: GameSession, players: Player[] }) {
    localStorage.setItem(this.getRoomKey(code), JSON.stringify(data));
  }

  // --- API HANDLERS ---

  createRoom(hostName: string): { code: string, playerId: string } {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const playerId = `USER-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const host: Player = {
      id: playerId,
      name: hostName,
      role: RoleType.COMMANDER,
      isHost: true
    };

    const initialState = {
      session: {
        phase: GamePhase.LOBBY,
        round: 1,
        timeRemaining: 90,
        system: JSON.parse(JSON.stringify(INITIAL_SYSTEM_STATE)),
        events: [],
        lobbyCode: code,
        lastTick: Date.now()
      },
      players: [host]
    };

    this.saveRoom(code, initialState);
    return { code, playerId };
  }

  joinRoom(code: string, playerName: string): { code: string, playerId: string } {
    const room = this.loadRoom(code);
    if (!room) throw new Error("Room not found");
    if (room.session.phase !== GamePhase.LOBBY) throw new Error("Game already in progress");

    const playerId = `USER-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const newPlayer: Player = {
      id: playerId,
      name: playerName,
      role: null,
      isHost: false
    };

    room.players.push(newPlayer);
    this.assignRoles(room.players);
    this.saveRoom(code, room);
    return { code, playerId };
  }

  getGameState(code: string, playerId: string): { session: GameSession, players: Player[] } {
    const room = this.loadRoom(code);
    if (!room) throw new Error("Room not found");
    
    // Lazy Simulation Tick
    // Since we don't have a real persistent server process, we update the game state
    // whenever a client requests it, based on how much time passed.
    if (room.session.phase === GamePhase.PLAYING) {
       this.processGameTick(room);
       this.saveRoom(code, room);
    }
    
    return room;
  }

  startGame(code: string): boolean {
    const room = this.loadRoom(code);
    if (!room) return false;
    
    room.session.phase = GamePhase.PLAYING;
    room.session.lastTick = Date.now();
    this.assignRoles(room.players); // Ensure roles are set
    this.saveRoom(code, room);
    return true;
  }

  performAction(code: string, playerId: string, actionId: string, targetSectorId?: string): boolean {
    const room = this.loadRoom(code);
    if (!room) return false;
    if (room.session.phase !== GamePhase.PLAYING) return false;

    // Find Action Config
    const actionDef = ACTIONS.find(a => a.id === actionId);
    if (!actionDef) return false;

    // Apply Action Logic
    room.session.system = Engine.applyAction(room.session.system, actionDef, targetSectorId);
    
    // Save
    this.saveRoom(code, room);
    return true;
  }

  addBot(code: string): boolean {
      const room = this.loadRoom(code);
      if (!room) return false;
      
      const botId = `BOT-${Math.random().toString(36).substr(2, 4)}`;
      room.players.push({
          id: botId,
          name: `UNIT-${Math.floor(Math.random()*100)}`,
          isHost: false,
          isBot: true,
          role: null
      });
      this.assignRoles(room.players);
      this.saveRoom(code, room);
      return true;
  }

  // --- HELPERS ---

  private assignRoles(players: Player[]) {
    const ESSENTIAL = [RoleType.COMMANDER, RoleType.ENGINEER, RoleType.BIO_SEC, RoleType.COMMS];
    const SUPPORT = [RoleType.SECURITY, RoleType.LOGISTICS];
    
    const takenRoles = new Set(players.map(p => p.role).filter(r => r !== null));
    
    players.forEach(p => {
        if (p.role) return;

        let assigned: RoleType | null = null;
        for (const r of ESSENTIAL) {
            if (!takenRoles.has(r)) { assigned = r; break; }
        }
        if (!assigned) {
            for (const r of SUPPORT) {
                if (!takenRoles.has(r)) { assigned = r; break; }
            }
        }
        if (!assigned) assigned = RoleType.SECURITY;

        p.role = assigned;
        takenRoles.add(assigned);
    });
  }

  private processGameTick(room: { session: GameSession, players: Player[] }) {
      const now = Date.now();
      const last = room.session.lastTick || now;
      const delta = now - last;
      
      // Only tick if > 1 second has passed
      if (delta >= 1000) {
          const seconds = Math.floor(delta / 1000);
          
          // 1. Time
          room.session.timeRemaining -= seconds;
          if (room.session.timeRemaining <= 0) {
              room.session.timeRemaining = 0;
              room.session.phase = GamePhase.VICTORY; // Or check game over
          }

          // 2. Events & Decay (Simplified: Run decay once per tick cluster)
          for(let i=0; i<seconds; i++) {
             // Only run expensive decay logic occasionally or scale it
             // Scaling it is safer
             room.session.system = Engine.calculateSystemDecay(room.session.system);
             
             // Random Events (Roughly check every second)
             if (Math.random() < 0.05) { // 5% chance per second
                 const evt = Engine.generateEvent(room.session.round, room.session.system.sectors);
                 if (evt) {
                     room.session.events.unshift(evt);
                     room.session.system = Engine.applyEventImpact(room.session.system, evt);
                 }
             }
          }
          
          // 3. Game Over Check
          const status = Engine.checkGameOver(room.session.system);
          if (status.isOver) {
              room.session.phase = GamePhase.GAME_OVER;
          }

          room.session.lastTick = now;
      }
  }
}

const server = new MockServer();

// --- CLIENT API ---
export const api = {
    async createRoom(hostName: string) {
        // Simulate Network Delay
        await new Promise(r => setTimeout(r, 600)); 
        return server.createRoom(hostName);
    },

    async joinRoom(code: string, playerName: string) {
        await new Promise(r => setTimeout(r, 600));
        return server.joinRoom(code, playerName);
    },

    async getGameState(code: string, playerId: string) {
        // Fast polling, minimal delay
        return server.getGameState(code, playerId);
    },

    async startGame(code: string) {
        return server.startGame(code);
    },

    async sendAction(code: string, playerId: string, actionId: string, targetSectorId?: string) {
        return server.performAction(code, playerId, actionId, targetSectorId);
    },

    async addBot(code: string) {
        return server.addBot(code);
    }
};
