import React from 'react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { SystemState } from '../types';

interface SystemMonitorProps {
  state: SystemState;
  className?: string;
}

const SystemMonitor: React.FC<SystemMonitorProps> = ({ state, className }) => {
  const data = [
    { subject: 'Integrity', A: state.structuralIntegrity, fullMark: 100 },
    { subject: 'Power', A: state.powerOutput, fullMark: 100 },
    { subject: 'Containment', A: state.containmentLevel, fullMark: 100 },
    { subject: 'Network', A: state.networkStability, fullMark: 100 },
    { subject: 'Order', A: 100 - state.panicLevel, fullMark: 100 }, // Invert panic so 100 is good
  ];

  // Determine color based on overall health
  const avgHealth = (state.structuralIntegrity + state.powerOutput + state.containmentLevel + (100 - state.panicLevel)) / 4;
  const strokeColor = avgHealth < 40 ? '#ef4444' : avgHealth < 70 ? '#f59e0b' : '#10b981';
  const fillColor = avgHealth < 40 ? '#ef4444' : avgHealth < 70 ? '#f59e0b' : '#10b981';

  return (
    <div className={`relative ${className}`}>
      {/* Background Grid Decoration */}
      <div className="absolute inset-0 border border-white/10 rounded-full animate-[spin_10s_linear_infinite] opacity-20 pointer-events-none" />
      <div className="absolute inset-4 border border-white/5 rounded-full animate-[spin_15s_linear_infinite_reverse] opacity-20 pointer-events-none" />

      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="#333" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: '#888', fontSize: 10, fontFamily: 'JetBrains Mono' }} 
          />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="System Status"
            dataKey="A"
            stroke={strokeColor}
            strokeWidth={2}
            fill={fillColor}
            fillOpacity={0.4}
            isAnimationActive={true}
          />
        </RadarChart>
      </ResponsiveContainer>
      
      {/* Central readout */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
        <span className={`text-2xl font-bold font-mono ${avgHealth < 30 ? 'text-red-500 animate-pulse' : 'text-white/50'}`}>
          {Math.round(avgHealth)}%
        </span>
      </div>
    </div>
  );
};

export default SystemMonitor;