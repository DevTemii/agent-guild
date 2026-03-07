export const AGENT_REGISTRY_ADDRESS =
    "0xcc4d265bedade3d6ad4d722fa5c2ad8497e0095a";

export const AGENT_REGISTRY_ABI = [
    {
        inputs: [
            { internalType: "string", name: "_name", type: "string" },
            { internalType: "string", name: "_description", type: "string" },
            { internalType: "string", name: "_skill", type: "string" },
            { internalType: "uint256", name: "_hourlyRate", type: "uint256" },
            { internalType: "string", name: "_location", type: "string" },
            { internalType: "string", name: "_availability", type: "string" },
        ],
        name: "registerAgent",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "getAgents",
        outputs: [
            {
                components: [
                    { internalType: "address", name: "owner", type: "address" },
                    { internalType: "string", name: "name", type: "string" },
                    { internalType: "string", name: "description", type: "string" },
                    { internalType: "string", name: "skill", type: "string" },
                    { internalType: "uint256", name: "hourlyRate", type: "uint256" },
                    { internalType: "string", name: "location", type: "string" },
                    { internalType: "string", name: "availability", type: "string" },
                ],
                internalType: "struct AgentRegistry.Agent[]",
                name: "",
                type: "tuple[]",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
] as const;