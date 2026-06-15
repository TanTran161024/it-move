import React, { useState, useRef, useEffect } from 'react';
import { Box, Typography, CardMedia, Button, Chip, IconButton } from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import './MovieSlider.css';
import { useNavigate } from 'react-router-dom';

const MAX_VISIBLE = 8;
const POSTER_WIDTH = 200 + 24;
const FALLBACK_POSTER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%2323242a'/%3E%3Cpath d='M118 170v110l92-55z' fill='%23ffd600'/%3E%3Ctext x='150' y='330' fill='%23fff' font-family='Arial,sans-serif' font-size='20' text-anchor='middle'%3ENo poster%3C/text%3E%3C/svg%3E";

export default function MovieSlider({ movies, title, categoryId, categoryName }) {
  const [startIndex, setStartIndex] = useState(0);
  const [hovered, setHovered] = useState(null);
  const [popupPos, setPopupPos] = useState(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const hoverTimeout = useRef();
  const sliderRef = useRef();
  const posterRefs = useRef([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragDelta, setDragDelta] = useState(0);
  const dragStartIndex = useRef(0);
  const [seeMoreHover, setSeeMoreHover] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MAX_VISIBLE);
  const navigate = useNavigate();

  const MAX_POSTERS = 16;
  const displayMovies = movies.slice(-MAX_POSTERS);

  const handlePrev = () => setStartIndex(i => Math.max(0, i - 1));
  const handleNext = () => setStartIndex(i => Math.min(displayMovies.length - visibleCount, i + 1));

  const handleSeeMore = () => {
    if (categoryId && categoryName) {
      // Nếu có danh mục, chuyển đến trang danh sách phim với thông tin danh mục
      navigate('/movies', { 
        state: { 
          categoryId: categoryId, 
          categoryName: categoryName,
          filterType: 'category'
        } 
      });
    } else {
      // Nếu không có danh mục (Tất cả phim), chuyển đến trang danh sách phim bình thường
      navigate('/movies');
    }
  };

  const handleMouseEnter = (idx) => {
    hoverTimeout.current = setTimeout(() => {
      setHovered(idx);
      setPopupOpen(true);
      if (posterRefs.current[idx] && sliderRef.current) {
        const posterRect = posterRefs.current[idx].getBoundingClientRect();
        const sliderRect = sliderRef.current.getBoundingClientRect();
        const popupWidth = 400;
        let left = posterRect.left - sliderRect.left + posterRect.width / 2 - popupWidth / 2;
        left = Math.max(0, Math.min(left, sliderRect.width - popupWidth));
        const top = posterRect.top - sliderRect.top - 100;
        const adjustedTop = top + 30;
        setPopupPos({ left, top: adjustedTop });
      }
    }, 800);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimeout.current);
    setTimeout(() => {
      if (!popupOpen) {
        setHovered(null);
        setPopupPos(null);
      }
    }, 100);
  };

  const handlePopupEnter = () => {
    setPopupOpen(true);
  };
  const handlePopupLeave = () => {
    setPopupOpen(false);
    setHovered(null);
    setPopupPos(null);
  };

  const handleDragStart = (e) => {
    setIsDragging(true);
    setDragStartX(e.type === 'touchstart' ? e.touches[0].clientX : e.clientX);
    dragStartIndex.current = startIndex;
    setDragDelta(0);
  };

  const handleDragMove = (e) => {
    if (!isDragging) return;
    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    let dx = clientX - dragStartX;
    // Clamp dragDelta để không kéo lố
    const maxLeft = 0;
    const maxRight = -((displayMovies.length - visibleCount) * POSTER_WIDTH);
    const currentOffset = -startIndex * POSTER_WIDTH + dx;
    if (currentOffset > maxLeft) {
      dx = startIndex * POSTER_WIDTH; // chặn kéo lố trái
    } else if (currentOffset < maxRight) {
      dx = -((displayMovies.length - visibleCount - startIndex) * POSTER_WIDTH); // chặn kéo lố phải
    }
    setDragDelta(dx);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    let newIndex = Math.min(
      Math.max(dragStartIndex.current + Math.round(-dragDelta / POSTER_WIDTH), 0),
      displayMovies.length - visibleCount
    );
    setStartIndex(newIndex);
    setIsDragging(false);
    setDragDelta(0);
  };

  // Responsive: cập nhật visibleCount khi resize
  useEffect(() => {
    function updateVisibleCount() {
      const sliderWidth = window.innerWidth * 0.98; // trừ padding
      const count = Math.min(MAX_VISIBLE, Math.floor(sliderWidth / POSTER_WIDTH));
      setVisibleCount(count < 1 ? 1 : count);
    }
    updateVisibleCount();
    window.addEventListener('resize', updateVisibleCount);
    return () => window.removeEventListener('resize', updateVisibleCount);
  }, []);

  // Đảm bảo startIndex không vượt quá giới hạn mới
  useEffect(() => {
    if (startIndex > Math.max(0, displayMovies.length - visibleCount)) {
      setStartIndex(Math.max(0, displayMovies.length - visibleCount));
    }
  }, [visibleCount, displayMovies.length]);

  const canScroll = displayMovies.length > visibleCount;

  return (
    <Box sx={{ position: 'relative', mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 5 }}>
        <Typography variant="h5" sx={{ color: '#fff', mr: 2 }}>{title}</Typography>
        <Box
          onMouseEnter={() => setSeeMoreHover(true)}
          onMouseLeave={() => setSeeMoreHover(false)}
          onClick={handleSeeMore}
          sx={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(.4,2,.6,1)',
            px: seeMoreHover ? 2 : 0,
            py: 0,
            borderRadius: 999,
            border: '1.5px solid #bdbdbd',
            bgcolor: 'transparent',
            color: seeMoreHover ? '#FFD600' : '#bdbdbd',
            minWidth: seeMoreHover ? 90 : 40,
            height: 40,
            overflow: 'hidden',
            fontWeight: 600,
            fontSize: 16,
          }}
        >
          {seeMoreHover ? (
            <>
              Xem thêm
              <ArrowForwardIosIcon sx={{ fontSize: 18, ml: 1 }} />
            </>
          ) : (
            <ArrowForwardIosIcon sx={{ fontSize: 24, mx: 'auto' }} />
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
        {/* Nút mũi tên trái */}
        {canScroll && startIndex > 0 && (
          <IconButton onClick={handlePrev} sx={{ position: 'absolute', left: -40, zIndex: 20, bgcolor: '#23242a', color: '#fff', '&:hover': { bgcolor: '#333' } }}>
            <ArrowBackIosNewIcon />
          </IconButton>
        )}
        {/* Danh sách poster với hiệu ứng chuyển động */}
        <Box
          ref={sliderRef}
          className="movie-slider-track"
          sx={{
            width: `${visibleCount * POSTER_WIDTH}px`,
            maxWidth: '100vw',
            overflow: 'hidden',
            position: 'relative',
            cursor: isDragging && canScroll ? 'grabbing' : canScroll ? 'grab' : 'default',
          }}
          onMouseDown={canScroll ? handleDragStart : undefined}
          onMouseMove={canScroll ? handleDragMove : undefined}
          onMouseUp={canScroll ? handleDragEnd : undefined}
          onMouseLeave={canScroll ? handleDragEnd : undefined}
          onTouchStart={canScroll ? handleDragStart : undefined}
          onTouchMove={canScroll ? handleDragMove : undefined}
          onTouchEnd={canScroll ? handleDragEnd : undefined}
        >
          <Box
            sx={{
              display: 'flex',
              gap: 3,
              transition: isDragging ? 'transform 0.2s cubic-bezier(.4,2,.6,1)' : 'transform 0.5s cubic-bezier(.4,2,.6,1)',
              transform: `translateX(-${canScroll ? (startIndex * POSTER_WIDTH - dragDelta) : 0}px)`,
              willChange: 'transform',
              justifyContent: displayMovies.length < visibleCount ? 'flex-start' : 'initial',
            }}
          >
            {displayMovies.map((movie, idx) => {
              // Chỉ render card nổi cho các poster visible
              const isVisible = idx >= startIndex && idx < startIndex + visibleCount;
              return (
                <Box
                  key={movie.id || idx}
                  sx={{ position: 'relative' }}
                  onMouseEnter={() => handleMouseEnter(idx)}
                  onMouseLeave={handleMouseLeave}
                  ref={el => posterRefs.current[idx] = el}
                >
                  <CardMedia
                    component="img"
                    image={movie.poster}
                    alt={movie.title}
                    referrerPolicy="no-referrer"
                    sx={{
                      width: 200,
                      height: 300,
                      borderRadius: 3,
                      boxShadow: hovered === idx ? 6 : 1,
                      transition: 'box-shadow 0.2s',
                      cursor: 'pointer',
                      zIndex: hovered === idx ? 2 : 1,
                    }}
                    onDragStart={e => e.preventDefault()}
                    onError={(e) => {
                      e.currentTarget.src = FALLBACK_POSTER;
                    }}
                    onClick={() => navigate(`/movies/${movie.id}`)}
                  />
                  {/* Tên phim dưới poster */}
                  <Box sx={{ textAlign: 'center', mt: 1 }}>
                    <Typography
                      variant="subtitle1"
                      sx={{
                        color: '#fff',
                        fontWeight: 300,
                        fontSize: 14,
                        lineHeight: 1.25,
                        mb: 0.2,
                        wordBreak: 'break-word',
                      }}
                    >
                      {movie.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: '#bdbdbd',
                        fontSize: 14,
                        lineHeight: 1.15,
                        wordBreak: 'break-word',
                      }}
                    >
                      {movie.originalTitle}
                    </Typography>
                  </Box>
                  {/* Card nổi khi hover - KHÔNG render ở đây nữa */}
                </Box>
              );
            })}
          </Box>
        </Box>
        {/* Nút mũi tên phải */}
        {canScroll && startIndex < displayMovies.length - visibleCount && (
          <IconButton onClick={handleNext} sx={{ position: 'absolute', right: -40, zIndex: 20, bgcolor: '#23242a', color: '#fff', '&:hover': { bgcolor: '#333' } }}>
            <ArrowForwardIosIcon />
          </IconButton>
        )}
        {/* Card nổi render ở ngoài slider, dùng position absolute */}
        {hovered !== null && popupPos && (
          <Box
            key={hovered}
            className="movie-slider-popup-appear"
            sx={{
              width: 450,
              height: 450,
              borderRadius: 3,
              boxShadow: 8,
              overflow: 'hidden',
              bgcolor: 'transparent',
              p: 0,
              position: 'absolute',
              top: popupPos.top,
              left: popupPos.left,
              zIndex: 200,
              display: 'flex',
              flexDirection: 'column',
            }}
            onMouseEnter={handlePopupEnter}
            onMouseLeave={handlePopupLeave}
          >
            {/* Ảnh nền */}
            <Box sx={{ height: 200, width: '100%', position: 'relative' }}>
              <CardMedia
                component="img"
                image={displayMovies[hovered].backdrop || displayMovies[hovered].poster}
                alt={displayMovies[hovered].title}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = FALLBACK_POSTER;
                }}
                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {/* Logo hoặc tiêu đề nổi trên ảnh nếu muốn */}
            </Box>
            {/* Phần thông tin phim */}
            <Box
              sx={{
                flex: 1,
                p: 2.5,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                bgcolor: '#23242a',
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 12,
              }}
            >
              {/* Tiêu đề phim */}
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, mb: 0.5 }}>
                {displayMovies[hovered].title}
              </Typography>
              <Typography variant="subtitle2" sx={{ color: '#FFD600', fontWeight: 400, mb: 1 }}>
                {displayMovies[hovered].originalTitle}
              </Typography>
              {/* Nút và badge */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, mt: 2 }}>
                <Button
                  variant="contained"
                  size="small"
                  sx={{ bgcolor: '#FFD600', color: '#23242a', fontWeight: 700, borderRadius: 2, px: 2, py: 0.5, fontSize: 13, minHeight: 28, height: 28, lineHeight: '24px', boxShadow: 'none', '&:hover': { bgcolor: '#ffe082', color: '#23242a' } }}
                  onClick={() => navigate(`/watch/${displayMovies[hovered].id}`)}
                >
                  Xem ngay
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  sx={{ color: '#fff', borderColor: '#fff', fontWeight: 600, borderRadius: 2, px: 1.5, py: 0.5, fontSize: 13, minHeight: 28, height: 28, lineHeight: '24px', boxShadow: 'none', display: 'flex', alignItems: 'center', '&:hover': { bgcolor: '#23242a', borderColor: '#FFD600', color: '#FFD600' } }}
                  startIcon={<span style={{fontSize:13, display:'flex', alignItems:'center'}}>❤</span>}
                >
                  Thích
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  sx={{ color: '#fff', borderColor: '#fff', fontWeight: 600, borderRadius: 2, px: 1.5, py: 0.5, fontSize: 13, minHeight: 28, height: 28, lineHeight: '24px', boxShadow: 'none', '&:hover': { bgcolor: '#23242a', borderColor: '#FFD600', color: '#FFD600' } }}
                  onClick={() => navigate(`/movies/${displayMovies[hovered].id}`)}
                >
                  Chi tiết
                </Button>
              </Box>
              {/* Badge IMDb, năm, thời lượng, tuổi giới hạn */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                {/* IMDb badge */}
                {displayMovies[hovered].imdb_rating && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', border: '2px solid #f5c518', borderRadius: 7, height: 24, padding: '0 5px', fontSize: 12, lineHeight: '24px', background: 'transparent', marginRight: 0 }}>
                    <span style={{ color: '#f5c518', fontWeight: 700, fontSize: 12, marginRight: 3 }}>IMDb</span>
                    <span style={{ color: '#fff', fontWeight: 600, fontSize: 12 }}>{Number(displayMovies[hovered].imdb_rating).toFixed(1)}</span>
                  </span>
                )}
                {/* Age limit badge */}
                {displayMovies[hovered].age_limit && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', background: '#fff', color: '#222', borderRadius: 7, fontWeight: 700, fontSize: 12, fontFamily: 'monospace', padding: '0 5px', height: 24, lineHeight: '24px', marginRight: 0, border: 'none', minWidth: 0 }}>
                    {displayMovies[hovered].age_limit}
                  </span>
                )}
                {/* Release year badge */}
                {displayMovies[hovered].release_year && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', color: '#fff', borderRadius: 7, fontWeight: 700, fontSize: 12, fontFamily: 'monospace', padding: '0 5px', height: 24, lineHeight: '24px', marginRight: 0, border: '2px solid #fff', minWidth: 0 }}>
                    {displayMovies[hovered].release_year}
                  </span>
                )}
                {/* Duration badge */}
                {displayMovies[hovered].duration && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', color: '#fff', borderRadius: 7, fontWeight: 700, fontSize: 12, fontFamily: 'monospace', padding: '0 5px', height: 24, lineHeight: '24px', marginRight: 0, border: '2px solid #fff', minWidth: 0 }}>
                    {displayMovies[hovered].duration}
                  </span>
                )}
              </Box>
              {/* Thể loại */}
              {displayMovies[hovered].genres && displayMovies[hovered].genres.length > 0 && (
                <Box sx={{ mt: 1, mb: 0.5 }}>
                  <span style={{ color: '#fff', fontSize: 15, fontWeight: 400 }}>
                    {displayMovies[hovered].genres.map((tag, idx) => (
                      <React.Fragment key={tag.name || tag}>
                        {tag.name || tag}{idx < displayMovies[hovered].genres.length - 1 && <span style={{ margin: '0 7px', color: '#fff' }}>•</span>}
                      </React.Fragment>
                    ))}
                  </span>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
} 
