import { jsx as _jsx } from "react/jsx-runtime";
import { createBrowserRouter } from 'react-router';
import { lazy, Suspense } from 'react';
import Root from './components/Root';
function lazyPage(loader) {
    const Component = lazy(loader);
    return (_jsx(Suspense, { fallback: _jsx("div", { className: "flex items-center justify-center h-full min-h-[200px]", children: _jsx("div", { className: "w-6 h-6 border-2 border-iron-light border-t-sand rounded-full animate-spin" }) }), children: _jsx(Component, {}) }));
}
export const router = createBrowserRouter([
    {
        path: '/',
        element: _jsx(Root, {}),
        children: [
            { index: true, element: lazyPage(() => import('./pages/Home')) },
            { path: 'repo/:slug', element: lazyPage(() => import('./pages/RepoPage')) },
            { path: 'repo/:slug/task/:taskId', element: lazyPage(() => import('./pages/TaskDetail')) },
        ],
    },
]);
