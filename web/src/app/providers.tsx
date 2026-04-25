"use client";

import { ThirdwebProvider } from "thirdweb/react";
import { agentGuildRuntimeConfig } from "@/lib/runtimeConfig";

export default function Providers({
    children,
}: {
    children: React.ReactNode;
}) {
    if (!agentGuildRuntimeConfig.valid) {
        return <>{children}</>;
    }

    return <ThirdwebProvider>{children}</ThirdwebProvider>;
}
