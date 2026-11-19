import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, ensureVisitorToken, formatMoney, STATUS_TEXT } from '../api/client';

interface TableInfo { id: number; tableNo: string; status: string }
interface Category { id: number; name: string; dishCount: number }
interface SpecOption { id: string; label: string; extraPriceCents: number }
interface Spec { id: number; name: string; required: boolean; extraPriceCents: number; options: SpecOption[] }
interface Dish {
  id: number; categoryId: number; name: string; description: string; priceCents: number;
  imageUrl: string; tags: string[]; status: string; specs: Spec[];
}
interface Selection { specId: number; optionId: string; label: string; extraPriceCents: number }
interface OrderSpec { specId: number; specName: string; optionId: string; optionLabel: string; extraPriceCents: number }
interface CartLine {
  key: string; dishId: number; name: string; imageUrl: string; unitPriceCents: number;
  quantity: number; selections: Selection[];
}
interface Order {
  id: number; orderNo: string; status: string; paymentStatus: string; totalCents: number;
  remark: string; table: { id: number; tableNo: string }; createdAt: string; paidAt: string | null;
  items: { dishId: number; dishNameSnapshot: string; unitPriceCents: number; quantity: number; specSnapshot: OrderSpec[] }[];
}

const TABLE_KEY = 's2o_table';

function readTable(): TableInfo | null {
  try {
    const raw = sessionStorage.getItem(TABLE_KEY);
    return raw ? (JSON.parse(raw) as TableInfo) : null;
  } catch { return null; }
}

function cartKey(): string {
  const token = new URLSearchParams(location.search).get('tableToken')
    ?? sessionStorage.getItem('s2o_table_token') ?? 'default';
  return `s2o_cart_${token}`;
}

function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(cartKey());
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch { return []; }
}

function saveCart(lines: CartLine[]): void {
  localStorage.setItem(cartKey(), JSON.stringify(lines));
}

function Header({ title }: { title: string }) {
  const table = readTable();
  return (
    <header className="h5-header">
      <h1>{title}</h1>
      {table && <span className="table-no">桌号 {table.tableNo}</span>}
    </header>
  );
}

function useErrorMessage() {
  const [error, setError] = useState('');
  const show = (err: unknown) => setError(err instanceof Error ? err.message : '操作失败');
  return { error, show, clear: () => setError('') };
}

export function H5Entry() {
  const navigate = useNavigate();
  const params = new URLSearchParams(useLocationSearch());
  const [token, setToken] = useState(params.get('tableToken') ?? '');
  const [busy, setBusy] = useState(false);
  const { error, show } = useErrorMessage();

  useEffect(() => {
    ensureVisitorToken().catch(show);
    if (token) void resolve(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resolve(value: string) {
    setBusy(true);
    try {
      const table = await api<TableInfo>(`/tables/resolve?token=${encodeURIComponent(value)}`);
      sessionStorage.setItem(TABLE_KEY, JSON.stringify(table));
      sessionStorage.setItem('s2o_table_token', value);
      navigate('/menu', { replace: true });
    } catch (err) {
      sessionStorage.setItem('s2o_error', err instanceof Error ? err.message : '桌台解析失败');
      navigate('/error', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h5">
      <Header title="扫码点餐" />
      <div className="h5-body">
        <div className="h5-card">
          <p className="muted">请输入桌台二维码中的令牌，或直接扫描桌台二维码进入。</p>
          <label className="field"><span>桌台令牌</span><input value={token} onChange={(e) => setToken(e.target.value)} placeholder="tableToken" /></label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" disabled={!token || busy} onClick={() => resolve(token)}>进入点餐</button>
        </div>
      </div>
    </div>
  );
}

function useLocationSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

export function H5Error() {
  const navigate = useNavigate();
  const message = sessionStorage.getItem('s2o_error') || '页面不可用';
  return (
    <div className="h5">
      <Header title="无法进入点餐" />
      <div className="error-page">
        <h2>😕 无法识别桌台</h2>
        <p>{message}</p>
        <p className="muted">请确认二维码是否有效，或联系服务员。</p>
        <button className="btn" onClick={() => navigate('/')}>重新进入</button>
      </div>
    </div>
  );
}

export function H5Menu() {
  const navigate = useNavigate();
  // 只在首次挂载读取一次，避免每次渲染生成新对象导致 useEffect 无限触发请求循环
  const [table] = useState(readTable);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [cart, setCart] = useState<CartLine[]>(loadCart);
  const [keyword, setKeyword] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const { error, show } = useErrorMessage();

  useEffect(() => {
    if (!table) { navigate('/', { replace: true }); return; }
    Promise.all([
      api<{ items: Category[] }>('/categories'),
      api<{ items: Dish[] }>('/dishes?pageSize=100'),
    ]).then(([cats, dishPage]) => {
      setCategories(cats.items);
      setDishes(dishPage.items);
    }).catch(show);
  }, [navigate]);

  const filtered = useMemo(
    () => dishes.filter((dish) => !keyword || dish.name.includes(keyword) || dish.description.includes(keyword)),
    [dishes, keyword],
  );
  const counts = useMemo(() => {
    const map = new Map<number, number>();
    for (const line of cart) map.set(line.dishId, (map.get(line.dishId) ?? 0) + line.quantity);
    return map;
  }, [cart]);
  const total = cart.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const totalCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  function change(line: CartLine, delta: number) {
    const next = cart.map((item) => item.key === line.key
      ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0);
    setCart(next);
    saveCart(next);
  }

  function addSimple(dish: Dish) {
    const line: CartLine = {
      key: String(dish.id), dishId: dish.id, name: dish.name, imageUrl: dish.imageUrl,
      unitPriceCents: dish.priceCents, quantity: 1, selections: [],
    };
    const existing = cart.find((item) => item.key === line.key);
    const next = existing
      ? cart.map((item) => item.key === line.key ? { ...item, quantity: item.quantity + 1 } : item)
      : [...cart, line];
    setCart(next);
    saveCart(next);
  }

  function addWithSpecs(dish: Dish, selections: Selection[]) {
    const key = `${dish.id}:${selections.map((s) => s.optionId).join(',')}`;
    const extra = selections.reduce((sum, s) => sum + s.extraPriceCents, 0)
      + dish.specs.filter((s) => selections.some((sel) => sel.specId === s.id))
        .reduce((sum, s) => sum + s.extraPriceCents, 0);
    const line: CartLine = {
      key, dishId: dish.id, name: dish.name, imageUrl: dish.imageUrl,
      unitPriceCents: dish.priceCents + extra, quantity: 1, selections,
    };
    const existing = cart.find((item) => item.key === key);
    const next = existing
      ? cart.map((item) => item.key === key ? { ...item, quantity: item.quantity + 1 } : item)
      : [...cart, line];
    setCart(next);
    saveCart(next);
  }

  async function submitOrder() {
    if (!table) return;
    setBusy(true);
    try {
      const order = await api<Order>('/orders', {
        method: 'POST',
        visitor: true,
        body: {
          tableToken: sessionStorage.getItem('s2o_table_token'),
          items: cart.map((line) => ({
            dishId: line.dishId,
            quantity: line.quantity,
            specSelections: line.selections.map((s) => ({ specId: s.specId, optionId: s.optionId })),
          })),
          remark,
        },
      });
      localStorage.removeItem(cartKey());
      setCart([]);
      setCheckout(false);
      navigate(`/orders/${order.id}`);
    } catch (err) {
      show(err);
      if (err instanceof ApiError && err.status === 401) {
        await ensureVisitorToken();
        show(new Error('登录状态已刷新，请重新提交'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h5">
      <Header title="点餐" />
      <div className="h5-body">
        <label className="field"><input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索菜品" /></label>
        {categories.map((category) => {
          const group = filtered.filter((dish) => dish.categoryId === category.id);
          if (group.length === 0) return null;
          return (
            <div key={category.id}>
              <h2 className="h5-title">{category.name}</h2>
              {group.map((dish) => (
                <DishRow key={dish.id} dish={dish} count={counts.get(dish.id) ?? 0}
                  onAdd={() => addSimple(dish)} onSpecs={(s) => addWithSpecs(dish, s)}
                  onChange={(delta) => {
                    // 同菜品可能存在多条规格行，减号应作用于最新加入的一行
                    let last: CartLine | undefined;
                    for (const item of cart) if (item.dishId === dish.id) last = item;
                    if (last) change(last, delta);
                  }} />
              ))}
            </div>
          );
        })}
        <button className="btn ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => navigate('/orders')}>我的订单</button>
        {error && <p className="error-text">{error}</p>}
      </div>
      <div className="cart-bar">
        <div><div className="total">{formatMoney(total)}</div><div className="muted" style={{ color: '#bbb' }}>共 {totalCount} 件</div></div>
        <button disabled={totalCount === 0} onClick={() => setCheckout(true)}>去结算</button>
      </div>
      {checkout && (
        <div className="mask" onClick={() => setCheckout(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>确认订单</h3>
            {cart.map((line) => (
              <div className="order-item" key={line.key}>
                <span>{line.name} ×{line.quantity}</span><span>{formatMoney(line.unitPriceCents * line.quantity)}</span>
              </div>
            ))}
            <div className="order-item" style={{ fontWeight: 700 }}>
              <span>合计</span><span>{formatMoney(total)}</span>
            </div>
            <label className="field"><span>备注</span><textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="口味偏好等" /></label>
            <button className="btn" style={{ width: '100%' }} disabled={busy} onClick={submitOrder}>{busy ? '提交中...' : '提交订单'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DishRow({ dish, count, onAdd, onSpecs, onChange }: {
  dish: Dish; count: number; onAdd: () => void; onSpecs: (s: Selection[]) => void; onChange: (delta: number) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [specError, setSpecError] = useState('');
  const soldout = dish.status === 'soldout';

  function confirmSpecs() {
    const result: Selection[] = [];
    for (const spec of dish.specs) {
      const optionId = selected[spec.id];
      if (!optionId) {
        // 必选规格未选择时前端直接拦截，不打到后端
        if (spec.required) {
          setSpecError(`请选择${spec.name}`);
          return;
        }
        continue;
      }
      const option = spec.options.find((o) => o.id === optionId);
      if (option) result.push({ specId: spec.id, optionId, label: `${spec.name}:${option.label}`, extraPriceCents: option.extraPriceCents });
    }
    onSpecs(result);
    setPicking(false);
  }

  function openPicking() {
    setSpecError('');
    setPicking(true);
  }

  return (
    <>
      <div className="dish">
        {dish.imageUrl ? <img src={dish.imageUrl} alt={dish.name} /> : <div className="dish-photo" style={{ width: 76, height: 76, borderRadius: 8, background: '#f2f3f5' }} />}
        <div className="dish-info">
          <div className="dish-name">{dish.name} {soldout && <span className="tag soldout">售罄</span>}
            {dish.tags.filter((t) => t !== '售罄').map((tag) => <span className="tag" key={tag}>{tag}</span>)}
          </div>
          <div className="dish-desc">{dish.description}</div>
          <div className="dish-price">{formatMoney(dish.priceCents)}</div>
        </div>
        <div style={{ alignSelf: 'center' }}>
          {soldout ? <button className="btn small gray" disabled>售罄</button> : count > 0 ? (
            <div className="stepper">
              <button onClick={() => onChange(-1)}>−</button><span>{count}</span>
              <button className="plus" onClick={() => dish.specs.length ? openPicking() : onAdd()}>+</button>
            </div>
          ) : (
            <button className="btn small" onClick={() => dish.specs.length ? openPicking() : onAdd()}>加购</button>
          )}
        </div>
      </div>
      {picking && (
        <div className="mask" onClick={() => setPicking(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>选择规格 · {dish.name}</h3>
            {dish.specs.map((spec) => (
              <div className="field" key={spec.id}>
                <span>{spec.name}{spec.required ? '（必选）' : '（可选）'}</span>
                <select value={selected[spec.id] ?? ''} onChange={(e) => setSelected((prev) => ({ ...prev, [spec.id]: e.target.value }))}>
                  <option value="">请选择</option>
                  {spec.options.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}{option.extraPriceCents ? ` +${formatMoney(option.extraPriceCents)}` : ''}</option>
                  ))}
                </select>
              </div>
            ))}
            {specError && <p className="error-text">{specError}</p>}
            <button className="btn" style={{ width: '100%' }} onClick={confirmSpecs}>确认加入</button>
          </div>
        </div>
      )}
    </>
  );
}

export function H5Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ items: Order[] }>('/orders/mine?pageSize=100', { visitor: true })
      .then((data) => setOrders(data.items))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="h5">
      <Header title="我的订单" />
      <div className="h5-body">
        {error && <p className="error-text">{error}</p>}
        {orders.length === 0 && <p className="muted">暂无订单</p>}
        {orders.map((order) => (
          <div className="h5-card" key={order.id} onClick={() => navigate(`/orders/${order.id}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{order.table.tableNo} · #{order.orderNo.slice(-6)}</strong>
              <span className={`status ${order.status}`}>{STATUS_TEXT[order.status]}</span>
            </div>
            <div className="muted" style={{ margin: '8px 0' }}>{order.items.map((i) => `${i.dishNameSnapshot}×${i.quantity}`).join('、')}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="dish-price">{formatMoney(order.totalCents)}</span>
              <span className="muted">{new Date(order.createdAt).toLocaleString('zh-CN')}</span>
            </div>
          </div>
        ))}
        <button className="btn ghost" style={{ width: '100%' }} onClick={() => navigate('/menu')}>继续点餐</button>
      </div>
    </div>
  );
}

export function H5OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setOrder(await api<Order>(`/orders/${id}`, { visitor: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }
  useEffect(() => { void load(); }, [id]);

  async function pay() {
    setBusy(true);
    try {
      setOrder(await api<Order>(`/orders/${id}/pay`, { method: 'POST', visitor: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '支付失败');
    } finally { setBusy(false); }
  }

  return (
    <div className="h5">
      <Header title="订单详情" />
      <div className="h5-body">
        {error && <p className="error-text">{error}</p>}
        {!order ? <p className="muted">加载中...</p> : (
          <>
            <div className="h5-card">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{order.table.tableNo} · {order.orderNo}</strong>
                <span className={`status ${order.status}`}>{STATUS_TEXT[order.status]}</span>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>{new Date(order.createdAt).toLocaleString('zh-CN')}</div>
            </div>
            <div className="h5-card">
              {order.items.map((item, index) => (
                <div className="order-item" key={index}>
                  <span>{item.dishNameSnapshot} ×{item.quantity}
                    {item.specSnapshot.length > 0 && <div className="muted">{item.specSnapshot.map((s) => `${s.specName}:${s.optionLabel}`).join('、')}</div>}
                  </span>
                  <span>{formatMoney(item.unitPriceCents * item.quantity)}</span>
                </div>
              ))}
              {order.remark && <div className="muted" style={{ marginTop: 8 }}>备注：{order.remark}</div>}
              <div className="order-item" style={{ fontWeight: 700, marginTop: 10, borderTop: '1px solid var(--line)' }}>
                <span>合计</span><span className="dish-price">{formatMoney(order.totalCents)}</span>
              </div>
            </div>
            {order.status === 'PENDING_PAYMENT' && (
              <button className="btn" style={{ width: '100%' }} disabled={busy} onClick={pay}>{busy ? '支付中...' : '模拟支付（无真实扣款）'}</button>
            )}
            <button className="btn ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => navigate('/orders')}>我的订单</button>
          </>
        )}
      </div>
    </div>
  );
}
