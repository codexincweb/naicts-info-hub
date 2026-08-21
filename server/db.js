const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.'
  );
}

const pool = new Pool({
  connectionString,

  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,

  max: 3,

  min: 0,

  idleTimeoutMillis: 5000,

  connectionTimeoutMillis: 15000,

  keepAlive: true,

  keepAliveInitialDelayMillis: 10000,

  allowExitOnIdle: true
});

pool.on('error', err => {
  console.error(
    'PostgreSQL background connection reset:',
    err.code || '',
    err.message
  );
});

async function query(text, params) {
  return pool.query(text, params);
}

async function migrate() {

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL
        CHECK (role IN ('super_admin','admin','pro','editor'))
        DEFAULT 'editor',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS posts (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'News',
      cover_image TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT 'NAICTS INFOHUB',
      status TEXT NOT NULL
        CHECK (
          status IN (
            'draft',
            'review',
            'approved',
            'published',
            'archived'
          )
        )
        DEFAULT 'draft',
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      views BIGINT NOT NULL DEFAULT 0,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      date DATE NOT NULL,
      time TEXT NOT NULL DEFAULT '',
      venue TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS posts_status_idx
      ON posts(status);

    CREATE INDEX IF NOT EXISTS posts_category_idx
      ON posts(category);

    CREATE INDEX IF NOT EXISTS posts_published_idx
      ON posts(published_at DESC);

    CREATE INDEX IF NOT EXISTS events_date_idx
      ON events(date ASC);
  `);

  const user = await query(
    'SELECT id FROM users LIMIT 1'
  );

  if (!user.rowCount) {

    const email =
      process.env.ADMIN_EMAIL ||
      'admin@naicts-infohub.local';

    const password =
      process.env.ADMIN_PASSWORD ||
      'ChangeMeImmediately123!';

    const hash =
      await bcrypt.hash(password, 12);

    await query(
      `
      INSERT INTO users
      (name,email,password_hash,role)
      VALUES($1,$2,$3,$4)
      `,
      [
        'NAICTS Super Admin',
        email,
        hash,
        'super_admin'
      ]
    );
  }

  const posts = await query(
    'SELECT id FROM posts LIMIT 1'
  );

  if (!posts.rowCount) {

    const seed = [

      [
        'Welcome to NAICTS INFOHUB',
        'welcome-to-naicts-infohub',
        'Your central place for official NAICTS and faculty information.',
        'NAICTS INFOHUB brings official news, announcements, PRO communications and events into one accessible public platform.',
        'News',
        'NAICTS INFOHUB',
        'published',
        true
      ],

      [
        'Important faculty updates',
        'important-faculty-updates',
        'Official notices and timely information will appear here.',
        'Check this space for verified faculty and NAICTS announcements.',
        'Announcement',
        'NAICTS INFOHUB',
        'published',
        false
      ],

      [
        'From the PRO Desk',
        'from-the-pro-desk',
        'Official communications from the Public Relations Office.',
        'The PRO Desk is the dedicated space for official public relations updates.',
        'PRO',
        'Public Relations Officer',
        'published',
        false
      ]

    ];

    for (const post of seed) {

      await query(
        `
        INSERT INTO posts
        (
          title,
          slug,
          excerpt,
          content,
          category,
          author,
          status,
          featured,
          published_at
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          CASE
            WHEN $7 = 'published'
            THEN NOW()
            ELSE NULL
          END
        )
        `,
        post
      );
    }
  }
}

module.exports = {
  query,
  migrate,
  pool
};
