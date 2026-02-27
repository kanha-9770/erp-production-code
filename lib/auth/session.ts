// lib/auth/session.ts
'use server';

import { cookies } from 'next/headers';
import { validateSession } from '@/lib/auth';

export async function getValidatedSession() {
    const cookieStore = cookies();
    const token = cookieStore.get('auth-token')?.value;

    if (!token) {
        return null;
    }

    try {
        const session = await validateSession(token);
        if (!session?.user) {
            return null;
        }
        return session;
    } catch (err) {
        console.error('Session validation failed in server action:', err);
        return null;
    }
}