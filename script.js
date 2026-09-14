const $ = id => document.getElementById(id);
const money = amount => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount / 100);
const photos = {
  1: 'https://skailama-demo.myshopify.com/cdn/shop/files/W5.png?crop=center&height=922&v=1742531445&width=922',
  2: 'https://media3.bosch-home.com/Images/1200x/MCMI013713_B08K147.jpg',
  3: 'https://img01.ztat.net/article/spp-media-p1/ec39d7a9cdce40a1b55b9cc2d983d9a9/2a33807d407a4a74a968d11a74be3968.jpg?imwidth=762',
  4: 'https://www.jousenshoes.com/cdn/shop/files/7_5c6cfdce-26b5-4652-b5e2-86ad2bb6fae5_2048x.jpg?v=1756452913'
};
const previewProducts = [
  { id: 1, name: 'Perfume Acqua', category: 'Perfumes', description: 'Una nota fresca para todos los días. Presentación de muestra.', price: 2500000, stock: 12 },
  { id: 2, name: 'Camisa Blanca', category: 'Ropa', description: 'El básico que combina con todo. Talle único de demostración.', price: 1500000, stock: 20 },
  { id: 3, name: 'Jeans Azul', category: 'Ropa', description: 'Denim clásico de corte recto. Talle único de demostración.', price: 3000000, stock: 15 },
  { id: 4, name: 'Zapatillas Urban', category: 'Calzado', description: 'Líneas simples para la ciudad. Talle único de demostración.', price: 5000000, stock: 8 }
];
let products = [];
let cart = new Map();
let requestKey = null;
let submitting = false;
let loadVersion = 0;
let toastTimer;

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'La operación no pudo completarse.');
  return data;
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
}
function renderProducts() {
  const q = $('search').value.trim().toLocaleLowerCase('es');
  const category = $('category').value;
  let shown = products.filter(p => (!category || p.category === category) && `${p.name} ${p.description}`.toLocaleLowerCase('es').includes(q));
  const sort = $('sort').value;
  if (sort !== 'featured') shown.sort((a, b) => sort === 'price-asc' ? a.price - b.price : b.price - a.price);
  $('product-list').replaceChildren();
  $('result-count').textContent = `(${shown.length})`;
  $('catalog-status').textContent = shown.length ? '' : 'No encontramos productos. Probá otra búsqueda o categoría.';
  for (const p of shown) {
    const card = element('article', 'product');
    const media = element('div', 'product-media');
    const img = element('img');
    img.src = photos[p.id];
    img.alt = `Imagen ilustrativa: ${p.name}`;
    img.loading = 'lazy';
    img.width = 400;
    img.height = 450;
    const caption = element('span', 'image-note', 'Imagen ilustrativa');
    img.addEventListener('error', () => { img.hidden = true; caption.textContent = 'Imagen no disponible'; });
    media.append(img, caption);
    const bottom = element('div', 'product-bottom');
    const button = element('button', 'add', 'Agregar +');
    button.type = 'button';
    button.setAttribute('aria-label', `Agregar ${p.name} al carrito`);
    button.disabled = submitting || p.stock === 0;
    button.addEventListener('click', () => changeQuantity(p.id, 1));
    bottom.append(element('strong', 'price', money(p.price)), button);
    card.append(media, element('p', 'category-tag', p.category), element('h3', '', p.name), element('p', 'description', p.description), bottom, element('p', 'stock', p.stock ? `${p.stock} disponibles` : 'Agotado'));
    $('product-list').append(card);
  }
}
function changeQuantity(id, delta) {
  if (submitting) return;
  const p = products.find(p => p.id === id);
  const next = (cart.get(id) || 0) + delta;
  if (!p || (delta > 0 && next > Math.min(p.stock, 20))) {
    $('checkout-status').textContent = 'No hay más unidades disponibles para agregar.';
    return toast('No hay más unidades disponibles.');
  }
  if (next <= 0) cart.delete(id); else cart.set(id, next);
  requestKey = null;
  $('checkout-status').textContent = '';
  renderCart();
  if (!$('cart-dialog').open && delta > 0) toast(`${p.name} se agregó al carrito`);
}
function renderCart() {
  $('cart-count').textContent = [...cart.values()].reduce((a, b) => a + b, 0);
  $('cart-items').replaceChildren();
  let total = 0;
  for (const [id, quantity] of cart) {
    const p = products.find(p => p.id === id);
    if (!p) continue;
    total += p.price * quantity;
    const line = element('div', 'cart-line');
    const info = element('div');
    info.append(element('strong', '', p.name), element('p', '', `${money(p.price)} por unidad`));
    const controls = element('div', 'cart-controls');
    for (const [label, delta] of [['−', -1], ['+', 1]]) {
      const button = element('button', '', label);
      button.type = 'button';
      button.disabled = submitting || (delta > 0 && quantity >= Math.min(p.stock, 20));
      button.setAttribute('aria-label', `${delta > 0 ? 'Agregar' : 'Quitar'} una unidad de ${p.name}`);
      button.addEventListener('click', () => changeQuantity(id, delta));
      if (delta > 0) controls.append(element('span', '', String(quantity)));
      controls.append(button);
    }
    line.append(info, controls);
    $('cart-items').append(line);
  }
  if (!cart.size) $('cart-items').append(element('p', 'muted', 'Tu carrito está vacío. Elegí algo de la colección.'));
  $('cart-total').textContent = money(total);
  $('checkout').disabled = submitting || !cart.size;
  $('checkout').textContent = submitting ? 'Guardando pedido…' : 'Confirmar pedido de prueba';
}
async function loadProducts() {
  const version = ++loadVersion;
  $('catalog-status').textContent = 'Cargando la colección…';
  $('retry').hidden = true;
  $('product-list').setAttribute('aria-busy', 'true');
  try {
    const data = await api('/api/products');
    if (version !== loadVersion) return;
    products = data.products;
    renderProducts();
    renderCart();
  } catch {
    if (version !== loadVersion) return;
    products = previewProducts;
    renderProducts();
    renderCart();
    $('catalog-status').textContent = 'Vista visual activa. Conectá el servidor para registrar pedidos.';
    $('retry').hidden = false;
  } finally { if (version === loadVersion) $('product-list').setAttribute('aria-busy', 'false'); }
}
$('open-cart').addEventListener('click', () => { renderCart(); $('cart-dialog').showModal(); });
$('close-cart').addEventListener('click', () => $('cart-dialog').close());
$('retry').addEventListener('click', loadProducts);
for (const id of ['search', 'category', 'sort']) $(id).addEventListener(id === 'search' ? 'input' : 'change', renderProducts);
$('checkout').addEventListener('click', async () => {
  if (submitting || !cart.size) return;
  submitting = true;
  requestKey ||= crypto.randomUUID();
  renderCart();
  renderProducts();
  $('checkout-status').textContent = 'Estamos guardando tu pedido de prueba…';
  try {
    const order = await api('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey }, body: JSON.stringify({ items: [...cart].map(([id, quantity]) => ({ id, quantity })) }) });
    cart.clear();
    requestKey = null;
    $('checkout-status').textContent = `Pedido ${order.id.slice(0, 8)} guardado. Total: ${money(order.total)}. No se realizó ningún cobro.`;
  } catch (error) {
    $('checkout-status').textContent = `${error.message} Tu selección se conserva; podés ajustar el carrito o volver a intentar.`;
  } finally {
    submitting = false;
    renderProducts();
    await loadProducts();
    renderCart();
  }
});
loadProducts();
