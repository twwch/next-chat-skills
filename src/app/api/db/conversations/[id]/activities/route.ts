import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/db';
import { auth } from '@/lib/auth';

// POST /api/db/conversations/[id]/activities — add an activity
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const storage = await getStorage();
    // Verify conversation belongs to user
    const conv = await storage.getConversationByUser(id, session.user.id);
    if (!conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const activity = await request.json();
    await storage.addActivity(id, activity);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error('Failed to add activity:', error);
    return NextResponse.json({ error: 'Failed to add activity' }, { status: 500 });
  }
}

// DELETE /api/db/conversations/[id]/activities — clear all activities
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const storage = await getStorage();
    // Verify conversation belongs to user
    const conv = await storage.getConversationByUser(id, session.user.id);
    if (!conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await storage.clearActivities(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to clear activities:', error);
    return NextResponse.json({ error: 'Failed to clear activities' }, { status: 500 });
  }
}
