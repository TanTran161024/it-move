import { useState } from 'react';
import MiniPlayerContext from './MiniPlayerContext';

export default function MiniPlayerProvider({ children }) {
  const [miniPlayerState, setMiniPlayerState] = useState({
    isOpen: false,
    movie: null,
    progress: 0,
    isPaused: false,
  });

  const openMiniPlayer = (movie, progress = 0) => {
    setMiniPlayerState({
      isOpen: true,
      movie,
      progress,
      isPaused: false,
    });
  };

  const closeMiniPlayer = () => {
    setMiniPlayerState((prev) => ({ ...prev, isOpen: false }));
  };

  const togglePause = () => {
    setMiniPlayerState((prev) => ({ ...prev, isPaused: !prev.isPaused }));
  };

  return (
    <MiniPlayerContext.Provider
      value={{
        ...miniPlayerState,
        openMiniPlayer,
        closeMiniPlayer,
        togglePause,
      }}
    >
      {children}
    </MiniPlayerContext.Provider>
  );
}
