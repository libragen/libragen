interface LogoProps {
   className?: string;
}

export default function Logo({ className = 'h-8 w-8' }: LogoProps) {
   return (
      <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
         <rect x="4" y="4" width="8" height="24" rx="2" fill="#6366F1" />
         <rect x="4" y="20" width="24" height="8" rx="2" fill="#6366F1" />
         <rect x="14" y="8" width="14" height="3" rx="1" fill="#6366F1" opacity="0.3" />
         <rect x="14" y="13" width="14" height="3" rx="1" fill="#6366F1" opacity="0.5" />
      </svg>
   );
}
