import { NextRequest, NextResponse } from "next/server";
import { createTournament } from "@/lib/tournament-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const tournamentId = await createTournament({
      name: body.name || "",
      description: body.description || "",
      category: body.category || "",
      format: body.format || "",
      startDate: body.startDate || "",
      endDate: body.endDate || "",
      location: body.location || "",
      rulesText: body.rulesText || "",
      isPublic: Boolean(body.isPublic ?? true),
      entryFeeAmount: Number(body.entryFeeAmount ?? 0),
      entryFeeCurrency: body.entryFeeCurrency || "PEN",
      paymentMethods: Array.isArray(body.paymentMethods)
        ? body.paymentMethods
        : [],
      registrationDeadline: body.registrationDeadline || "",
      maxPlayers: Number(body.maxPlayers ?? 0),
      createdBy: body.createdBy || "admin",
      paymentConfig: {
        yapePhone: body.paymentConfig?.yapePhone || "",
        yapeQrUrl: body.paymentConfig?.yapeQrUrl || "",
        bankName: body.paymentConfig?.bankName || "",
        accountHolder: body.paymentConfig?.accountHolder || "",
        accountNumber: body.paymentConfig?.accountNumber || "",
        cci: body.paymentConfig?.cci || "",
        instructions: body.paymentConfig?.instructions || "",
      },
      status: body.status || "draft",
    });

    return NextResponse.json({
      ok: true,
      tournamentId,
    });
  } catch (error) {
    console.error("POST /api/tournaments error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo crear el torneo",
      },
      { status: 500 }
    );
  }
}