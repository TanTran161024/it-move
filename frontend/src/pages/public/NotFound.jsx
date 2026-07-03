import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#080808] text-white px-4 text-center overflow-hidden relative">
      {/* Background Effect */}
      <div className="absolute inset-0 z-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/30 via-[#080808] to-[#080808]" />

      <div className="relative z-10 flex flex-col items-center">
        <h1 className="text-[120px] md:text-[200px] font-black font-heading leading-none text-transparent bg-clip-text bg-gradient-to-b from-white to-white/10 mb-4 select-none">
          404
        </h1>
        <h2 className="text-2xl md:text-4xl font-bold mb-6">Bạn đã lạc vào vùng không gian vô định.</h2>
        <p className="text-text-secondary max-w-lg mb-10 text-lg">
          Trang bạn tìm kiếm không tồn tại, đã bị xóa hoặc tạm thời không thể truy cập. Hãy quay lại trang chủ để khám phá hàng ngàn tựa phim đỉnh cao.
        </p>
        <Link
          to="/"
          className="bg-white text-black hover:bg-white/90 font-bold py-4 px-10 rounded-lg transition-transform hover:scale-105"
        >
          Trở Về Trang Chủ
        </Link>
      </div>
    </div>
  );
}
