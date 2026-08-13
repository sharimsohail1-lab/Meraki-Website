/* Meraki by Saima — site behaviour.
   All product content lives in PRODUCTS below. Edit here to add/change pieces. */

var DOT = { ready: '#7A8B5A', mto: '#A6802E', limited: '#6E1436' };

var PRODUCTS = [
  { id:'noor', name:'NOOR', price:'$325', image:'img/p1.webp', type:'mto', status:'Made to order · 4–6 weeks',
    delivery:'Estimated delivery 4–6 weeks from confirmation.',
    description:'A chartreuse silk-cotton kurta with hand-appliquéd blooms and cutwork scallops at the cuff and hem.',
    fabric:'Silk-cotton, hand embroidered', pieces:'Kurta, straight trouser', colour:'Chartreuse / rose' },
  { id:'sahar', name:'SAHAR', price:'$480', image:'img/p2.webp', type:'limited', status:'Limited availability',
    delivery:'Two pieces remain. Ships within 5 working days.',
    description:'An ivory crepe front-open jacket, bordered in resham-embroidered bird and vine work.',
    fabric:'Crepe, resham thread work', pieces:'Jacket, inner slip, trouser', colour:'Ivory / crimson' },
  { id:'sabeen', name:'SABEEN', price:'$295', image:'img/p3.webp', type:'ready', status:'Ready now',
    delivery:'In stock. Ships within 48 hours.',
    description:'A fuchsia cape-sleeve top with scalloped pearl trim, cut wide and worn with a fluid palazzo.',
    fabric:'Silk twill, pearl detailing', pieces:'Cape top, palazzo', colour:'Fuchsia' },
  { id:'gulnaar', name:'GULNAAR', price:'$340', image:'img/p4.webp', type:'mto', status:'Made to order · 4–6 weeks',
    delivery:'Estimated delivery 4–6 weeks from confirmation.',
    description:'A hand-painted floral silk in peach and coral, finished with a lace-edged organza dupatta.',
    fabric:'Printed silk, organza', pieces:'Kurta, trouser, dupatta', colour:'Peach / coral' },
  { id:'mehr', name:'MEHR', price:'$520', image:'img/p5.webp', type:'limited', status:'1 available · size 42',
    delivery:'One piece only, size 42. Ships within 48 hours.',
    description:'Rose pink silk with gota and zardozi borders, worn with a saffron chiffon dupatta.',
    fabric:'Silk, zardozi and gota work', pieces:'Kurta, trouser, dupatta', colour:'Rose / saffron' },
  { id:'ayla', name:'AYLA', price:'$310', image:'img/p6.webp', type:'ready', status:'Ready now',
    delivery:'In stock. Ships within 48 hours.',
    description:'A magenta silk shirt with scattered pearl motifs and an ombré chiffon dupatta.',
    fabric:'Silk, pearl hand work', pieces:'Shirt, trouser, ombré dupatta', colour:'Magenta / blush' },
  { id:'roselle', name:'ROSELLE', price:'$395', image:'img/p7.webp', type:'mto', status:'Made to order · 4–6 weeks',
    delivery:'Estimated delivery 4–6 weeks from confirmation.',
    description:'Deep indigo raw silk with a single embroidered bird-and-blossom panel travelling the front hem.',
    fabric:'Raw silk, thread embroidery', pieces:'Kurta, trouser', colour:'Indigo / multi' },
  { id:'zarin', name:'ZARIN', price:'$360', image:'img/p8.webp', type:'ready', status:'Ready now',
    delivery:'In stock. Ships within 48 hours.',
    description:'Emerald silk-cotton with scalloped floral embroidery and a two-tone chiffon dupatta.',
    fabric:'Silk-cotton, thread embroidery', pieces:'Kurta, trouser, dupatta', colour:'Emerald / pink' }
];

var SIZES = ['38','40','42','44','46','Other / Custom'];

var state = { filter:'all', pid:'noor', size:null, shot:0, bag:[], sent:false };

var $ = function (s) { return document.querySelector(s); };
var byId = function (id) { return document.getElementById(id); };
var find = function (id) { return PRODUCTS.filter(function (p) { return p.id === id; })[0] || PRODUCTS[0]; };

/* ---------- cards ---------- */
function cardHTML(p, small) {
  return '<a class="card" href="#/product/' + p.id + '">' +
    '<div class="shot"><img src="' + p.image + '" alt="' + p.name + '" loading="lazy"></div>' +
    '<div class="meta"><p class="name">' + p.name + '</p><p class="price">' + p.price + '</p>' +
    (small ? '' : '<p class="status"><span class="dot" style="background:' + DOT[p.type] + '"></span>' + p.status + '</p>') +
    '</div></a>';
}

function renderGrids() {
  byId('featured-grid').innerHTML = PRODUCTS.slice(0, 4).map(function (p) { return cardHTML(p); }).join('');
  var shown = state.filter === 'all' ? PRODUCTS
    : PRODUCTS.filter(function (p) { return state.filter === 'ready' ? p.type === 'ready' : p.type !== 'ready'; });
  byId('collection-grid').innerHTML = shown.map(function (p) { return cardHTML(p); }).join('');
  byId('collection-count').textContent = shown.length + ' pieces · sizes 38–46 and custom';
  Array.prototype.forEach.call(byId('filters').children, function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter));
  });
}

/* ---------- product ---------- */
function renderProduct() {
  var p = find(state.pid);
  var others = PRODUCTS.filter(function (x) { return x.id !== p.id; });
  var shots = [p.image].concat(others.slice(0, 3).map(function (x) { return x.image; }));
  if (state.shot >= shots.length) state.shot = 0;

  byId('pdp-hero').src = shots[state.shot];
  byId('pdp-hero').alt = p.name;
  byId('pdp-thumbs').innerHTML = shots.map(function (src, i) {
    return '<button data-shot="' + i + '" aria-pressed="' + (state.shot === i) + '">' +
      '<img src="' + src + '" alt="View ' + (i + 1) + '" style="object-position:' + (i === 0 ? '50% 15%' : '50% 30%') + '"></button>';
  }).join('');

  byId('pdp-name').textContent = p.name;
  byId('pdp-price').textContent = p.price;
  byId('pdp-status').textContent = p.status;
  byId('pdp-dot').style.background = DOT[p.type];
  byId('pdp-desc').textContent = p.description;
  byId('pdp-delivery').textContent = p.delivery;

  byId('pdp-sizes').innerHTML = SIZES.map(function (s) {
    return '<button data-size="' + s + '" aria-pressed="' + (state.size === s) + '">' + s + '</button>';
  }).join('');

  var specs = [['Fabric', p.fabric], ['Pieces', p.pieces], ['Colour', p.colour],
    ['Made', 'Lahore, by hand'], ['Care', 'Dry clean only. Store folded in muslin.']];
  byId('pdp-specs').innerHTML = specs.map(function (r) {
    return '<div><p class="k">' + r[0] + '</p><p class="v">' + r[1] + '</p></div>';
  }).join('');

  var inBag = state.bag.some(function (b) { return b.id === p.id; });
  var add = byId('pdp-add');
  add.dataset.state = inBag ? 'added' : (state.size ? 'ready' : 'idle');
  add.textContent = inBag ? 'In your inquiry ✓' : (state.size ? 'Add to inquiry' : 'Select a size');

  byId('pdp-related').innerHTML = others.slice(0, 4).map(function (x) { return cardHTML(x, true); }).join('');
}

/* ---------- inquiry ---------- */
function renderBag() {
  byId('bag-count').textContent = String(state.bag.length);
  var n = state.bag.length;
  byId('bag-label').textContent = n === 0 ? 'Nothing selected yet'
    : n + (n === 1 ? ' look selected' : ' looks selected');

  byId('bag-list').innerHTML = n === 0
    ? '<div class="empty"><p class="body">You haven\'t selected any looks yet.</p>' +
      '<button class="pill pill-ghost" style="padding:14px 28px" data-nav="#/collection">Browse the collection</button></div>'
    : state.bag.map(function (b, i) {
        return '<div class="bagrow"><div class="thumb"><img src="' + b.image + '" alt="' + b.name + '"></div>' +
          '<div class="info"><p class="name">' + b.name + '</p>' +
          '<p class="price">' + b.price + ' · Size ' + b.size + '</p>' +
          '<p class="status" style="margin-top:2px">' + b.status + '</p></div>' +
          '<button class="remove" data-remove="' + i + '">Remove</button></div>';
      }).join('');

  byId('inq-submit').dataset.ready = String(n > 0);
}

/* ---------- routing ---------- */
var VIEWS = ['home', 'collection', 'product', 'inquiry'];

function show(view) {
  VIEWS.forEach(function (v) { byId('view-' + v).classList.toggle('hidden', v !== view); });
}

function route() {
  var hash = location.hash.replace(/^#\/?/, '');

  if (hash.indexOf('product/') === 0) {
    state.pid = hash.slice(8);
    state.size = null; state.shot = 0;
    renderProduct(); show('product'); window.scrollTo(0, 0); return;
  }
  if (hash === 'collection' || hash === 'ready' || hash === 'made-to-order') {
    state.filter = hash === 'ready' ? 'ready' : (hash === 'made-to-order' ? 'mto' : 'all');
    renderGrids(); show('collection'); window.scrollTo(0, 0); return;
  }
  if (hash === 'inquiry') {
    byId('inq-form-wrap').classList.toggle('hidden', state.sent);
    byId('inq-thanks').classList.toggle('hidden', !state.sent);
    renderBag(); show('inquiry'); window.scrollTo(0, 0); return;
  }

  show('home');
  if (hash === 'story') {
    var el = byId('story');
    if (el) window.scrollTo({ top: el.offsetTop - 90, behavior: 'smooth' });
  } else {
    window.scrollTo(0, 0);
  }
}

/* ---------- events (delegated) ---------- */
document.addEventListener('click', function (e) {
  var nav = e.target.closest('[data-nav]');
  if (nav) { location.hash = nav.dataset.nav; return; }

  var shot = e.target.closest('[data-shot]');
  if (shot) { state.shot = Number(shot.dataset.shot); renderProduct(); return; }

  var size = e.target.closest('[data-size]');
  if (size) { state.size = size.dataset.size; renderProduct(); return; }

  var filt = e.target.closest('[data-filter]');
  if (filt) { state.filter = filt.dataset.filter; renderGrids(); return; }

  var rm = e.target.closest('[data-remove]');
  if (rm) { state.bag.splice(Number(rm.dataset.remove), 1); renderBag(); return; }

  if (e.target.closest('#pdp-add')) {
    var p = find(state.pid);
    if (!state.size || state.bag.some(function (b) { return b.id === p.id; })) return;
    state.bag.push({ id: p.id, name: p.name, price: p.price, image: p.image, status: p.status, size: state.size });
    renderProduct(); renderBag();
  }
});

byId('inquiry-form').addEventListener('submit', function (e) {
  e.preventDefault();
  if (!state.bag.length) return;
  state.sent = true;
  route();
});

window.addEventListener('hashchange', route);
renderGrids();
renderBag();
route();
