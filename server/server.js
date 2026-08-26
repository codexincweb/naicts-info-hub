require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { query, migrate } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required.');
if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required in production.');
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC));

const hasCloudinary = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (hasCloudinary) cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) });

const now = () => new Date().toISOString();
const slugify = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
const publicStatuses = ['published'];
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try { req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Invalid or expired session' }); }
}
function staff(req, res, next) { if (!['super_admin','admin','pro','editor'].includes(req.user.role)) return res.status(403).json({ error: 'Staff access required' }); next(); }
function canPublish(role) { return ['super_admin','admin','pro'].includes(role); }
function cleanContent(value) { return String(value || '').trim(); }

app.get('/api/health', async (req, res) => { try { await query('SELECT 1'); res.json({ ok: true, name: 'NAICTS INFOHUB', database: 'postgresql', media: hasCloudinary ? 'cloudinary' : 'not_configured', time: now() }); } catch { res.status(503).json({ ok: false, error: 'Database unavailable' }); } });

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts. Please try again later.' } });
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const r = await query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const r = await query(
      'SELECT id, name, email, role FROM users WHERE id=$1',
      [req.user.id]
    );

    if (!r.rowCount) {
      return res.status(401).json({ error: 'User account not found' });
    }

    res.json({ user: r.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Unable to verify session' });
  }
});

app.get('/api/public/posts', async (req, res) => {
  const q = String(req.query.q || '').trim(); const cat = req.query.category;
  const args = []; const where = [`status = ANY($${args.length + 1})`]; args.push(publicStatuses);
  if (q) { args.push(`%${q}%`); where.push(`(title ILIKE $${args.length} OR excerpt ILIKE $${args.length} OR content ILIKE $${args.length})`); }
  if (cat) { args.push(cat); where.push(`category = $${args.length}`); }
  const r = await query(`SELECT id,title,slug,excerpt,content,category,cover_image,author,featured,views,published_at,created_at FROM posts WHERE ${where.join(' AND ')} ORDER BY featured DESC, published_at DESC NULLS LAST`, args);
  res.json(r.rows);
});
app.get('/api/public/posts/:slug', async (req, res) => { const r = await query(`SELECT * FROM posts WHERE slug=$1 AND status='published'`, [req.params.slug]); if (!r.rowCount) return res.status(404).json({ error: 'Post not found' }); await query('UPDATE posts SET views=views+1 WHERE id=$1', [r.rows[0].id]); r.rows[0].views++; res.json(r.rows[0]); });
app.get('/api/public/events', async (req, res) => { const r = await query('SELECT * FROM events ORDER BY date ASC,time ASC'); res.json(r.rows); });
app.get('/api/public/categories', async (req, res) => { const r = await query("SELECT category,COUNT(*)::int AS count FROM posts WHERE status='published' GROUP BY category ORDER BY count DESC"); res.json(r.rows); });

app.get('/api/admin/posts', auth, staff, async (req,res) => { const r=await query('SELECT * FROM posts ORDER BY created_at DESC'); res.json(r.rows); });
app.post('/api/admin/posts', auth, staff, async (req,res) => {
  let { title, excerpt='', content, category='News', author, status='draft', featured=false, cover_image='' } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });
  if (status === 'published' && !canPublish(req.user.role)) status = 'review';
  let slug = slugify(title); const exists = await query('SELECT id FROM posts WHERE slug=$1',[slug]); if (exists.rowCount) slug += '-' + Date.now();
  const r = await query(`INSERT INTO posts(title,slug,excerpt,content,category,cover_image,author,status,featured,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $8='published' THEN NOW() ELSE NULL END) RETURNING *`, [title,slug,excerpt,cleanContent(content),category,cover_image,author||req.user.name,status,Boolean(featured)]);
  res.status(201).json(r.rows[0]);
});
app.put('/api/admin/posts/:id', auth, staff, async (req,res) => {
  const old = await query('SELECT * FROM posts WHERE id=$1',[req.params.id]); if(!old.rowCount) return res.status(404).json({error:'Post not found'});
  const p=old.rows[0], b=req.body||{}; let status=b.status||p.status; if(status==='published'&&!canPublish(req.user.role)) status='review'; let slug=slugify(b.title||p.title); const same=await query('SELECT id FROM posts WHERE slug=$1 AND id<>$2',[slug,p.id]); if(same.rowCount) slug+='-'+p.id;
  const published=status==='published'?(p.published_at||now()):null;
  const r=await query(`UPDATE posts SET title=$1,slug=$2,excerpt=$3,content=$4,category=$5,cover_image=$6,author=$7,status=$8,featured=$9,published_at=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,[b.title||p.title,slug,b.excerpt??p.excerpt,cleanContent(b.content ?? p.content),b.category||p.category,b.cover_image??p.cover_image,b.author||p.author,status,Boolean(b.featured),published,p.id]); res.json(r.rows[0]);
});
app.delete('/api/admin/posts/:id',auth,staff,async(req,res)=>{const r=await query('DELETE FROM posts WHERE id=$1',[req.params.id]);res.json({ok:r.rowCount>0});});

app.get('/api/admin/events', auth, staff, async(req,res)=>{const r=await query('SELECT * FROM events ORDER BY date ASC');res.json(r.rows);});
app.post('/api/admin/events', auth, staff, async(req,res)=>{const b=req.body||{};if(!b.title||!b.date)return res.status(400).json({error:'Title and date are required'});let slug=slugify(b.title);const e=await query('SELECT id FROM events WHERE slug=$1',[slug]);if(e.rowCount)slug+='-'+Date.now();const r=await query('INSERT INTO events(title,slug,description,date,time,venue,image) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[b.title,slug,b.description||'',b.date,b.time||'',b.venue||'',b.image||'']);res.status(201).json(r.rows[0]);});
app.delete('/api/admin/events/:id', auth, staff, async(req,res)=>{const r=await query('DELETE FROM events WHERE id=$1',[req.params.id]);res.json({ok:r.rowCount>0});});
app.get('/api/public/gallery', async (req,res) => {
  const r = await query(
    'SELECT * FROM gallery ORDER BY created_at DESC'
  );
  res.json(r.rows);
});

app.get('/api/admin/gallery', auth, staff, async (req,res) => {
  const r = await query(
    'SELECT * FROM gallery ORDER BY created_at DESC'
  );
  res.json(r.rows);
});

app.post('/api/admin/gallery', auth, staff, async (req,res) => {
  const b = req.body || {};

  if (!b.title || !b.image) {
    return res.status(400).json({
      error: 'Title and image are required'
    });
  }

  const r = await query(
    `INSERT INTO gallery
      (title, description, image, category)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [
      b.title,
      b.description || '',
      b.image,
      b.category || 'General'
    ]
  );

  res.status(201).json(r.rows[0]);
});

app.delete('/api/admin/gallery/:id', auth, staff, async (req,res) => {
  const r = await query(
    'DELETE FROM gallery WHERE id=$1',
    [req.params.id]
  );

  res.json({
    ok: r.rowCount > 0
  });
});

app.post('/api/admin/upload', auth, staff, upload.single('image'), async (req,res) => {
  if (!req.file) return res.status(400).json({ error: 'Valid image required' });
  if (!hasCloudinary) return res.status(503).json({ error: 'Media storage is not configured. Add Cloudinary credentials to the environment.' });
  try {
    const result = await new Promise((resolve,reject)=>{ const stream=cloudinary.uploader.upload_stream({folder:'naicts-infohub'},(err,r)=>err?reject(err):resolve(r)); stream.end(req.file.buffer); });
    res.json({ url: result.secure_url, public_id: result.public_id });
  } catch { res.status(502).json({ error: 'Image storage upload failed' }); }
});
app.get('/api/admin/stats',auth,staff,async(req,res)=>{const [a,b,c,d,e]=await Promise.all([query('SELECT COUNT(*)::int c FROM posts'),query("SELECT COUNT(*)::int c FROM posts WHERE status='published'"),query("SELECT COUNT(*)::int c FROM posts WHERE status<>'published'"),query('SELECT COALESCE(SUM(views),0)::bigint c FROM posts'),query('SELECT COUNT(*)::int c FROM events')]);res.json({posts:a.rows[0].c,published:b.rows[0].c,drafts:c.rows[0].c,views:d.rows[0].c,events:e.rows[0].c});});

app.get('/admin',(req,res)=>res.sendFile(path.join(PUBLIC,'admin.html')));
app.use((req,res,next)=>{ if(req.method==='GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(PUBLIC,'index.html')); next(); });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NAICTS INFOHUB running on port ${PORT}`);

  migrate()
    .then(() => {
      console.log('Migration ok');
    })
    .catch(err => {
      console.error('Migration failed:', err.message);
    });
});
