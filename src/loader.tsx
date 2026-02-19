console.log('TokenQuestWidget: SCRIPT STARTING EXCLUSIVELY AT TOP');
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

interface WidgetConfig {
    targetId: string;
    props?: any;
}

const TokenQuestWidget = {
    init: ({ targetId, props }: WidgetConfig) => {
        const targetElement = document.getElementById(targetId);
        if (!targetElement) {
            console.error(
                `TokenQuestWidget: Target element with id "${targetId}" not found.`
            );
            return;
        }

        const shadow = targetElement.attachShadow({ mode: 'open' });
        const container = document.createElement('div');
        container.id = 'tokenquest-widget-root';
        shadow.appendChild(container);

        // Register this shadow so future CSS chunks target it
        if (!(window as any).__WIDGET_SHADOWS__) {
            (window as any).__WIDGET_SHADOWS__ = [];
        }
        (window as any).__WIDGET_SHADOWS__.push(shadow);

        // Apply any CSS that was already injected before init() was called
        if ((window as any).__WIDGET_STYLES__) {
            (window as any).__WIDGET_STYLES__.forEach((css: string) => {
                const style = document.createElement('style');
                style.textContent = css;
                shadow.appendChild(style);
            });
        }

        const root = createRoot(container);
        root.render(
            <StrictMode>
                <App {...props} />
            </StrictMode>
        );
    },
};

try {
    const globalObj =
        typeof window !== 'undefined'
            ? window
            : typeof self !== 'undefined'
              ? self
              : {};
    (globalObj as any).TokenQuestWidget = TokenQuestWidget;
    console.log('TokenQuestWidget: Successfully attached to window/global');
} catch (e) {
    console.error('TokenQuestWidget: CRITICAL ATTACHMENT FAILURE', e);
}

export default TokenQuestWidget;
