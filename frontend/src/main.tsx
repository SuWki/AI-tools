import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import {SupplierPortal} from './pages/ProcurementPage';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).has('supplier')?<SupplierPortal/>:<App />}
  </React.StrictMode>
);
