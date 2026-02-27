'use server';

import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword, createSession, destroySession } from '@/lib/auth2';
import { redirect } from 'next/navigation';

export async function loginAction(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.password) {
      await prisma.loginHistory.create({
        data: { email, status: 'Failed', reason: 'Invalid credentials' },
      });
      return { error: 'Invalid email or password' };
    }

    if (user.status === 'SUSPENDED') {
      await prisma.loginHistory.create({
        data: { email, userId: user.id, status: 'Failed', reason: 'Account suspended' },
      });
      return { error: 'Your account has been suspended' };
    }

    const validPassword = await verifyPassword(password, user.password);
    if (!validPassword) {
      await prisma.user.update({
        where: { id: user.id },
        data: { login_attempts: { increment: 1 } },
      });
      await prisma.loginHistory.create({
        data: { email, userId: user.id, status: 'Failed', reason: 'Wrong password' },
      });
      return { error: 'Invalid email or password' };
    }

    // Reset login attempts
    await prisma.user.update({
      where: { id: user.id },
      data: { login_attempts: 0, status: user.status === 'PENDING' ? 'ACTIVE' : user.status },
    });

    await prisma.loginHistory.create({
      data: { email, userId: user.id, status: 'Success' },
    });

    await createSession(user.id);
  } catch (error) {
    console.error('[v0] Login error:', error);
    return { error: 'An unexpected error occurred' };
  }

  redirect('/admin/dashboard');
}

export async function signupAction(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const firstName = formData.get('firstName') as string;
  const lastName = formData.get('lastName') as string;

  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters' };
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      return { error: 'An account with this email already exists' };
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        first_name: firstName || null,
        last_name: lastName || null,
        status: 'ACTIVE',
        provider: 'EMAIL',
      },
    });

    await prisma.loginHistory.create({
      data: { email: user.email, userId: user.id, status: 'Success', reason: 'Signup' },
    });

    await createSession(user.id);
  } catch (error) {
    console.error('Signup error:', error);
    return { error: 'An unexpected error occurred' };
  }

  redirect('/admin/dashboard');
}

export async function logoutAction() {
  await destroySession();
  redirect('/login');
}
