import { NextResponse } from "next/server";
import { getWorkflowStoreHealth } from "@/lib/server/workflowDbStore";

export const runtime = "nodejs";

export async function GET() {
  try {
    const health = await getWorkflowStoreHealth();
    if (!health.tablesReady) {
      return NextResponse.json(
        {
          success: false,
          storeType: health.storeType,
          databaseConfigured: health.databaseConfigured,
          tablesReady: false,
          error: health.error ?? "DB_HEALTH_TIMEOUT_OR_FAILED",
        },
        { status: health.databaseConfigured ? 503 : 500 }
      );
    }

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
        storeType: "postgres",
        databaseConfigured: true,
        tablesReady: false,
        error: "DB_HEALTH_TIMEOUT_OR_FAILED",
      },
      { status: 503 }
    );
  }
}
