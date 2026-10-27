import { NextResponse } from "next/server";
import { synth } from "@/lib/data/synthetic";

export const dynamic = "force-dynamic";

// WIRE YOUR API HERE (server side, so keys stay private; see .env.example).
// Return { data: { dates, gold, dxy, oil, ry, etf, cot, vix }, label: "Live · <vendor>" }.
// Daily bars, equal length, oldest first, ry in percent, etf in tonnes, cot in contracts.
// etf, cot, vix may be null if you do not have them yet.
export async function GET() {
  // const key = process.env.MARKET_DATA_API_KEY;
  return NextResponse.json({ data: synth(7), label: "Synthetic sample data (not market data) · seed 7" });
}
