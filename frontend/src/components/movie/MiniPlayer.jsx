import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useMiniPlayer from '../../contexts/useMiniPlayer';
import { FaPlay, FaPause, FaTimes, FaExpand } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

const MotionDiv = motion.div;

export default function MiniPlayer() {
  const { isOpen, movie, isPaused, closeMiniPlayer, togglePause } = useMiniPlayer();
  const navigate = useNavigate();

  const handleExpand = () => {
    if (movie?.id) {
      navigate(`/watch/${movie.id}`);
      closeMiniPlayer();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && movie && (
        <MotionDiv
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed bottom-6 right-6 z-[999] w-[320px] aspect-video bg-black rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 group/mini"
        >
          {/* Fake Video Layer / Mockup */}
          <img 
            src={movie.backdrop_url || movie.poster_url || '/posters/the-matrix.jpg'} 
            alt={movie.title}
            className="w-full h-full object-cover opacity-80 pointer-events-none"
          />
          <div className="absolute inset-0 bg-black/30" />

          {/* Controls Overlay */}
          <div className="absolute inset-0 flex flex-col justify-between p-3 opacity-0 group-hover/mini:opacity-100 transition-opacity duration-300 bg-gradient-to-t from-black/80 via-transparent to-black/60">
            {/* Top Bar */}
            <div className="flex justify-between items-start">
              <span className="text-white text-xs font-bold truncate max-w-[200px] drop-shadow-md">
                {movie.title}
              </span>
              <div className="flex gap-2">
                <button onClick={handleExpand} className="text-white hover:text-primary transition-colors">
                  <FaExpand size={12} />
                </button>
                <button onClick={closeMiniPlayer} className="text-white hover:text-primary transition-colors">
                  <FaTimes size={14} />
                </button>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="flex items-center gap-3">
              <button onClick={togglePause} className="text-white hover:text-primary transition-colors">
                {isPaused ? <FaPlay size={14} /> : <FaPause size={14} />}
              </button>
              <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                <div className="h-full bg-primary w-1/3" />
              </div>
            </div>
          </div>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}
