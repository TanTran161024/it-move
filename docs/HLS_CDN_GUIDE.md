# HLS + hls.js + CDN

## Luong chay

```text
MP4 goc
-> FFmpeg encode thanh HLS: master.m3u8 + cac segment
-> upload thu muc HLS len CDN/static host
-> nhap HLS/CDN URL vao admin tap phim
-> frontend uu tien hls_url, fallback ve video_url
```

## 1. Cap nhat database

```bash
npm run migrate
```

Migration moi them cac cot cho bang `episodes`:

- `hls_url`: URL CDN tro toi `master.m3u8`
- `thumbnail_url`: anh dai dien tap
- `preview_url`: clip preview ngan
- `duration_seconds`: thoi luong tap
- `description`: mo ta tap

## 2. Encode HLS tu MP4

Can cai FFmpeg va dam bao lenh `ffmpeg` chay duoc trong terminal.

```bash
npm run encode:hls -- --input "D:\videos\movie-1-ep-1.mp4" --output "D:\cdn-out\movie-1\ep-1" --base-url "https://cdn.example.com/hls/movie-1/ep-1"
```

Sau khi chay xong, script se in ra:

```json
{
  "hls_url": "https://cdn.example.com/hls/movie-1/ep-1/master.m3u8",
  "thumbnail_url": "https://cdn.example.com/hls/movie-1/ep-1/thumbnail.jpg",
  "preview_url": "https://cdn.example.com/hls/movie-1/ep-1/preview.mp4"
}
```

## 3. Upload len CDN

Upload toan bo thu muc output len CDN/static hosting, giu nguyen cau truc:

```text
master.m3u8
thumbnail.jpg
preview.mp4
360p/index.m3u8
360p/segment_00000.ts
720p/index.m3u8
720p/segment_00000.ts
1080p/index.m3u8
1080p/segment_00000.ts
```

CDN can bat CORS cho domain frontend:

```text
Access-Control-Allow-Origin: *
```

Nen cau hinh MIME type:

```text
.m3u8 -> application/vnd.apple.mpegurl
.ts   -> video/mp2t
.mp4  -> video/mp4
.jpg  -> image/jpeg
```

## 4. Nhap trong admin

Vao Admin -> Quan ly tap phim:

- `HLS/CDN URL (.m3u8)`: dan `master.m3u8`
- `MP4 URL fallback`: co the de link MP4 cu, phong khi HLS chua san sang
- `Thumbnail URL`: dan `thumbnail.jpg`
- `Preview URL`: dan `preview.mp4`
- `Thoi luong`: nhap so giay neu co

Frontend se tu uu tien `hls_url`; neu rong thi dung `video_url`.

## 5. Ghi chu

- `hls.js` dang duoc dung trong `VideoPlayer`, nen chi can URL `.m3u8` hop le la player se phat adaptive streaming.
- Neu video khong chay tren CDN, kiem tra CORS va MIME type truoc.
- Neu can DRM nhu Netflix that su, huong tiep theo la Shaka Player + DASH/HLS + license server.
