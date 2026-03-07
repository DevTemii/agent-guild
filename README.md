# Agent Guild

Agent Guild is an onchain workforce protocol for freelancers in emerging markets, built on Celo.

It helps freelancers create portable onchain work profiles, generate AI-assisted freelance contracts, simulate milestone-based escrow flows, and unlock reputation and credit visibility.

## Problem

Freelancers in emerging markets face major trust and payment problems:

- No escrow protection
- No structured contracts
- No verifiable onchain work history
- No portable reputation
- No clear path to micro-credit

Agent Guild turns freelancer identity, contract flow, and reputation into a transparent onchain experience.

## Solution

Agent Guild provides:

- Onchain freelancer profile creation
- Talent discovery registry
- AI contract generation with milestone splits
- Escrow simulation flow for milestone-based payments
- Reputation scoring
- Simulated credit unlock based on completed work

## Why Celo

Celo is ideal for this use case because it is:

- Mobile-first
- Stablecoin-friendly
- Built for real-world payments
- Designed for global and emerging market users

## Features

### 1. Wallet and Identity
Users can connect a wallet and create an onchain freelancer profile with:

- Name
- Description
- Skill
- Hourly rate
- Location
- Availability

### 2. Talent Registry
All freelancer profiles are fetched from the contract and displayed in a searchable registry.

### 3. AI Contract Generator
Users can enter:

- Client name
- Project description
- Budget

The app generates:

- Contract summary
- Milestone payment split
- Structured delivery flow

### 4. Escrow Simulation
The MVP includes a milestone-based escrow simulation:

- Create escrow project
- Deposit funds
- Mark milestone complete
- Approve and release payment

### 5. Reputation Engine
Profiles display visible workforce metrics:

- Completed contracts
- Guild score
- Total earned
- Credit eligibility

### 6. Profile Pages
Each agent profile has a dedicated page with full details and work metrics.

## Tech Stack

### Frontend
- Next.js
- TypeScript
- thirdweb SDK

### Blockchain
- Solidity
- Hardhat v3
- Celo Sepolia Testnet

### Wallet / Web3
- thirdweb ConnectButton
- Celo Sepolia RPC

## Smart Contract

### Contract
`AgentRegistry.sol`

### Deployed Network
Celo Sepolia

### Chain ID
`11142220`

### Contract Address
`0x6401f4ecce2be9550f7991a080e847f9df06b0f0`

## Project Structure

```bash
agent-guild/
├── contracts/
│   └── AgentRegistry.sol
├── scripts/
│   └── deploy-viem.ts
├── web/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── agent/[id]/page.tsx
│   │   ├── components/
│   │   │   └── EscrowSimulator.tsx
│   │   └── lib/
│   │       ├── client.ts
│   │       ├── contract.ts
│   │       └── reputation.ts