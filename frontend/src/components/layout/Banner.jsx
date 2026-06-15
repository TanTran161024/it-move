import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Stack, Chip, IconButton } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useNavigate } from 'react-router-dom';
import './Banner.css';

function snakeToCamel(obj) {
  if (Array.isArray(obj)) {
    return obj.map(v => snakeToCamel(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/([-_][a-z])/g, g => g[1].toUpperCase()),
        snakeToCamel(v)
      ])
    );
  }
  return obj;
}

function parseBannerFields(banner) {
  return {
    ...banner,
    badges: Array.isArray(banner.badges)
      ? banner.badges
      : (banner.badges ? JSON.parse(banner.badges) : []),
    tags: Array.isArray(banner.tags)
      ? banner.tags
      : (banner.tags ? JSON.parse(banner.tags) : []),
    thumbnails: Array.isArray(banner.thumbnails)
      ? banner.thumbnails
      : (banner.thumbnails ? JSON.parse(banner.thumbnails) : []),
  };
}

const MAX_BANNERS = 6;

export default function Banner() {
  const [banners, setBanners] = useState([]);
  const [selected, setSelected] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const navigate = useNavigate();
  const [hoveredTagIndex, setHoveredTagIndex] = React.useState(null);
  const [dragStartX, setDragStartX] = React.useState(null);
  const [dragging, setDragging] = React.useState(false);

  useEffect(() => {
    fetch('http://localhost:5000/api/banners')
      .then(res => res.json())
      .then(data => setBanners(data.map(snakeToCamel).map(parseBannerFields)))
      .catch(err => console.error('Lỗi fetch banner:', err));
  }, []);

  const displayBanners = banners.slice(0, MAX_BANNERS);
  const banner = displayBanners[selected];

  if (!banner) {
    return <div style={{minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888'}}>Không có banner nào!</div>;
  }

  // Handle banner change with fade effect
  const handleBannerChange = (newIndex) => {
    setIsFading(true);
    setTimeout(() => {
      setSelected(newIndex);
      setTimeout(() => {
        setIsFading(false);
      }, 50);
    }, 250);
  };

  // Handle manual banner selection
  const handleBannerSelect = (index) => {
    handleBannerChange(index);
  };

  // Handler cho mouse
  const handleMouseDown = (e) => {
    setDragStartX(e.clientX);
    setDragging(true);
  };
  const handleMouseMove = (e) => {
    if (!dragging || dragStartX === null) return;
    const deltaX = e.clientX - dragStartX;
    if (Math.abs(deltaX) > 60) {
      if (deltaX > 0 && selected > 0) {
        handleBannerChange(selected - 1);
      } else if (deltaX < 0 && selected < displayBanners.length - 1) {
        handleBannerChange(selected + 1);
      }
      setDragging(false);
      setDragStartX(null);
    }
  };
  const handleMouseUp = () => {
    setDragging(false);
    setDragStartX(null);
  };
  // Handler cho touch
  const handleTouchStart = (e) => {
    if (e.touches && e.touches.length === 1) {
      setDragStartX(e.touches[0].clientX);
      setDragging(true);
    }
  };
  const handleTouchMove = (e) => {
    if (!dragging || dragStartX === null || !e.touches || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - dragStartX;
    if (Math.abs(deltaX) > 60) {
      if (deltaX > 0 && selected > 0) {
        handleBannerChange(selected - 1);
      } else if (deltaX < 0 && selected < displayBanners.length - 1) {
        handleBannerChange(selected + 1);
      }
      setDragging(false);
      setDragStartX(null);
    }
  };
  const handleTouchEnd = () => {
    setDragging(false);
    setDragStartX(null);
  };

  return (
    <Box
      className="banner-root"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background image */}
      <Box
        component="img"
        src={banner.bgUrl}
        alt={banner.name + ' Background'}
        className="banner-bg"
        sx={{ opacity: isFading ? 0 : 1 }}
      />
      {/* Fade out dưới */}
      <Box className="banner-fade" />
      {/* Overlay */}
      <Box className="banner-overlay" />
      {/* Content */}
      <Box 
        className="banner-content"
        sx={{ opacity: isFading ? 0 : 1 }}
      >
        <Box>
          <Box className="banner-title-img-box">
            {banner.titleUrl && (
              <Box
                component="img"
                src={banner.titleUrl}
                alt={banner.name}
                className="banner-title-img"
              />
            )}
          </Box>
          <Typography variant="h6" className="banner-title">
            {banner.movieTitle || banner.name}
          </Typography>
          <Stack direction="row" spacing={1} className="banner-badges">
            {/* IMDb badge */}
            {banner.imdbRating && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  border: '2px solid #f5c518',
                  borderRadius: 8,
                  height: 32,
                  padding: '0 6px',
                  marginRight: 0,
                  fontSize: 15,
                  lineHeight: '32px',
                  background: 'transparent',
                }}
              >
                <span style={{ color: '#f5c518', fontWeight: 700, fontSize: 15, marginRight: 4 }}>IMDb</span>
                <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{Number(banner.imdbRating).toFixed(1)}</span>
              </span>
            )}
            {/* Quality badge */}
            {banner.quality && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'linear-gradient(135deg, #fff 60%, #ffe082 100%)',
                  color: '#222',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 17,
                  fontFamily: 'monospace',
                  padding: '0 6px',
                  height: 32,
                  lineHeight: '32px',
                  marginRight: 0,
                  boxShadow: '0 1px 4px 0 #ffe08255',
                  border: 'none',
                  minWidth: 0,
                }}
              >
                {banner.quality}
              </span>
            )}
            {/* Age limit badge */}
            {banner.ageLimit && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: '#fff',
                  color: '#222',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 15,
                  fontFamily: 'monospace',
                  padding: '0 6px',
                  height: 32,
                  lineHeight: '32px',
                  marginRight: 0,
                  border: 'none',
                  minWidth: 0,
                }}
              >
                {banner.ageLimit}
              </span>
            )}
            {/* Release year badge */}
            {banner.releaseYear && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'transparent',
                  color: '#fff',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 15,
                  fontFamily: 'monospace',
                  padding: '0 6px',
                  height: 32,
                  lineHeight: '32px',
                  marginRight: 0,
                  border: '2px solid #fff',
                  minWidth: 0,
                }}
              >
                {banner.releaseYear}
              </span>
            )}
            {/* Duration badge */}
            {banner.duration && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'transparent',
                  color: '#fff',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 15,
                  fontFamily: 'monospace',
                  padding: '0 6px',
                  height: 32,
                  lineHeight: '32px',
                  marginRight: 0,
                  border: '2px solid #fff',
                  minWidth: 0,
                }}
              >
                {banner.duration}
              </span>
            )}
          </Stack>
          <Stack direction="row" spacing={1} className="banner-tags">
            {/* Genres as tags */}
            {banner.genres && banner.genres.map((tag, idx) => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: '#222',
                  color: hoveredTagIndex === idx ? '#f5c518' : '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 500,
                  fontSize: 13,
                  padding: '0 14px',
                  height: 32,
                  lineHeight: '32px',
                  marginRight: 10,
                  marginBottom: 4,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'color 0.15s',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
                onClick={() => navigate(`/movies?genre=${encodeURIComponent(tag)}`)}
                onMouseEnter={() => setHoveredTagIndex(idx)}
                onMouseLeave={() => setHoveredTagIndex(null)}
              >
                {tag}
              </span>
            ))}
          </Stack>
          <Typography variant="body2" className="banner-desc">
            {banner.description || banner.desc || "Không có mô tả"}
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="contained"
            className="banner-btn-play"
            startIcon={<PlayArrowIcon />}
            onClick={() => navigate(`/watch/${banner.movieId || banner.movie_id || banner.id}`)}
          >
            Xem ngay
          </Button>
          <IconButton className="banner-btn-icon">
            <FavoriteBorderIcon />
          </IconButton>
          <IconButton className="banner-btn-icon" onClick={() => navigate(`/movies/${banner.movieId || banner.movie_id || banner.id}`)}>
            <InfoOutlinedIcon />
          </IconButton>
        </Stack>
      </Box>
      {/* Thumbnails */}
      <Box className="banner-thumbnails">
        {displayBanners.map((b, idx) => (
          <Box
            key={b.id || idx}
            component="img"
            src={b.thumbnails && b.thumbnails[idx] ? b.thumbnails[idx] : b.bgUrl}
            alt={b.name}
            onClick={() => handleBannerSelect(idx)}
            className={`banner-thumbnail${idx === selected ? ' selected' : ''}`}
          />
        ))}
      </Box>
    </Box>
  );
}
