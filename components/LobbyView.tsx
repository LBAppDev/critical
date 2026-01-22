import React, { useState } from 'react';
import { Play, Bot, Loader2, AlertCircle } from 'lucide-react';
import GlitchText from './GlitchText';
import { Player } from '../types';
import { ConnectionStatus } from '../services/network';

interface LobbyViewProps {
  playerCount: number;
  lobbyCode: string | null;
  players: Player[];
  isHost: boolean;
  connStatus: ConnectionStatus;
  connError: string | null;
  onJoin: (name: string, code: string) => void;
  onCreate: (name: string) => void;
  onStart: () => void;
  onAddBot?: () => void;
}

const LobbyView: React.FC<LobbyViewProps> = ({ 
    playerCount, lobbyCode, players, isHost, connStatus, connError, onJoin, onCreate, onStart, onAddBot 
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [view, setView] = useState<'MENU' | 'WAITING'>('MENU');

  const isLoading = connStatus === 'CONNECTING';

  const handleCreate = () => {
      if (!name) return;
      onCreate(name);
      setView('WAITING');
  };

  const handleJoin = () => {
      if (!name || !code) return;
      onJoin(name, code);
      setView('WAITING');
  };

  const handleBack = () => {
      setView('MENU');
      window.location.reload(); 
  };

  if (view === 'MENU') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4 relative">
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-900/20 to-black pointer-events-none"></div>

         <div className="max-w-md w-full space-y-8 relative z-10">
            <div className="text-center">
                <GlitchText text="ENTROPY PROTOCOL" as="h1" className="text-5xl font-black text-white" intensity="medium" />
                <p className="text-cyan-500 font-mono mt-2 tracking-widest text-xs">MULTIPLAYER DISASTER SIMULATOR</p>
            </div>

            <div className="bg-gray-900/80 border border-white/10 p-8 space-y-6 backdrop-blur shadow-2xl">
                <div>
                    <label className="block text-xs font-mono text-gray-500 mb-2">OPERATIVE ID</label>
                    <input 
                        type="text" 
                        value={name} 
                        onChange={(e) => setName(e.target.value.toUpperCase())}
                        className="w-full bg-black/50 border border-white/20 p-3 text-white font-mono focus:border-cyan-500 outline-none transition-colors"
                        placeholder="ENTER CALLSIGN"
                        maxLength={12}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={handleCreate}
                        disabled={!name || isLoading}
                        className="p-4 border border-cyan-500/50 bg-cyan-900/10 hover:bg-cyan-900/30 text-cyan-400 font-bold font-mono transition-all disabled:opacity-50 flex items-center justify-center"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'CREATE LOBBY'}
                    </button>
                    <div className="space-y-2">
                         <input 
                             type="text" 
                             value={code}
                             onChange={(e) => setCode(e.target.value.toUpperCase())}
                             placeholder="CODE"
                             className="w-full bg-black/50 border border-white/20 p-2 text-center font-mono text-sm focus:border-white/50 outline-none"
                             maxLength={4}
                         />
                         <button 
                             onClick={handleJoin}
                             disabled={!name || code.length !== 4 || isLoading}
                             className="w-full p-2 bg-white text-black font-bold font-mono text-sm hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center"
                         >
                             {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'JOIN UPLINK'}
                         </button>
                    </div>
                </div>
                
                <div className="text-[10px] text-gray-600 font-mono text-center">
                   LOCAL SIMULATION MODE ACTIVE (MULTI-TAB)
                </div>

                {connError && (
                    <div className="text-red-500 text-xs font-mono bg-red-900/20 p-3 border border-red-500/30 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{connError}</span>
                    </div>
                )}
            </div>
         </div>
      </div>
    );
  }

  // Waiting Room
  const canStart = playerCount >= 4;

  return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
         <div className="max-w-2xl w-full">
            {connError ? (
                <div className="bg-red-900/20 border border-red-500/50 p-8 text-center space-y-4 shadow-2xl shadow-red-900/20">
                    <h2 className="text-red-500 font-mono text-xl font-bold">CONNECTION FAILURE</h2>
                    <p className="text-gray-400 font-mono text-sm">{connError}</p>
                    <button onClick={handleBack} className="text-white border border-white/20 px-6 py-3 hover:bg-white/10 font-mono text-sm">RETURN TO MENU</button>
                </div>
            ) : (
                <>
                <div className="flex justify-between items-end mb-6 border-b border-white/10 pb-4">
                    <div>
                        <h2 className="text-2xl text-white font-bold font-mono">
                            LOBBY STATUS: <span className={connStatus === 'CONNECTED' ? 'text-cyan-500' : 'text-yellow-500'}>
                                {connStatus === 'CONNECTED' ? 'ASSEMBLING' : 'CONNECTING...'}
                            </span>
                        </h2>
                        {lobbyCode && (
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-gray-500 font-mono">SECURE CHANNEL:</span>
                                <code className="bg-white/10 px-3 py-1 text-xl font-mono text-white tracking-widest border border-white/20">{lobbyCode}</code>
                            </div>
                        )}
                    </div>
                    <div className="text-right">
                        <div className={`text-4xl font-black ${canStart ? 'text-emerald-500' : 'text-yellow-500'}`}>
                            {playerCount}/8
                        </div>
                        <div className="text-xs text-gray-500 font-mono uppercase">Operatives Ready (Min 4)</div>
                    </div>
                </div>

                <div className="bg-gray-900/30 border border-white/10 p-6 min-h-[300px] mb-6 relative">
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                        {players.map((p, i) => (
                            <div key={i} className="flex items-center justify-between bg-black/50 p-3 border border-white/5 shadow-lg">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${p.isHost ? 'bg-yellow-500 shadow-[0_0_10px_orange]' : 'bg-cyan-500 shadow-[0_0_10px_cyan]'}`}></div>
                                    <span className="font-mono text-white flex items-center gap-2">
                                    {p.name}
                                    {p.isBot && <Bot className="w-3 h-3 text-gray-500" />}
                                    </span>
                                </div>
                                <span className="text-xs font-mono text-gray-500">{p.role || 'ASSIGNING...'}</span>
                            </div>
                        ))}
                        {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, i) => (
                            <div key={`empty-${i}`} className="flex items-center justify-center bg-black/20 p-3 border border-white/5 border-dashed text-gray-700 font-mono text-sm animate-pulse">
                                WAITING FOR SIGNAL...
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                {isHost ? (
                    <button
                        onClick={onStart}
                        disabled={!canStart}
                        className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-800 disabled:text-gray-600 text-black font-black font-mono text-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {canStart ? <><Play className="w-5 h-5" /> INITIATE DEPLOYMENT</> : 'WAITING FOR SQUAD (MIN 4)'}
                    </button>
                ) : (
                    <div className="w-full py-4 text-center text-gray-500 font-mono animate-pulse bg-gray-900/50 border border-white/5">
                        WAITING FOR COMMANDER TO INITIATE...
                    </div>
                )}
                
                {isHost && !canStart && (
                    <button
                    onClick={onAddBot}
                    className="w-full py-3 border border-white/10 hover:bg-white/5 text-gray-400 font-mono text-xs flex items-center justify-center gap-2"
                    >
                    <Bot className="w-3 h-3" /> DEPLOY ANDROID UNIT (TESTING)
                    </button>
                )}

                {!canStart && (
                    <p className="text-center text-gray-600 text-xs font-mono mt-4">
                         Share the Secure Channel Code <strong>{lobbyCode}</strong> with others in a new tab to join.
                    </p>
                )}
                </div>
                </>
            )}
         </div>
      </div>
  );
};

export default LobbyView;