import React from 'react';
import InlineIcon from './InlineIcon';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-white px-4">
          <div className="mb-6 text-primary">
            <InlineIcon name="info" size={80} strokeWidth={1.7} />
          </div>
          <h1 className="text-4xl font-black font-heading mb-4">Đã có lỗi xảy ra</h1>
          <p className="text-text-secondary max-w-md text-center mb-8">
            Chúng tôi đã ghi nhận sự cố này và đang nỗ lực khắc phục. Vui lòng thử lại sau.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => window.location.reload()}
              className="bg-primary hover:bg-primary/80 text-white font-bold py-3 px-8 rounded-lg transition-colors"
            >
              Tải lại trang
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-8 rounded-lg transition-colors"
            >
              Về Trang chủ
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
