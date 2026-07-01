# AI Movie Chatbot

## Mục tiêu

Chatbot tư vấn phim bằng tiếng Việt, nhớ ngữ cảnh trong phiên chat và chỉ gợi ý phim thật có trong database.

Các câu nối tiếp được hỗ trợ:

- `phim khác`
- `nhẹ nhàng hơn`
- `ngắn thôi`
- `căng hơn`
- `vui hơn`

## Kiến trúc

Backend tách theo service:

- `backend/services/aiService.js`: điều phối luồng chatbot.
- `backend/services/chatIntentService.js`: phân tích intent, mood, follow-up và history.
- `backend/services/movieRetrievalService.js`: lấy candidate phim từ MySQL và re-rank theo yêu cầu.
- `backend/services/aiProviderService.js`: gọi Gemini, theo dõi health, fallback khi lỗi.
- `backend/services/chatGuardService.js`: hậu kiểm recommendation id.
- `backend/services/chatResponseService.js`: tạo reply tiếng Việt và suggested replies.
- `backend/services/chatSessionService.js`: lưu phiên chat và message log.

## Luồng xử lý

1. Frontend gửi `message`, `session_id`, `history`, `shown_movie_ids`, `user_id`, `profile_id`.
2. Backend tạo hoặc cập nhật `ai_chat_sessions`.
3. `chatIntentService` xác định câu mới là yêu cầu mới hay follow-up.
4. `movieRetrievalService` lấy phim thật từ DB.
5. Nếu câu là `phim khác`, backend loại các phim đã hiển thị trước.
6. Nếu câu là `ngắn thôi`, backend ưu tiên phim có duration ngắn.
7. Nếu câu là `nhẹ nhàng hơn`, backend ưu tiên hài, tình cảm, gia đình, học đường.
8. Nếu có `GEMINI_API_KEY`, Gemini chỉ được chọn id trong context phim thật.
9. `chatGuardService` hậu kiểm id trước khi trả về frontend.
10. `chatSessionService` lưu user message và assistant response.

## Đảm bảo không bịa phim

- Gemini không được tự sinh danh sách phim.
- Backend luôn lấy candidate từ MySQL trước.
- Response chỉ nhận `recommendation_ids` nằm trong candidate.
- Nếu Gemini trả id lạ, backend bỏ qua.
- Nếu Gemini lỗi hoặc thiếu key, rule-based recommendation vẫn chạy.

## API chính

### POST `/api/ai/chat`

Body:

```json
{
  "session_id": "optional",
  "message": "Tôi muốn xem phim hành động hài",
  "user_id": 1,
  "profile_id": 1,
  "history": [
    { "role": "user", "content": "Tôi muốn xem phim hành động hài" }
  ],
  "shown_movie_ids": [1, 2, 3]
}
```

Response:

```json
{
  "session_id": "...",
  "reply": "...",
  "recommendations": [],
  "suggested_replies": ["Phim khác", "Nhẹ nhàng hơn", "Ngắn thôi"],
  "conversation": {
    "memory_used": true,
    "follow_up": true,
    "refinement": {
      "shorter": true
    }
  },
  "grounding": {
    "no_fake_data": true,
    "verified_ids": []
  }
}
```

### GET `/api/admin/ai-health`

Yêu cầu admin header `x-user-id`.

Trả về:

- Gemini configured/model/health.
- Chat session stats.
- Tổng message, Gemini message, rule-based message, fallback message.

## Database

Migration:

- `backend/migrations/2026-07-02-ai-chat-sessions.sql`

Bảng:

- `ai_chat_sessions`
- `ai_chat_messages`

## Test

Chạy:

```bash
cd backend
npm run test:chatbot
```

Test kiểm tra:

- Câu đầu có recommendation thật.
- `phim khac` là follow-up và không lặp id cũ.
- `ngan thoi` bật refinement `shorter`.
- Hỏi ngoài phạm vi phim được kéo về tư vấn phim.
- Khi tắt Gemini key, chatbot vẫn chạy.

Nếu muốn test có Gemini:

```bash
cd backend
$env:TEST_CHATBOT_DISABLE_GEMINI="false"
npm run test:chatbot
```

## Giới hạn hiện tại

- Memory chính vẫn theo phiên chat, không phải long-term personalization toàn hệ thống.
- Chatbot không tự tạo phim mới, nên nếu DB thiếu dữ liệu đúng gu, kết quả sẽ là phim gần nhất hoặc phổ biến.
- Chưa có dashboard UI riêng cho AI health, nhưng backend endpoint đã sẵn sàng.
