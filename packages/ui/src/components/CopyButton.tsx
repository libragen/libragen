import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
   text: string;
   className?: string;
}

export default function CopyButton({ text, className = '' }: CopyButtonProps) {
   const [ copied, setCopied ] = useState(false);

   const handleCopy = async () => {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
   };

   return (
      <button
         onClick={handleCopy}
         className={`rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white ${className}`}
         aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
      >
         {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
      </button>
   );
}
