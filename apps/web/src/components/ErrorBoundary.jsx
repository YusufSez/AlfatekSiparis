import { Component } from 'react';
import { getUserFriendlyError } from '../lib/errors';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="boot">
          <div className="hero-panel" style={{ maxWidth: 420 }}>
            <h1>Bir hata oluştu</h1>
            <p className="muted">{getUserFriendlyError(this.state.error)}</p>
            <button className="btn primary" type="button" onClick={() => window.location.reload()}>
              Sayfayı yenile
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
