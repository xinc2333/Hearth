import { Component, type ReactNode } from 'react';

/** Keeps one broken panel from taking down the whole window. */
export class Boundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
    state = { error: null as Error | null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    render() {
        if (this.state.error) {
            return (
                <div className="boundary">
                    <p>{this.props.label}出错了：{this.state.error.message}</p>
                    <button className="btn" onClick={() => this.setState({ error: null })}>重试</button>
                </div>
            );
        }
        return this.props.children;
    }
}
