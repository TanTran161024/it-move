# Smart Movie Streaming Web - Demo Checklist

## Stack thật của project

- Frontend: ReactJS + Vite + MUI/CSS
- Backend: Node.js + Express
- Database: MySQL + mysql2
- Auth hiện tại: localStorage user + header `x-user-id`
- AI: Gemini API nếu có `GEMINI_API_KEY`, fallback rule-based nếu chưa cấu hình key

## Cách chạy database

1. Kiểm tra `backend/.env`:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=...
DB_NAME=movie_website
PORT=5000
```

2. Import dump gốc nếu cần:

```bash
mysql -u root -p movie_website
SOURCE backend/movie_website.sql;
```

3. Chạy migration:

```bash
cd backend
npm run migrate
```

4. Import thêm phim KKPhim:

```bash
cd backend
npm run import:kkphim
```

## Cách chạy backend/frontend

Backend:

```bash
cd backend
npm start
```

Frontend:

```bash
cd frontend
npm run dev
```

Build frontend để kiểm tra trước demo:

```bash
cd frontend
npm run build
```

## Tài khoản demo

- Admin: `admin@gmail.com`
- Mật khẩu demo theo README hiện có: `123456`
- Quyền: Admin

## API nên test nhanh

```bash
GET  http://localhost:5000/api/movies
GET  http://localhost:5000/api/banners
GET  http://localhost:5000/api/recommendations?movie_id=1
POST http://localhost:5000/api/ai/chat
GET  http://localhost:5000/api/admin/stats
```

Body test AI:

```json
{
  "message": "Tôi muốn xem phim hành động hài"
}
```

Header admin khi test API quản trị:

```http
x-user-id: 1
```

## Chức năng đã có

- Đăng ký, đăng nhập, Google login, quên mật khẩu OTP.
- Danh sách phim, tìm kiếm, lọc theo thể loại/quốc gia/năm/xếp hạng.
- Chi tiết phim, xem phim, ghi nhận lượt xem.
- Yêu thích, watchlist, lịch sử xem, tiếp tục xem.
- Đánh giá, bình luận, báo lỗi phim.
- Admin quản lý phim, tập phim, banner, danh mục, quốc gia, thể loại, diễn viên, đạo diễn, nhà sản xuất, người dùng.
- Admin dashboard thống kê phim, user, lượt xem, top phim.
- AI chatbot tư vấn phim và gợi ý phim từ database.
- Content-based recommendation theo thể loại, quốc gia, diễn viên, đạo diễn, năm, IMDb.

## Optional/Phase 2

- JWT/session chuẩn thay cho localStorage + `x-user-id`.
- SMTP thật để gửi OTP qua email thay vì log console khi thiếu cấu hình.
- VIP/payment thật và dashboard doanh thu VIP.
- Upload ảnh/video thật thay vì nhập URL.
- Test tự động/API collection đầy đủ.
