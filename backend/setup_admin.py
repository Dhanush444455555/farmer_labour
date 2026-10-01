"""
backend/setup_admin.py

CLI tool to promote a user to Owner/Admin and set their password using scrypt hashing.

Usage:
    python setup_admin.py <phone_number>
"""

import asyncio
import sys
import getpass
from database import init_db, get_one, run, hash_password


async def main():
    if len(sys.argv) < 2:
        print("Usage: python setup_admin.py <phone_number>")
        sys.exit(1)

    phone = sys.argv[1].strip()
    clean_phone = "".join(filter(str.isdigit, phone))[-10:]

    if len(clean_phone) != 10:
        print("Error: Please provide a valid 10-digit phone number.")
        sys.exit(1)

    password = getpass.getpass("Enter a secure password for this Admin account (min 6 chars): ")
    if len(password) < 6:
        print("Error: Password must be at least 6 characters.")
        sys.exit(1)

    await init_db()

    user = await get_one("SELECT * FROM users WHERE phone_number = :p OR uid = :p", {"p": clean_phone})
    if not user:
        # Create user record
        await run("INSERT INTO users (uid, phone_number, name, role) VALUES (:p, :p, 'Admin User', 'owner')", {"p": clean_phone})
        user = await get_one("SELECT * FROM users WHERE uid = :p", {"p": clean_phone})

    salt_hex, hash_hex = hash_password(password)

    await run(
        """
        UPDATE users 
        SET role = 'owner', password_hash = :hash, password_salt = :salt 
        WHERE uid = :uid
        """,
        {"hash": hash_hex, "salt": salt_hex, "uid": user["uid"]},
    )

    print(f"\n✅ Success! User {user.get('name') or clean_phone} (phone: {clean_phone}) is now an OWNER / ADMIN.")
    print("You can now log in at /admin/login with this phone number and password.\n")


if __name__ == "__main__":
    asyncio.run(main())
