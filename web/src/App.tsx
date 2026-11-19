import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import {
  AdminAccounts, AdminCategories, AdminDishes, AdminGuard, AdminLogin, AdminOrders,
  AdminRoot, AdminShell, AdminStats, AdminTables, AdminUsers, AuthContext, NotFound,
  type Me,
} from './admin/pages';
import { H5Entry, H5Error, H5Menu, H5OrderDetail, H5Orders } from './h5/pages';

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  return (
    <AuthContext.Provider value={{ me, setMe }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<H5Entry />} />
          <Route path="/error" element={<H5Error />} />
          <Route path="/menu" element={<H5Menu />} />
          <Route path="/orders" element={<H5Orders />} />
          <Route path="/orders/:id" element={<H5OrderDetail />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<AdminRoot />} />
            <Route path="stats" element={<AdminGuard><AdminStats /></AdminGuard>} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="categories" element={<AdminGuard><AdminCategories /></AdminGuard>} />
            <Route path="dishes" element={<AdminGuard><AdminDishes /></AdminGuard>} />
            <Route path="tables" element={<AdminGuard><AdminTables /></AdminGuard>} />
            <Route path="users" element={<AdminGuard><AdminUsers /></AdminGuard>} />
            <Route path="accounts" element={<AdminGuard><AdminAccounts /></AdminGuard>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
