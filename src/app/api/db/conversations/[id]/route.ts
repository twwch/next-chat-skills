import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/db';
import { getUserId } from '@/lib/auth-helper';

// GET /api/db/conversations/[id] — get a single conversation with messages
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const storage = await getStorage();
    const conv = await storage.getConversationByUser(id, userId);
    if (!conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(conv);
  } catch (error) {
    console.error('Failed to get conversation:', error);
    return NextResponse.json({ error: 'Failed to get conversation' }, { status: 500 });
  }
}

// PUT /api/db/conversations/[id] — update a conversation
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const storage = await getStorage();
    const body = await request.json();
    const updated = await storage.updateConversationForUser({ ...body, id }, userId);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update conversation:', error);
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
  }
}

// DELETE /api/db/conversations/[id] — delete a conversation
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const storage = await getStorage();
    await storage.deleteConversationForUser(id, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete conversation:', error);
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
}
