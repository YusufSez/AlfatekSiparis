import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="boot">
          <div className="hero-panel" style={{ maxWidth: 420 }}>
            <h1>Bir hata oluştu</h1>
            <p className="muted">{this.state.error.message}</p>
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
