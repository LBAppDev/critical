import { GameSession, Player, RoleType, GamePhase, Action, SystemState } from '../types';
import { INITIAL_SYSTEM_STATE, ACTIONS } from '../constants';
import * as Engine from './engine';

const STORAGE_KEY_PREFIX = 'entropy_room_';

export type ConnectionStatus = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

// --- MOCK BACKEND SERVER (Running in Browser Memory/LocalStorage) ---
// This allows multiple tabs to see the same state (Local Multiplayer)
class MockBackend {
  
  // --- STORAGE HELPERS ---
  
  private getRoomKey(code: string) {
    return `${STORAGE_KEY_PREFIX}${code.toUpperCase()}`;
  }

  private getStore(code: string): { session: GameSession, players: Player[], lastUpdated: number } | null {
    try {
      const key = this.getRoomKey(code);
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      console.error("[SERVER] Storage Read Error", e);
      return null;
    }
  }

  private setStore(code: string, data: { session: GameSession, players: Player[], lastUpdated: number }) {
    try {
      const key = this.getRoomKey(code);
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error("[SERVER] Storage Write Error", e);
    }
  }

  // --- CORE API ---

  createRoom(hostName: string): { code: string, playerId: string } {
    // Generate unique 4-letter code (avoiding ambiguous chars)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; 
    let code = '';
    let attempts = 0;
    
    do {
      code = '';
      for(let i=0; i<4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
      attempts++;
    } while (this.getStore(code) && attempts < 20);

    if (this.getStore(code)) throw new Error("Failed to allocate server capacity (Code Collision)");

    const playerId = `HOST-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    const hostPlayer: Player = {
      id: playerId,
      name: hostName.trim().toUpperCase() || 'COMMANDER',
      role: RoleType.COMMANDER,
      isHost: true
    };

    const initialSession: GameSession = {
      phase: GamePhase.LOBBY,
      round: 1,
      timeRemaining: 90,
      system: JSON.parse(JSON.stringify(INITIAL_SYSTEM_STATE)),
      events: [],
      lobbyCode: code,
      lastTick: Date.now()
    };

    this.setStore(code, {
      session: initialSession,
      players: [hostPlayer],
      lastUpdated: Date.now()
    });

    console.log(`[SERVER] Room Created: ${code}`);
    return { code, playerId };
  }

  joinRoom(code: string, playerName: string): { code: string, playerId: string } {
    const cleanCode = code.trim().toUpperCase();
    const data = this.getStore(cleanCode);
    
    if (!data) {
        console.warn(`[SERVER] Room ${cleanCode} not found in LocalStorage.`);
        // Debug aid: list available rooms
        this.logAvailableRooms();
        throw new Error(`Room ${cleanCode} not found`);
    }

    if (data.session.phase !== GamePhase.LOBBY) {
        throw new Error("Mission already in progress");
    }

    if (data.players.length >= 8) {
        throw new Error("Squad capacity reached");
    }

    const playerId = `OP-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    const newPlayer: Player = {
      id: playerId,
      name: playerName.trim().toUpperCase() || `OPERATIVE-${data.players.length + 1}`,
      role: null,
      isHost: false
    };

    data.players.push(newPlayer);
    this.rebalanceRoles(data.players);
    
    this.setStore(cleanCode, data);
    console.log(`[SERVER] ${playerName} joined ${cleanCode}`);
    return { code: cleanCode, playerId };
  }

  getGameState(code: string, playerId: string): { session: GameSession, players: Player[] } {
    const data = this.getStore(code);
    if (!data) throw new Error("Connection lost");
    
    // Lazy Simulation Tick
    // Only the first person to query in a 'tick window' triggers the update logic
    // But since this is LocalStorage, we can just update it safely.
    if (data.session.phase === GamePhase.PLAYING) {
       const now = Date.now();
       if (now - (data.session.lastTick || 0) > 1000) {
           this.processGameTick(data);
           this.setStore(code, data);
       }
    }
    
    return { session: data.session, players: data.players };
  }

  startGame(code: string): boolean {
    const data = this.getStore(code);
    if (!data) return false;
    
    data.session.phase = GamePhase.PLAYING;
    data.session.lastTick = Date.now();
    this.rebalanceRoles(data.players); 
    this.setStore(code, data);
    return true;
  }

  performAction(code: string, playerId: string, actionId: string, targetSectorId?: string): boolean {
    const data = this.getStore(code);
    if (!data) return false;
    if (data.session.phase !== GamePhase.PLAYING) return false;

    const actionDef = ACTIONS.find(a => a.id === actionId);
    if (!actionDef) return false;

    // Apply Action Logic
    data.session.system = Engine.applyAction(data.session.system, actionDef, targetSectorId);
    this.setStore(code, data);
    return true;
  }

  addBot(code: string): boolean {
      const data = this.getStore(code);
      if (!data) return false;
      
      const botId = `BOT-${Math.random().toString(36).substr(2, 4)}`;
      data.players.push({
          id: botId,
          name: `ANDROID-${Math.floor(Math.random()*999)}`,
          isHost: false,
          isBot: true,
          role: null
      });
      this.rebalanceRoles(data.players);
      this.setStore(code, data);
      return true;
  }

  // --- INTERNAL LOGIC ---

  private rebalanceRoles(players: Player[]) {
    const ESSENTIAL = [RoleType.COMMANDER, RoleType.ENGINEER, RoleType.BIO_SEC, RoleType.COMMS];
    const SUPPORT = [RoleType.SECURITY, RoleType.LOGISTICS];
    
    // Reset non-host roles to ensure optimal distribution? 
    // No, keep existing, just fill gaps.
    
    const currentRoles = new Set(players.map(p => p.role).filter(r => r !== null));
    
    players.forEach(p => {
        if (p.role) return; // Already has role

        // Try to assign essential roles first
        let assigned: RoleType | null = null;
        for (const r of ESSENTIAL) {
            if (!currentRoles.has(r)) { 
                assigned = r; 
                break; 
            }
        }
        
        // Then support
        if (!assigned) {
            for (const r of SUPPORT) {
                if (!currentRoles.has(r)) { 
                    assigned = r; 
                    break; 
                }
            }
        }
        
        // Fallback (Duplicates allowed for support roles usually, but for this game: Security)
        if (!assigned) assigned = RoleType.SECURITY;

        p.role = assigned;
        currentRoles.add(assigned);
    });
  }

  private processGameTick(data: { session: GameSession, players: Player[], lastUpdated: number }) {
      const now = Date.now();
      const last = data.session.lastTick || now;
      const delta = now - last;
      
      if (delta >= 1000) {
          const seconds = Math.floor(delta / 1000);
          
          // Time
          data.session.timeRemaining -= seconds;
          if (data.session.timeRemaining <= 0) {
              data.session.timeRemaining = 0;
              // Check victory condition (survival)
              const gameOver = Engine.checkGameOver(data.session.system);
              if (!gameOver.isOver) {
                   data.session.phase = GamePhase.VICTORY;
              }
          }

          // Logic Loop
          for(let i=0; i<seconds; i++) {
             data.session.system = Engine.calculateSystemDecay(data.session.system);
             
             // Random Events (5% per second)
             if (Math.random() < 0.05) { 
                 const evt = Engine.generateEvent(data.session.round, data.session.system.sectors);
                 if (evt) {
                     data.session.events.unshift(evt);
                     data.session.system = Engine.applyEventImpact(data.session.system, evt);
                 }
             }
             
             // Bot Actions (10% per second per bot)
             data.players.filter(p => p.isBot).forEach(bot => {
                 if (Math.random() < 0.1) {
                     const botAction = ACTIONS.find(a => a.role === bot.role);
                     if (botAction) {
                         // Pick random sector
                         const sectors = data.session.system.sectors;
                         const target = sectors[Math.floor(Math.random() * sectors.length)].id;
                         data.session.system = Engine.applyAction(data.session.system, botAction, target);
                     }
                 }
             });
          }
          
          // Check Defeat
          const status = Engine.checkGameOver(data.session.system);
          if (status.isOver) {
              data.session.phase = GamePhase.GAME_OVER;
          }

          data.session.lastTick = now;
      }
  }

  private logAvailableRooms() {
      const rooms: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
              rooms.push(key.replace(STORAGE_KEY_PREFIX, ''));
          }
      }
      console.log("[SERVER] Available Rooms:", rooms);
  }
}

const backend = new MockBackend();

// --- CLIENT API WRAPPER ---
// Simulates network latency for realism
export const api = {
    async createRoom(hostName: string) {
        await new Promise(r => setTimeout(r, 500)); 
        return backend.createRoom(hostName);
    },

    async joinRoom(code: string, playerName: string) {
        await new Promise(r => setTimeout(r, 500));
        return backend.joinRoom(code, playerName);
    },

    async getGameState(code: string, playerId: string) {
        // Fast polling
        return backend.getGameState(code, playerId);
    },

    async startGame(code: string) {
        return backend.startGame(code);
    },

    async sendAction(code: string, playerId: string, actionId: string, targetSectorId?: string) {
        return backend.performAction(code, playerId, actionId, targetSectorId);
    },

    async addBot(code: string) {
        return backend.addBot(code);
    }
};
