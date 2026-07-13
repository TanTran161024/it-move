# MoMo Sandbox Demo cho VIP

Đây là cổng thanh toán **mô phỏng nội bộ** phục vụ đồ án. Không kết nối API MoMo thật và không phát sinh tiền.

## Luồng

1. User mở `/vip` và chọn gói.
2. Frontend gọi `POST /api/vip/mock-momo/create`.
3. Backend tạo `vip_orders` ở trạng thái `pending` và trả URL `/vip/mock-momo/:token`.
4. Trang demo cho phép mô phỏng `success`, `failed` hoặc `cancelled`.
5. Khi thành công, backend chạy transaction: cập nhật đơn `paid/approved` và cộng `users.vip_until`.
6. User quay lại `/vip` để xem trạng thái và lịch sử.

## Sửa lỗi migration trùng vip_until

File `2026-07-11-vip-and-advertisements.sql` đã tạo `users.vip_until`. Vì vậy migration MoMo không được tạo lại cột này.

Hãy thay file lỗi `backend/migrations/2026-07-13-add-vip-momo-payment.sql.sql` bằng file trong bản này rồi chạy:

```powershell
npm run migrate
```

## API chính

- `POST /api/vip/mock-momo/create`
- `GET /api/vip/mock-momo/:token`
- `POST /api/vip/mock-momo/:token/complete`
- `GET /api/vip/orders/my`
- `GET /api/vip/status`

## Lưu ý bảo mật

Phiên bản đồ án hiện xác định user qua `x-user-id`. Bản production cần chuyển sang JWT/session đã xác minh. Endpoint complete chỉ là nút mô phỏng; không được dùng thay callback/IPN của cổng thanh toán thật.
