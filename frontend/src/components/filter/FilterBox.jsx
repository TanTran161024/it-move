import { Box, Typography, Stack, Button, TextField, Divider } from '@mui/material';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import PropTypes from 'prop-types';
import './FilterBox.css';
import { useEffect, useState } from 'react';
import axios from 'axios';

export default function FilterBox({
  country, setCountry,
  type, setType,
  rating, setRating,
  genre, setGenre,
  year, setYear,
  inputYear, setInputYear,
  sort, setSort,
  onClose,
  onFilter
}) {
  // Xử lý chọn nhiều thể loại
  const handleGenreClick = (g) => {
    if (g === 'Tất cả') {
      setGenre(['Tất cả']);
      return;
    }
    setGenre(prev => {
      let newGenres = Array.isArray(prev) ? [...prev] : (prev && prev !== 'Tất cả' ? [prev] : []);
      if (newGenres.includes(g)) {
        if (newGenres.length === 1) {
          return ['Tất cả'];
        }
        return newGenres.filter(item => item !== g);
      } else {
        newGenres = newGenres.filter(item => item !== 'Tất cả');
        newGenres.push(g);
        return newGenres;
      }
    });
  };

  // Xử lý chọn nhiều quốc gia
  const handleCountryClick = (c) => {
    if (c === 'Tất cả') {
      setCountry(['Tất cả']);
      return;
    }
    let newCountries = Array.isArray(country) ? [...country] : (country && country !== 'Tất cả' ? [country] : []);
    if (newCountries.includes(c)) {
      if (newCountries.length === 1) {
        setCountry(['Tất cả']);
        return;
      }
      newCountries = newCountries.filter(item => item !== c);
    } else {
      newCountries = newCountries.filter(item => item !== 'Tất cả');
      newCountries.push(c);
    }
    setCountry(newCountries);
  };

  // Xử lý chọn nhiều xếp hạng
  const handleRatingClick = (r) => {
    if (r === 'Tất cả') {
      setRating(['Tất cả']);
      return;
    }
    setRating(prev => {
      let newRatings = Array.isArray(prev) ? [...prev] : (prev && prev !== 'Tất cả' ? [prev] : []);
      if (newRatings.includes(r)) {
        if (newRatings.length === 1) {
          return ['Tất cả'];
        }
        return newRatings.filter(item => item !== r);
      } else {
        newRatings = newRatings.filter(item => item !== 'Tất cả');
        newRatings.push(r);
        return newRatings;
      }
    });
  };

  // Xử lý chọn nhiều năm
  const handleYearClick = (y) => {
    if (y === 'Tất cả') {
      setYear(['Tất cả']);
      return;
    }
    setYear(prev => {
      let newYears = Array.isArray(prev) ? [...prev] : (prev && prev !== 'Tất cả' ? [prev] : []);
      if (newYears.includes(y)) {
        if (newYears.length === 1) {
          return ['Tất cả'];
        }
        return newYears.filter(item => item !== y);
      } else {
        newYears = newYears.filter(item => item !== 'Tất cả');
        newYears.push(y);
        return newYears;
      }
    });
  };

  const handleFilter = () => {
    let filterYear = year;
    if (inputYear && /^\d{4}$/.test(inputYear)) {
      filterYear = inputYear;
    }
    onFilter({
      country: Array.isArray(country) ? country.filter(c => c !== 'Tất cả') : (country && country !== 'Tất cả' ? [country] : []),
      type,
      rating: Array.isArray(rating) ? rating.filter(r => r !== 'Tất cả') : (rating && rating !== 'Tất cả' ? [rating] : []),
      genre: Array.isArray(genre) ? genre.filter(g => g !== 'Tất cả') : (genre && genre !== 'Tất cả' ? [genre] : []),
      year: Array.isArray(filterYear) ? filterYear.filter(y => y !== 'Tất cả') : (filterYear && filterYear !== 'Tất cả' ? [filterYear] : []),
      sort
    });
  };

  const ratingOptions = [
    { label: "Tất cả", value: "Tất cả" },
    { label: "P (Mọi lứa tuổi)", value: "P" },
    { label: "K (Dưới 13 tuổi)", value: "K" },
    { label: "T13 (13 tuổi trở lên)", value: "T13" },
    { label: "T16 (16 tuổi trở lên)", value: "T16" },
    { label: "T18 (18 tuổi trở lên)", value: "T18" }
  ];

  const [countryOptions, setCountryOptions] = useState(["Tất cả"]);
  const [genreOptions, setGenreOptions] = useState(["Tất cả"]);

  useEffect(() => {
    axios.get('/api/countries').then(res => {
      setCountryOptions(["Tất cả", ...res.data.map(c => c.name)]);
    });
    axios.get('/api/genres').then(res => {
      setGenreOptions(["Tất cả", ...res.data.map(g => g.name)]);
    });
  }, []);

  return (
    <Box className="filter-box">
      {/* Quốc gia */}
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap" className="filter-row">
        <Typography className="filter-label">Quốc gia:</Typography>
        <div className="filter-btn-group">
          {countryOptions.map(c => (
            <Button key={c} size="small"
              variant={Array.isArray(country) ? country.includes(c) : country === c ? 'contained' : 'text'}
              className={`filter-btn${(Array.isArray(country) && country.length === 1 && country[0] === 'Tất cả') ? (c === 'Tất cả' ? ' active' : '') : (Array.isArray(country) && country.includes(c) ? ' active' : '')}`}
              onClick={() => handleCountryClick(c)}
            >{c}</Button>
          ))}
        </div>
      </Stack>
      <Divider className="filter-divider" />
      {/* Loại phim */}
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap" className="filter-row">
        <Typography className="filter-label">Loại phim:</Typography>
        <div className="filter-btn-group">
          {["Tất cả", "Phim lẻ", "Phim bộ"].map(t => (
            <Button key={t} size="small" variant={type === t ? 'contained' : 'text'}
              className={`filter-btn${type === t ? ' active' : ''}`}
              onClick={() => setType(t)}
            >{t}</Button>
          ))}
        </div>
      </Stack>
      <Divider className="filter-divider" />
      {/* Xếp hạng */}
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap" className="filter-row">
        <Typography className="filter-label">Xếp hạng:</Typography>
        <div className="filter-btn-group">
          {ratingOptions.map(r => (
            <Button key={r.value} size="small"
              variant={Array.isArray(rating) ? rating.includes(r.value) : rating === r.value ? 'contained' : 'text'}
              className={`filter-btn${(Array.isArray(rating) && rating.length === 1 && rating[0] === 'Tất cả') ? (r.value === 'Tất cả' ? ' active' : '') : (Array.isArray(rating) && rating.includes(r.value) ? ' active' : '')}`}
              onClick={() => handleRatingClick(r.value)}
            >{r.label}</Button>
          ))}
        </div>
      </Stack>
      <Divider className="filter-divider" />
      {/* Thể loại */}
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap" className="filter-row">
        <Typography className="filter-label">Thể loại:</Typography>
        <div className="filter-btn-group">
          {genreOptions.map(g => (
            <Button key={g} size="small"
              variant={Array.isArray(genre) ? genre.includes(g) : genre === g ? 'contained' : 'text'}
              className={`filter-btn${(Array.isArray(genre) && genre.length === 1 && genre[0] === 'Tất cả') ? (g === 'Tất cả' ? ' active' : '') : (Array.isArray(genre) && genre.includes(g) ? ' active' : '')}`}
              onClick={() => handleGenreClick(g)}
            >{g}</Button>
          ))}
        </div>
      </Stack>
      <Divider className="filter-divider" />
      {/* Năm sản xuất */}
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap" className="filter-row">
        <Typography className="filter-label">Năm sản xuất:</Typography>
        <div className="filter-btn-group">
          {["Tất cả", 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010].map(y => (
            <Button key={y} size="small"
              variant={Array.isArray(year) ? year.includes(y) : year === y ? 'contained' : 'text'}
              className={`filter-btn${(Array.isArray(year) && year.length === 1 && year[0] === 'Tất cả') ? (y === 'Tất cả' ? ' active' : '') : (Array.isArray(year) && year.includes(y) ? ' active' : '')}`}
              onClick={() => handleYearClick(y)}
            >{y}</Button>
          ))}
          <TextField
            size="small"
            placeholder="Nhập năm"
            value={inputYear}
            onChange={e => setInputYear(e.target.value)}
            className="filter-year-input"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              disableUnderline: true
            }}
          />
        </div>
      </Stack>
      <Divider className="filter-divider" />
      {/* Sắp xếp */}
      <Stack direction="row" alignItems="center" spacing={2} mb={3} flexWrap="wrap" className="filter-row">
        <Typography className="filter-label">Sắp xếp:</Typography>
        <div className="filter-btn-group">
          {["Mới nhất", "Mới cập nhật", "Điểm IMDb", "Lượt xem"].map(s => (
            <Button key={s} size="small" variant={sort === s ? 'contained' : 'text'}
              className={`filter-btn${sort === s ? ' active' : ''}`}
              onClick={() => setSort(s)}
            >{s}</Button>
          ))}
        </div>
      </Stack>
      {/* Nút lọc và đóng */}
      <Stack direction="row" spacing={2} mt={2} className="filter-actions">
        <Button
          variant="contained"
          className="filter-apply"
          onClick={handleFilter}
        >
          Lọc kết quả
        </Button>
        <Button
          variant="outlined"
          className="filter-close"
          onClick={onClose}
        >
          Đóng
        </Button>
      </Stack>
    </Box>
  );
}

FilterBox.propTypes = {
  country: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]).isRequired,
  setCountry: PropTypes.func.isRequired,
  type: PropTypes.string.isRequired,
  setType: PropTypes.func.isRequired,
  rating: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]).isRequired,
  setRating: PropTypes.func.isRequired,
  genre: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]).isRequired,
  setGenre: PropTypes.func.isRequired,
  year: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]).isRequired,
  setYear: PropTypes.func.isRequired,
  inputYear: PropTypes.string.isRequired,
  setInputYear: PropTypes.func.isRequired,
  sort: PropTypes.string.isRequired,
  setSort: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onFilter: PropTypes.func
}; 