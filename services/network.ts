import { NetworkMessage, Player, GameSession, RoleType } from '../types';

type MessageHandler = (msg: NetworkMessage) => void;

class NetworkService {
  private channel: BroadcastChannel | null = null;
  private handlers: MessageHandler[] = [];

  connect(lobbyCode: string) {
    if (this.channel) this.channel.close();
    this.channel = new BroadcastChannel(`entropy-protocol-${lobbyCode}`);
    this.channel.onmessage = (event) => {
      this.handlers.forEach(h => h(event.data));
    };
  }

  send(msg: NetworkMessage) {
    if (this.channel) {
      this.channel.postMessage(msg);
    }
  }

  subscribe(handler: MessageHandler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  disconnect() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.handlers = [];
  }
}

export const network = new NetworkService();

export const generateLobbyCode = () => {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
};

export const autoAssignRole = (players: Player[]): RoleType | null => {
    const takenRoles = new Set(players.map(p => p.role));
    
    const ESSENTIAL = [RoleType.COMMANDER, RoleType.ENGINEER, RoleType.BIO_SEC, RoleType.COMMS];
    const SUPPORT = [RoleType.SECURITY, RoleType.LOGISTICS];
    
    // Fill essentials first
    for (const role of ESSENTIAL) {
        if (!takenRoles.has(role)) return role;
    }
    // Then support
    for (const role of SUPPORT) {
        if (!takenRoles.has(role)) return role;
    }
    return null; // Spectator if full? Or cycle support
};
