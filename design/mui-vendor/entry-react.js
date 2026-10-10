// Exposes React 19 as browser globals so Babel-standalone JSX in the
// prototype (classic runtime: React.createElement) keeps working.
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as JSXRuntime from 'react/jsx-runtime';

window.React = React;
window.ReactDOM = { ...ReactDOM, ...ReactDOMClient };
window.ReactJSXRuntime = JSXRuntime;
