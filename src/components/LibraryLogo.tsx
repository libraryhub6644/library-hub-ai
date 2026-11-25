import React, { useEffect, useState } from 'react';
import type { Library } from '../types';

interface LibraryLogoProps {
  library: Pick<Library, 'name' | 'logoUrl' | 'themeColor'>;
  size?: 'sm' | 'md' | 'lg';
  showNameAlongsideLogo?: boolean;
}

export const LibraryLogo: React.FC<LibraryLogoProps> = ({
  library,
  size = 'md',
  showNameAlongsideLogo = true,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [library.logoUrl]);

  const dim =
    size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-12 w-12' : 'h-8 w-8 sm:h-9 sm:w-9';

  if (library.logoUrl && !imgFailed) {
    return (
      <span className="inline-flex items-center gap-2 sm:gap-2.5 min-w-0 max-w-full">
        <img
          src={library.logoUrl}
          alt={`${library.name} logo`}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`${dim} rounded-md object-contain bg-white/5 p-0.5 border hairline-divider shrink-0`}
        />
        {showNameAlongsideLogo && (
          <span className="font-display text-base sm:text-xl uppercase tracking-wider text-parchment whitespace-nowrap truncate min-w-0">
            {library.name}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 sm:gap-2.5 min-w-0 max-w-full">
      <span
        className={`${dim} rounded-md accent-soft-bg border accent-border flex items-center justify-center font-display text-base sm:text-lg accent-text shrink-0`}
      >
        {(library.name.trim()[0] || 'L').toUpperCase()}
      </span>
      {showNameAlongsideLogo && (
        <span className="font-display text-base sm:text-xl uppercase tracking-wider text-parchment whitespace-nowrap truncate min-w-0">
          {library.name}
        </span>
      )}
    </span>
  );
};
