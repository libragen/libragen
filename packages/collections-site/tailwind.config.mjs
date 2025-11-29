import sharedConfig from '@libragen/ui/tailwind.config';

/** @type {import('tailwindcss').Config} */
export default {
   presets: [sharedConfig],
   content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
};
