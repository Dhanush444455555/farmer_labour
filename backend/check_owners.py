"""
backend/check_owners.py

CLI tool to inspect registered owner accounts in SQLite.
"""

import asyncio
import json
from database import init_db, query


async def main():
    await init_db()
    owners = await query(
        """
        SELECT uid, name, phone_number, role, 
               CASE WHEN password_hash IS NOT NULL THEN 'YES' ELSE 'NO' END as has_password 
        FROM users 
        WHERE role = 'owner'
        """
    )
    print("Owner accounts:\n", json.dumps(owners, indent=2))
    if not owners:
        print("\nNo owner accounts found. Sample of all users:")
        all_users = await query("SELECT uid, name, phone_number, role FROM users LIMIT 20")
        print(json.dumps(all_users, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
