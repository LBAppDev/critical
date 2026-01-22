import React, { useState, useEffect } from 'react';

interface GlitchTextProps {
  text: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
}

const GlitchText: React.FC<GlitchTextProps> = ({ 
  text, 
  as: Component = 'span', 
  className = '',
  intensity = 'low'
}) => {
  const [display, setDisplay] = useState(text);
  
  useEffect(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&';
    let interval: ReturnType<typeof setInterval>;
    
    // Probability of glitch based on intensity
    const prob = intensity === 'high' ? 0.3 : intensity === 'medium' ? 0.1 : 0.02;

    interval = setInterval(() => {
      if (Math.random() < prob) {
        const glitched = text.split('').map((char, index) => {
          if (char === ' ') return ' ';
          if (Math.random() < 0.1) {
            return chars[Math.floor(Math.random() * chars.length)];
          }
          return char;
        }).join('');
        setDisplay(glitched);
        
        // Snap back quickly
        setTimeout(() => setDisplay(text), 100);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [text, intensity]);

  return (
    <Component className={`${className} relative`}>
      {display}
    </Component>
  );
};

export default GlitchText;