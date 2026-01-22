import React, { useState, useEffect, useRef } from 'react';
import { Activity, Shield, Zap, Radio, Users, AlertTriangle, RotateCcw, Box, Lock } from 'lucide-react';
import GlitchText from './components/GlitchText';
import CityMap from './components/CityMap';
import LobbyView from './components/LobbyView';
import { INITIAL_SYSTEM_STATE, ROLE_DESCRIPTIONS, ACTIONS } from './constants';
import { GamePhase, RoleType, Player, GameSession, Action, NetworkMessage } from './types';
import * as Engine from './services/engine';
import { network, generateLobbyCode, autoAssignRole } from './services/network';

export default function App() {
  // --- STATE ---
  const [playerId] = useState(() => Math.random().toString(36).substr(2, 9));
  const [myPlayer, setMyPlayer] = useState<Player>({ id: playerId, name: '', role: null, isHost: false });
  const [players, setPlayers] = useState<Player[]>([]);
  const [lobbyCode, setLobbyCode] = useState<string | null>(null);
  
  const [session, setSession] = useState<GameSession>({
    phase: GamePhase.LOBBY,
    round: 1,
    timeRemaining: 90,
    system: { ...INITIAL_SYSTEM_STATE },
    events: [],
    lobbyCode: ''
  });

  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- REFS FOR STABLE STATE IN CALLBACKS ---
  const stateRef = useRef({ players, session, myPlayer });
  useEffect(() => {
    stateRef.current = { players, session, myPlayer };
  }, [players, session, myPlayer]);

  // --- 1. CONNECTION MANAGEMENT ---
  // Connect whenever lobbyCode changes
  useEffect(() => {
    if (lobbyCode) {
      console.log(`[NET] Connecting to channel: entropy-protocol-${lobbyCode}`);
      network.connect(lobbyCode);
      return () => {
        console.log('[NET] Disconnecting...');
        network.disconnect();
      };
    }
  }, [lobbyCode]);

  // --- 2. MESSAGE HANDLING ---
  useEffect(() => {
    const unsub = network.subscribe((msg: NetworkMessage) => {
      const { myPlayer: currentMe, players: currentPlayers, session: currentSession } = stateRef.current;
      console.log('[NET] RX:', msg.type, msg);

      switch (msg.type) {
        case 'JOIN_REQUEST':
          if (currentMe.isHost) {
            handlePlayerJoinRequest(msg.payload.player);
          }
          break;

        case 'LOBBY_STATE':
          // If I am NOT the host, I accept the authoritative state
          if (!currentMe.isHost) {
            // Merge players (careful not to lose my local info if needed, but usually server is authority)
            setPlayers(msg.payload.players);
            setSession(prev => ({ ...prev, ...msg.payload.session }));

            // Update my own role if the host assigned one
            const meInList = msg.payload.players.find(p => p.id === currentMe.id);
            if (meInList && meInList.role !== currentMe.role) {
               setMyPlayer(prev => ({ ...prev, role: meInList.role }));
            }
          }
          break;

        case 'START_GAME':
           setSession(prev => ({ ...prev, phase: GamePhase.PLAYING }));
           break;

        case 'PLAYER_ACTION':
          if (currentMe.isHost) {
             processAction(msg.payload.actionId, msg.payload.playerId);
          }
          break;

        case 'GAME_TICK':
           if (!currentMe.isHost) {
               setSession(msg.payload.session); 
           }
           break;
      }
    });
    return () => unsub();
  }, []);

  // --- 3. HEARTBEAT / SYNC LOOP ---
  useEffect(() => {
      if (!lobbyCode) return;

      const interval = setInterval(() => {
          const { myPlayer, players, session } = stateRef.current;

          // HOST: Broadcast state constantly in lobby so new joiners get it
          if (myPlayer.isHost && session.phase === GamePhase.LOBBY) {
              network.send({ type: 'LOBBY_STATE', payload: { players, session } });
          }

          // CLIENT: If I'm not in the player list yet, keep knocking
          if (!myPlayer.isHost && session.phase === GamePhase.LOBBY) {
              const amIJoined = players.some(p => p.id === myPlayer.id);
              if (!amIJoined) {
                  console.log('[NET] Sending JOIN_REQUEST...');
                  network.send({ type: 'JOIN_REQUEST', payload: { player: myPlayer, code: lobbyCode } });
              }
          }
      }, 500); // Faster heartbeat (500ms) for snappier joins

      return () => clearInterval(interval);
  }, [lobbyCode]);

  // --- HOST GAME LOOP ---
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (myPlayer.isHost && session.phase === GamePhase.PLAYING) {
      interval = setInterval(() => {
        setSession(prev => {
          // 1. Check Timer
          const newTime = prev.timeRemaining - 1;
          if (newTime <= 0) {
            const nextSession = { ...prev, phase: GamePhase.VICTORY };
            network.send({ type: 'LOBBY_STATE', payload: { players, session: nextSession } });
            return nextSession;
          }

          // 2. System Decay
          let newState = Engine.calculateSystemDecay(prev.system);

          // 3. Random Events
          const newEvent = Engine.generateEvent(prev.round, prev.system.sectors);
          const currentEvents = [...prev.events];
          
          if (newEvent) {
            currentEvents.unshift(newEvent);
            newState = Engine.applyEventImpact(newState, newEvent);
          }

          // 4. Bot Actions
          players.filter(p => p.isBot).forEach(bot => {
             if (Math.random() < 0.1) { 
                 const botAction = ACTIONS.find(a => a.role === bot.role);
                 if (botAction) {
                     const target = newState.sectors[Math.floor(Math.random() * newState.sectors.length)].id;
                     newState = Engine.applyAction(newState, botAction, target);
                 }
             }
          });

          // 5. Check Game Over
          const gameOverCheck = Engine.checkGameOver(newState);
          const phase = gameOverCheck.isOver ? GamePhase.GAME_OVER : GamePhase.PLAYING;

          const nextSession = {
            ...prev,
            timeRemaining: newTime,
            system: newState,
            events: currentEvents,
            phase
          };

          network.send({ type: 'GAME_TICK', payload: { session: nextSession } });
          return nextSession;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [myPlayer.isHost, session.phase, players]);

  // --- COOLDOWN TICK (Client Side) ---
  useEffect(() => {
      if (session.phase !== GamePhase.PLAYING) return;
      const interval = setInterval(() => {
        setCooldowns(prev => {
           const next = { ...prev };
           let changed = false;
           Object.keys(next).forEach(k => {
             if (next[k] > 0) { next[k] -= 1; changed = true; } 
             else { delete next[k]; }
           });
           return changed ? next : prev;
        });
      }, 1000);
      return () => clearInterval(interval);
  }, [session.phase]);


  // --- HOST LOGIC METHODS ---
  const handlePlayerJoinRequest = (newPlayer: Player) => {
      const { players, session } = stateRef.current;
      console.log('[HOST] Processing Join Request:', newPlayer.name);
      
      const existingIndex = players.findIndex(p => p.id === newPlayer.id);
      
      let updatedPlayers = [...players];
      if (existingIndex >= 0) {
          updatedPlayers[existingIndex] = { ...updatedPlayers[existingIndex], name: newPlayer.name };
      } else {
          updatedPlayers.push(newPlayer);
      }
      
      const assignedRole = autoAssignRole(updatedPlayers);
      const finalPlayers = updatedPlayers.map(p => {
          if (!p.role && p.id === newPlayer.id) return { ...p, role: assignedRole };
          return p;
      });

      setPlayers(finalPlayers);
      network.send({ type: 'LOBBY_STATE', payload: { players: finalPlayers, session } });
  };

  const handleAddBot = () => {
      const botId = `bot-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      handlePlayerJoinRequest({
          id: botId,
          name: `UNIT-${Math.floor(Math.random() * 900) + 100}`,
          role: null,
          isHost: false,
          isBot: true
      });
  };

  const processAction = (actionId: string, actorId: string) => {
      const action = ACTIONS.find(a => a.id === actionId);
      if (!action) return;
      
      const actor = stateRef.current.players.find(p => p.id === actorId);

      setSession(prev => {
          let targetSectorId = undefined;
          if (action.targetType === 'SECTOR') {
             if (action.role === RoleType.ENGINEER) {
                 targetSectorId = prev.system.sectors.sort((a,b) => a.structuralIntegrity - b.structuralIntegrity)[0].id;
             } else if (action.role === RoleType.BIO_SEC) {
                 targetSectorId = prev.system.sectors.sort((a,b) => b.hazardLevel - a.hazardLevel)[0].id;
             } else {
                 targetSectorId = prev.system.sectors[0].id;
             }
          }

          const newState = Engine.applyAction(prev.system, action, targetSectorId);
          const nextSession = { ...prev, system: newState };
          
          network.send({ type: 'GAME_TICK', payload: { session: nextSession } }); 
          return nextSession;
      });
      
      setActionLog(prev => [`[ACT] ${actor?.name}: ${action.label}`, ...prev].slice(0, 8));
  };

  // --- INTERACTION METHODS ---
  const handleCreateLobby = (name: string) => {
      const code = generateLobbyCode();
      const me = { id: playerId, name, role: RoleType.COMMANDER, isHost: true };
      
      // Update state in specific order
      setMyPlayer(me);
      setPlayers([me]);
      setSession(prev => ({ ...prev, lobbyCode: code }));
      setLobbyCode(code); // This triggers the useEffect connection
  };

  const handleJoinLobby = (name: string, code: string) => {
      const upperCode = code.toUpperCase();
      const me = { id: playerId, name, role: null, isHost: false };
      
      setMyPlayer(me);
      setLobbyCode(upperCode); // This triggers the useEffect connection
  };

  const handleStartGame = () => {
      if (!myPlayer.isHost) return;
      const nextSession = { ...session, phase: GamePhase.PLAYING, round: 1 };
      setSession(nextSession);
      network.send({ type: 'START_GAME', payload: {} });
      network.send({ type: 'LOBBY_STATE', payload: { players, session: nextSession } });
  };

  const handleActionClick = (action: Action) => {
      if (cooldowns[action.id]) return;
      setCooldowns(prev => ({ ...prev, [action.id]: action.cooldown }));
      setActionLog(l => [`[CMD] REQUESTING ${action.label}...`, ...l].slice(0, 10));
      network.send({ type: 'PLAYER_ACTION', payload: { actionId: action.id, playerId: myPlayer.id } });
  };

  // --- RENDER ---
  
  if (session.phase === GamePhase.LOBBY) {
      return (
          <LobbyView 
              playerCount={players.length}
              lobbyCode={lobbyCode}
              players={players}
              isHost={myPlayer.isHost}
              onCreate={handleCreateLobby}
              onJoin={handleJoinLobby}
              onStart={handleStartGame}
              onAddBot={handleAddBot}
          />
      );
  }

  if (session.phase === GamePhase.GAME_OVER || session.phase === GamePhase.VICTORY) {
     const isVictory = session.phase === GamePhase.VICTORY;
     return (
        <div className={`min-h-screen flex items-center justify-center p-8 ${isVictory ? 'bg-emerald-950' : 'bg-red-950'}`}>
           <div className="max-w-2xl w-full text-center space-y-8">
              <GlitchText 
                text={isVictory ? "MISSION ACCOMPLISHED" : "CRITICAL FAILURE"} 
                className={`text-6xl md:text-8xl font-black ${isVictory ? 'text-emerald-500' : 'text-red-500'}`}
                intensity="high" 
              />
              <p className="text-2xl font-mono text-white/80">
                 {isVictory ? "System entropy stabilized. City secure." : Engine.checkGameOver(session.system).reason || "System Collapse."}
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="mx-auto px-8 py-3 border border-white/20 hover:bg-white/10 text-white font-mono flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> DISCONNECT
              </button>
           </div>
        </div>
     );
  }

  // --- GAME UI ---
  const myActions = ACTIONS.filter(a => a.role === myPlayer.role);

  return (
    <div className="min-h-screen bg-black text-gray-200 flex flex-col overflow-hidden">
      
      {/* HEADER */}
      <header className="h-14 border-b border-white/10 bg-black/90 flex items-center justify-between px-6 z-30">
        <div className="flex items-center gap-4">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          <span className="font-mono text-red-500 tracking-widest text-xs hidden md:block">LIVE FEED // {lobbyCode}</span>
        </div>
        <div className="font-mono text-2xl font-bold text-white tracking-widest">
           {Math.floor(session.timeRemaining / 60)}:{(session.timeRemaining % 60).toString().padStart(2, '0')}
        </div>
        <div className="flex items-center gap-3">
            <div className="text-right">
                <div className="text-xs text-gray-400 font-mono">OPERATIVE</div>
                <div className="text-sm font-bold text-cyan-500 font-mono">{myPlayer.name}</div>
            </div>
            <div className="p-2 border border-cyan-500/30 rounded bg-cyan-950/30">
                {myPlayer.role === RoleType.COMMANDER && <Shield className="w-5 h-5 text-cyan-400" />}
                {myPlayer.role === RoleType.ENGINEER && <Zap className="w-5 h-5 text-cyan-400" />}
                {myPlayer.role === RoleType.BIO_SEC && <Activity className="w-5 h-5 text-cyan-400" />}
                {myPlayer.role === RoleType.COMMS && <Radio className="w-5 h-5 text-cyan-400" />}
                {myPlayer.role === RoleType.SECURITY && <Lock className="w-5 h-5 text-cyan-400" />}
                {myPlayer.role === RoleType.LOGISTICS && <Box className="w-5 h-5 text-cyan-400" />}
            </div>
        </div>
      </header>

      {/* CONTENT */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-0 overflow-hidden relative">
        
        {/* LEFT: GLOBAL METRICS */}
        <div className="col-span-12 md:col-span-3 bg-gray-900/20 border-r border-white/5 flex flex-col p-4 gap-6 z-20">
           
           <div className="space-y-4">
               <div className="flex justify-between items-end">
                  <span className="text-xs font-mono text-gray-500">GLOBAL PANIC</span>
                  <span className={`text-xl font-mono font-bold ${session.system.globalPanic > 70 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                      {Math.round(session.system.globalPanic)}%
                  </span>
               </div>
               <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                   <div className="h-full bg-red-600 transition-all duration-500" style={{ width: `${session.system.globalPanic}%` }} />
               </div>
           </div>

           <div className="grid grid-cols-2 gap-4">
               <div className="bg-black/40 p-3 border border-white/5 rounded">
                   <div className="text-[10px] text-gray-500 font-mono mb-1">GRID POWER</div>
                   <div className={`text-lg font-mono font-bold ${session.system.globalPower < 30 ? 'text-red-500' : 'text-yellow-400'}`}>
                       {Math.round(session.system.globalPower)}%
                   </div>
               </div>
               <div className="bg-black/40 p-3 border border-white/5 rounded">
                   <div className="text-[10px] text-gray-500 font-mono mb-1">NETWORK</div>
                   <div className={`text-lg font-mono font-bold ${session.system.globalNetwork < 30 ? 'text-red-500' : 'text-emerald-400'}`}>
                       {Math.round(session.system.globalNetwork)}%
                   </div>
               </div>
           </div>

           <div className="flex-1 bg-black/40 border border-white/5 p-2 overflow-y-auto font-mono text-[10px] space-y-1">
               <div className="text-gray-500 border-b border-white/5 pb-1 mb-1">EVENT LOG</div>
               {actionLog.map((log, i) => (
                   <div key={i} className="text-cyan-600/80 truncate">{log}</div>
               ))}
               <div ref={chatEndRef} />
           </div>
        </div>

        {/* CENTER: CITY MAP */}
        <div className="col-span-12 md:col-span-6 bg-black relative flex flex-col items-center justify-center p-4">
            <div className="absolute top-4 w-full px-4 flex flex-col gap-2 items-center pointer-events-none z-20">
                {session.events.slice(0, 2).map(evt => (
                    <div key={evt.id} className="bg-red-500/10 border border-red-500/50 backdrop-blur px-6 py-2 text-red-400 font-mono text-sm animate-pulse flex items-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                            <AlertTriangle className="w-4 h-4" />
                            <span>{evt.title.toUpperCase()} IN {session.system.sectors.find(s => s.id === evt.targetSectorId)?.name.toUpperCase()}</span>
                    </div>
                ))}
            </div>

            <CityMap 
                system={session.system} 
                onSectorClick={setSelectedSectorId}
                selectedSectorId={selectedSectorId}
            />

            <div className="absolute bottom-4 text-center">
                <p className="text-xs text-gray-500 font-mono">
                    {selectedSectorId 
                        ? `TARGET LOCKED: ${session.system.sectors.find(s => s.id === selectedSectorId)?.name}` 
                        : "SELECT A SECTOR TO TARGET ACTIONS"}
                </p>
            </div>
        </div>

        {/* RIGHT: CONTROLS */}
        <div className="col-span-12 md:col-span-3 bg-gray-900/20 border-l border-white/5 flex flex-col p-4 z-20">
             <div className="mb-4 flex items-center justify-between">
                 <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Control Deck</h3>
                 <span className="text-[10px] bg-cyan-900/30 text-cyan-400 px-2 py-0.5 rounded">{myPlayer.role}</span>
             </div>
             
             <div className="flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                {myActions.map(action => {
                    const isOnCooldown = (cooldowns[action.id] || 0) > 0;
                    const requiresTarget = action.targetType === 'SECTOR';
                    const targetValid = !requiresTarget || selectedSectorId;

                    return (
                        <button
                            key={action.id}
                            onClick={() => handleActionClick(action)}
                            disabled={isOnCooldown || !targetValid}
                            className={`w-full group relative p-4 border text-left transition-all ${
                                isOnCooldown 
                                ? 'border-gray-800 bg-gray-900 text-gray-600 cursor-not-allowed' 
                                : !targetValid
                                    ? 'border-gray-700 bg-gray-900/50 text-gray-500 cursor-help'
                                    : 'border-cyan-500/30 bg-cyan-900/10 hover:bg-cyan-900/20 hover:border-cyan-500 hover:shadow-[0_0_10px_rgba(6,182,212,0.1)]'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className={`font-mono font-bold text-sm ${isOnCooldown ? 'text-gray-600' : 'text-cyan-400'}`}>
                                    {action.label.toUpperCase()}
                                </span>
                                {isOnCooldown && <span className="text-xs font-mono text-white">{cooldowns[action.id]}s</span>}
                            </div>
                            <p className="text-[10px] text-gray-500 mb-2 leading-tight">{action.description}</p>
                            
                            {!targetValid && !isOnCooldown && (
                                <div className="text-[10px] text-yellow-500/80 mt-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> SELECT SECTOR TARGET
                                </div>
                            )}

                            {/* Cooldown Overlay */}
                            {isOnCooldown && (
                                <div 
                                    className="absolute bottom-0 left-0 h-1 bg-gray-600 transition-all duration-1000 ease-linear"
                                    style={{ width: `${(cooldowns[action.id] / action.cooldown) * 100}%` }}
                                ></div>
                            )}
                        </button>
                    );
                })}
             </div>

             {/* SQUAD LIST */}
             <div className="mt-4 pt-4 border-t border-white/10">
                 <h4 className="text-[10px] text-gray-500 uppercase mb-2">Squad Uplink</h4>
                 <div className="space-y-1">
                     {players.map(p => (
                         <div key={p.id} className="flex items-center justify-between text-xs font-mono">
                             <span className={`${p.id === myPlayer.id ? 'text-white' : 'text-gray-400'}`}>{p.name}</span>
                             <span className="text-cyan-600">{p.role?.substring(0,3)}</span>
                         </div>
                     ))}
                 </div>
             </div>
        </div>

      </main>
    </div>
  );
}