export enum GamePhase {
  LOBBY = 'LOBBY',
  TRANSITION = 'TRANSITION',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}

export enum RoleType {
  COMMANDER = 'COMMANDER', // Essential: Oversees broad metrics
  ENGINEER = 'ENGINEER',   // Essential: Power/Structure
  BIO_SEC = 'BIO_SEC',     // Essential: Health/Bio
  COMMS = 'COMMS',         // Essential: Network/Panic
  SECURITY = 'SECURITY',   // Support: Riot control
  LOGISTICS = 'LOGISTICS'  // Support: Resource movement
}

export interface Player {
  id: string;
  name: string;
  role: RoleType | null;
  isHost: boolean;
  isBot?: boolean;
}

export interface SectorState {
  id: string;
  name: string;
  type: 'residential' | 'industrial' | 'medical' | 'command' | 'network' | 'power';
  structuralIntegrity: number;
  hazardLevel: number; // 0-100 (Bio/Fire/Rad)
  activeEventId: string | null;
}

export interface SystemState {
  globalPanic: number;
  globalPower: number;
  globalNetwork: number;
  sectors: SectorState[];
}

export interface GameEvent {
  id: string;
  title: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'CRITICAL';
  targetSectorId: string;
  timestamp: number;
}

export interface Action {
  id: string;
  label: string;
  description: string;
  cooldown: number;
  role: RoleType;
  targetType: 'GLOBAL' | 'SECTOR';
  cost?: { resource: string; amount: number };
}

export interface GameSession {
  phase: GamePhase;
  round: number;
  timeRemaining: number;
  system: SystemState;
  events: GameEvent[];
  lobbyCode: string;
  lastTick?: number; // For lazy simulation updates
}

// Simplified Network Response
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}
