import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/db';
import { DEFAULT_SETTINGS } from '@/types';
import { getUserId } from '@/lib/auth-helper';

// GET /api/db/settings — get settings (DB merged with env defaults)
export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let dbSettings = null;
    try {
      const storage = await getStorage();
      dbSettings = await storage.getSettingsByUser(userId);
    } catch (dbError) {
      // DB error - fall back to env vars only
      console.error('Failed to get settings from DB, using env vars:', dbError);
    }

    // Merge: DB values take priority, then env vars, then defaults
    const merged = {
      openaiApiKey: dbSettings?.openaiApiKey || process.env.OPENAI_API_KEY || DEFAULT_SETTINGS.openaiApiKey,
      openaiBaseUrl: dbSettings?.openaiBaseUrl || process.env.OPENAI_BASE_URL || DEFAULT_SETTINGS.openaiBaseUrl,
      model: dbSettings?.model || process.env.OPENAI_MODEL || DEFAULT_SETTINGS.model,
      skillsDir: dbSettings?.skillsDir || process.env.SKILLS_DIR || DEFAULT_SETTINGS.skillsDir,
    };

    return NextResponse.json(merged);
  } catch (error) {
    console.error('Failed to get settings:', error);
    // Even on auth error, return env-based settings
    return NextResponse.json({
      openaiApiKey: process.env.OPENAI_API_KEY || DEFAULT_SETTINGS.openaiApiKey,
      openaiBaseUrl: process.env.OPENAI_BASE_URL || DEFAULT_SETTINGS.openaiBaseUrl,
      model: process.env.OPENAI_MODEL || DEFAULT_SETTINGS.model,
      skillsDir: process.env.SKILLS_DIR || DEFAULT_SETTINGS.skillsDir,
    });
  }
}

// PUT /api/db/settings — save settings
export async function PUT(request: Request) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const storage = await getStorage();
    const body = await request.json();
    const saved = await storage.saveSettingsByUser(userId, body);
    return NextResponse.json(saved);
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
