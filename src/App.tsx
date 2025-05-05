import React from 'react';
import ExampleTabs from './components/ExampleTabs';
import { ToastProvider } from './components/Toast';

function App() {
  return (
    <ToastProvider>
      <ExampleTabs />
    </ToastProvider>
  );
}

export default App;
