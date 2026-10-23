import { NextResponse } from "next/server";
import { diligence } from "@/lib/diligence";
import type { DiligenceInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let input: DiligenceInput;
  try {
    const body = (await req.json()) as Partial<DiligenceInput>;
    const companyName = String(body.companyName ?? "").trim();
    const jurisdictions = (body.jurisdictions ?? []).map((j) => String(j).trim().toUpperCase()).filter(Boolean);
    if (companyName.length < 2) throw new Error("companyName is required");
    if (!jurisdictions.length || jurisdictions.length > 3 || jurisdictions.some((j) => !/^[A-Z]{2}$/.test(j))) {
      throw new Error("jurisdictions must be 1-3 two-letter country codes, e.g. HK");
    }
    input = {
      companyName,
      jurisdictions,
      registrationNumber: body.registrationNumber?.trim() || undefined,
      documentUrl: body.documentUrl?.trim() || undefined,
    };
  } catch (e) {
    // bad input: rejected before any payment is made
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    return NextResponse.json(await diligence(input));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
