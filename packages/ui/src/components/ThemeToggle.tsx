import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
   const [ theme, setTheme ] = useState<'light' | 'dark'>('dark');

   useEffect(() => {
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;

      if (savedTheme) {
         setTheme(savedTheme);
      } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
         setTheme('light');
      }
   }, []);

   useEffect(() => {
      if (theme === 'dark') {
         document.documentElement.classList.add('dark');
      } else {
         document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('theme', theme);
   }, [ theme ]);

   const toggleTheme = () => {
      setTheme(theme === 'dark' ? 'light' : 'dark');
   };

   return (
      <button
         onClick={toggleTheme}
         className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
         aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
         {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
   );
}
