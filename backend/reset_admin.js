const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const crypto = require('crypto');

const PHONE = process.argv[2];
const PASSWORD = process.argv[3];

const hashPassword = (password) => {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve({ salt, hash: derivedKey.toString('hex') });
    });
  });
};

(async () => {
  const db = await open({
    filename: path.join(__dirname, 'farm_connect.sqlite'),
    driver: sqlite3.Database
  });

  const user = await db.get("SELECT * FROM users WHERE phone_number = ?", [PHONE]);
  if (!user) { console.error("User not found:", PHONE); process.exit(1); }

  const { salt, hash } = await hashPassword(PASSWORD);
  await db.run(
    "UPDATE users SET role = 'owner', password_hash = ?, password_salt = ? WHERE phone_number = ?",
    [hash, salt, PHONE]
  );

  console.log(`Password reset successful for ${user.name || PHONE}`);
  console.log(`Phone: ${PHONE}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Login at: http://localhost:5173/admin/login`);
  await db.close();
})();
