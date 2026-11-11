import { NextResponse, type NextRequest } from "next/server";
import { getActionContext } from "@/lib/auth";
import { toUserMessage, AppError } from "@/lib/errors";
import { searchCustomerOptions } from "@/features/customers/queries";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getActionContext();
    const q = request.nextUrl.searchParams.get("q")?.slice(0, 80) ?? undefined;
    const rows = await searchCustomerOptions(ctx, q, 20);
    return NextResponse.json({ customers: rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return NextResponse.json({ error: toUserMessage(error) }, { status });
  }
}
