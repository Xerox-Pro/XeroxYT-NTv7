import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import Xerogram from './Xerogram';

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><Xerogram/></BrowserRouter></StrictMode>,
);
