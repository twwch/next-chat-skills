import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/db';
import { DEFAULT_SETTINGS } from '@/types';

// GET /api/db/settings — get settings (DB merged with env defaults)
export async function GET() {
  try {
    const storage = await getStorage();
    const dbSettings = await storage.getSettings();

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
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
  }
}

// PUT /api/db/settings — save settings
export async function PUT(request: Request) {
  try {
    const storage = await getStorage();
    const body = await request.json();
    const saved = await storage.saveSettings(body);
    return NextResponse.json(saved);
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
