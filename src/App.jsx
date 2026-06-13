import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Connect from './pages/Connect';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Connect />} />
    </Routes>
  );
}

export default App;
