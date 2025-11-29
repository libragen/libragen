import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import 'asciinema-player/dist/bundle/asciinema-player.css';

interface AsciinemaTerminalProps {
   src: string;
   title?: string;
   autoPlay?: boolean;
   loop?: boolean;
   speed?: number;
   idleTimeLimit?: number;
   rows?: number;
}

export default function AsciinemaTerminal({
   src,
   title = 'Terminal',
   autoPlay = true,
   loop = true,
   speed = 1,
   idleTimeLimit = 2,
   rows = 16,
}: AsciinemaTerminalProps) {
   const containerRef = useRef<HTMLDivElement>(null);
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   const playerRef = useRef<any>(null);
   const [ error, setError ] = useState<string | null>(null);
   const [ isPlaying, setIsPlaying ] = useState(autoPlay);

   useEffect(() => {
      let mounted = true;

      const initPlayer = async () => {
         if (!containerRef.current || playerRef.current) {
            return;
         }

         try {
            const asciinema = await import('asciinema-player');

            if (!mounted || !containerRef.current) {
               return;
            }

            playerRef.current = asciinema.create(src, containerRef.current, {
               autoPlay,
               loop,
               speed,
               idleTimeLimit,
               rows,
               theme: 'asciinema',
               fit: 'width',
               terminalFontFamily: "'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
               terminalFontSize: '14px',
            });
         } catch (err) {
            console.error('Failed to initialize asciinema player:', err);
            setError('Failed to load terminal demo');
         }
      };

      initPlayer();

      return () => {
         mounted = false;
         if (playerRef.current) {
            playerRef.current.dispose();
            playerRef.current = null;
         }
      };
   }, [ src, autoPlay, loop, speed, idleTimeLimit, rows ]);

   const togglePlayPause = () => {
      if (!playerRef.current) return;

      if (isPlaying) {
         playerRef.current.pause();
      } else {
         playerRef.current.play();
      }
      setIsPlaying(!isPlaying);
   };

   return (
      <div className="overflow-hidden rounded-xl border border-gray-200 shadow-2xl dark:border-gray-700">
         {/* Title bar */}
         <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-2">
            <div className="flex items-center gap-2">
               <div className="h-3 w-3 rounded-full bg-red-500"></div>
               <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
               <div className="h-3 w-3 rounded-full bg-green-500"></div>
            </div>
            <span className="text-sm text-gray-400">{title}</span>
            <button
               onClick={togglePlayPause}
               className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
               aria-label={isPlaying ? 'Pause' : 'Play'}
            >
               {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
         </div>

         {/* Player container */}
         {error ? (
            <div className="flex min-h-[200px] items-center justify-center bg-gray-950 text-gray-400">
               {error}
            </div>
         ) : (
            <div
               ref={containerRef}
               className="asciinema-terminal-custom"
            />
         )}

         {/* Custom styles to match our design - using indigo accent colors */}
         <style>{`
            .asciinema-terminal-custom .ap-wrapper {
               background: transparent !important;
            }
            .asciinema-terminal-custom .ap-player {
               background: #030712 !important;
               border-radius: 0 !important;
            }
            .asciinema-terminal-custom .ap-terminal {
               background: transparent !important;
               padding: 1rem !important;
            }
            .asciinema-terminal-custom .ap-control-bar {
               display: none !important;
            }
            .asciinema-terminal-custom .ap-start-button {
               display: none !important;
            }
            /* Custom terminal colors matching site theme */
            .asciinema-terminal-custom .ap-terminal {
               --term-color-foreground: #e5e7eb;
               --term-color-background: #030712;
               --term-color-0: #1f2937;
               --term-color-1: #ef4444;
               --term-color-2: #22c55e;
               --term-color-3: #eab308;
               --term-color-4: #6366f1;
               --term-color-5: #a855f7;
               --term-color-6: #06b6d4;
               --term-color-7: #e5e7eb;
               --term-color-8: #4b5563;
               --term-color-9: #f87171;
               --term-color-10: #4ade80;
               --term-color-11: #facc15;
               --term-color-12: #818cf8;
               --term-color-13: #c084fc;
               --term-color-14: #22d3ee;
               --term-color-15: #f9fafb;
            }
         `}</style>
      </div>
   );
}
