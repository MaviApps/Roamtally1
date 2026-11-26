import React from 'react';

interface RoamTallyLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  showTagline?: boolean;
  className?: string;
}

const ICON_SIZES: Record<NonNullable<RoamTallyLogoProps['size']>, string> = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
};

export const RoamTallyLogo: React.FC<RoamTallyLogoProps> = ({
  size = 'md',
  showWordmark = true,
  showTagline = false,
  className = '',
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className={`${ICON_SIZES[size]} shrink-0`}
      >
        <rect width="64" height="64" rx="16" fill="#0D9488" />
        <rect x="4" y="4" width="56" height="56" rx="13" stroke="#14B8A6" strokeWidth="1.5" strokeOpacity="0.6" />
        {/* R monogram */}
        <path
          d="M14 46V18H25.5C30.4 18 33.5 20.8 33.5 25.4C33.5 28.9 31.4 31.4 27.8 32.3L34.2 46H28.3L22.5 33H19.4V46H14ZM19.4 28.4H25C27.2 28.4 28.4 27.3 28.4 25.4C28.4 23.5 27.2 22.5 25 22.5H19.4V28.4Z"
          fill="#FFFFFF"
        />
        {/* T monogram in sunset coral */}
        <path
          d="M35 23.2V18H52V23.2H46.2V46H40.8V23.2H35Z"
          fill="#FB923C"
        />
        {/* Small compass glint */}
        <circle cx="48.5" cy="42.5" r="3" fill="#F8FAFC" />
      </svg>

      {showWordmark && (
        <div className="leading-tight">
          <span className="block text-lg sm:text-xl font-bold tracking-tight text-slate-900 font-display whitespace-nowrap">
            RoamTally
          </span>
          {showTagline && (
            <span className="block text-[11px] font-medium text-teal-700 whitespace-nowrap">
              Powered by MaVi
            </span>
          )}
        </div>
      )}
    </div>
  );
};
