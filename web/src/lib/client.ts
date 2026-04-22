import { createThirdwebClient } from "thirdweb";
import { requirePublicEnv } from "./runtimeConfig";

export const client = createThirdwebClient({
    clientId: requirePublicEnv("NEXT_PUBLIC_THIRDWEB_CLIENT_ID"),
});
