import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL as API } from '../../config/api';

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
  const [countryOptions, setCountryOptions] = useState(["Tất cả"]);
  const [genreOptions, setGenreOptions] = useState(["Tất cả"]);

  useEffect(() => {
    axios.get(`${API}/api/countries`).then(res => {
      setCountryOptions(["Tất cả", ...res.data.map(c => c.name)]);
    });
    axios.get(`${API}/api/genres`).then(res => {
      setGenreOptions(["Tất cả", ...res.data.map(g => g.name)]);
    });
  }, []);

  const handleMultiSelect = (item, currentSelection, setFn) => {
    if (item === 'Tất cả') {
      setFn(['Tất cả']);
      return;
    }
    setFn(prev => {
      let newSelection = Array.isArray(prev) ? [...prev] : (prev && prev !== 'Tất cả' ? [prev] : []);
      if (newSelection.includes(item)) {
        if (newSelection.length === 1) return ['Tất cả'];
        return newSelection.filter(i => i !== item);
      } else {
        newSelection = newSelection.filter(i => i !== 'Tất cả');
        newSelection.push(item);
        return newSelection;
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

  const isSelected = (item, currentSelection) => {
    if (Array.isArray(currentSelection)) {
      if (currentSelection.length === 1 && currentSelection[0] === 'Tất cả') return item === 'Tất cả';
      return currentSelection.includes(item);
    }
    return currentSelection === item;
  };

  const ratingOptions = [
    { label: "Tất cả", value: "Tất cả" },
    { label: "P (Mọi lứa)", value: "P" },
    { label: "K (Dưới 13)", value: "K" },
    { label: "T13 (13+)", value: "T13" },
    { label: "T16 (16+)", value: "T16" },
    { label: "T18 (18+)", value: "T18" }
  ];

  const yearOptions = ["Tất cả", 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010];

  const Pill = ({ active, onClick, children }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
        active 
        ? 'bg-primary border-primary text-white' 
        : 'bg-white/5 border-white/10 text-text-secondary hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  );

  const FilterRow = ({ label, children }) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <span className="text-white font-bold text-sm min-w-[100px] flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 sm:pb-0 w-full mask-edges">
        {children}
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <FilterRow label="Sắp xếp theo">
        {["Mới nhất", "Mới cập nhật", "Điểm IMDb", "Lượt xem"].map(s => (
          <Pill key={s} active={sort === s} onClick={() => setSort(s)}>{s}</Pill>
        ))}
      </FilterRow>

      <FilterRow label="Định dạng">
        {["Tất cả", "Phim lẻ", "Phim bộ"].map(t => (
          <Pill key={t} active={type === t} onClick={() => setType(t)}>{t}</Pill>
        ))}
      </FilterRow>

      <FilterRow label="Thể loại">
        {genreOptions.map(g => (
          <Pill key={g} active={isSelected(g, genre)} onClick={() => handleMultiSelect(g, genre, setGenre)}>{g}</Pill>
        ))}
      </FilterRow>

      <FilterRow label="Quốc gia">
        {countryOptions.map(c => (
          <Pill key={c} active={isSelected(c, country)} onClick={() => handleMultiSelect(c, country, setCountry)}>{c}</Pill>
        ))}
      </FilterRow>

      <FilterRow label="Năm phát hành">
        {yearOptions.map(y => (
          <Pill key={y} active={isSelected(y, year)} onClick={() => handleMultiSelect(y, year, setYear)}>{y}</Pill>
        ))}
        <div className="flex-shrink-0 relative">
          <input
            type="number"
            placeholder="Năm khác..."
            value={inputYear}
            onChange={e => setInputYear(e.target.value)}
            className="w-28 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </FilterRow>

      <FilterRow label="Độ tuổi">
        {ratingOptions.map(r => (
          <Pill key={r.value} active={isSelected(r.value, rating)} onClick={() => handleMultiSelect(r.value, rating, setRating)}>
            {r.label}
          </Pill>
        ))}
      </FilterRow>

      <div className="flex items-center gap-3 pt-4 border-t border-white/10">
        <button
          onClick={handleFilter}
          className="bg-primary hover:bg-red-600 text-white font-bold py-2.5 px-6 rounded-full transition-colors shadow-lg shadow-primary/25"
        >
          Áp dụng bộ lọc
        </button>
        <button
          onClick={onClose}
          className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-2.5 px-6 rounded-full transition-colors"
        >
          Đóng
        </button>
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @media (max-width: 640px) {
          .mask-edges {
            mask-image: linear-gradient(to right, black 85%, transparent 100%);
            -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
            padding-right: 32px;
          }
        }
      `}</style>
    </div>
  );
}
