# IT Move

IT Move là website xem phim trực tuyến dùng React + Vite cho frontend, Node.js + Express cho backend và MySQL/MariaDB cho database.

## Công nghệ

- Frontend: React 19, Vite, Material UI, React Router.
- Backend: Node.js, Express, mysql2, bcrypt, nodemailer.
- Database: MySQL hoặc MariaDB.
- Nguồn dữ liệu phim: có script import từ KKPhim/PhimAPI.

## Cấu trúc thư mục

```text
Movie-website-main-main/
  frontend/              React + Vite
    src/components/
      admin/             Component cho trang quản trị
      auth/              Component đăng nhập, đăng ký, Google login
      filter/            Bộ lọc phim
      layout/            Header, Footer, Banner, ScrollToTop
      movie/             Component hiển thị phim
      player/            Video player
      user/              Component tài khoản người dùng
    src/pages/
      admin/             Trang quản trị
      auth/              Trang đăng nhập, đăng ký
      movie/             Trang danh sách, chi tiết, xem phim, tìm kiếm
      public/            Trang chủ
      user/              Trang tài khoản, yêu thích, lịch sử, xem tiếp
  backend/               Express API
    movie_website.sql    File database đầy đủ cho người chạy mới
    migrations/          File cập nhật DB cho người đã có DB cũ
    scripts/             Script import dữ liệu phim
  docs/                  Tài liệu phụ
  package.json           Script chạy nhanh từ thư mục gốc
```

## Yêu cầu cài đặt

- Node.js 20 trở lên.
- npm.
- MySQL hoặc MariaDB đang chạy.

Kiểm tra nhanh:

```bash
node -v
npm -v
mysql --version
```

Nếu Windows không nhận lệnh `mysql`, dùng đường dẫn đầy đủ, ví dụ:

```powershell
"C:\Program Files\MariaDB 12.2\bin\mysql.exe" -u root -p
```

## Chạy project lần đầu

### 1. Cài dependencies

Chạy tại thư mục gốc project:

```bash
npm run install:all
```

Nếu muốn cài riêng:

```bash
npm install
npm --prefix frontend install
npm --prefix backend install
```

### 2. Tạo file môi trường

Copy file mẫu:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Sửa `backend/.env` theo database máy bạn:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=movie_website
PORT=5000

GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="IT Move <no-reply@itmove.local>"
```

Sửa `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

Ghi chú:
- `backend/.env` và `frontend/.env` không được push lên GitHub.
- Chỉ push `.env.example`.
- Google Client ID có thể để trống nếu chưa dùng Google login.
- SMTP có thể để trống khi test local, OTP sẽ tùy cấu hình backend hiện tại.

### 3. Tạo database và import dữ liệu

Mở MySQL/MariaDB:

```bash
mysql -u root -p
```

Trong màn hình MySQL, chạy:

```sql
CREATE DATABASE IF NOT EXISTS movie_website
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE movie_website;

SOURCE D:/Movie-website-main-main/backend/movie_website.sql;
```

Nếu project nằm ở thư mục khác, đổi lại đường dẫn `SOURCE`.

Lưu ý trên PowerShell: không nên chạy kiểu `mysql ... < file.sql` vì PowerShell dễ báo lỗi redirection. Cách ổn nhất là vào MySQL rồi dùng `SOURCE`.

### Tài khoản test sau khi import database

Tài khoản admin:

```text
Email: admin@gmail.com
Mật khẩu: 123456
Quyền: Admin
```

Tài khoản user:

```text
Email: bcd@gmail.com
Mật khẩu: 123456
Quyền: User
```

### 4. Chạy backend

Mở terminal 1 tại thư mục gốc:

```bash
npm run backend
```

Backend mặc định chạy tại:

```text
http://localhost:5000
```

### 5. Chạy frontend

Mở terminal 2 tại thư mục gốc:

```bash
npm run frontend
```

Frontend mặc định chạy tại:

```text
http://localhost:5173
```

## Các lệnh thường dùng

Chạy frontend dev:

```bash
npm run frontend
```

Chạy backend:

```bash
npm run backend
```

Build frontend:

```bash
npm run build
```

Chạy tất cả migration database chưa chạy:

```bash
npm run migrate
```

Xem thử bản build:

```bash
npm run preview
```

Kiểm tra lint frontend:

```bash
npm run lint
```

Import/cập nhật phim từ KKPhim:

```bash
npm run import:kkphim
```

## Quy trình cập nhật database cho cả nhóm

Project đang dùng 2 loại file DB:

- `backend/movie_website.sql`: file database đầy đủ cho người mới clone project.
- `backend/migrations/*.sql`: file cập nhật từng phần cho người đã có database cũ.

Khi bạn thay đổi cấu trúc DB, ví dụ thêm bảng/cột/index:

1. Cập nhật `backend/movie_website.sql` để người mới chạy project có DB mới nhất.
2. Tạo thêm file migration mới trong `backend/migrations`.
3. Đặt tên theo ngày và nội dung, ví dụ:

```text
backend/migrations/2026-06-15-add-movie-views.sql
```

4. Viết migration theo hướng chạy lại không lỗi nếu có thể:

```sql
ALTER TABLE movies
  ADD COLUMN IF NOT EXISTS views INT NOT NULL DEFAULT 0;
```

Hoặc:

```sql
CREATE TABLE IF NOT EXISTS movie_views (
  id INT NOT NULL AUTO_INCREMENT,
  movie_id INT NOT NULL,
  viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
```

Người khác sau khi pull code chỉ cần chạy:

```bash
npm run migrate
```

Script này sẽ:

- Đọc tất cả file `.sql` trong `backend/migrations`.
- Chạy theo thứ tự tên file.
- Lưu file đã chạy vào bảng `schema_migrations`.
- Lần sau chạy lại sẽ tự bỏ qua migration đã chạy.

Nếu muốn chạy thủ công, vẫn có thể mở MySQL:

```sql
USE movie_website;
SOURCE D:/Movie-website-main-main/backend/migrations/2026-06-15-add-movie-views.sql;
```

Nếu migration có `INSERT`, `UPDATE`, hoặc thay dữ liệu thật thì cần đọc file trước khi viết để tránh chạy lặp gây sai dữ liệu.

## Quy trình làm việc đề xuất cho team

Khi nhận code mới:

```bash
git pull
npm run install:all
```

Nếu có file mới trong `backend/migrations`, chạy:

```bash
npm run migrate
```

Sau đó chạy lại project:

```bash
npm run backend
npm run frontend
```

Khi bạn sửa database:

- Không sửa trực tiếp DB trên máy rồi quên commit.
- Luôn cập nhật `backend/movie_website.sql`.
- Luôn thêm migration tương ứng trong `backend/migrations`.
- Nhắc mọi người chạy `npm run migrate` sau khi pull code mới.

## Lỗi thường gặp

### Backend không kết nối được database

Kiểm tra:

- MySQL/MariaDB đã chạy chưa.
- `DB_USER`, `DB_PASSWORD`, `DB_NAME` trong `backend/.env` đúng chưa.
- Database `movie_website` đã được tạo/import chưa.

### PowerShell báo lỗi khi import SQL bằng dấu `<`

Dùng cách này thay thế:

```bash
mysql -u root -p
```

Sau đó trong MySQL:

```sql
USE movie_website;
SOURCE D:/Movie-website-main-main/backend/movie_website.sql;
```

### Frontend gọi sai API

Kiểm tra `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
```

Sau khi sửa `.env`, cần tắt và chạy lại frontend.

### Google login thất bại

Kiểm tra:

- `VITE_GOOGLE_CLIENT_ID` trong `frontend/.env`.
- `GOOGLE_CLIENT_ID` trong `backend/.env`.
- Authorized JavaScript origins trên Google Cloud có `http://localhost:5173`.

## Build để nộp/chạy production

Build frontend:

```bash
npm run build
```

File build nằm trong:

```text
frontend/dist/
```

Xem thử build local:

```bash
npm run preview
```

Backend vẫn chạy riêng bằng:

```bash
npm run backend
```
