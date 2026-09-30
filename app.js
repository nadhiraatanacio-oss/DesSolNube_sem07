// Monolito LOGIN + CRUD (sin dependencias). Uso: node app.js PUERTO NODO
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.argv[2] || '3001', 10);
const NODO = process.argv[3] || '1';
const SECRET = 'clave-compartida-lab07'; // igual en todos los nodos
const DATA = path.join(__dirname, 'data.json'); // BD compartida por los 3 nodos

const TEMAS = {
  '1': { color: '#e53935', fondo: 'linear-gradient(135deg,#ffcdd2,#e53935)', nombre: 'NODO 1 - ROJO' },
  '2': { color: '#2e7d32', fondo: 'linear-gradient(135deg,#c8e6c9,#2e7d32)', nombre: 'NODO 2 - VERDE' },
  '3': { color: '#1565c0', fondo: 'linear-gradient(135deg,#bbdefb,#1565c0)', nombre: 'NODO 3 - AZUL' }
};
const T = TEMAS[NODO] || TEMAS['1'];

// ---------- Datos ----------
function leer() {
  if (!fs.existsSync(DATA)) {
    const inicial = {
      usuarios: [{ usuario: 'admin', clave: 'admin123' }],
      productos: [
        { id: 1, nombre: 'Laptop', precio: 2500 },
        { id: 2, nombre: 'Mouse', precio: 45 }
      ],
      siguienteId: 3
    };
    fs.writeFileSync(DATA, JSON.stringify(inicial, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA, 'utf8'));
}
function guardar(d) { fs.writeFileSync(DATA, JSON.stringify(d, null, 2)); }

// ---------- Sesion con cookie firmada (sirve en cualquier nodo) ----------
function firmar(u) { return u + '.' + crypto.createHmac('sha256', SECRET).update(u).digest('hex'); }
function usuarioDeCookie(req) {
  const c = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('sesion='));
  if (!c) return null;
  const valor = decodeURIComponent(c.slice(7));
  const u = valor.split('.')[0];
  return firmar(u) === valor ? u : null;
}

// ---------- Utilidades ----------
function esc(s) { return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function leerCuerpo(req) {
  return new Promise(ok => {
    let b = '';
    req.on('data', x => b += x);
    req.on('end', () => ok(Object.fromEntries(new URLSearchParams(b))));
  });
}
function enviar(res, html, estado = 200) {
  res.writeHead(estado, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Nodo': T.nombre });
  res.end(html);
}
function redirigir(res, url, extra = {}) {
  res.writeHead(302, Object.assign({ Location: url, 'Cache-Control': 'no-store' }, extra));
  res.end();
}
function pagina(titulo, cuerpo) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${titulo} | ${T.nombre}</title>
<style>
  body{margin:0;font-family:Arial,sans-serif;background:${T.fondo};min-height:100vh}
  .banda{background:${T.color};color:#fff;padding:14px 20px;font-size:20px;font-weight:bold;display:flex;justify-content:space-between;align-items:center}
  .banda a{color:#fff}
  .caja{background:#fff;max-width:720px;margin:30px auto;padding:25px;border-radius:12px;border-top:10px solid ${T.color};box-shadow:0 4px 15px rgba(0,0,0,.25)}
  h1,h2{color:${T.color};margin-top:0}
  input{padding:8px;margin:4px 0;border:1px solid #bbb;border-radius:6px}
  button,.btn{background:${T.color};color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;text-decoration:none;font-size:14px}
  .rojo{background:#555}
  table{width:100%;border-collapse:collapse;margin-top:15px}
  th{background:${T.color};color:#fff}
  th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}
  .sello{font-size:42px;font-weight:bold;color:${T.color};text-align:center;border:4px dashed ${T.color};border-radius:12px;padding:10px;margin-bottom:15px}
  .error{color:#b00020;font-weight:bold}
  form.linea{display:inline}
</style></head><body>
<div class="banda"><span>Atendido por: ${T.nombre} (puerto ${PORT})</span>${cuerpo.includes('id="app"') ? '<a href="/logout">Cerrar sesión</a>' : ''}</div>
${cuerpo}</body></html>`;
}

// ---------- Vistas ----------
function vistaLogin(error = '') {
  return pagina('Login', `<div class="caja" style="max-width:380px">
  <div class="sello">${T.nombre}</div>
  <h1>Iniciar sesión</h1>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <form method="POST" action="/login">
    <label>Usuario</label><br><input name="usuario" required style="width:95%"><br>
    <label>Contraseña</label><br><input name="clave" type="password" required style="width:95%"><br><br>
    <button type="submit" style="width:100%">Ingresar</button>
  </form>
  <p style="color:#777;font-size:13px">Prueba: admin / admin123</p>
</div>`);
}
function vistaProductos(usuario, d) {
  const filas = d.productos.map(p => `<tr><td>${p.id}</td><td>${esc(p.nombre)}</td><td>S/ ${Number(p.precio).toFixed(2)}</td>
  <td><a class="btn" href="/productos/editar?id=${p.id}">Editar</a>
  <form class="linea" method="POST" action="/productos/eliminar" onsubmit="return confirm('¿Eliminar?')">
  <input type="hidden" name="id" value="${p.id}"><button class="rojo">Eliminar</button></form></td></tr>`).join('');
  return pagina('Productos', `<div class="caja" id="app">
  <h1>CRUD de Productos</h1><p>Bienvenido, <b>${esc(usuario)}</b></p>
  <h2>Nuevo producto</h2>
  <form method="POST" action="/productos/crear">
    <input name="nombre" placeholder="Nombre" required>
    <input name="precio" type="number" step="0.01" min="0" placeholder="Precio" required>
    <button type="submit">Agregar</button>
  </form>
  <table><tr><th>ID</th><th>Nombre</th><th>Precio</th><th>Acciones</th></tr>${filas || '<tr><td colspan="4">Sin productos</td></tr>'}</table>
</div>`);
}
function vistaEditar(p) {
  return pagina('Editar', `<div class="caja" id="app">
  <h1>Editar producto #${p.id}</h1>
  <form method="POST" action="/productos/actualizar">
    <input type="hidden" name="id" value="${p.id}">
    <input name="nombre" value="${esc(p.nombre)}" required>
    <input name="precio" type="number" step="0.01" min="0" value="${p.precio}" required>
    <button type="submit">Guardar</button> <a class="btn rojo" href="/productos">Cancelar</a>
  </form></div>`);
}

// ---------- Rutas ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ruta = url.pathname;
  console.log(`[${T.nombre}] ${req.method} ${ruta}`);

  if (ruta === '/ping') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(T.nombre + '\n'); }

  if (ruta === '/login' && req.method === 'GET') return enviar(res, vistaLogin());
  if (ruta === '/login' && req.method === 'POST') {
    const b = await leerCuerpo(req);
    const ok = leer().usuarios.find(u => u.usuario === b.usuario && u.clave === b.clave);
    if (!ok) return enviar(res, vistaLogin('Usuario o contraseña incorrectos'), 401);
    return redirigir(res, '/productos', { 'Set-Cookie': `sesion=${encodeURIComponent(firmar(ok.usuario))}; Path=/; HttpOnly` });
  }
  if (ruta === '/logout') return redirigir(res, '/login', { 'Set-Cookie': 'sesion=; Path=/; Max-Age=0' });

  const usuario = usuarioDeCookie(req);
  if (!usuario) return redirigir(res, '/login');

  if (ruta === '/' || (ruta === '/productos' && req.method === 'GET')) return enviar(res, vistaProductos(usuario, leer()));

  if (ruta === '/productos/crear' && req.method === 'POST') {
    const b = await leerCuerpo(req); const d = leer();
    d.productos.push({ id: d.siguienteId++, nombre: b.nombre, precio: parseFloat(b.precio) || 0 });
    guardar(d); return redirigir(res, '/productos');
  }
  if (ruta === '/productos/editar' && req.method === 'GET') {
    const p = leer().productos.find(x => x.id === parseInt(url.searchParams.get('id'), 10));
    return p ? enviar(res, vistaEditar(p)) : redirigir(res, '/productos');
  }
  if (ruta === '/productos/actualizar' && req.method === 'POST') {
    const b = await leerCuerpo(req); const d = leer();
    const p = d.productos.find(x => x.id === parseInt(b.id, 10));
    if (p) { p.nombre = b.nombre; p.precio = parseFloat(b.precio) || 0; guardar(d); }
    return redirigir(res, '/productos');
  }
  if (ruta === '/productos/eliminar' && req.method === 'POST') {
    const b = await leerCuerpo(req); const d = leer();
    d.productos = d.productos.filter(x => x.id !== parseInt(b.id, 10));
    guardar(d); return redirigir(res, '/productos');
  }
  enviar(res, pagina('404', '<div class="caja"><h1>404</h1><a class="btn" href="/productos">Volver</a></div>'), 404);
});

server.listen(PORT, () => console.log(`${T.nombre} escuchando en http://localhost:${PORT}`));