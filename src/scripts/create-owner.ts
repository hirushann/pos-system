import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { auth } from '../lib/auth';
import { db, closeDb } from '../db';
import { user, account } from '../db/auth-schema';

function parseArgs(args: string[]): { email?: string; name?: string } {
  const result: { email?: string; name?: string } = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--email' || arg === '-e') {
      result.email = args[i + 1];
      i++;
    } else if (arg === '--name' || arg === '-n') {
      result.name = args[i + 1];
      i++;
    }
  }
  return result;
}

function generatePassword(length = 16): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  let pwd = '';
  for (let i = 0; i < length; i++) {
    pwd += chars.charAt(crypto.randomInt(chars.length));
  }
  return pwd;
}

async function main() {
  const args = process.argv.slice(2);
  const { email, name } = parseArgs(args);

  if (!email || !name) {
    console.error('Error: Both --email and --name are required.');
    console.error('Usage: npm run create-owner -- --email <email> --name <name>');
    process.exit(1);
  }

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();
  const password = generatePassword(16);

  try {
    const existing = await db
      .select()
      .from(user)
      .where(eq(user.email, trimmedEmail))
      .limit(1);

    if (existing.length > 0) {
      const existingUser = existing[0];
      const authCtx = await auth.$context;
      const hashedPassword = await authCtx.password.hash(password);

      await db
        .update(account)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(account.userId, existingUser.id));

      await db
        .update(user)
        .set({
          name: trimmedName,
          role: 'owner',
          banned: false,
          banReason: null,
          banExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(user.id, existingUser.id));

      console.log('\n========================================');
      console.log('✓ Owner account updated with new password!');
      console.log('========================================');
      console.log(`ID:       ${existingUser.id}`);
      console.log(`Name:     ${trimmedName}`);
      console.log(`Email:    ${existingUser.email}`);
      console.log(`Role:     owner`);
      console.log('----------------------------------------');
      console.log(`Password: ${password}`);
      console.log('----------------------------------------');
      console.log('Important: Copy this password now. It will not be shown again.\n');
      return;
    }

    const result = await auth.api.createUser({
      body: {
        name: trimmedName,
        email: trimmedEmail,
        password,
        role: 'owner',
      },
    });

    console.log('\n========================================');
    console.log('✓ Owner account successfully created!');
    console.log('========================================');
    console.log(`ID:       ${result.user.id}`);
    console.log(`Name:     ${result.user.name}`);
    console.log(`Email:    ${result.user.email}`);
    console.log(`Role:     ${result.user.role}`);
    console.log('----------------------------------------');
    console.log(`Password: ${password}`);
    console.log('----------------------------------------');
    console.log('Important: Copy this password now. It will not be shown again.\n');
  } catch (error: unknown) {
    console.error('Failed to create owner account:', error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
