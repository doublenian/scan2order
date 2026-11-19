import {
  createContext, useContext, useEffect, useState, type FormEvent, type ReactNode,
} from 'react';
import { Link, Navigate, Outlet, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, formatMoney, STATUS_TEXT, type ListData } from '../api/client';

export interface Me { id: number; username: string; realName: string; role: 'admin' | 'staff' }
interface AuthState { me: Me | null; setMe: (me: Me | null) => void }
export const AuthContext = createContext<AuthState>({ me: null, setMe: () => {} });
export const useAuth = () => useContext(AuthContext);

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : '操作失败';
}

export function AdminLogin() {
  const { setMe } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const me = await api<Me>('/auth/login', { method: 'POST', body: { username, password } });
      setMe(me);
      navigate('/admin/stats', { replace: true });
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <div className="login-wrap">
      <h1>扫码点餐 · 管理端</h1>
      <div className="panel">
        <form onSubmit={submit}>
          <label className="field"><span>用户名</span><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>
          <label className="field"><span>密码</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" style={{ width: '100%' }} type="submit">登录</button>
        </form>
        <p className="muted" style={{ marginTop: 14 }}>演示账号由 <code>npm run db:seed</code> 通过环境变量创建。</p>
      </div>
    </div>
  );
}

export function AdminShell() {
  const { me, setMe } = useAuth();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api<Me>('/auth/me').then(setMe).catch(() => setMe(null)).finally(() => setChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checked) return <div className="admin-main">加载中...</div>;
  if (!me) return <Navigate to="/admin/login" replace />;

  const isAdmin = me.role === 'admin';
  const links = [
    { to: '/admin/stats', label: '经营概览', admin: true },
    { to: '/admin/orders', label: '订单管理', admin: false },
    { to: '/admin/categories', label: '分类管理', admin: true },
    { to: '/admin/dishes', label: '菜品管理', admin: true },
    { to: '/admin/tables', label: '桌台管理', admin: true },
    { to: '/admin/users', label: '顾客列表', admin: true },
    { to: '/admin/accounts', label: '后台账号', admin: true },
  ];

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setMe(null);
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="admin">
      <aside className="side">
        <div className="logo">扫码点餐</div>
        {links.filter((link) => !link.admin || isAdmin).map((link) => (
          <Link key={link.to} to={link.to}>{link.label}</Link>
        ))}
        <a className="logout" href="#" onClick={(e) => { e.preventDefault(); void logout(); }}>退出登录（{me.username}）</a>
      </aside>
      <main className="admin-main"><Outlet /></main>
    </div>
  );
}

export function AdminGuard({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  if (me?.role === 'admin') return <>{children}</>;
  return <div className="panel"><h2>无权限访问</h2><p className="muted">该页面仅管理员可用。</p></div>;
}

interface Stats {
  date: string; todayOrderCount: number; todayRevenueCents: number;
  statusCounts: Record<string, number>;
}

export function AdminStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Stats>('/admin/stats/overview').then(setStats).catch((err) => setError(messageOf(err)));
  }, []);
  return (
    <div>
      <h2>经营概览</h2>
      {error && <p className="error-text">{error}</p>}
      {stats && (
        <>
          <div className="cards">
            <div className="card"><div className="label">业务日期</div><div className="value" style={{ fontSize: 20 }}>{stats.date}</div></div>
            <div className="card"><div className="label">今日订单数（未取消）</div><div className="value">{stats.todayOrderCount}</div></div>
            <div className="card"><div className="label">今日营收</div><div className="value">{formatMoney(stats.todayRevenueCents)}</div></div>
          </div>
          <div className="panel" style={{ marginTop: 18 }}>
            <h3>订单状态分布</h3>
            <table className="grid"><thead><tr><th>状态</th><th>数量</th></tr></thead><tbody>
              {Object.entries(stats.statusCounts).map(([status, count]) => (
                <tr key={status}><td>{STATUS_TEXT[status] ?? status}</td><td>{count}</td></tr>
              ))}
            </tbody></table>
          </div>
        </>
      )}
    </div>
  );
}

interface Category { id: number; name: string; sortOrder: number; status: string; dishCount: number }

export function AdminCategories() {
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [error, setError] = useState('');

  function load() { api<ListData<Category>>('/admin/categories?pageSize=100').then((d) => setItems(d.items)).catch((e) => setError(messageOf(e))); }
  useEffect(load, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/admin/categories', { method: 'POST', body: { name, sortOrder } });
      setName(''); setSortOrder(0); setError(''); load();
    } catch (err) { setError(messageOf(err)); }
  }
  async function remove(id: number) {
    try { await api(`/admin/categories/${id}`, { method: 'DELETE' }); setError(''); load(); }
    catch (err) { setError(messageOf(err)); }
  }
  async function toggle(item: Category) {
    try {
      await api(`/admin/categories/${item.id}`, { method: 'PUT', body: { name: item.name, sortOrder: item.sortOrder, status: item.status === 'active' ? 'disabled' : 'active' } });
      load();
    } catch (err) { setError(messageOf(err)); }
  }

  return (
    <div>
      <h2>分类管理</h2>
      <div className="panel"><form className="toolbar" onSubmit={create}>
        <label className="field"><span>分类名称</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>排序</span><input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} /></label>
        <button className="btn" type="submit">新增</button>
      </form></div>
      {error && <p className="error-text">{error}</p>}
      <div className="panel table-wrap"><table className="grid"><thead><tr><th>ID</th><th>名称</th><th>排序</th><th>状态</th><th>菜品数</th><th>操作</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.name}</td><td>{item.sortOrder}</td><td>{item.status}</td><td>{item.dishCount}</td><td>
          <button className="btn small gray" onClick={() => toggle(item)}>{item.status === 'active' ? '停用' : '启用'}</button>{' '}
          <button className="btn small gray" onClick={() => remove(item.id)}>删除</button>
        </td></tr>)}
      </tbody></table></div>
    </div>
  );
}

interface Spec { id?: number; name: string; options: { id: string; label: string; extraPriceCents: number }[]; extraPriceCents?: number; required?: boolean; sortOrder?: number }
interface Dish {
  id: number; categoryId: number; name: string; description: string; priceCents: number;
  imageUrl: string; tags: string[]; status: string; sortOrder: number; specs: Spec[];
}

export function AdminDishes() {
  const [items, setItems] = useState<Dish[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ categoryId: 0, name: '', description: '', priceYuan: '', imageUrl: '', tags: '', sortOrder: 0 });
  const [error, setError] = useState('');

  function load() {
    Promise.all([
      api<ListData<Dish>>('/admin/dishes?pageSize=100'),
      api<{ items: Category[] }>('/categories'),
    ]).then(([dishes, cats]) => {
      setItems(dishes.items); setCategories(cats.items);
      if (!form.categoryId && cats.items.length) setForm((prev) => ({ ...prev, categoryId: cats.items[0].id }));
    }).catch((e) => setError(messageOf(e)));
  }
  useEffect(load, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/admin/dishes', { method: 'POST', body: {
        categoryId: form.categoryId, name: form.name, description: form.description,
        priceYuan: form.priceYuan, imageUrl: form.imageUrl,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean), sortOrder: form.sortOrder,
      } });
      setForm((prev) => ({ ...prev, name: '', description: '', priceYuan: '', tags: '' }));
      setError(''); load();
    } catch (err) { setError(messageOf(err)); }
  }
  async function toggle(item: Dish) {
    try { await api(`/admin/dishes/${item.id}/status`, { method: 'PATCH', body: { status: item.status === 'on' ? 'soldout' : 'on' } }); load(); }
    catch (err) { setError(messageOf(err)); }
  }
  async function remove(id: number) {
    try { await api(`/admin/dishes/${id}`, { method: 'DELETE' }); load(); }
    catch (err) { setError(messageOf(err)); }
  }

  return (
    <div>
      <h2>菜品管理</h2>
      <div className="panel"><form className="form-grid" onSubmit={create}>
        <label className="field"><span>分类</span><select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: Number(e.target.value) })}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label className="field"><span>名称</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="field"><span>描述</span><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label className="field"><span>价格（元）</span><input value={form.priceYuan} onChange={(e) => setForm({ ...form, priceYuan: e.target.value })} placeholder="12.50" /></label>
        <label className="field"><span>标签（逗号分隔）</span><input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label>
        <label className="field"><span>排序</span><input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></label>
        <div style={{ alignSelf: 'end' }}><button className="btn" type="submit">新增菜品</button></div>
      </form></div>
      {error && <p className="error-text">{error}</p>}
      <div className="panel table-wrap"><table className="grid"><thead><tr><th>ID</th><th>名称</th><th>分类</th><th>价格</th><th>状态</th><th>规格</th><th>操作</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.name}</td>
          <td>{categories.find((c) => c.id === item.categoryId)?.name ?? item.categoryId}</td>
          <td>{formatMoney(item.priceCents)}</td><td>{item.status === 'on' ? '在售' : '售罄'}</td>
          <td>{item.specs.map((s) => s.name).join('、') || '无'}</td><td>
            <button className="btn small gray" onClick={() => toggle(item)}>{item.status === 'on' ? '置为售罄' : '上架'}</button>{' '}
            <button className="btn small gray" onClick={() => remove(item.id)}>删除</button>
          </td></tr>)}
      </tbody></table></div>
      <p className="muted">v1 管理端提供菜品新增、上架/售罄与删除；规格通过 API 的 specs 字段维护。</p>
    </div>
  );
}

interface Table { id: number; tableNo: string; qrToken: string; qrUrl: string; status: string }
function QrImage({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState('');
  useEffect(() => {
    QRCode.toDataURL(url, { width: 160, margin: 1 }).then(setDataUrl).catch(() => setDataUrl(''));
  }, [url]);
  return dataUrl ? <img src={dataUrl} alt="桌台二维码" /> : <span className="muted">生成中...</span>;
}

export function AdminTables() {
  const [items, setItems] = useState<Table[]>([]);
  const [tableNo, setTableNo] = useState('');
  const [error, setError] = useState('');
  const [qrToken, setQrToken] = useState<Record<number, string>>({});

  function load() { api<ListData<Table>>('/admin/tables?pageSize=100').then((d) => setItems(d.items)).catch((e) => setError(messageOf(e))); }
  useEffect(load, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    try { await api('/admin/tables', { method: 'POST', body: { tableNo } }); setTableNo(''); setError(''); load(); }
    catch (err) { setError(messageOf(err)); }
  }
  async function regenerate(id: number) {
    try {
      const result = await api<{ qrToken: string }>(`/admin/tables/${id}/qr`, { method: 'POST' });
      setQrToken((prev) => ({ ...prev, [id]: result.qrToken }));
      setError(''); load();
    } catch (err) { setError(messageOf(err)); }
  }
  async function remove(id: number) {
    try { await api(`/admin/tables/${id}`, { method: 'DELETE' }); load(); }
    catch (err) { setError(messageOf(err)); }
  }

  return (
    <div>
      <h2>桌台管理</h2>
      <div className="panel"><form className="toolbar" onSubmit={create}>
        <label className="field"><span>桌号</span><input value={tableNo} onChange={(e) => setTableNo(e.target.value)} placeholder="A06" /></label>
        <button className="btn" type="submit">新增桌台</button>
      </form></div>
      {error && <p className="error-text">{error}</p>}
      <div className="panel table-wrap"><table className="grid"><thead><tr><th>ID</th><th>桌号</th><th>二维码</th><th>令牌</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.tableNo}</td>
          <td className="qr"><QrImage url={item.qrUrl} /></td>
          <td className="muted">{(qrToken[item.id] ?? item.qrToken).slice(0, 12)}…</td>
          <td>{item.status}</td><td>
            <button className="btn small gray" onClick={() => regenerate(item.id)}>重生成二维码</button>{' '}
            <button className="btn small gray" onClick={() => remove(item.id)}>删除</button>
          </td></tr>)}
      </tbody></table></div>
      <p className="muted">重新生成后旧二维码立即失效。</p>
    </div>
  );
}

interface Order {
  id: number; orderNo: string; status: string; paymentStatus: string; totalCents: number;
  table: { tableNo: string }; createdAt: string;
  items: { dishNameSnapshot: string; quantity: number }[];
}

export function AdminOrders() {
  const [items, setItems] = useState<Order[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [detail, setDetail] = useState<Order | null>(null);

  function load() {
    const query = new URLSearchParams({ page: '1', pageSize: '100' });
    if (status) query.set('status', status);
    api<ListData<Order>>(`/admin/orders?${query}`).then((d) => setItems(d.items)).catch((e) => setError(messageOf(e)));
  }
  useEffect(load, [status]);

  async function change(id: number, target: string) {
    try {
      await api(`/admin/orders/${id}/status`, { method: 'PATCH', body: { status: target } });
      setError(''); load();
    } catch (err) { setError(messageOf(err)); }
  }
  async function cancel(id: number) {
    try { await api(`/admin/orders/${id}/cancel`, { method: 'POST' }); setError(''); load(); }
    catch (err) { setError(messageOf(err)); }
  }
  async function showDetail(id: number) {
    setExpanded(id);
    try { setDetail(await api<Order>(`/admin/orders/${id}`)); }
    catch (err) { setError(messageOf(err)); }
  }

  const nextStatus: Record<string, string> = {
    PENDING_PAYMENT: 'PAID', PAID: 'PREPARING', PREPARING: 'READY', READY: 'COMPLETED',
  };

  return (
    <div>
      <h2>订单管理</h2>
      <div className="panel"><div className="toolbar">
        <label className="field"><span>状态筛选</span><select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部</option>
          {Object.entries(STATUS_TEXT).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
      </div></div>
      {error && <p className="error-text">{error}</p>}
      <div className="panel table-wrap"><table className="grid"><thead><tr><th>ID</th><th>订单号</th><th>桌台</th><th>金额</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>
        {items.map((order) => <tr key={order.id}><td>{order.id}</td><td>{order.orderNo}</td><td>{order.table.tableNo}</td>
          <td>{formatMoney(order.totalCents)}</td><td><span className={`status ${order.status}`}>{STATUS_TEXT[order.status]}</span></td>
          <td>{new Date(order.createdAt).toLocaleString('zh-CN')}</td><td>
            <button className="btn small gray" onClick={() => showDetail(order.id)}>详情</button>{' '}
            {nextStatus[order.status] && <button className="btn small" onClick={() => change(order.id, nextStatus[order.status])}>推进至{STATUS_TEXT[nextStatus[order.status]]}</button>}{' '}
            {['PENDING_PAYMENT', 'PAID'].includes(order.status) && <button className="btn small gray" onClick={() => cancel(order.id)}>取消</button>}
          </td></tr>)}
      </tbody></table></div>
      {expanded && detail && (
        <div className="panel"><h3>订单 #{detail.orderNo} 明细</h3>
          {detail.items.map((item, i) => <div className="order-item" key={i}><span>{item.dishNameSnapshot}</span><span>×{item.quantity}</span></div>)}
        </div>
      )}
    </div>
  );
}

interface Customer { id: number; nickname: string | null; phone: string | null; status: string; createdAt: string }
export function AdminUsers() {
  const [items, setItems] = useState<Customer[]>([]);
  useEffect(() => {
    api<ListData<Customer>>('/admin/users?pageSize=100').then((d) => setItems(d.items)).catch(() => {});
  }, []);
  return (
    <div><h2>顾客列表</h2><div className="panel table-wrap"><table className="grid"><thead><tr><th>ID</th><th>昵称</th><th>手机号</th><th>状态</th><th>注册时间</th></tr></thead><tbody>
      {items.map((c) => <tr key={c.id}><td>{c.id}</td><td>{c.nickname ?? '-'}</td><td>{c.phone ?? '-'}</td><td>{c.status}</td><td>{new Date(c.createdAt).toLocaleString('zh-CN')}</td></tr>)}
    </tbody></table></div></div>
  );
}

interface Account { id: number; username: string; realName: string; role: string; status: string }
export function AdminAccounts() {
  const [items, setItems] = useState<Account[]>([]);
  const [form, setForm] = useState({ username: '', password: '', realName: '', role: 'staff' });
  const [error, setError] = useState('');
  function load() { api<ListData<Account>>('/admin/accounts?pageSize=100').then((d) => setItems(d.items)).catch((e) => setError(messageOf(e))); }
  useEffect(load, []);
  async function create(e: FormEvent) {
    e.preventDefault();
    try { await api('/admin/accounts', { method: 'POST', body: form }); setForm({ username: '', password: '', realName: '', role: 'staff' }); setError(''); load(); }
    catch (err) { setError(messageOf(err)); }
  }
  return (
    <div><h2>后台账号</h2>
      <div className="panel"><form className="form-grid" onSubmit={create}>
        <label className="field"><span>用户名</span><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label className="field"><span>初始密码</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        <label className="field"><span>姓名</span><input value={form.realName} onChange={(e) => setForm({ ...form, realName: e.target.value })} /></label>
        <label className="field"><span>角色</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="staff">店员</option><option value="admin">管理员</option></select></label>
        <div style={{ alignSelf: 'end' }}><button className="btn" type="submit">新增账号</button></div>
      </form></div>
      {error && <p className="error-text">{error}</p>}
      <div className="panel table-wrap"><table className="grid"><thead><tr><th>ID</th><th>用户名</th><th>姓名</th><th>角色</th><th>状态</th></tr></thead><tbody>
        {items.map((a) => <tr key={a.id}><td>{a.id}</td><td>{a.username}</td><td>{a.realName}</td><td>{a.role}</td><td>{a.status}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

export function AdminRoot() {
  return <Navigate to="/admin/stats" replace />;
}

export function NotFound() {
  return <div className="error-page"><h2>404</h2><p className="muted">页面不存在</p><Link className="btn" to="/">返回首页</Link></div>;
}

