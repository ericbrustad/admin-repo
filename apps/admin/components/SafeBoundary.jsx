import React from 'react';

function resetKeysChanged(prev = [], next = []) {
  if (!Array.isArray(prev) || !Array.isArray(next)) return true;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < next.length; i += 1) {
    if (!Object.is(prev[i], next[i])) return true;
  }
  return false;
}

export default class SafeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof this.props.onError === 'function') {
      try {
        this.props.onError(error, info);
      } catch (err) {
        console.warn('SafeBoundary onError handler threw', err);
      }
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && resetKeysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.handleReset();
    }
  }

  handleReset() {
    if (this.state.error) {
      this.setState({ error: null });
    }
    if (typeof this.props.onReset === 'function') {
      try {
        this.props.onReset();
      } catch (err) {
        console.warn('SafeBoundary onReset handler threw', err);
      }
    }
  }

  renderFallback() {
    const { fallback } = this.props;
    if (typeof fallback === 'function') {
      return fallback({ error: this.state.error, reset: this.handleReset });
    }
    if (fallback) return fallback;
    return null;
  }

  render() {
    if (this.state.error) {
      return this.renderFallback();
    }
    return this.props.children || null;
  }
}
