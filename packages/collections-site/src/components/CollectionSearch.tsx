import { useState, useMemo } from 'react';
import { Search, Library, Copy, Check, ExternalLink } from '@libragen/ui/components/icons';

interface Library {
   name: string;
   description: string;
   version: string;
   contentVersion: string;
}

interface Collection {
   slug: string;
   name: string;
   description: string;
   author: string;
   url: string;
   libraries: Library[];
   updatedAt: string;
}

interface CollectionSearchProps {
   collections: Collection[];
}

export default function CollectionSearch({ collections }: CollectionSearchProps) {
   const [ query, setQuery ] = useState('');
   const [ copiedSlug, setCopiedSlug ] = useState<string | null>(null);

   const filteredCollections = useMemo(() => {
      if (!query.trim()) return collections;

      const lowerQuery = query.toLowerCase();
      return collections.filter(
         (c) =>
            c.name.toLowerCase().includes(lowerQuery) ||
            c.description.toLowerCase().includes(lowerQuery) ||
            c.libraries.some(
               (lib) => lib.name.toLowerCase().includes(lowerQuery) || lib.description.toLowerCase().includes(lowerQuery),
            ),
      );
   }, [ query, collections ]);

   const copyCommand = async (slug: string) => {
      const command = `npx @libragen/cli install --collection ${slug}`;
      await navigator.clipboard.writeText(command);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
   };

   return (
      <div className="space-y-8">
         {/* Search Input */}
         <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
               type="text"
               placeholder="Search collections or libraries..."
               value={query}
               onChange={(e) => setQuery(e.target.value)}
               className="w-full rounded-xl border border-gray-200 bg-white py-4 pl-12 pr-4 text-lg shadow-sm transition-shadow placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
            />
         </div>

         {/* Results count */}
         <p className="text-sm text-gray-500 dark:text-gray-400">
            {filteredCollections.length} collection{filteredCollections.length !== 1 ? 's' : ''} found
         </p>

         {/* Collection Cards */}
         <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredCollections.map((collection) => (
               <div
                  key={collection.slug}
                  className="group flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-600"
               >
                  {/* Header */}
                  <div className="mb-4">
                     <div className="flex items-start justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{collection.name}</h3>
                        <a
                           href={`/${collection.slug}`}
                           className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                           aria-label={`View ${collection.name} details`}
                        >
                           <ExternalLink className="h-4 w-4" />
                        </a>
                     </div>
                     <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{collection.description}</p>
                  </div>

                  {/* Libraries */}
                  <div className="mb-4 flex-1">
                     <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        <Library className="h-3.5 w-3.5" />
                        <span>{collection.libraries.length} libraries</span>
                     </div>
                     <div className="mt-2 flex flex-wrap gap-1.5">
                        {collection.libraries.slice(0, 4).map((lib) => (
                           <span
                              key={lib.name}
                              className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                           >
                              {lib.name}
                           </span>
                        ))}
                        {collection.libraries.length > 4 && (
                           <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                              +{collection.libraries.length - 4} more
                           </span>
                        )}
                     </div>
                  </div>

                  {/* Install Command */}
                  <div className="mt-auto">
                     <button
                        onClick={() => copyCommand(collection.slug)}
                        className="flex w-full items-center justify-between rounded-lg bg-gray-900 px-3 py-2 font-mono text-xs text-gray-300 transition-colors hover:bg-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900"
                     >
                        <span className="truncate">npx @libragen/cli install --collection {collection.slug}</span>
                        {copiedSlug === collection.slug ? (
                           <Check className="ml-2 h-4 w-4 shrink-0 text-green-400" />
                        ) : (
                           <Copy className="ml-2 h-4 w-4 shrink-0 text-gray-500" />
                        )}
                     </button>
                  </div>

                  {/* Footer */}
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                     <span>by {collection.author}</span>
                     <span>Updated {collection.updatedAt}</span>
                  </div>
               </div>
            ))}
         </div>

         {/* Empty state */}
         {filteredCollections.length === 0 && (
            <div className="py-12 text-center">
               <p className="text-gray-500 dark:text-gray-400">No collections found matching "{query}"</p>
            </div>
         )}
      </div>
   );
}
