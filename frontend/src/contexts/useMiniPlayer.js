import { useContext } from 'react';
import MiniPlayerContext from './MiniPlayerContext';

export default function useMiniPlayer() {
  return useContext(MiniPlayerContext);
}
