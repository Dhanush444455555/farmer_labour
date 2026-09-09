const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

(async () => {
  const db = await open({
    filename: path.join(__dirname, 'farm_connect.sqlite'),
    driver: sqlite3.Database
  });
  const owners = await db.all("SELECT uid, name, phone_number, role, CASE WHEN password_hash IS NOT NULL THEN 'YES' ELSE 'NO' END as has_password FROM users WHERE role = 'owner'");
  console.log("Owner accounts:", JSON.stringify(owners, null, 2));
  if (owners.length === 0) {
    console.log("\nNo owner accounts found. All users:");
    const all = await db.all("SELECT uid, name, phone_number, role FROM users LIMIT 20");
    console.log(JSON.stringify(all, null, 2));
  }
  await db.close();
})();
