const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

(async () => {
  const db = await open({
    filename: path.join(__dirname, 'farm_connect.sqlite'),
    driver: sqlite3.Database
  });
  const cols = await db.all("PRAGMA table_info(users)");
  console.log("Columns in users table:", cols.map(c => c.name));

  // Add email columns if missing
  const hasEmail = cols.some(c => c.name === 'email');
  if (!hasEmail) {
    console.log("Adding email columns...");
    try { await db.exec("ALTER TABLE users ADD COLUMN email TEXT"); } catch(e) { console.log("email:", e.message); }
    try { await db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0"); } catch(e) { console.log("email_verified:", e.message); }
    try { await db.exec("ALTER TABLE users ADD COLUMN email_verification_token TEXT"); } catch(e) { console.log("email_verification_token:", e.message); }
    console.log("Done!");
  } else {
    console.log("email column already exists.");
  }
  await db.close();
})();
