import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, FileText, ArrowRight } from 'lucide-react';

interface DocEntry {
   slug: string;
   title: string;
   description: string;
   section: string;
   content: string;
}

interface DocSearchProps {
   docs: DocEntry[];
}

export default function DocSearch({ docs }: DocSearchProps) {
   const [ isOpen, setIsOpen ] = useState(false);
   const [ query, setQuery ] = useState('');
   const inputRef = useRef<HTMLInputElement>(null);
   const dialogRef = useRef<HTMLDialogElement>(null);

   // Handle keyboard shortcut (Cmd/Ctrl + K)
   useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
         if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            setIsOpen(true);
         }
         if (e.key === 'Escape') {
            setIsOpen(false);
         }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
   }, []);

   // Focus input when dialog opens
   useEffect(() => {
      if (isOpen) {
         inputRef.current?.focus();
         dialogRef.current?.showModal();
      } else {
         dialogRef.current?.close();
         setQuery('');
      }
   }, [ isOpen ]);

   // Search logic
   const results = useMemo(() => {
      if (!query.trim()) return [];

      const lowerQuery = query.toLowerCase();
      const scored = docs
         .map((doc) => {
            let score = 0;
            const titleLower = doc.title.toLowerCase();
            const descLower = doc.description.toLowerCase();
            const contentLower = doc.content.toLowerCase();

            // Title matches score highest
            if (titleLower.includes(lowerQuery)) {
               score += titleLower === lowerQuery ? 100 : 50;
            }

            // Description matches
            if (descLower.includes(lowerQuery)) {
               score += 30;
            }

            // Content matches
            const contentMatches = (contentLower.match(new RegExp(lowerQuery, 'g')) || []).length;
            score += Math.min(contentMatches * 5, 20);

            return { doc, score };
         })
         .filter((r) => r.score > 0)
         .sort((a, b) => b.score - a.score)
         .slice(0, 8);

      return scored.map((r) => r.doc);
   }, [ query, docs ]);

   // Get snippet with highlighted match
   const getSnippet = (content: string, maxLength = 120) => {
      const lowerQuery = query.toLowerCase();
      const lowerContent = content.toLowerCase();
      const idx = lowerContent.indexOf(lowerQuery);

      if (idx === -1) return content.slice(0, maxLength) + '...';

      const start = Math.max(0, idx - 40);
      const end = Math.min(content.length, idx + query.length + 80);
      let snippet = content.slice(start, end);

      if (start > 0) snippet = '...' + snippet;
      if (end < content.length) snippet = snippet + '...';

      return snippet;
   };

   return (
      <>
         {/* Search trigger button */}
         <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300"
            aria-label="Search documentation"
         >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search docs...</span>
            <kbd className="ml-2 hidden rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400 sm:inline">
               ⌘K
            </kbd>
         </button>

         {/* Search dialog */}
         <dialog
            ref={dialogRef}
            className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-0 shadow-2xl backdrop:bg-gray-900/50 dark:border-gray-700 dark:bg-gray-900"
            onClick={(e) => {
               if (e.target === dialogRef.current) setIsOpen(false);
            }}
         >
            <div className="flex flex-col">
               {/* Search input */}
               <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                  <Search className="h-5 w-5 text-gray-400" />
                  <input
                     ref={inputRef}
                     type="text"
                     value={query}
                     onChange={(e) => setQuery(e.target.value)}
                     placeholder="Search documentation..."
                     className="flex-1 bg-transparent text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
                  />
                  {query && (
                     <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <X className="h-4 w-4" />
                     </button>
                  )}
                  <button
                     onClick={() => setIsOpen(false)}
                     className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                  >
                     ESC
                  </button>
               </div>

               {/* Results */}
               <div className="max-h-96 overflow-y-auto p-2">
                  {query && results.length === 0 && (
                     <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        No results found for "{query}"
                     </div>
                  )}

                  {results.length > 0 && (
                     <ul className="space-y-1">
                        {results.map((doc) => (
                           <li key={doc.slug}>
                              <a
                                 href={`/docs/${doc.slug}`}
                                 onClick={() => setIsOpen(false)}
                                 className="flex items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                              >
                                 <FileText className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
                                 <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                       <span className="font-medium text-gray-900 dark:text-white">{doc.title}</span>
                                       <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                          {doc.section}
                                       </span>
                                    </div>
                                    <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
                                       {getSnippet(doc.content)}
                                    </p>
                                 </div>
                                 <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                              </a>
                           </li>
                        ))}
                     </ul>
                  )}

                  {!query && (
                     <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                        Type to search the documentation
                     </div>
                  )}
               </div>
            </div>
         </dialog>
      </>
   );
}
