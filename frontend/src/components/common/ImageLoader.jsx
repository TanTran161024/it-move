import React, { useState, useEffect, useRef } from 'react';

export default function ImageLoader({ src, alt, className, style, decoding = "async", ...props }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect(); // Only load once
          }
        });
      },
      { rootMargin: '80px 0px' } // Preload near viewport without pulling distant horizontal posters
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className={`relative overflow-hidden bg-white/5 ${className}`} style={style}>
      {/* Skeleton Shimmer */}
      {!isLoaded && !isError && (
        <div className="absolute inset-0 z-0 bg-white/5">
          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
      )}

      {/* Actual Image */}
      {isInView && (
        <img
          src={isError ? '/posters/the-matrix.jpg' : src} // Fallback if error
          alt={alt}
          decoding={decoding}
          onLoad={() => setIsLoaded(true)}
          onError={() => setIsError(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          {...props}
        />
      )}
    </div>
  );
}
