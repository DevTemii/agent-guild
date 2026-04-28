import { NextResponse } from "next/server";
import { getWorkflowStoreHealth } from "@/lib/server/workflowDbStore";

export const runtime = "nodejs";

export async function GET() {
  try {
    const health = await getWorkflowStoreHealth();
    return NextResponse.json({
      success: true,
      storeType: health.storeType,
      databaseConfigured: health.databaseConfigured,
      tablesReady: health.tablesReady,
    });
  } catch (error) {
    console.error("Agent Guild workflow health route failed", error);
    return NextResponse.json(
      {
        success: false,
        storeType: "memory",
        databaseConfigured: false,
        tablesReady: false,
        error: error instanceof Error ? error.message : "Failed to inspect workflow store.",
      },
      { status: 500 }
    );
  }
}
