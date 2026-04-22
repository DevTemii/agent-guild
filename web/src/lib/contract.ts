import { activeAgentGuildDeployment } from "./networkConfig";

export const AGENT_REGISTRY_ADDRESS =
    activeAgentGuildDeployment.agentRegistryAddress;

export const FREELANCE_ESCROW_ADDRESS =
    activeAgentGuildDeployment.freelanceEscrowAddress;

export const FREELANCE_ESCROW_PROJECT_CREATED_EVENT =
    "event ProjectCreated(uint256 indexed projectId, address indexed client, address indexed freelancer)" as const;

export const FREELANCE_ESCROW_ABI = [
    {
        type: "event",
        name: "ProjectCreated",
        inputs: [
            { name: "projectId", type: "uint256", indexed: true },
            { name: "client", type: "address", indexed: true },
            { name: "freelancer", type: "address", indexed: true },
        ],
        anonymous: false,
    },
    {
        type: "function",
        name: "createProject",
        stateMutability: "nonpayable",
        inputs: [{ name: "_freelancer", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        type: "function",
        name: "deposit",
        stateMutability: "payable",
        inputs: [{ name: "_projectId", type: "uint256" }],
        outputs: [],
    },
    {
        type: "function",
        name: "submitWork",
        stateMutability: "nonpayable",
        inputs: [{ name: "_projectId", type: "uint256" }],
        outputs: [],
    },
    {
        type: "function",
        name: "approveAndRelease",
        stateMutability: "nonpayable",
        inputs: [{ name: "_projectId", type: "uint256" }],
        outputs: [],
    },
    {
        type: "function",
        name: "getProject",
        stateMutability: "view",
        inputs: [{ name: "_projectId", type: "uint256" }],
        outputs: [
            { name: "client", type: "address" },
            { name: "freelancer", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "status", type: "uint8" },
        ],
    },
];



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

