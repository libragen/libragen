import { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';

interface TerminalLine {
   prompt?: boolean;
   output?: boolean;
   text: string;
}

interface TerminalProps {
   lines: TerminalLine[];
   title?: string;
}

export default function Terminal({ lines, title = 'Terminal' }: TerminalProps) {
   const [ copied, setCopied ] = useState(false);
   const [ visibleLines, setVisibleLines ] = useState<number>(0);

   useEffect(() => {
      if (visibleLines < lines.length) {
         const timeout = setTimeout(() => {
            setVisibleLines(visibleLines + 1);
         }, 100);

         return () => clearTimeout(timeout);
      }
   }, [ visibleLines, lines.length ]);

   const copyToClipboard = () => {
      const commands = lines
         .filter((line) => line.prompt && line.text && !line.text.startsWith('#'))
         .map((line) => line.text)
         .join('\n');

      navigator.clipboard.writeText(commands);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
   };

   return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-900 shadow-2xl dark:border-gray-700">
         {/* Title bar */}
         <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-2">
            <div className="flex items-center gap-2">
               <div className="h-3 w-3 rounded-full bg-red-500"></div>
               <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
               <div className="h-3 w-3 rounded-full bg-green-500"></div>
            </div>
            <span className="text-sm text-gray-400">{title}</span>
            <button
               onClick={copyToClipboard}
               className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
               aria-label="Copy commands"
            >
               {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
         </div>

         {/* Terminal content */}
         <div className="p-4 font-mono text-sm">
            {lines.slice(0, visibleLines).map((line, index) => (
               <div key={index} className="leading-relaxed">
                  {line.prompt && (
                     <span className="text-green-400">$ </span>
                  )}
                  <span className={line.output ? 'text-gray-400' : line.text.startsWith('#') ? 'text-gray-500' : 'text-white'}>
                     {line.text}
                  </span>
               </div>
            ))}
            {visibleLines < lines.length && (
               <span className="inline-block h-4 w-2 animate-pulse bg-white"></span>
            )}
         </div>
      </div>
   );
}
